import { NextRequest, NextResponse } from "next/server";
import type { RadarData, RadarProduct, RadarProductId } from "@/lib/types";

export const runtime = "nodejs";

const OPEN_GEO = "https://opengeo.ncep.noaa.gov/geoserver";

function product(
  station: string,
  id: RadarProductId,
  label: string,
  detail: string,
  suffix: string,
  style: string,
): RadarProduct {
  const workspace = station.toLowerCase();
  const wmsUrl = `${OPEN_GEO}/${workspace}/ows`;
  const layer = `${workspace}_${suffix}`;
  return {
    id,
    label,
    detail,
    wmsUrl,
    layer,
    style,
    legendUrl: `${wmsUrl}?service=WMS&request=GetLegendGraphic&format=image/png&width=16&height=16&layer=${layer}&style=${style}`,
  };
}

export async function GET(request: NextRequest) {
  const stationParam = request.nextUrl.searchParams.get("station")?.toUpperCase() ?? "";
  const station = /^[A-Z0-9]{4}$/.test(stationParam) ? stationParam : "KTLX";
  const workspace = station.toLowerCase();
  const capabilitiesUrl = `${OPEN_GEO}/${workspace}/ows?service=WMS&request=GetCapabilities&version=1.3.0`;

  const products: RadarProduct[] = [
    product(station, "bref", "Base reflectivity", "Lowest-tilt super-resolution reflectivity", "sr_bref", "radar_reflectivity"),
    product(station, "velocity", "Radial velocity", "Inbound and outbound wind toward the radar", "sr_bvel", "radar_velocity"),
    product(station, "hydrometeor", "Hydrometeor class", "Dual-pol estimate of rain, snow, hail, and clutter", "bdhc", "radar_bdhc"),
    product(station, "rain1h", "One-hour rain", "Radar-estimated precipitation accumulation", "boha", "radar_boha"),
    product(station, "rainstorm", "Storm-total rain", "Accumulation since the current event began", "bdsa", "radar_bdsa"),
    {
      id: "cref",
      label: "Composite reflectivity",
      detail: "MRMS mosaic using the strongest return in the vertical column",
      wmsUrl: `${OPEN_GEO}/conus/conus_cref_qcd/ows`,
      layer: "conus_cref_qcd",
      style: "radar_reflectivity",
      legendUrl: `${OPEN_GEO}/conus/conus_cref_qcd/ows?service=WMS&request=GetLegendGraphic&format=image/png&width=16&height=16&layer=conus_cref_qcd&style=radar_reflectivity`,
    },
  ];

  let times: string[] = [];
  try {
    const response = await fetch(capabilitiesUrl, {
      next: { revalidate: 90 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`NWS OpenGeo returned ${response.status}`);
    const xml = await response.text();
    const values = Array.from(
      xml.matchAll(/<Dimension[^>]+name="time"[^>]*>([^<]+)<\/Dimension>/gi),
      (match) => match[1].split(","),
    ).flat();
    times = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort().slice(-12);
  } catch {
    times = [];
  }

  const payload: RadarData = {
    fetchedAt: new Date().toISOString(),
    station,
    region: "NWS OpenGeo / NEXRAD Level III",
    times,
    products,
    sourceUrl: "https://opengeo.ncep.noaa.gov/geoserver/www/index.html",
  };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=600" },
  });
}
