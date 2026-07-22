import type { ForecastSignalHour, ForecastSignals } from "@/lib/types";

// External forecast payloads are schemaless until normalized here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundedSum(values: unknown[]) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) * 100) / 100 : null;
}

function isoDurationMs(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const duration = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1_000;
  return duration > 0 ? duration : null;
}

export function nwsPrecipitationIn(field: JsonRecord | undefined, horizonHours: number, nowMs = Date.now()) {
  if (!field || field.uom !== "wmoUnit:mm" || !Array.isArray(field.values)) return null;
  const windowEnd = nowMs + horizonHours * 3_600_000;
  let totalMm = 0;
  let hasForecast = false;

  for (const period of field.values) {
    if (typeof period?.validTime !== "string" || typeof period?.value !== "number" || !Number.isFinite(period.value)) continue;
    const [startIso, durationIso] = period.validTime.split("/");
    const start = Date.parse(startIso);
    const duration = isoDurationMs(durationIso);
    if (!Number.isFinite(start) || duration === null) continue;
    const end = start + duration;
    const overlap = Math.max(0, Math.min(end, windowEnd) - Math.max(start, nowMs));
    if (overlap <= 0) continue;
    hasForecast = true;
    totalMm += period.value * (overlap / duration);
  }

  return hasForecast ? Math.round((totalMm / 25.4) * 100) / 100 : null;
}

export function normalizeForecast(payload: JsonRecord, nwsGrid: JsonRecord | null = null, nowMs = Date.now()): ForecastSignals {
  const hourly = payload.hourly ?? {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const nowSeconds = nowMs / 1000;
  const futureIndex = times.findIndex((time: unknown) => typeof time === "number" && time >= nowSeconds);
  const firstFuture = futureIndex === -1 ? times.length : futureIndex;
  const at = (key: string, index: number) => numberOrNull(hourly[key]?.[index]);
  const hours: ForecastSignalHour[] = times.slice(firstFuture, firstFuture + 72).map((time: number, offset: number) => {
    const index = firstFuture + offset;
    return {
      time: new Date(time * 1000).toISOString(),
      feelsLikeF: at("apparent_temperature", index),
      precipitationIn: at("precipitation", index),
      snowfallIn: at("snowfall", index),
      cloudCoverPct: at("cloud_cover", index),
      freezingLevelFt: at("freezing_level_height", index),
    };
  });

  let bestOutdoorWindow: ForecastSignals["bestOutdoorWindow"] = null;
  for (let index = 0; index <= Math.min(hours.length - 3, 30); index += 1) {
    const sample = hours.slice(index, index + 3);
    const suitable = sample.every(
      (hour) =>
        (hour.precipitationIn ?? 0) < 0.03 &&
        (hour.cloudCoverPct ?? 0) < 78 &&
        (hour.feelsLikeF ?? 65) >= 45 &&
        (hour.feelsLikeF ?? 65) <= 88,
    );
    if (suitable) {
      bestOutdoorWindow = {
        start: sample[0].time,
        end: new Date(new Date(sample[2].time).getTime() + 3_600_000).toISOString(),
        reason: "Three dry hours with manageable cloud cover and apparent temperature",
      };
      break;
    }
  }

  const quantitativePrecipitation = nwsGrid?.properties?.quantitativePrecipitation;
  const nws24 = nwsPrecipitationIn(quantitativePrecipitation, 24, nowMs);
  const nws72 = nwsPrecipitationIn(quantitativePrecipitation, 72, nowMs);

  return {
    next24PrecipitationIn: nws24 ?? roundedSum(hours.slice(0, 24).map((hour) => hour.precipitationIn)),
    next72PrecipitationIn: nws72 ?? roundedSum(hours.map((hour) => hour.precipitationIn)),
    next72SnowfallIn: roundedSum(hours.map((hour) => hour.snowfallIn)),
    peakCloudCoverPct: hours.length ? Math.round(Math.max(...hours.map((hour) => hour.cloudCoverPct ?? 0))) : null,
    freezingLevelFt: hours[0]?.freezingLevelFt ?? null,
    bestOutdoorWindow,
    hours: hours.slice(0, 24),
  };
}
