import type { ForecastSignalHour, ForecastSignals, UvForecastDay } from "@/lib/types";

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

function roundedUv(value: unknown) {
  const index = numberOrNull(value);
  return index === null ? null : Math.max(0, Math.round(index * 10) / 10);
}

export function uvRisk(index: number | null) {
  if (index === null) return { category: "Unavailable", guidance: "UV guidance is unavailable" };
  if (index < 3) return { category: "Low", guidance: "Minimal protection needed" };
  if (index < 6) return { category: "Moderate", guidance: "Use shade, SPF 30, a hat, and sunglasses" };
  if (index < 8) return { category: "High", guidance: "Reduce midday exposure and use full sun protection" };
  if (index < 11) return { category: "Very high", guidance: "Extra protection; avoid prolonged midday exposure" };
  return { category: "Extreme", guidance: "Avoid midday exposure and use full sun protection" };
}

function localDateKey(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
      uvIndex: roundedUv(hourly.uv_index?.[index]),
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
  const currentUvIndex = roundedUv(payload.current?.uv_index) ?? hours[0]?.uvIndex ?? null;
  const currentUvRisk = uvRisk(currentUvIndex);
  const next24UvHours = hours.slice(0, 24).filter(
    (hour): hour is ForecastSignalHour & { uvIndex: number } => hour.uvIndex !== null,
  );
  const peakUvHour = next24UvHours.reduce<(ForecastSignalHour & { uvIndex: number }) | null>(
    (peak, hour) => !peak || hour.uvIndex > peak.uvIndex ? hour : peak,
    null,
  );
  const next24UvIndexMax = peakUvHour?.uvIndex ?? null;
  const next24UvRisk = uvRisk(next24UvIndexMax);
  const timeZone = typeof payload.timezone === "string" ? payload.timezone : "UTC";
  const dailyUv = new Map<string, UvForecastDay>();
  for (const hour of hours) {
    if (hour.uvIndex === null) continue;
    const key = localDateKey(hour.time, timeZone);
    const previous = dailyUv.get(key);
    if (!previous || hour.uvIndex > previous.maxIndex) {
      dailyUv.set(key, {
        date: hour.time,
        maxIndex: hour.uvIndex,
        category: uvRisk(hour.uvIndex).category,
      });
    }
  }

  return {
    next24PrecipitationIn: nws24 ?? roundedSum(hours.slice(0, 24).map((hour) => hour.precipitationIn)),
    next72PrecipitationIn: nws72 ?? roundedSum(hours.map((hour) => hour.precipitationIn)),
    next72SnowfallIn: roundedSum(hours.map((hour) => hour.snowfallIn)),
    peakCloudCoverPct: hours.length ? Math.round(Math.max(...hours.map((hour) => hour.cloudCoverPct ?? 0))) : null,
    freezingLevelFt: hours[0]?.freezingLevelFt ?? null,
    bestOutdoorWindow,
    currentUvIndex,
    currentUvCategory: currentUvRisk.category,
    next24UvIndexMax,
    next24UvPeakAt: peakUvHour?.time ?? null,
    next24UvCategory: next24UvRisk.category,
    uvGuidance: next24UvRisk.guidance,
    uvForecast: [...dailyUv.values()].slice(0, 3),
    hours: hours.slice(0, 24),
  };
}
