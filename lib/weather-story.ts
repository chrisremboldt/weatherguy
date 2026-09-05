import type { HourlyPeriod, IntelligenceData, WeatherAlert, WeatherDashboardData } from "./types";

export type WeatherStoryTone = "calm" | "watch" | "urgent" | "muted";

export type WeatherStory = {
  eyebrow: string;
  headline: string;
  summary: string;
  tone: WeatherStoryTone;
  nextChange: { title: string; detail: string; time: string; timeLabel: string } | null;
  outdoorWindow: { title: string; detail: string; start: string; end: string; timeLabel: string } | null;
  insights: Array<{ label: string; value: string; detail: string; tone: WeatherStoryTone }>;
  updatedLabel: string;
};

const HOUR = 3_600_000;
const FRESH_FOR = 90 * 60_000;
const PRECIPITATION = /rain|shower|drizzle|snow|sleet|hail|thunder|freezing/i;
const OUTDOOR_HAZARD = /rain|shower|drizzle|snow|sleet|hail|thunder|freezing|fog|smoke|dust|hurricane|tornado|blizzard/i;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function probability(value: number | null) {
  return finite(value) && value >= 0 && value <= 100 ? value : null;
}

function windMph(value: string) {
  if (/^calm$/i.test(value.trim())) return 0;
  // NWS wind strings use mph; unknown units must not become calm wind.
  if (!/\bmph\b/i.test(value)) return null;
  const speeds = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
  return speeds?.length ? Math.max(...speeds) : null;
}

function isFresh(timestamp: string, now: number) {
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= FRESH_FOR;
}

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return "UTC";
  }
}

