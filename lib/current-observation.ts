import type { CurrentObservation } from "./types";

// NOAA's NWS and AviationWeather APIs are schemaless until they are normalized here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

type ObservationCandidate = Omit<CurrentObservation, "timestamp" | "description"> & {
  timestamp: string | null;
  description: string | null;
};

const METAR_DESCRIPTORS: Record<string, string> = {
  MI: "Shallow",
  PR: "Partial",
  BC: "Patches of",
  DR: "Low Drifting",
  BL: "Blowing",
  SH: "Showers",
  TS: "Thunderstorm",
  FZ: "Freezing",
};

const METAR_PHENOMENA: Record<string, string> = {
  DZ: "Drizzle",
  RA: "Rain",
  SN: "Snow",
  SG: "Snow Grains",
  IC: "Ice Crystals",
  PL: "Ice Pellets",
  GR: "Hail",
  GS: "Small Hail",
  UP: "Unknown Precipitation",
  BR: "Mist",
  FG: "Fog",
  FU: "Smoke",
  VA: "Volcanic Ash",
  DU: "Dust",
  SA: "Sand",
  HZ: "Haze",
  PY: "Spray",
  PO: "Dust Whirls",
  SQ: "Squall",
  FC: "Funnel Cloud",
  SS: "Sandstorm",
  DS: "Duststorm",
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function celsiusToFahrenheit(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round((parsed * 9) / 5 + 32);
}

function kilometersPerHourToMph(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 0.621371);
}

function knotsToMph(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 1.15078);
}

function metersToMiles(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 0.000621371 * 10) / 10;
}

function metarVisibilityMiles(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pascalsToInHg(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 0.0002953 * 100) / 100;
}

function metarAltimeterToInHg(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  const inches = parsed > 100 ? parsed * 0.02953 : parsed;
  return Math.round(inches * 100) / 100;
}

