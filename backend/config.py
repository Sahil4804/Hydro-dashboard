"""Configuration constants for Himayat Sagar hydroclimatic dashboard."""

from pathlib import Path

# Location
LAT = 17.345
LON = 78.401
TIMEZONE = "Asia/Kolkata"
CATCHMENT_AREA_KM2 = 1350

# Time periods
HIST_START_YEAR = 1985
HIST_END_YEAR = 2024
FUTURE_START_YEAR = 2025
FUTURE_END_YEAR = 2050

# Climate model for future projections
CLIMATE_MODEL = "EC_Earth3P_HR"

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = DATA_DIR / "models"

# Feature columns for precipitation model
PRECIP_FEATURE_COLS = [
    "temp_mean_c",
    "rh_mean_pct",
    "cloud_mean_pct",
    "wind_mean_kmh",
    "month_sin",
    "month_cos",
]

# Feature columns for streamflow model
STREAMFLOW_FEATURE_COLS = [
    "precip_mm",
    "temp_mean_c",
    "rh_mean_pct",
    "cloud_mean_pct",
    "wind_mean_kmh",
    "month_sin",
    "month_cos",
    "precip_lag1",
    "precip_lag2",
]

# Seasonal runoff coefficients (semi-arid monsoon conditions)
RUNOFF_COEFF_MAP = {
    1: 0.05, 2: 0.05, 3: 0.06, 4: 0.08, 5: 0.10,
    6: 0.30, 7: 0.45, 8: 0.50, 9: 0.45, 10: 0.25, 11: 0.10, 12: 0.06,
}

# Train-test split
TRAIN_END_DATE = "2022-01-01"  # exclusive: training is < this date

# Season definitions
SEASONS = {
    "Winter": [12, 1, 2],
    "Pre-Monsoon": [3, 4, 5],
    "Monsoon": [6, 7, 8, 9],
    "Post-Monsoon": [10, 11],
}
