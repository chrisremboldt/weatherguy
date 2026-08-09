import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const context = await readFile(new URL("../components/observation-context.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const aviation = await readFile(new URL("../components/aviation-console.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the status column adds a mode-aware station recorder with trend, nearby, and briefing views", () => {
  assert.match(context, /type ContextTab = "trend" \| "nearby" \| "briefing"/);
  assert.match(context, /mode === "aviation"[\s\S]*return "nearby"/);
  assert.match(context, /mode === "severe"[\s\S]*return "briefing"/);
  assert.match(context, /Six-hour temperature and dew point trace/);
  assert.match(dashboard, /<ObservationContext data=\{data\} regional=\{regionalAviation\} mode=\{displayMode\}/);
  assert.match(styles, /\.context-panel\s*{[^}]*flex:\s*1 1 260px;/s);
});

test("station context tabs expose a complete keyboard-operable tab pattern", () => {
  assert.match(context, /role="tablist" aria-label="Station context view"/);
  assert.match(context, /role="tab"[\s\S]*?aria-controls=\{panelId\}[\s\S]*?aria-selected=\{activeTab === tab\.id\}[\s\S]*?tabIndex=\{activeTab === tab\.id \? 0 : -1\}/);
  assert.match(context, /event\.key === "ArrowRight"/);
  assert.match(context, /event\.key === "ArrowLeft"/);
  assert.match(context, /event\.key === "Home"/);
  assert.match(context, /event\.key === "End"/);
  assert.match(context, /role="tabpanel"[\s\S]*?aria-labelledby=\{activeTabId\}/);
});

test("local briefing exposes every active alert instead of only the first", () => {
  assert.match(context, /data\.alerts\.map\(\(alert\) =>/);
  assert.match(context, /role="list"/);
  assert.match(context, /role="listitem"/);
  assert.match(context, /All active NWS alerts for this point/);
  assert.doesNotMatch(context, /const alert = data\.alerts\[0\]/);
});

test("station context uses explicit pressure and no-ceiling semantics", () => {
  assert.match(context, /deltaLabel\(pressureChange, " inHg"\)/);
  assert.match(context, /feet === null \? "No ceiling rpt"/);
  assert.doesNotMatch(context, /: "CLR"/);
});

test("compact desktop stacks airport weather and the recorder instead of stretching a blank card", () => {
  assert.match(styles, /@media \(min-width: 821px\) and \(max-width: 1150px\)/);
  assert.match(styles, /\.status-column \.current-panel\s*{[^}]*grid-row:\s*1 \/ 3;/s);
  assert.match(styles, /\.status-column \.aviation-panel\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
  assert.match(styles, /\.status-column \.context-panel\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/s);
  assert.match(styles, /\.status-column \.context-trend\s*{[^}]*grid-template-rows:\s*minmax\(78px, 1fr\) auto;/s);
});

test("recent station history uses NWS observations with a six-hour METAR fallback", () => {
  assert.match(route, /observations\?start=\$\{encodeURIComponent\(observationHistoryStart\)\}&limit=100/);
  assert.match(route, /format=json&taf=false&hours=6/);
  assert.match(route, /observationHistory:\s*selectObservationHistory/);
});

test("regional aviation data is fetched once and shared with both status and pilot views", () => {
  assert.match(dashboard, /fetch\(`\/api\/aviation\?\$\{intelligenceCoordinates\}`/);
  assert.match(dashboard, /<AviationConsole data=\{data\} intelligence=\{intelligence\} regional=\{regionalAviation\}/);
  assert.doesNotMatch(aviation, /fetch\(`\/api\/aviation/);
});

test("fullscreen uses a compact recorder strip without adding another rotating scene", () => {
  assert.match(dashboard, /<FullscreenObservationStrip data=\{data\}/);
  assert.match(styles, /\.app-shell\.is-fullscreen \.context-panel\s*{[^}]*display:\s*none;/s);
  assert.match(styles, /@media \(min-width: 900px\) and \(min-height: 1000px\)[\s\S]*\.current-context-strip\s*{[^}]*display:\s*grid;/s);
});
