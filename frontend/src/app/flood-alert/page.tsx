"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Waves, CloudRain, ShieldAlert,
  CheckCircle2, XCircle, Info, Loader2, Siren,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";

interface FloodSubResult {
  value: number;
  level: "normal" | "watch" | "warning" | "danger";
  message: string;
  color: string;
  source?: string;
}

interface FloodResult {
  overall_level: "normal" | "watch" | "warning" | "danger" | "no_data";
  overall_color: string;
  overall_message: string;
  streamflow: FloodSubResult | null;
  rainfall_24h: FloodSubResult | null;
  antecedent_note: string | null;
  streamflow_thresholds: { q75: number; q90: number; q95: number } | null;
  standards: string[];
}

const LEVEL_CONFIG = {
  normal: {
    icon: CheckCircle2,
    bg: "bg-green-100 border-green-400",
    text: "text-green-800",
    label: "NORMAL",
    badge: "bg-green-100 text-green-700",
  },
  watch: {
    icon: AlertTriangle,
    bg: "bg-yellow-100 border-yellow-400",
    text: "text-yellow-800",
    label: "WATCH",
    badge: "bg-yellow-100 text-yellow-700",
  },
  warning: {
    icon: ShieldAlert,
    bg: "bg-orange-100 border-orange-400",
    text: "text-orange-800",
    label: "WARNING",
    badge: "bg-orange-100 text-orange-700",
  },
  danger: {
    icon: Siren,
    bg: "bg-red-100 border-red-400",
    text: "text-red-800",
    label: "DANGER",
    badge: "bg-red-100 text-red-700",
  },
  no_data: {
    icon: Info,
    bg: "bg-slate-100 border-slate-300",
    text: "text-slate-600",
    label: "NO DATA",
    badge: "bg-slate-100 text-slate-500",
  },
};

