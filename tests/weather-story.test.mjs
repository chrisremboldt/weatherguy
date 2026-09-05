import assert from "node:assert/strict";
import test from "node:test";
import { buildWeatherStory } from "../lib/weather-story.ts";

const now = new Date("2026-09-05T12:30:00Z");
const hour = (time, overrides = {}) => ({
  startTime: `2026-09-05T${String(time).padStart(2, "0")}:00:00Z`,
  temperatureF: 70,
  shortForecast: "Partly Cloudy",
  isDaytime: true,
  precipitationPct: 10,
  humidityPct: 50,
  windSpeed: "5 to 10 mph",
  windDirection: "W",
  ...overrides,
});
const weather = (overrides = {}) => ({
  fetchedAt: now.toISOString(),
  location: { label: "Kansas City, MO", city: "Kansas City", state: "MO", timeZone: "America/Chicago" },
  current: { timestamp: now.toISOString(), temperatureF: 70 },
  hourly: [hour(12), hour(13), hour(14), hour(15), hour(16)],
  daily: [],
  alerts: [],
  alertFeedAvailable: true,
  astronomy: { sunrise: "2026-09-05T11:45:00Z", sunset: "2026-09-06T00:45:00Z" },
  notices: [],
  ...overrides,
});
const alert = (overrides = {}) => ({
  id: "alert-1",
  event: "Flood Watch",
  headline: "Flood Watch issued for the area",
  severity: "Moderate",
  urgency: "Expected",
  effective: "2026-09-05T12:00:00Z",
  expires: "2026-09-05T18:00:00Z",
  ...overrides,
});

test("the briefing sorts future periods, drops expired hours, and does not mutate its inputs", () => {
  const data = weather({ hourly: [hour(15, { precipitationPct: 60 }), hour(11, { temperatureF: -50 }), hour(13), hour(14, { precipitationPct: 50 }), hour(12)] });
  const before = JSON.stringify(data);
  const result = buildWeatherStory(data, null, now);
  assert.equal(result.nextChange.time, "2026-09-05T14:00:00.000Z");
  assert.equal(result.nextChange.title, "Precipitation chances rise");
  assert.equal(result.nextChange.timeLabel, "9:00 AM");
  assert.equal(result.insights[0].value, "70°");
  assert.equal(result.insights.length, 4);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(buildWeatherStory(data, null, now), result);
});

test("a favorable window starts in the future and needs consecutive daylight hours", () => {
  const result = buildWeatherStory(weather(), undefined, now);
  assert.equal(result.outdoorWindow.start, "2026-09-05T13:00:00.000Z");
  assert.equal(result.outdoorWindow.end, "2026-09-05T16:00:00.000Z");
  assert.equal(result.outdoorWindow.timeLabel, "8:00 AM – 11:00 AM");
  assert.match(result.outdoorWindow.detail, /Recheck conditions/);
  assert.doesNotMatch(result.outdoorWindow.detail, /safe|guarantee|all.clear/i);
  assert.equal(buildWeatherStory(weather({ hourly: [hour(13), hour(15)] }), null, now).outdoorWindow, null);
  assert.equal(buildWeatherStory(weather({ hourly: [hour(13, { isDaytime: false }), hour(14, { isDaytime: false })] }), null, now).outdoorWindow, null);
});

test("unknown precipitation and unknown wind never produce a favorable outdoor window", () => {
  const missing = buildWeatherStory(weather({ hourly: [hour(13, { precipitationPct: null }), hour(14, { precipitationPct: null })] }), null, now);
  assert.equal(missing.outdoorWindow, null);
  assert.equal(missing.insights[1].value, "Unknown");
  assert.match(missing.summary, /precipitation chances unavailable/i);
  const unknownWind = weather({ hourly: [hour(13, { windSpeed: "unknown" }), hour(14, { windSpeed: "10 km/h" })] });
  assert.equal(buildWeatherStory(unknownWind, null, now).outdoorWindow, null);
});

