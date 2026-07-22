import { NextRequest, NextResponse } from "next/server";
import type {
  AirQuality,
  IntelligenceData,
  NearbyEarthquake,
  SpaceWeather,
} from "@/lib/types";
import { normalizeForecast } from "@/lib/forecast-signals";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

async function getJson<T = JsonRecord>(url: string, revalidate: number): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "WeatherGuy/1.0" },
    next: { revalidate },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getNwsGrid(latitude: number, longitude: number) {
  const point = await getJson(`https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`, 21_600);
  const gridUrl = point.properties?.forecastGridData;
  if (typeof gridUrl !== "string" || !gridUrl.startsWith("https://api.weather.gov/gridpoints/")) {
    throw new Error("NWS grid forecast is unavailable for this location");
  }
  return getJson(gridUrl, 900);
}

function aqiCategory(aqi: number | null) {
  if (aqi === null) return "Unavailable";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

function normalizeAirQuality(payload: JsonRecord): AirQuality {
  const aqi = numberOrNull(payload.current?.us_aqi);
  const next24 = Array.isArray(payload.hourly?.us_aqi)
    ? payload.hourly.us_aqi.slice(0, 24).filter((value: unknown): value is number => typeof value === "number")
    : [];
  const observedAt = typeof payload.current?.time === "number"
    ? new Date(payload.current.time * 1000).toISOString()
    : new Date().toISOString();
  return {
    observedAt,
    aqi,
    category: aqiCategory(aqi),
    pm25: numberOrNull(payload.current?.pm2_5),
    ozone: numberOrNull(payload.current?.ozone),
    next24High: next24.length ? Math.round(Math.max(...next24)) : null,
  };
}

function distanceMiles(latitude: number, longitude: number, otherLat: number, otherLon: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(otherLat - latitude);
  const dLon = radians(otherLon - longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(otherLat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeEarthquake(payload: JsonRecord, latitude: number, longitude: number): NearbyEarthquake | null {
  const features = Array.isArray(payload.features) ? payload.features : [];
  const candidates = features
    .map((feature: JsonRecord) => {
      const coordinates = feature.geometry?.coordinates ?? [];
      return {
        magnitude: numberOrNull(feature.properties?.mag),
        place: feature.properties?.place || "Unknown location",
        occurredAt: new Date(feature.properties?.time ?? Date.now()).toISOString(),
        distanceMiles: Math.round(distanceMiles(latitude, longitude, coordinates[1], coordinates[0])),
        url: feature.properties?.url || "https://earthquake.usgs.gov/earthquakes/map/",
      } satisfies NearbyEarthquake;
    })
    .filter((quake: NearbyEarthquake) => Number.isFinite(quake.distanceMiles))
    .sort((a: NearbyEarthquake, b: NearbyEarthquake) => a.distanceMiles - b.distanceMiles);
  return candidates[0] ?? null;
}

function normalizeSpaceWeather(payload: unknown): SpaceWeather | null {
  if (!Array.isArray(payload) || payload.length < 2) return null;
  const latest = payload[payload.length - 1] as JsonRecord | unknown[];
  const observedAt = Array.isArray(latest) ? String(latest[0]) : String(latest.time_tag);
  const rawKp = Array.isArray(latest) ? Number(latest[1]) : Number(latest.Kp);
  const kp = Number.isFinite(rawKp) ? Math.round(rawKp * 10) / 10 : null;
  return {
    observedAt: new Date(`${observedAt}Z`).toISOString(),
    kp,
    category: kp === null ? "Unavailable" : kp >= 7 ? "Strong storm" : kp >= 5 ? "Geomagnetic storm" : kp >= 4 ? "Active" : "Quiet",
  };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&hourly=apparent_temperature,precipitation,snowfall,cloud_cover,freezing_level_height&forecast_days=3&temperature_unit=fahrenheit&precipitation_unit=inch&timeformat=unixtime&timezone=auto`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=us_aqi,pm2_5,ozone&hourly=us_aqi&forecast_days=2&timeformat=unixtime&timezone=auto`;
  const [forecastResult, nwsGridResult, airResult, earthquakeResult, spaceResult] = await Promise.allSettled([
    getJson(forecastUrl, 900),
    getNwsGrid(latitude, longitude),
    getJson(airUrl, 900),
    getJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", 300),
    getJson<unknown>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", 300),
  ]);

  const notices: string[] = [];
  if (forecastResult.status === "rejected") notices.push("Forecast signal detail is temporarily unavailable.");
  if (airResult.status === "rejected") notices.push("Air-quality guidance is temporarily unavailable.");
  if (earthquakeResult.status === "rejected") notices.push("USGS earthquake feed is temporarily unavailable.");
  if (spaceResult.status === "rejected") notices.push("NOAA space-weather feed is temporarily unavailable.");

  const payload: IntelligenceData = {
    fetchedAt: new Date().toISOString(),
    forecast: forecastResult.status === "fulfilled"
      ? normalizeForecast(forecastResult.value, nwsGridResult.status === "fulfilled" ? nwsGridResult.value : null)
      : null,
    airQuality: airResult.status === "fulfilled" ? normalizeAirQuality(airResult.value) : null,
    earthquake: earthquakeResult.status === "fulfilled" ? normalizeEarthquake(earthquakeResult.value, latitude, longitude) : null,
    spaceWeather: spaceResult.status === "fulfilled" ? normalizeSpaceWeather(spaceResult.value) : null,
    links: {
      spc: "https://www.spc.noaa.gov/products/outlook/",
      rivers: `https://water.noaa.gov/#@=${longitude.toFixed(3)},${latitude.toFixed(3)},7z`,
      tropical: "https://www.nhc.noaa.gov/",
      fire: "https://www.nifc.gov/fire-information/maps",
      buoys: "https://www.ndbc.noaa.gov/",
      aviation: "https://aviationweather.gov/",
    },
    notices,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" },
  });
}
