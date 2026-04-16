"use client";

import { useState, useMemo } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Circle, Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COLORS, MONTH_NAMES } from "@/lib/constants";
import {
  CloudRain, Thermometer, Droplets, Wind, Waves, MapPin,
  Cloud, Play, Pause, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, ComposedChart, Area,
} from "recharts";

// Fix default Leaflet marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const damIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Color scales for monthly animation
function precipColor(mm: number): string {
  if (mm < 10) return "#e0f2fe";
  if (mm < 30) return "#7dd3fc";
  if (mm < 80) return "#38bdf8";
  if (mm < 150) return "#0284c7";
  return "#1e3a5f";
}

function streamColor(m3s: number): string {
  if (m3s < 1) return "#dbeafe";
  if (m3s < 5) return "#93c5fd";
  if (m3s < 20) return "#3b82f6";
  if (m3s < 50) return "#1d4ed8";
  return "#1e3a8a";
}

// Musi River approximate path through the area
const musiRiverPath: [number, number][] = [
  [17.38, 78.28],
  [17.375, 78.32],
  [17.37, 78.35],
  [17.365, 78.38],
  [17.355, 78.40],
  [17.35, 78.42],
  [17.36, 78.45],
  [17.37, 78.48],
  [17.375, 78.50],
  [17.38, 78.53],
];

// Esi River path (tributary feeding Himayat Sagar)
const esiRiverPath: [number, number][] = [
  [17.40, 78.35],
  [17.39, 78.37],
  [17.375, 78.385],
  [17.36, 78.395],
  [17.345, 78.401],
];

interface MapViewProps {
  data: any;
}

