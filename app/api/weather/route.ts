import { NextRequest, NextResponse } from "next/server";
import type {
  AviationForecast,
  AviationObservation,
  DailyPeriod,
  ForecastDiscussion,
  HourlyPeriod,
  WeatherAlert,
  WeatherDashboardData,
} from "@/lib/types";
import { metarObservationTimestamp, selectCurrentObservation } from "@/lib/current-observation";

export const runtime = "nodejs";

const NWS_BASE = "https://api.weather.gov";
const AVIATION_BASE = "https://aviationweather.gov/api/data";
const USER_AGENT =
  process.env.NWS_USER_AGENT ??
  "WeatherGuy/1.0 (https://github.com/chrisremboldt/weatherguy)";

// The upstream NOAA/Aviation payloads are schemaless until normalized below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

async function getJson<T = JsonRecord>(
  url: string,
  revalidate: number,
  accept = "application/geo+json",
): Promise<T> {
  const cacheOptions = revalidate === 0
    ? { cache: "no-store" as const }
    : { next: { revalidate } };
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": USER_AGENT },
    ...cacheOptions,
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function probability(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  return numberOrNull((value as JsonRecord).value);
}

function normalizeHourly(forecast: JsonRecord): HourlyPeriod[] {
  return (forecast.properties?.periods ?? []).slice(0, 24).map((period: JsonRecord) => ({
    startTime: period.startTime,
    temperatureF: period.temperature,
    shortForecast: period.shortForecast,
    isDaytime: Boolean(period.isDaytime),
    precipitationPct: probability(period.probabilityOfPrecipitation),
    humidityPct: probability(period.relativeHumidity),
    windSpeed: period.windSpeed,
    windDirection: period.windDirection,
  }));
}

function normalizeDaily(forecast: JsonRecord): DailyPeriod[] {
  return (forecast.properties?.periods ?? []).slice(0, 10).map((period: JsonRecord) => ({
    startTime: period.startTime,
    name: period.name,
    temperatureF: period.temperature,
    temperatureTrend: period.temperatureTrend ?? null,
    shortForecast: period.shortForecast,
    detailedForecast: period.detailedForecast,
    isDaytime: Boolean(period.isDaytime),
    precipitationPct: probability(period.probabilityOfPrecipitation),
    windSpeed: period.windSpeed,
    windDirection: period.windDirection,
  }));
}

function normalizeAlerts(alerts: JsonRecord): WeatherAlert[] {
  return (alerts.features ?? []).map((feature: JsonRecord) => {
    const properties = feature.properties ?? {};
    return {
      id: feature.id,
      event: properties.event,
      headline: properties.headline || properties.event,
      severity: properties.severity || "Unknown",
      urgency: properties.urgency || "Unknown",
      area: properties.areaDesc || "Local area",
      description: properties.description || "",
      instruction: properties.instruction || null,
      effective: properties.effective,
      expires: properties.expires,
      geometry: feature.geometry ?? null,
    };
  });
}

function tidyProductText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^\d{3}\s+[A-Z]{4,6}.*$/gm, "")
    .replace(/^FXUS\d+.*$/gm, "")
    .replace(/^AFD[A-Z]{3}$/gm, "")
    .replace(/&&/g, "")
    .replace(/\$\$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSection(text: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(
      `(?:^|\\n)\\.${name}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\.[A-Z][A-Z /-]{2,}(?:\\.\\.\\.|\\n)|$)`,
      "i",
    );
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\n+/g, " ").trim();
  }
  return null;
}

function normalizeDiscussion(product: JsonRecord, id: string): ForecastDiscussion {
  const text = tidyProductText(product.productText || "");
  const summary =
    extractSection(text, ["SYNOPSIS", "KEY MESSAGES", "SHORT TERM"]) ??
    text.replace(/\n+/g, " ").slice(0, 900);

  return {
    issuedAt: product.issuanceTime,
    summary,
    aviation: extractSection(text, ["AVIATION"]),
    raw: text,
    sourceUrl: `${NWS_BASE}/products/${id}`,
  };
}

function normalizeAviation(metar: JsonRecord | undefined): AviationObservation | null {
  if (!metar) return null;
  const clouds = Array.isArray(metar.clouds) ? metar.clouds : [];
  const ceiling = clouds.find((cloud: JsonRecord) =>
    ["BKN", "OVC", "VV"].includes(cloud.cover),
  );
  return {
    raw: metar.rawOb,
    flightCategory: metar.fltCat || "VFR",
    observedAt: metarObservationTimestamp(metar) ?? new Date().toISOString(),
    visibility: metar.visib ? String(metar.visib) : null,
    ceilingFeet: numberOrNull(ceiling?.base),
    windDirectionDeg: numberOrNull(metar.wdir),
    windSpeedKt: numberOrNull(metar.wspd),
    windGustKt: numberOrNull(metar.wgst),
    altimeterInHg:
      typeof metar.altim === "number" ? Math.round(metar.altim * 0.02953 * 100) / 100 : null,
  };
}

function epochToIso(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : new Date().toISOString();
}

