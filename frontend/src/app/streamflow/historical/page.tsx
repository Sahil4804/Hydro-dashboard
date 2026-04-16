"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { COLORS, SEASON_COLORS, MONTH_NAMES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Area, Legend, Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StreamHistoricalPage() {
  const { data: monthly, isLoading: l1, error: e1 } = useApi<any[]>("/api/streamflow/historical/monthly");
  const { data: climatology, isLoading: l2, error: e2 } = useApi<any[]>("/api/streamflow/historical/climatology");
  const { data: annual, isLoading: l3, error: e3 } = useApi<any[]>("/api/streamflow/historical/annual");
  const { data: flowDuration, isLoading: l4, error: e4 } = useApi<any>("/api/streamflow/historical/flow-duration");
  const { data: runoff, isLoading: l5, error: e5 } = useApi<any>("/api/streamflow/historical/runoff-analysis");
  const { data: correlation, isLoading: l6, error: e6 } = useApi<any>("/api/streamflow/historical/correlation");

  if ((l1 || l2 || l3 || l4 || l5 || l6) && !(e1 || e2 || e3 || e4 || e5 || e6)) return <PageSkeleton />;

  // FDC data
  const fdcData = (flowDuration?.flow || []).map((f: number, i: number) => ({
    exceedance: flowDuration.exceedance_pct[i],
    flow: f,
  }));

  // Scatter data: precip vs streamflow
  const scatterData = (monthly || []).map((d: any) => ({
    precip: d.precip_mm,
    streamflow: d.streamflow_m3s,
    season: d.season,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Streamflow - Historical Analysis</h1>
        <p className="text-sm text-muted-foreground">Estimated monthly streamflow via rainfall-runoff formulation (1985-2024)</p>
        <Badge variant="outline" className="mt-2 text-amber-700 border-amber-300 bg-amber-50">
          Note: Streamflow is estimated using a physically-informed rainfall-runoff model, not observed gauge data.
        </Badge>
      </div>

      {/* Streamflow Time Series */}
      <ChartCard title="Monthly Streamflow Time Series" description="1985-2024">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthly || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 4)} tick={{ fontSize: 10 }} interval={48} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip labelFormatter={(d) => d} formatter={(v: any) => `${v?.toFixed(2)} m3/s`} contentStyle={{ fontSize: 12 }} />
            <Area dataKey="streamflow_m3s" fill={COLORS.streamflowLight} stroke={COLORS.streamflow} fillOpacity={0.4} strokeWidth={0.8} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Climatology */}
        <ChartCard title="Monthly Streamflow & Precipitation Climatology">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={climatology || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tickFormatter={(m) => MONTH_NAMES[m - 1]} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: "mm", angle: 90, position: "insideRight", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(m) => MONTH_NAMES[m - 1]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="right" dataKey="precip_mean" name="Precipitation (mm)" fill={COLORS.precipitationLight} opacity={0.6} />
              <Line yAxisId="left" dataKey="streamflow_mean" name="Streamflow (m3/s)" stroke={COLORS.streamflow} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Annual Streamflow */}
        <ChartCard title="Annual Mean Streamflow">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={annual || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="mean_streamflow" name="Mean Streamflow" fill={COLORS.streamflow} opacity={0.7} />
              <Line dataKey="moving_avg_5yr" name="5-yr Moving Avg" stroke={COLORS.temperature} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Flow Duration Curve */}
        <ChartCard title="Flow Duration Curve" description={`Q10: ${flowDuration?.q10?.toFixed(3)} m3/s | Q90: ${flowDuration?.q90?.toFixed(3)} m3/s`}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={fdcData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="exceedance" tick={{ fontSize: 10 }} label={{ value: "Exceedance %", position: "insideBottom", offset: -5, style: { fontSize: 10 } }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => `${v.toFixed(3)} m3/s`} />
              <Line dataKey="flow" stroke={COLORS.streamflow} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Rainfall-Runoff Scatter */}
        <ChartCard title="Precipitation vs Streamflow" description="Colored by season">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="precip" name="Precipitation" tick={{ fontSize: 10 }} label={{ value: "mm", position: "insideBottom", offset: -5, style: { fontSize: 10 } }} />
              <YAxis dataKey="streamflow" name="Streamflow" tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Scatter data={scatterData} fill={COLORS.streamflow}>
                {scatterData.map((entry: any, i: number) => (
                  <Cell key={i} fill={SEASON_COLORS[entry.season] || COLORS.streamflow} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Runoff Coefficients */}
      <ChartCard title="Seasonal Runoff Coefficients" description="Used in streamflow construction">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={runoff?.coefficients || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="month" tickFormatter={(m) => MONTH_NAMES[m - 1]} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(m) => MONTH_NAMES[m - 1]} />
            <Bar dataKey="coefficient" name="Runoff Coefficient" fill={COLORS.streamflow} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Correlation Heatmap */}
      <ChartCard title="Correlation Matrix" description="Streamflow vs. climate predictors">
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                <th className="p-2"></th>
                {(correlation?.columns || []).map((col: string) => (
                  <th key={col} className="p-2 text-center font-medium">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(correlation?.columns || []).map((row: string, i: number) => (
                <tr key={row}>
                  <td className="p-2 font-medium">{row}</td>
                  {(correlation?.values?.[i] || []).map((val: number, j: number) => (
                    <td key={j} className="p-2 text-center" style={{
                      backgroundColor: val > 0 ? `rgba(70,130,180,${Math.abs(val) * 0.5})` : `rgba(239,68,68,${Math.abs(val) * 0.5})`,
                    }}>
                      {val?.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
