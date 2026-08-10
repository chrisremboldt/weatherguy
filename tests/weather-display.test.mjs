import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  apparentTemperatureF,
  currentAndFutureHourlyPeriods,
  maximumPrecipitationPct,
  nextHourlyPeriods,
  observedSkyPresentation,
  precipitationChanceLabel,
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

test("missing precipitation probability stays unknown instead of becoming zero", () => {
  assert.equal(maximumPrecipitationPct([{ precipitationPct: null }, { precipitationPct: null }]), null);
  assert.equal(maximumPrecipitationPct([{ precipitationPct: null }, { precipitationPct: 0 }]), 0);
  assert.equal(maximumPrecipitationPct([{ precipitationPct: 20 }, { precipitationPct: 60 }]), 60);
  assert.equal(precipitationChanceLabel(null), "—");
  assert.equal(precipitationChanceLabel(0), "0%");
  assert.match(dashboard, /Precip peak/);
  assert.match(dashboard, /Precipitation chance unavailable/);
  assert.doesNotMatch(dashboard, /precipitationPct \?\? 0\}% rain/);
});

test("observed cloud decks distinguish ceilings, lowest layers, clear reports, and missing data", () => {
  assert.deepEqual(
    observedSkyPresentation({ kind: "ceiling", cover: "BKN", baseFeet: 3600 }),
    {
      label: "Ceiling",
      value: "3,600 ft",
      detail: "Broken (BKN) · AGL",
      compact: "CIG · BKN 3,600′ AGL",
      accessible: "Ceiling: Broken at 3,600 feet above ground level",
    },
  );
  assert.equal(
    observedSkyPresentation({ kind: "layer", cover: "SCT", baseFeet: 2300 }).compact,
    "Lowest · SCT 2,300′ AGL",
  );
  assert.equal(
    observedSkyPresentation({ kind: "clear-report", cover: "CLR", baseFeet: null }).value,
    "No ceiling",
  );
  assert.equal(observedSkyPresentation(null).detail, "Cloud layer unavailable");
});

test("dashboard status and active alert copy describe only what is actually available", () => {
  assert.match(dashboard, /data\?\.alerts\.map\(\(alert, index\) =>/);
  assert.match(dashboard, /Highest priority ·/);
  assert.match(dashboard, /Core weather feed connected/);
  assert.match(dashboard, /Core live · some products degraded/);
  assert.match(dashboard, /NWS alert status unavailable/);
  assert.match(dashboard, /Do not interpret this as an all-clear/);
  assert.match(dashboard, /data && data\.alertFeedAvailable === true && !offlineSnapshot/);
  assert.doesNotMatch(dashboard, /All live feeds connected/);
  assert.match(dashboard, /Models \/ environment: Open-Meteo · CAMS · USGS · NOAA SWPC \/ SPC/);
});
