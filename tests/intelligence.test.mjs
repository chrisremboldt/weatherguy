import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeForecast, nwsPrecipitationIn, selectBestOutdoorWindow, uvRisk } from "../lib/forecast-signals.ts";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const component = await readFile(new URL("../components/intelligence-grid.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/intelligence/route.ts", import.meta.url), "utf8");
const weatherRoute = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");

test("Storm Center contains complete Day 1 and Day 2 SPC images with their legends", () => {
  assert.match(component, /day1otlk\.png/);
  assert.match(component, /day2otlk\.png/);
  assert.match(component, /<figcaption>Day 1<\/figcaption>/);
  assert.match(component, /<figcaption>Day 2<\/figcaption>/);
  assert.match(styles, /\.spc-stage\s*{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(styles, /\.spc-stage img\s*{[^}]*object-fit:\s*contain;/s);
  assert.doesNotMatch(styles, /\.spc-stage img\s*{[^}]*object-fit:\s*cover;/s);
});

test("fullscreen Storm Center gives the map a full-height stage beside its related products", () => {
  assert.match(component, /className="storm-center-body"/);
  assert.match(component, /aria-label="Storm Prediction Center products"/);
  assert.match(styles, /\.app-shell\.is-fullscreen \.storm-center-body\s*{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.app-shell\.is-fullscreen \.spc-stage\s*{[^}]*height:\s*100%;/s);
  assert.doesNotMatch(styles, /\.app-shell\.is-fullscreen \.spc-stage\s*{[^}]*height:\s*90px;/s);
});

test("NWS quantitative precipitation is converted from millimeters and prorated across the forecast window", () => {
  const now = Date.parse("2026-07-22T03:00:00Z");
  const field = {
    uom: "wmoUnit:mm",
    values: [
      { validTime: "2026-07-22T00:00:00Z/PT6H", value: 25.4 },
      { validTime: "2026-07-22T06:00:00Z/PT6H", value: 12.7 },
    ],
  };

  assert.equal(nwsPrecipitationIn(field, 24, now), 1);
});

test("U.S. forecast totals prefer NWS QPF while retaining Open-Meteo as the worldwide fallback", () => {
  const now = Date.parse("2026-07-22T03:00:00Z");
  const times = Array.from({ length: 72 }, (_, index) => (now + index * 3_600_000) / 1_000);
  const openMeteo = {
    hourly: {
      time: times,
      apparent_temperature: times.map(() => 75),
      precipitation: times.map(() => 0.25),
      snowfall: times.map(() => 0),
      cloud_cover: times.map(() => 20),
      freezing_level_height: times.map(() => 12_000),
    },
  };
  const nwsGrid = {
    properties: {
      quantitativePrecipitation: {
        uom: "wmoUnit:mm",
        values: [{ validTime: "2026-07-22T03:00:00Z/PT6H", value: 25.4 }],
      },
    },
  };

  const nwsForecast = normalizeForecast(openMeteo, nwsGrid, now);
  const fallbackForecast = normalizeForecast(openMeteo, null, now);

  assert.equal(nwsForecast.next24PrecipitationIn, 1);
  assert.equal(nwsForecast.next72PrecipitationIn, 1);
  assert.equal(fallbackForecast.next24PrecipitationIn, 6);
  assert.equal(fallbackForecast.next72PrecipitationIn, 18);
});

test("the outdoor-window ranking accepts dry overcast weather instead of rejecting every cloudy hour", () => {
  const start = Date.parse("2026-07-24T12:00:00Z");
  const hours = Array.from({ length: 8 }, (_, index) => ({
    time: new Date(start + index * 3_600_000).toISOString(),
    feelsLikeF: 72,
    precipitationIn: 0,
    snowfallIn: 0,
    cloudCoverPct: 100,
    freezingLevelFt: 12_000,
    uvIndex: 1,
  }));

  const window = selectBestOutdoorWindow(hours, "America/Chicago");

  assert.equal(window?.start, hours[0].time);
  assert.equal(window?.end, new Date(start + 3 * 3_600_000).toISOString());
  assert.match(window?.reason ?? "", /comfortable despite extensive cloud cover/);
});

test("the outdoor-window ranking skips a rainy opening period for a later dry stretch", () => {
  const start = Date.parse("2026-07-24T12:00:00Z");
  const hours = Array.from({ length: 9 }, (_, index) => ({
    time: new Date(start + index * 3_600_000).toISOString(),
    feelsLikeF: 74,
    precipitationIn: index < 3 ? 0.08 : 0,
    snowfallIn: 0,
    cloudCoverPct: 95,
    freezingLevelFt: 12_000,
    uvIndex: 1,
  }));

  const window = selectBestOutdoorWindow(hours, "America/Chicago");

  assert.equal(window?.start, hours[3].time);
  assert.match(window?.reason ?? "", /comfortable despite extensive cloud cover/);
});

test("forecast signals do not turn missing model inputs into clear skies or a dry outdoor window", () => {
  const now = Date.parse("2026-07-24T12:00:00Z");
  const times = Array.from({ length: 4 }, (_, index) => (now + index * 3_600_000) / 1_000);
  const forecast = normalizeForecast({
    timezone: "America/Chicago",
    hourly: {
      time: times,
      apparent_temperature: [72, null, 74, 75],
      precipitation: [0, null, 0, 0],
      snowfall: times.map(() => null),
      cloud_cover: times.map(() => null),
      freezing_level_height: times.map(() => null),
      uv_index: times.map(() => null),
    },
  }, null, now);

  assert.equal(forecast.peakCloudCoverPct, null);
  assert.equal(forecast.bestOutdoorWindow, null);
  assert.equal(forecast.currentUvIndex, null);
  assert.equal(forecast.currentUvCategory, "Unavailable");
});

test("date-specific NWS point metadata refreshes every fifteen minutes", () => {
  const pointFetch = weatherRoute.slice(
    weatherRoute.indexOf("const point = await getJson<JsonRecord>"),
    weatherRoute.indexOf("const pointProperties"),
  );

  assert.match(pointFetch, /\/points\//);
  assert.match(pointFetch, /,\s*900,\s*\);/s);
  assert.doesNotMatch(pointFetch, /21_600/);
});

test("UV guidance includes current conditions, a timed 24-hour peak, and three local-day peaks", () => {
  const now = Date.parse("2026-07-22T12:00:00Z");
  const times = Array.from({ length: 72 }, (_, index) => (now + index * 3_600_000) / 1_000);
  const dayPeaks = [8.7, 9.2, 6.4];
  const forecast = normalizeForecast({
    timezone: "America/Chicago",
    current: { uv_index: 1.84 },
    hourly: {
      time: times,
      apparent_temperature: times.map(() => 78),
      precipitation: times.map(() => 0),
      snowfall: times.map(() => 0),
      cloud_cover: times.map(() => 15),
      freezing_level_height: times.map(() => 13_000),
      uv_index: times.map((_, index) => index % 24 === 6 ? dayPeaks[Math.floor(index / 24)] : 0),
    },
  }, null, now);

  assert.equal(forecast.currentUvIndex, 1.8);
  assert.equal(forecast.currentUvCategory, "Low");
  assert.equal(forecast.next24UvIndexMax, 8.7);
  assert.equal(forecast.next24UvCategory, "Very high");
  assert.equal(forecast.next24UvPeakAt, new Date(times[6] * 1000).toISOString());
  assert.deepEqual(forecast.uvForecast.map((day) => day.maxIndex), dayPeaks);
  assert.match(forecast.uvGuidance, /Extra protection/);
});

test("UV risk bands follow the standard Low through Extreme index thresholds", () => {
  assert.equal(uvRisk(2.9).category, "Low");
  assert.equal(uvRisk(3).category, "Moderate");
  assert.equal(uvRisk(6).category, "High");
  assert.equal(uvRisk(8).category, "Very high");
  assert.equal(uvRisk(11).category, "Extreme");
});

test("the intelligence request and interface expose cloud-adjusted UV forecast guidance", () => {
  assert.match(route, /current=uv_index/);
  assert.match(route, /freezing_level_height,uv_index/);
  assert.match(component, /UV index/);
  assert.match(component, /currentUvCategory \? `\$\{forecast\.currentUvCategory\} · model`/);
  assert.match(component, /UV peak \/ 24h/);
  assert.match(component, /Three-day UV peaks/);
  assert.doesNotMatch(dashboard, /UV estimate/);
  assert.doesNotMatch(dashboard, /currentUvIndex/);
  assert.match(styles, /\.uv-outlook\s*{/);
});

test("current conditions expose the only feels-like temperature", () => {
  assert.match(dashboard, /className="feels-like"> · Feels like \{currentFeelsLike \?\? "—"\}°/);
  assert.doesNotMatch(dashboard, /<b>Feels like<\/b>/);
  assert.doesNotMatch(component, /<b>Feels like now<\/b>/);
});
