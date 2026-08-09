import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  alignHourlyPeriods,
  comparisonDeltaLabel,
  comparisonLocationFromParams,
  sameComparisonLocation,
  withComparisonLocation,
  withoutComparisonLocation,
} from "../lib/comparison.ts";
import { apparentTemperatureF } from "../lib/weather-display.ts";

const component = await readFile(new URL("../components/weather-comparison.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/weather-comparison.module.css", import.meta.url), "utf8");

function hour(startTime, temperatureF) {
  return {
    startTime,
    temperatureF,
    shortForecast: "Clear",
    isDaytime: true,
    precipitationPct: 10,
    humidityPct: 50,
    windSpeed: "5 mph",
    windDirection: "W",
  };
}

test("comparison URLs preserve the primary desk and round-trip the second place", () => {
  const params = withComparisonLocation(
    "lat=41.8781&lon=-87.6298&location=Chicago&theme=night",
    { latitude: 34.052235, longitude: -118.243683, customLabel: "Los Angeles, CA" },
  );

  assert.equal(params.get("lat"), "41.8781");
  assert.equal(params.get("theme"), "night");
  assert.equal(params.get("view"), "compare");
  assert.equal(params.get("compareLat"), "34.0522");
  assert.equal(params.get("compareLon"), "-118.2437");
  assert.deepEqual(comparisonLocationFromParams(params), {
    latitude: 34.0522,
    longitude: -118.2437,
    customLabel: "Los Angeles, CA",
  });

  const cleared = withoutComparisonLocation(params);
  assert.equal(cleared.get("lat"), "41.8781");
  assert.equal(cleared.get("location"), "Chicago");
  assert.equal(cleared.has("view"), false);
  assert.equal(cleared.has("compareLat"), false);
});

test("invalid comparison coordinates are rejected and coordinate identity is stable", () => {
  assert.equal(comparisonLocationFromParams("compareLat=91&compareLon=10"), null);
  assert.equal(comparisonLocationFromParams("compareLat=34"), null);
  assert.equal(
    sameComparisonLocation(
      { latitude: 41.87811, longitude: -87.62981 },
      { latitude: 41.87814, longitude: -87.62984 },
    ),
    true,
  );
  assert.equal(
    sameComparisonLocation(
      { latitude: 41.8781, longitude: -87.6298 },
      { latitude: 41.8791, longitude: -87.6298 },
    ),
    false,
  );
});

test("observed feels-like uses the same heat-index and wind-chill thresholds", () => {
  assert.equal(apparentTemperatureF(null, 70, 5), null);
  assert.equal(apparentTemperatureF(90, 70, 5), 106);
  assert.equal(apparentTemperatureF(30, 50, 20), 17);
  assert.equal(apparentTemperatureF(68, 50, 2), 68);
});

test("hourly comparison aligns both forecasts to absolute instants", () => {
  const aligned = alignHourlyPeriods(
    [
      hour("2026-08-09T10:00:00-05:00", 70),
      hour("2026-08-09T11:00:00-05:00", 72),
    ],
    [
      hour("2026-08-09T08:00:00-07:00", 65),
      hour("2026-08-09T09:00:00-07:00", 66),
    ],
  );

  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].startTime, "2026-08-09T15:00:00.000Z");
  assert.equal(aligned[0].primary?.temperatureF, 70);
  assert.equal(aligned[0].secondary?.temperatureF, 65);
  assert.equal(aligned[1].primary?.temperatureF, 72);
  assert.equal(aligned[1].secondary?.temperatureF, 66);
});

test("comparison deltas keep missing values unknown instead of inventing zeroes", () => {
  assert.equal(comparisonDeltaLabel(null, 72, "°"), "—");
  assert.equal(comparisonDeltaLabel(72, 72, "°"), "Even");
  assert.equal(comparisonDeltaLabel(72, 76, "°"), "B +4°");
  assert.equal(comparisonDeltaLabel(76, 72, "°"), "A +4°");
  assert.equal(comparisonDeltaLabel(29.92, 29.87, " inHg", 2), "A +0.05 inHg");
});

test("Crosscheck is an isolated, responsive full-viewport experience", () => {
  assert.match(component, /export async function requestComparisonFullscreen/);
  assert.match(component, /\/api\/weather\?lat=\$\{latitude\}&lon=\$\{longitude\}&schema=3/);
  assert.match(component, /\/api\/locations\?q=/);
  assert.match(component, /COMPARISON_STORAGE_KEY/);
  assert.match(component, /Next six hours/);
  assert.match(component, /Five-day outlook/);
  assert.match(component, /items\.map\(\(item\) =>/);
  assert.match(component, /All active alerts for/);
  assert.match(component, /role="region" aria-label="Scrollable aligned hourly forecasts" tabIndex=\{0\}/);
  assert.match(component, /role="region" aria-label="Scrollable five-day forecast comparison" tabIndex=\{0\}/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /inert=\{pickerOpen\}/);
  assert.match(component, /alertFeedPresentationState\(alerts, available\)/);
  assert.match(component, /Do not interpret this as an all-clear/);
  assert.match(component, /searchController\.current\?\.abort\(\)/);
  assert.match(component, /signal: controller\.signal/);
  assert.match(component, /requestError\.name === "AbortError"/);
  assert.match(component, /comparisonHasDegradedProducts/);
  assert.match(component, /Comparison loaded · some feeds unavailable/);
  assert.match(component, /!secondaryConfig \? "Choose Place B"/);
  assert.equal(component.match(/Feels like/g)?.length, 1);
  assert.doesNotMatch(component, /api\/intelligence|RadarMap|SatelliteView/);

  assert.match(styles, /\.shell\s*{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;/s);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.metricRow\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 78px minmax\(0, 1fr\);/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the weather desk launches Crosscheck from a user gesture and restores the desk on close", () => {
  assert.match(dashboard, /Open two-place weather comparison/);
  assert.match(dashboard, /void requestComparisonFullscreen\(\);[\s\S]*setComparisonOpen\(true\)/);
  assert.match(dashboard, /get\("view"\) === "compare"/);
  assert.match(dashboard, /<WeatherComparison/);
  assert.match(dashboard, /primaryConfig=\{config\}/);
  assert.match(dashboard, /primaryData=\{data\}/);
  assert.match(dashboard, /primaryAlertsAvailable=\{alertStatus === "active" \|\| alertStatus === "clear"\}/);
  assert.match(dashboard, /appShell\.inert = true/);
  assert.match(dashboard, /comparisonOpen \|\| favorites\.length < 2/);
});
