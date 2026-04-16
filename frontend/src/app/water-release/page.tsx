"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, ShieldAlert, Siren,
  Info, Droplets, ArrowRight, Lock,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReleaseDecision {
  priority: number;
  type: string;
  release_mm3: number;
  release_m3s: number;
  rationale: string;
  color: string;
  demand_mm3?: number;
  demand_met_pct?: number;
}

interface StorageZone {
  zone: string;
  color: string;
  pct: number;
}

interface WaterReleaseResult {
  status: string;
  status_color: string;
  current_storage_mm3: number;
  current_storage_pct: number;
  projected_inflow_mm3: number;
  projected_storage_before_release: number;
  storage_zone: StorageZone;
  total_recommended_release_mm3: number;
  total_recommended_release_m3s: number;
  final_storage_mm3: number;
  final_storage_pct: number;
  decisions: ReleaseDecision[];
  risk_flags: string[];
  flush_recommended: boolean;
  reservoir_constants: {
    frl_m: number;
    mdwl_m: number;
    gross_storage_mm3: number;
    dead_storage_mm3: number;
    live_storage_mm3: number;
  };
  standards: string[];
}

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (n: string, v: string) => void;
  unit: string;
  step?: string;
  help?: string;
  required?: boolean;
}

function Field({ label, name, value, onChange, unit, step, help, required }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {help && <p className="text-[10px] text-slate-400 leading-relaxed">{help}</p>}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          step={step || "0.01"}
          min={0}
          onChange={(e) => onChange(name, e.target.value)}
          className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono focus:border-sky-400 focus:outline-none"
        />
        <span className="text-xs text-slate-400 w-20 flex-shrink-0">{unit}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority icon
// ---------------------------------------------------------------------------

function PriorityIcon({ priority, color }: { priority: number; color: string }) {
  const Icon =
    priority === 1 ? Siren :
    priority === 2 ? Droplets :
    priority === 3 ? Lock :
    priority === 4 ? CheckCircle2 :
    AlertTriangle;
  return <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />;
}

// ---------------------------------------------------------------------------
// Storage gauge
// ---------------------------------------------------------------------------

function StorageGauge({
  current_pct,
  final_pct,
  zone_color,
}: {
  current_pct: number;
  final_pct: number;
  zone_color: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Dead Storage (0%)</span>
        <span>MDWL</span>
        <span>FRL (100%)</span>
      </div>
      {/* Before */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">Current</p>
        <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(current_pct, 100)}%`, background: zone_color }}
          />
        </div>
        <p className="text-[10px] text-right mt-0.5" style={{ color: zone_color }}>
          {current_pct.toFixed(1)}%
        </p>
      </div>
      {/* After */}
      <div>
        <p className="text-[10px] text-slate-400 mb-1">Post-Release (projected)</p>
        <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(final_pct, 100)}%`, background: "#0284c7" }}
          />
        </div>
        <p className="text-[10px] text-right mt-0.5 text-sky-600">{final_pct.toFixed(1)}%</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default form values (illustrative operational scenario)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  current_storage_mm3: "4.2",
  inflow_forecast_m3s: "18.5",
  downstream_demand_m3s: "3.2",
  days_to_decide: "7",
  current_wl_m: "515.4",
  rainfall_forecast_72h_mm: "35",
  irrigation_requirement_mm3: "0.85",
  drinking_water_requirement_mm3: "0.12",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WaterReleasePage() {
  const [form, setForm] = useState<Record<string, string>>(DEFAULTS);
  const [result, setResult] = useState<WaterReleaseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (name: string, value: string) => {
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = {
        current_storage_mm3: parseFloat(form.current_storage_mm3),
        inflow_forecast_m3s: parseFloat(form.inflow_forecast_m3s),
        downstream_demand_m3s: parseFloat(form.downstream_demand_m3s),
        days_to_decide: parseInt(form.days_to_decide, 10),
        current_wl_m: form.current_wl_m ? parseFloat(form.current_wl_m) : null,
        rainfall_forecast_72h_mm: parseFloat(form.rainfall_forecast_72h_mm) || 0,
        irrigation_requirement_mm3: parseFloat(form.irrigation_requirement_mm3) || 0,
        drinking_water_requirement_mm3: parseFloat(form.drinking_water_requirement_mm3) || 0,
      };
      const res = await fetch(`${API_BASE}/api/water-release/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ml-64 min-h-screen bg-slate-50">
      <div className="p-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets className="h-5 w-5 text-sky-500" />
            Water Release Decision Support
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Rule-curve based release recommendation — Himayat Sagar Reservoir
          </p>
        </div>

        {/* Input panel */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operational Input Parameters</CardTitle>
            <CardDescription className="text-xs">
              Enter current reservoir state and demand forecasts. Required fields are marked.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field
                label="Current Storage"
                name="current_storage_mm3"
                value={form.current_storage_mm3}
                onChange={handleChange}
                unit="Mm³"
                step="0.01"
                help="Live + dead storage combined. Gross capacity: 7.17 Mm³"
                required
              />
              <Field
                label="Forecast Inflow"
                name="inflow_forecast_m3s"
                value={form.inflow_forecast_m3s}
                onChange={handleChange}
                unit="m³/s"
                help="Mean inflow over the decision horizon"
                required
              />
              <Field
                label="Downstream Demand"
                name="downstream_demand_m3s"
                value={form.downstream_demand_m3s}
                onChange={handleChange}
                unit="m³/s"
                help="Continuous downstream channel flow required"
                required
              />
              <Field
                label="Decision Horizon"
                name="days_to_decide"
                value={form.days_to_decide}
                onChange={handleChange}
                unit="days"
                step="1"
                help="Planning window (typically 7 days)"
              />
              <Field
                label="Current Water Level"
                name="current_wl_m"
                value={form.current_wl_m}
                onChange={handleChange}
                unit="m AMSL"
                help="FRL = 519.68 m; MDWL = 496.57 m"
              />
              <Field
                label="Rainfall Forecast (72h)"
                name="rainfall_forecast_72h_mm"
                value={form.rainfall_forecast_72h_mm}
                onChange={handleChange}
                unit="mm"
                help="72-hour cumulative rainfall forecast"
              />
              <Field
                label="Irrigation Requirement"
                name="irrigation_requirement_mm3"
                value={form.irrigation_requirement_mm3}
                onChange={handleChange}
                unit="Mm³"
                help="Bulk irrigation allocation for the decision period"
              />
              <Field
                label="Drinking Water Requirement"
                name="drinking_water_requirement_mm3"
                value={form.drinking_water_requirement_mm3}
                onChange={handleChange}
                unit="Mm³"
                help="HMWSSB / municipal supply for the period"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={loading} className="text-sm">
                {loading ? "Analysing..." : "Generate Release Decision"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { setForm(DEFAULTS); setResult(null); }}
              >
                Reset
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

        {result && (
          <>
            {/* Status banner */}
            <Card
              className="border-2"
              style={{ borderColor: result.status_color, background: result.status_color + "14" }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Operational Status
                    </p>
                    <p className="text-base font-bold" style={{ color: result.status_color }}>
                      {result.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total Recommended Release</p>
                    <p className="text-xl font-bold text-slate-800">
                      {result.total_recommended_release_mm3.toFixed(4)} Mm³
                    </p>
                    <p className="text-xs text-slate-500">
                      ≡ {result.total_recommended_release_m3s.toFixed(3)} m³/s (mean)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk flags */}
            {result.risk_flags.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Flags
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {result.risk_flags.map((flag, i) => (
                    <p key={i} className="text-xs text-amber-800 flex gap-2">
                      <span className="text-amber-400 flex-shrink-0 mt-0.5">•</span>
                      {flag}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Storage overview + gauge */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="border-slate-200 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Storage Balance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StorageGauge
                    current_pct={result.current_storage_pct}
                    final_pct={result.final_storage_pct}
                    zone_color={result.storage_zone.color}
                  />
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    {[
                      { label: "Current Storage", value: `${result.current_storage_mm3.toFixed(3)} Mm³`, sub: `${result.current_storage_pct.toFixed(1)}% of gross` },
                      { label: "Forecast Inflow", value: `${result.projected_inflow_mm3.toFixed(3)} Mm³`, sub: `over ${form.days_to_decide} days` },
                      { label: "Post-Release Storage", value: `${result.final_storage_mm3.toFixed(3)} Mm³`, sub: `${result.final_storage_pct.toFixed(1)}% of gross` },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{item.label}</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">{item.value}</p>
                        <p className="text-[10px] text-slate-500">{item.sub}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Storage zone card */}
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Storage Zone</CardTitle>
                  <CardDescription className="text-xs">IS 7966:1975 classification</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: result.storage_zone.color }}
                    />
                    <span className="text-sm font-semibold text-slate-800">
                      {result.storage_zone.zone}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{result.current_storage_pct.toFixed(1)}% of gross capacity</p>
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>FRL</span>
                      <span className="font-mono">{result.reservoir_constants.frl_m} m AMSL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>MDWL</span>
                      <span className="font-mono">{result.reservoir_constants.mdwl_m} m AMSL</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gross Capacity</span>
                      <span className="font-mono">{result.reservoir_constants.gross_storage_mm3} Mm³</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dead Storage</span>
                      <span className="font-mono">{result.reservoir_constants.dead_storage_mm3} Mm³</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Live Storage</span>
                      <span className="font-mono">{result.reservoir_constants.live_storage_mm3.toFixed(3)} Mm³</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Decision sequence */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Release Decision Sequence</CardTitle>
                <CardDescription className="text-xs">
                  Evaluated in priority order — flood safety takes precedence over demand and conservation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.decisions.map((d) => (
                  <div
                    key={d.priority}
                    className="border rounded-md p-3 space-y-2"
                    style={{ borderColor: d.color + "60", background: d.color + "0d" }}
                  >
                    <div className="flex items-start gap-2">
                      <PriorityIcon priority={d.priority} color={d.color} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800">{d.type}</span>
                          <Badge
                            className="text-[10px] px-1.5 py-0"
                            style={{ background: d.color + "26", color: d.color, border: "none" }}
                          >
                            Priority {d.priority}
                          </Badge>
                          {d.demand_met_pct !== undefined && (
                            <Badge
                              className="text-[10px] px-1.5 py-0"
                              style={{ background: "#0284c726", color: "#0284c7", border: "none" }}
                            >
                              {d.demand_met_pct}% demand met
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{d.rationale}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold font-mono" style={{ color: d.color }}>
                          {d.release_mm3.toFixed(4)} Mm³
                        </p>
                        <p className="text-[10px] text-slate-400">{d.release_m3s.toFixed(3)} m³/s</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="border-t-2 border-slate-200 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <ArrowRight className="h-4 w-4" />
                    Total Recommended Release
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-900 font-mono">
                      {result.total_recommended_release_mm3.toFixed(4)} Mm³
                    </p>
                    <p className="text-xs text-slate-500">{result.total_recommended_release_m3s.toFixed(3)} m³/s mean</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sediment flush notice */}
            {result.flush_recommended && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Sediment Flushing Opportunity Identified</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Current storage and inflow conditions are favourable for a partial drawdown silt flush.
                      A controlled opening of sluice gates when storage is low and inflows are rising
                      can evacuate accumulated sediment from the dead storage zone.
                      Coordinate with dam safety officer before execution.
                      Ref: CWC Reservoir Sedimentation Manual (2010), Section 7.3.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Standards */}
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Standards and References
                </p>
                <ul className="space-y-1">
                  {result.standards.map((s, i) => (
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
      </div>
    </main>
  );
}
