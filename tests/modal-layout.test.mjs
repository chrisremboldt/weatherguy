import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("settings modal keeps its controls visible around a scrolling content bay", () => {
  assert.match(component, /className="settings-modal-body"/);
  assert.match(component, /className="form-actions"/);
  assert.match(component, /form="location-coordinate-form"/);
  assert.match(styles, /\.settings-modal\s*{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(styles, /\.settings-modal-body\s*{[^}]*overflow-y:\s*auto;/s);
  assert.match(styles, /\.modal-backdrop\s*{[^}]*overflow:\s*hidden;/s);
});
