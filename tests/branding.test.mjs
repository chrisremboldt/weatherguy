import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const manifest = await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("wxDynamics is the product identity across the interface and install metadata", () => {
  assert.match(component, />WX DYNAMICS</);
  assert.match(component, />Weather intelligence</);
  assert.match(component, />wxDynamics controls</);
  assert.match(layout, /title: "wxDynamics — Weather Intelligence Desk"/);
  assert.match(layout, /metadataBase: new URL\("https:\/\/wxdynamics\.com"\)/);
  assert.match(manifest, /name: "wxDynamics Weather Intelligence Desk"/);
  assert.match(manifest, /short_name: "wxDynamics"/);
  assert.match(readme, /^# wxDynamics$/m);
  assert.match(serviceWorker, /const CACHE = "wxdynamics-v3"/);
});

test("social sharing metadata uses the branded large preview", () => {
  assert.match(layout, /url: "\/social-preview\.png"/);
  assert.match(layout, /width: 1200/);
  assert.match(layout, /height: 630/);
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /alt: "wxDynamics weather intelligence desk with live radar and satellite displays"/);
});

test("legacy browser storage identifiers remain stable through the rebrand", () => {
  assert.match(component, /localStorage\.getItem\("weatherguy-location"\)/);
  assert.match(component, /persistSetting\("weatherguy-theme", nextTheme\)/);
});
