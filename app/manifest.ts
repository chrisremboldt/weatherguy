import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "wxDynamics Weather Intelligence Desk",
    short_name: "wxDynamics",
    description: "Always-on NOAA weather intelligence, radar, forecast, and aviation display.",
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
