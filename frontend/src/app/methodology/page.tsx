"use client";

import { ChartCard } from "@/components/dashboard/chart-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { API_BASE } from "@/lib/constants";

const PRECIP_MODELS = [
  { name: "Linear Regression", type: "Linear", params: "Default (no hyperparameters)" },
  { name: "Random Forest", type: "Ensemble", params: "n_estimators=400, min_samples_leaf=2, random_state=42" },
  { name: "HistGradientBoosting", type: "Boosting", params: "learning_rate=0.05, max_depth=4, max_iter=300, min_samples_leaf=10" },
];

const STREAM_MODELS = [
  { name: "Linear Regression", type: "Linear", params: "Default (no hyperparameters)" },
  { name: "Random Forest", type: "Ensemble", params: "n_estimators=400, min_samples_leaf=2, random_state=42" },
  { name: "SVR", type: "Kernel", params: "kernel=rbf, C=100, gamma=scale, epsilon=0.1" },
];

const RUNOFF_COEFFICIENTS = [
  { month: "Jan", coeff: 0.05 }, { month: "Feb", coeff: 0.05 }, { month: "Mar", coeff: 0.06 },
  { month: "Apr", coeff: 0.08 }, { month: "May", coeff: 0.10 }, { month: "Jun", coeff: 0.30 },
  { month: "Jul", coeff: 0.45 }, { month: "Aug", coeff: 0.50 }, { month: "Sep", coeff: 0.45 },
  { month: "Oct", coeff: 0.25 }, { month: "Nov", coeff: 0.10 }, { month: "Dec", coeff: 0.06 },
];

const CSV_FILES = [
  "historical_daily.csv",
  "historical_monthly_precip.csv",
  "historical_monthly_streamflow.csv",
  "future_monthly_precip.csv",
  "future_monthly_streamflow.csv",
  "future_annual_precip.csv",
  "future_annual_streamflow.csv",
  "cv_summary_precip.csv",
  "cv_summary_streamflow.csv",
  "test_predictions_precip.csv",
  "test_predictions_streamflow.csv",
  "test_metrics_precip.csv",
  "test_metrics_streamflow.csv",
  "feature_importance_precip.csv",
  "feature_importance_streamflow.csv",
];

