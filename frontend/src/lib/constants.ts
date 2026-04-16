export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const COLORS = {
  precipitation: "#0ea5e9",
  precipitationLight: "#7dd3fc",
  streamflow: "#4682b4",
  streamflowLight: "#87ceeb",
  temperature: "#ef4444",
  temperatureLight: "#fca5a5",
  humidity: "#8b5cf6",
  humidityLight: "#c4b5fd",
  cloud: "#6b7280",
  cloudLight: "#d1d5db",
  wind: "#f59e0b",
  windLight: "#fcd34d",
  historical: "#1f2937",
  projected: "#3b82f6",
  baseline: "#9ca3af",
  positive: "#3b82f6",
  negative: "#ef4444",
} as const;

export const SEASON_COLORS: Record<string, string> = {
  Winter: "#9ca3af",
  "Pre-Monsoon": "#f59e0b",
  Monsoon: "#1e40af",
  "Post-Monsoon": "#0d9488",
};

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
