import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const themes = await readFile(new URL("../lib/themes.ts", import.meta.url), "utf8");

test("auto-dim is opt-in and preserves an explicit saved preference", () => {
  assert.match(component, /\[autoDim, setAutoDim\] = useState\(false\)/);
  assert.match(component, /setAutoDim\(window\.localStorage\.getItem\("weatherguy-auto-dim"\) === "true"\)/);
});

test("ten named color schemes are selectable, persisted, and restored before paint", () => {
  for (const name of ["Night Watch", "Blue Hour", "Aurora Field", "Solar Flare", "Phosphor Rain", "Cloud Deck", "Bluebird", "Marine Layer", "First Light", "Polar Station"]) {
    assert.match(themes, new RegExp(`name: "${name}"`));
  }
  assert.match(component, /role="radiogroup" aria-label="Dashboard color scheme"/);
  assert.match(component, /persistSetting\("weatherguy-theme", nextTheme\)/);
  assert.match(component, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(layout, /localStorage\.getItem\("weatherguy-theme"\)/);
});

test("every alternate theme overrides the full dashboard token set", () => {
  for (const id of ["blue-hour", "aurora-field", "solar-flare", "phosphor-rain", "cloud-deck", "bluebird", "marine-layer", "first-light", "polar-station"]) {
    assert.match(styles, new RegExp(`:root\\[data-theme="${id}"\\]`));
  }
  for (const id of ["cloud-deck", "bluebird", "marine-layer", "first-light", "polar-station"]) {
    assert.match(styles, new RegExp(`:root\\[data-theme="${id}"\\]\\s*\\{[^}]*color-scheme:\\s*light;`, "s"));
  }
  assert.match(styles, /\.theme-option\.active\s*{[^}]*var\(--signal\)/s);
});
