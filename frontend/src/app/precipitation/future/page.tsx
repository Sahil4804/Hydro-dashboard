"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { COLORS, SEASON_COLORS, MONTH_NAMES } from "@/lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Area, ReferenceLine, Legend, Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PrecipFuturePage() {
  const { data: futMonthly, isLoading: l1, error: e1 } = useApi<any[]>("/api/precip/future/monthly");
  const { data: futAnnual, isLoading: l2, error: e2 } = useApi<any[]>("/api/precip/future/annual");
  const { data: changeData, isLoading: l3, error: e3 } = useApi<any>("/api/precip/future/change");
  const { data: histMonthly, isLoading: l4, error: e4 } = useApi<any[]>("/api/precip/historical/monthly");
  const { data: futClimatology, isLoading: l5, error: e5 } = useApi<any[]>("/api/precip/future/climatology");
  const { data: histClimatology, isLoading: l6, error: e6 } = useApi<any[]>("/api/precip/historical/climatology");

  if ((l1 || l2 || l3 || l4 || l5 || l6) && !(e1 || e2 || e3 || e4 || e5 || e6)) return <PageSkeleton />;

  // Combined timeline
  const combined = [
    ...(histMonthly || []).map((d: any) => ({ date: d.date, value: d.rain_mm, type: "historical" })),
    ...(futMonthly || []).filter((d: any) => d.predicted_rain_mm != null).map((d: any) => ({ date: d.date, value: d.predicted_rain_mm, type: "projected" })),
  ];

  // Historical annual for reference
  const histAnnualMean = (histMonthly || []).reduce((acc: number, d: any) => acc + (d.rain_mm || 0), 0) / 40;

  // Side-by-side climatology
  const climatologyComparison = (changeData?.monthly || []).map((d: any) => ({
    month: MONTH_NAMES[d.month - 1],
    historical: d.historical_mean,
    projected: d.projected_mean,
    change_pct: d.percent_change,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precipitation - Future Projections</h1>
        <p className="text-sm text-muted-foreground">2025-2050 projections using EC_Earth3P_HR climate model</p>
      </div>

      {/* Full Timeline */}
      <ChartCard title="Historical + Projected Monthly Precipitation" description="1985-2050">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={combined}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 4)} tick={{ fontSize: 10 }} interval={48} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(d) => d} formatter={(v: any) => `${v?.toFixed(1)} mm`} />
            <ReferenceLine x="2025-01-01" stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "Projection Start", fontSize: 10, position: "top" }} />
            <Area dataKey="value" fill={COLORS.precipitationLight} stroke={COLORS.precipitation} fillOpacity={0.3} strokeWidth={0.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Annual Projections */}
        <ChartCard title="Projected Annual Precipitation" description="2025-2050">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={futAnnual || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="predicted_rain_mm" name="Projected (mm)" fill={COLORS.projected} opacity={0.7} />
              <ReferenceLine y={histAnnualMean} stroke={COLORS.historical} strokeDasharray="5 5" label={{ value: "Hist. Mean", fontSize: 10, position: "right" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Climatology Comparison */}
        <ChartCard title="Monthly Climatology: Historical vs Projected">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={climatologyComparison}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="historical" name="Historical Mean" fill={COLORS.historical} opacity={0.6} />
              <Bar dataKey="projected" name="Projected Mean" fill={COLORS.projected} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Change Analysis Table */}
      <ChartCard title="Monthly Change Analysis" description="Projected vs Historical">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Historical Mean (mm)</TableHead>
              <TableHead>Projected Mean (mm)</TableHead>
              <TableHead>Absolute Change</TableHead>
              <TableHead>% Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(changeData?.monthly || []).map((row: any) => (
              <TableRow key={row.month}>
                <TableCell className="font-medium">{MONTH_NAMES[row.month - 1]}</TableCell>
                <TableCell>{row.historical_mean?.toFixed(1)}</TableCell>
                <TableCell>{row.projected_mean?.toFixed(1)}</TableCell>
                <TableCell className={row.absolute_change >= 0 ? "text-blue-600" : "text-red-600"}>
                  {row.absolute_change >= 0 ? "+" : ""}{row.absolute_change?.toFixed(1)}
                </TableCell>
                <TableCell className={row.percent_change >= 0 ? "text-blue-600" : "text-red-600"}>
                  {row.percent_change >= 0 ? "+" : ""}{row.percent_change}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartCard>

      {/* Seasonal Change */}
      {changeData?.seasonal && (
        <ChartCard title="Seasonal Change Analysis">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Historical Mean (mm)</TableHead>
                <TableHead>Projected Mean (mm)</TableHead>
                <TableHead>% Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(changeData.seasonal || []).map((row: any) => (
                <TableRow key={row.season}>
                  <TableCell className="font-medium">{row.season}</TableCell>
                  <TableCell>{row.historical_mean?.toFixed(1)}</TableCell>
                  <TableCell>{row.projected_mean?.toFixed(1)}</TableCell>
                  <TableCell className={row.percent_change >= 0 ? "text-blue-600" : "text-red-600"}>
                    {row.percent_change >= 0 ? "+" : ""}{row.percent_change}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>
      )}
    </div>
  );
}
