import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  apparentTemperatureF,
  currentAndFutureHourlyPeriods,
  nextHourlyPeriods,
} from "../lib/weather-display.ts";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");

function period(startTime, temperatureF = 70) {
  return {
    startTime,
    temperatureF,
    shortForecast: "Clear",
    isDaytime: true,
    precipitationPct: 0,
    humidityPct: 50,
    windSpeed: "5 mph",
    windDirection: "W",
  };
}

test("hourly displays drop expired model periods and retain the active hour", () => {
  const periods = [
    period("2026-08-09T09:00:00-05:00"),
    period("2026-08-09T10:00:00-05:00"),
    period("2026-08-09T11:00:00-05:00"),
    period("2026-08-09T12:00:00-05:00"),
  ];
  const now = Date.parse("2026-08-09T11:08:00-05:00");

  assert.deepEqual(
    currentAndFutureHourlyPeriods(periods, now).map((item) => item.startTime),
    ["2026-08-09T11:00:00-05:00", "2026-08-09T12:00:00-05:00"],
  );
});

test("the short-term outlook contains exactly the next three forecast hours", () => {
  const periods = [11, 12, 13, 14, 15].map((hour) =>
    period(`2026-08-09T${String(hour).padStart(2, "0")}:00:00-05:00`),
  );
  const now = Date.parse("2026-08-09T11:08:00-05:00");

  assert.deepEqual(
    nextHourlyPeriods(periods, now).map((item) => item.startTime),
    [
      "2026-08-09T12:00:00-05:00",
      "2026-08-09T13:00:00-05:00",
      "2026-08-09T14:00:00-05:00",
    ],
  );
});

test("modeled hourly temperatures use their forecast time instead of claiming to be now", () => {
  assert.doesNotMatch(dashboard, /index === 0 \? "Now"/);
  assert.match(dashboard, /<b>\{label\.hour\}<\/b>/);
});

test("apparent temperature is derived from observed heat and wind inputs", () => {
  assert.equal(apparentTemperatureF(81, 72, 13), 85);
  assert.equal(apparentTemperatureF(35, 60, 15), 25);
  assert.equal(apparentTemperatureF(65, 50, 5), 65);
});
