import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("settings modal keeps its controls visible around a scrolling content bay", () => {
  assert.match(component, /className="settings-modal-body"/);
  assert.match(component, /className="form-actions"/);
  assert.match(component, /<button className="primary-button" type="button" onClick=\{closeLocationSettings\}>Done<\/button>/);
  assert.match(styles, /\.settings-modal\s*{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(styles, /\.settings-modal-body\s*{[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.modal-backdrop\s*{[^}]*overflow:\s*hidden;/s);
});

test("coordinate loading is a local secondary action instead of the settings call to action", () => {
  assert.match(component, /<form id="location-coordinate-form" onSubmit=\{saveLocation\}>[\s\S]*?<button className="coordinate-submit-button" type="submit">Use coordinates<\/button>[\s\S]*?<\/form>/);
  assert.match(component, /Changes save automatically/);
  assert.doesNotMatch(component, />Load this area</);
  assert.match(styles, /\.coordinate-submit-button\s*{[^}]*background:\s*rgba\(var\(--signal-rgb\), 0\.07\)/s);
});

test("location search becomes a focused one-click selection flow", () => {
  assert.match(component, /const searchMode = searchQuery\.trim\(\)\.length > 0/);
  assert.match(component, /\{!searchMode && \(\s*<div className="direct-location-controls">/s);
  assert.match(component, /Choose a result to continue/);
  assert.match(component, /search-result-action">Use this area/);
  assert.match(component, /const chooseSearchResult = \(result: LocationSearchResult\) => \{\s*commitLocation\(/s);
  assert.doesNotMatch(component, /result\.latitude\.toFixed\(2\)/);
  assert.match(styles, /\.search-results-region\s*{[^}]*var\(--signal\)/s);
});
