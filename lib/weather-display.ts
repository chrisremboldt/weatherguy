import type { HourlyPeriod } from "./types";

const HOUR_MS = 60 * 60 * 1_000;

export function apparentTemperatureF(
  temperatureF: number | null,
  humidityPct: number | null,
  windSpeedMph: number | null,
) {
  if (temperatureF === null) return null;
  if (temperatureF >= 80 && humidityPct !== null && humidityPct >= 40) {
    const humidity = humidityPct;
    const heatIndex =
      -42.379 +
      2.04901523 * temperatureF +
      10.14333127 * humidity -
      0.22475541 * temperatureF * humidity -
      0.00683783 * temperatureF ** 2 -
      0.05481717 * humidity ** 2 +
      0.00122874 * temperatureF ** 2 * humidity +
      0.00085282 * temperatureF * humidity ** 2 -
      0.00000199 * temperatureF ** 2 * humidity ** 2;
    return Math.round(heatIndex);
  }
  if (temperatureF <= 50 && windSpeedMph !== null && windSpeedMph > 3) {
    const windFactor = windSpeedMph ** 0.16;
    return Math.round(35.74 + 0.6215 * temperatureF - 35.75 * windFactor + 0.4275 * temperatureF * windFactor);
  }
  return Math.round(temperatureF);
}

export function currentAndFutureHourlyPeriods(
  periods: HourlyPeriod[],
  referenceMs: number,
  limit = 9,
) {
  return periods
    .filter((period) => Date.parse(period.startTime) + HOUR_MS > referenceMs)
    .slice(0, limit);
}

export function nextHourlyPeriods(
  periods: HourlyPeriod[],
  referenceMs: number,
  limit = 3,
) {
  return periods
    .filter((period) => Date.parse(period.startTime) >= referenceMs)
    .slice(0, limit);
}

export function maximumPrecipitationPct(
  periods: Array<{ precipitationPct: number | null }>,
) {
  const values = periods
    .map((period) => period.precipitationPct)
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

export function precipitationChanceLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}
