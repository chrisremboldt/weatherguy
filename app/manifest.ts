import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeatherGuy Observation Desk",
    short_name: "WeatherGuy",
    description: "Always-on NOAA weather, radar, forecast, and aviation display.",
    start_url: "/",
    display: "standalone",
    background_color: "#07171d",
    theme_color: "#07171d",
    orientation: "any",
    categories: ["weather", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
