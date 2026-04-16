"use client";

import { useState } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine, Area, AreaChart, Legend,
} from "recharts";
import { Mountain, AlertTriangle, Info, TrendingDown } from "lucide-react";
import { API_BASE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RusleFactors {
  R: number; K: number; LS: number; C: number; P: number;
}

interface ZoneContrib {
  lulc_class: string;
  area_pct: number;
  area_km2: number;
  gross_erosion_t_ha_yr: number;
  syi_t_ha_yr: number;
  syi_class: string;
  syi_color: string;
  color: string;
}

interface SedimentData {
  rusle_factors: RusleFactors;
  gross_erosion_t_ha_yr: number;
  sdr: number;
  syi_t_ha_yr: number;
  syi_total_t_yr: number;
  syi_class: string;
  syi_color: string;
  trapped_t_yr: number;
  trapped_m3_yr: number;
  trapped_mm3_yr: number;
  trap_efficiency: number;
  years_to_50pct_storage_loss: number | null;
  reservoir_live_storage_mm3: number;
  annual_precip_mm_used: number;
  zone_contributions: ZoneContrib[];
  sources: string[];
}

interface TrendPoint {
  year: number;
  capacity_mm3: number;
  capacity_pct: number;
  cumulative_loss_mm3: number;
}

interface TrendData {
  annual_silt_accretion_mm3: number;
  annual_silt_accretion_m3: number;
  commission_year: number;
  gross_capacity_at_commission_mm3: number;
  estimated_current_capacity_mm3: number;
  estimated_capacity_loss_pct: number;
  half_capacity_year: number | null;
  survey_points: { year: number; capacity_mm3: number; source: string }[];
  timeline: TrendPoint[];
}

// ---------------------------------------------------------------------------
// SYI badge
// ---------------------------------------------------------------------------

function SyiBadge({ cls, color }: { cls: string; color: string }) {
  const light = color + "26"; // 15% opacity hex
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: light, color }}
    >
      {cls}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RUSLE factor card
// ---------------------------------------------------------------------------

