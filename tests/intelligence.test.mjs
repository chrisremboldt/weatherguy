import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeForecast, nwsPrecipitationIn } from "../lib/forecast-signals.ts";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Storm Center contains the complete SPC image and its legend", () => {
  assert.match(styles, /\.spc-stage img\s*{[^}]*object-fit:\s*contain;/s);
  assert.doesNotMatch(styles, /\.spc-stage img\s*{[^}]*object-fit:\s*cover;/s);
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
