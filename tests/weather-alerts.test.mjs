import assert from "node:assert/strict";
import test from "node:test";

import { sortWeatherAlerts } from "../lib/weather-alerts.ts";

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
