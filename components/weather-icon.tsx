import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  Wind,
} from "lucide-react";

import { iconCertaintyFromPct } from "@/lib/weather-display";

type WeatherIconProps = {
  condition: string;
  isDaytime?: boolean;
  size?: number;
  strokeWidth?: number;
  chancePct?: number | null;
};

function precipStrokeProps(size: number, strokeWidth: number, chancePct: number | null | undefined) {
  const certainty = iconCertaintyFromPct(chancePct ?? null);
  if (!certainty) return {};

  const title = `${chancePct}% chance`;
  if (certainty === "dotted") {
    const gap = Math.max(2.6, size * 0.15);
    return {
      title,
      strokeDasharray: `0.01 ${gap}`,
      strokeLinecap: "round" as const,
    };
  }
  if (certainty === "dashed") {
    const dash = Math.max(2.8, size * 0.16);
    const gap = Math.max(2.2, size * 0.12);
    return {
      title,
      strokeDasharray: `${dash} ${gap}`,
    };
  }
  if (certainty === "superfull") {
    return {
      title,
      strokeWidth: strokeWidth * 1.75,
    };
  }
  return { title };
}

export function WeatherIcon({
  condition,
  isDaytime = true,
  size = 24,
  strokeWidth = 1.6,
  chancePct,
}: WeatherIconProps) {
  const text = condition.toLowerCase();
  const props = { size, strokeWidth, "aria-hidden": true as const };
  const precipProps = { ...props, ...precipStrokeProps(size, strokeWidth, chancePct) };

  if (text.includes("thunder") || text.includes("t-storm")) return <CloudLightning {...precipProps} />;
  if (text.includes("snow") || text.includes("sleet") || text.includes("blizzard")) {
    return <Snowflake {...precipProps} />;
  }
  if (text.includes("rain") || text.includes("shower") || text.includes("drizzle")) {
    return <CloudRain {...precipProps} />;
  }
  if (text.includes("fog") || text.includes("mist") || text.includes("haze")) {
    return <CloudFog {...props} />;
  }
  if (text.includes("wind") || text.includes("breezy")) return <Wind {...props} />;
  if (text.includes("partly") || text.includes("mostly sunny") || text.includes("mostly clear")) {
    return isDaytime ? <CloudSun {...props} /> : <CloudMoon {...props} />;
  }
  if (text.includes("cloud") || text.includes("overcast")) return <Cloud {...props} />;
  if (text.includes("clear") || text.includes("sunny")) {
    return isDaytime ? <Sun {...props} /> : <Moon {...props} />;
  }
  return isDaytime ? <CloudSun {...props} /> : <CloudMoon {...props} />;
}
