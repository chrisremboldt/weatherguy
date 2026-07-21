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
  geometry: GeoJsonGeometry | null;
};

export type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
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

export type TafPeriod = {
  from: string;
  to: string;
  change: string;
  probability: number | null;
  wind: string;
  visibility: string;
  ceilingFeet: number | null;
  weather: string | null;
};

export type AviationForecast = {
  raw: string;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  periods: TafPeriod[];
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
  aviationForecast: AviationForecast | null;
  astronomy: Astronomy;
  notices: string[];
};

export type SatelliteProductId =
  | "GEOCOLOR"
  | "13"
  | "09"
  | "DayNightCloudMicroCombo"
  | "EXTENT3"
  | "FireTemperature"
  | "Dust";

export type SatelliteFrame = {
  url: string;
  capturedAt: string;
};

export type SatelliteData = {
  fetchedAt: string;
  satellite: "GOES-18" | "GOES-19";
  sector: string;
  sectorLabel: string;
  product: SatelliteProductId;
  productLabel: string;
  frames: SatelliteFrame[];
  sourceUrl: string;
  notice: string | null;
};

export type RadarProductId = "bref" | "cref" | "velocity" | "hydrometeor" | "rain1h" | "rainstorm";

export type RadarProduct = {
  id: RadarProductId;
  label: string;
  detail: string;
  wmsUrl: string;
  layer: string;
  style: string;
  legendUrl: string;
};

export type RadarData = {
  fetchedAt: string;
  station: string;
  region: string;
  times: string[];
  products: RadarProduct[];
  sourceUrl: string;
};

export type ForecastSignalHour = {
  time: string;
  feelsLikeF: number | null;
  precipitationIn: number | null;
  snowfallIn: number | null;
  cloudCoverPct: number | null;
  freezingLevelFt: number | null;
};

export type ForecastSignals = {
  next24PrecipitationIn: number | null;
  next72PrecipitationIn: number | null;
  next72SnowfallIn: number | null;
  peakCloudCoverPct: number | null;
  freezingLevelFt: number | null;
  bestOutdoorWindow: { start: string; end: string; reason: string } | null;
  hours: ForecastSignalHour[];
};

export type AirQuality = {
  observedAt: string;
  aqi: number | null;
  category: string;
  pm25: number | null;
  ozone: number | null;
  next24High: number | null;
};

export type NearbyEarthquake = {
  magnitude: number | null;
  place: string;
  occurredAt: string;
  distanceMiles: number;
  url: string;
};

export type SpaceWeather = {
  observedAt: string;
  kp: number | null;
  category: string;
};

export type IntelligenceData = {
  fetchedAt: string;
  forecast: ForecastSignals | null;
  airQuality: AirQuality | null;
  earthquake: NearbyEarthquake | null;
  spaceWeather: SpaceWeather | null;
  links: {
    spc: string;
    rivers: string;
    tropical: string;
    fire: string;
    buoys: string;
    aviation: string;
  };
  notices: string[];
};

export type NearbyAirport = {
  id: string;
  name: string;
  flightCategory: string;
  temperatureF: number | null;
  wind: string;
  visibility: string | null;
  observedAt: string;
};

export type PilotReport = {
  observedAt: string;
  aircraft: string;
  altitudeFt: number | null;
  icing: string | null;
  turbulence: string | null;
  weather: string | null;
  raw: string;
};

export type AviationAdvisory = {
  id: string;
  kind: string;
  hazard: string;
  severity: string | null;
  validTo: string;
  raw: string;
};

export type AviationData = {
  fetchedAt: string;
  airports: NearbyAirport[];
  pireps: PilotReport[];
  advisories: AviationAdvisory[];
  notices: string[];
};

export type FavoriteLocation = LocationConfig & {
  id: string;
  label: string;
};

export type DisplayMode = "desk" | "severe" | "aviation" | "minimal";

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
