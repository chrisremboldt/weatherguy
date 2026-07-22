export const THEMES = [
  {
    id: "night-watch",
    name: "Night Watch",
    detail: "NOAA mint, ice blue, and deep instrument teal.",
    browserColor: "#07171d",
    swatches: ["#07171d", "#0c252e", "#63e2b7", "#9fe5ff"],
  },
  {
    id: "blue-hour",
    name: "Blue Hour",
    detail: "Cobalt dusk with electric sky telemetry.",
    browserColor: "#07101f",
    swatches: ["#07101f", "#0d2038", "#4dd8ff", "#8faeff"],
  },
  {
    id: "aurora-field",
    name: "Aurora Field",
    detail: "Magnetosphere violet crossed by aurora green.",
    browserColor: "#110f22",
    swatches: ["#110f22", "#1d1938", "#72f1b8", "#b8a5ff"],
  },
  {
    id: "solar-flare",
    name: "Solar Flare",
    detail: "Burnt carbon, warning orange, and hot horizon light.",
    browserColor: "#1a0f0a",
    swatches: ["#1a0f0a", "#2a1911", "#ff9d45", "#ffd28a"],
  },
  {
    id: "phosphor-rain",
    name: "Phosphor Rain",
    detail: "Storm-room CRT green with a sharp amber alarm channel.",
    browserColor: "#041006",
    swatches: ["#041006", "#0b200f", "#83f28f", "#c8ff73"],
  },
  {
    id: "cloud-deck",
    name: "Cloud Deck",
    detail: "A daylight chart room in cool paper, ink, and radar teal.",
    browserColor: "#e8eef1",
    swatches: ["#e8eef1", "#f8fbfc", "#005f56", "#0d5880"],
  },
  {
    id: "bluebird",
    name: "Bluebird",
    detail: "Clear high-altitude blue with crisp cobalt instruments.",
    browserColor: "#dcecf4",
    swatches: ["#dcecf4", "#f8fcff", "#005d72", "#174c8d"],
  },
  {
    id: "marine-layer",
    name: "Marine Layer",
    detail: "Sea-glass daylight, harbor ink, and coastal chart blue.",
    browserColor: "#dce9e7",
    swatches: ["#dce9e7", "#f7fbfa", "#005957", "#1b507d"],
  },
  {
    id: "first-light",
    name: "First Light",
    detail: "Warm dawn paper with grounded teal and aviation blue.",
    browserColor: "#eee5d8",
    swatches: ["#eee5d8", "#fffaf2", "#005a53", "#244d79"],
  },
  {
    id: "polar-station",
    name: "Polar Station",
    detail: "Glacier gray, expedition ink, and cold-front blue.",
    browserColor: "#e3e8ed",
    swatches: ["#e3e8ed", "#fbfcfd", "#005969", "#284b85"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "night-watch";
export const THEME_IDS = THEMES.map((theme) => theme.id);

export function isThemeId(value: string | null): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}
