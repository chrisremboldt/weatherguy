"use client";

import { Activity, FileText, Gauge, RadioTower, Wind } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
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

function reportedCeiling(feet: number | null) {
  return feet === null ? "No ceiling rpt" : `${feet.toLocaleString()}′`;
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
        <span><b>Pressure</b><strong>{deltaLabel(pressureChange, " inHg")}</strong></span>
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
          <small>{reportedCeiling(airport.ceilingFeet)} · {airport.visibility ? `${airport.visibility}sm` : "—"}</small>
          <small>{airport.wind || "—"}</small>
          <em>{airport.distanceMiles === null ? "—" : `${airport.distanceMiles} mi`}</em>
        </div>
      ))}
      {!airports.length && <p>Acquiring nearby reporting stations.</p>}
    </div>
  );
}

function BriefingView({ data, mode }: { data: WeatherDashboardData; mode: DisplayMode }) {
  const aviationBrief = mode === "aviation" ? data.discussion?.aviation : null;

  if (data.alerts.length) {
    return (
      <div className="context-briefing has-alert">
        <span className="context-briefing-state">{data.alerts.length} active NWS {data.alerts.length === 1 ? "alert" : "alerts"}</span>
        <div
          className="context-alert-list"
          role="list"
          aria-label="All active NWS alerts for this point"
          tabIndex={0}
          style={{ minHeight: 0, overflowY: "auto" }}
        >
          {data.alerts.map((alert) => (
            <div role="listitem" key={alert.id}>
              <details>
                <summary><strong>{alert.event}</strong> · {alert.severity} · {alert.urgency}</summary>
                <p>{alert.description}</p>
                {alert.instruction && <p><strong>What to do:</strong> {alert.instruction}</p>}
                <small>{alert.headline}</small>
              </details>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const copy = aviationBrief || data.discussion?.summary;

  return (
    <div className="context-briefing">
      <span className="context-briefing-state">
        {aviationBrief ? "Aviation discussion" : "Area discussion"}
      </span>
      <strong>{aviationBrief ? `${data.location.stationId} flight weather` : `NWS ${data.location.wfo} forecast reasoning`}</strong>
      <p>{copy ?? "The local forecast discussion has not loaded yet."}</p>
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
  const tabSetId = useId();
  const tabRefs = useRef<Record<ContextTab, HTMLButtonElement | null>>({
    trend: null,
    nearby: null,
    briefing: null,
  });
  const activeTab = selection.mode === mode ? selection.tab : defaultTab(mode);
  const activeTabId = `${tabSetId}-${activeTab}-tab`;
  const panelId = `${tabSetId}-panel`;

  const selectTab = (tab: ContextTab) => setSelection({ mode, tab });

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TAB_LABELS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TAB_LABELS.length) % TAB_LABELS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TAB_LABELS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TAB_LABELS[nextIndex].id;
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <section className="panel context-panel">
      <div className="context-panel-heading">
        <div>
          <span className="eyebrow">Station recorder / local context</span>
          <h2>{activeTab === "trend" ? "Six-hour trace" : activeTab === "nearby" ? "Nearby stations" : "Local briefing"}</h2>
        </div>
        <div className="context-tabs" role="tablist" aria-label="Station context view">
          {TAB_LABELS.map((tab, index) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              role="tab"
              id={`${tabSetId}-${tab.id}-tab`}
              aria-controls={panelId}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              ref={(node) => { tabRefs.current[tab.id] = node; }}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => moveTabFocus(event, index)}
              key={tab.id}
            >
              {tab.id === "trend" ? <Activity size={13} aria-hidden="true" /> : tab.id === "nearby" ? <RadioTower size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="context-panel-body"
        id={panelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        tabIndex={0}
      >
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
      <span><Gauge size={12} /><b>{deltaLabel(pressureChange, " inHg")}</b></span>
      <span><Wind size={12} /><b>{gust === null ? "—" : `${gust} mph max`}</b></span>
      <span><b>{deltaLabel(temperatureChange, "°")}</b></span>
    </div>
  );
}