test("thunderstorms and wind-range upper bounds disqualify otherwise pleasant hours", () => {
  for (const overrides of [{ shortForecast: "Slight Chance Thunderstorms" }, { windSpeed: "10 to 25 mph" }, { shortForecast: "Smoke" }]) {
    const result = buildWeatherStory(weather({ hourly: [hour(13, overrides), hour(14, overrides)] }), null, now);
    assert.equal(result.outdoorWindow, null);
  }
});

test("unavailable alerts cannot read as an all-clear or produce outdoor encouragement", () => {
  const result = buildWeatherStory(weather({ alertFeedAvailable: false }), null, now);
  assert.equal(result.outdoorWindow, null);
  assert.equal(result.insights.at(-1).value, "Status unknown");
  assert.match(result.summary, /NWS alert status is unavailable/);
  assert.doesNotMatch(result.headline, /outside/i);
  assert.doesNotMatch(JSON.stringify(result), /all.clear|no active alerts/i);
});

test("the most severe unexpired alert leads the story and suppresses outdoor windows", () => {
  const result = buildWeatherStory(weather({ alerts: [alert(), alert({ id: "expired", severity: "Extreme", event: "Expired warning", expires: "2026-09-05T12:00:00Z" }), alert({ id: "warning", severity: "Severe", event: "Severe Thunderstorm Warning" })] }), null, now);
  assert.equal(result.headline, "Severe Thunderstorm Warning");
  assert.equal(result.tone, "urgent");
  assert.equal(result.outdoorWindow, null);
  assert.equal(result.insights.at(-1).value, "2 issued");
  assert.match(result.summary, /official instructions/);
});

test("alert briefings keep the event headline and concise forecast without duplicating NWS bulletin text", () => {
  const bulletin = "Flood Watch issued September 5 at 7:00 AM CDT until September 6 at 7:00 AM CDT by the National Weather Service for multiple counties across the forecast area";
  const result = buildWeatherStory(weather({ alerts: [alert({ headline: bulletin })] }), null, now);
  assert.equal(result.headline, "Flood Watch");
  assert.match(result.summary, /Follow the official instructions in the NWS alert/);
  assert.match(result.summary, /Through 12:00 PM, expect around 70°/);
  assert.match(result.summary, /10% peak hourly precipitation chance/);
  assert.ok(result.summary.length <= 180);
  assert.equal(result.summary.split(/[.!?]\s|\.$/).filter(Boolean).length, 2);
  assert.equal(result.summary.includes(bulletin), false);
});

test("concise normal briefings retain the forecast horizon, temperature range, and uncertainty", () => {
  const result = buildWeatherStory(weather({ hourly: [hour(13, { temperatureF: 68 }), hour(14, { temperatureF: 75, precipitationPct: null })] }), null, now);
  assert.equal(result.summary, "Through 10:00 AM, expect 68–75° with a 10% peak hourly precipitation chance (partial data).");
  const unavailable = buildWeatherStory(weather({ alerts: [alert()], alertFeedAvailable: false, hourly: [hour(13, { precipitationPct: null })] }), null, now);
  assert.match(unavailable.summary, /official instructions/);
  assert.match(unavailable.summary, /precipitation chances unavailable/);
  assert.match(unavailable.summary, /NWS alert status is unavailable/);
});

test("old and undated weather data gets a stale briefing without current planning claims", () => {
  for (const fetchedAt of ["2026-09-05T10:00:00Z", "invalid date"]) {
    const result = buildWeatherStory(weather({ fetchedAt }), null, now);
    assert.equal(result.tone, "muted");
    assert.equal(result.outdoorWindow, null);
    assert.equal(result.nextChange, null);
    assert.equal(result.insights.at(-1).value, "Status unknown");
    assert.match(result.summary, /saved or undated/);
    assert.match(result.insights[0].detail, /saved forecast/);
  }
  const saved = buildWeatherStory(weather({ fetchedAt: "2026-09-05T10:00:00Z", alerts: [alert()] }), null, now);
  assert.equal(saved.headline, "Saved alert: Flood Watch");
  assert.equal(saved.insights.at(-1).value, "1 saved");
});

