"use client";

import { Activity, FileText, Gauge, RadioTower, Wind } from "lucide-react";
import { useState } from "react";
import type {
  AviationData,
  DisplayMode,
  ObservationHistoryPoint,
  WeatherDashboardData,
} from "@/lib/types";

type ContextTab = "trend" | "nearby" | "briefing";

const TAB_LABELS: Array<{ id: ContextTab; label: string }> = [
  { id: "trend", label: "Trend" },
  { id: "nearby", label: "Nearby" },
  { id: "briefing", label: "Briefing" },
];

function defaultTab(mode: DisplayMode): ContextTab {
  if (mode === "aviation") return "nearby";
  if (mode === "severe") return "briefing";
  return "trend";
}

function compactTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
  }).format(new Date(iso));
}

function delta(first: number | null | undefined, last: number | null | undefined, digits = 0) {
  if (first === null || first === undefined || last === null || last === undefined) return null;
  return Number((last - first).toFixed(digits));
}

function deltaLabel(value: number | null, unit: string) {
  if (value === null) return "—";
  if (Math.abs(value) < 0.001) return "Steady";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value)}${unit}`;
}

function peakWind(points: ObservationHistoryPoint[]) {
  const values = points.flatMap((point) =>
    [point.windGustMph, point.windSpeedMph].filter((value): value is number => value !== null),
  );
  return values.length ? Math.max(...values) : null;
}

function linePath(
  points: ObservationHistoryPoint[],
  field: "temperatureF" | "dewpointF",
  minimum: number,
  maximum: number,
) {
  const usable = points
    .map((point, index) => ({ index, value: point[field] }))
    .filter((point): point is { index: number; value: number } => point.value !== null);
  if (usable.length < 2) return "";
  const range = Math.max(1, maximum - minimum);

  return usable.map((point, index) => {
    const x = points.length === 1 ? 50 : 4 + (point.index / (points.length - 1)) * 92;
    const y = 7 + ((maximum - point.value) / range) * 42;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function TrendPlot({
  points,
  timeZone,
  compact = false,
}: {
  points: ObservationHistoryPoint[];
  timeZone: string;
  compact?: boolean;
}) {
  const temperatures = points.flatMap((point) =>
    [point.temperatureF, point.dewpointF].filter((value): value is number => value !== null),
  );
  if (points.length < 2 || temperatures.length < 2) {
    return <div className="station-trace-empty">Waiting for enough station reports to draw a trend.</div>;
  }

  const minimum = Math.floor(Math.min(...temperatures) - 2);
  const maximum = Math.ceil(Math.max(...temperatures) + 2);
  const temperaturePath = linePath(points, "temperatureF", minimum, maximum);
  const dewpointPath = linePath(points, "dewpointF", minimum, maximum);
  const first = points[0];
  const middle = points[Math.floor((points.length - 1) / 2)];
  const last = points[points.length - 1];

  return (
    <div className={`station-trace ${compact ? "compact" : ""}`}>
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" role="img" aria-label="Six-hour temperature and dew point trace">
        <path className="station-trace-grid" d="M4 14H96 M4 28H96 M4 42H96" />
        {temperaturePath && <path className="station-temperature-line" d={temperaturePath} />}
        {dewpointPath && <path className="station-dewpoint-line" d={dewpointPath} />}
      </svg>
      {!compact && (
        <>
          <span className="station-trace-key temperature">Temperature</span>
          <span className="station-trace-key dewpoint">Dew point</span>
          <div className="station-trace-times" aria-hidden="true">
            <span>{compactTime(first.timestamp, timeZone)}</span>
            <span>{compactTime(middle.timestamp, timeZone)}</span>
            <span>{compactTime(last.timestamp, timeZone)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function TrendView({ data }: { data: WeatherDashboardData }) {
  const points = data.observationHistory ?? [];
  const first = points[0];
  const last = points[points.length - 1];
  const temperatureChange = delta(first?.temperatureF, last?.temperatureF);
  const pressureChange = delta(first?.pressureInHg, last?.pressureInHg, 2);
  const gust = peakWind(points);

  return (
    <div className="context-trend">
      <TrendPlot points={points} timeZone={data.location.timeZone} />
      <div className="station-trend-readout">
        <span><b>Temperature</b><strong>{deltaLabel(temperatureChange, "°")}</strong></span>
        <span><b>Pressure</b><strong>{deltaLabel(pressureChange, " in")}</strong></span>
        <span><b>Peak wind</b><strong>{gust === null ? "—" : `${gust} mph`}</strong></span>
      </div>
    </div>
  );
}

function NearbyView({ regional }: { regional: AviationData | null }) {
  const airports = regional?.airports.slice(0, 5) ?? [];

  return (
    <div className="context-nearby">
      {airports.map((airport) => (
        <div key={airport.id} title={airport.name}>
          <span>
            <strong>{airport.id}</strong>
            <i className={`cat-${airport.flightCategory.toLowerCase()}`}>{airport.flightCategory}</i>
          </span>
          <b>{airport.temperatureF === null ? "—" : `${airport.temperatureF}°`}</b>
          <small>{airport.ceilingFeet ? `${airport.ceilingFeet.toLocaleString()}′` : "CLR"} · {airport.visibility ? `${airport.visibility}sm` : "—"}</small>
          <small>{airport.wind}</small>
          <em>{airport.distanceMiles === null ? "—" : `${airport.distanceMiles} mi`}</em>
        </div>
      ))}
      {!airports.length && <p>Acquiring nearby reporting stations.</p>}
    </div>
  );
}

function BriefingView({ data, mode }: { data: WeatherDashboardData; mode: DisplayMode }) {
  const alert = data.alerts[0];
  const aviationBrief = mode === "aviation" ? data.discussion?.aviation : null;
  const copy = alert?.description || aviationBrief || data.discussion?.summary;

  return (
    <div className={`context-briefing ${alert ? "has-alert" : ""}`}>
      <span className="context-briefing-state">
        {alert ? `${data.alerts.length} active · ${alert.severity}` : aviationBrief ? "Aviation discussion" : "Area discussion"}
      </span>
      <strong>{alert?.event ?? (aviationBrief ? `${data.location.stationId} flight weather` : `NWS ${data.location.wfo} forecast reasoning`)}</strong>
      <p>{copy ?? "The local forecast discussion has not loaded yet."}</p>
      {alert && <small>{alert.headline}</small>}
    </div>
  );
}

export function ObservationContext({
  data,
  regional,
  mode,
}: {
  data: WeatherDashboardData;
  regional: AviationData | null;
  mode: DisplayMode;
}) {
  const [selection, setSelection] = useState<{ mode: DisplayMode; tab: ContextTab }>(() => ({
    mode,
    tab: defaultTab(mode),
  }));
  const activeTab = selection.mode === mode ? selection.tab : defaultTab(mode);

  return (
    <section className="panel context-panel">
      <div className="context-panel-heading">
        <div>
          <span className="eyebrow">Station recorder / local context</span>
          <h2>{activeTab === "trend" ? "Six-hour trace" : activeTab === "nearby" ? "Nearby stations" : "Local briefing"}</h2>
        </div>
        <div className="context-tabs" role="tablist" aria-label="Station context view">
          {TAB_LABELS.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setSelection({ mode, tab: tab.id })}
              key={tab.id}
            >
              {tab.id === "trend" ? <Activity size={13} /> : tab.id === "nearby" ? <RadioTower size={13} /> : <FileText size={13} />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="context-panel-body">
        {activeTab === "trend" && <TrendView data={data} />}
        {activeTab === "nearby" && <NearbyView regional={regional} />}
        {activeTab === "briefing" && <BriefingView data={data} mode={mode} />}
      </div>
    </section>
  );
}

export function FullscreenObservationStrip({ data }: { data: WeatherDashboardData }) {
  const points = data.observationHistory ?? [];
  const first = points[0];
  const last = points[points.length - 1];
  const temperatureChange = delta(first?.temperatureF, last?.temperatureF);
  const pressureChange = delta(first?.pressureInHg, last?.pressureInHg, 2);
  const gust = peakWind(points);

  return (
    <div className="current-context-strip" aria-label="Six-hour observation trend">
      <span className="current-context-label"><Activity size={13} /><b>6h recorder</b></span>
      <TrendPlot points={points} timeZone={data.location.timeZone} compact />
      <span><Gauge size={12} /><b>{deltaLabel(pressureChange, " in")}</b></span>
      <span><Wind size={12} /><b>{gust === null ? "—" : `${gust} mph max`}</b></span>
      <span><b>{deltaLabel(temperatureChange, "°")}</b></span>
    </div>
  );
}
