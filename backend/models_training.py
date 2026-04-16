"""
ML model training for precipitation and streamflow prediction.
Trains all 6 models, runs CV, generates predictions, exports results.
"""

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR

from config import (
    PRECIP_FEATURE_COLS, STREAMFLOW_FEATURE_COLS,
    TRAIN_END_DATE, DATA_DIR, MODELS_DIR,
)
from utils import metric_row


# ---------------------------------------------------------------------------
# Model definitions
# ---------------------------------------------------------------------------

def get_precip_models():
    return {
        "Linear Regression": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", LinearRegression()),
        ]),
        "Random Forest": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("model", RandomForestRegressor(
                n_estimators=400, min_samples_leaf=2, random_state=42, n_jobs=-1
            )),
        ]),
        "HistGradientBoosting": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("model", HistGradientBoostingRegressor(
                learning_rate=0.05, max_depth=4, max_iter=300,
                min_samples_leaf=10, random_state=42
            )),
        ]),
    }


def get_streamflow_models():
    return {
        "Linear Regression": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", LinearRegression()),
        ]),
        "Random Forest": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("model", RandomForestRegressor(
                n_estimators=400, min_samples_leaf=2, random_state=42, n_jobs=-1
            )),
        ]),
        "SVR": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", SVR(kernel="rbf", C=100, gamma="scale", epsilon=0.1)),
        ]),
    }


# ---------------------------------------------------------------------------
# Cross-validation
# ---------------------------------------------------------------------------

def run_cv(model, X, y, n_splits=5):
    tscv = TimeSeriesSplit(n_splits=n_splits)
    rows = []
    for fold, (tr_idx, va_idx) in enumerate(tscv.split(X), start=1):
        fitted = clone(model)
        fitted.fit(X.iloc[tr_idx], y.iloc[tr_idx])
        pred = np.maximum(fitted.predict(X.iloc[va_idx]), 0)
        row = metric_row(f"Fold {fold}", y.iloc[va_idx], pred)
        row["fold"] = fold
        rows.append(row)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Training pipeline
# ---------------------------------------------------------------------------

