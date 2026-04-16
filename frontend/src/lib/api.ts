import { API_BASE } from "./constants";

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Pipeline
export const getPipelineStatus = () => fetchApi<PipelineStatus>("/api/pipeline/status");
export const runPipeline = () =>
  fetch(`${API_BASE}/api/pipeline/run`, { method: "POST" }).then((r) => r.json());

// Overview
export const getOverviewKpis = () => fetchApi<OverviewKpis>("/api/overview/kpis");
export const getOverviewTimeline = () => fetchApi<OverviewTimeline>("/api/overview/timeline");

// Precipitation Historical
export const getPrecipMonthly = () => fetchApi<any[]>("/api/precip/historical/monthly");
export const getPrecipClimatology = () => fetchApi<any[]>("/api/precip/historical/climatology");
export const getPrecipAnnual = () => fetchApi<{ data: any[]; trend: any }>("/api/precip/historical/annual");
export const getPrecipDecadal = () => fetchApi<any[]>("/api/precip/historical/decadal");
export const getPrecipExtremes = () => fetchApi<any>("/api/precip/historical/extremes");
export const getPrecipAnomalies = () => fetchApi<{ monthly: any[]; annual: any[] }>("/api/precip/historical/anomalies");
export const getPrecipSeasonal = () => fetchApi<{ seasonal: any[]; monsoon_trend: any[] }>("/api/precip/historical/seasonal");
export const getPrecipCorrelation = () => fetchApi<{ columns: string[]; values: number[][] }>("/api/precip/historical/correlation");
export const getPrecipClimateVars = () => fetchApi<any[]>("/api/precip/historical/climate-vars");

// Precipitation Models
export const getPrecipCvSummary = () => fetchApi<any[]>("/api/precip/models/cv-summary");
export const getPrecipCvFolds = () => fetchApi<any[]>("/api/precip/models/cv-folds");
export const getPrecipTestMetrics = () => fetchApi<any[]>("/api/precip/models/test-metrics");
export const getPrecipTestPredictions = () => fetchApi<any[]>("/api/precip/models/test-predictions");
export const getPrecipFeatureImportance = () => fetchApi<any[]>("/api/precip/models/feature-importance");
export const getPrecipResiduals = () => fetchApi<any[]>("/api/precip/models/residuals");

// Precipitation Future
export const getPrecipFutureMonthly = () => fetchApi<any[]>("/api/precip/future/monthly");
export const getPrecipFutureAnnual = () => fetchApi<any[]>("/api/precip/future/annual");
export const getPrecipFutureClimatology = () => fetchApi<any[]>("/api/precip/future/climatology");
export const getPrecipFutureChange = () => fetchApi<{ monthly: any[]; seasonal: any[] }>("/api/precip/future/change");

// Streamflow Historical
export const getStreamMonthly = () => fetchApi<any[]>("/api/streamflow/historical/monthly");
export const getStreamClimatology = () => fetchApi<any[]>("/api/streamflow/historical/climatology");
export const getStreamAnnual = () => fetchApi<any[]>("/api/streamflow/historical/annual");
export const getStreamFlowDuration = () => fetchApi<any>("/api/streamflow/historical/flow-duration");
export const getStreamRunoff = () => fetchApi<any>("/api/streamflow/historical/runoff-analysis");
export const getStreamCorrelation = () => fetchApi<{ columns: string[]; values: number[][] }>("/api/streamflow/historical/correlation");

// Streamflow Models
export const getStreamCvSummary = () => fetchApi<any[]>("/api/streamflow/models/cv-summary");
export const getStreamCvFolds = () => fetchApi<any[]>("/api/streamflow/models/cv-folds");
export const getStreamTestMetrics = () => fetchApi<any[]>("/api/streamflow/models/test-metrics");
export const getStreamTestPredictions = () => fetchApi<any[]>("/api/streamflow/models/test-predictions");
export const getStreamFeatureImportance = () => fetchApi<any[]>("/api/streamflow/models/feature-importance");
export const getStreamResiduals = () => fetchApi<any[]>("/api/streamflow/models/residuals");

// Streamflow Future
export const getStreamFutureMonthly = () => fetchApi<any[]>("/api/streamflow/future/monthly");
export const getStreamFutureAnnual = () => fetchApi<any[]>("/api/streamflow/future/annual");
export const getStreamFutureChange = () => fetchApi<{ monthly: any[] }>("/api/streamflow/future/change");
export const getStreamFutureFdc = () => fetchApi<any>("/api/streamflow/future/flow-duration");

// Integrated
export const getWaterBudget = () => fetchApi<any[]>("/api/integrated/water-budget");
export const getSeasonalHeatmap = () => fetchApi<any[]>("/api/integrated/seasonal-heatmap");
export const getDistributionComparison = () => fetchApi<any>("/api/integrated/distribution-comparison");
export const getRiskAssessment = () => fetchApi<any>("/api/integrated/risk-assessment");
export const getTrendsSummary = () => fetchApi<any[]>("/api/integrated/trends-summary");

// Types
export interface PipelineStatus {
  ready: boolean;
  running: boolean;
  status: string;
  last_refreshed: string | null;
  messages: string[];
}

export interface OverviewKpis {
  location: { lat: number; lon: number; catchment_area_km2: number };
  climate_model: string;
  hist_years: string;
  future_years: string;
  mean_annual_precip_mm: number;
  mean_annual_streamflow_m3s: number;
  best_precip_model: string;
  best_precip_r2: number;
  best_streamflow_model: string;
  best_streamflow_r2: number;
  projected_precip_change_pct: number | null;
  projected_streamflow_change_pct: number | null;
}

export interface OverviewTimeline {
  precipitation: { date: string; value: number; type: string }[];
  streamflow: { date: string; value: number; type: string }[];
}