function relativeHumidity(temperatureC: number | null, dewpointC: number | null) {
  if (temperatureC === null || dewpointC === null) return null;
  const vapor = Math.exp((17.625 * dewpointC) / (243.04 + dewpointC));
  const saturation = Math.exp((17.625 * temperatureC) / (243.04 + temperatureC));
  return Math.max(0, Math.min(100, Math.round((vapor / saturation) * 100)));
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function metarObservationTimestamp(metar: JsonRecord | undefined): string | null {
  if (!metar) return null;
  if (typeof metar.obsTime === "number" && Number.isFinite(metar.obsTime)) {
    const milliseconds = metar.obsTime > 1_000_000_000_000 ? metar.obsTime : metar.obsTime * 1000;
    const observedAt = new Date(milliseconds);
    if (Number.isFinite(observedAt.getTime())) return observedAt.toISOString();
  }
  return isoTimestamp(metar.reportTime) ?? isoTimestamp(metar.receiptTime);
}

function decodeMetarToken(rawToken: string) {
  let token = rawToken.toUpperCase();
  const words: string[] = [];

  if (token.startsWith("+")) {
    words.push("Heavy");
    token = token.slice(1);
  } else if (token.startsWith("-")) {
    words.push("Light");
    token = token.slice(1);
  }

  if (token.startsWith("VC")) {
    words.push("Nearby");
    token = token.slice(2);
  }

  const descriptor = METAR_DESCRIPTORS[token.slice(0, 2)];
  if (descriptor) {
    words.push(descriptor);
    token = token.slice(2);
  }

  for (let index = 0; index < token.length; index += 2) {
    const phenomenon = METAR_PHENOMENA[token.slice(index, index + 2)];
    if (phenomenon) words.push(phenomenon);
  }

  return words.join(" ");
}

function metarDescription(metar: JsonRecord): string | null {
  if (typeof metar.wxString === "string" && metar.wxString.trim()) {
    const decoded = metar.wxString
      .trim()
      .split(/\s+/)
      .map(decodeMetarToken)
      .filter(Boolean);
    if (decoded.length) return decoded.join(" · ");
  }

  const clouds = Array.isArray(metar.clouds) ? metar.clouds : [];
  const covers = clouds.map((cloud: JsonRecord) => String(cloud.cover ?? "").toUpperCase());
  if (covers.some((cover: string) => cover === "VV" || cover === "OVC")) return "Overcast";
  if (covers.includes("BKN")) return "Mostly Cloudy";
  if (covers.includes("SCT")) return "Partly Cloudy";
  if (covers.includes("FEW")) return "A Few Clouds";
  if (covers.some((cover: string) => cover === "CLR" || cover === "SKC")) return "Clear";
  return null;
}

function normalizeNwsObservation(observation: JsonRecord): ObservationCandidate {
  const properties = observation.properties ?? {};
  return {
    timestamp: isoTimestamp(properties.timestamp),
    source: "NWS",
    description: properties.textDescription || null,
    temperatureF: celsiusToFahrenheit(properties.temperature?.value),
    dewpointF: celsiusToFahrenheit(properties.dewpoint?.value),
    humidityPct: numberOrNull(properties.relativeHumidity?.value),
    windDirectionDeg: numberOrNull(properties.windDirection?.value),
    windSpeedMph: kilometersPerHourToMph(properties.windSpeed?.value),
    windGustMph: kilometersPerHourToMph(properties.windGust?.value),
    visibilityMiles: metersToMiles(properties.visibility?.value),
    pressureInHg: pascalsToInHg(properties.barometricPressure?.value),
  };
}

function normalizeMetarObservation(metar: JsonRecord | undefined): ObservationCandidate | null {
  if (!metar) return null;
  const temperatureC = numberOrNull(metar.temp);
  const dewpointC = numberOrNull(metar.dewp);
  return {
    timestamp: metarObservationTimestamp(metar),
    source: "METAR",
    description: metarDescription(metar),
    temperatureF: celsiusToFahrenheit(temperatureC),
    dewpointF: celsiusToFahrenheit(dewpointC),
    humidityPct: relativeHumidity(temperatureC, dewpointC),
    windDirectionDeg: numberOrNull(metar.wdir),
    windSpeedMph: knotsToMph(metar.wspd),
    windGustMph: knotsToMph(metar.wgst),
    visibilityMiles: metarVisibilityMiles(metar.visib),
    pressureInHg: metarAltimeterToInHg(metar.altim),
  };
}

function timestampValue(candidate: ObservationCandidate) {
  if (!candidate.timestamp) return Number.NEGATIVE_INFINITY;
  const milliseconds = Date.parse(candidate.timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : Number.NEGATIVE_INFINITY;
}

function firstValue<K extends keyof ObservationCandidate>(
  candidates: ObservationCandidate[],
  key: K,
): ObservationCandidate[K] {
  for (const candidate of candidates) {
    const value = candidate[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null as ObservationCandidate[K];
}

export function selectCurrentObservation(
  nwsObservation: JsonRecord,
  metar?: JsonRecord,
): CurrentObservation {
  const candidates = [normalizeNwsObservation(nwsObservation), normalizeMetarObservation(metar)]
    .filter((candidate): candidate is ObservationCandidate => candidate !== null)
    .sort((left, right) => timestampValue(right) - timestampValue(left));
  const primary = candidates[0];

  return {
    timestamp: primary.timestamp ?? new Date().toISOString(),
    source: primary.source,
    description: firstValue(candidates, "description") ?? "Observation available",
    temperatureF: firstValue(candidates, "temperatureF"),
    dewpointF: firstValue(candidates, "dewpointF"),
    humidityPct: firstValue(candidates, "humidityPct"),
    windDirectionDeg: firstValue(candidates, "windDirectionDeg"),
    windSpeedMph: firstValue(candidates, "windSpeedMph"),
    // A METAR without a gust reports steady wind; do not revive an older gust value.
    windGustMph: primary.source === "METAR" ? primary.windGustMph : firstValue(candidates, "windGustMph"),
    visibilityMiles: firstValue(candidates, "visibilityMiles"),
    pressureInHg: firstValue(candidates, "pressureInHg"),
  };
}