export default function MapView({ data }: MapViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tileLayer, setTileLayer] = useState<"satellite" | "terrain" | "street">("terrain");

  const { location, catchment_radius_m, landmarks, current_weather, monthly_climatology, annual_stats } = data;

  const currentClim = monthly_climatology?.[selectedMonth];

  // Auto-play animation
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      let month = selectedMonth;
      const interval = setInterval(() => {
        month = (month + 1) % 12;
        setSelectedMonth(month);
        if (month === 11) {
          clearInterval(interval);
          setIsPlaying(false);
        }
      }, 800);
    }
  };

  const tileUrls = {
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    terrain: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  };

  const tileAttribution = {
    satellite: "Esri, Maxar, Earthstar Geographics",
    terrain: "OpenTopoMap",
    street: "OpenStreetMap contributors",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catchment Map & Live Conditions</h1>
          <p className="text-sm text-muted-foreground">
            Himayat Sagar Dam — {data.catchment_area_km2} km2 catchment on Esi River
          </p>
        </div>
        <div className="flex gap-1">
          {(["terrain", "satellite", "street"] as const).map((layer) => (
            <Button
              key={layer}
              size="sm"
              variant={tileLayer === layer ? "default" : "outline"}
              onClick={() => setTileLayer(layer)}
              className="text-xs capitalize"
            >
              {layer}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ minHeight: "70vh" }}>
        {/* Map - takes 3 columns */}
        <div className="lg:col-span-3 rounded-lg overflow-hidden border shadow-sm" style={{ minHeight: 500 }}>
          <MapContainer
            center={[location.lat, location.lon]}
            zoom={12}
            style={{ height: "100%", width: "100%", minHeight: 500 }}
            scrollWheelZoom={true}
          >
            <TileLayer
              url={tileUrls[tileLayer]}
              attribution={tileAttribution[tileLayer]}
            />

            {/* Catchment area circle */}
            <Circle
              center={[location.lat, location.lon]}
              radius={catchment_radius_m}
              pathOptions={{
                color: currentClim ? precipColor(currentClim.precip_mm) : "#3b82f6",
                fillColor: currentClim ? precipColor(currentClim.precip_mm) : "#93c5fd",
                fillOpacity: 0.15,
                weight: 2,
                dashArray: "8 4",
              }}
            />

            {/* Inner streamflow indicator */}
            <Circle
              center={[location.lat, location.lon]}
              radius={3000}
              pathOptions={{
                color: currentClim ? streamColor(currentClim.streamflow_m3s) : "#4682b4",
                fillColor: currentClim ? streamColor(currentClim.streamflow_m3s) : "#87ceeb",
                fillOpacity: 0.4,
                weight: 2,
              }}
            />

            {/* Rivers */}
            <Polyline
              positions={musiRiverPath}
              pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.6 }}
            />
            <Polyline
              positions={esiRiverPath}
              pathOptions={{ color: "#3b82f6", weight: 2.5, opacity: 0.7, dashArray: "6 3" }}
            />

            {/* Dam marker */}
            <Marker position={[location.lat, location.lon]} icon={damIcon}>
              <Popup>
                <div className="text-sm space-y-1" style={{ minWidth: 200 }}>
                  <strong className="text-base">Himayat Sagar Dam</strong>
                  <p className="text-xs text-gray-500">17.345°N, 78.401°E</p>
                  <hr />
                  {current_weather && (
                    <>
                      <p><strong>Now:</strong> {current_weather.temp_c}°C, {current_weather.precip_mm}mm rain</p>
                      <p>Humidity: {current_weather.humidity_pct}% | Wind: {current_weather.wind_kmh} km/h</p>
                    </>
                  )}
                  {currentClim && (
                    <>
                      <hr />
                      <p><strong>{currentClim.name} avg:</strong> {currentClim.precip_mm}mm rain, {currentClim.streamflow_m3s} m3/s flow</p>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>

            {/* Other landmarks */}
            {(landmarks || []).filter((lm: any) => lm.type !== "dam").map((lm: any) => (
              <Marker key={lm.name} position={[lm.lat, lm.lon]}>
                <Popup>
                  <strong>{lm.name}</strong>
                  <br />
                  <span className="text-xs capitalize text-gray-500">{lm.type}</span>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Side Panel - 1 column */}
        <div className="space-y-4">
          {/* Current Weather */}
          {current_weather && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Live Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground"><Thermometer className="h-3.5 w-3.5" /> Temp</span>
                  <span className="font-semibold">{current_weather.temp_c}°C</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground"><CloudRain className="h-3.5 w-3.5" /> Rain</span>
                  <span className="font-semibold">{current_weather.precip_mm} mm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground"><Droplets className="h-3.5 w-3.5" /> Humidity</span>
                  <span>{current_weather.humidity_pct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground"><Cloud className="h-3.5 w-3.5" /> Cloud</span>
                  <span>{current_weather.cloud_pct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground"><Wind className="h-3.5 w-3.5" /> Wind</span>
                  <span>{current_weather.wind_kmh} km/h</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annual context */}
          {annual_stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Catchment Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Area</span>
                  <span className="font-medium">{data.catchment_area_km2} km2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg annual rain</span>
                  <span className="font-medium">{annual_stats.mean_precip_mm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg streamflow</span>
                  <span className="font-medium">{annual_stats.mean_streamflow_m3s} m3/s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wettest year</span>
                  <span className="font-medium">{annual_stats.max_precip_year}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driest year</span>
                  <span className="font-medium">{annual_stats.min_precip_year}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly selected info */}
          {currentClim && (
            <Card className="border-sky-200 bg-sky-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{currentClim.name} Climatology</span>
                  <Badge variant="outline" className="text-[10px]">1985-2024 avg</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1"><CloudRain className="h-3.5 w-3.5 text-blue-500" /> Rainfall</span>
                  <span className="font-bold text-blue-700">{currentClim.precip_mm} mm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1"><Waves className="h-3.5 w-3.5 text-sky-600" /> Streamflow</span>
                  <span className="font-bold text-sky-700">{currentClim.streamflow_m3s} m3/s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1"><Thermometer className="h-3.5 w-3.5 text-red-400" /> Temp</span>
                  <span className="font-medium">{currentClim.temp_c}°C</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rainfall climatology mini chart */}
          {monthly_climatology && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">Monthly Rainfall Pattern</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={monthly_climatology}>
                    <Bar dataKey="precip_mm" radius={[2, 2, 0, 0]}>
                      {monthly_climatology.map((_: any, i: number) => (
                        <Cell
                          key={i}
                          fill={i === selectedMonth ? "#1d4ed8" : "#93c5fd"}
                          stroke={i === selectedMonth ? "#1e3a8a" : "none"}
                          strokeWidth={i === selectedMonth ? 2 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[9px] text-muted-foreground px-1">
                  {MONTH_NAMES.map((m, i) => (
                    <span key={m} className={i === selectedMonth ? "font-bold text-blue-700" : ""}>{m[0]}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Monthly Animation Controls */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium min-w-36">
              Seasonal View: <strong className="text-blue-700">{currentClim?.name || ""}</strong>
            </span>
            <Button size="sm" variant="outline" onClick={() => setSelectedMonth((p) => (p - 1 + 12) % 12)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant={isPlaying ? "default" : "outline"} onClick={togglePlay}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedMonth((p) => (p + 1) % 12)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={11}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                {MONTH_NAMES.map((m) => <span key={m}>{m}</span>)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom charts: streamflow + rainfall climatology side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Rainfall Climatology</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly_climatology || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="precip_mm" name="Rainfall (mm)" radius={[3, 3, 0, 0]}>
                  {(monthly_climatology || []).map((_: any, i: number) => (
                    <Cell key={i} fill={i === selectedMonth ? "#1d4ed8" : COLORS.precipitation} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Streamflow Climatology</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={monthly_climatology || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area dataKey="streamflow_m3s" name="Streamflow (m3/s)" fill={COLORS.streamflowLight} stroke={COLORS.streamflow} fillOpacity={0.4} strokeWidth={2}>
                </Area>
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
