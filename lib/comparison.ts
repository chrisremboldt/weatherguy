import type { HourlyPeriod, LocationConfig } from "./types";

export const COMPARISON_STORAGE_KEY = "weatherguy-compare-location";

export type AlignedComparisonHour = {
  startTime: string;
  primary: HourlyPeriod | null;
  secondary: HourlyPeriod | null;
};

function copyParams(input: URLSearchParams | string) {
  return new URLSearchParams(typeof input === "string" ? input.replace(/^\?/, "") : input);
}

export function isValidLocationConfig(value: unknown): value is LocationConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocationConfig>;
  return (
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180 &&
    (candidate.customLabel === undefined || typeof candidate.customLabel === "string")
  );
}

export function sameComparisonLocation(left: LocationConfig, right: LocationConfig) {
  return (
    left.latitude.toFixed(4) === right.latitude.toFixed(4) &&
    left.longitude.toFixed(4) === right.longitude.toFixed(4)
  );
}

export function comparisonLocationFromParams(input: URLSearchParams | string): LocationConfig | null {
  const params = copyParams(input);
  const latitudeValue = params.get("compareLat");
  const longitudeValue = params.get("compareLon");
  if (latitudeValue === null || longitudeValue === null) return null;

  const location: LocationConfig = {
    latitude: Number(latitudeValue),
    longitude: Number(longitudeValue),
    customLabel: params.get("compareLocation")?.trim().slice(0, 120) || undefined,
  };
  return isValidLocationConfig(location) ? location : null;
}

export function withComparisonLocation(
  input: URLSearchParams | string,
  location: LocationConfig,
) {
  const params = copyParams(input);
  params.set("view", "compare");
  params.set("compareLat", location.latitude.toFixed(4));
  params.set("compareLon", location.longitude.toFixed(4));
  if (location.customLabel) params.set("compareLocation", location.customLabel.slice(0, 120));
  else params.delete("compareLocation");
  return params;
}

export function withoutComparisonLocation(input: URLSearchParams | string) {
  const params = copyParams(input);
  params.delete("view");
  params.delete("compareLat");
  params.delete("compareLon");
  params.delete("compareLocation");
  return params;
}

export function alignHourlyPeriods(
  primary: HourlyPeriod[],
  secondary: HourlyPeriod[],
  limit = 6,
): AlignedComparisonHour[] {
  if (limit <= 0) return [];
  const primaryByTime = new Map(
    primary
      .filter((period) => Number.isFinite(Date.parse(period.startTime)))
      .map((period) => [new Date(period.startTime).toISOString(), period]),
  );
  const secondaryByTime = new Map(
    secondary
      .filter((period) => Number.isFinite(Date.parse(period.startTime)))
      .map((period) => [new Date(period.startTime).toISOString(), period]),
  );
  const primaryStart = Math.min(...Array.from(primaryByTime.keys(), Date.parse));
  const secondaryStart = Math.min(...Array.from(secondaryByTime.keys(), Date.parse));
  const availableStarts = [primaryStart, secondaryStart].filter(Number.isFinite);
  if (!availableStarts.length) return [];
  const sharedWindowStart = primaryByTime.size && secondaryByTime.size
    ? Math.max(primaryStart, secondaryStart)
    : Math.min(...availableStarts);
  const times = Array.from(new Set([...primaryByTime.keys(), ...secondaryByTime.keys()]))
    .filter((time) => Date.parse(time) >= sharedWindowStart)
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .slice(0, limit);

  return times.map((startTime) => ({
    startTime,
    primary: primaryByTime.get(startTime) ?? null,
    secondary: secondaryByTime.get(startTime) ?? null,
  }));
}

export function comparisonDeltaLabel(
  primary: number | null,
  secondary: number | null,
  unit: string,
  precision = 0,
) {
  if (primary === null || secondary === null) return "—";
  const difference = secondary - primary;
  const rounded = Number(difference.toFixed(precision));
  if (rounded === 0) return "Even";
  const warmerSide = rounded > 0 ? "B" : "A";
  return `${warmerSide} +${Math.abs(rounded).toFixed(precision)}${unit}`;
}
