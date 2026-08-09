import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("very large fullscreen displays open all enabled wallboard scenes", () => {
  assert.match(component, /EXPANDED_WALLBOARD_QUERY = "\(min-width: 3000px\) and \(min-height: 900px\)"/);
  assert.match(component, /showAllWallboardScenes = isFullscreen && largeDisplayWallboard/);
  assert.match(component, /showAllWallboardScenes \? "All stations open"/);
  assert.match(styles, /@media \(min-width: 3000px\) and \(min-height: 900px\)/);
  assert.match(styles, /\.wallboard-scene\.enabled\s*{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
});

test("Weather Desk fullscreen opens forecast and intelligence together when they fit", () => {
  assert.match(component, /DESK_OVERVIEW_QUERY = "\(min-width: 1280px\) and \(min-height: 720px\)"/);
  assert.match(component, /showDeskOverview =\s*isFullscreen &&\s*displayMode === "desk"/s);
  assert.match(component, /showAllWallboardScenes \|\| showDeskOverview \|\| !wallboardRotate/);
  assert.match(component, /showDeskOverview \? "Live essentials open"/);
  assert.match(component, /showDeskOverview \? "No rotation"/);
  assert.match(component, /wallboard-desk-overview/);
  assert.match(styles, /@media \(min-width: 1280px\) and \(min-height: 720px\)/);
  assert.match(styles, /\.wallboard-desk-overview \.dashboard-grid\s*{[^}]*clamp\(286px, 34vh, 340px\)/s);
  assert.match(styles, /\.wallboard-desk-overview \.wallboard-scene-forecast,[^}]*\.wallboard-desk-overview \.wallboard-scene-intelligence\s*{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  assert.match(styles, /\.wallboard-desk-overview \.wallboard-scene-forecast \.discussion-panel,[\s\S]*?\.wallboard-desk-overview \.wallboard-scene-intelligence \.field-tools\s*{[^}]*display:\s*none;/);
  assert.match(styles, /\.wallboard-desk-overview \.wallboard-scene-intelligence > \.intelligence-grid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(230px, 0\.85fr\);/s);
  assert.match(styles, /\.wallboard-desk-overview \.signal-panel\s*{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/s);
  assert.match(styles, /\.wallboard-desk-overview \.environment-panel\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/s);
  assert.match(styles, /\.wallboard-desk-overview \.current-nowcast\s*{[^}]*display:\s*none;/s);
});

test("wallboard entry and scene controls match the supported viewport and keyboard model", () => {
  assert.match(component, /className="icon-button wallboard-toggle"/);
  assert.match(styles, /@media \(max-width: 899px\), \(max-height: 619px\)/);
  assert.match(styles, /\.wallboard-toggle\s*{[^}]*display:\s*none;/s);
  assert.match(component, /role="tablist" aria-label="Choose wallboard scene"/);
  assert.match(component, /showRotatingWallboard = isFullscreen && !showAllWallboardScenes && !showDeskOverview/);
  assert.match(component, /role=\{showRotatingWallboard \? "tabpanel"/);
  assert.match(component, /aria-controls=\{`wallboard-scene-\$\{scene\.id\}`\}/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /wallboardFocusWithin/);
  assert.match(styles, /\.wallboard-cycle-actions button\s*{[^}]*width:\s*32px;[^}]*height:\s*30px;/s);
});
