"""Utility functions for metrics and data processing."""

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def rmse(y_true, y_pred):
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def nse(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.sum((y_true - np.mean(y_true)) ** 2)
    if denom == 0:
        return float("nan")
    return float(1 - np.sum((y_true - y_pred) ** 2) / denom)


def metric_row(name, y_true, y_pred):
    return {
        "model": name,
        "rmse": round(rmse(y_true, y_pred), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "nse": round(nse(y_true, y_pred), 4),
    }


def get_season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    if month in (3, 4, 5):
        return "Pre-Monsoon"
    if month in (6, 7, 8, 9):
        return "Monsoon"
    return "Post-Monsoon"