function normalizeTaf(taf: JsonRecord | undefined): AviationForecast | null {
  if (!taf) return null;
  return {
    raw: taf.rawTAF || "",
    issuedAt: taf.issueTime || taf.bulletinTime || new Date().toISOString(),
    validFrom: epochToIso(taf.validTimeFrom),
    validTo: epochToIso(taf.validTimeTo),
    periods: (taf.fcsts ?? []).slice(0, 8).map((period: JsonRecord) => {
      const clouds = Array.isArray(period.clouds) ? period.clouds : [];
      const ceiling = clouds.find((cloud: JsonRecord) => ["BKN", "OVC", "VV"].includes(cloud.cover));
      const windDirection = typeof period.wdir === "number" ? String(period.wdir).padStart(3, "0") : "VRB";
      return {
        from: epochToIso(period.timeFrom),
        to: epochToIso(period.timeTo),
        change: period.fcstChange || (period.probability ? `PROB${period.probability}` : "Prevailing"),
        probability: numberOrNull(period.probability),
        wind: `${windDirection}° ${period.wspd ?? 0} kt${period.wgst ? ` G${period.wgst}` : ""}`,
        visibility: period.visib ? `${period.visib} sm` : "P6SM",
        ceilingFeet: numberOrNull(ceiling?.base),
        weather: period.wxString || null,
      };
    }),
  };
}

export async function GET(request: NextRequest) {
  const latitudeParam = request.nextUrl.searchParams.get("lat");
  const longitudeParam = request.nextUrl.searchParams.get("lon");

  if (latitudeParam === null || longitudeParam === null) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  const latitude = Number(latitudeParam);
  const longitude = Number(longitudeParam);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ error: "Coordinates are outside the valid range." }, { status: 400 });
  }

  try {
    const point = await getJson<JsonRecord>(
      `${NWS_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`,
      21_600,
    );
    const pointProperties = point.properties;
    const wfo = pointProperties.cwa as string;

    const [hourlyResult, dailyResult, stationResult, alertsResult, productsResult] =
      await Promise.allSettled([
        getJson<JsonRecord>(pointProperties.forecastHourly, 900),
        getJson<JsonRecord>(pointProperties.forecast, 900),
        getJson<JsonRecord>(pointProperties.observationStations, 21_600),
        getJson<JsonRecord>(
          `${NWS_BASE}/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`,
          60,
        ),
        getJson<JsonRecord>(`${NWS_BASE}/products/types/AFD/locations/${wfo}`, 600, "application/ld+json"),
      ]);

    if (stationResult.status === "rejected") throw stationResult.reason;
    const station = stationResult.value.features?.[0];
    if (!station) throw new Error("No nearby NWS observation station was found.");
    const stationId = station.properties.stationIdentifier as string;

    const latestProduct =
      productsResult.status === "fulfilled" ? productsResult.value["@graph"]?.[0] : null;
    const [observationResult, aviationResult, tafResult, discussionResult] = await Promise.allSettled([
      getJson<JsonRecord>(`${NWS_BASE}/stations/${stationId}/observations/latest`, 0),
      getJson<JsonRecord[]>(
        `${AVIATION_BASE}/metar?ids=${encodeURIComponent(stationId)}&format=json&taf=false`,
        0,
        "application/json",
      ),
      getJson<JsonRecord[]>(
        `${AVIATION_BASE}/taf?ids=${encodeURIComponent(stationId)}&format=json` ,
        300,
        "application/json",
      ),
      latestProduct
        ? getJson<JsonRecord>(`${NWS_BASE}/products/${latestProduct.id}`, 600, "application/ld+json")
        : Promise.resolve(null),
    ]);

    if (observationResult.status === "rejected") throw observationResult.reason;

    const relative = pointProperties.relativeLocation?.properties ?? {};
    const notices: string[] = [];
    if (hourlyResult.status === "rejected") notices.push("Hourly forecast is temporarily unavailable.");
    if (dailyResult.status === "rejected") notices.push("Daily forecast is temporarily unavailable.");
    if (alertsResult.status === "rejected") notices.push("NWS alerts could not be refreshed.");
    if (aviationResult.status === "rejected") notices.push("Aviation Weather is temporarily unavailable.");
    if (tafResult.status === "rejected") notices.push("The nearest-airport TAF is temporarily unavailable.");
    if (discussionResult.status === "rejected") notices.push("Forecast discussion is temporarily unavailable.");

    const aviationMetar = aviationResult.status === "fulfilled"
      ? aviationResult.value.find((metar) => String(metar.icaoId).toUpperCase() === stationId.toUpperCase())
      : undefined;

    const dashboard: WeatherDashboardData = {
      fetchedAt: new Date().toISOString(),
      location: {
        city: relative.city || "Selected point",
        state: relative.state || "",
        label: [relative.city, relative.state].filter(Boolean).join(", "),
        latitude,
        longitude,
        timeZone: pointProperties.timeZone || "UTC",
        wfo,
        radarStation: pointProperties.radarStation || "CONUS",
        stationId,
        stationName: station.properties.name || stationId,
      },
      current: selectCurrentObservation(observationResult.value, aviationMetar),
      hourly: hourlyResult.status === "fulfilled" ? normalizeHourly(hourlyResult.value) : [],
      daily: dailyResult.status === "fulfilled" ? normalizeDaily(dailyResult.value) : [],
      alerts: alertsResult.status === "fulfilled" ? normalizeAlerts(alertsResult.value) : [],
      discussion:
        discussionResult.status === "fulfilled" && discussionResult.value && latestProduct
          ? normalizeDiscussion(discussionResult.value, latestProduct.id)
          : null,
      aviation:
        aviationResult.status === "fulfilled" ? normalizeAviation(aviationMetar) : null,
      aviationForecast:
        tafResult.status === "fulfilled" ? normalizeTaf(tafResult.value[0]) : null,
      astronomy: {
        sunrise: pointProperties.astronomicalData?.sunrise ?? null,
        sunset: pointProperties.astronomicalData?.sunset ?? null,
      },
      notices,
    };

    return NextResponse.json(dashboard, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather data is unavailable.";
    return NextResponse.json(
      { error: message, hint: "Try again in a moment or choose another U.S. location." },
      { status: 502 },
    );
  }
}