function timeLabel(timestamp: string | number, now: number, timeZone: string) {
  const date = new Date(timestamp);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const sameDay = day.format(date) === day.format(now);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(sameDay ? {} : { weekday: "short" as const }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function activeAlerts(alerts: WeatherAlert[], now: number) {
  const severity: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  return alerts
    .filter((alert) => !Number.isFinite(Date.parse(alert.expires)) || Date.parse(alert.expires) > now)
    .sort((a, b) => (severity[a.severity] ?? 4) - (severity[b.severity] ?? 4));
}

function chronologicalHours(hours: HourlyPeriod[], now: number) {
  const seen = new Set<number>();
  return hours
    .filter((hour) => {
      const time = Date.parse(hour.startTime);
      return Number.isFinite(time) && time + HOUR > now && time < now + 24 * HOUR;
    })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .filter((hour) => {
      const time = Date.parse(hour.startTime);
      if (seen.has(time)) return false;
      seen.add(time);
      return true;
    });
}

function findNextChange(hours: HourlyPeriod[], now: number, timeZone: string): WeatherStory["nextChange"] {
  const baseline = hours[0];
  if (!baseline) return null;
  for (let index = 1; index < hours.length; index += 1) {
    const hour = hours[index];
    const previous = hours[index - 1];
    const time = Date.parse(hour.startTime);
    if (time < now || time > now + 12 * HOUR) continue;
    // A missing hour cannot establish when a change begins.
    if (time - Date.parse(previous.startTime) !== HOUR) continue;
    const chance = probability(hour.precipitationPct);
    const previousChance = probability(previous.precipitationPct);
    const wind = windMph(hour.windSpeed);
    const previousWind = windMph(previous.windSpeed);
    let title = "";
    let detail = "";
    if (/thunder/i.test(hour.shortForecast) && !/thunder/i.test(previous.shortForecast)) {
      title = "Thunderstorms enter the forecast";
      detail = `${hour.shortForecast}. Check the radar and current alerts before heading out.`;
    } else if (chance !== null && previousChance !== null && chance >= 40 && previousChance < 40) {
      title = "Precipitation chances rise";
      detail = `The hourly chance rises from ${previousChance}% to ${chance}%. ${hour.shortForecast}.`;
    } else if (chance !== null && previousChance !== null && chance <= 20 && previousChance >= 40 && !PRECIPITATION.test(hour.shortForecast)) {
      title = "A lower chance of precipitation";
      detail = `The hourly chance falls to ${chance}%. ${hour.shortForecast}.`;
    } else if (wind !== null && previousWind !== null && wind >= 20 && wind - previousWind >= 10) {
      title = "The wind picks up";
      detail = `${hour.windDirection} winds ${hour.windSpeed} in the hourly forecast.`;
    } else if (finite(hour.temperatureF) && finite(baseline.temperatureF) && Math.abs(hour.temperatureF - baseline.temperatureF) >= 8) {
      const rising = hour.temperatureF > baseline.temperatureF;
      title = rising ? "A warmer chapter" : "A cooler chapter";
      detail = `Forecast temperatures ${rising ? "rise" : "fall"} from ${Math.round(baseline.temperatureF)}° to ${Math.round(hour.temperatureF)}°.`;
    }
    if (title) return { title, detail, time: new Date(time).toISOString(), timeLabel: timeLabel(time, now, timeZone) };
  }
  return null;
}

function findOutdoorWindow(
  hours: HourlyPeriod[],
  intelligence: IntelligenceData | null | undefined,
  now: number,
  timeZone: string,
): WeatherStory["outdoorWindow"] {
  const signals = intelligence && isFresh(intelligence.fetchedAt, now) ? intelligence.forecast?.hours : undefined;
  let best: { hours: HourlyPeriod[]; score: number } | null = null;
  const candidates = hours.filter((hour) => Date.parse(hour.startTime) >= now);
  for (let index = 0; index < candidates.length - 1; index += 1) {
    const window: HourlyPeriod[] = [];
    for (const hour of candidates.slice(index, index + 3)) {
      const wind = windMph(hour.windSpeed);
      const chance = probability(hour.precipitationPct);
      const signal = signals?.find((item) => Date.parse(item.time) === Date.parse(hour.startTime));
      const temperature = finite(signal?.feelsLikeF) ? signal.feelsLikeF : hour.temperatureF;
      if (!hour.isDaytime || !finite(temperature) || temperature < 50 || temperature > 85
        || chance === null || chance > 20 || wind === null || wind > 15 || OUTDOOR_HAZARD.test(hour.shortForecast)
        || (finite(signal?.precipitationIn) && signal.precipitationIn > 0.01)
        || (finite(signal?.snowfallIn) && signal.snowfallIn > 0)
        || (window.length && Date.parse(hour.startTime) - Date.parse(window[window.length - 1].startTime) !== HOUR)) break;
      window.push(hour);
    }
    if (window.length < 2) continue;
    const score = window.reduce((total, hour) => total + Math.abs(hour.temperatureF - 70) + (probability(hour.precipitationPct) ?? 100) / 2 + (windMph(hour.windSpeed) ?? 100), 0) / window.length;
    if (!best || score < best.score) best = { hours: window, score };
  }
  if (!best) return null;
  const start = best.hours[0].startTime;
  const end = new Date(Date.parse(best.hours[best.hours.length - 1].startTime) + HOUR).toISOString();
  const temperatures = best.hours.map((hour) => Math.round(hour.temperatureF));
  const low = Math.min(...temperatures);
  const high = Math.max(...temperatures);
  const peak = Math.max(...best.hours.map((hour) => probability(hour.precipitationPct) ?? 0));
  return {
    title: "A window for being outside",
    detail: `${low === high ? `${low}°` : `${low}–${high}°`} forecast, winds 15 mph or less, and precipitation chances at or below ${peak}%. Recheck conditions before leaving.`,
    start: new Date(start).toISOString(),
    end,
    timeLabel: `${timeLabel(start, now, timeZone)} – ${timeLabel(end, now, timeZone)}`,
  };
}

/** A deterministic, source-aware briefing; every statement comes from supplied data. */
export function buildWeatherStory(
  data: WeatherDashboardData,
  intelligence: IntelligenceData | null | undefined,
  now: Date,
): WeatherStory {
  const reference = now.getTime();
  if (!Number.isFinite(reference)) throw new RangeError("Weather story requires a valid reference date.");
  const zone = validTimeZone(data.location.timeZone);
  const fresh = isFresh(data.fetchedAt, reference);
  const alerts = activeAlerts(data.alerts, reference);
  const hours = chronologicalHours(data.hourly, reference);
  const nearHours = hours.filter((hour) => Date.parse(hour.startTime) < reference + 12 * HOUR);
  const temperatures = nearHours.map((hour) => hour.temperatureF).filter(finite);
  const probabilities = nearHours.map((hour) => probability(hour.precipitationPct)).filter(finite);
  const peakPrecip = probabilities.length ? Math.max(...probabilities) : null;
  const low = temperatures.length ? Math.round(Math.min(...temperatures)) : null;
  const high = temperatures.length ? Math.round(Math.max(...temperatures)) : null;
  const lastHour = nearHours.at(-1);
  const coverageLabel = lastHour ? `Through ${timeLabel(Date.parse(lastHour.startTime) + HOUR, reference, zone)}` : "Hourly forecast unavailable";
  const intelligenceFresh = Boolean(intelligence && isFresh(intelligence.fetchedAt, reference));
  const air = intelligenceFresh && intelligence?.airQuality && isFresh(intelligence.airQuality.observedAt, reference) ? intelligence.airQuality : null;
  const outdoorWindow = fresh && data.alertFeedAvailable && alerts.length === 0 && !(finite(air?.aqi) && air.aqi > 100)
    ? findOutdoorWindow(hours, intelligence, reference, zone) : null;
  let nextChange = fresh ? findNextChange(hours, reference, zone) : null;
  const sunrise = Date.parse(data.astronomy.sunrise ?? "");
  const sunset = Date.parse(data.astronomy.sunset ?? "");
  const solarEvents = [{ time: sunrise, title: "Sunrise", detail: "Daylight begins at your selected location." }, { time: sunset, title: "Sunset", detail: "The sun sets at your selected location; twilight follows." }]
    .filter((event) => Number.isFinite(event.time) && event.time > reference && event.time < reference + 24 * HOUR)
    .sort((a, b) => a.time - b.time);
  if (!nextChange && fresh && solarEvents.length) {
    const event = solarEvents[0];
    nextChange = { title: event.title, detail: event.detail, time: new Date(event.time).toISOString(), timeLabel: timeLabel(event.time, reference, zone) };
  }

  let headline = outdoorWindow ? "Make a little time for outside." : "The next few hours, at a glance.";
  let tone: WeatherStoryTone = "calm";
  const peakWind = Math.max(0, ...nearHours.map((hour) => windMph(hour.windSpeed)).filter(finite));
  if (peakPrecip !== null && peakPrecip >= 50) { headline = "Keep an umbrella within reach."; tone = "watch"; }
  if (high !== null && high >= 90) { headline = "A hot stretch is on the way."; tone = "watch"; }
  if (low !== null && low <= 32) { headline = "Freezing temperatures are in the picture."; tone = "watch"; }
  if (peakWind >= 25) { headline = "The wind is the main story."; tone = "watch"; }
  if (nearHours.some((hour) => /snow|sleet|freezing rain/i.test(hour.shortForecast))) { headline = "Wintry weather is in the picture."; tone = "watch"; }
  if (nearHours.some((hour) => /thunder/i.test(hour.shortForecast))) { headline = "Thunderstorms are in the forecast."; tone = "watch"; }

  const precipitationSummary = peakPrecip === null
    ? "precipitation chances unavailable"
    : `a ${peakPrecip}% peak hourly precipitation chance${probabilities.length < nearHours.length ? " (partial data)" : ""}`;
  let summary = low !== null && high !== null
    ? `${coverageLabel}, expect ${low === high ? `around ${low}°` : `${low}–${high}°`} with ${precipitationSummary}.`
    : `Hourly temperatures unavailable; ${precipitationSummary}.`;
  if (!nearHours.length) { headline = "Waiting for the next forecast."; tone = "muted"; }
  if (alerts.length) {
    headline = alerts[0].event;
    tone = /Extreme|Severe/i.test(alerts[0].severity) ? "urgent" : "watch";
    summary = `Follow the official instructions in the NWS alert. ${summary}`;
  }
  if (!data.alertFeedAvailable) {
    summary += " NWS alert status is unavailable.";
    if (tone === "calm") tone = "watch";
  }
  if (!fresh) {
    headline = alerts.length ? `Saved alert: ${alerts[0].event}` : "The weather picture needs a refresh.";
    summary = "This briefing uses saved or undated weather data. Current conditions and alert status need to be checked again.";
    tone = alerts.length ? "watch" : "muted";
  }

  const insights: WeatherStory["insights"] = [
    {
      label: "Temperature arc", value: low === null || high === null ? "Unavailable" : low === high ? `${low}°` : `${low}–${high}°`,
      detail: `${coverageLabel}${fresh ? " · forecast" : " · saved forecast"}`, tone: low === null || !fresh ? "muted" : "calm",
    },
    {
      label: "Precipitation", value: peakPrecip === null ? "Unknown" : `${peakPrecip}% peak`,
      detail: peakPrecip === null ? "Hourly probabilities unavailable" : `${coverageLabel}${probabilities.length < nearHours.length ? " · partial coverage" : " · hourly chance"}${fresh ? "" : " · saved"}`,
      tone: peakPrecip === null || !fresh ? "muted" : peakPrecip >= 40 ? "watch" : "calm",
    },
  ];

  if (finite(air?.aqi)) {
    insights.push({ label: "Air quality", value: `${Math.round(air.aqi)} AQI`, detail: air.category || "Latest available air-quality reading", tone: air.aqi > 100 ? "watch" : "calm" });
  } else if (solarEvents.length) {
    const event = solarEvents[0];
    insights.push({ label: event.title, value: timeLabel(event.time, reference, zone), detail: "At your selected location", tone: "calm" });
  } else {
    insights.push({ label: "Outdoor window", value: outdoorWindow ? outdoorWindow.timeLabel : "No window selected", detail: outdoorWindow ? "Daylight, milder temperatures, and lighter wind" : "Needs current alerts and consecutive favorable forecast hours", tone: outdoorWindow ? "calm" : "muted" });
  }
  insights.push({
    label: "NWS alerts",
    value: !fresh || !data.alertFeedAvailable ? alerts.length ? `${alerts.length} saved` : "Status unknown" : alerts.length ? `${alerts.length} issued` : "None returned",
    detail: !fresh ? "Saved feed · refresh required" : !data.alertFeedAvailable ? "The alert feed is unavailable" : alerts.length ? alerts[0].event : "For the selected location at last refresh",
    tone: !fresh || !data.alertFeedAvailable ? "muted" : alerts.length ? tone : "calm",
  });
  const ageMinutes = Math.max(0, Math.floor((reference - Date.parse(data.fetchedAt)) / 60_000));
  return {
    eyebrow: "Your weather, considered",
    headline, summary, tone, nextChange, outdoorWindow, insights,
    updatedLabel: !Number.isFinite(ageMinutes) ? "Refresh time unavailable" : ageMinutes < 1 ? "Refreshed just now" : ageMinutes < 60 ? `Refreshed ${ageMinutes} min ago` : `Refreshed ${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`,
  };
}
