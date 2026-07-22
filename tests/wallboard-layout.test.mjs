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
