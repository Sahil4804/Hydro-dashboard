"use client";

import { useApi } from "@/hooks/use-api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Area, Legend,
} from "recharts";
import {
  CloudRain, Thermometer, Droplets, Wind, Waves, Sun,
  CloudDrizzle, CloudLightning, Loader2, Cloud,
} from "lucide-react";

const RAIN_COLOR_MAP: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  red: "bg-red-100 text-red-700 border-red-200",
};

const RAIN_BG_MAP: Record<string, string> = {
  slate: "border-l-slate-300",
  sky: "border-l-sky-400",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  orange: "border-l-orange-500",
  red: "border-l-red-500",
};

function RainIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "No/Trace": return <Sun className="h-8 w-8 text-amber-400" />;
    case "Light": return <CloudDrizzle className="h-8 w-8 text-sky-400" />;
    case "Moderate": return <CloudRain className="h-8 w-8 text-blue-500" />;
    case "Heavy": return <CloudRain className="h-8 w-8 text-amber-500" />;
    case "Very Heavy": return <CloudLightning className="h-8 w-8 text-orange-500" />;
    case "Extreme": return <CloudLightning className="h-8 w-8 text-red-600" />;
    default: return <Cloud className="h-8 w-8 text-gray-400" />;
  }
}

export default function ForecastPage() {
  const { data: forecast, isLoading, error } = useApi<any>("/api/forecast");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Fetching live forecast...</span>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <CloudRain className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Could not load forecast data. Please try again.</p>
      </div>
    );
  }

  const { days, summary } = forecast;
  const tomorrow = days?.find((d: any) => d.is_tomorrow);
  const today = days?.find((d: any) => d.is_today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">7-Day Weather & Streamflow Forecast</h1>
        <p className="text-sm text-muted-foreground">
          Live forecast for Himayat Sagar ({forecast.location?.lat}N, {forecast.location?.lon}E) | Streamflow predicted via trained SVR model
        </p>
      </div>

      {/* Highlight: Today & Tomorrow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {today && (
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="secondary" className="mb-2">Today</Badge>
                  <p className="text-sm text-muted-foreground">{today.day_of_week}, {today.date}</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CloudRain className="h-4 w-4 text-blue-500" />
                      <span className="text-lg font-bold">{today.precip_mm} mm</span>
                      <Badge className={RAIN_COLOR_MAP[today.rain_color] || ""} variant="outline">{today.rain_severity}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-red-400" />
                      <span className="text-sm">{today.temp_mean_c}°C</span>
                    </div>
                    {today.predicted_streamflow_m3s != null && (
                      <div className="flex items-center gap-2">
                        <Waves className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{today.predicted_streamflow_m3s} m3/s streamflow</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Droplets className="h-3 w-3" />{today.rh_mean_pct}%</span>
                      <span className="flex items-center gap-1"><Cloud className="h-3 w-3" />{today.cloud_mean_pct}%</span>
                      <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{today.wind_mean_kmh} km/h</span>
                    </div>
                  </div>
                </div>
                <RainIcon severity={today.rain_severity} />
              </div>
            </CardContent>
          </Card>
        )}

        {tomorrow && (
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="secondary" className="mb-2">Tomorrow</Badge>
                  <p className="text-sm text-muted-foreground">{tomorrow.day_of_week}, {tomorrow.date}</p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <CloudRain className="h-4 w-4 text-blue-500" />
                      <span className="text-lg font-bold">{tomorrow.precip_mm} mm</span>
                      <Badge className={RAIN_COLOR_MAP[tomorrow.rain_color] || ""} variant="outline">{tomorrow.rain_severity}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-red-400" />
                      <span className="text-sm">{tomorrow.temp_mean_c}°C</span>
                    </div>
                    {tomorrow.predicted_streamflow_m3s != null && (
                      <div className="flex items-center gap-2">
                        <Waves className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{tomorrow.predicted_streamflow_m3s} m3/s streamflow</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Droplets className="h-3 w-3" />{tomorrow.rh_mean_pct}%</span>
                      <span className="flex items-center gap-1"><Cloud className="h-3 w-3" />{tomorrow.cloud_mean_pct}%</span>
                      <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{tomorrow.wind_mean_kmh} km/h</span>
                    </div>
                  </div>
                </div>
                <RainIcon severity={tomorrow.rain_severity} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weekly Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="Total Rainfall" value={`${summary?.total_precip_mm} mm`} subtitle="Next 7 days" icon={<CloudRain className="h-5 w-5" />} />
        <KpiCard title="Rainy Days" value={summary?.rainy_days ?? 0} subtitle=">= 2.5 mm" icon={<Droplets className="h-5 w-5" />} />
        <KpiCard title="Avg Temperature" value={summary?.avg_temp_c != null ? `${summary.avg_temp_c}°C` : "N/A"} subtitle="7-day mean" icon={<Thermometer className="h-5 w-5" />} />
        <KpiCard title="Avg Streamflow" value={summary?.avg_streamflow_m3s != null ? `${summary.avg_streamflow_m3s} m3/s` : "N/A"} subtitle="ML predicted" icon={<Waves className="h-5 w-5" />} />
        <KpiCard title="Peak Streamflow" value={summary?.max_streamflow_m3s != null ? `${summary.max_streamflow_m3s} m3/s` : "N/A"} subtitle="Max in 7 days" icon={<Waves className="h-5 w-5" />} />
      </div>

      {/* Daily Forecast Cards */}
      <ChartCard title="Day-by-Day Forecast" description="Rainfall, temperature, and predicted streamflow">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(days || []).map((day: any) => (
            <Card
              key={day.date}
              className={`border-l-4 ${RAIN_BG_MAP[day.rain_color] || "border-l-slate-200"} ${day.is_today ? "ring-2 ring-sky-300" : ""}`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm">{day.day_of_week}</p>
                    <p className="text-xs text-muted-foreground">{day.date}</p>
                  </div>
                  <RainIcon severity={day.rain_severity} />
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><CloudRain className="h-3.5 w-3.5" /> Rain</span>
                    <span className="font-medium">{day.precip_mm} mm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Thermometer className="h-3.5 w-3.5" /> Temp</span>
                    <span className="font-medium">{day.temp_mean_c}°C</span>
                  </div>
                  {day.predicted_streamflow_m3s != null && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-muted-foreground"><Waves className="h-3.5 w-3.5" /> Flow</span>
                      <span className="font-medium">{day.predicted_streamflow_m3s} m3/s</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Droplets className="h-3.5 w-3.5" /> Humid</span>
                    <span>{day.rh_mean_pct}%</span>
                  </div>
                </div>
                <Badge className={`mt-2 text-[10px] ${RAIN_COLOR_MAP[day.rain_color] || ""}`} variant="outline">
                  {day.rain_severity}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </ChartCard>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Rainfall Forecast" description="Daily precipitation (mm)">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={days || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day_of_week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "mm", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="precip_mm" name="Rainfall (mm)" fill={COLORS.precipitation} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Predicted Streamflow" description="SVR model prediction (m3/s)">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={days || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day_of_week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "m3/s", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area dataKey="predicted_streamflow_m3s" name="Streamflow (m3/s)" fill={COLORS.streamflowLight} stroke={COLORS.streamflow} fillOpacity={0.4} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Temperature & Humidity" description="7-day trend">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={days || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day_of_week" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: "°C", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: "%", angle: 90, position: "insideRight", style: { fontSize: 10 } }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left" dataKey="temp_mean_c" name="Temperature (°C)" stroke={COLORS.temperature} strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" dataKey="rh_mean_pct" name="Humidity (%)" stroke={COLORS.humidity} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cloud Cover & Wind" description="7-day trend">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={days || []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day_of_week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="cloud_mean_pct" name="Cloud Cover (%)" fill={COLORS.cloudLight} />
              <Line dataKey="wind_mean_kmh" name="Wind (km/h)" stroke={COLORS.wind} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Source: {forecast.source} | Fetched: {new Date(forecast.fetched_at).toLocaleString()}
      </p>
    </div>
  );
}
