import { NextRequest, NextResponse } from "next/server";
import type { SatelliteData, SatelliteProductId } from "@/lib/types";

export const runtime = "nodejs";

const CDN = "https://cdn.star.nesdis.noaa.gov";
const ALLOWED_PRODUCTS: Record<SatelliteProductId, string> = {
  GEOCOLOR: "GeoColor",
  "13": "Clean infrared",
  "09": "Mid-level water vapor",
  DayNightCloudMicroCombo: "Cloud phase",
  EXTENT3: "Lightning density",
  FireTemperature: "Fire temperature",
  Dust: "Dust RGB",
};

function validCoordinate(value: string | null, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function resolveSector(latitude: number, longitude: number) {
  if (latitude >= 50 && longitude <= -130) {
    return { satellite: "GOES-18" as const, code: "G18", path: "SECTOR/ak", label: "Alaska" };
  }
  if (latitude >= 15 && latitude <= 25 && longitude >= -163 && longitude <= -151) {
    return { satellite: "GOES-18" as const, code: "G18", path: "SECTOR/hi", label: "Hawaii" };
  }
  if (latitude >= 10 && latitude <= 23 && longitude >= 130) {
    return { satellite: "GOES-18" as const, code: "G18", path: "SECTOR/gu", label: "Guam / western Pacific" };
  }
  if (latitude >= 15 && latitude <= 22 && longitude >= -70 && longitude <= -60) {
    return { satellite: "GOES-19" as const, code: "G19", path: "SECTOR/pr", label: "Caribbean" };
  }
  if (longitude < -105) {
    return { satellite: "GOES-18" as const, code: "G18", path: "PACUS", label: "Pacific U.S." };
  }
  return { satellite: "GOES-19" as const, code: "G19", path: "CONUS", label: "Continental U.S." };
}

function timestampFromFilename(filename: string) {
  const match = filename.match(/^(\d{4})(\d{3})(\d{2})(\d{2})_/);
  if (!match) return new Date().toISOString();
  const [, year, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), 0, Number(day), Number(hour), Number(minute))).toISOString();
}

export async function GET(request: NextRequest) {
  const latitude = validCoordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
  const longitude = validCoordinate(request.nextUrl.searchParams.get("lon"), -180, 180);
  const requestedProduct = request.nextUrl.searchParams.get("product") as SatelliteProductId | null;
  const product = requestedProduct && requestedProduct in ALLOWED_PRODUCTS ? requestedProduct : "GEOCOLOR";

  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const sector = resolveSector(latitude, longitude);
  const instrument = product === "EXTENT3" ? "GLM" : "ABI";
  const directory = `${CDN}/${sector.satellite.replace("-", "")}/${instrument}/${sector.path}/${product}`;
  let notice: string | null = null;

  try {
    const response = await fetch(`${directory}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`NOAA STAR returned ${response.status}`);
    const html = await response.text();
    const filenames = Array.from(html.matchAll(/href="([^"]+-1250x750\.jpg)"/g), (match) => match[1]);
    const unique = Array.from(new Set(filenames)).sort().slice(-12);
    if (unique.length === 0) throw new Error("No recent frames were listed");

    const payload: SatelliteData = {
      fetchedAt: new Date().toISOString(),
      satellite: sector.satellite,
      sector: sector.path,
      sectorLabel: sector.label,
      product,
      productLabel: ALLOWED_PRODUCTS[product],
      frames: unique.map((filename) => ({
        url: `${directory}/${filename}`,
        capturedAt: timestampFromFilename(filename),
      })),
      sourceUrl: `https://www.star.nesdis.noaa.gov/GOES/${sector.path.startsWith("SECTOR") ? "sector.php" : "conus_band.php"}?band=${product}&length=12&sat=${sector.code}`,
      notice,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=180, stale-while-revalidate=900" },
    });
  } catch (error) {
    notice = error instanceof Error ? error.message : "The satellite loop is temporarily unavailable.";
    const fallback: SatelliteData = {
      fetchedAt: new Date().toISOString(),
      satellite: sector.satellite,
      sector: sector.path,
      sectorLabel: sector.label,
      product,
      productLabel: ALLOWED_PRODUCTS[product],
      frames: [{ url: `${directory}/1250x750.jpg`, capturedAt: new Date().toISOString() }],
      sourceUrl: "https://www.star.nesdis.noaa.gov/GOES/",
      notice: `Loop index unavailable; showing NOAA's latest frame. ${notice}`,
    };
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  }
}
