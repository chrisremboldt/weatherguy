import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeForecast, nwsPrecipitationIn, uvRisk } from "../lib/forecast-signals.ts";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const component = await readFile(new URL("../components/intelligence-grid.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/intelligence/route.ts", import.meta.url), "utf8");

test("Storm Center contains the complete SPC image and its legend", () => {
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
  assert.match(component, /UV now/);
  assert.match(component, /UV peak \/ 24h/);
  assert.match(component, /Three-day UV peaks/);
  assert.match(styles, /\.uv-outlook\s*{/);
});
