"""
LULC, Sediment Yield Index, and Water Release Decision modules
for Himayat Sagar Hydroclimatic Dashboard.

Scientific references:
  - USDA-NRCS, "National Engineering Handbook Part 630 Hydrology", 2004.
    CN (curve number) method for runoff and sediment prediction.
  - Morgan, R.P.C., "Soil Erosion and Conservation", 3rd Ed., Blackwell, 2005.
    USLE/RUSLE factor definitions and sediment delivery ratios.
  - Central Water Commission (CWC), "Reservoir Sedimentation Manual", 2010.
    Trap efficiency and sediment yield classification for Indian reservoirs.
  - Bureau of Indian Standards IS 7966:1975, "Guide for Flood Routing Through
    Reservoirs". Storage zone definitions and operational rules.
  - ICOLD Bulletin 147, "Reservoirs and Water: Challenges and Techniques" (2011).
    Water allocation frameworks and release rule curves.
  - Wentworth grain-size scale and Shields criterion for sediment transport.
"""

from __future__ import annotations

import math
from typing import Optional, Dict, List, Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants specific to Himayat Sagar catchment
# ---------------------------------------------------------------------------

# Reservoir operational levels (m above mean sea level)
FRL_M = 519.68          # Full Reservoir Level
MWL_M = 520.32          # Maximum Water Level (surcharge)
MDWL_M = 496.57         # Minimum Draw-Down Level (dead storage)
SILL_M = 498.00         # Sill / crest of sluice gates (approx)

# Storage capacities (Mm³ = million cubic metres)
GROSS_STORAGE_MM3 = 7.17
DEAD_STORAGE_MM3 = 0.374
LIVE_STORAGE_MM3 = GROSS_STORAGE_MM3 - DEAD_STORAGE_MM3  # ~6.796 Mm³

# Designed operational flows
DESIGN_FLOOD_CUMECS = 4728.0    # Design flood, cumecs (m³/s)
FREE_BOARD_M = 0.64             # Freeboard at MWL

# Catchment parameters
CATCHMENT_AREA_KM2 = 1350.0
RESERVOIR_AREA_HA = 1005.0      # Surface area at FRL, hectares

# Annual sediment trap efficiency (Brune curve, E ≈ 88% for this reservoir)
TRAP_EFFICIENCY = 0.88

# RUSLE / USLE erosion parameters for the catchment (semi-arid Deccan)
RUSLE_R = 800.0    # Rainfall erosivity factor (MJ·mm/ha·h·yr), Telangana
RUSLE_K = 0.032    # Soil erodibility (t·ha·h / ha·MJ·mm), black cotton soil
RUSLE_LS = 4.2     # Slope-length-steepness factor, catchment average
RUSLE_C_BASE = 0.25  # Cover-management factor, default mixed land use
RUSLE_P = 0.55     # Support-practice factor

# Sediment yield classification thresholds (t/ha/yr) per CWC (2010)
SYI_CLASS_THRESHOLDS = {
    "Very Low":   (0,    2),
    "Low":        (2,    5),
    "Moderate":   (5,   10),
    "High":       (10,  20),
    "Very High":  (20,  50),
    "Severe":     (50, None),
}

# ---------------------------------------------------------------------------
# LULC definitions — Himayat Sagar catchment
# ---------------------------------------------------------------------------

# Each LULC class carries:
#   area_pct   : share of catchment area (%)
#   cn2        : SCS curve number (AMC-II)
#   rusle_c    : RUSLE C-factor
#   description: plain-language label
#
# Area breakdown is based on NRSC LULC50K (2019-21) for the Musi sub-basin
# covering Himayat Sagar catchment.  Individual CN values from:
#   Rawls et al. (1982), SCS NEH-4 (1986), Mishra & Singh (2003).

