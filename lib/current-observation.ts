import type {
  CurrentObservation,
  ObservationHistoryPoint,
  ObservedSkyCondition,
} from "./types";

// NOAA's NWS and AviationWeather APIs are schemaless until they are normalized here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

type ObservationCandidate = Omit<CurrentObservation, "timestamp" | "description"> & {
  timestamp: string | null;
  description: string | null;
};

type SkyCover = ObservedSkyCondition["cover"];

type ReportedSkyLayer = {
  cover: SkyCover;
  baseFeet: number | null;
};

const CEILING_COVERS = new Set<SkyCover>(["BKN", "OVC", "VV"]);
const NON_CEILING_COVERS = new Set<SkyCover>(["FEW", "SCT"]);
const CLEAR_COVERS = new Set<SkyCover>(["CLR", "SKC", "CAVOK"]);

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

function skyCover(value: unknown): SkyCover | null {
  if (typeof value !== "string") return null;
  const cover = value.trim().toUpperCase() === "OVX"
    ? "VV"
    : value.trim().toUpperCase();
  return CEILING_COVERS.has(cover as SkyCover)
    || NON_CEILING_COVERS.has(cover as SkyCover)
    || CLEAR_COVERS.has(cover as SkyCover)
    ? cover as SkyCover
    : null;
}

function selectLowestLayer(layers: ReportedSkyLayer[]) {
  if (!layers.length) return null;
  if (layers.some((layer) => layer.baseFeet === null)) return layers[0];
  return layers.reduce((lowest, layer) => (
    (layer.baseFeet ?? Number.POSITIVE_INFINITY) < (lowest.baseFeet ?? Number.POSITIVE_INFINITY)
      ? layer
      : lowest
  ));
}

function summarizeSkyLayers(layers: ReportedSkyLayer[]): ObservedSkyCondition | null {
  const ceiling = selectLowestLayer(layers.filter((layer) => CEILING_COVERS.has(layer.cover)));
  if (ceiling) {
    return {
      kind: "ceiling",
      cover: ceiling.cover as "BKN" | "OVC" | "VV",
      baseFeet: ceiling.baseFeet,
    };
  }

  const lowestLayer = selectLowestLayer(layers.filter((layer) => NON_CEILING_COVERS.has(layer.cover)));
  if (lowestLayer) {
    return {
      kind: "layer",
      cover: lowestLayer.cover as "FEW" | "SCT",
      baseFeet: lowestLayer.baseFeet,
    };
  }

  const clear = layers.find((layer) => CLEAR_COVERS.has(layer.cover));
  return clear
    ? {
        kind: "clear-report",
        cover: clear.cover as "CLR" | "SKC" | "CAVOK",
        baseFeet: null,
      }
    : null;
}

function parseRawMetarSky(raw: unknown): ReportedSkyLayer[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const reportBody = raw.toUpperCase().split(/\s+RMK(?:\s+|$)/)[0];
  const layers: ReportedSkyLayer[] = [];

  for (const rawToken of reportBody.trim().split(/\s+/)) {
    const token = rawToken.replace(/=$/, "");
    const clear = skyCover(token);
    if (clear && CLEAR_COVERS.has(clear)) {
      layers.push({ cover: clear, baseFeet: null });
      continue;
    }

    const layerMatch = token.match(/^(FEW|SCT|BKN|OVC)(\d{3}|\/{3})(?:CB|TCU)?$/);
    if (layerMatch) {
      layers.push({
        cover: layerMatch[1] as SkyCover,
        baseFeet: layerMatch[2] === "///" ? null : Number(layerMatch[2]) * 100,
      });
      continue;
    }

    const verticalVisibility = token.match(/^VV(\d{3}|\/{3})$/);
    if (verticalVisibility) {
      layers.push({
        cover: "VV",
        baseFeet: verticalVisibility[1] === "///" ? null : Number(verticalVisibility[1]) * 100,
      });
    }
  }

  return layers;
}

