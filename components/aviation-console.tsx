"use client";

import { ChevronDown, ChevronRight, Cloud, Plane, RadioTower, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AviationData, WeatherDashboardData } from "@/lib/types";

function shortTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric" }).format(new Date(iso));
}

export function AviationConsole({ data, refreshKey }: { data: WeatherDashboardData; refreshKey: number }) {
  const [regional, setRegional] = useState<AviationData | null>(null);
  const [hazardView, setHazardView] = useState<"advisories" | "pireps" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/aviation?lat=${data.location.latitude.toFixed(4)}&lon=${data.location.longitude.toFixed(4)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as AviationData;
        if (!response.ok) throw new Error("Aviation feeds are unavailable.");
        setRegional(payload);
      })
      .catch(() => setRegional(null));
    return () => controller.abort();
  }, [data.location.latitude, data.location.longitude, refreshKey]);

  return (
    <section className="panel aviation-console-panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">Flight operations / 3-hour reports</span><h2>Aviation desk</h2></div>
        <a href="https://aviationweather.gov/" target="_blank" rel="noreferrer">Open AviationWeather <ChevronRight size={14} /></a>
      </div>
      <div className="aviation-console-grid">
        <div className="taf-block">
          <div className="subhead"><Plane size={15} /><strong>{data.location.stationId} TAF</strong><span>{data.aviationForecast ? shortTime(data.aviationForecast.issuedAt, data.location.timeZone) : "No TAF issued"}</span></div>
          <div className="taf-timeline">
            {data.aviationForecast?.periods.slice(0, 6).map((period) => (
              <div key={`${period.from}-${period.change}`}>
                <span>{shortTime(period.from, data.location.timeZone)}</span>
                <strong>{period.change}</strong>
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
                <small>{airport.wind}</small>
                <small>{airport.visibility ? `${airport.visibility} sm` : "—"}</small>
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
    </section>
  );
}
