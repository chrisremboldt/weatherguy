import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { alertFeedPresentationState, sortWeatherAlerts } from "../lib/weather-alerts.ts";

const weatherApi = await readFile(new URL("../app/api/weather/route.ts", import.meta.url), "utf8");

function alert(event, severity, urgency, effective) {
  return {
    id: event,
    event,
    headline: event,
    severity,
    urgency,
    area: "Test area",
    description: "Test alert",
    instruction: null,
    effective,
    expires: effective,
    geometry: null,
  };
}

test("active weather alerts put the most severe and urgent product first", () => {
  const alerts = sortWeatherAlerts([
    alert("Advisory", "Minor", "Expected", "2026-08-09T10:00:00Z"),
    alert("Watch", "Severe", "Expected", "2026-08-09T09:00:00Z"),
    alert("Warning", "Severe", "Immediate", "2026-08-09T11:00:00Z"),
  ]);

  assert.deepEqual(alerts.map((item) => item.event), ["Warning", "Watch", "Advisory"]);
});

test("an unavailable alert feed is never presented as an all-clear", () => {
  assert.equal(alertFeedPresentationState(null, false), "loading");
  assert.equal(alertFeedPresentationState([], false), "unavailable");
  assert.equal(alertFeedPresentationState([], true), "clear");
  assert.equal(alertFeedPresentationState([alert("Saved", "Minor", "Expected", "2026-08-09T10:00:00Z")], false), "saved");
  assert.equal(alertFeedPresentationState([alert("Live", "Minor", "Expected", "2026-08-09T10:00:00Z")], true), "active");
  assert.match(weatherApi, /alertFeedAvailable: alertsResult\.status === "fulfilled"/);
});
