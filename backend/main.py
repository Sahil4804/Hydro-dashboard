"""
FastAPI backend for Himayat Sagar Hydroclimatic Dashboard.
Serves processed data via REST endpoints.
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import (
    DATA_DIR, MODELS_DIR, LAT, LON, CATCHMENT_AREA_KM2,
    CLIMATE_MODEL, HIST_START_YEAR, HIST_END_YEAR,
    FUTURE_START_YEAR, FUTURE_END_YEAR, RUNOFF_COEFF_MAP, SEASONS,
)
from utils import get_season

app = FastAPI(title="Himayat Sagar Hydroclimatic Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pipeline state
pipeline_state = {"running": False, "status": "idle", "last_refreshed": None, "messages": []}


def data_ready() -> bool:
    return (DATA_DIR / "historical_monthly_precip.csv").exists()


def read_csv(name: str) -> pd.DataFrame:
    path = DATA_DIR / name
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Data not ready. Run pipeline first.")
    return pd.read_csv(path, parse_dates=["date"] if "date" in pd.read_csv(path, nrows=0).columns else [])


def df_to_json(df: pd.DataFrame):
    """Convert DataFrame to JSON-serializable list of dicts."""
    result = df.copy()
    for col in result.columns:
        if pd.api.types.is_datetime64_any_dtype(result[col]):
            result[col] = result[col].dt.strftime("%Y-%m-%d")
    return result.replace({np.nan: None}).to_dict(orient="records")


# ======================== PIPELINE ========================

@app.get("/api/pipeline/status")
def pipeline_status():
    return {
        "ready": data_ready(),
        "running": pipeline_state["running"],
        "status": pipeline_state["status"],
        "last_refreshed": pipeline_state["last_refreshed"],
        "messages": pipeline_state["messages"][-10:],
    }


@app.post("/api/pipeline/run")
async def pipeline_run():
    if pipeline_state["running"]:
        return {"message": "Pipeline already running"}

    pipeline_state["running"] = True
    pipeline_state["status"] = "starting"
    pipeline_state["messages"] = []

    def progress(msg):
        pipeline_state["messages"].append(msg)
        pipeline_state["status"] = msg

    try:
        from data_pipeline import run_pipeline
        from models_training import train_all

        loop = asyncio.get_event_loop()
        datasets = await loop.run_in_executor(None, lambda: run_pipeline(progress))
        await loop.run_in_executor(None, lambda: train_all(datasets, progress))

        pipeline_state["last_refreshed"] = datetime.now().isoformat()
        pipeline_state["status"] = "complete"
    except Exception as e:
        pipeline_state["status"] = f"error: {str(e)}"
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pipeline_state["running"] = False

    return {"message": "Pipeline complete", "last_refreshed": pipeline_state["last_refreshed"]}


# ======================== OVERVIEW ========================

@app.get("/api/overview/kpis")
def overview_kpis():
    if not data_ready():
        raise HTTPException(status_code=503, detail="Data not ready")

    hp = read_csv("historical_monthly_precip.csv")
    hs = read_csv("historical_monthly_streamflow.csv")
    fp = read_csv("future_monthly_precip.csv")
    fs = read_csv("future_monthly_streamflow.csv")
    tm_p = read_csv("test_metrics_precip.csv")
    tm_s = read_csv("test_metrics_streamflow.csv")

    hist_annual_precip = hp.groupby("year")["rain_mm"].sum().mean()
    hist_annual_stream = hs.groupby("year")["streamflow_m3s"].mean().mean()

    fut_annual_precip = fp.groupby("year")["predicted_rain_mm"].sum().mean() if "predicted_rain_mm" in fp.columns else None
    fut_annual_stream = fs.groupby("year")["predicted_streamflow_m3s"].mean().mean() if "predicted_streamflow_m3s" in fs.columns else None

    precip_change = ((fut_annual_precip - hist_annual_precip) / hist_annual_precip * 100) if fut_annual_precip else None
    stream_change = ((fut_annual_stream - hist_annual_stream) / hist_annual_stream * 100) if fut_annual_stream else None

    # Best models
    best_precip = tm_p[tm_p["model"] != "Baseline"].sort_values("r2", ascending=False).iloc[0]
    best_stream = tm_s[tm_s["model"] != "Baseline"].sort_values("r2", ascending=False).iloc[0]

    return {
        "location": {"lat": LAT, "lon": LON, "catchment_area_km2": CATCHMENT_AREA_KM2},
        "climate_model": CLIMATE_MODEL,
        "hist_years": f"{HIST_START_YEAR}-{HIST_END_YEAR}",
        "future_years": f"{FUTURE_START_YEAR}-{FUTURE_END_YEAR}",
        "mean_annual_precip_mm": round(hist_annual_precip, 1),
        "mean_annual_streamflow_m3s": round(hist_annual_stream, 2),
        "best_precip_model": best_precip["model"],
        "best_precip_r2": round(best_precip["r2"], 4),
        "best_streamflow_model": best_stream["model"],
        "best_streamflow_r2": round(best_stream["r2"], 4),
        "projected_precip_change_pct": round(precip_change, 1) if precip_change else None,
        "projected_streamflow_change_pct": round(stream_change, 1) if stream_change else None,
    }


@app.get("/api/overview/timeline")
def overview_timeline():
    hp = read_csv("historical_monthly_precip.csv")
    hs = read_csv("historical_monthly_streamflow.csv")
    fp = read_csv("future_monthly_precip.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    precip_hist = hp[["date", "rain_mm"]].rename(columns={"rain_mm": "value"})
    precip_hist["type"] = "historical"

    if "predicted_rain_mm" in fp.columns:
        precip_fut = fp[["date", "predicted_rain_mm"]].rename(columns={"predicted_rain_mm": "value"})
        precip_fut["type"] = "projected"
        precip_all = pd.concat([precip_hist, precip_fut], ignore_index=True)
    else:
        precip_all = precip_hist

    stream_hist = hs[["date", "streamflow_m3s"]].rename(columns={"streamflow_m3s": "value"})
    stream_hist["type"] = "historical"

    if "predicted_streamflow_m3s" in fs.columns:
        stream_fut = fs[["date", "predicted_streamflow_m3s"]].rename(columns={"predicted_streamflow_m3s": "value"})
        stream_fut["type"] = "projected"
        stream_all = pd.concat([stream_hist, stream_fut], ignore_index=True)
    else:
        stream_all = stream_hist

    return {
        "precipitation": df_to_json(precip_all),
        "streamflow": df_to_json(stream_all),
    }


# ======================== PRECIPITATION ========================

@app.get("/api/precip/historical/monthly")
def precip_hist_monthly():
    df = read_csv("historical_monthly_precip.csv")
    df["season"] = df["month"].apply(get_season)
    return df_to_json(df)


@app.get("/api/precip/historical/daily")
def precip_hist_daily():
    df = read_csv("historical_daily.csv")
    return df_to_json(df)


@app.get("/api/precip/historical/climatology")
def precip_hist_climatology():
    df = read_csv("historical_monthly_precip.csv")
    clim = df.groupby("month")["rain_mm"].agg(["mean", "std", "median", "min", "max"]).reset_index()
    clim.columns = ["month", "mean", "std", "median", "min", "max"]
    clim["season"] = clim["month"].apply(get_season)
    return df_to_json(clim)


@app.get("/api/precip/historical/annual")
def precip_hist_annual():
    df = read_csv("historical_monthly_precip.csv")
    annual = df.groupby("year")["rain_mm"].sum().reset_index()
    annual.columns = ["year", "total_rain_mm"]

    # 5-year moving average
    annual["moving_avg_5yr"] = annual["total_rain_mm"].rolling(5, center=True).mean()
    annual["long_term_mean"] = annual["total_rain_mm"].mean()

    # Linear trend
    from scipy import stats
    slope, intercept, r_value, p_value, _ = stats.linregress(annual["year"], annual["total_rain_mm"])
    annual["trend_line"] = slope * annual["year"] + intercept

    return {
        "data": df_to_json(annual),
        "trend": {"slope": round(slope, 3), "r2": round(r_value**2, 4), "p_value": round(p_value, 4)},
    }


@app.get("/api/precip/historical/decadal")
def precip_hist_decadal():
    df = read_csv("historical_monthly_precip.csv")
    df["decade"] = (df["year"] // 10) * 10
    annual = df.groupby(["year", "decade"])["rain_mm"].sum().reset_index()
    decadal = annual.groupby("decade")["rain_mm"].agg(
        ["mean", "median", "std", "min", "max", "count"]
    ).reset_index()
    decadal.columns = ["decade", "mean", "median", "std", "min", "max", "num_years"]
    decadal["cv"] = decadal["std"] / decadal["mean"]
    decadal["decade_label"] = decadal["decade"].astype(str) + "s"
    return df_to_json(decadal)


@app.get("/api/precip/historical/extremes")
def precip_hist_extremes():
    df = read_csv("historical_monthly_precip.csv")
    top_wet = df.nlargest(10, "rain_mm")[["date", "year", "month", "rain_mm"]]
    top_dry = df[df["rain_mm"] > 0].nsmallest(10, "rain_mm")[["date", "year", "month", "rain_mm"]]

    # Exceedance probability
    sorted_rain = df["rain_mm"].sort_values(ascending=False).values
    n = len(sorted_rain)
    exceedance = [(i + 1) / (n + 1) * 100 for i in range(n)]

    # Monthly box plot data
    box_data = []
    for m in range(1, 13):
        vals = df[df["month"] == m]["rain_mm"]
        q1, q2, q3 = vals.quantile([0.25, 0.5, 0.75])
        iqr = q3 - q1
        box_data.append({
            "month": m,
            "q1": round(q1, 2), "median": round(q2, 2), "q3": round(q3, 2),
            "min": round(max(vals.min(), q1 - 1.5 * iqr), 2),
            "max": round(min(vals.max(), q3 + 1.5 * iqr), 2),
            "mean": round(vals.mean(), 2),
        })

    return {
        "top_wet": df_to_json(top_wet),
        "top_dry": df_to_json(top_dry),
        "exceedance": {"values": sorted_rain.tolist(), "probability": exceedance},
        "box_data": box_data,
    }


@app.get("/api/precip/historical/anomalies")
def precip_hist_anomalies():
    df = read_csv("historical_monthly_precip.csv")
    clim = df.groupby("month")["rain_mm"].mean().to_dict()
    df["climatology"] = df["month"].map(clim)
    df["anomaly"] = df["rain_mm"] - df["climatology"]

    # Standardized anomaly
    std_map = df.groupby("month")["rain_mm"].std().to_dict()
    df["std"] = df["month"].map(std_map)
    df["standardized_anomaly"] = df["anomaly"] / df["std"]

    monthly = df[["date", "month", "rain_mm", "anomaly", "standardized_anomaly"]].copy()

    # Annual anomaly
    annual = df.groupby("year")["rain_mm"].sum().reset_index()
    long_term = annual["rain_mm"].mean()
    annual["anomaly"] = annual["rain_mm"] - long_term

    return {
        "monthly": df_to_json(monthly),
        "annual": df_to_json(annual),
    }


@app.get("/api/precip/historical/seasonal")
def precip_hist_seasonal():
    df = read_csv("historical_monthly_precip.csv")
    df["season"] = df["month"].apply(get_season)

    seasonal = df.groupby(["year", "season"])["rain_mm"].sum().reset_index()
    annual_total = df.groupby("year")["rain_mm"].sum().reset_index().rename(columns={"rain_mm": "annual_total"})
    seasonal = seasonal.merge(annual_total, on="year")
    seasonal["fraction"] = seasonal["rain_mm"] / seasonal["annual_total"]

    # Monsoon contribution over time
    monsoon = seasonal[seasonal["season"] == "Monsoon"][["year", "fraction"]].copy()
    monsoon.columns = ["year", "monsoon_fraction"]

    return {
        "seasonal": df_to_json(seasonal),
        "monsoon_trend": df_to_json(monsoon),
    }


@app.get("/api/precip/historical/correlation")
def precip_hist_correlation():
    df = read_csv("historical_monthly_precip.csv")
    cols = ["rain_mm", "temp_mean_c", "rh_mean_pct", "cloud_mean_pct", "wind_mean_kmh"]
    corr = df[cols].corr()
    return {
        "columns": cols,
        "values": corr.values.tolist(),
    }


@app.get("/api/precip/historical/climate-vars")
def precip_hist_climate_vars():
    df = read_csv("historical_monthly_precip.csv")
    result = df[["date", "temp_mean_c", "rh_mean_pct", "cloud_mean_pct", "wind_mean_kmh"]].copy()
    return df_to_json(result)


# ---- Precipitation Models ----

@app.get("/api/precip/models/cv-summary")
def precip_cv_summary():
    return df_to_json(read_csv("cv_summary_precip.csv"))


@app.get("/api/precip/models/cv-folds")
def precip_cv_folds():
    return df_to_json(read_csv("cv_folds_precip.csv"))


@app.get("/api/precip/models/test-metrics")
def precip_test_metrics():
    return df_to_json(read_csv("test_metrics_precip.csv"))


@app.get("/api/precip/models/test-predictions")
def precip_test_predictions():
    return df_to_json(read_csv("test_predictions_precip.csv"))


@app.get("/api/precip/models/feature-importance")
def precip_feature_importance():
    return df_to_json(read_csv("feature_importance_precip.csv"))


@app.get("/api/precip/models/residuals")
def precip_residuals():
    return df_to_json(read_csv("residuals_precip.csv"))


# ---- Precipitation Future ----

@app.get("/api/precip/future/monthly")
def precip_future_monthly():
    return df_to_json(read_csv("future_monthly_precip.csv"))


@app.get("/api/precip/future/annual")
def precip_future_annual():
    return df_to_json(read_csv("future_annual_precip.csv"))


@app.get("/api/precip/future/climatology")
def precip_future_climatology():
    df = read_csv("future_monthly_precip.csv")
    if "predicted_rain_mm" not in df.columns:
        raise HTTPException(status_code=503, detail="Future predictions not yet available")
    clim = df.groupby("month")["predicted_rain_mm"].agg(["mean", "std"]).reset_index()
    clim.columns = ["month", "mean", "std"]
    return df_to_json(clim)


@app.get("/api/precip/future/change")
def precip_future_change():
    hp = read_csv("historical_monthly_precip.csv")
    fp = read_csv("future_monthly_precip.csv")

    if "predicted_rain_mm" not in fp.columns:
        raise HTTPException(status_code=503, detail="Future predictions not available")

    hist_clim = hp.groupby("month")["rain_mm"].mean()
    fut_clim = fp.groupby("month")["predicted_rain_mm"].mean()

    change = pd.DataFrame({
        "month": range(1, 13),
        "historical_mean": hist_clim.values,
        "projected_mean": fut_clim.values,
    })
    change["absolute_change"] = change["projected_mean"] - change["historical_mean"]
    change["percent_change"] = (change["absolute_change"] / change["historical_mean"] * 100).round(1)
    change["season"] = change["month"].apply(get_season)

    # Seasonal summary
    hp["season"] = hp["month"].apply(get_season)
    fp["season"] = fp["month"].apply(get_season)
    hist_seasonal = hp.groupby(["year", "season"])["rain_mm"].sum().groupby("season").mean()
    fut_seasonal = fp.groupby(["year", "season"])["predicted_rain_mm"].sum().groupby("season").mean()

    seasonal_change = pd.DataFrame({
        "season": hist_seasonal.index,
        "historical_mean": hist_seasonal.values,
        "projected_mean": fut_seasonal.values,
    })
    seasonal_change["percent_change"] = (
        (seasonal_change["projected_mean"] - seasonal_change["historical_mean"])
        / seasonal_change["historical_mean"] * 100
    ).round(1)

    return {
        "monthly": df_to_json(change),
        "seasonal": df_to_json(seasonal_change),
    }


# ======================== STREAMFLOW ========================

@app.get("/api/streamflow/historical/monthly")
def stream_hist_monthly():
    df = read_csv("historical_monthly_streamflow.csv")
    df["season"] = df["month"].apply(get_season)
    return df_to_json(df)


@app.get("/api/streamflow/historical/climatology")
def stream_hist_climatology():
    df = read_csv("historical_monthly_streamflow.csv")
    clim = df.groupby("month").agg(
        streamflow_mean=("streamflow_m3s", "mean"),
        streamflow_std=("streamflow_m3s", "std"),
        precip_mean=("precip_mm", "mean"),
    ).reset_index()
    clim["season"] = clim["month"].apply(get_season)
    return df_to_json(clim)


@app.get("/api/streamflow/historical/annual")
def stream_hist_annual():
    df = read_csv("historical_monthly_streamflow.csv")
    annual = df.groupby("year").agg(
        mean_streamflow=("streamflow_m3s", "mean"),
        total_precip=("precip_mm", "sum"),
    ).reset_index()
    annual["moving_avg_5yr"] = annual["mean_streamflow"].rolling(5, center=True).mean()

    # Convert to volume (MCM = million cubic meters)
    annual["volume_mcm"] = annual["mean_streamflow"] * 365.25 * 86400 / 1e6

    return df_to_json(annual)


@app.get("/api/streamflow/historical/flow-duration")
def stream_hist_flow_duration():
    df = read_csv("historical_monthly_streamflow.csv")
    sorted_flow = df["streamflow_m3s"].sort_values(ascending=False).values
    n = len(sorted_flow)
    exceedance = [(i + 1) / (n + 1) * 100 for i in range(n)]

    # Q10 and Q90
    q10 = float(np.percentile(sorted_flow, 90))  # flow exceeded 10% of time
    q90 = float(np.percentile(sorted_flow, 10))   # flow exceeded 90% of time

    return {
        "flow": sorted_flow.tolist(),
        "exceedance_pct": exceedance,
        "q10": round(q10, 3),
        "q90": round(q90, 3),
    }


@app.get("/api/streamflow/historical/runoff-analysis")
def stream_hist_runoff():
    df = read_csv("historical_monthly_streamflow.csv")

    coefficients = [{"month": m, "coefficient": c} for m, c in RUNOFF_COEFF_MAP.items()]

    # Annual runoff ratio
    annual = df.groupby("year").agg(
        total_precip_mm=("precip_mm", "sum"),
        mean_streamflow=("streamflow_m3s", "mean"),
    ).reset_index()
    # Convert streamflow to mm equivalent over catchment
    annual["streamflow_mm"] = annual["mean_streamflow"] * 365.25 * 86400 / (CATCHMENT_AREA_KM2 * 1e6) * 1000
    annual["runoff_ratio"] = annual["streamflow_mm"] / annual["total_precip_mm"]

    return {
        "coefficients": coefficients,
        "annual_runoff": df_to_json(annual),
    }


@app.get("/api/streamflow/historical/correlation")
def stream_hist_correlation():
    df = read_csv("historical_monthly_streamflow.csv")
    cols = ["streamflow_m3s", "precip_mm", "temp_mean_c", "rh_mean_pct", "cloud_mean_pct", "wind_mean_kmh", "precip_lag1"]
    corr = df[cols].corr()
    return {
        "columns": cols,
        "values": corr.values.tolist(),
    }


# ---- Streamflow Models ----

@app.get("/api/streamflow/models/cv-summary")
def stream_cv_summary():
    return df_to_json(read_csv("cv_summary_streamflow.csv"))


@app.get("/api/streamflow/models/cv-folds")
def stream_cv_folds():
    return df_to_json(read_csv("cv_folds_streamflow.csv"))


@app.get("/api/streamflow/models/test-metrics")
def stream_test_metrics():
    return df_to_json(read_csv("test_metrics_streamflow.csv"))


@app.get("/api/streamflow/models/test-predictions")
def stream_test_predictions():
    return df_to_json(read_csv("test_predictions_streamflow.csv"))


@app.get("/api/streamflow/models/feature-importance")
def stream_feature_importance():
    return df_to_json(read_csv("feature_importance_streamflow.csv"))


@app.get("/api/streamflow/models/residuals")
def stream_residuals():
    return df_to_json(read_csv("residuals_streamflow.csv"))


# ---- Streamflow Future ----

@app.get("/api/streamflow/future/monthly")
def stream_future_monthly():
    return df_to_json(read_csv("future_monthly_streamflow.csv"))


@app.get("/api/streamflow/future/annual")
def stream_future_annual():
    return df_to_json(read_csv("future_annual_streamflow.csv"))


@app.get("/api/streamflow/future/change")
def stream_future_change():
    hs = read_csv("historical_monthly_streamflow.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    if "predicted_streamflow_m3s" not in fs.columns:
        raise HTTPException(status_code=503, detail="Future predictions not available")

    hist_clim = hs.groupby("month")["streamflow_m3s"].mean()
    fut_clim = fs.groupby("month")["predicted_streamflow_m3s"].mean()

    change = pd.DataFrame({
        "month": range(1, 13),
        "historical_mean": hist_clim.values,
        "projected_mean": fut_clim.values,
    })
    change["absolute_change"] = change["projected_mean"] - change["historical_mean"]
    change["percent_change"] = (change["absolute_change"] / change["historical_mean"] * 100).round(1)
    change["season"] = change["month"].apply(get_season)

    return {"monthly": df_to_json(change)}


@app.get("/api/streamflow/future/flow-duration")
def stream_future_fdc():
    fs = read_csv("future_monthly_streamflow.csv")
    if "predicted_streamflow_m3s" not in fs.columns:
        raise HTTPException(status_code=503, detail="Future predictions not available")

    sorted_flow = fs["predicted_streamflow_m3s"].sort_values(ascending=False).values
    n = len(sorted_flow)
    exceedance = [(i + 1) / (n + 1) * 100 for i in range(n)]

    return {
        "flow": sorted_flow.tolist(),
        "exceedance_pct": exceedance,
    }


# ======================== INTEGRATED ========================

@app.get("/api/integrated/water-budget")
def integrated_water_budget():
    hs = read_csv("historical_monthly_streamflow.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    def calc_budget(df, precip_col, stream_col):
        annual = df.groupby("year").agg(
            total_precip_mm=(precip_col, "sum"),
            mean_streamflow=(stream_col, "mean"),
        ).reset_index()
        # Convert to volumes in MCM
        annual["precip_volume_mcm"] = annual["total_precip_mm"] * CATCHMENT_AREA_KM2 * 1e6 * 1e-3 / 1e6
        annual["streamflow_volume_mcm"] = annual["mean_streamflow"] * 365.25 * 86400 / 1e6
        annual["losses_mcm"] = annual["precip_volume_mcm"] - annual["streamflow_volume_mcm"]
        return annual

    hist_budget = calc_budget(hs, "precip_mm", "streamflow_m3s")
    hist_budget["type"] = "historical"

    if "predicted_streamflow_m3s" in fs.columns:
        fut_budget = calc_budget(fs, "precip_mm", "predicted_streamflow_m3s")
        fut_budget["type"] = "projected"
        budget = pd.concat([hist_budget, fut_budget], ignore_index=True)
    else:
        budget = hist_budget

    return df_to_json(budget)


@app.get("/api/integrated/seasonal-heatmap")
def integrated_seasonal_heatmap():
    hs = read_csv("historical_monthly_streamflow.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    hist_data = hs[["year", "month", "streamflow_m3s"]].copy()
    hist_data.columns = ["year", "month", "value"]
    hist_data["type"] = "historical"

    if "predicted_streamflow_m3s" in fs.columns:
        fut_data = fs[["year", "month", "predicted_streamflow_m3s"]].copy()
        fut_data.columns = ["year", "month", "value"]
        fut_data["type"] = "projected"
        combined = pd.concat([hist_data, fut_data], ignore_index=True)
    else:
        combined = hist_data

    return df_to_json(combined)


@app.get("/api/integrated/distribution-comparison")
def integrated_distribution():
    hp = read_csv("historical_monthly_precip.csv")
    hs = read_csv("historical_monthly_streamflow.csv")
    fp = read_csv("future_monthly_precip.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    def percentiles(series):
        return {
            "mean": round(series.mean(), 3),
            "std": round(series.std(), 3),
            "p5": round(series.quantile(0.05), 3),
            "p25": round(series.quantile(0.25), 3),
            "p50": round(series.quantile(0.50), 3),
            "p75": round(series.quantile(0.75), 3),
            "p95": round(series.quantile(0.95), 3),
        }

    result = {}
    variables = [
        ("precipitation", hp, "rain_mm", fp, "predicted_rain_mm"),
        ("streamflow", hs, "streamflow_m3s", fs, "predicted_streamflow_m3s"),
        ("temperature", hp, "temp_mean_c", fp, "temp_mean_c"),
        ("humidity", hp, "rh_mean_pct", fp, "rh_mean_pct"),
        ("cloud_cover", hp, "cloud_mean_pct", fp, "cloud_mean_pct"),
        ("wind_speed", hp, "wind_mean_kmh", fp, "wind_mean_kmh"),
    ]

    for name, h_df, h_col, f_df, f_col in variables:
        entry = {"historical": percentiles(h_df[h_col])}
        if f_col in f_df.columns:
            entry["projected"] = percentiles(f_df[f_col])
        result[name] = entry

    return result


@app.get("/api/integrated/risk-assessment")
def integrated_risk():
    hs = read_csv("historical_monthly_streamflow.csv")
    hp = read_csv("historical_monthly_precip.csv")
    fs = read_csv("future_monthly_streamflow.csv")
    fp = read_csv("future_monthly_precip.csv")

    p25_precip = hp["rain_mm"].quantile(0.25)
    p75_precip = hp["rain_mm"].quantile(0.75)
    p25_stream = hs["streamflow_m3s"].quantile(0.25)
    p75_stream = hs["streamflow_m3s"].quantile(0.75)

    # Historical risk months
    hist_drought = len(hp[(hp["rain_mm"] < p25_precip)])
    hist_wet = len(hp[(hp["rain_mm"] > p75_precip)])

    result = {
        "thresholds": {
            "precip_p25": round(p25_precip, 2),
            "precip_p75": round(p75_precip, 2),
            "streamflow_p25": round(p25_stream, 3),
            "streamflow_p75": round(p75_stream, 3),
        },
        "historical": {
            "total_months": len(hp),
            "dry_months": int(hist_drought),
            "wet_months": int(hist_wet),
        },
    }

    if "predicted_rain_mm" in fp.columns:
        fut_drought = len(fp[(fp["predicted_rain_mm"] < p25_precip)])
        fut_wet = len(fp[(fp["predicted_rain_mm"] > p75_precip)])
        result["projected"] = {
            "total_months": len(fp),
            "dry_months": int(fut_drought),
            "wet_months": int(fut_wet),
        }

    return result


@app.get("/api/integrated/trends-summary")
def integrated_trends():
    hp = read_csv("historical_monthly_precip.csv")
    hs = read_csv("historical_monthly_streamflow.csv")
    fp = read_csv("future_monthly_precip.csv")
    fs = read_csv("future_monthly_streamflow.csv")

    rows = []
    comparisons = [
        ("Precipitation (mm/month)", hp["rain_mm"], fp.get("predicted_rain_mm")),
        ("Streamflow (m3/s)", hs["streamflow_m3s"], fs.get("predicted_streamflow_m3s")),
        ("Temperature (C)", hp["temp_mean_c"], fp["temp_mean_c"]),
        ("Humidity (%)", hp["rh_mean_pct"], fp["rh_mean_pct"]),
        ("Cloud Cover (%)", hp["cloud_mean_pct"], fp["cloud_mean_pct"]),
        ("Wind Speed (km/h)", hp["wind_mean_kmh"], fp["wind_mean_kmh"]),
    ]

    for name, hist_series, fut_series in comparisons:
        h_mean = hist_series.mean()
        row = {"variable": name, "historical_mean": round(h_mean, 3)}
        if fut_series is not None and len(fut_series) > 0:
            f_mean = fut_series.mean()
            row["projected_mean"] = round(f_mean, 3)
            row["absolute_change"] = round(f_mean - h_mean, 3)
            row["percent_change"] = round((f_mean - h_mean) / h_mean * 100, 1) if h_mean != 0 else None
            row["trend"] = "up" if f_mean > h_mean else "down"
        rows.append(row)

    return rows


# ======================== FILE DOWNLOADS ========================

@app.get("/api/download/{filename}")
def download_file(filename: str):
    path = DATA_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename, media_type="text/csv")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
