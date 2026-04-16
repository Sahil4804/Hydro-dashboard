"""
Data pipeline: fetches from Open-Meteo APIs, processes daily->monthly,
constructs streamflow, and exports CSVs.
"""

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from config import (
    LAT, LON, TIMEZONE,
    HIST_START_YEAR, HIST_END_YEAR,
    FUTURE_START_YEAR, FUTURE_END_YEAR,
    CLIMATE_MODEL, CATCHMENT_AREA_KM2,
    RUNOFF_COEFF_MAP, DATA_DIR,
)

session = requests.Session()


def call_api(url: str, params: dict, max_retries: int = 4, sleep_seconds: int = 2) -> dict:
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, params=params, timeout=120)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            last_error = e
            print(f"  Attempt {attempt} failed: {e}")
            if attempt < max_retries:
                time.sleep(sleep_seconds)
    raise RuntimeError(f"API request failed after {max_retries} attempts: {last_error}")


# ---------------------------------------------------------------------------
# Historical data
# ---------------------------------------------------------------------------

def fetch_historical_daily() -> pd.DataFrame:
    url = "https://archive-api.open-meteo.com/v1/archive"
    all_years = []

    for year in range(HIST_START_YEAR, HIST_END_YEAR + 1):
        print(f"  Fetching historical {year}...")
        params = {
            "latitude": LAT,
            "longitude": LON,
            "start_date": f"{year}-01-01",
            "end_date": f"{year}-12-31",
            "timezone": TIMEZONE,
            "daily": [
                "temperature_2m_mean",
                "precipitation_sum",
                "relative_humidity_2m_mean",
                "cloud_cover_mean",
                "wind_speed_10m_mean",
            ],
        }
        data = call_api(url, params)
        if "daily" not in data:
            raise ValueError(f"Unexpected response: {json.dumps(data)[:500]}")

        daily = data["daily"]
        df_year = pd.DataFrame({
            "date": pd.to_datetime(daily["time"]),
            "temp_mean_c": daily["temperature_2m_mean"],
            "precip_mm": daily["precipitation_sum"],
            "rh_mean_pct": daily["relative_humidity_2m_mean"],
            "cloud_mean_pct": daily["cloud_cover_mean"],
            "wind_mean_kmh": daily["wind_speed_10m_mean"],
        })
        all_years.append(df_year)

    return pd.concat(all_years, ignore_index=True)


def to_monthly_precip(df: pd.DataFrame) -> pd.DataFrame:
    monthly = (
        df.set_index("date")
          .resample("MS")
          .agg({
              "precip_mm": "sum",
              "temp_mean_c": "mean",
              "rh_mean_pct": "mean",
              "cloud_mean_pct": "mean",
              "wind_mean_kmh": "mean",
          })
          .reset_index()
    )
    monthly.rename(columns={"precip_mm": "rain_mm"}, inplace=True)
    monthly["year"] = monthly["date"].dt.year
    monthly["month"] = monthly["date"].dt.month
    monthly["month_sin"] = np.sin(2 * np.pi * monthly["month"] / 12)
    monthly["month_cos"] = np.cos(2 * np.pi * monthly["month"] / 12)
    return monthly


def to_monthly_streamflow(df: pd.DataFrame) -> pd.DataFrame:
    monthly = (
        df.set_index("date")
          .resample("MS")
          .agg({
              "precip_mm": "sum",
              "temp_mean_c": "mean",
              "rh_mean_pct": "mean",
              "cloud_mean_pct": "mean",
              "wind_mean_kmh": "mean",
          })
          .reset_index()
    )
    monthly["year"] = monthly["date"].dt.year
    monthly["month"] = monthly["date"].dt.month

    # Construct estimated streamflow
    monthly["runoff_coeff"] = monthly["month"].map(RUNOFF_COEFF_MAP)
    monthly["days_in_month"] = monthly["date"].dt.days_in_month
    monthly["seconds_in_month"] = monthly["days_in_month"] * 86400

    monthly["precip_lag1"] = monthly["precip_mm"].shift(1).fillna(method="bfill")
    monthly["precip_lag2"] = monthly["precip_mm"].shift(2).fillna(method="bfill")

    evap_factor = 1 - 0.005 * (monthly["temp_mean_c"] - 30)
    humidity_factor = 1 + 0.002 * (monthly["rh_mean_pct"] - 50)

    streamflow_core = (
        monthly["precip_mm"] * monthly["runoff_coeff"]
        * CATCHMENT_AREA_KM2 * 1e6 * 1e-3
        / monthly["seconds_in_month"]
    )
    streamflow_lag = (
        0.15 * monthly["precip_lag1"] * monthly["runoff_coeff"]
        * CATCHMENT_AREA_KM2 * 1e6 * 1e-3
        / monthly["seconds_in_month"]
    )
    monthly["streamflow_m3s"] = np.maximum(
        streamflow_core * evap_factor * humidity_factor + streamflow_lag, 0.1
    )

    monthly["month_sin"] = np.sin(2 * np.pi * monthly["month"] / 12)
    monthly["month_cos"] = np.cos(2 * np.pi * monthly["month"] / 12)

    keep_cols = [
        "date", "year", "month",
        "precip_mm", "temp_mean_c", "rh_mean_pct", "cloud_mean_pct", "wind_mean_kmh",
        "precip_lag1", "precip_lag2", "month_sin", "month_cos",
        "streamflow_m3s",
    ]
    return monthly[keep_cols].copy()


