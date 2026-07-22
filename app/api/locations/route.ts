import { NextRequest, NextResponse } from "next/server";
import type { LocationSearchResult } from "@/lib/types";

export const runtime = "nodejs";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NWS_COUNTRY_CODES = new Set(["US", "PR", "VI", "GU", "AS", "MP"]);
const REGION_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  feature_code?: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
  error?: boolean;
  reason?: string;
};

function normalizeResult(result: GeocodingResult): LocationSearchResult {
  const country = result.country || REGION_NAMES[result.country_code || ""] || "United States";
  const firstRegion = result.admin1 || result.admin2 || country;
  const region =
    firstRegion.toLowerCase() === result.name.toLowerCase()
      ? country
      : firstRegion;
  const labelParts = [result.name];
  if (region && region.toLowerCase() !== result.name.toLowerCase()) labelParts.push(region);

  return {
    id: String(result.id),
    name: result.name,
    region,
    country,
    countryCode: result.country_code || "US",
    latitude: result.latitude,
    longitude: result.longitude,
    timeZone: result.timezone || "UTC",
    label: labelParts.join(", "),
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json(
      { error: "Enter at least two characters to search for a location." },
      { status: 400 },
    );
  }

  if (query.length > 100) {
    return NextResponse.json({ error: "Location search is too long." }, { status: 400 });
  }

  try {
    const regionMatch = query.match(/^(.+?)(?:,\s*|\s+)([A-Za-z]{2})$/);
    const regionCode = regionMatch?.[2].toUpperCase();
    const regionHint = regionCode ? REGION_NAMES[regionCode] : undefined;
    const searchName = regionHint && regionMatch ? regionMatch[1].trim() : query;
    const url = new URL(GEOCODING_URL);
    url.searchParams.set("name", searchName);
    url.searchParams.set("count", "25");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      headers: { "User-Agent": "wxDynamics/1.0 (https://wxdynamics.com; location search)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) throw new Error(`Location service returned ${response.status}.`);
    const payload = (await response.json()) as GeocodingResponse;
    if (payload.error) throw new Error(payload.reason || "Location search failed.");

    const seen = new Set<string>();
    const candidates = (payload.results ?? [])
      .filter(
        (result) =>
          NWS_COUNTRY_CODES.has(result.country_code || "") &&
          (!result.feature_code || result.feature_code.startsWith("PPL")) &&
          Number.isFinite(result.latitude) &&
          Number.isFinite(result.longitude),
      )
      .filter((result) => {
        const coordinate = `${result.latitude.toFixed(3)},${result.longitude.toFixed(3)}`;
        if (seen.has(coordinate)) return false;
        seen.add(coordinate);
        return true;
      })
      .map((result, index) => ({
        result,
        index,
        regionMatch: regionHint
          ? result.country_code === regionCode || [result.admin1, result.admin2, result.country]
              .filter(Boolean)
              .some((value) => value?.toLowerCase().includes(regionHint.toLowerCase()))
          : false,
      }));
    const regionalCandidates =
      regionHint && candidates.some((candidate) => candidate.regionMatch)
        ? candidates.filter((candidate) => candidate.regionMatch)
        : candidates;
    const results = regionalCandidates
      .sort((left, right) => Number(right.regionMatch) - Number(left.regionMatch) || left.index - right.index)
      .slice(0, 8)
      .map(({ result }) => normalizeResult(result));

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Location search is unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
