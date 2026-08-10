import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  alignHourlyPeriods,
  comparisonDeltaLabel,
  comparisonLocationFromParams,
  comparisonUvValue,
  normalizeRadarStation,
  ridgeRadarUrl,
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

test("UV comparison preserves a real nighttime zero and distinguishes missing model data", () => {
  assert.equal(comparisonUvValue(0, "Low"), "0 · Low");
  assert.equal(comparisonUvValue(null, "Unavailable"), "—");
  assert.equal(comparisonDeltaLabel(0, 1.2, "", 1), "B +1.2");
  assert.equal(comparisonDeltaLabel(0, 0, "", 1), "Even");
});

test("paired radar URLs share safe loop and pause semantics", () => {
  assert.equal(normalizeRadarStation(" klot "), "KLOT");
  assert.equal(normalizeRadarStation("CONUS"), "CONUS");
  assert.equal(normalizeRadarStation("../../bad"), null);
  assert.equal(
    ridgeRadarUrl("KLOT", true, 7),
    "https://radar.weather.gov/ridge/standard/KLOT_loop.gif?v=7",
  );
  assert.equal(
    ridgeRadarUrl("KOKX", false, 7),
    "https://radar.weather.gov/ridge/standard/KOKX_0.gif?v=7",
  );
});

test("Crosscheck is an isolated, responsive full-viewport experience", () => {
  assert.match(component, /export async function requestComparisonFullscreen/);
  assert.match(component, /\/api\/weather\?lat=\$\{latitude\}&lon=\$\{longitude\}&schema=3/);
  assert.match(component, /\/api\/intelligence\?lat=\$\{latitude\}&lon=\$\{longitude\}/);
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
  assert.match(component, /function ComparisonRadar/);
  assert.equal(component.match(/<ComparisonRadar/g)?.length, 2);
  assert.match(component, /Pause both radar loops/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /useState\(false\);[\s\S]*?setRadarPlaying\(!reducedMotion\.matches\)/);
  assert.match(component, /setRadarRefresh\(\(value\) => value \+ 1\), 300_000/);
  assert.match(component, /<b>Ground radar<\/b>/);
  assert.match(component, /playing \? "10-frame loop" : "Latest frame"/);
  assert.doesNotMatch(component, /radarCaption/);
  assert.match(component, /refreshComparison/);
  assert.match(component, /!secondaryConfig \? "Choose Place B"/);
  assert.equal(component.match(/Feels like/g)?.length, 1);
  assert.match(component, /label: "UV · model"/);
  assert.match(component, /label: "Vis \/ clouds"/);
  assert.match(component, /primaryDetail: primarySky\.compact/);
  assert.match(component, /secondaryDetail: secondarySky\.compact/);
  assert.match(component, /observedSkyPresentation\(primaryCurrent\.skyCondition\)/);
  assert.equal(component.match(/label: "(?:Wind|Humidity|Dew point|Pressure|Vis \/ clouds|UV · model)"/g)?.length, 6);
  assert.match(component, /comparisonUvValue\(primaryUv/);
  assert.match(component, /comparisonDeltaLabel\(primaryUv, secondaryUv, "", 1\)/);
  assert.match(component, /primaryIntelligenceUnavailable/);
  assert.match(component, /secondaryIntelligenceUnavailable/);
  assert.match(component, /primaryUvLoading/);
  assert.match(component, /secondaryUvLoading/);
  assert.match(component, /Updating comparison feeds/);
  assert.match(component, /data-kid-mode-surface/);
  assert.match(component, /data-kid-mode-blocker/);
  assert.match(component, /data-kid-mode-toggle/);
  assert.match(component, /aria-pressed=\{kidModeEnabled\}/);
  assert.doesNotMatch(component, /RadarMap|SatelliteView/);

  assert.match(styles, /\.shell\s*{[^}]*position:\s*fixed;[^}]*height:\s*100dvh;/s);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.metricRow\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 78px minmax\(0, 1fr\);/s);
  assert.match(styles, /\.situationalBand\s*{[^}]*min-height:\s*clamp\(260px, 32dvh, 310px\);[^}]*grid-template-columns:\s*clamp\(260px, 23vw, 330px\) minmax\(0, 1fr\) clamp\(260px, 23vw, 330px\);/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.situationalBand\s*{[^}]*flex:\s*0 0 auto;/s);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.situationalBand\s*{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(styles, /\.comparisonRadar\s*{[^}]*aspect-ratio:\s*1;/s);
  assert.match(styles, /\.situationalBand \.metricPanel\s*{[^}]*grid-column:\s*1 \/ -1;/s);
  assert.match(styles, /@media \(min-width: 600px\) and \(max-width: 720px\)[\s\S]*?\.situationalBand\s*{[^}]*grid-template-columns:\s*clamp\(168px, 28vw, 210px\) minmax\(0, 1fr\) clamp\(168px, 28vw, 210px\);/s);
  assert.match(styles, /@media \(max-height: 800px\) and \(min-width: 721px\)[\s\S]*?\.situationalBand\s*{[^}]*min-height:\s*245px;/s);
  assert.match(styles, /\.situationalBand \.metricRow\s*{[^}]*flex:\s*1 1 0;/s);
  assert.match(styles, /\.radarStage > img\s*{[^}]*object-fit:\s*contain;/s);
  assert.match(styles, /\.uvMetric\s*{[^}]*amber-rgb/s);
  assert.match(styles, /@media \(min-width: 1440px\) and \(min-height: 850px\)/);
  assert.match(styles, /@media \(min-width: 1440px\) and \(min-height: 850px\)[\s\S]*?\.situationalBand\s*{[^}]*min-height:\s*clamp\(288px, 29dvh, 480px\);[^}]*clamp\(330px, 20vw, 460px\)/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Crosscheck breakpoint budgets preserve observation values and laptop-height forecasts", () => {
  const compactWidthRule = styles.match(
    /@media \(min-width: (\d+)px\) and \(max-width: 720px\)[\s\S]*?\.situationalBand\s*{[^}]*grid-template-columns:\s*clamp\((\d+)px, (\d+)vw, (\d+)px\) minmax\(0, 1fr\) clamp\(\2px, \3vw, \4px\);/s,
  );
  assert.ok(compactWidthRule);

  const [, breakpointText, radarMinText, radarVwText, radarMaxText] = compactWidthRule;
  const breakpoint = Number(breakpointText);
  const radarWidth = Math.min(
    Number(radarMaxText),
    Math.max(Number(radarMinText), breakpoint * Number(radarVwText) / 100),
  );
  const centerTrack = breakpoint - 12 - 14 - (2 * radarWidth);

  assert.equal(breakpoint, 600);
  assert.ok(centerTrack >= 230, `Expected at least 230px for observations, received ${centerTrack}px`);

  const compactHeightRule = styles.match(
    /@media \(max-height: (\d+)px\) and \(min-width: 721px\)[\s\S]*?\.workspace\s*{[^}]*grid-template-rows:\s*minmax\((\d+)px, auto\) auto auto minmax\((\d+)px, 1fr\);[\s\S]*?\.situationalBand\s*{[^}]*min-height:\s*(\d+)px;[\s\S]*?\.outlookGrid\s*{[^}]*min-height:\s*(\d+)px;/s,
  );
  assert.ok(compactHeightRule);

  const [, maxHeightText, heroText, forecastTrackText, radarBandText, outlookText] = compactHeightRule;
  const minimumWorkspaceHeight = Number(heroText) + 50 + Number(radarBandText) + Number(outlookText) + 21 + 16;

  assert.ok(Number(maxHeightText) >= 768);
  assert.equal(Number(forecastTrackText), Number(outlookText));
  assert.ok(minimumWorkspaceHeight <= 768 - 58);

  const highResolutionTypeRule = styles.match(
    /@media \(min-width: (\d+)px\) and \(min-height: (\d+)px\)[\s\S]*?\.metricRow > strong\s*{[^}]*font-size:\s*clamp\((\d+)px,/s,
  );
  assert.ok(highResolutionTypeRule);
  assert.equal(Number(highResolutionTypeRule[1]), 1440);
  assert.ok(Number(highResolutionTypeRule[2]) >= 850);
  assert.ok(Number(highResolutionTypeRule[3]) >= 13);
});