def train_all(datasets: dict, progress_callback=None):
    """Train all models, run CV, generate predictions, export everything."""

    def report(msg):
        print(msg)
        if progress_callback:
            progress_callback(msg)

    hist_precip = datasets["hist_monthly_precip"]
    hist_stream = datasets["hist_monthly_streamflow"]
    fut_precip = datasets["fut_monthly_precip"]
    fut_stream = datasets["fut_monthly_streamflow"]

    # ---- Split ----
    train_p = hist_precip[hist_precip["date"] < TRAIN_END_DATE].copy()
    test_p = hist_precip[hist_precip["date"] >= TRAIN_END_DATE].copy()

    train_s = hist_stream[hist_stream["date"] < TRAIN_END_DATE].copy()
    test_s = hist_stream[hist_stream["date"] >= TRAIN_END_DATE].copy()

    X_train_p, y_train_p = train_p[PRECIP_FEATURE_COLS], train_p["rain_mm"]
    X_test_p, y_test_p = test_p[PRECIP_FEATURE_COLS], test_p["rain_mm"]

    X_train_s, y_train_s = train_s[STREAMFLOW_FEATURE_COLS], train_s["streamflow_m3s"]
    X_test_s, y_test_s = test_s[STREAMFLOW_FEATURE_COLS], test_s["streamflow_m3s"]

    # ===================== PRECIPITATION =====================
    report("Training precipitation models...")
    precip_models = get_precip_models()

    # Baseline
    month_mean_p = train_p.groupby("month")["rain_mm"].mean().to_dict()
    baseline_pred_p = test_p["month"].map(month_mean_p).values

    # CV
    cv_folds_all_p = []
    cv_summary_rows_p = []
    for name, model in precip_models.items():
        report(f"  CV for {name}...")
        fold_df = run_cv(model, X_train_p, y_train_p)
        fold_df["model"] = name
        cv_folds_all_p.append(fold_df)

        avg = fold_df[["rmse", "mae", "r2", "nse"]].mean().to_dict()
        avg["model"] = name
        cv_summary_rows_p.append(avg)

    cv_folds_p = pd.concat(cv_folds_all_p, ignore_index=True)
    cv_summary_p = pd.DataFrame(cv_summary_rows_p).sort_values("rmse")

    cv_folds_p.to_csv(DATA_DIR / "cv_folds_precip.csv", index=False)
    cv_summary_p.to_csv(DATA_DIR / "cv_summary_precip.csv", index=False)

    # Train final models and generate test predictions
    test_preds_p = test_p[["date", "year", "month", "rain_mm"]].copy()
    test_preds_p["baseline_pred"] = baseline_pred_p

    test_metrics_rows_p = [metric_row("Baseline", y_test_p, baseline_pred_p)]

    for name, model in precip_models.items():
        report(f"  Training final {name}...")
        fitted = clone(model)
        fitted.fit(X_train_p, y_train_p)
        pred = np.maximum(fitted.predict(X_test_p), 0)
        col_name = name.lower().replace(" ", "_") + "_pred"
        test_preds_p[col_name] = pred
        test_metrics_rows_p.append(metric_row(name, y_test_p, pred))

        # Save model
        joblib.dump(fitted, MODELS_DIR / f"precip_{col_name.replace('_pred', '')}.joblib")

    test_preds_p.to_csv(DATA_DIR / "test_predictions_precip.csv", index=False)
    test_metrics_p = pd.DataFrame(test_metrics_rows_p)
    test_metrics_p.to_csv(DATA_DIR / "test_metrics_precip.csv", index=False)

    # Feature importance (Random Forest)
    rf_model_p = joblib.load(MODELS_DIR / "precip_random_forest.joblib")
    fi_p = pd.DataFrame({
        "feature": PRECIP_FEATURE_COLS,
        "importance": rf_model_p.named_steps["model"].feature_importances_,
    }).sort_values("importance", ascending=False)
    fi_p.to_csv(DATA_DIR / "feature_importance_precip.csv", index=False)

    # Future predictions (use best model = RF based on CV)
    best_precip_model = joblib.load(MODELS_DIR / "precip_random_forest.joblib")
    fut_precip["predicted_rain_mm"] = np.maximum(
        best_precip_model.predict(fut_precip[PRECIP_FEATURE_COLS]), 0
    )
    fut_precip.to_csv(DATA_DIR / "future_monthly_precip.csv", index=False)

    fut_annual_p = fut_precip.groupby("year", as_index=False)["predicted_rain_mm"].sum()
    fut_annual_p.to_csv(DATA_DIR / "future_annual_precip.csv", index=False)

    # Residuals for all models
    residuals_p = test_p[["date", "month", "rain_mm"]].copy()
    for name in precip_models:
        col = name.lower().replace(" ", "_") + "_pred"
        residuals_p[f"{col}_residual"] = residuals_p["rain_mm"] - test_preds_p[col]
    residuals_p.to_csv(DATA_DIR / "residuals_precip.csv", index=False)

    # ===================== STREAMFLOW =====================
    report("Training streamflow models...")
    stream_models = get_streamflow_models()

    # Baseline
    month_mean_s = train_s.groupby("month")["streamflow_m3s"].mean().to_dict()
    baseline_pred_s = test_s["month"].map(month_mean_s).values

    # CV
    cv_folds_all_s = []
    cv_summary_rows_s = []
    for name, model in stream_models.items():
        report(f"  CV for {name}...")
        fold_df = run_cv(model, X_train_s, y_train_s)
        fold_df["model"] = name
        cv_folds_all_s.append(fold_df)

        avg = fold_df[["rmse", "mae", "r2", "nse"]].mean().to_dict()
        avg["model"] = name
        cv_summary_rows_s.append(avg)

    cv_folds_s = pd.concat(cv_folds_all_s, ignore_index=True)
    cv_summary_s = pd.DataFrame(cv_summary_rows_s).sort_values("rmse")

    cv_folds_s.to_csv(DATA_DIR / "cv_folds_streamflow.csv", index=False)
    cv_summary_s.to_csv(DATA_DIR / "cv_summary_streamflow.csv", index=False)

    # Train final models and generate test predictions
    test_preds_s = test_s[["date", "year", "month", "streamflow_m3s"]].copy()
    test_preds_s["baseline_pred"] = baseline_pred_s

    test_metrics_rows_s = [metric_row("Baseline", y_test_s, baseline_pred_s)]

    for name, model in stream_models.items():
        report(f"  Training final {name}...")
        fitted = clone(model)
        fitted.fit(X_train_s, y_train_s)
        pred = np.maximum(fitted.predict(X_test_s), 0)
        col_name = name.lower().replace(" ", "_") + "_pred"
        test_preds_s[col_name] = pred
        test_metrics_rows_s.append(metric_row(name, y_test_s, pred))

        joblib.dump(fitted, MODELS_DIR / f"streamflow_{col_name.replace('_pred', '')}.joblib")

    test_preds_s.to_csv(DATA_DIR / "test_predictions_streamflow.csv", index=False)
    test_metrics_s = pd.DataFrame(test_metrics_rows_s)
    test_metrics_s.to_csv(DATA_DIR / "test_metrics_streamflow.csv", index=False)

    # Feature importance (Random Forest for streamflow)
    rf_model_s = joblib.load(MODELS_DIR / "streamflow_random_forest.joblib")
    fi_s = pd.DataFrame({
        "feature": STREAMFLOW_FEATURE_COLS,
        "importance": rf_model_s.named_steps["model"].feature_importances_,
    }).sort_values("importance", ascending=False)
    fi_s.to_csv(DATA_DIR / "feature_importance_streamflow.csv", index=False)

    # Future predictions (use best model = SVR based on CV)
    best_stream_model = joblib.load(MODELS_DIR / "streamflow_svr.joblib")
    fut_stream["predicted_streamflow_m3s"] = np.maximum(
        best_stream_model.predict(fut_stream[STREAMFLOW_FEATURE_COLS]), 0
    )
    fut_stream.to_csv(DATA_DIR / "future_monthly_streamflow.csv", index=False)

    fut_annual_s = fut_stream.groupby("year", as_index=False)["predicted_streamflow_m3s"].mean()
    fut_annual_s.to_csv(DATA_DIR / "future_annual_streamflow.csv", index=False)

    # Residuals
    residuals_s = test_s[["date", "month", "streamflow_m3s"]].copy()
    for name in stream_models:
        col = name.lower().replace(" ", "_") + "_pred"
        residuals_s[f"{col}_residual"] = residuals_s["streamflow_m3s"] - test_preds_s[col]
    residuals_s.to_csv(DATA_DIR / "residuals_streamflow.csv", index=False)

    report("All models trained and exported.")