export function normalizeMetarSkyCondition(metar: JsonRecord | undefined): ObservedSkyCondition | null {
  if (!metar) return null;
  const structuredLayers = (Array.isArray(metar.clouds) ? metar.clouds : [])
    .map((cloud: JsonRecord): ReportedSkyLayer | null => {
      const cover = skyCover(cloud.cover);
      if (!cover) return null;
      return {
        cover,
        baseFeet: CLEAR_COVERS.has(cover) ? null : numberOrNull(cloud.base),
      };
    })
    .filter((layer: ReportedSkyLayer | null): layer is ReportedSkyLayer => layer !== null);

  return summarizeSkyLayers(structuredLayers)
    ?? summarizeSkyLayers(parseRawMetarSky(metar.rawOb));
}

function nwsBaseFeet(base: unknown): number | null {
  if (!base || typeof base !== "object") return null;
  const value = numberOrNull((base as JsonRecord).value);
  const unit = (base as JsonRecord).unitCode;
  if (value === null || typeof unit !== "string") return null;
  if (unit === "wmoUnit:m") return Math.round((value * 3.28084) / 100) * 100;
  if (unit === "wmoUnit:ft") return Math.round(value);
  return null;
}

export function normalizeNwsSkyCondition(observation: JsonRecord): ObservedSkyCondition | null {
  const cloudLayers = observation.properties?.cloudLayers;
  if (!Array.isArray(cloudLayers)) return null;
  const layers = cloudLayers
    .map((cloud: JsonRecord): ReportedSkyLayer | null => {
      const cover = skyCover(cloud.amount);
      if (!cover) return null;
      return {
        cover,
        baseFeet: CLEAR_COVERS.has(cover) ? null : nwsBaseFeet(cloud.base),
      };
    })
    .filter((layer: ReportedSkyLayer | null): layer is ReportedSkyLayer => layer !== null);
  return summarizeSkyLayers(layers);
}

