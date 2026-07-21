export type DashboardLocation = {
  city: string;
  state: string;
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  wfo: string;
  radarStation: string;
  stationId: string;
  stationName: string;
};

export type CurrentObservation = {
  timestamp: string;
  description: string;
  temperatureF: number | null;
  dewpointF: number | null;
  humidityPct: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  windGustMph: number | null;
  visibilityMiles: number | null;
  pressureInHg: number | null;
};

export type HourlyPeriod = {
  startTime: string;
  temperatureF: number;
  shortForecast: string;
  isDaytime: boolean;
  precipitationPct: number | null;
  humidityPct: number | null;
  windSpeed: string;
  windDirection: string;
};

export type DailyPeriod = {
  startTime: string;
  name: string;
  temperatureF: number;
  temperatureTrend: string | null;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
  precipitationPct: number | null;
  windSpeed: string;
  windDirection: string;
};

export type WeatherAlert = {
  id: string;
  event: string;
  headline: string;
  severity: string;
  urgency: string;
  area: string;
  description: string;
  instruction: string | null;
  effective: string;
  expires: string;
};

export type ForecastDiscussion = {
  issuedAt: string;
  summary: string;
  aviation: string | null;
  sourceUrl: string;
};

export type AviationObservation = {
  raw: string;
  flightCategory: string;
  observedAt: string;
  visibility: string | null;
  ceilingFeet: number | null;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  altimeterInHg: number | null;
};

export type Astronomy = {
  sunrise: string | null;
  sunset: string | null;
};

export type WeatherDashboardData = {
  fetchedAt: string;
  location: DashboardLocation;
  current: CurrentObservation;
  hourly: HourlyPeriod[];
  daily: DailyPeriod[];
  alerts: WeatherAlert[];
  discussion: ForecastDiscussion | null;
  aviation: AviationObservation | null;
  astronomy: Astronomy;
  notices: string[];
};

export type LocationConfig = {
  latitude: number;
  longitude: number;
  customLabel?: string;
};

export type LocationSearchResult = {
  id: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  label: string;
};