export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Methodology & Documentation</h1>
        <p className="text-sm text-muted-foreground">Technical reference for the hydroclimatic prediction framework</p>
      </div>

      {/* Study Design */}
      <Card>
        <CardHeader><CardTitle>Study Design</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p><strong>Location:</strong> Himayat Sagar Dam, Hyderabad, Telangana (17.345N, 78.401E)</p>
          <p><strong>Catchment Area:</strong> ~1,350 km2</p>
          <p><strong>Historical Period:</strong> 1985-2024 (40 years of monthly data)</p>
          <p><strong>Projection Period:</strong> 2025-2050 (26 years using EC_Earth3P_HR climate model)</p>
          <p><strong>Train-Test Split:</strong> 1985-2021 (training) / 2022-2024 (testing) - chronological split</p>
          <Separator />
          <div>
            <h4 className="font-semibold mb-2">Predictands</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Monthly Precipitation (mm)</strong> - directly from Open-Meteo observations</li>
              <li><strong>Monthly Streamflow (m3/s)</strong> - estimated via physically-informed rainfall-runoff formulation</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Predictors (Precipitation Model)</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Mean air temperature (C)</li>
              <li>Mean relative humidity (%)</li>
              <li>Mean cloud cover (%)</li>
              <li>Mean wind speed (km/h)</li>
              <li>Seasonality terms: sin(2*pi*month/12), cos(2*pi*month/12)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Predictors (Streamflow Model)</h4>
            <p>All of the above, plus:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Monthly precipitation (mm)</li>
              <li>Lagged precipitation: t-1 and t-2</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardHeader><CardTitle>Data Sources</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Historical</Badge>
            <span>Open-Meteo Historical Weather API (gridded reanalysis)</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Future</Badge>
            <span>Open-Meteo Climate API - EC_Earth3P_HR model projections</span>
          </div>
          <p className="text-muted-foreground mt-2">
            Note: Data is from gridded reanalysis and climate model outputs, not point-based station observations.
            This may introduce spatial averaging effects compared to a single local rain gauge.
          </p>
        </CardContent>
      </Card>

      {/* Streamflow Construction */}
      <Card>
        <CardHeader><CardTitle>Streamflow Construction Formula</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Since no openly available monthly gauge-inflow series exists for Himayat Sagar, streamflow is <strong>estimated</strong> using:</p>
          <div className="bg-slate-100 p-4 rounded-lg font-mono text-xs">
            <p>Q_core = P * C_runoff * A * 1e6 * 1e-3 / seconds_in_month</p>
            <p>Q_lag = 0.15 * P_lag1 * C_runoff * A * 1e6 * 1e-3 / seconds_in_month</p>
            <p>evap_factor = 1 - 0.005 * (T - 30)</p>
            <p>humidity_factor = 1 + 0.002 * (RH - 50)</p>
            <p>Q = max(Q_core * evap_factor * humidity_factor + Q_lag, 0.1)</p>
          </div>
          <p>Where: P = precipitation (mm), C_runoff = seasonal runoff coefficient, A = 1350 km2, T = temperature (C), RH = humidity (%)</p>

          <h4 className="font-semibold mt-4">Seasonal Runoff Coefficients</h4>
          <div className="grid grid-cols-6 gap-2">
            {RUNOFF_COEFFICIENTS.map((r) => (
              <div key={r.month} className="text-center p-2 bg-slate-50 rounded">
                <div className="text-xs text-muted-foreground">{r.month}</div>
                <div className="font-semibold">{r.coeff}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Specifications */}
      <Card>
        <CardHeader><CardTitle>Model Specifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <h4 className="font-semibold text-sm">Precipitation Models</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Hyperparameters</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRECIP_MODELS.map((m) => (
                <TableRow key={m.name}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell className="text-xs font-mono">{m.params}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <h4 className="font-semibold text-sm mt-4">Streamflow Models</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Hyperparameters</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {STREAM_MODELS.map((m) => (
                <TableRow key={m.name}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell className="text-xs font-mono">{m.params}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">All models use SimpleImputer(strategy=median) for missing values. StandardScaler applied to Linear Regression and SVR.</p>
        </CardContent>
      </Card>

      {/* Evaluation Metrics */}
      <Card>
        <CardHeader><CardTitle>Evaluation Metrics</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div><strong>RMSE</strong> (Root Mean Square Error): sqrt(mean((y - y_hat)^2)). Lower is better.</div>
          <div><strong>MAE</strong> (Mean Absolute Error): mean(|y - y_hat|). Lower is better.</div>
          <div><strong>R2</strong> (Coefficient of Determination): 1 - SS_res/SS_tot. Higher is better (max 1.0).</div>
          <div><strong>NSE</strong> (Nash-Sutcliffe Efficiency): 1 - sum((y - y_hat)^2) / sum((y - y_mean)^2). Standard in hydrology. Values above 0.5 are considered acceptable; above 0.7 good; above 0.9 excellent.</div>
        </CardContent>
      </Card>

      {/* Limitations */}
      <Card>
        <CardHeader><CardTitle>Limitations</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-2">
            <li>Streamflow is <strong>synthetic</strong> (rainfall-runoff estimate), not observed gauge data</li>
            <li>Future projections use a <strong>single climate model</strong> (EC_Earth3P_HR) - results may vary with different models or scenarios</li>
            <li>Historical data is from <strong>gridded reanalysis</strong>, not point observations</li>
            <li>ML models may <strong>underperform on extreme events</strong>, which are inherently difficult to predict</li>
            <li>The rainfall-runoff formulation uses <strong>simplified assumptions</strong> about catchment response</li>
          </ul>
        </CardContent>
      </Card>

      {/* Downloads */}
      <Card>
        <CardHeader><CardTitle>Data Downloads</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {CSV_FILES.map((file) => (
              <a
                key={file}
                href={`${API_BASE}/api/download/${file}`}
                className="flex items-center gap-2 p-2 rounded border hover:bg-slate-50 text-sm transition-colors"
              >
                <Download className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{file}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
