import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");

test("auto-dim is opt-in and preserves an explicit saved preference", () => {
  assert.match(component, /\[autoDim, setAutoDim\] = useState\(false\)/);
  assert.match(component, /setAutoDim\(window\.localStorage\.getItem\("weatherguy-auto-dim"\) === "true"\)/);
});
