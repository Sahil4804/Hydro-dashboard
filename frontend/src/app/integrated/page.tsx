"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageSkeleton } from "@/components/dashboard/loading-skeleton";
import { COLORS, MONTH_NAMES } from "@/lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend, Cell,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, AlertTriangle, Droplets, Waves } from "lucide-react";
import { DataGuard } from "@/components/dashboard/data-guard";

export default function IntegratedPage() {
  return <DataGuard><IntegratedContent /></DataGuard>;
}

function IntegratedContent() {
  const { data: waterBudget, isLoading: l1, error: e1 } = useApi<any[]>("/api/integrated/water-budget");
  const { data: distributions, isLoading: l2, error: e2 } = useApi<any>("/api/integrated/distribution-comparison");
  const { data: risk, isLoading: l3, error: e3 } = useApi<any>("/api/integrated/risk-assessment");
  const { data: trends, isLoading: l4, error: e4 } = useApi<any[]>("/api/integrated/trends-summary");

  if ((l1 || l2 || l3 || l4) && !(e1 || e2 || e3 || e4)) return <PageSkeleton />;

  const histBudget = (waterBudget || []).filter((d: any) => d.type === "historical");
  const projBudget = (waterBudget || []).filter((d: any) => d.type === "projected");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrated Analysis</h1>
        <p className="text-sm text-muted-foreground">Cross-cutting analysis combining precipitation, streamflow, and climate variables</p>
      </div>

      {/* Risk KPIs */}
      {risk && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard
            title="Hist. Dry Months"
            value={risk.historical?.dry_months}
            subtitle={`of ${risk.historical?.total_months} total`}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <KpiCard
            title="Hist. Wet Months"
            value={risk.historical?.wet_months}
            subtitle={`> P75 (${risk.thresholds?.precip_p75?.toFixed(0)} mm)`}
            icon={<Droplets className="h-5 w-5" />}
          />
          {risk.projected && (
            <>
              <KpiCard
                title="Proj. Dry Months"
                value={risk.projected?.dry_months}
                subtitle={`of ${risk.projected?.total_months} total`}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <KpiCard
                title="Proj. Wet Months"
                value={risk.projected?.wet_months}
                subtitle={`> P75 threshold`}
                icon={<Droplets className="h-5 w-5" />}
              />
            </>
          )}
        </div>
      )}

      {/* Water Budget */}
      <ChartCard title="Annual Water Budget (Historical)" description="Precipitation volume vs Streamflow volume vs Losses">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={histBudget}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: "MCM", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="precip_volume_mcm" name="Precipitation Vol" fill={COLORS.precipitation} opacity={0.6} />
            <Bar dataKey="streamflow_volume_mcm" name="Streamflow Vol" fill={COLORS.streamflow} opacity={0.8} />
            <Line dataKey="losses_mcm" name="Losses (ET+Inf)" stroke={COLORS.temperature} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Distribution Comparison */}
      {distributions && (
        <ChartCard title="Distribution Comparison: Historical vs Projected">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variable</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Mean</TableHead>
                  <TableHead>Std Dev</TableHead>
                  <TableHead>P5</TableHead>
                  <TableHead>P25</TableHead>
                  <TableHead>P50</TableHead>
                  <TableHead>P75</TableHead>
                  <TableHead>P95</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(distributions).map(([name, data]: [string, any]) => (
                  <>
                    <TableRow key={`${name}-hist`}>
                      <TableCell className="font-medium" rowSpan={data.projected ? 2 : 1}>{name}</TableCell>
                      <TableCell>Historical</TableCell>
                      <TableCell>{data.historical?.mean?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.std?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.p5?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.p25?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.p50?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.p75?.toFixed(2)}</TableCell>
                      <TableCell>{data.historical?.p95?.toFixed(2)}</TableCell>
                    </TableRow>
                    {data.projected && (
                      <TableRow key={`${name}-proj`}>
                        <TableCell>Projected</TableCell>
                        <TableCell>{data.projected?.mean?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.std?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.p5?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.p25?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.p50?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.p75?.toFixed(2)}</TableCell>
                        <TableCell>{data.projected?.p95?.toFixed(2)}</TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </ChartCard>
      )}

      {/* Trends Summary */}
      <ChartCard title="Projected Trends Summary" description="All variables: historical vs projected means">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variable</TableHead>
              <TableHead>Historical Mean</TableHead>
              <TableHead>Projected Mean</TableHead>
              <TableHead>Absolute Change</TableHead>
              <TableHead>% Change</TableHead>
              <TableHead>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(trends || []).map((row: any) => (
              <TableRow key={row.variable}>
                <TableCell className="font-medium">{row.variable}</TableCell>
                <TableCell>{row.historical_mean?.toFixed(3)}</TableCell>
                <TableCell>{row.projected_mean?.toFixed(3)}</TableCell>
                <TableCell className={row.absolute_change >= 0 ? "text-blue-600" : "text-red-600"}>
                  {row.absolute_change >= 0 ? "+" : ""}{row.absolute_change?.toFixed(3)}
                </TableCell>
                <TableCell className={row.percent_change >= 0 ? "text-blue-600" : "text-red-600"}>
                  {row.percent_change != null ? `${row.percent_change >= 0 ? "+" : ""}${row.percent_change}%` : "N/A"}
                </TableCell>
                <TableCell>
                  {row.trend === "up" ? <TrendingUp className="h-4 w-4 text-blue-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartCard>

      {/* Projected Water Budget */}
      {projBudget.length > 0 && (
        <ChartCard title="Projected Water Budget (2025-2050)" description="Under climate model projections">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={projBudget}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "MCM", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="precip_volume_mcm" name="Precipitation Vol" fill={COLORS.precipitation} opacity={0.6} />
              <Bar dataKey="streamflow_volume_mcm" name="Streamflow Vol" fill={COLORS.streamflow} opacity={0.8} />
              <Line dataKey="losses_mcm" name="Losses" stroke={COLORS.temperature} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
