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
  metadataBase: new URL("https://wxdynamics.com"),
  title: "wxDynamics — Weather Intelligence Desk",
  description: "An always-on NOAA weather intelligence, radar, forecast, and aviation display.",
  applicationName: "wxDynamics",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "wxDynamics",
    title: "wxDynamics — Weather Intelligence Desk",
    description: "Live NOAA weather intelligence, radar, satellite, forecasts, alerts, and aviation conditions for any U.S. location.",
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 630,
        alt: "wxDynamics weather intelligence desk with live radar and satellite displays",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "wxDynamics — Weather Intelligence Desk",
    description: "Live NOAA radar, satellite, forecasts, alerts, and aviation weather for any U.S. location.",
    images: ["/social-preview.png"],
  },
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
