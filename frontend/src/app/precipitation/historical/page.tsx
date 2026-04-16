"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { COLORS, SEASON_COLORS, MONTH_NAMES } from "@/lib/constants";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, Cell, ComposedChart, Area,
  ReferenceLine,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PrecipHistoricalPage() {
  const { data: monthly, isLoading: l1, error: e1 } = useApi<any[]>("/api/precip/historical/monthly");
  const { data: climatology, isLoading: l2, error: e2 } = useApi<any[]>("/api/precip/historical/climatology");
  const { data: annualData, isLoading: l3, error: e3 } = useApi<any>("/api/precip/historical/annual");
  const { data: decadal, isLoading: l4, error: e4 } = useApi<any[]>("/api/precip/historical/decadal");
  const { data: extremes, isLoading: l5, error: e5 } = useApi<any>("/api/precip/historical/extremes");
  const { data: anomalies, isLoading: l6, error: e6 } = useApi<any>("/api/precip/historical/anomalies");
  const { data: seasonal, isLoading: l7, error: e7 } = useApi<any>("/api/precip/historical/seasonal");
  const { data: correlation, isLoading: l8, error: e8 } = useApi<any>("/api/precip/historical/correlation");

  const anyLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8;
  const anyError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8;

  if (anyLoading && !anyError) return <PageSkeleton />;

  const annual = annualData?.data || [];
  const trend = annualData?.trend;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precipitation - Historical Analysis</h1>
        <p className="text-sm text-muted-foreground">40 years of monthly rainfall data (1985-2024)</p>
      </div>

      {/* Monthly Time Series */}
      <ChartCard title="Monthly Precipitation Time Series" description="1985-2024">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={monthly || []}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 4)} tick={{ fontSize: 10 }} interval={48} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip labelFormatter={(d) => d} formatter={(v: any) => [`${v?.toFixed(1)} mm`]} contentStyle={{ fontSize: 12 }} />
            <Area dataKey="rain_mm" fill={COLORS.precipitationLight} stroke={COLORS.precipitation} fillOpacity={0.3} strokeWidth={0.8} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Climatology */}
        <ChartCard title="Monthly Climatology" description="Mean + Std Dev">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={climatology || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tickFormatter={(m) => MONTH_NAMES[m - 1]} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => `${v?.toFixed(1)} mm`} labelFormatter={(m) => MONTH_NAMES[m - 1]} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="mean" name="Mean Rainfall">
                {(climatology || []).map((entry: any, i: number) => (
                  <Cell key={i} fill={SEASON_COLORS[entry.season] || COLORS.precipitation} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Annual Totals */}
        <ChartCard title="Annual Precipitation" description={trend ? `Trend: ${trend.slope > 0 ? "+" : ""}${trend.slope} mm/yr (R2=${trend.r2})` : ""}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={annual}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total_rain_mm" name="Annual Rain (mm)" fill={COLORS.precipitation} opacity={0.7} />
              <Line dataKey="moving_avg_5yr" name="5-yr Moving Avg" stroke={COLORS.temperature} strokeWidth={2} dot={false} />
              <Line dataKey="trend_line" name="Trend" stroke="#6b7280" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
              <ReferenceLine y={annual[0]?.long_term_mean} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: "Mean", fontSize: 10, position: "right" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Decadal Stats Table */}
      <ChartCard title="Decadal Statistics">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Decade</TableHead>
              <TableHead>Mean (mm)</TableHead>
              <TableHead>Median</TableHead>
              <TableHead>Std Dev</TableHead>
              <TableHead>Min</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>CV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(decadal || []).map((row: any) => (
              <TableRow key={row.decade}>
                <TableCell className="font-medium">{row.decade_label}</TableCell>
                <TableCell>{row.mean?.toFixed(1)}</TableCell>
                <TableCell>{row.median?.toFixed(1)}</TableCell>
                <TableCell>{row.std?.toFixed(1)}</TableCell>
                <TableCell>{row.min?.toFixed(1)}</TableCell>
                <TableCell>{row.max?.toFixed(1)}</TableCell>
                <TableCell>{row.cv?.toFixed(3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monsoon Contribution */}
        <ChartCard title="Monsoon Contribution Over Time" description="Fraction of annual rainfall from Jun-Sep">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={seasonal?.monsoon_trend || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => `${(v * 100).toFixed(1)}%`} contentStyle={{ fontSize: 12 }} />
              <Line dataKey="monsoon_fraction" stroke={SEASON_COLORS.Monsoon} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Anomaly Chart */}
        <ChartCard title="Annual Precipitation Anomaly" description="Deviation from long-term mean">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={anomalies?.annual || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: any) => `${v?.toFixed(1)} mm`} contentStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#000" />
              <Bar dataKey="anomaly" name="Anomaly (mm)">
                {(anomalies?.annual || []).map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.anomaly >= 0 ? COLORS.positive : COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Extremes */}
      <Tabs defaultValue="wet">
        <TabsList>
          <TabsTrigger value="wet">Top 10 Wettest Months</TabsTrigger>
          <TabsTrigger value="dry">Top 10 Driest Months</TabsTrigger>
          <TabsTrigger value="boxplot">Monthly Distribution</TabsTrigger>
        </TabsList>
        <TabsContent value="wet">
          <ChartCard title="Top 10 Wettest Months">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Rainfall (mm)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(extremes?.top_wet || []).map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.rain_mm?.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ChartCard>
        </TabsContent>
        <TabsContent value="dry">
          <ChartCard title="Top 10 Driest Months (Non-Zero)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Rainfall (mm)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(extremes?.top_dry || []).map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.rain_mm?.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ChartCard>
        </TabsContent>
        <TabsContent value="boxplot">
          <ChartCard title="Monthly Rainfall Distribution" description="Min, Q1, Median, Q3, Max">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={extremes?.box_data || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tickFormatter={(m) => MONTH_NAMES[m - 1]} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(m) => MONTH_NAMES[m - 1]} />
                <Bar dataKey="q3" name="Q3" fill={COLORS.precipitationLight} />
                <Bar dataKey="median" name="Median" fill={COLORS.precipitation} />
                <Bar dataKey="q1" name="Q1" fill={COLORS.precipitationLight} opacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>
      </Tabs>

      {/* Correlation Heatmap */}
      <ChartCard title="Correlation Matrix" description="Rainfall vs. climate predictors">
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
                    <td
                      key={j}
                      className="p-2 text-center"
                      style={{
                        backgroundColor: val > 0
                          ? `rgba(59,130,246,${Math.abs(val) * 0.5})`
                          : `rgba(239,68,68,${Math.abs(val) * 0.5})`,
                      }}
                    >
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
