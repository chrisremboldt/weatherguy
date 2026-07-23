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

test("the sponsor slot stays out of the fullscreen operational wallboard", () => {
  assert.match(styles, /\.app-shell\.is-fullscreen \.sponsor-slot\s*{\s*display:\s*none;\s*}/s);
});