function skyDescription(condition: ObservedSkyCondition | null) {
  if (!condition) return null;
  switch (condition.cover) {
    case "VV": return "Sky Obscured";
    case "OVC": return "Overcast";
    case "BKN": return "Mostly Cloudy";
    case "SCT": return "Partly Cloudy";
    case "FEW": return "A Few Clouds";
    case "CAVOK": return "No Significant Weather";
    case "CLR":
    case "SKC":
      return "Clear";
  }
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

function historyPoint(candidate: ObservationCandidate): ObservationHistoryPoint | null {
  if (!candidate.timestamp) return null;
  const hasSignal = [
    candidate.temperatureF,
    candidate.dewpointF,
    candidate.pressureInHg,
    candidate.windSpeedMph,
    candidate.windGustMph,
  ].some((value) => value !== null);
  if (!hasSignal) return null;

  return {
    timestamp: candidate.timestamp,
    source: candidate.source,
    temperatureF: candidate.temperatureF,
    dewpointF: candidate.dewpointF,
    pressureInHg: candidate.pressureInHg,
    windSpeedMph: candidate.windSpeedMph,
    windGustMph: candidate.windGustMph,
  };
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

function metarDescription(metar: JsonRecord, condition: ObservedSkyCondition | null): string | null {
  if (typeof metar.wxString === "string" && metar.wxString.trim()) {
    const decoded = metar.wxString
      .trim()
      .split(/\s+/)
      .map(decodeMetarToken)
      .filter(Boolean);
    if (decoded.length) return decoded.join(" · ");
  }

  return skyDescription(condition);
}

function normalizeNwsObservation(observation: JsonRecord): ObservationCandidate {
  const properties = observation.properties ?? {};
  const skyCondition = normalizeNwsSkyCondition(observation);
  return {
    timestamp: isoTimestamp(properties.timestamp),
    source: "NWS",
    description: properties.textDescription || skyDescription(skyCondition),
    temperatureF: celsiusToFahrenheit(properties.temperature?.value),
    dewpointF: celsiusToFahrenheit(properties.dewpoint?.value),
    humidityPct: numberOrNull(properties.relativeHumidity?.value),
    windDirectionDeg: numberOrNull(properties.windDirection?.value),
    windSpeedMph: kilometersPerHourToMph(properties.windSpeed?.value),
    windGustMph: kilometersPerHourToMph(properties.windGust?.value),
    visibilityMiles: metersToMiles(properties.visibility?.value),
    pressureInHg: pascalsToInHg(properties.barometricPressure?.value),
    skyCondition,
  };
}

function normalizeMetarObservation(metar: JsonRecord | undefined): ObservationCandidate | null {
  if (!metar) return null;
  const temperatureC = numberOrNull(metar.temp);
  const dewpointC = numberOrNull(metar.dewp);
  const skyCondition = normalizeMetarSkyCondition(metar);
  return {
    timestamp: metarObservationTimestamp(metar),
    source: "METAR",
    description: metarDescription(metar, skyCondition),
    temperatureF: celsiusToFahrenheit(temperatureC),
    dewpointF: celsiusToFahrenheit(dewpointC),
    humidityPct: relativeHumidity(temperatureC, dewpointC),
    windDirectionDeg: numberOrNull(metar.wdir),
    windSpeedMph: knotsToMph(metar.wspd),
    windGustMph: knotsToMph(metar.wgst),
    visibilityMiles: metarVisibilityMiles(metar.visib),
    pressureInHg: metarAltimeterToInHg(metar.altim),
    skyCondition,
  };
}

function timestampValue(candidate: ObservationCandidate) {
  if (!candidate.timestamp) return Number.NEGATIVE_INFINITY;
  const milliseconds = Date.parse(candidate.timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : Number.NEGATIVE_INFINITY;
}

function maximumKnown(...values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => value !== null && value !== undefined);
  return known.length ? Math.max(...known) : null;
}

export function selectObservationHistory(
  nwsCollection: JsonRecord | null,
  metars: JsonRecord[],
): ObservationHistoryPoint[] {
  const collapseHourly = (points: ObservationHistoryPoint[]) => {
    const sorted = [...points].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
    const latestTime = Date.parse(sorted.at(-1)?.timestamp ?? "");
    const recent = Number.isFinite(latestTime)
      ? sorted.filter((point) => Date.parse(point.timestamp) >= latestTime - 6 * 3_600_000)
      : sorted;
    const buckets = new Map<number, ObservationHistoryPoint>();

    for (const point of recent) {
      const bucket = Math.floor(Date.parse(point.timestamp) / 3_600_000);
      const existing = buckets.get(bucket);
      buckets.set(bucket, {
        ...point,
        windSpeedMph: maximumKnown(existing?.windSpeedMph, point.windSpeedMph),
        windGustMph: maximumKnown(existing?.windGustMph, point.windGustMph),
      });
    }

    return Array.from(buckets.values()).slice(-7);
  };
  const nwsPoints = (nwsCollection?.features ?? [])
    .map((feature: JsonRecord) => historyPoint(normalizeNwsObservation(feature)))
    .filter((point: ObservationHistoryPoint | null): point is ObservationHistoryPoint => point !== null);
  const metarPoints = metars
    .map((metar) => normalizeMetarObservation(metar))
    .map((candidate) => candidate ? historyPoint(candidate) : null)
    .filter((point): point is ObservationHistoryPoint => point !== null);

  // Merge both same-station feeds, then keep the newest report in each hour.
  // This prevents a longer but stale series from ending before “Right now.”
  return collapseHourly([...nwsPoints, ...metarPoints]);
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
    description: primary.description ?? "Conditions not reported",
    temperatureF: primary.temperatureF,
    dewpointF: primary.dewpointF,
    humidityPct: primary.humidityPct,
    windDirectionDeg: primary.windDirectionDeg,
    windSpeedMph: primary.windSpeedMph,
    windGustMph: primary.windGustMph,
    visibilityMiles: primary.visibilityMiles,
    pressureInHg: primary.pressureInHg,
    skyCondition: primary.skyCondition,
  };
}
