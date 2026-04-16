"use client";

import { useState, useCallback } from "react";
import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DataGuard } from "@/components/dashboard/data-guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Layers, TreePine, AlertCircle, Info, RotateCcw } from "lucide-react";
import { API_BASE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LulcClass {
  name: string;
  area_pct: number;
  area_km2: number;
  cn2: number;
  rusle_c: number;
  description: string;
  color: string;
}

interface LulcData {
  classes: LulcClass[];
  total_area_km2: number;
  composite_cn2: number;
  retention_S_mm: number;
  composite_rusle_c: number;
  estimated_runoff_coeff: number;
  annual_rainfall_used_mm: number;
  sources: string[];
}

const DEFAULT_LULC_CLASSES = [
  "Agricultural Cropland",
  "Scrub / Degraded Forest",
  "Barren / Wasteland",
  "Built-up / Urban",
  "Grassland / Pasture",
  "Dense Forest",
  "Water Bodies",
];

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function LulcTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as LulcClass;
  return (
    <div className="bg-white border border-slate-200 rounded-md p-3 shadow-md text-xs max-w-[220px]">
      <p className="font-semibold text-slate-800 mb-1">{d.name}</p>
      <p className="text-slate-600">{d.area_pct.toFixed(1)}% — {d.area_km2.toFixed(0)} km²</p>
      <p className="text-slate-500 mt-1 text-[10px]">{d.description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario slider row
// ---------------------------------------------------------------------------

function ScenarioRow({
  cls,
  value,
  onChange,
}: {
  cls: LulcClass;
  value: number;
  onChange: (name: string, val: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ background: cls.color }}
      />
      <span className="text-xs text-slate-700 w-44 flex-shrink-0 truncate">{cls.name}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => onChange(cls.name, parseFloat(e.target.value))}
        className="flex-1 h-1.5 accent-sky-500"
      />
      <span className="text-xs font-mono text-slate-600 w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LulcPage() {
  const [scenarioMode, setScenarioMode] = useState(false);
  const [scenarioAreas, setScenarioAreas] = useState<Record<string, number>>({});
  const [scenarioData, setScenarioData] = useState<LulcData | null>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);

  // Base data fetch
  const { data: baseData, error, isLoading } = useApi<LulcData>("/api/lulc/composition");

  // Initialise scenario from base data
  const initScenario = useCallback(() => {
    if (!baseData) return;
    const areas: Record<string, number> = {};
    baseData.classes.forEach((c) => {
      areas[c.name] = c.area_pct;
    });
    setScenarioAreas(areas);
    setScenarioMode(true);
    setScenarioData(baseData);
  }, [baseData]);

  const handleScenarioChange = (name: string, val: number) => {
    setScenarioAreas((prev) => ({ ...prev, [name]: val }));
  };

  const runScenario = async () => {
    setScenarioLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/lulc/composition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areas: scenarioAreas }),
      });
      const json = await res.json();
      setScenarioData(json);
    } finally {
      setScenarioLoading(false);
    }
  };

  const resetScenario = () => {
    setScenarioMode(false);
    setScenarioData(null);
    setScenarioAreas({});
  };

  const display = scenarioData ?? baseData;

  return (
    <main className="ml-64 min-h-screen bg-slate-50">
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layers className="h-5 w-5 text-sky-500" />
              Land Use / Land Cover (LULC) Analysis
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Himayat Sagar catchment — 1,350 km² | Source: NRSC LULC50K 2019–21
            </p>
          </div>
          {!scenarioMode ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={initScenario}
              disabled={!baseData}
            >
              Run Scenario Analysis
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={resetScenario}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset to Observed
            </Button>
          )}
        </div>

        <DataGuard isLoading={isLoading} error={error}>
          {display && (
            <>
              {/* KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  title="Composite CN (AMC-II)"
                  value={display.composite_cn2}
                  subtitle="SCS curve number — catchment average"
                  icon={<TreePine className="h-5 w-5" />}
                />
                <KpiCard
                  title="RUSLE C-Factor"
                  value={display.composite_rusle_c.toFixed(4)}
                  subtitle="Weighted cover-management factor"
                  icon={<Layers className="h-5 w-5" />}
                />
                <KpiCard
                  title="Max Retention (S)"
                  value={`${display.retention_S_mm} mm`}
                  subtitle="Potential retention from CN"
                  icon={<Info className="h-5 w-5" />}
                />
                <KpiCard
                  title="Runoff Coefficient"
                  value={display.estimated_runoff_coeff.toFixed(3)}
                  subtitle={`At ${display.annual_rainfall_used_mm} mm annual rainfall`}
                  icon={<AlertCircle className="h-5 w-5" />}
                />
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pie chart */}
                <ChartCard
                  title="LULC Area Distribution"
                  description="Percentage area by land use class"
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={display.classes}
                        dataKey="area_pct"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, area_pct }) =>
                          area_pct > 4 ? `${area_pct.toFixed(1)}%` : ""
                        }
                        labelLine={false}
                      >
                        {display.classes.map((cls) => (
                          <Cell key={cls.name} fill={cls.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<LulcTooltip />} />
                      <Legend
                        formatter={(v) => (
                          <span className="text-xs text-slate-700">{v}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* CN bar chart */}
                <ChartCard
                  title="Curve Number by LULC Class"
                  description="SCS-CN (AMC-II) — higher values indicate greater runoff potential"
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={display.classes}
                      layout="vertical"
                      margin={{ left: 4, right: 24 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 11 }}
                        label={{ value: "CN (AMC-II)", position: "insideBottom", offset: -2, fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip
                        formatter={(v) => [`CN = ${v}`, "Curve Number"]}
                        labelStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="cn2" radius={[0, 3, 3, 0]}>
                        {display.classes.map((cls) => (
                          <Cell key={cls.name} fill={cls.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Detail table */}
              <ChartCard
                title="LULC Class Breakdown"
                description="Area, hydrological, and erosion parameters per class"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="text-left py-2 pr-4 font-medium">Land Use Class</th>
                        <th className="text-right py-2 px-3 font-medium">Area (%)</th>
                        <th className="text-right py-2 px-3 font-medium">Area (km²)</th>
                        <th className="text-right py-2 px-3 font-medium">CN (AMC-II)</th>
                        <th className="text-right py-2 px-3 font-medium">RUSLE C</th>
                        <th className="text-left py-2 pl-4 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.classes.map((cls) => (
                        <tr key={cls.name} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ background: cls.color }}
                              />
                              <span className="font-medium text-slate-700">{cls.name}</span>
                            </div>
                          </td>
                          <td className="text-right py-2 px-3 text-slate-600">{cls.area_pct.toFixed(1)}</td>
                          <td className="text-right py-2 px-3 text-slate-600">{cls.area_km2.toFixed(0)}</td>
                          <td className="text-right py-2 px-3">
                            <span
                              className="font-mono font-semibold"
                              style={{ color: cls.cn2 >= 80 ? "#b91c1c" : cls.cn2 >= 60 ? "#b45309" : "#15803d" }}
                            >
                              {cls.cn2}
                            </span>
                          </td>
                          <td className="text-right py-2 px-3 font-mono text-slate-600">
                            {cls.rusle_c.toFixed(3)}
                          </td>
                          <td className="py-2 pl-4 text-slate-500">{cls.description}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        <td className="py-2 pr-4 text-slate-700">Catchment Composite</td>
                        <td className="text-right py-2 px-3">100.0</td>
                        <td className="text-right py-2 px-3">{display.total_area_km2.toFixed(0)}</td>
                        <td className="text-right py-2 px-3 font-mono">{display.composite_cn2}</td>
                        <td className="text-right py-2 px-3 font-mono">{display.composite_rusle_c.toFixed(4)}</td>
                        <td className="py-2 pl-4 text-slate-400">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </ChartCard>

              {/* Scenario panel */}
              {scenarioMode && (
                <Card className="border-sky-200 bg-sky-50/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-sky-800">Scenario Analysis — Adjust LULC Areas</CardTitle>
                    <CardDescription className="text-xs text-sky-700">
                      Modify area percentages to evaluate hydrological impact of land use change.
                      Total need not sum to 100 — proportional weighting is applied.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {display.classes.map((cls) => (
                      <ScenarioRow
                        key={cls.name}
                        cls={cls}
                        value={scenarioAreas[cls.name] ?? cls.area_pct}
                        onChange={handleScenarioChange}
                      />
                    ))}
                    <div className="flex items-center gap-3 pt-3">
                      <Button
                        size="sm"
                        className="text-xs"
                        onClick={runScenario}
                        disabled={scenarioLoading}
                      >
                        {scenarioLoading ? "Computing..." : "Apply Scenario"}
                      </Button>
                      {scenarioData && scenarioData !== baseData && (
                        <Badge className="bg-sky-100 text-sky-700 text-[10px]">
                          Scenario active — CN changed to {scenarioData.composite_cn2}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sources */}
              <Card className="border-slate-200">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                    Data Sources and Standards
                  </p>
                  <ul className="space-y-1">
                    {display.sources.map((s, i) => (
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
        </DataGuard>
      </div>
    </main>
  );
}
