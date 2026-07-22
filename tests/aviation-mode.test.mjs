import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const consoleComponent = await readFile(new URL("../components/aviation-console.tsx", import.meta.url), "utf8");
const aviationApi = await readFile(new URL("../app/api/aviation/route.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("flight operations is a persistent settings-selectable desk profile", () => {
  assert.match(dashboard, /name: "Flight operations"/);
  assert.match(dashboard, /role="radiogroup" aria-label="Dashboard operating profile"/);
  assert.match(dashboard, /persistSetting\("weatherguy-display-mode", mode\)/);
  assert.match(dashboard, /mode === "aviation"[\s\S]*aviation: true/);
  assert.match(dashboard, /displayMode === "aviation"[\s\S]*scene\.id === "aviation"/);
});

test("aviation mode puts pilot limitations and trends ahead of general products", () => {
  for (const signal of ["Ceiling", "Visibility", "Surface wind", "TAF floor / 12h", "Temp / dew spread", "Freezing level", "Regional reports"]) {
    assert.match(consoleComponent, new RegExp(`>${signal}<`));
  }
  assert.match(consoleComponent, /function flightCategory\(period: TafPeriod\)/);
  assert.match(styles, /\.mode-aviation \.pilot-briefing-strip\s*{[^}]*display:\s*grid;/s);
});

test("pilot text products stay readable in the app while official planning tools remain available", () => {
  assert.match(consoleComponent, /Terminal products/);
  assert.match(consoleComponent, /data\.aviation\?\.raw/);
  assert.match(consoleComponent, /data\.aviationForecast\?\.raw/);
  assert.match(consoleComponent, /data\.discussion\?\.aviation/);
  for (const product of ["Graphical Forecasts", "Icing", "Turbulence", "Winds aloft", "NOTAMs & TFRs", "Official briefing"]) {
    assert.match(consoleComponent, new RegExp(product.replace(/[&]/g, "\\&")));
  }
  assert.match(consoleComponent, /Planning aid only/);
});

test("nearby airport reports include alternate-oriented ceiling, visibility, wind, and distance", () => {
  assert.match(aviationApi, /ceilingFeet:/);
  assert.match(aviationApi, /distanceMiles:/);
  assert.match(consoleComponent, /airport\.ceilingFeet/);
  assert.match(consoleComponent, /airport\.visibility/);
  assert.match(consoleComponent, /airport\.wind/);
  assert.match(consoleComponent, /airport\.distanceMiles/);
});