# ---------------------------------------------------------------------------
# Future data
# ---------------------------------------------------------------------------

def fetch_future_daily() -> pd.DataFrame:
    url = "https://climate-api.open-meteo.com/v1/climate"
    all_years = []

    for year in range(FUTURE_START_YEAR, FUTURE_END_YEAR + 1):
        print(f"  Fetching future {year}...")
        params = {
            "latitude": LAT,
            "longitude": LON,
            "start_date": f"{year}-01-01",
            "end_date": f"{year}-12-31",
            "models": CLIMATE_MODEL,
            "timezone": TIMEZONE,
            "daily": [
                "temperature_2m_mean",
                "precipitation_sum",
                "relative_humidity_2m_mean",
                "cloud_cover_mean",
                "wind_speed_10m_mean",
            ],
        }
        data = call_api(url, params)
        if "daily" not in data:
            raise ValueError(f"Unexpected response: {json.dumps(data)[:500]}")

        daily = data["daily"]
        df_year = pd.DataFrame({
            "date": pd.to_datetime(daily["time"]),
            "temp_mean_c": daily["temperature_2m_mean"],
            "precip_mm": daily["precipitation_sum"],
            "rh_mean_pct": daily["relative_humidity_2m_mean"],
            "cloud_mean_pct": daily["cloud_cover_mean"],
            "wind_mean_kmh": daily["wind_speed_10m_mean"],
        })
        all_years.append(df_year)
        time.sleep(1)

    return pd.concat(all_years, ignore_index=True)


def future_to_monthly_precip(df: pd.DataFrame) -> pd.DataFrame:
    monthly = (
        df.set_index("date")
          .resample("MS")
          .agg({
              "precip_mm": "sum",
              "temp_mean_c": "mean",
              "rh_mean_pct": "mean",
              "cloud_mean_pct": "mean",
              "wind_mean_kmh": "mean",
          })
          .reset_index()
    )
    monthly["year"] = monthly["date"].dt.year
    monthly["month"] = monthly["date"].dt.month
    monthly["month_sin"] = np.sin(2 * np.pi * monthly["month"] / 12)
    monthly["month_cos"] = np.cos(2 * np.pi * monthly["month"] / 12)
    return monthly


def future_to_monthly_streamflow(df: pd.DataFrame) -> pd.DataFrame:
    monthly = (
        df.set_index("date")
          .resample("MS")
          .agg({
              "precip_mm": "sum",
              "temp_mean_c": "mean",
              "rh_mean_pct": "mean",
              "cloud_mean_pct": "mean",
              "wind_mean_kmh": "mean",
          })
          .reset_index()
    )
    monthly["year"] = monthly["date"].dt.year
    monthly["month"] = monthly["date"].dt.month
    monthly["month_sin"] = np.sin(2 * np.pi * monthly["month"] / 12)
    monthly["month_cos"] = np.cos(2 * np.pi * monthly["month"] / 12)
    monthly["precip_lag1"] = monthly["precip_mm"].shift(1).fillna(method="bfill")
    monthly["precip_lag2"] = monthly["precip_mm"].shift(2).fillna(method="bfill")
    return monthly


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def run_pipeline(progress_callback=None):
    """Run the full data pipeline. Returns a dict of DataFrames."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "models").mkdir(exist_ok=True)

    def report(msg):
        print(msg)
        if progress_callback:
            progress_callback(msg)

    report("Step 1/4: Fetching historical daily data...")
    hist_daily = fetch_historical_daily()
    hist_daily.to_csv(DATA_DIR / "historical_daily.csv", index=False)

    report("Step 2/4: Processing historical monthly data...")
    hist_monthly_precip = to_monthly_precip(hist_daily)
    hist_monthly_precip.to_csv(DATA_DIR / "historical_monthly_precip.csv", index=False)

    hist_monthly_streamflow = to_monthly_streamflow(hist_daily)
    hist_monthly_streamflow.to_csv(DATA_DIR / "historical_monthly_streamflow.csv", index=False)

    report("Step 3/4: Fetching future daily data...")
    future_daily = fetch_future_daily()
    future_daily.to_csv(DATA_DIR / "future_daily_predictors.csv", index=False)

    report("Step 4/4: Processing future monthly data...")
    fut_monthly_precip = future_to_monthly_precip(future_daily)
    fut_monthly_precip.to_csv(DATA_DIR / "future_monthly_precip.csv", index=False)

    fut_monthly_streamflow = future_to_monthly_streamflow(future_daily)
    fut_monthly_streamflow.to_csv(DATA_DIR / "future_monthly_streamflow.csv", index=False)

    report("Pipeline data export complete.")

    return {
        "hist_daily": hist_daily,
        "hist_monthly_precip": hist_monthly_precip,
        "hist_monthly_streamflow": hist_monthly_streamflow,
        "future_daily": future_daily,
        "fut_monthly_precip": fut_monthly_precip,
        "fut_monthly_streamflow": fut_monthly_streamflow,
    }
