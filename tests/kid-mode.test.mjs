import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/weather-dashboard.tsx", import.meta.url), "utf8");
const party = await readFile(new URL("../components/kid-mode-party.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Kid mode is opt-in, persisted, and lazily loaded", () => {
  assert.match(dashboard, /\[kidModeEnabled, setKidModeEnabled\] = useState\(false\)/);
  assert.match(dashboard, /setKidModeEnabled\(window\.localStorage\.getItem\("weatherguy-kid-mode"\) === "true"\)/);
  assert.match(dashboard, /const updateKidMode = \(enabled: boolean\) => \{[\s\S]*?persistSetting\("weatherguy-kid-mode", String\(enabled\)\)/);
  assert.match(dashboard, /dynamic\(\s*\(\) => import\("@\/components\/kid-mode-party"\)/s);
  assert.match(dashboard, /aria-label="Kid mode"/);
  assert.match(dashboard, /<KidModeParty suspended=\{locationModalOpen\}/);
  assert.doesNotMatch(dashboard, /suspended=\{locationModalOpen \|\| comparisonOpen\}/);
  assert.match(dashboard, /onKidModeChange=\{updateKidMode\}/);
});

test("keyboard activity starts a timed takeover without exiting fullscreen", () => {
  assert.match(party, /const KID_MODE_IDLE_MS = 10_000/);
  assert.match(party, /window\.addEventListener\("keydown", onKeyDown, \{ capture: true \}\)/);
  assert.match(party, /const fullscreenKidGuard = Boolean\(document\.fullscreenElement\) && !suspendedRef\.current/);
  assert.match(party, /!fullscreenKidGuard && \(event\.defaultPrevented \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| activatingControl\)/);
  assert.match(party, /window\.addEventListener\("keyup", onKeyUp, \{ capture: true \}\)/);
  assert.match(party, /event\.stopImmediatePropagation\(\)/);
  assert.match(party, /document\.querySelector\("\[data-kid-mode-blocker\]"\)/);
  assert.match(party, /event\.target\.closest\("\[data-kid-mode-toggle\]"\)/);
  assert.match(dashboard, /event\.currentTarget\.blur\(\); void requestFullscreen\(\)/);
  assert.match(party, /idleTimer = window\.setTimeout\(endParty, KID_MODE_IDLE_MS\)/);
  assert.match(party, /suspendedRef\.current/);
  assert.doesNotMatch(party, /exitFullscreen/);
  assert.doesNotMatch(party, /requestFullscreen/);
});

test("fullscreen Kid mode progressively locks shortcuts and isolates the weather controls", () => {
  assert.match(party, /keyboard\.lock\(\)/);
  assert.match(party, /document\.addEventListener\("fullscreenchange", syncKeyboardLock\)/);
  assert.match(party, /document\.removeEventListener\("fullscreenchange", syncKeyboardLock\)/);
  assert.match(party, /keyboard\.unlock\(\)/);
  assert.match(party, /querySelectorAll<HTMLElement>\("\[data-kid-mode-surface\]"\)/);
  assert.match(party, /\{ element, wasInert: element\.inert \}/);
  assert.match(party, /element\.inert = true/);
  assert.match(party, /element\.inert = wasInert/);
  assert.match(dashboard, /data-kid-mode-surface/);
  assert.match(party, /rootRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(party, /partyReturnFocus = document\.activeElement instanceof HTMLElement/);
  assert.match(party, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(party, /tabIndex=\{-1\}/);
});

test("the party keeps the original sound controls, performance caps, and parent escape", () => {
  assert.match(party, /const MAX_PARTICLES = 360/);
  assert.match(party, /const MAX_AUDIO_VOICES = 10/);
  assert.match(party, /cornerClicks >= 5/);
  assert.match(party, /aria-label=\{soundOn \? "Turn Kid mode sounds off"/);
  assert.match(styles, /\.kid-party-root\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*10000;/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.kid-party-root::before \{ animation: none; \}/);
});
