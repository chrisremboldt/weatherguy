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

type WeatherIconProps = {
  condition: string;
  isDaytime?: boolean;
  size?: number;
  strokeWidth?: number;
};

export function WeatherIcon({
  condition,
  isDaytime = true,
  size = 24,
  strokeWidth = 1.6,
}: WeatherIconProps) {
  const text = condition.toLowerCase();
  const props = { size, strokeWidth, "aria-hidden": true as const };

  if (text.includes("thunder") || text.includes("t-storm")) return <CloudLightning {...props} />;
  if (text.includes("snow") || text.includes("sleet") || text.includes("blizzard")) {
    return <Snowflake {...props} />;
  }
  if (text.includes("rain") || text.includes("shower") || text.includes("drizzle")) {
    return <CloudRain {...props} />;
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
