"""
FastAPI backend for Himayat Sagar Hydroclimatic Dashboard.
Serves processed data via REST endpoints.
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

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


# ======================== WATER QUALITY ASSESSMENT ========================
#
# Standards and sources:
#   - Bureau of Indian Standards IS 10500:2012, "Drinking Water — Specification"
#     (BIS, 2012). Primary Indian standard for drinking water quality.
#   - WHO, "Guidelines for Drinking-water Quality", 4th edition incorporating
#     the 1st addendum (World Health Organization, 2017). ISBN 978-92-4-154995-0.
#   - Central Pollution Control Board (CPCB), "Designated Best Use
#     Classification of Inland Surface Waters", in Environmental Standards
#     (CPCB, New Delhi, 2008).

class WaterQualityInput(BaseModel):
    ph: Optional[float] = None
    turbidity_ntu: Optional[float] = None
    tds_mg_l: Optional[float] = None
    nitrate_mg_l: Optional[float] = None
    fluoride_mg_l: Optional[float] = None
    hardness_mg_l: Optional[float] = None
    chloride_mg_l: Optional[float] = None
    iron_mg_l: Optional[float] = None
    arsenic_ug_l: Optional[float] = None  # micrograms per litre
    bod_mg_l: Optional[float] = None


def _param_check(value: Optional[float], acceptable, permissible, label: str, unit: str, source: str, invert: bool = False) -> dict:
    """Return per-parameter assessment dict.

    For pH the 'acceptable' range is a (low, high) tuple.
    For all others, value <= acceptable is safe, <= permissible is caution,
    > permissible is unsafe.  `invert=True` is unused but kept for symmetry.
    """
    if value is None:
        return {"parameter": label, "value": None, "unit": unit, "status": "not_provided",
                "acceptable_limit": acceptable, "permissible_limit": permissible, "source": source}

    if isinstance(acceptable, tuple):
        # pH-style range check
        lo, hi = acceptable
        if lo <= value <= hi:
            status = "safe"
            message = f"Within WHO/IS 10500 range ({lo}–{hi} {unit})"
        else:
            status = "unsafe"
            message = f"Outside WHO/IS 10500 range ({lo}–{hi} {unit})"
        return {
            "parameter": label, "value": round(value, 3), "unit": unit,
            "status": status, "message": message,
            "acceptable_limit": f"{lo}–{hi}", "permissible_limit": f"{lo}–{hi}",
            "source": source,
        }

    if value <= acceptable:
        status = "safe"
        message = f"Within desirable limit (≤{acceptable} {unit})"
    elif value <= permissible:
        status = "caution"
        message = f"Between desirable ({acceptable}) and permissible ({permissible}) limits — treat before use"
    else:
        status = "unsafe"
        message = f"Exceeds permissible limit of {permissible} {unit}"

    return {
        "parameter": label, "value": round(value, 3), "unit": unit,
        "status": status, "message": message,
        "acceptable_limit": acceptable, "permissible_limit": permissible,
        "source": source,
    }


@app.post("/api/water-quality/assess")
def water_quality_assess(data: WaterQualityInput):
    """
    Assess drinking water safety from user-supplied field measurements.

    Thresholds from IS 10500:2012 (BIS) and WHO GDWQ 4th Ed. (2017).
    CPCB class limits used for BOD.
    """
    results = []

    # pH — IS 10500:2012 cl.4 & WHO GDWQ Table 8.1
    results.append(_param_check(
        data.ph, (6.5, 8.5), (6.5, 8.5),
        "pH", "—",
        "IS 10500:2012, Table 1; WHO GDWQ 4th ed. (2017), Table 8.1"
    ))

    # Turbidity — IS 10500:2012; WHO GDWQ 2017 §4.2
    results.append(_param_check(
        data.turbidity_ntu, 1, 5,
        "Turbidity", "NTU",
        "IS 10500:2012, Table 1 (desirable ≤1, permissible ≤5 NTU); WHO GDWQ 2017 §4.2"
    ))

    # Total Dissolved Solids — IS 10500:2012
    results.append(_param_check(
        data.tds_mg_l, 500, 2000,
        "Total Dissolved Solids (TDS)", "mg/L",
        "IS 10500:2012, Table 1 (desirable ≤500, permissible ≤2000 mg/L)"
    ))

    # Nitrate (as NO3) — IS 10500:2012; WHO GDWQ 2017 §12.7
    results.append(_param_check(
        data.nitrate_mg_l, 45, 100,
        "Nitrate (as NO₃)", "mg/L",
        "IS 10500:2012, Table 1 (desirable ≤45, permissible ≤100 mg/L); WHO GDWQ 2017 §12.7 (50 mg/L)"
    ))

    # Fluoride — IS 10500:2012; WHO GDWQ 2017 §12.4
    results.append(_param_check(
        data.fluoride_mg_l, 1.0, 1.5,
        "Fluoride", "mg/L",
        "IS 10500:2012, Table 1 (desirable ≤1.0, permissible ≤1.5 mg/L); WHO GDWQ 2017 §12.4 (1.5 mg/L)"
    ))

    # Total Hardness (as CaCO3) — IS 10500:2012
    results.append(_param_check(
        data.hardness_mg_l, 200, 600,
        "Total Hardness (as CaCO₃)", "mg/L",
        "IS 10500:2012, Table 1 (desirable ≤200, permissible ≤600 mg/L)"
    ))

    # Chloride — IS 10500:2012; WHO GDWQ 2017 §12.2
    results.append(_param_check(
        data.chloride_mg_l, 250, 1000,
        "Chloride", "mg/L",
        "IS 10500:2012, Table 1 (desirable ≤250, permissible ≤1000 mg/L); WHO GDWQ 2017 §12.2 (250 mg/L)"
    ))

    # Iron — IS 10500:2012; WHO GDWQ 2017 §12.5
    results.append(_param_check(
        data.iron_mg_l, 0.3, 0.3,
        "Iron (as Fe)", "mg/L",
        "IS 10500:2012, Table 1 (max 0.3 mg/L, no relaxation); WHO GDWQ 2017 §12.5"
    ))

    # Arsenic — IS 10500:2012; WHO GDWQ 2017 §12.1
    arsenic_mg_l = (data.arsenic_ug_l / 1000.0) if data.arsenic_ug_l is not None else None
    results.append(_param_check(
        arsenic_mg_l, 0.01, 0.01,
        "Arsenic (as As)", "mg/L",
        "IS 10500:2012, Table 1 (max 0.01 mg/L, no relaxation); WHO GDWQ 2017 §12.1"
    ))

    # BOD — CPCB Designated Best Use Classification (2008)
    # Class A (drinking after conventional treatment): BOD ≤3 mg/L
    # Class C (drinking after extensive treatment):   BOD ≤6 mg/L
    results.append(_param_check(
        data.bod_mg_l, 3, 6,
        "Biochemical Oxygen Demand (BOD)", "mg/L",
        "CPCB Designated Best Use Classification (2008): Class A ≤3 mg/L, Class C ≤6 mg/L"
    ))

    # Overall assessment
    statuses = [r["status"] for r in results if r["status"] != "not_provided"]
    if "unsafe" in statuses:
        overall = "unsafe"
        overall_message = "Water is NOT safe to drink. One or more parameters exceed permissible limits."
        overall_color = "red"
    elif "caution" in statuses:
        overall = "caution"
        overall_message = "Water requires treatment before consumption. Some parameters are above desirable limits."
        overall_color = "orange"
    elif statuses:
        overall = "safe"
        overall_message = "All measured parameters are within acceptable drinking water limits."
        overall_color = "green"
    else:
        overall = "no_data"
        overall_message = "No parameters were provided for assessment."
        overall_color = "gray"

    unsafe_params = [r["parameter"] for r in results if r["status"] == "unsafe"]
    caution_params = [r["parameter"] for r in results if r["status"] == "caution"]

    return {
        "overall": overall,
        "overall_message": overall_message,
        "overall_color": overall_color,
        "unsafe_parameters": unsafe_params,
        "caution_parameters": caution_params,
        "parameters": results,
        "standards": [
            "Bureau of Indian Standards IS 10500:2012 — Drinking Water Specification",
            "WHO Guidelines for Drinking-water Quality, 4th Ed. (2017)",
            "CPCB Designated Best Use Classification of Inland Surface Waters (2008)",
        ],
    }


# ======================== FLOOD ALERT ASSESSMENT ========================
#
# Standards and sources:
#   - India Meteorological Department (IMD), "Rainfall measurement criteria and
#     colour-coded weather warnings" (IMD, 2021). Operational guideline for
#     24-h accumulated rainfall severity thresholds.
#   - Central Water Commission (CWC), "Flood Forecasting and Warning Network"
#     manual (CWC, Ministry of Jal Shakti, 2022). Flood stage classification
#     based on historical exceedance percentiles.
#   - National Disaster Management Authority (NDMA), "National Guidelines on
#     Flood Management" (NDMA, Government of India, 2008). ISBN 978-93-80440-24-2.
#   - Historical streamflow percentiles computed from Himayat Sagar station
#     records (1985–2024) stored in this repository.

class FloodAlertInput(BaseModel):
    current_streamflow_m3s: Optional[float] = None
    rainfall_24h_mm: Optional[float] = None
    rainfall_72h_mm: Optional[float] = None


@app.post("/api/flood-alert/assess")
def flood_alert_assess(data: FloodAlertInput):
    """
    Assess flood risk from current streamflow and rainfall observations.

    Streamflow thresholds are derived from historical percentiles (Q75/Q90/Q95)
    of Himayat Sagar monthly streamflow records (1985–2024).
    Rainfall thresholds follow IMD 24-h accumulated rainfall severity categories.
    """
    # ---- Streamflow percentile thresholds (CWC methodology) ----
    streamflow_thresholds = None
    streamflow_result = None

    if data_ready():
        try:
            hs = read_csv("historical_monthly_streamflow.csv")
            q75 = float(hs["streamflow_m3s"].quantile(0.75))
            q90 = float(hs["streamflow_m3s"].quantile(0.90))
            q95 = float(hs["streamflow_m3s"].quantile(0.95))
            streamflow_thresholds = {"q75": round(q75, 3), "q90": round(q90, 3), "q95": round(q95, 3)}
        except Exception:
            streamflow_thresholds = None

    if data.current_streamflow_m3s is not None:
        sf = data.current_streamflow_m3s
        if streamflow_thresholds is None:
            streamflow_result = {
                "value": sf, "level": "unknown",
                "message": "Historical data unavailable to compute thresholds.",
                "color": "gray",
            }
        else:
            q75 = streamflow_thresholds["q75"]
            q90 = streamflow_thresholds["q90"]
            q95 = streamflow_thresholds["q95"]
            if sf < q75:
                level, color = "normal", "green"
                msg = f"Below Q75 ({q75} m³/s). Normal flow conditions."
            elif sf < q90:
                level, color = "watch", "yellow"
                msg = f"Between Q75 ({q75}) and Q90 ({q90}) m³/s. Elevated flow — monitor closely."
            elif sf < q95:
                level, color = "warning", "orange"
                msg = f"Between Q90 ({q90}) and Q95 ({q95}) m³/s. High flow — flood watch in effect."
            else:
                level, color = "danger", "red"
                msg = f"Exceeds Q95 ({q95} m³/s). Extreme flow — flood danger."
            streamflow_result = {
                "value": round(sf, 3), "level": level, "message": msg, "color": color,
                "source": "CWC flood stage classification; Himayat Sagar historical records (1985–2024)",
            }

    # ---- Rainfall thresholds (IMD 2021 colour-coded warnings) ----
    # 24-h accumulated rainfall categories (IMD):
    #   Light: <15.5 mm   Moderate: 15.6–64.4 mm
    #   Heavy: 64.5–115.5 mm (Yellow warning)
    #   Very Heavy: 115.6–204.4 mm (Orange warning)
    #   Extremely Heavy: ≥204.5 mm (Red warning)
    rainfall_result = None

    if data.rainfall_24h_mm is not None:
        r = data.rainfall_24h_mm
        if r < 15.6:
            level, color = "normal", "green"
            msg = f"{r} mm — Light to no rain. No flood concern from rainfall alone."
        elif r < 64.5:
            level, color = "normal", "green"
            msg = f"{r} mm — Moderate rain (15.6–64.4 mm). Monitor streamflow."
        elif r < 115.6:
            level, color = "watch", "yellow"
            msg = f"{r} mm — Heavy rain (IMD Yellow Warning). Flash flooding possible in low-lying areas."
        elif r < 204.5:
            level, color = "warning", "orange"
            msg = f"{r} mm — Very Heavy rain (IMD Orange Warning). Significant flood risk. Be prepared."
        else:
            level, color = "danger", "red"
            msg = f"{r} mm — Extremely Heavy rain (IMD Red Warning). Extreme flood risk. Take action immediately."

        rainfall_result = {
            "value": r, "level": level, "message": msg, "color": color,
            "source": "IMD 24-h rainfall severity thresholds (IMD, 2021); NDMA National Flood Guidelines (2008)",
        }

    # ---- 72-hour antecedent rainfall context ----
    antecedent_note = None
    if data.rainfall_72h_mm is not None:
        r72 = data.rainfall_72h_mm
        if r72 > 300:
            antecedent_note = (
                f"72-h accumulation {r72} mm is very high. Saturated catchment soils "
                "dramatically increase runoff and flood risk beyond what 24-h rainfall alone suggests "
                "(NDMA Flood Guidelines §3.2)."
            )
        elif r72 > 150:
            antecedent_note = (
                f"72-h accumulation {r72} mm is elevated. Antecedent wetness will amplify "
                "runoff response to any additional rain."
            )

    # ---- Overall flood risk level ----
    level_rank = {"normal": 0, "watch": 1, "warning": 2, "danger": 3, "unknown": -1}
    levels = []
    if streamflow_result and streamflow_result.get("level") in level_rank:
        levels.append(level_rank[streamflow_result["level"]])
    if rainfall_result and rainfall_result.get("level") in level_rank:
        levels.append(level_rank[rainfall_result["level"]])

    if not levels:
        overall_level = "no_data"
        overall_color = "gray"
        overall_message = "Provide streamflow or rainfall values to assess flood risk."
    else:
        rank = max(levels)
        overall_level = {0: "normal", 1: "watch", 2: "warning", 3: "danger"}[rank]
        colors = {"normal": "green", "watch": "yellow", "warning": "orange", "danger": "red"}
        overall_color = colors[overall_level]
        messages = {
            "normal": "No immediate flood threat. Continue routine monitoring.",
            "watch": "Elevated conditions detected. Stay informed and monitor updates.",
            "warning": "Flood warning conditions. Prepare emergency plans and alert downstream communities.",
            "danger": "FLOOD DANGER. Initiate emergency protocols. Evacuate flood-prone zones immediately.",
        }
        overall_message = messages[overall_level]

    return {
        "overall_level": overall_level,
        "overall_color": overall_color,
        "overall_message": overall_message,
        "streamflow": streamflow_result,
        "rainfall_24h": rainfall_result,
        "antecedent_note": antecedent_note,
        "streamflow_thresholds": streamflow_thresholds,
        "standards": [
            "IMD 24-h rainfall severity thresholds and colour-coded warnings (IMD, 2021)",
            "CWC Flood Forecasting and Warning Network manual (CWC, Ministry of Jal Shakti, 2022)",
            "NDMA National Guidelines on Flood Management (2008), ISBN 978-93-80440-24-2",
            "Himayat Sagar historical streamflow records 1985–2024 (Open-Meteo + runoff model)",
        ],
    }


# ======================== SHORT-TERM FORECAST ========================

@app.get("/api/forecast")
def get_forecast():
    """
    Fetch 7-day weather forecast from Open-Meteo Forecast API and use
    trained ML models to predict daily rainfall and streamflow.
    """
    import requests as _req
    import joblib
    from datetime import date, timedelta

    today = date.today()
    end_date = today + timedelta(days=7)

    # --- Fetch forecast from Open-Meteo ---
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": LAT,
        "longitude": LON,
        "timezone": "Asia/Kolkata",
        "daily": [
            "temperature_2m_mean",
            "precipitation_sum",
            "relative_humidity_2m_mean",
            "cloud_cover_mean",
            "wind_speed_10m_max",
        ],
        "start_date": str(today),
        "end_date": str(end_date),
    }

    try:
        resp = _req.get(url, params=params, timeout=30)
        resp.raise_for_status()
        api_data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo Forecast API error: {e}")

    if "daily" not in api_data:
        raise HTTPException(status_code=502, detail="Unexpected response from forecast API")

    daily = api_data["daily"]
    n_days = len(daily["time"])

    def _safe_float(val):
        try:
            return float(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    forecast_days = []
    for i in range(n_days):
        forecast_days.append({
            "date": daily["time"][i],
            "temp_mean_c": _safe_float(daily["temperature_2m_mean"][i]),
            "precip_mm": _safe_float(daily["precipitation_sum"][i]) or 0,
            "rh_mean_pct": _safe_float(daily["relative_humidity_2m_mean"][i]),
            "cloud_mean_pct": _safe_float(daily["cloud_cover_mean"][i]),
            "wind_mean_kmh": _safe_float(daily["wind_speed_10m_max"][i]),
        })

    df = pd.DataFrame(forecast_days)
    df["date_parsed"] = pd.to_datetime(df["date"])
    df["month"] = df["date_parsed"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["day_of_week"] = df["date_parsed"].dt.strftime("%a")

    # --- ML-based streamflow estimation ---
    # Use historical last-month rainfall as lag context
    streamflow_predicted = [None] * n_days
    try:
        if data_ready():
            hs = read_csv("historical_monthly_streamflow.csv")
            last_month_precip = float(hs["precip_mm"].iloc[-1])
            prev_month_precip = float(hs["precip_mm"].iloc[-2])

            svr_path = MODELS_DIR / "streamflow_svr.joblib"
            if svr_path.exists():
                svr_model = joblib.load(svr_path)
                from config import STREAMFLOW_FEATURE_COLS

                for i in range(n_days):
                    row = {
                        "precip_mm": df.iloc[i]["precip_mm"] or 0,
                        "temp_mean_c": df.iloc[i]["temp_mean_c"],
                        "rh_mean_pct": df.iloc[i]["rh_mean_pct"],
                        "cloud_mean_pct": df.iloc[i]["cloud_mean_pct"],
                        "wind_mean_kmh": df.iloc[i]["wind_mean_kmh"],
                        "month_sin": df.iloc[i]["month_sin"],
                        "month_cos": df.iloc[i]["month_cos"],
                        "precip_lag1": last_month_precip,
                        "precip_lag2": prev_month_precip,
                    }
                    features = pd.DataFrame([row])[STREAMFLOW_FEATURE_COLS]
                    pred = max(float(svr_model.predict(features)[0]), 0)
                    streamflow_predicted[i] = round(pred, 3)
    except Exception:
        pass

    # --- Classify rainfall severity (IMD scale) ---
    def classify_rain(mm):
        if mm is None or mm < 2.5:
            return {"label": "No/Trace", "color": "slate"}
        elif mm < 15.6:
            return {"label": "Light", "color": "sky"}
        elif mm < 64.5:
            return {"label": "Moderate", "color": "blue"}
        elif mm < 115.6:
            return {"label": "Heavy", "color": "amber"}
        elif mm < 204.5:
            return {"label": "Very Heavy", "color": "orange"}
        else:
            return {"label": "Extreme", "color": "red"}

    # --- Build response ---
    days = []
    total_precip = 0
    for i in range(n_days):
        p = df.iloc[i]["precip_mm"] or 0
        total_precip += p
        rain_class = classify_rain(p)
        days.append({
            "date": df.iloc[i]["date"],
            "day_of_week": df.iloc[i]["day_of_week"],
            "is_today": i == 0,
            "is_tomorrow": i == 1,
            "temp_mean_c": round(df.iloc[i]["temp_mean_c"], 1) if df.iloc[i]["temp_mean_c"] is not None else None,
            "precip_mm": round(p, 1),
            "rh_mean_pct": round(df.iloc[i]["rh_mean_pct"], 1) if df.iloc[i]["rh_mean_pct"] is not None else None,
            "cloud_mean_pct": round(df.iloc[i]["cloud_mean_pct"], 1) if df.iloc[i]["cloud_mean_pct"] is not None else None,
            "wind_mean_kmh": round(df.iloc[i]["wind_mean_kmh"], 1) if df.iloc[i]["wind_mean_kmh"] is not None else None,
            "rain_severity": rain_class["label"],
            "rain_color": rain_class["color"],
            "predicted_streamflow_m3s": streamflow_predicted[i],
        })

    # Weekly summary
    precip_values = [d["precip_mm"] for d in days]
    temp_values = [d["temp_mean_c"] for d in days if d["temp_mean_c"] is not None]
    stream_values = [d["predicted_streamflow_m3s"] for d in days if d["predicted_streamflow_m3s"] is not None]

    summary = {
        "total_precip_mm": round(sum(precip_values), 1),
        "avg_temp_c": round(sum(temp_values) / len(temp_values), 1) if temp_values else None,
        "max_precip_day": max(days, key=lambda d: d["precip_mm"]),
        "rainy_days": sum(1 for p in precip_values if p >= 2.5),
        "avg_streamflow_m3s": round(sum(stream_values) / len(stream_values), 3) if stream_values else None,
        "max_streamflow_m3s": round(max(stream_values), 3) if stream_values else None,
    }

    return {
        "location": {"lat": LAT, "lon": LON, "name": "Himayat Sagar, Hyderabad"},
        "fetched_at": datetime.now().isoformat(),
        "days": days,
        "summary": summary,
        "source": "Open-Meteo Forecast API; streamflow predicted via SVR model trained on 1985–2024 data",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
