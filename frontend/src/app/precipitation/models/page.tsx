"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { COLORS, MONTH_NAMES } from "@/lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine, ComposedChart,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const MODEL_COLORS: Record<string, string> = {
  "Linear Regression": "#6b7280",
  "Random Forest": "#22c55e",
  "HistGradientBoosting": "#f59e0b",
  Baseline: "#9ca3af",
};

export default function PrecipModelsPage() {
  const { data: cvSummary, isLoading: l1, error: e1 } = useApi<any[]>("/api/precip/models/cv-summary");
  const { data: cvFolds, isLoading: l2, error: e2 } = useApi<any[]>("/api/precip/models/cv-folds");
  const { data: testMetrics, isLoading: l3, error: e3 } = useApi<any[]>("/api/precip/models/test-metrics");
  const { data: testPreds, isLoading: l4, error: e4 } = useApi<any[]>("/api/precip/models/test-predictions");
  const { data: featureImp, isLoading: l5, error: e5 } = useApi<any[]>("/api/precip/models/feature-importance");
  const { data: residuals, isLoading: l6, error: e6 } = useApi<any[]>("/api/precip/models/residuals");

  if ((l1 || l2 || l3 || l4 || l5 || l6) && !(e1 || e2 || e3 || e4 || e5 || e6)) return <PageSkeleton />;

  const bestModel = testMetrics?.filter((m: any) => m.model !== "Baseline").sort((a: any, b: any) => b.r2 - a.r2)[0];
  const baseline = testMetrics?.find((m: any) => m.model === "Baseline");

  // Radar data
  const radarData = ["rmse", "mae", "r2", "nse"].map((metric) => {
    const row: any = { metric: metric.toUpperCase() };
    cvSummary?.forEach((m: any) => {
      row[m.model] = metric === "rmse" || metric === "mae" ? 1 / (1 + m[metric]) : m[metric];
    });
    return row;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precipitation - ML Model Performance</h1>
        <p className="text-sm text-muted-foreground">Comparing Linear Regression, Random Forest, and HistGradientBoosting</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="Best Model" value={bestModel?.model || ""} subtitle="Highest R2 on test set" />
        <KpiCard title="Test RMSE" value={bestModel?.rmse?.toFixed(2) || ""} subtitle={`Baseline: ${baseline?.rmse?.toFixed(2)}`} trend="down" trendValue={`${((1 - bestModel?.rmse / baseline?.rmse) * 100).toFixed(0)}% better`} />
        <KpiCard title="Test R2" value={bestModel?.r2?.toFixed(4) || ""} subtitle={`Baseline: ${baseline?.r2?.toFixed(4)}`} trend="up" trendValue={`+${((bestModel?.r2 - baseline?.r2) * 100).toFixed(1)} pts`} />
        <KpiCard title="Test NSE" value={bestModel?.nse?.toFixed(4) || ""} subtitle="Nash-Sutcliffe Efficiency" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CV Summary Table */}
        <ChartCard title="Cross-Validation Summary" description="5-fold time-series CV">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>RMSE</TableHead>
                <TableHead>MAE</TableHead>
                <TableHead>R2</TableHead>
                <TableHead>NSE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cvSummary || []).map((row: any) => (
                <TableRow key={row.model}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODEL_COLORS[row.model] }} />
                      {row.model}
                    </div>
                  </TableCell>
                  <TableCell>{row.rmse?.toFixed(2)}</TableCell>
                  <TableCell>{row.mae?.toFixed(2)}</TableCell>
                  <TableCell>{row.r2?.toFixed(4)}</TableCell>
                  <TableCell>{row.nse?.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>

        {/* Radar Chart */}
        <ChartCard title="Model Comparison Radar" description="Normalized metrics (higher = better)">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 8 }} />
              {(cvSummary || []).map((m: any) => (
                <Radar key={m.model} name={m.model} dataKey={m.model} stroke={MODEL_COLORS[m.model]} fill={MODEL_COLORS[m.model]} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Observed vs Predicted */}
      <ChartCard title="Observed vs Predicted (Test Period 2022-2024)" description="Monthly rainfall">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={testPreds || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Line dataKey="rain_mm" name="Observed" stroke={COLORS.historical} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line dataKey="baseline_pred" name="Baseline" stroke={MODEL_COLORS.Baseline} strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
            <Line dataKey="random_forest_pred" name="Random Forest" stroke={MODEL_COLORS["Random Forest"]} strokeWidth={2} dot={{ r: 2 }} />
            <Line dataKey="linear_regression_pred" name="Linear Regression" stroke={MODEL_COLORS["Linear Regression"]} strokeWidth={1.5} dot={false} />
            <Line dataKey="histgradientboosting_pred" name="HGB" stroke={MODEL_COLORS["HistGradientBoosting"]} strokeWidth={1.5} dot={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Feature Importance */}
        <ChartCard title="Feature Importance (Random Forest)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={featureImp || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 10 }} width={100} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="importance" fill={COLORS.precipitation} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Test Metrics Comparison */}
        <ChartCard title="Test Period Metrics" description="All models vs baseline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>RMSE</TableHead>
                <TableHead>MAE</TableHead>
                <TableHead>R2</TableHead>
                <TableHead>NSE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(testMetrics || []).map((row: any) => (
                <TableRow key={row.model}>
                  <TableCell className="font-medium">
                    {row.model}
                    {row.model === bestModel?.model && <Badge className="ml-2 text-[10px]" variant="secondary">Best</Badge>}
                  </TableCell>
                  <TableCell>{row.rmse?.toFixed(2)}</TableCell>
                  <TableCell>{row.mae?.toFixed(2)}</TableCell>
                  <TableCell>{row.r2?.toFixed(4)}</TableCell>
                  <TableCell>{row.nse?.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      </div>

      {/* Residuals */}
      <ChartCard title="Residuals Over Time (Best Model)" description="Observed - Predicted">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={residuals || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#000" />
            <Bar dataKey="random_forest_pred_residual" name="Residual (mm)">
              {(residuals || []).map((entry: any, i: number) => (
                <Cell key={i} fill={entry.random_forest_pred_residual >= 0 ? COLORS.positive : COLORS.negative} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
