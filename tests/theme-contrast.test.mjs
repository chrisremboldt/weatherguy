import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const darkThemes = ["night-watch", "blue-hour", "aurora-field", "solar-flare", "phosphor-rain"];
const lightThemes = ["cloud-deck", "bluebird", "marine-layer", "first-light", "polar-station"];
const allThemes = [...darkThemes, ...lightThemes];
const surfaceTokens = ["ink", "ink-deep", "ink-deepest", "ink-soft", "panel", "panel-high"];
const foregroundTokens = ["cloud", "copy", "copy-strong", "muted", "faint", "signal", "sky", "amber", "danger", "danger-copy", "danger-copy-soft", "danger-contrast"];

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function hexChannels(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function blend(foreground, background, alpha) {
  const foregroundChannels = Array.isArray(foreground) ? foreground : hexChannels(foreground);
  const backgroundChannels = hexChannels(background);
  return toHex(foregroundChannels.map((channel, index) => channel * alpha + backgroundChannels[index] * (1 - alpha)));
}

function declarations(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}|\d+,\s*\d+,\s*\d+)/gi)].map((match) => [match[1], match[2]]));
}

const defaultTokens = declarations(styles.match(/:root\s*\{([^}]*)\}/s)?.[1] ?? "");

function themeTokens(id) {
  if (id === "night-watch") return defaultTokens;
  const block = styles.match(new RegExp(`:root\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(block, `missing CSS block for ${id}`);
  return { ...defaultTokens, ...declarations(block[1]) };
}

test("every theme meets WCAG AA contrast on every dashboard surface", () => {
  for (const id of allThemes) {
    const tokens = themeTokens(id);
    const controlSurface = toHex(tokens["control-rgb"].split(",").map(Number));
    const surfaces = [...surfaceTokens.map((token) => [token, tokens[token]]), ["control", controlSurface]];
    for (const foreground of foregroundTokens) {
      assert.ok(tokens[foreground], `${id} is missing --${foreground}`);
      for (const [surface, color] of surfaces) {
        assert.ok(color, `${id} is missing --${surface}`);
        const ratio = contrast(tokens[foreground], color);
        assert.ok(ratio >= 4.5, `${id} --${foreground} is ${ratio.toFixed(2)}:1 against --${surface}`);
      }
    }
  }
});

test("every theme warning and error surface retains WCAG AA contrast", () => {
  for (const id of allThemes) {
    const tokens = themeTokens(id);
    const warning = blend(tokens["danger-surface-rgb"].split(",").map(Number), tokens.ink, 0.36);
    const error = blend(tokens["danger-surface-strong-rgb"].split(",").map(Number), tokens.ink, 0.55);

    for (const foreground of ["cloud", "danger-copy", "danger-copy-soft"]) {
      const ratio = contrast(tokens[foreground], warning);
      assert.ok(ratio >= 4.5, `${id} --${foreground} is ${ratio.toFixed(2)}:1 on the warning rail`);
    }

    const errorRatio = contrast(tokens["danger-contrast"], error);
    assert.ok(errorRatio >= 4.5, `${id} error copy is ${errorRatio.toFixed(2)}:1 on the error banner`);
  }

  assert.match(styles, /\.has-alerts \.alert-message span,[\s\S]*var\(--danger-copy-soft\)/);
  assert.match(styles, /\.error-banner button\s*\{[^}]*color:\s*var\(--danger-contrast\)/s);
});
