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
  };
}
