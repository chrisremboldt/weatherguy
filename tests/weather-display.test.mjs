import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  apparentTemperatureF,
  currentAndFutureHourlyPeriods,
  iconCertaintyFromPct,
  maximumPrecipitationPct,
  nextHourlyPeriods,
  observedSkyPresentation,
  precipitationChanceLabel,
} from "../lib/weather-display.ts";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const comparison = await readFile(new URL("../components/weather-comparison.tsx", import.meta.url), "utf8");
const weatherIcon = await readFile(new URL("../components/weather-icon.tsx", import.meta.url), "utf8");

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

test("precipitation icon certainty follows NWS chance bands", () => {
  assert.equal(iconCertaintyFromPct(null), null);
  assert.equal(iconCertaintyFromPct(0), "dotted");
  assert.equal(iconCertaintyFromPct(29), "dotted");
  assert.equal(iconCertaintyFromPct(30), "dashed");
  assert.equal(iconCertaintyFromPct(59), "dashed");
  assert.equal(iconCertaintyFromPct(60), "full");
  assert.equal(iconCertaintyFromPct(79), "full");
  assert.equal(iconCertaintyFromPct(80), "superfull");
  assert.equal(iconCertaintyFromPct(100), "superfull");
});

test("forecast weather icons receive precipitation chance and current heroes stay solid", () => {
  assert.match(weatherIcon, /chancePct/);
  assert.match(weatherIcon, /iconCertaintyFromPct/);
  assert.match(weatherIcon, /strokeDasharray/);
  assert.match(weatherIcon, /superfull/);
  assert.match(dashboard, /chancePct=\{period\.precipitationPct\}/);
  assert.match(dashboard, /chancePct=\{day\.precipitationPct\}/);
  assert.match(
    dashboard,
    /<WeatherIcon condition=\{data\?\.current\.description \?\? "cloudy"\} size=\{72\} strokeWidth=\{1\.25\} \/>/,
  );
  assert.match(comparison, /chancePct=\{period\.precipitationPct\}/);
  assert.match(comparison, /chancePct=\{day\.precipitationPct\}/);
  assert.match(
    comparison,
    /<WeatherIcon\s+condition=\{current\?\.description \?\? "cloudy"\}\s+isDaytime=\{forecastNow\?\.isDaytime\}\s+size=\{68\}\s+strokeWidth=\{1\.2\}\s+\/>/,
  );
  assert.equal(dashboard.match(/chancePct=/g)?.length, 2);
  assert.equal(comparison.match(/chancePct=/g)?.length, 2);
});