function InputField({
  label, name, value, onChange, unit, placeholder, help,
}: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void;
  unit: string; placeholder?: string; help?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">{label}</label>
      {help && <p className="text-[10px] text-slate-400">{help}</p>}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder ?? "—"}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
        />
        <span className="text-xs text-slate-500 w-14 shrink-0">{unit}</span>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: keyof typeof LEVEL_CONFIG }) {
  const cfg = LEVEL_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export default function FloodAlertPage() {
  const [fields, setFields] = useState({ current_streamflow_m3s: "", rainfall_24h_mm: "", rainfall_72h_mm: "" });
  const [result, setResult] = useState<FloodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (name: string, value: string) => setFields((p) => ({ ...p, [name]: value }));

  const handleAssess = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const payload: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = v.trim() === "" ? null : parseFloat(v);
    }
    try {
      const res = await fetch(`${API_BASE}/api/flood-alert/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFields({ current_streamflow_m3s: "", rainfall_24h_mm: "", rainfall_72h_mm: "" });
    setResult(null);
    setError(null);
  };

  const overallCfg = result ? LEVEL_CONFIG[result.overall_level] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Waves className="h-6 w-6 text-blue-500" />
            Flood Risk Alert
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter current observations to assess flood risk at Himayat Sagar Dam and downstream areas.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <CloudRain className="h-3 w-3" />
          IMD · CWC · NDMA standards
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current Observations</CardTitle>
            <CardDescription className="text-xs">
              Streamflow thresholds are computed from Himayat Sagar historical records (1985–2024).
              Rainfall categories follow IMD 24-h severity classification (IMD, 2021).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputField
              label="Current Streamflow"
              name="current_streamflow_m3s"
              value={fields.current_streamflow_m3s}
              onChange={handleChange}
              unit="m³/s"
              placeholder="e.g. 45.0"
              help="Observed inflow at dam gauge station"
            />
            <InputField
              label="Rainfall — last 24 hours"
              name="rainfall_24h_mm"
              value={fields.rainfall_24h_mm}
              onChange={handleChange}
              unit="mm"
              placeholder="e.g. 80"
              help="Accumulated precipitation over the catchment in the past 24 h"
            />
            <InputField
              label="Rainfall — last 72 hours (optional)"
              name="rainfall_72h_mm"
              value={fields.rainfall_72h_mm}
              onChange={handleChange}
              unit="mm"
              placeholder="e.g. 200"
              help="Helps assess soil saturation and antecedent wetness"
            />
            <div className="flex gap-2 pt-1">
              <Button onClick={handleAssess} disabled={loading} className="flex-1">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Assessing…</> : "Assess Flood Risk"}
              </Button>
              <Button variant="outline" onClick={handleClear} disabled={loading}>Clear</Button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {result && overallCfg && (
            <>
              {/* Overall banner */}
              <div className={`rounded-lg border-2 p-4 ${overallCfg.bg}`}>
                <div className={`flex items-center gap-2 font-bold text-xl ${overallCfg.text}`}>
                  <overallCfg.icon className="h-7 w-7" />
                  FLOOD RISK: {overallCfg.label}
                </div>
                <p className={`text-sm mt-1.5 ${overallCfg.text}`}>{result.overall_message}</p>
              </div>

              {/* Antecedent warning */}
              {result.antecedent_note && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-700 flex gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{result.antecedent_note}</span>
                  </p>
                </div>
              )}

              {/* Streamflow */}
              {result.streamflow && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Waves className="h-4 w-4 text-blue-500" />
                      Streamflow Assessment
                      <LevelBadge level={result.streamflow.level as keyof typeof LEVEL_CONFIG} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-slate-700">{result.streamflow.message}</p>
                    {result.streamflow_thresholds && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {[
                          { label: "Q75 (Watch)", value: result.streamflow_thresholds.q75, color: "text-yellow-700 bg-yellow-50" },
                          { label: "Q90 (Warning)", value: result.streamflow_thresholds.q90, color: "text-orange-700 bg-orange-50" },
                          { label: "Q95 (Danger)", value: result.streamflow_thresholds.q95, color: "text-red-700 bg-red-50" },
                        ].map((t) => (
                          <div key={t.label} className={`rounded p-2 text-center ${t.color}`}>
                            <div className="text-xs font-semibold">{t.label}</div>
                            <div className="text-sm font-mono">{t.value} m³/s</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {result.streamflow.source && (
                      <p className="text-[10px] text-slate-400 mt-1">Source: {result.streamflow.source}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Rainfall */}
              {result.rainfall_24h && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CloudRain className="h-4 w-4 text-sky-500" />
                      24-h Rainfall Assessment
                      <LevelBadge level={result.rainfall_24h.level as keyof typeof LEVEL_CONFIG} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-slate-700">{result.rainfall_24h.message}</p>
                    {/* IMD category legend */}
                    <div className="rounded-md bg-slate-50 border p-2 space-y-1 mt-1">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">IMD 24-h Rainfall Categories</p>
                      {[
                        { range: "<15.6 mm", label: "Light / Moderate", color: "bg-green-200" },
                        { range: "15.6–64.4 mm", label: "Moderate", color: "bg-green-200" },
                        { range: "64.5–115.5 mm", label: "Heavy (Yellow)", color: "bg-yellow-200" },
                        { range: "115.6–204.4 mm", label: "Very Heavy (Orange)", color: "bg-orange-200" },
                        { range: "≥204.5 mm", label: "Extremely Heavy (Red)", color: "bg-red-200" },
                      ].map((cat) => (
                        <div key={cat.range} className="flex items-center gap-2 text-[10px]">
                          <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${cat.color}`} />
                          <span className="font-mono text-slate-600 w-28">{cat.range}</span>
                          <span className="text-slate-500">{cat.label}</span>
                        </div>
                      ))}
                    </div>
                    {result.rainfall_24h.source && (
                      <p className="text-[10px] text-slate-400">Source: {result.rainfall_24h.source}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Standards */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-slate-500 uppercase tracking-wider">Standards & Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {result.standards.map((s) => (
                      <li key={s} className="text-[11px] text-slate-500 flex gap-1.5">
                        <span className="text-slate-400 shrink-0">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}

          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-sm gap-2 border-2 border-dashed rounded-lg">
              <Waves className="h-10 w-10 opacity-30" />
              <p>Enter observations and click <strong>Assess Flood Risk</strong></p>
              <p className="text-xs text-center px-6">
                You can provide streamflow alone, rainfall alone, or both.
                The system uses Himayat Sagar's historical records for context.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
