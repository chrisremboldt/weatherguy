import assert from "node:assert/strict";
import test from "node:test";
import { deskExperienceFromParams, withDeskExperience } from "../lib/desk-experience.ts";
import { withComparisonLocation, withoutComparisonLocation } from "../lib/comparison.ts";

test("explicit desk links take precedence over a different saved preference", () => {
  assert.equal(deskExperienceFromParams("view=observatory", "classic"), "observatory");
  assert.equal(deskExperienceFromParams("view=classic", "observatory"), "classic");
  assert.equal(deskExperienceFromParams("view=classic&desk=observatory", null), "classic");
  assert.equal(deskExperienceFromParams("view=unknown&desk=observatory", "classic"), "observatory");
  assert.equal(deskExperienceFromParams("", "classic"), "classic");
  assert.equal(deskExperienceFromParams("desk=unknown", "unknown"), "observatory");
});

test("desk switches preserve coordinates, the location label, and unrelated URL settings", () => {
  const original = new URLSearchParams("lat=44.7631&lon=-85.6206&location=Traverse+City&theme=night");
  const switched = withDeskExperience(original, "classic");
  assert.equal(switched.get("lat"), "44.7631");
  assert.equal(switched.get("lon"), "-85.6206");
  assert.equal(switched.get("location"), "Traverse City");
  assert.equal(switched.get("theme"), "night");
  assert.equal(switched.get("view"), "classic");
  assert.equal(switched.get("desk"), "classic");
  assert.equal(original.has("desk"), false);
  assert.equal(deskExperienceFromParams(withDeskExperience(switched, "observatory"), "classic"), "observatory");
});

test("comparison shares and closing comparison retain the originating desk", () => {
  for (const desk of ["classic", "observatory"]) {
    const params = withDeskExperience("lat=44.7631&lon=-85.6206", desk);
    const comparison = withComparisonLocation(params, { latitude: 39.7392, longitude: -104.9903, customLabel: "Denver" });
    assert.equal(comparison.get("view"), "compare");
    assert.equal(deskExperienceFromParams(comparison, desk === "classic" ? "observatory" : "classic"), desk);
    const closed = withoutComparisonLocation(comparison);
    assert.equal(deskExperienceFromParams(closed, null), desk);
    assert.equal(closed.get("lat"), "44.7631");
    assert.equal(closed.has("compareLat"), false);
  }
});

test("changing a location keeps the desk choice even without browser storage", () => {
  const params = withDeskExperience("view=classic&lat=44.7&lon=-85.6", "classic");
  params.set("lat", "39.7392");
  params.set("lon", "-104.9903");
  assert.equal(deskExperienceFromParams(params, null), "classic");
});