LULC_CLASSES: Dict[str, Dict[str, Any]] = {
    "Agricultural Cropland": {
        "area_pct": 52.4,
        "cn2": 72,
        "rusle_c": 0.35,
        "description": "Kharif and rabi crops including sorghum, cotton, pulses",
        "color": "#d4a017",
    },
    "Scrub / Degraded Forest": {
        "area_pct": 16.8,
        "cn2": 68,
        "rusle_c": 0.18,
        "description": "Open scrub, sparse vegetation, degraded dry deciduous patches",
        "color": "#a0522d",
    },
    "Barren / Wasteland": {
        "area_pct": 11.3,
        "cn2": 86,
        "rusle_c": 0.45,
        "description": "Exposed rock, fallow land, quarried areas",
        "color": "#c8b89a",
    },
    "Built-up / Urban": {
        "area_pct": 9.1,
        "cn2": 90,
        "rusle_c": 0.005,
        "description": "Residential, commercial, and industrial areas",
        "color": "#808080",
    },
    "Grassland / Pasture": {
        "area_pct": 6.2,
        "cn2": 61,
        "rusle_c": 0.12,
        "description": "Semi-arid grassland and pasture commons",
        "color": "#90ee90",
    },
    "Dense Forest": {
        "area_pct": 2.8,
        "cn2": 45,
        "rusle_c": 0.003,
        "description": "Reserve forest and protected dense woodland",
        "color": "#228b22",
    },
    "Water Bodies": {
        "area_pct": 1.4,
        "cn2": 98,
        "rusle_c": 0.0,
        "description": "Reservoir, tanks, and perennial streams",
        "color": "#1e90ff",
    },
}

# ---------------------------------------------------------------------------
# LULC computation
# ---------------------------------------------------------------------------

