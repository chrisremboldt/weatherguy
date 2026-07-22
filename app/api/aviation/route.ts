import { NextRequest, NextResponse } from "next/server";
import type { AviationAdvisory, AviationData, NearbyAirport, PilotReport } from "@/lib/types";

export const runtime = "nodejs";
const BASE = "https://aviationweather.gov/api/data";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>;

async function getJson(url: string, revalidate: number) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "wxDynamics/1.0 (https://wxdynamics.com)" },
    next: { revalidate },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`AviationWeather.gov returned ${response.status}`);
  return response.json() as Promise<JsonRecord[]>;
}

function epoch(value: unknown) {
  return new Date((typeof value === "number" ? value * 1000 : Date.now())).toISOString();
}

function nearbyAirport(item: JsonRecord): NearbyAirport {
  return {
    id: item.icaoId || "—",
    name: item.name || item.icaoId || "Airport",
    flightCategory: item.fltCat || "VFR",
    temperatureF: typeof item.temp === "number" ? Math.round((item.temp * 9) / 5 + 32) : null,
    wind: `${typeof item.wdir === "number" ? String(item.wdir).padStart(3, "0") : "VRB"}° ${item.wspd ?? 0}kt${item.wgst ? ` G${item.wgst}` : ""}`,
    visibility: item.visib ? String(item.visib) : null,
    observedAt: item.reportTime || epoch(item.obsTime),
  };
}

function pilotReport(item: JsonRecord): PilotReport {
  const icing = [item.icgInt1, item.icgType1].filter(Boolean).join(" ") || null;
  const turbulence = [item.tbInt1, item.tbType1].filter(Boolean).join(" ") || null;
  return {
    observedAt: epoch(item.obsTime),
    aircraft: item.acType || "Aircraft",
    altitudeFt: typeof item.fltLvl === "number" ? item.fltLvl * 100 : null,
    icing,
    turbulence,
    weather: item.wxString || null,
    raw: item.rawOb || "",
  };
}

function touchesArea(item: JsonRecord, latitude: number, longitude: number) {
  const coordinates = Array.isArray(item.coords) ? item.coords : [];
  return coordinates.some((point: JsonRecord) => {
    const lat = Number(point.lat ?? point[1]);
    const lon = Number(point.lon ?? point[0]);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat - latitude) <= 6 && Math.abs(lon - longitude) <= 7;
  });
}

function advisory(item: JsonRecord): AviationAdvisory {
  return {
    id: [item.seriesId, item.alphaChar].filter(Boolean).join(" ") || item.icaoId || "Advisory",
    kind: item.airSigmetType || "SIGMET",
    hazard: item.hazard || "Weather hazard",
    severity: item.severity || null,
    validTo: epoch(item.validTimeTo),
    raw: item.rawAirSigmet || "",
  };
}

export async function GET(request: NextRequest) {
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Valid coordinates are required." }, { status: 400 });
  }
  const bbox = `${(latitude - 1.5).toFixed(2)},${(longitude - 2).toFixed(2)},${(latitude + 1.5).toFixed(2)},${(longitude + 2).toFixed(2)}`;
  const [metarResult, pirepResult, advisoryResult] = await Promise.allSettled([
    getJson(`${BASE}/metar?bbox=${bbox}&format=json&hours=2`, 60),
    getJson(`${BASE}/pirep?bbox=${bbox}&format=json&age=3`, 120),
    getJson(`${BASE}/airsigmet?format=json`, 120),
  ]);
  const notices: string[] = [];
  if (metarResult.status === "rejected") notices.push("Nearby METARs unavailable.");
  if (pirepResult.status === "rejected") notices.push("PIREPs unavailable.");
  if (advisoryResult.status === "rejected") notices.push("SIGMET feed unavailable.");

  const latestMetars = new Map<string, JsonRecord>();
  if (metarResult.status === "fulfilled") {
    for (const item of metarResult.value) {
      const id = String(item.icaoId || "");
      const existing = latestMetars.get(id);
      if (id && (!existing || Number(item.obsTime) > Number(existing.obsTime))) latestMetars.set(id, item);
    }
  }
  const airports = metarResult.status === "fulfilled"
    ? Array.from(latestMetars.values())
        .sort((a, b) => {
          const aDistance = (Number(a.lat) - latitude) ** 2 + (Number(a.lon) - longitude) ** 2;
          const bDistance = (Number(b.lat) - latitude) ** 2 + (Number(b.lon) - longitude) ** 2;
          return aDistance - bDistance;
        })
        .slice(0, 8)
        .map(nearbyAirport)
    : [];
  const pireps = pirepResult.status === "fulfilled" ? pirepResult.value.slice(0, 6).map(pilotReport) : [];
  const advisories = advisoryResult.status === "fulfilled"
    ? advisoryResult.value.filter((item) => touchesArea(item, latitude, longitude)).slice(0, 8).map(advisory)
    : [];

  const payload: AviationData = { fetchedAt: new Date().toISOString(), airports, pireps, advisories, notices };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=600" },
  });
}
