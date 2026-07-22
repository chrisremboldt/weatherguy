import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import { DEFAULT_THEME, THEME_IDS } from "@/lib/themes";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "WeatherGuy — Observation Desk",
  description: "An always-on NOAA weather, radar, forecast, and aviation display.",
  applicationName: "WeatherGuy",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#07171d",
  colorScheme: "dark light",
};

const themeBootstrap = `(() => { try { const saved = localStorage.getItem("weatherguy-theme"); const allowed = ${JSON.stringify(THEME_IDS)}; document.documentElement.dataset.theme = allowed.includes(saved) ? saved : "${DEFAULT_THEME}"; } catch { document.documentElement.dataset.theme = "${DEFAULT_THEME}"; } })();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
