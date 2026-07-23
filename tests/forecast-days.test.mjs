import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildForecastDays } from "../lib/forecast-days.ts";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function period({ startTime, name, temperatureF, isDaytime, precipitationPct, shortForecast }) {
  return {
    startTime,
    name,
    temperatureF,
    temperatureTrend: null,
    shortForecast,
    detailedForecast: `${name} detailed forecast`,
    isDaytime,
    precipitationPct,
    windSpeed: "5 mph",
    windDirection: "N",
  };
}

test("daytime highs and nighttime lows are paired into local forecast days", () => {
  const days = buildForecastDays([
    period({
      startTime: "2026-07-23T06:00:00-05:00",
      name: "Today",
      temperatureF: 87,
      isDaytime: true,
      precipitationPct: 20,
      shortForecast: "Mostly Sunny",
    }),
    period({
      startTime: "2026-07-23T18:00:00-05:00",
      name: "Tonight",
      temperatureF: 69,
      isDaytime: false,
      precipitationPct: 40,
      shortForecast: "Chance Showers",
    }),
    period({
      startTime: "2026-07-24T06:00:00-05:00",
      name: "Friday",
      temperatureF: 90,
      isDaytime: true,
      precipitationPct: 10,
      shortForecast: "Sunny",
    }),
  ], "America/Chicago");

  assert.equal(days.length, 2);
  assert.deepEqual(days[0], {
    key: "2026-07-23",
    label: "Today",
    dateLabel: "Jul 23",
    highF: 87,
    lowF: 69,
    precipitationPct: 40,
    shortForecast: "Mostly Sunny",
    detailedForecast: "Today detailed forecast Night: Tonight detailed forecast",
    isDaytime: true,
  });
  assert.equal(days[1].highF, 90);
  assert.equal(days[1].lowF, null);
});

test("the dashboard promotes seven-day planning while retaining a compact hourly rail", () => {
  assert.match(route, /periods \?\? \[\]\)\.slice\(0, 14\)/);
  assert.match(dashboard, /Seven-day forecast/);
  assert.match(dashboard, /NWS days \+ nights/);
  assert.match(dashboard, /compact-hourly-strip/);
  assert.match(dashboard, /Next nine hours/);
  assert.match(dashboard, /% chance of rain/);
  assert.doesNotMatch(dashboard, /Five day signal/);
  assert.match(styles, /\.seven-day-grid\s*{[^}]*grid-template-columns:\s*repeat\(7,/s);
  assert.match(styles, /\.compact-hourly-strip\s*{/);
});
