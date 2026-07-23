"use client";

import { ChevronDown, ChevronRight, Cloud, Compass, FileText, Gauge, Map, Plane, RadioTower, Snowflake, Wind, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AviationData, IntelligenceData, TafPeriod, WeatherDashboardData } from "@/lib/types";

function shortTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric" }).format(new Date(iso));
}

function reportAge(iso: string, referenceIso: string) {
  const minutes = Math.max(0, Math.round((new Date(referenceIso).getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m old`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m old`;
}

function visibilityMiles(value: string) {
  const match = value.match(/(?:P|M)?(\d+(?:\.\d+)?)(?:\s*sm)?/i);
  return match ? Number(match[1]) : null;
}

function flightCategory(period: TafPeriod) {
  const visibility = visibilityMiles(period.visibility);
  if ((period.ceilingFeet !== null && period.ceilingFeet < 500) || (visibility !== null && visibility < 1)) return "LIFR";
  if ((period.ceilingFeet !== null && period.ceilingFeet < 1_000) || (visibility !== null && visibility < 3)) return "IFR";
  if ((period.ceilingFeet !== null && period.ceilingFeet <= 3_000) || (visibility !== null && visibility <= 5)) return "MVFR";
  return "VFR";
}

function lowestTafCategory(periods: TafPeriod[]) {
  const rank = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 };
  return periods.reduce((lowest, period) => {
    const category = flightCategory(period);
    return rank[category] > rank[lowest] ? category : lowest;
  }, "VFR" as keyof typeof rank);
}

const PILOT_PRODUCTS = [
  { label: "Graphical Forecasts", detail: "Clouds, visibility, precip & hazards", href: "https://aviationweather.gov/gfa/", icon: Map },
  { label: "Icing", detail: "CIP/FIP severity and probability", href: "https://aviationweather.gov/gfa/#ice", icon: Snowflake },
  { label: "Turbulence", detail: "GTG forecasts and observations", href: "https://aviationweather.gov/gfa/#turb", icon: Wind },
  { label: "Winds aloft", detail: "Official FB winds and temperatures", href: "https://aviationweather.gov/data/windtemp/", icon: Compass },
  { label: "NOTAMs & TFRs", detail: "FAA operational restrictions", href: "https://notams.aim.faa.gov/notamSearch/", icon: FileText },
  { label: "Official briefing", detail: "Flight Service planning and briefing", href: "https://www.1800wxbrief.com/", icon: RadioTower },
] as const;

export function AviationConsole({ data, intelligence, refreshKey }: { data: WeatherDashboardData; intelligence: IntelligenceData | null; refreshKey: number }) {
  const [regional, setRegional] = useState<AviationData | null>(null);
  const [hazardView, setHazardView] = useState<"advisories" | "pireps" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const coordinates = `lat=${data.location.latitude.toFixed(4)}&lon=${data.location.longitude.toFixed(4)}`;
    fetch(`/api/aviation?${coordinates}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as AviationData;
        if (!response.ok) throw new Error("Aviation feeds are unavailable.");
        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setRegional(payload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRegional(null);
      });
    return () => controller.abort();
  }, [data.location.latitude, data.location.longitude, refreshKey]);

  const tafPeriods = data.aviationForecast?.periods ?? [];
  const currentCategory = data.aviation?.flightCategory ?? "—";
  const briefingTime = new Date(data.fetchedAt).getTime();
  const twelveHoursFromNow = briefingTime + 12 * 60 * 60 * 1_000;
  const twelveHourPeriods = tafPeriods.filter((period) => new Date(period.to).getTime() >= briefingTime && new Date(period.from).getTime() <= twelveHoursFromNow);
  const tafFloor = tafPeriods.length ? lowestTafCategory((twelveHourPeriods.length ? twelveHourPeriods : tafPeriods).slice(0, 6)) : "—";
  const dewpointSpread = data.current.temperatureF !== null && data.current.dewpointF !== null
    ? Math.max(0, data.current.temperatureF - data.current.dewpointF)
    : null;
  const surfaceWind = data.aviation?.windSpeedKt !== null && data.aviation?.windSpeedKt !== undefined
    ? `${data.aviation.windDirectionDeg === null ? "VRB" : String(data.aviation.windDirectionDeg).padStart(3, "0")}° ${data.aviation.windSpeedKt}kt${data.aviation.windGustKt ? ` G${data.aviation.windGustKt}` : ""}`
    : "—";

  return (
    <section className="panel aviation-console-panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">Flight operations / terminal + en route</span><h2>Pilot weather brief</h2></div>
        <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer">Open AviationWeather <ChevronRight size={14} /></a>
      </div>
      <div className="pilot-briefing-strip" aria-label="Current pilot briefing signals">
        <span className="pilot-primary-signal">
          <b>{data.location.stationId} observed</b>
          <strong className={`cat-${currentCategory.toLowerCase()}`}>{currentCategory}</strong>
          <small>{data.aviation ? reportAge(data.aviation.observedAt, data.fetchedAt) : "Awaiting METAR"}</small>
        </span>
        <span><b>Ceiling</b><strong>{data.aviation?.ceilingFeet ? `${data.aviation.ceilingFeet.toLocaleString()} ft` : "CLR / no ceiling"}</strong><small>lowest BKN / OVC / VV</small></span>
        <span><b>Visibility</b><strong>{data.aviation?.visibility ? `${data.aviation.visibility} sm` : "—"}</strong><small>prevailing METAR</small></span>
        <span><b>Surface wind</b><strong>{surfaceWind}</strong><small>{data.aviation?.windGustKt ? "gusts reported" : "latest observation"}</small></span>
        <span><b>TAF floor / 12h</b><strong className={`cat-${tafFloor.toLowerCase()}`}>{tafFloor}</strong><small>lowest decoded period</small></span>
        <span><b>Temp / dew spread</b><strong>{dewpointSpread === null ? "—" : `${dewpointSpread}°F`}</strong><small>{dewpointSpread !== null && dewpointSpread <= 4 ? "narrow spread" : "current spread"}</small></span>
        <span><b>Freezing level</b><strong>{intelligence?.forecast?.freezingLevelFt ? `${Math.round(intelligence.forecast.freezingLevelFt).toLocaleString()} ft` : "—"}</strong><small>model guidance near point</small></span>
        <span><b>Regional reports</b><strong>{regional ? `${regional.advisories.length} adv · ${regional.pireps.length} PIREP` : "Acquiring"}</strong><small>active / previous 3 hours</small></span>
      </div>
      <div className="aviation-console-grid">
        <div className="taf-block">
          <div className="subhead"><Plane size={15} /><strong>{data.location.stationId} TAF</strong><span>{data.aviationForecast ? shortTime(data.aviationForecast.issuedAt, data.location.timeZone) : "No TAF issued"}</span></div>
          <div className="taf-timeline">
            {data.aviationForecast?.periods.slice(0, 6).map((period) => (
              <div key={`${period.from}-${period.change}`}>
                <span>{shortTime(period.from, data.location.timeZone)}</span>
                <strong><i className={`taf-category cat-${flightCategory(period).toLowerCase()}`}>{flightCategory(period)}</i>{period.change}</strong>
                <small>{period.visibility} · {period.ceilingFeet ? `BKN ${period.ceilingFeet.toLocaleString()}` : "VFR ceiling"}</small>
                <small>{period.wind}{period.weather ? ` · ${period.weather}` : ""}</small>
              </div>
            )) ?? <p>No terminal forecast is published for the nearest station.</p>}
          </div>
        </div>
        <div className="airport-board">
          <div className="subhead"><RadioTower size={15} /><strong>Nearby airports</strong><span>METAR</span></div>
          <div className="airport-list">
            {regional?.airports.slice(0, 6).map((airport) => (
              <div key={airport.id} title={airport.name}>
                <strong>{airport.id}</strong>
                <span className={`cat-${airport.flightCategory.toLowerCase()}`}>{airport.flightCategory}</span>
                <small>{airport.ceilingFeet ? `${airport.ceilingFeet.toLocaleString()}′` : "CLR"} / {airport.visibility ? `${airport.visibility}sm` : "—"}</small>
                <small>{airport.wind}</small>
                <small>{airport.distanceMiles === null ? "—" : `${airport.distanceMiles}mi`}</small>
              </div>
            )) ?? <p>Acquiring nearby airport observations.</p>}
          </div>
        </div>
        <div className="hazard-board">
          <div className="subhead"><Cloud size={15} /><strong>Airspace hazards</strong><span>SIGMET / PIREP</span></div>
          <div className="hazard-summary">
            <button
              className={hazardView === "advisories" ? "active" : ""}
              type="button"
              disabled={!regional?.advisories.length}
              aria-expanded={hazardView === "advisories"}
              aria-controls="aviation-hazard-details"
              onClick={() => setHazardView((current) => current === "advisories" ? null : "advisories")}
            >
              <strong>{regional?.advisories.length ?? 0}</strong>
              <span>active advisories near the region</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <button
              className={hazardView === "pireps" ? "active" : ""}
              type="button"
              disabled={!regional?.pireps.length}
              aria-expanded={hazardView === "pireps"}
              aria-controls="aviation-hazard-details"
              onClick={() => setHazardView((current) => current === "pireps" ? null : "pireps")}
            >
              <strong>{regional?.pireps.length ?? 0}</strong>
              <span>pilot reports in the last 3 hours</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="hazard-tags">
            {regional?.advisories.slice(0, 3).map((item) => <span key={item.id} title={item.raw}>{item.kind} · {item.hazard}</span>)}
            {regional?.pireps.filter((item) => item.icing || item.turbulence).slice(0, 2).map((item, index) => <span key={`${item.observedAt}-${index}`}>PIREP · {item.icing || item.turbulence}</span>)}
            {!regional?.advisories.length && !regional?.pireps.length && <span>No regional reports in the current feed</span>}
          </div>
          {hazardView && (
            <div className="hazard-details" id="aviation-hazard-details">
              <div className="hazard-details-heading">
                <div><span className="eyebrow">Raw AviationWeather.gov text</span><strong>{hazardView === "advisories" ? "Active advisories" : "Recent PIREPs"}</strong></div>
                <button type="button" onClick={() => setHazardView(null)} aria-label="Close airspace hazard details"><X size={15} /></button>
              </div>
              <div className="hazard-report-list">
                {hazardView === "advisories" ? regional?.advisories.map((item, index) => (
                  <details key={`${item.id}-${item.validTo}`} open={index === 0}>
                    <summary>
                      <span><b>{item.kind}</b>{item.id} · {item.hazard}{item.severity ? ` · ${item.severity}` : ""}</span>
                      <time>Valid to {shortTime(item.validTo, data.location.timeZone)}</time>
                    </summary>
                    <pre>{item.raw || "No raw advisory text was included in this report."}</pre>
                  </details>
                )) : regional?.pireps.map((item, index) => (
                  <details key={`${item.observedAt}-${index}`} open={index === 0}>
                    <summary>
                      <span><b>PIREP</b>{item.aircraft}{item.altitudeFt ? ` · ${item.altitudeFt.toLocaleString()} ft` : ""}{item.icing ? ` · ${item.icing} icing` : ""}{item.turbulence ? ` · ${item.turbulence} turbulence` : ""}</span>
                      <time>{shortTime(item.observedAt, data.location.timeZone)}</time>
                    </summary>
                    <pre>{item.raw || "No raw PIREP text was included in this report."}</pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="aviation-briefing-deck">
        <div className="terminal-products">
          <div className="subhead"><Gauge size={15} /><strong>Terminal products</strong><span>Raw text in app</span></div>
          <details>
            <summary><span>METAR · {data.location.stationId}</span><small>{data.aviation ? reportAge(data.aviation.observedAt, data.fetchedAt) : "Unavailable"}</small></summary>
            <pre>{data.aviation?.raw ?? "No METAR is available for the nearest reporting station."}</pre>
          </details>
          <details>
            <summary><span>TAF · {data.location.stationId}</span><small>{data.aviationForecast ? `${shortTime(data.aviationForecast.validFrom, data.location.timeZone)}–${shortTime(data.aviationForecast.validTo, data.location.timeZone)}` : "Unavailable"}</small></summary>
            <pre>{data.aviationForecast?.raw ?? "No TAF is published for the nearest reporting station."}</pre>
          </details>
        </div>
        <div className="aviation-discussion">
          <div className="subhead"><Cloud size={15} /><strong>NWS aviation discussion</strong><span>{data.discussion ? shortTime(data.discussion.issuedAt, data.location.timeZone) : "—"}</span></div>
          <p>{data.discussion?.aviation ?? "The latest Area Forecast Discussion did not include an aviation section."}</p>
          {data.discussion?.aviation && (
            <details>
              <summary>Read full aviation discussion <ChevronDown size={14} /></summary>
              <pre>{data.discussion.aviation}</pre>
            </details>
          )}
        </div>
        <nav className="pilot-product-links" aria-label="Official aviation weather and flight planning tools">
          <div className="subhead"><FileText size={15} /><strong>Flight planning products</strong><span>Official</span></div>
          <div>
            {PILOT_PRODUCTS.map((product) => {
              const Icon = product.icon;
              return (
                <a href={product.href} target="_blank" rel="noreferrer" key={product.label}>
                  <Icon size={16} aria-hidden="true" />
                  <span><b>{product.label}</b><small>{product.detail}</small></span>
                  <ChevronRight size={14} aria-hidden="true" />
                </a>
              );
            })}
          </div>
          <p>Planning aid only. Confirm weather, NOTAMs, TFRs, airport data, and an official briefing before flight.</p>
        </nav>
      </div>
    </section>
  );
}
