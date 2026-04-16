"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CloudRain, Waves, Brain, TrendingUp, MapPin, Calendar, Loader2, Play } from "lucide-react";
import { COLORS, API_BASE } from "@/lib/constants";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, ComposedChart,
} from "recharts";

export default function OverviewPage() {
  const { data: status, mutate: mutateStatus } = useApi<any>("/api/pipeline/status");
  const { data: kpis, isLoading: kpisLoading } = useApi<any>(
    status?.ready ? "/api/overview/kpis" : null
  );
  const { data: timeline, isLoading: timelineLoading } = useApi<any>(
    status?.ready ? "/api/overview/timeline" : null
  );
  const [running, setRunning] = useState(false);

  const handleRunPipeline = async () => {
    setRunning(true);
    try {
      await fetch(`${API_BASE}/api/pipeline/run`, { method: "POST" });
      mutateStatus();
      window.location.reload();
    } catch (e) {
      console.error(e);
    }
    setRunning(false);
  };

  if (!status?.ready) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-6">
        <div className="text-center space-y-3">
          <CloudRain className="h-16 w-16 text-sky-500 mx-auto" />
          <h1 className="text-2xl font-bold">Himayat Sagar Hydroclimatic Dashboard</h1>
          <p className="text-muted-foreground max-w-md">
            ML-based precipitation and streamflow prediction for Himayat Sagar Dam, Hyderabad (1985-2050).
          </p>
          <p className="text-sm text-muted-foreground">
            {status?.running
              ? `Pipeline running: ${status.status}`
              : "Data pipeline needs to be initialized. This will fetch data from Open-Meteo and train all ML models."}
          </p>
        </div>
        <Button onClick={handleRunPipeline} disabled={running || status?.running} size="lg">
          {running || status?.running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Running Pipeline...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Initialize Data Pipeline
            </>
          )}
        </Button>
      </div>
    );
  }

  if (kpisLoading || timelineLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Himayat Sagar Hydroclimatic Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ML-Based Precipitation & Streamflow Prediction | {kpis?.hist_years} historical | {kpis?.future_years} projected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <MapPin className="h-3 w-3" />
            {kpis?.location?.lat}N, {kpis?.location?.lon}E
          </Badge>
          <Badge variant="secondary">{kpis?.climate_model}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Mean Annual Precipitation" value={`${kpis?.mean_annual_precip_mm} mm`} subtitle={kpis?.hist_years} icon={<CloudRain className="h-5 w-5" />} />
        <KpiCard title="Mean Annual Streamflow" value={`${kpis?.mean_annual_streamflow_m3s} m3/s`} subtitle={kpis?.hist_years} icon={<Waves className="h-5 w-5" />} />
        <KpiCard title="Best Precip Model" value={kpis?.best_precip_model || ""} subtitle={`R2 = ${kpis?.best_precip_r2}`} icon={<Brain className="h-5 w-5" />} />
        <KpiCard title="Best Streamflow Model" value={kpis?.best_streamflow_model || ""} subtitle={`R2 = ${kpis?.best_streamflow_r2}`} icon={<Brain className="h-5 w-5" />} />
        <KpiCard
          title="Projected Precip Change"
          value={kpis?.projected_precip_change_pct != null ? `${kpis.projected_precip_change_pct}%` : "N/A"}
          subtitle="vs historical mean"
          trend={kpis?.projected_precip_change_pct > 0 ? "up" : kpis?.projected_precip_change_pct < 0 ? "down" : "neutral"}
          trendValue={kpis?.projected_precip_change_pct != null ? `${kpis.projected_precip_change_pct > 0 ? "+" : ""}${kpis.projected_precip_change_pct}%` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Projected Streamflow Change"
          value={kpis?.projected_streamflow_change_pct != null ? `${kpis.projected_streamflow_change_pct}%` : "N/A"}
          subtitle="vs historical mean"
          trend={kpis?.projected_streamflow_change_pct > 0 ? "up" : kpis?.projected_streamflow_change_pct < 0 ? "down" : "neutral"}
          trendValue={kpis?.projected_streamflow_change_pct != null ? `${kpis.projected_streamflow_change_pct > 0 ? "+" : ""}${kpis.projected_streamflow_change_pct}%` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard title="Historical Data" value="40 Years" subtitle={kpis?.hist_years} icon={<Calendar className="h-5 w-5" />} />
        <KpiCard title="Projection Horizon" value="26 Years" subtitle={kpis?.future_years} icon={<Calendar className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Monthly Precipitation (1985-2050)" description="Historical + Projected">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timeline?.precipitation || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 4)} tick={{ fontSize: 10 }} interval={60} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip labelFormatter={(d) => d} formatter={(v: any) => [`${v?.toFixed(1)} mm`]} contentStyle={{ fontSize: 12 }} />
              <ReferenceLine x="2025-01-01" stroke="#9ca3af" strokeDasharray="4 4" />
              <Area dataKey="value" fill={COLORS.precipitationLight} stroke={COLORS.precipitation} fillOpacity={0.3} strokeWidth={0.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Streamflow (1985-2050)" description="Historical + Projected">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timeline?.streamflow || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 4)} tick={{ fontSize: 10 }} interval={60} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip labelFormatter={(d) => d} formatter={(v: any) => [`${v?.toFixed(2)} m3/s`]} contentStyle={{ fontSize: 12 }} />
              <ReferenceLine x="2025-01-01" stroke="#9ca3af" strokeDasharray="4 4" />
              <Area dataKey="value" fill={COLORS.streamflowLight} stroke={COLORS.streamflow} fillOpacity={0.3} strokeWidth={0.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