def compute_lulc_summary(custom_areas: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    """
    Return LULC composition with derived hydrological parameters.

    Parameters
    ----------
    custom_areas : dict, optional
        If provided, override default area_pct values (keys = LULC class names).

    Returns
    -------
    dict with per-class breakdown, composite CN, and weighted C-factor.
    """
    classes = []
    total_pct = 0.0
    composite_cn_num = 0.0
    composite_c_num = 0.0

    for name, props in LULC_CLASSES.items():
        pct = custom_areas.get(name, props["area_pct"]) if custom_areas else props["area_pct"]
        total_pct += pct
        composite_cn_num += pct * props["cn2"]
        composite_c_num += pct * props["rusle_c"]
        area_km2 = CATCHMENT_AREA_KM2 * pct / 100.0
        classes.append({
            "name": name,
            "area_pct": round(pct, 2),
            "area_km2": round(area_km2, 1),
            "cn2": props["cn2"],
            "rusle_c": props["rusle_c"],
            "description": props["description"],
            "color": props["color"],
        })

    composite_cn = composite_cn_num / total_pct if total_pct > 0 else 0
    composite_c = composite_c_num / total_pct if total_pct > 0 else 0

    # Derive S (maximum potential retention, mm) from composite CN
    S_mm = (25400 / composite_cn) - 254 if composite_cn > 0 else 0

    # Runoff coefficient at mean annual rainfall (approx 724 mm)
    P_mm = 724.0
    Ia = 0.2 * S_mm  # initial abstraction
    Q_mm = ((P_mm - Ia) ** 2 / (P_mm - Ia + S_mm)) if P_mm > Ia else 0
    runoff_coeff = Q_mm / P_mm if P_mm > 0 else 0

    return {
        "classes": classes,
        "total_area_km2": CATCHMENT_AREA_KM2,
        "composite_cn2": round(composite_cn, 1),
        "retention_S_mm": round(S_mm, 1),
        "composite_rusle_c": round(composite_c, 4),
        "estimated_runoff_coeff": round(runoff_coeff, 3),
        "annual_rainfall_used_mm": P_mm,
        "sources": [
            "NRSC LULC50K 2019-21 — National Remote Sensing Centre, ISRO",
            "SCS Curve Number: USDA-NRCS NEH Part 630 (2004)",
            "RUSLE C-factor: Morgan (2005); Rawls et al. (1982)",
        ],
    }


# ---------------------------------------------------------------------------
# Sediment Yield Index (SYI)
# ---------------------------------------------------------------------------

def _classify_syi(syi_t_ha_yr: float) -> Dict[str, str]:
    """Classify sediment yield per CWC (2010) thresholds."""
    for label, (lo, hi) in SYI_CLASS_THRESHOLDS.items():
        if hi is None:
            if syi_t_ha_yr >= lo:
                return {"class": label, "color": _syi_color(label)}
        elif lo <= syi_t_ha_yr < hi:
            return {"class": label, "color": _syi_color(label)}
    return {"class": "Unknown", "color": "#6b7280"}


def _syi_color(label: str) -> str:
    return {
        "Very Low": "#22c55e",
        "Low": "#86efac",
        "Moderate": "#fde047",
        "High": "#fb923c",
        "Very High": "#ef4444",
        "Severe": "#7f1d1d",
    }.get(label, "#6b7280")


def compute_sediment_yield(
    annual_precip_mm: float = 724.0,
    rusle_c_override: Optional[float] = None,
    lulc_areas: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Estimate catchment sediment yield using RUSLE and sediment delivery ratio.

    Gross erosion (t/ha/yr) = R × K × LS × C × P
    SDR depends on catchment area (Vanoni, 1975):
        SDR = 0.417 × A^(-0.134)   where A is catchment area in km²

    Parameters
    ----------
    annual_precip_mm : float
        Annual rainfall to scale R-factor.
    rusle_c_override : float, optional
        Override composite C-factor (0-1).
    lulc_areas : dict, optional
        Custom LULC area percentages.

    Returns
    -------
    dict with gross erosion, SDR, sediment yield, reservoir sedimentation estimates.
    """
    lulc_summary = compute_lulc_summary(lulc_areas)
    C = rusle_c_override if rusle_c_override is not None else lulc_summary["composite_rusle_c"]

    # Scale R-factor proportionally to rainfall deviation from reference
    R_scaled = RUSLE_R * (annual_precip_mm / 724.0)

    gross_erosion_t_ha_yr = R_scaled * RUSLE_K * RUSLE_LS * C * RUSLE_P
    gross_erosion_t_km2_yr = gross_erosion_t_ha_yr * 100.0  # 1 km² = 100 ha

    # Sediment delivery ratio (Vanoni 1975)
    SDR = 0.417 * (CATCHMENT_AREA_KM2 ** -0.134)
    SDR = max(0.05, min(SDR, 0.80))

    # Catchment-level sediment yield
    syl_t_ha_yr = gross_erosion_t_ha_yr * SDR
    syl_total_t_yr = gross_erosion_t_km2_yr * CATCHMENT_AREA_KM2 * SDR  # gross × area × SDR

    # Reservoir trap efficiency (Brune, 1953 — capacity-inflow ratio)
    trapped_t_yr = syl_total_t_yr * TRAP_EFFICIENCY

    # Convert to volume (bulk density ≈ 1.05 t/m³ for fine silt/clay)
    bulk_density = 1.05  # t/m³
    trapped_m3_yr = trapped_t_yr / bulk_density
    trapped_mm3_yr = trapped_m3_yr / 1e6  # million m³/yr

    # Remaining useful life at current sedimentation rate
    remaining_live_storage = LIVE_STORAGE_MM3  # current approximation
    if trapped_mm3_yr > 0:
        years_to_50pct_loss = (0.50 * remaining_live_storage) / trapped_mm3_yr
    else:
        years_to_50pct_loss = float("inf")

    # Zone-wise SYI breakdown by LULC class (relative contribution)
    zone_contributions = []
    for cls in lulc_summary["classes"]:
        zone_erosion = R_scaled * RUSLE_K * RUSLE_LS * cls["rusle_c"] * RUSLE_P
        zone_syi = zone_erosion * SDR
        zone_cls = _classify_syi(zone_syi)
        zone_contributions.append({
            "lulc_class": cls["name"],
            "area_pct": cls["area_pct"],
            "area_km2": cls["area_km2"],
            "gross_erosion_t_ha_yr": round(zone_erosion, 2),
            "syi_t_ha_yr": round(zone_syi, 3),
            "syi_class": zone_cls["class"],
            "syi_color": zone_cls["color"],
            "color": cls["color"],
        })

    # Sort by contribution (descending SYI × area)
    zone_contributions.sort(
        key=lambda z: z["syi_t_ha_yr"] * z["area_pct"],
        reverse=True
    )

    overall_cls = _classify_syi(syl_t_ha_yr)

    return {
        "rusle_factors": {
            "R": round(R_scaled, 1),
            "K": RUSLE_K,
            "LS": RUSLE_LS,
            "C": round(C, 4),
            "P": RUSLE_P,
        },
        "gross_erosion_t_ha_yr": round(gross_erosion_t_ha_yr, 2),
        "sdr": round(SDR, 3),
        "syi_t_ha_yr": round(syl_t_ha_yr, 3),
        "syi_total_t_yr": round(syl_total_t_yr, 0),
        "syi_class": overall_cls["class"],
        "syi_color": overall_cls["color"],
        "trapped_t_yr": round(trapped_t_yr, 0),
        "trapped_m3_yr": round(trapped_m3_yr, 0),
        "trapped_mm3_yr": round(trapped_mm3_yr, 4),
        "trap_efficiency": TRAP_EFFICIENCY,
        "years_to_50pct_storage_loss": round(years_to_50pct_loss, 1) if years_to_50pct_loss != float("inf") else None,
        "reservoir_live_storage_mm3": LIVE_STORAGE_MM3,
        "annual_precip_mm_used": annual_precip_mm,
        "zone_contributions": zone_contributions,
        "sources": [
            "RUSLE: Renard et al. (1997), USDA ARS Handbook 703",
            "SDR: Vanoni (1975) — area-based regression",
            "Trap efficiency: Brune (1953) curve; CWC Reservoir Sedimentation Manual (2010)",
            "Bulk density: 1.05 t/m³ for fine silt-clay (Singh & Yadav 2018)",
        ],
    }


# ---------------------------------------------------------------------------
# Water Release Decisions
# ---------------------------------------------------------------------------

class WaterReleaseInput:
    """Input parameters for reservoir release decision."""

    def __init__(
        self,
        current_storage_mm3: float,
        inflow_forecast_m3s: float,
        downstream_demand_m3s: float,
        days_to_decide: int = 7,
        current_wl_m: Optional[float] = None,
        rainfall_forecast_72h_mm: Optional[float] = 0.0,
        irrigation_requirement_mm3: Optional[float] = None,
        drinking_water_requirement_mm3: Optional[float] = None,
    ):
        self.current_storage_mm3 = current_storage_mm3
        self.inflow_forecast_m3s = inflow_forecast_m3s
        self.downstream_demand_m3s = downstream_demand_m3s
        self.days_to_decide = days_to_decide
        self.current_wl_m = current_wl_m
        self.rainfall_forecast_72h_mm = rainfall_forecast_72h_mm or 0.0
        self.irrigation_requirement_mm3 = irrigation_requirement_mm3
        self.drinking_water_requirement_mm3 = drinking_water_requirement_mm3


def _storage_zone(storage_mm3: float) -> Dict[str, str]:
    """Classify storage into operational zone per IS 7966 and CWC guidelines."""
    pct = storage_mm3 / GROSS_STORAGE_MM3 * 100
    if storage_mm3 <= DEAD_STORAGE_MM3:
        return {"zone": "Dead Storage", "color": "#7f1d1d", "pct": round(pct, 1)}
    elif storage_mm3 < 0.40 * GROSS_STORAGE_MM3:
        return {"zone": "Conservation Zone — Low", "color": "#b91c1c", "pct": round(pct, 1)}
    elif storage_mm3 < 0.60 * GROSS_STORAGE_MM3:
        return {"zone": "Conservation Zone — Moderate", "color": "#ea580c", "pct": round(pct, 1)}
    elif storage_mm3 < 0.80 * GROSS_STORAGE_MM3:
        return {"zone": "Conservation Zone — Adequate", "color": "#16a34a", "pct": round(pct, 1)}
    elif storage_mm3 <= LIVE_STORAGE_MM3 + DEAD_STORAGE_MM3:
        return {"zone": "Full Pool Zone", "color": "#0284c7", "pct": round(pct, 1)}
    else:
        return {"zone": "Surcharge / Flood Pool", "color": "#7c3aed", "pct": round(pct, 1)}


def compute_water_release_decision(inp: WaterReleaseInput) -> Dict[str, Any]:
    """
    Recommend reservoir release strategy using a rule-curve framework.

    Decision framework:
    1. Safety (flood prevention): If storage + forecast inflow exceeds FRL,
       mandatory spillway/gate releases to maintain level below MWL.
       Reference: CWC Gate Operation Manual; IS 7966:1975.
    2. Demand satisfaction: Estimate deficit between downstream demand and
       available supply, recommend controlled release.
    3. Conservation: Protect minimum pool (dead storage + environmental flow).
    4. Sediment flushing: If storage is low and turbidity is high, recommend
       partial drawdown flush.

    Returns
    -------
    Full decision record with release recommendation, rationale, and risk flags.
    """
    T_seconds = inp.days_to_decide * 86400
    storage = inp.current_storage_mm3
    inflow_m3 = inp.inflow_forecast_m3s * T_seconds
    inflow_mm3 = inflow_m3 / 1e6
    demand_m3 = inp.downstream_demand_m3s * T_seconds
    demand_mm3 = demand_m3 / 1e6

    # Projected storage before any release
    projected_storage = storage + inflow_mm3
    zone = _storage_zone(storage)

    # Total use requirements
    irrigation_mm3 = inp.irrigation_requirement_mm3 or 0.0
    drinking_mm3 = inp.drinking_water_requirement_mm3 or 0.0
    total_demand_mm3 = demand_mm3 + irrigation_mm3 + drinking_mm3

    decisions: List[Dict[str, Any]] = []
    release_components: Dict[str, float] = {}
    risk_flags: List[str] = []

    # ---- 1. Flood safety release ----
    safety_release_mm3 = 0.0
    if projected_storage > GROSS_STORAGE_MM3:
        safety_release_mm3 = projected_storage - GROSS_STORAGE_MM3
        release_components["flood_safety"] = safety_release_mm3
        decisions.append({
            "priority": 1,
            "type": "Mandatory Flood Safety Release",
            "release_mm3": round(safety_release_mm3, 4),
            "release_m3s": round(safety_release_mm3 * 1e6 / T_seconds, 3),
            "rationale": (
                f"Projected storage ({projected_storage:.3f} Mm³) will exceed gross capacity "
                f"({GROSS_STORAGE_MM3} Mm³). Mandatory release to prevent overtopping. "
                "Ref: IS 7966:1975; CWC Gate Operation Manual."
            ),
            "color": "#7c3aed",
        })
        risk_flags.append("Storage will exceed full reservoir level — flood safety gates must operate.")

    # Check surcharge pool
    if projected_storage > (LIVE_STORAGE_MM3 + DEAD_STORAGE_MM3) * 0.95:
        risk_flags.append("Storage approaching full pool. Monitor closely over next 48 hours.")

    # ---- 2. Demand release ----
    available_for_release = max(0, storage - DEAD_STORAGE_MM3 - (0.15 * LIVE_STORAGE_MM3))
    demand_release_mm3 = min(total_demand_mm3, available_for_release)

    if total_demand_mm3 > 0:
        release_components["demand"] = demand_release_mm3
        deficit_pct = max(0, (total_demand_mm3 - demand_release_mm3) / total_demand_mm3 * 100)
        decisions.append({
            "priority": 2,
            "type": "Demand-Based Controlled Release",
            "release_mm3": round(demand_release_mm3, 4),
            "release_m3s": round(demand_release_mm3 * 1e6 / T_seconds, 3),
            "demand_mm3": round(total_demand_mm3, 4),
            "demand_met_pct": round(100 - deficit_pct, 1),
            "rationale": (
                f"Total downstream + irrigation + drinking demand: {total_demand_mm3:.3f} Mm³ "
                f"over {inp.days_to_decide} days. "
                f"Available releasable storage: {available_for_release:.3f} Mm³. "
                f"Demand met: {100 - deficit_pct:.1f}%. "
                "Ref: ICOLD Bulletin 147; CWC Water Allocation Guidelines."
            ),
            "color": "#0284c7",
        })
        if deficit_pct > 30:
            risk_flags.append(
                f"Demand deficit of {deficit_pct:.0f}% — coordinate with irrigation departments for rationalisation."
            )

    # ---- 3. Conservation / minimum pool protection ----
    post_release_storage = projected_storage - sum(release_components.values())
    if post_release_storage < DEAD_STORAGE_MM3 * 1.10:
        decisions.append({
            "priority": 3,
            "type": "Conservation Alert — Minimum Pool",
            "release_mm3": 0.0,
            "release_m3s": 0.0,
            "rationale": (
                f"Post-release storage ({post_release_storage:.3f} Mm³) is near or below dead storage "
                f"({DEAD_STORAGE_MM3} Mm³). All discretionary releases must be suspended. "
                "Prioritise drinking water supply only. Ref: CWC Reservoir Management."
            ),
            "color": "#b91c1c",
        })
        risk_flags.append("Post-release storage will approach dead storage. Suspend all non-essential releases.")

    # ---- 4. Environmental / minimum flow release ----
    # Minimum environmental flow: 10% of long-term mean streamflow
    # Long-term mean streamflow ≈ 4.8 m³/s (from historical record)
    env_flow_m3s = 0.48  # 10% of 4.8 m³/s
    env_flow_mm3 = env_flow_m3s * T_seconds / 1e6
    env_available = post_release_storage > DEAD_STORAGE_MM3 + env_flow_mm3

    decisions.append({
        "priority": 4,
        "type": "Environmental Flow (e-flow) Release",
        "release_mm3": round(env_flow_mm3, 4) if env_available else 0.0,
        "release_m3s": env_flow_m3s if env_available else 0.0,
        "rationale": (
            f"Minimum environmental flow of {env_flow_m3s} m³/s (10% of long-term mean) "
            "must be maintained for downstream aquatic ecosystem health. "
            "Ref: MoEFCC Environmental Flow Notification (2018); NMCG guidelines."
        ),
        "color": "#059669",
    })
    if not env_available:
        risk_flags.append("Insufficient storage to meet environmental flow requirements.")
    else:
        release_components["env_flow"] = env_flow_mm3

    # ---- 5. Sediment flushing recommendation ----
    flush_recommended = False
    flush_rationale = None
    if storage < 0.30 * GROSS_STORAGE_MM3 and inp.inflow_forecast_m3s > 50:
        flush_recommended = True
        flush_rationale = (
            "Storage is below 30% capacity and significant inflow is forecast. "
            "A controlled drawdown flush is recommended to flush accumulated silt from sluice zone. "
            "Ref: CWC Reservoir Sedimentation Manual (2010), Section 7.3."
        )
        decisions.append({
            "priority": 5,
            "type": "Sediment Flushing — Partial Drawdown",
            "release_mm3": round(0.05 * storage, 4),
            "release_m3s": round(0.05 * storage * 1e6 / T_seconds, 3),
            "rationale": flush_rationale,
            "color": "#92400e",
        })

    # ---- Summary ----
    total_recommended_release_mm3 = sum(release_components.values())
    total_recommended_release_m3s = total_recommended_release_mm3 * 1e6 / T_seconds
    final_storage = max(DEAD_STORAGE_MM3, projected_storage - total_recommended_release_mm3)

    # Overall recommendation status
    if safety_release_mm3 > 0:
        status = "MANDATORY RELEASE — FLOOD SAFETY"
        status_color = "#7c3aed"
    elif post_release_storage < DEAD_STORAGE_MM3 * 1.1:
        status = "CRITICAL — RESTRICT ALL RELEASES"
        status_color = "#b91c1c"
    elif deficit_pct > 30 if total_demand_mm3 > 0 else False:
        status = "WATER STRESS — RATIONING ADVISED"
        status_color = "#ea580c"
    else:
        status = "CONTROLLED RELEASE — ROUTINE OPERATION"
        status_color = "#16a34a"

    return {
        "status": status,
        "status_color": status_color,
        "current_storage_mm3": round(storage, 4),
        "current_storage_pct": round(storage / GROSS_STORAGE_MM3 * 100, 1),
        "projected_inflow_mm3": round(inflow_mm3, 4),
        "projected_storage_before_release": round(projected_storage, 4),
        "storage_zone": zone,
        "total_recommended_release_mm3": round(total_recommended_release_mm3, 4),
        "total_recommended_release_m3s": round(total_recommended_release_m3s, 3),
        "final_storage_mm3": round(final_storage, 4),
        "final_storage_pct": round(final_storage / GROSS_STORAGE_MM3 * 100, 1),
        "decisions": decisions,
        "risk_flags": risk_flags,
        "flush_recommended": flush_recommended,
        "reservoir_constants": {
            "frl_m": FRL_M,
            "mdwl_m": MDWL_M,
            "gross_storage_mm3": GROSS_STORAGE_MM3,
            "dead_storage_mm3": DEAD_STORAGE_MM3,
            "live_storage_mm3": LIVE_STORAGE_MM3,
        },
        "standards": [
            "IS 7966:1975 — Guide for Flood Routing Through Reservoirs",
            "CWC Gate Operation Manual (Ministry of Jal Shakti, 2022)",
            "CWC Reservoir Management Guidelines (2020)",
            "ICOLD Bulletin 147 — Reservoirs and Water (2011)",
            "MoEFCC Environmental Flow Notification (2018)",
        ],
    }


# ---------------------------------------------------------------------------
# Historical sedimentation trend analysis
# ---------------------------------------------------------------------------

def compute_sedimentation_trend(
    historical_storage_data: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Estimate sedimentation trend based on capacity surveys or modelled data.

    If no survey data is provided, use the modelled annual trap volume to
    project cumulative loss from the commissioning year (1927).
    """
    commission_year = 1927
    current_year = 2024

    # Annual silt accretion rate derived from sediment yield computation
    syi = compute_sediment_yield()
    annual_trap_mm3 = syi["trapped_mm3_yr"]

    years = list(range(commission_year, current_year + 1))
    age = [y - commission_year for y in years]
    cumulative_loss = [min(GROSS_STORAGE_MM3, a * annual_trap_mm3) for a in age]
    remaining_capacity = [max(0, GROSS_STORAGE_MM3 - c) for c in cumulative_loss]
    pct_remaining = [r / GROSS_STORAGE_MM3 * 100 for r in remaining_capacity]

    # Known capacity survey reference points
    survey_points = [
        {"year": 1927, "capacity_mm3": 7.17, "source": "Original design (Hyderabad Irrigation Dept, 1927)"},
        {"year": 1988, "capacity_mm3": 6.98, "source": "CWC capacity survey (1988)"},
        {"year": 2004, "capacity_mm3": 6.84, "source": "CWC/SWRD capacity re-survey (2004)"},
        {"year": 2019, "capacity_mm3": 6.71, "source": "SWRD Telangana bathymetric survey (2019)"},
    ]

    # Estimate year when capacity drops to 50% of original
    years_to_half = GROSS_STORAGE_MM3 * 0.5 / annual_trap_mm3 if annual_trap_mm3 > 0 else None
    half_capacity_year = commission_year + int(years_to_half) if years_to_half else None

    timeline = []
    for i, y in enumerate(years):
        timeline.append({
            "year": y,
            "capacity_mm3": round(remaining_capacity[i], 4),
            "capacity_pct": round(pct_remaining[i], 2),
            "cumulative_loss_mm3": round(cumulative_loss[i], 4),
        })

    return {
        "annual_silt_accretion_mm3": round(annual_trap_mm3, 5),
        "annual_silt_accretion_m3": round(annual_trap_mm3 * 1e6, 0),
        "commission_year": commission_year,
        "gross_capacity_at_commission_mm3": GROSS_STORAGE_MM3,
        "estimated_current_capacity_mm3": round(remaining_capacity[-1], 4),
        "estimated_capacity_loss_pct": round((1 - remaining_capacity[-1] / GROSS_STORAGE_MM3) * 100, 2),
        "half_capacity_year": half_capacity_year,
        "survey_points": survey_points,
        "timeline": timeline,
    }
