import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the low-priority sponsor slot promotes Lightcone without displacing weather cards", () => {
  assert.match(dashboard, /<aside className="sponsor-slot" aria-label="Sponsored project">/);
  assert.match(dashboard, /href="https:\/\/lightconesystems\.com\/" target="_blank" rel="sponsored noreferrer"/);
  assert.match(dashboard, /Lightcone Ledger/);
  assert.match(dashboard, /Dispatch and proof for controlled UAS operations\./);
  assert.match(dashboard, /<\/div>\s*<aside className="sponsor-slot"[\s\S]*<footer className="source-strip">/);
});

test("ad inquiries open a pre-addressed email with the requested subject", () => {
  assert.match(dashboard, /mailto:chris\.remboldt@gmail\.com\?subject=wxdynamics%20ad%20space/);
  assert.match(dashboard, />Contact for ad space inquiries<\/a>/);
});

test("fullscreen adds a separate 10-second sponsor phase without shortening weather scenes", () => {
  assert.match(dashboard, /const SPONSOR_WALLBOARD_SECONDS = 10;/);
  assert.match(dashboard, /\(\) => \[\.\.\.enabledWallboardScenes, SPONSOR_WALLBOARD_SCENE\]/);
  assert.match(dashboard, /activeWallboardScene === "sponsor"\s*\?\s*SPONSOR_WALLBOARD_SECONDS\s*:\s*wallboardIntervalSeconds/);
  assert.match(dashboard, /setTimeout\([\s\S]*activeWallboardDurationSeconds \* 1_000/s);
  assert.match(dashboard, /wallboard-scene wallboard-scene-sponsor/);
  assert.match(dashboard, /Sponsored signal · 10 seconds/);
  assert.match(styles, /\.app-shell\.is-fullscreen \.wallboard-scene-sponsor\s*{/);
});

test("very large fullscreen displays keep a compact sponsor signal without taking a scene column", () => {
  assert.match(dashboard, /showAllWallboardScenes && \(\s*<a className="wallboard-sponsor-chip"/s);
  assert.match(styles, /\.app-shell\.is-fullscreen\.wallboard-expanded \.wallboard-scene-sponsor\s*{\s*display:\s*none;/s);
  assert.match(styles, /\.app-shell\.is-fullscreen\.wallboard-expanded \.wallboard-cycle\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
});