test("the weather desk launches Crosscheck from a user gesture and restores the desk on close", () => {
  assert.match(dashboard, /Open two-place weather comparison/);
  assert.match(dashboard, /void requestComparisonFullscreen\(\);[\s\S]*setComparisonOpen\(true\)/);
  assert.match(dashboard, /get\("view"\) === "compare"/);
  assert.match(dashboard, /<WeatherComparison/);
  assert.match(dashboard, /primaryConfig=\{config\}/);
  assert.match(dashboard, /primaryData=\{data\}/);
  assert.match(dashboard, /primaryAlertsAvailable=\{alertStatus === "active" \|\| alertStatus === "clear"\}/);
  assert.match(dashboard, /primaryIntelligence=\{intelligence\}/);
  assert.match(dashboard, /primaryIntelligenceUnavailable=\{intelligenceUnavailable\}/);
  assert.match(dashboard, /kidModeEnabled=\{kidModeEnabled\}/);
  assert.match(dashboard, /onKidModeChange=\{updateKidMode\}/);
  assert.match(dashboard, /onRefreshPrimary=\{\(\) => setRefreshKey/);
  assert.match(dashboard, /appShell\.inert = true/);
  assert.match(dashboard, /comparisonOpen \|\| favorites\.length < 2/);
  assert.match(dashboard, /window\.setInterval\(\(\) => \{[\s\S]*?setIntelligence\(null\);[\s\S]*?setConfig/s);
});