function RusleFactorRow({ label, value, unit, note }: { label: string; value: number | string; unit?: string; note: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400">{note}</p>
      </div>
      <span className="text-sm font-mono font-bold text-slate-800">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-[10px] font-normal text-slate-400 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SedimentYieldPage() {
  const [precipInput, setPrecipInput] = useState("724");
  const [syiData, setSyiData] = useState<SedimentData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSyi = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/lulc/sediment-yield`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annual_precip_mm: parseFloat(precipInput) || 724 }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setSyiData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrend = async () => {
    setTrendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/lulc/sedimentation-trend`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setTrendData(await res.json());
    } catch {
      // non-critical
    } finally {
      setTrendLoading(false);
    }
  };

  // Auto-fetch on first render
  if (!syiData && !loading && !error) {
    fetchSyi();
    fetchTrend();
  }

  // Decimate timeline to every 5 years for chart
  const trendChartData = trendData?.timeline.filter((_, i) => i % 5 === 0) ?? [];

  return (
    <main className="ml-64 min-h-screen bg-slate-50">
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Mountain className="h-5 w-5 text-sky-500" />
            Sediment Yield Index (SYI) — Silt Load Zones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            RUSLE-based catchment erosion and reservoir sedimentation analysis | Himayat Sagar
          </p>
        </div>

        {/* Rainfall input */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Annual Rainfall (mm) — used to scale RUSLE R-factor
                </label>
                <p className="text-[10px] text-slate-400">
                  Default: 724 mm (historical mean 1985–2024)
                </p>
                <input
                  type="number"
                  value={precipInput}
                  onChange={(e) => setPrecipInput(e.target.value)}
                  className="w-40 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
                  min={200}
                  max={3000}
                />
              </div>
              <Button size="sm" className="text-xs mb-0.5" onClick={fetchSyi} disabled={loading}>
                {loading ? "Computing..." : "Recalculate"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="text-sm text-slate-400 py-8 text-center">Computing sediment yield...</div>
        )}

        {syiData && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Gross Erosion"
                value={`${syiData.gross_erosion_t_ha_yr} t/ha/yr`}
                subtitle="RUSLE gross soil loss"
                icon={<Mountain className="h-5 w-5" />}
              />
              <KpiCard
                title="Sediment Delivery Ratio"
                value={`${(syiData.sdr * 100).toFixed(1)}%`}
                subtitle="Vanoni (1975) area-based SDR"
                icon={<TrendingDown className="h-5 w-5" />}
              />
              <KpiCard
                title="SYI (Catchment Mean)"
                value={`${syiData.syi_t_ha_yr} t/ha/yr`}
                subtitle={syiData.syi_class}
                icon={<Info className="h-5 w-5" />}
              />
              <KpiCard
                title="Annual Reservoir Trap"
                value={`${(syiData.trapped_m3_yr / 1000).toFixed(0)} × 10³ m³`}
                subtitle={`Trap efficiency: ${(syiData.trap_efficiency * 100).toFixed(0)}%`}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
            </div>

            {/* Overall SYI class banner */}
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Catchment SYI Classification
                    </p>
                    <div className="flex items-center gap-3">
                      <SyiBadge cls={syiData.syi_class} color={syiData.syi_color} />
                      <span className="text-sm text-slate-600">
                        {syiData.syi_t_ha_yr} t/ha/yr — {syiData.syi_total_t_yr.toLocaleString()} t/yr total
                      </span>
                    </div>
                    {syiData.years_to_50pct_storage_loss && (
                      <p className="text-xs text-slate-500 mt-1.5">
                        At current rate, 50% live storage loss projected by ~{
                          2024 + Math.round(syiData.years_to_50pct_storage_loss)
                        } (in {Math.round(syiData.years_to_50pct_storage_loss)} years).
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Trapped sediment: {syiData.trapped_mm3_yr.toFixed(4)} Mm³/yr</p>
                    <p>Rainfall used: {syiData.annual_precip_mm_used} mm</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Zone contributions chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard
                title="SYI by Land Use Zone"
                description="Sediment yield index per LULC class (t/ha/yr)"
              >
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={syiData.zone_contributions}
                    layout="vertical"
                    margin={{ left: 4, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} label={{ value: "t/ha/yr", position: "insideBottom", offset: -2, fontSize: 11 }} />
                    <YAxis type="category" dataKey="lulc_class" width={168} tick={{ fontSize: 9.5 }} />
                    <Tooltip
                      formatter={(v: any) => [`${v} t/ha/yr`, "SYI"]}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="syi_t_ha_yr" radius={[0, 3, 3, 0]}>
                      {syiData.zone_contributions.map((z) => (
                        <Cell key={z.lulc_class} fill={z.syi_color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* RUSLE factors */}
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">RUSLE Equation Parameters</CardTitle>
                  <CardDescription className="text-xs">A = R × K × LS × C × P</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <RusleFactorRow
                    label="R — Rainfall Erosivity"
                    value={syiData.rusle_factors.R}
                    unit="MJ·mm/ha·h·yr"
                    note="Scaled to input rainfall; base 800 for Telangana"
                  />
                  <RusleFactorRow
                    label="K — Soil Erodibility"
                    value={syiData.rusle_factors.K}
                    unit="t·ha·h/ha·MJ·mm"
                    note="Black cotton soil (Vertisol) — Deccan Plateau"
                  />
                  <RusleFactorRow
                    label="LS — Slope-Length-Steepness"
                    value={syiData.rusle_factors.LS}
                    note="Catchment-average, DEM-derived"
                  />
                  <RusleFactorRow
                    label="C — Cover-Management"
                    value={syiData.rusle_factors.C}
                    note="Weighted composite from LULC classes"
                  />
                  <RusleFactorRow
                    label="P — Support Practice"
                    value={syiData.rusle_factors.P}
                    note="Contour farming and partial bunding in place"
                  />
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Gross Erosion A</span>
                      <span className="text-sm font-bold font-mono text-slate-800">
                        {syiData.gross_erosion_t_ha_yr} t/ha/yr
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-500">After SDR ({(syiData.sdr * 100).toFixed(1)}%)</span>
                      <span className="text-sm font-bold font-mono" style={{ color: syiData.syi_color }}>
                        {syiData.syi_t_ha_yr} t/ha/yr
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Zone table */}
            <ChartCard
              title="Silt Load Zone Classification — by Land Use"
              description="Per-class sediment yield and CWC (2010) severity classification"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left py-2 pr-3 font-medium">LULC Class</th>
                      <th className="text-right py-2 px-3 font-medium">Area (%)</th>
                      <th className="text-right py-2 px-3 font-medium">Area (km²)</th>
                      <th className="text-right py-2 px-3 font-medium">Gross Erosion (t/ha/yr)</th>
                      <th className="text-right py-2 px-3 font-medium">SYI (t/ha/yr)</th>
                      <th className="text-center py-2 pl-3 font-medium">Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syiData.zone_contributions.map((z) => (
                      <tr key={z.lulc_class} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: z.color }} />
                            <span className="font-medium text-slate-700">{z.lulc_class}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3 text-slate-600">{z.area_pct.toFixed(1)}</td>
                        <td className="text-right py-2 px-3 text-slate-600">{z.area_km2.toFixed(0)}</td>
                        <td className="text-right py-2 px-3 font-mono text-slate-700">{z.gross_erosion_t_ha_yr.toFixed(2)}</td>
                        <td className="text-right py-2 px-3 font-mono font-semibold" style={{ color: z.syi_color }}>
                          {z.syi_t_ha_yr.toFixed(3)}
                        </td>
                        <td className="py-2 pl-3 text-center">
                          <SyiBadge cls={z.syi_class} color={z.syi_color} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            {/* SYI colour legend */}
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                  SYI Classification Scale — CWC Reservoir Sedimentation Manual (2010)
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Very Low", range: "0–2 t/ha/yr", color: "#22c55e" },
                    { label: "Low", range: "2–5 t/ha/yr", color: "#86efac" },
                    { label: "Moderate", range: "5–10 t/ha/yr", color: "#fde047" },
                    { label: "High", range: "10–20 t/ha/yr", color: "#fb923c" },
                    { label: "Very High", range: "20–50 t/ha/yr", color: "#ef4444" },
                    { label: "Severe", range: ">50 t/ha/yr", color: "#7f1d1d" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5 text-xs">
                      <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                      <span className="font-medium text-slate-700">{s.label}</span>
                      <span className="text-slate-400">{s.range}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sources */}
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  References and Standards
                </p>
                <ul className="space-y-1">
                  {syiData.sources.map((s, i) => (
                    <li key={i} className="text-xs text-slate-500 flex gap-2">
                      <span className="text-slate-300">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}

        {/* Sedimentation trend (separate panel) */}
        {trendData && (
          <ChartCard
            title="Reservoir Capacity Loss — Sedimentation Trend (1927–2024)"
            description="Modelled cumulative storage loss from commission year. Survey anchor points shown as reference."
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendChartData} margin={{ right: 16 }}>
                <defs>
                  <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `${v.toFixed(2)}`}
                  label={{ value: "Capacity (Mm³)", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  formatter={(v: any, name: string) => [`${parseFloat(v).toFixed(3)} Mm³`, "Capacity"]}
                />
                {trendData.survey_points.map((sp) => (
                  <ReferenceLine
                    key={sp.year}
                    x={sp.year}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: `Survey ${sp.year}\n${sp.capacity_mm3} Mm³`, position: "top", fontSize: 9, fill: "#b45309" }}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="capacity_mm3"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#capGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 text-xs text-slate-400 text-right">
              Estimated capacity loss to date: {trendData.estimated_capacity_loss_pct.toFixed(2)}%
              {trendData.half_capacity_year && ` | 50% loss projected: ~${trendData.half_capacity_year}`}
            </div>
          </ChartCard>
        )}
      </div>
    </main>
  );
}
