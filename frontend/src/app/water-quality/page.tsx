"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Droplets, FlaskConical, CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/constants";

interface ParamResult {
  parameter: string;
  value: number | null;
  unit: string;
  status: "safe" | "caution" | "unsafe" | "not_provided";
  message?: string;
  acceptable_limit: string | number;
  permissible_limit: string | number;
  source: string;
}

interface AssessmentResult {
  overall: "safe" | "caution" | "unsafe" | "no_data";
  overall_message: string;
  overall_color: string;
  unsafe_parameters: string[];
  caution_parameters: string[];
  parameters: ParamResult[];
  standards: string[];
}

const STATUS_CONFIG = {
  safe: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200", label: "Safe" },
  caution: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Caution" },
  unsafe: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Unsafe" },
  not_provided: { icon: Info, color: "text-slate-400", bg: "bg-slate-50 border-slate-200", label: "Not entered" },
};

const OVERALL_CONFIG = {
  safe: { icon: CheckCircle2, bg: "bg-green-100 border-green-400", text: "text-green-800", label: "SAFE TO DRINK" },
  caution: { icon: AlertTriangle, bg: "bg-amber-100 border-amber-400", text: "text-amber-800", label: "TREAT BEFORE USE" },
  unsafe: { icon: XCircle, bg: "bg-red-100 border-red-400", text: "text-red-800", label: "NOT SAFE" },
  no_data: { icon: Info, bg: "bg-slate-100 border-slate-300", text: "text-slate-600", label: "NO DATA" },
};

function InputField({
  label, name, value, onChange, unit, placeholder,
}: {
  label: string; name: string; value: string; onChange: (n: string, v: string) => void; unit: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">{label}</label>
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

export default function WaterQualityPage() {
  const [fields, setFields] = useState<Record<string, string>>({
    ph: "", turbidity_ntu: "", tds_mg_l: "", nitrate_mg_l: "",
    fluoride_mg_l: "", hardness_mg_l: "", chloride_mg_l: "",
    iron_mg_l: "", arsenic_ug_l: "", bod_mg_l: "",
  });
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (name: string, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssess = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = v.trim() === "" ? null : parseFloat(v);
    }

    try {
      const res = await fetch(`${API_BASE}/api/water-quality/assess`, {
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
    setFields(Object.fromEntries(Object.keys(fields).map((k) => [k, ""])));
    setResult(null);
    setError(null);
  };

  const overallCfg = result ? OVERALL_CONFIG[result.overall] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Droplets className="h-6 w-6 text-sky-500" />
            Water Quality & Drinkability Checker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your field measurements to assess drinking water safety.
            Leave fields blank if not measured.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <FlaskConical className="h-3 w-3" />
          IS 10500:2012 · WHO GDWQ 2017
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Water Sample Parameters</CardTitle>
            <CardDescription className="text-xs">
              Thresholds based on Bureau of Indian Standards IS 10500:2012 and
              WHO Guidelines for Drinking-water Quality, 4th Ed. (2017).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="pH" name="ph" value={fields.ph} onChange={handleChange} unit="—" placeholder="e.g. 7.2" />
              <InputField label="Turbidity" name="turbidity_ntu" value={fields.turbidity_ntu} onChange={handleChange} unit="NTU" placeholder="e.g. 2.5" />
              <InputField label="Total Dissolved Solids" name="tds_mg_l" value={fields.tds_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 450" />
              <InputField label="Nitrate (as NO₃)" name="nitrate_mg_l" value={fields.nitrate_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 30" />
              <InputField label="Fluoride" name="fluoride_mg_l" value={fields.fluoride_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 0.8" />
              <InputField label="Total Hardness (CaCO₃)" name="hardness_mg_l" value={fields.hardness_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 180" />
              <InputField label="Chloride" name="chloride_mg_l" value={fields.chloride_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 200" />
              <InputField label="Iron (as Fe)" name="iron_mg_l" value={fields.iron_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 0.2" />
              <InputField label="Arsenic (as As)" name="arsenic_ug_l" value={fields.arsenic_ug_l} onChange={handleChange} unit="μg/L" placeholder="e.g. 5" />
              <InputField label="BOD (surface water)" name="bod_mg_l" value={fields.bod_mg_l} onChange={handleChange} unit="mg/L" placeholder="e.g. 2" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleAssess} disabled={loading} className="flex-1">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analysing…</> : "Assess Safety"}
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
                <div className={`flex items-center gap-2 font-bold text-lg ${overallCfg.text}`}>
                  <overallCfg.icon className="h-6 w-6" />
                  {overallCfg.label}
                </div>
                <p className={`text-sm mt-1 ${overallCfg.text}`}>{result.overall_message}</p>
                {result.unsafe_parameters.length > 0 && (
                  <p className="text-xs mt-2 text-red-700">
                    <strong>Exceeds limits:</strong> {result.unsafe_parameters.join(", ")}
                  </p>
                )}
                {result.caution_parameters.length > 0 && (
                  <p className="text-xs mt-1 text-amber-700">
                    <strong>Above desirable:</strong> {result.caution_parameters.join(", ")}
                  </p>
                )}
              </div>

              {/* Per-parameter results */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Parameter Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.parameters
                    .filter((p) => p.status !== "not_provided")
                    .map((p) => {
                      const cfg = STATUS_CONFIG[p.status];
                      return (
                        <div key={p.parameter} className={`rounded-md border px-3 py-2 ${cfg.bg}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                              <span className="text-xs font-medium text-slate-800">{p.parameter}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-600">
                                {p.value} {p.unit}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 ${cfg.color} border-current`}
                              >
                                {cfg.label}
                              </Badge>
                            </div>
                          </div>
                          {p.message && (
                            <p className="text-[10px] text-slate-500 mt-0.5 ml-5">{p.message}</p>
                          )}
                        </div>
                      );
                    })}
                </CardContent>
              </Card>

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
              <FlaskConical className="h-10 w-10 opacity-30" />
              <p>Enter measurements and click <strong>Assess Safety</strong></p>
              <p className="text-xs text-center px-6">
                You can leave any parameter blank if it wasn't measured — only provided values will be checked.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
