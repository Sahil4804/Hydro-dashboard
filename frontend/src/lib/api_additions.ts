// ============================================================
// ADDITIONS — append to frontend/src/lib/api.ts
// ============================================================

// LULC & Sediment Yield
export const getLulcComposition = (areas?: Record<string, number>) =>
  fetch(`${API_BASE}/api/lulc/composition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areas: areas ?? null }),
  }).then((r) => r.json());

export const getSedimentYield = (
  annual_precip_mm = 724,
  rusle_c_override?: number,
  lulc_areas?: Record<string, number>
) =>
  fetch(`${API_BASE}/api/lulc/sediment-yield`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ annual_precip_mm, rusle_c_override, lulc_areas }),
  }).then((r) => r.json());

export const getSedimentationTrend = () =>
  fetch(`${API_BASE}/api/lulc/sedimentation-trend`).then((r) => r.json());

// Water Release Decisions
export const postWaterReleaseDecision = (body: WaterReleaseRequestBody) =>
  fetch(`${API_BASE}/api/water-release/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

// ---- Type additions ----

export interface LulcClass {
  name: string;
  area_pct: number;
  area_km2: number;
  cn2: number;
  rusle_c: number;
  description: string;
  color: string;
}

export interface LulcCompositionData {
  classes: LulcClass[];
  total_area_km2: number;
  composite_cn2: number;
  retention_S_mm: number;
  composite_rusle_c: number;
  estimated_runoff_coeff: number;
  annual_rainfall_used_mm: number;
  sources: string[];
}

export interface SedimentZoneContrib {
  lulc_class: string;
  area_pct: number;
  area_km2: number;
  gross_erosion_t_ha_yr: number;
  syi_t_ha_yr: number;
  syi_class: string;
  syi_color: string;
  color: string;
}

export interface SedimentYieldData {
  rusle_factors: { R: number; K: number; LS: number; C: number; P: number };
  gross_erosion_t_ha_yr: number;
  sdr: number;
  syi_t_ha_yr: number;
  syi_total_t_yr: number;
  syi_class: string;
  syi_color: string;
  trapped_t_yr: number;
  trapped_m3_yr: number;
  trapped_mm3_yr: number;
  trap_efficiency: number;
  years_to_50pct_storage_loss: number | null;
  reservoir_live_storage_mm3: number;
  annual_precip_mm_used: number;
  zone_contributions: SedimentZoneContrib[];
  sources: string[];
}

export interface WaterReleaseRequestBody {
  current_storage_mm3: number;
  inflow_forecast_m3s: number;
  downstream_demand_m3s: number;
  days_to_decide?: number;
  current_wl_m?: number | null;
  rainfall_forecast_72h_mm?: number;
  irrigation_requirement_mm3?: number;
  drinking_water_requirement_mm3?: number;
}