test("empty forecasts, invalid dates, nonfinite temperatures and missing probabilities remain unknown", () => {
  const result = buildWeatherStory(weather({ hourly: [hour(10), hour(13, { startTime: "invalid" })], astronomy: { sunrise: null, sunset: null } }), null, now);
  assert.equal(result.headline, "Waiting for the next forecast.");
  assert.equal(result.nextChange, null);
  assert.equal(result.outdoorWindow, null);
  assert.equal(result.insights[0].value, "Unavailable");
  const invalidValues = buildWeatherStory(weather({ hourly: [hour(13, { temperatureF: NaN, precipitationPct: NaN }), hour(14, { temperatureF: Infinity, precipitationPct: 101 })] }), null, now);
  assert.equal(invalidValues.insights[0].value, "Unavailable");
  assert.equal(invalidValues.insights[1].value, "Unknown");
  assert.equal(invalidValues.outdoorWindow, null);
});

test("partial precipitation coverage is qualified and duplicate hours cannot manufacture a window", () => {
  const result = buildWeatherStory(weather({ hourly: [hour(13), hour(13), hour(14, { precipitationPct: null })] }), null, now);
  assert.equal(result.outdoorWindow, null);
  assert.match(result.summary, /partial data/);
  assert.match(result.insights[1].detail, /partial coverage/);
});

test("time labels use the selected location, including half-hour offsets and a new local day", () => {
  const result = buildWeatherStory(weather({ location: { timeZone: "Asia/Kolkata" }, hourly: [hour(22), hour(23, { precipitationPct: 60 })], astronomy: { sunrise: null, sunset: null } }), null, now);
  assert.equal(result.nextChange.timeLabel, "Sun 4:30 AM");
  assert.equal(result.nextChange.time, "2026-09-05T23:00:00.000Z");
});

test("fresh adverse air quality suppresses outdoor planning; expired air readings are ignored", () => {
  const intelligence = { fetchedAt: now.toISOString(), airQuality: { observedAt: now.toISOString(), aqi: 155, category: "Unhealthy" }, forecast: null };
  const result = buildWeatherStory(weather(), intelligence, now);
  assert.equal(result.outdoorWindow, null);
  assert.equal(result.insights[2].value, "155 AQI");
  assert.equal(result.insights[2].tone, "watch");
  const expired = buildWeatherStory(weather(), { ...intelligence, airQuality: { ...intelligence.airQuality, observedAt: "2026-09-04T00:00:00Z" } }, now);
  assert.ok(expired.outdoorWindow);
  assert.equal(expired.insights[2].label, "Sunset");
});

test("fresh model rain or uncomfortable feels-like signals veto an otherwise favorable window", () => {
  for (const signal of [{ feelsLikeF: 100 }, { precipitationIn: 0.1 }, { snowfallIn: 0.2 }]) {
    const intelligence = { fetchedAt: now.toISOString(), forecast: { hours: [13, 14, 15, 16].map((time) => ({ time: hour(time).startTime, ...signal })) } };
    assert.equal(buildWeatherStory(weather(), intelligence, now).outdoorWindow, null);
    assert.ok(buildWeatherStory(weather(), { ...intelligence, fetchedAt: "2026-09-04T00:00:00Z" }, now).outdoorWindow);
  }
});

test("next change does not infer an onset through a missing forecast hour", () => {
  const result = buildWeatherStory(weather({ hourly: [hour(13), hour(15, { precipitationPct: 80 })], astronomy: { sunrise: null, sunset: null } }), null, now);
  assert.equal(result.nextChange, null);
});
