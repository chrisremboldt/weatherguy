import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const consoleComponent = await readFile(new URL("../components/aviation-console.tsx", import.meta.url), "utf8");
const aviationApi = await readFile(new URL("../app/api/aviation/route.ts", import.meta.url), "utf8");
const weatherApi = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("flight operations is a persistent settings-selectable desk profile", () => {
  assert.match(dashboard, /name: "Flight operations"/);
  assert.match(dashboard, /role="radiogroup" aria-label="Dashboard operating profile"/);
  assert.match(dashboard, /persistSetting\("weatherguy-display-mode", mode\)/);
  assert.match(dashboard, /mode === "aviation"[\s\S]*aviation: true/);
  assert.match(dashboard, /displayMode === "aviation"[\s\S]*scene\.id === "aviation"/);
});

test("aviation mode puts pilot limitations and trends ahead of general products", () => {
  for (const signal of ["Visibility", "Surface wind", "TAF floor / 12h", "Temp / dew spread", "Freezing level", "Regional reports"]) {
    assert.match(consoleComponent, new RegExp(`>${signal}<`));
  }
  assert.match(consoleComponent, /<b>\{currentSky\.label\}<\/b>/);
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

test("aviation values preserve missing and zero observations without inventing sky cover", () => {
  assert.match(consoleComponent, /function ceilingLabel\(feet: number \| null/);
  assert.match(consoleComponent, /feet === null \? unavailableLabel/);
  assert.match(consoleComponent, /No ceiling forecast/);
  assert.match(consoleComponent, /No ceiling rpt/);
  assert.doesNotMatch(consoleComponent, /: "CLR(?: \/ no ceiling)?"/);
  assert.doesNotMatch(consoleComponent, /`BKN \$\{period\.ceilingFeet/);
  assert.match(consoleComponent, /freezingLevelFt !== null && intelligence\?\.forecast\?\.freezingLevelFt !== undefined/);
  assert.match(consoleComponent, /item\.altitudeFt !== null/);
  assert.match(consoleComponent, /observedSkyPresentation\(data\.aviation\?\.skyCondition\)/);
  assert.match(dashboard, /observedSkyPresentation\(data\?\.current\.skyCondition\)/);
  assert.match(dashboard, /observedSkyPresentation\(data\?\.aviation\?\.skyCondition\)/);
  assert.match(dashboard, /detail=\{currentSky\.compact\}/);
  assert.doesNotMatch(dashboard, /ceilingFeet === null \? "No ceiling"/);
});

test("surface wind only uses VRB when the observation marks it variable", () => {
  assert.match(consoleComponent, /windDirectionDeg !== null/);
  assert.match(consoleComponent, /windVariable === true \? "VRB" : "—"/);
  assert.doesNotMatch(consoleComponent, /\? "VRB"[^:]+\}°/);
  assert.match(consoleComponent, /windSpeedKt\} kt/);
});

test("aviation APIs preserve unknown values and the exact METAR observation time", () => {
  assert.match(aviationApi, /metarObservationTimestamp\(item\)/);
  assert.match(weatherApi, /metarObservationTimestamp\(metar\)/);
  assert.match(aviationApi, /item\.fltCat[\s\S]*?"Unknown"/);
  assert.match(weatherApi, /metar\.fltCat[\s\S]*?"Unknown"/);
  assert.doesNotMatch(aviationApi, /fltCat \|\| "VFR"/);
  assert.doesNotMatch(weatherApi, /fltCat \|\| "VFR"/);
  assert.doesNotMatch(weatherApi, /visibility: period\.visib \?[^\n]+"P6SM"/);
  assert.doesNotMatch(weatherApi, /period\.wspd \?\? 0/);
  assert.match(weatherApi, /windVariable:/);
  assert.match(weatherApi, /period\.visib === null \|\| period\.visib === undefined \? null/);
});

test("missing TAF visibility and wind remain unknown instead of becoming VFR", () => {
  assert.match(consoleComponent, /function visibilityMiles\(value: string \| null\)/);
  assert.match(consoleComponent, /if \(value === null\) return null/);
  assert.match(consoleComponent, /if \(period\.ceilingFeet === null && visibility === null\) return "—"/);
  assert.match(consoleComponent, /if \(!categories\.length\) return "—"/);
  assert.match(consoleComponent, /period\.visibility \?\? "—"/);
  assert.match(consoleComponent, /period\.wind \?\? "—"/);
  assert.match(consoleComponent, /category === "—" \? "na"/);
});

test("TAF floor and report age use the live clock and only current overlapping periods", () => {
  assert.match(consoleComponent, /const \[currentTime, setCurrentTime\] = useState\(Date\.now\)/);
  assert.match(consoleComponent, /setInterval\(\(\) => setCurrentTime\(Date\.now\(\)\), 60_000\)/);
  assert.match(consoleComponent, /new Date\(period\.to\)\.getTime\(\) > briefingTime/);
  assert.match(consoleComponent, /new Date\(period\.from\)\.getTime\(\) < twelveHoursFromNow/);
  assert.match(consoleComponent, /twelveHourPeriods\.length \? lowestTafCategory\(twelveHourPeriods\) : "—"/);
  assert.doesNotMatch(consoleComponent, /twelveHourPeriods\.length \? twelveHourPeriods : tafPeriods/);
  assert.doesNotMatch(consoleComponent, /reportAge\([^\n]+data\.fetchedAt/);
  assert.match(consoleComponent, /if \(!Number\.isFinite\(observedAt\)\) return "time unavailable"/);
});

test("the horizontally scrolling TAF timeline is keyboard reachable", () => {
  assert.match(consoleComponent, /className="taf-timeline"[\s\S]*?role="region"[\s\S]*?tabIndex=\{0\}/);
  assert.match(consoleComponent, /terminal forecast timeline; scroll horizontally for later periods/);
  assert.match(consoleComponent, /!displayedTafPeriods\.length && <p>No current terminal forecast periods/);
});
