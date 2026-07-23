import type { DailyPeriod } from "./types";

export type ForecastDaySummary = {
  key: string;
  label: string;
  dateLabel: string;
  highF: number | null;
  lowF: number | null;
  precipitationPct: number | null;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
};

function localDateKey(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function buildForecastDays(periods: DailyPeriod[], timeZone: string, limit = 7): ForecastDaySummary[] {
  const grouped = new Map<string, { daytime?: DailyPeriod; nighttime?: DailyPeriod }>();

  for (const period of periods) {
    const key = localDateKey(period.startTime, timeZone);
    const group = grouped.get(key) ?? {};
    if (period.isDaytime) group.daytime = period;
    else group.nighttime = period;
    grouped.set(key, group);
  }

  return Array.from(grouped.entries()).slice(0, limit).map(([key, group]) => {
    const primary = group.daytime ?? group.nighttime;
    if (!primary) throw new Error(`Forecast period ${key} is empty.`);
    const precipitation = [group.daytime?.precipitationPct, group.nighttime?.precipitationPct]
      .filter((value): value is number => value !== null && value !== undefined);

    return {
      key,
      label: group.daytime?.name ?? group.nighttime?.name ?? primary.name,
      dateLabel: new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
      }).format(new Date(primary.startTime)),
      highF: group.daytime?.temperatureF ?? null,
      lowF: group.nighttime?.temperatureF ?? null,
      precipitationPct: precipitation.length ? Math.max(...precipitation) : null,
      shortForecast: primary.shortForecast,
      detailedForecast: [group.daytime?.detailedForecast, group.nighttime?.detailedForecast]
        .filter(Boolean)
        .join(" Night: "),
      isDaytime: primary.isDaytime,
    };
  });
}
