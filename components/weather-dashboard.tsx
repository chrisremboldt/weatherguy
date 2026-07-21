"use client";

import {
  ChevronRight,
  Crosshair,
  Droplets,
  Expand,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Settings2,
  Sunrise,
  Sunset,
  Wind,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { HourlyPeriod, LocationConfig, WeatherDashboardData } from "@/lib/types";
import { WeatherIcon } from "@/components/weather-icon";

const DEFAULT_LOCATION: LocationConfig = {
  latitude: 44.7631,
  longitude: -85.6206,
};

const PRESETS: Array<LocationConfig & { name: string }> = [
  { name: "Traverse City", latitude: 44.7631, longitude: -85.6206 },
  { name: "Chicago", latitude: 41.8781, longitude: -87.6298 },
  { name: "Denver", latitude: 39.7392, longitude: -104.9903 },
];

function initialLocation(): LocationConfig {
  if (typeof window === "undefined") return DEFAULT_LOCATION;
  const params = new URLSearchParams(window.location.search);
  const queryLat = Number(params.get("lat"));
  const queryLon = Number(params.get("lon"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(queryLat) && Number.isFinite(queryLon)) {
    return { latitude: queryLat, longitude: queryLon };
  }

  const saved = window.localStorage.getItem("weatherguy-location");
  if (!saved) return DEFAULT_LOCATION;
  try {
    return JSON.parse(saved) as LocationConfig;
  } catch {
    window.localStorage.removeItem("weatherguy-location");
    return DEFAULT_LOCATION;
  }
}

function formatTime(iso: string | null, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(iso));
}

function formatHour(iso: string, timeZone: string) {
  const date = new Date(iso);
  const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return { hour, day };
}

function cardinalDirection(degrees: number | null) {
  if (degrees === null) return "—";
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % 8];
}

function observationAge(timestamp: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} hr ago`;
}

function TemperatureTrace({ periods }: { periods: HourlyPeriod[] }) {
  if (periods.length < 2) return null;
  const temperatures = periods.map((period) => period.temperatureF);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  const spread = Math.max(5, max - min);
  const spacing = 900 / periods.length;
  const points = temperatures
    .map((temperature, index) => {
      const x = spacing * index + spacing / 2;
      const y = 80 - ((temperature - min) / spread) * 38;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="temperature-trace" viewBox="0 0 900 112" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="trace-glow" x1="0" x2="1">
          <stop offset="0" stopColor="#63e2b7" stopOpacity="0.15" />
          <stop offset="0.55" stopColor="#63e2b7" stopOpacity="0.9" />
          <stop offset="1" stopColor="#9fe5ff" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="url(#trace-glow)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {temperatures.map((temperature, index) => {
        const x = spacing * index + spacing / 2;
        const y = 80 - ((temperature - min) / spread) * 38;
        return <circle key={`${index}-${temperature}`} cx={x} cy={y} r="3.5" fill="#07171d" stroke="#63e2b7" strokeWidth="2" />;
      })}
    </svg>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span className="metric-copy">
        <span className="metric-label">{label}</span>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

export function WeatherDashboard() {
  const [config, setConfig] = useState<LocationConfig>(initialLocation);
  const [formConfig, setFormConfig] = useState<LocationConfig>(initialLocation);
  const [data, setData] = useState<WeatherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(new Date());
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    const refresh = window.setInterval(() => setRefreshKey((value) => value + 1), 5 * 60_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/weather?lat=${config.latitude.toFixed(4)}&lon=${config.longitude.toFixed(4)}`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Weather data could not be loaded.");
        setData(payload as WeatherDashboardData);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Weather data could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [config, refreshKey]);

  const timeZone = data?.location.timeZone ?? "America/Detroit";
  const hourly = data?.hourly.slice(0, 9) ?? [];
  const daily = useMemo(() => data?.daily.filter((period) => period.isDaytime).slice(0, 5) ?? [], [data]);
  const radarVersion = Math.floor(now.getTime() / 120_000);
  const radarUrl = data
    ? `https://radar.weather.gov/ridge/standard/${data.location.radarStation}_loop.gif?v=${radarVersion}`
    : "";

  const saveLocation = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const latitude = Number(formConfig.latitude);
      const longitude = Number(formConfig.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setGeoError("Enter valid numeric coordinates.");
        return;
      }
      const next = { latitude, longitude };
      window.localStorage.setItem("weatherguy-location", JSON.stringify(next));
      window.history.replaceState(null, "", `?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`);
      setConfig(next);
      setSettingsOpen(false);
      setGeoError(null);
    },
    [formConfig],
  );

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("This browser does not expose location services.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormConfig({
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
        });
      },
      () => setGeoError("Location access was not granted. Enter coordinates instead."),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const requestFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="radar-mark" aria-hidden="true"><span /></span>
          <div>
            <strong className="brand-name">WEATHERGUY</strong>
            <span className="brand-subtitle">Observation desk</span>
          </div>
        </div>

        <div className="location-lockup">
          <MapPin size={15} aria-hidden="true" />
          <div>
            <strong>{data?.location.label ?? "Locating weather station"}</strong>
            <span>{data ? `${data.location.stationId} · NWS ${data.location.wfo}` : "NOAA / NWS"}</span>
          </div>
        </div>

        <div className="header-status">
          <div className="clock-block">
            <span suppressHydrationWarning>{new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(now)}</span>
            <strong suppressHydrationWarning>{new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now)}</strong>
          </div>
          <button className="icon-button" onClick={() => setRefreshKey((value) => value + 1)} title="Refresh data" aria-label="Refresh weather data">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button className="icon-button" onClick={() => void requestFullscreen()} title="Toggle fullscreen" aria-label="Toggle fullscreen">
            <Expand size={18} />
          </button>
          <button className="icon-button" onClick={() => { setFormConfig(config); setSettingsOpen(true); }} title="Change location" aria-label="Change location">
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <section className={`alert-rail ${data?.alerts.length ? "has-alerts" : "all-clear"}`} aria-live="polite">
        <span className="alert-state">{data?.alerts.length ? `${data.alerts.length} ACTIVE` : "ALL CLEAR"}</span>
        <span className="alert-divider" />
        <div className="alert-message">
          {data?.alerts.length ? (
            <><strong>{data.alerts[0].event}</strong><span>{data.alerts[0].headline}</span></>
          ) : (
            <><strong>No active NWS alerts</strong><span>Monitoring watches, warnings, and advisories for this point.</span></>
          )}
        </div>
        <span className="alert-source">NWS CAP</span>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <span><strong>Live feed interrupted.</strong> {error}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)}>Try again</button>
        </div>
      )}

      <div className={`dashboard-grid ${loading && !data ? "is-loading" : ""}`}>
        <section className="panel radar-panel">
          <div className="panel-heading radar-heading">
            <div>
              <span className="eyebrow">Live sweep / 10 frames</span>
              <h1>Base reflectivity</h1>
            </div>
            <div className="panel-actions">
              <span className="live-chip"><i /> LIVE</span>
              <a href="https://radar.weather.gov" target="_blank" rel="noreferrer">Open NWS radar <ChevronRight size={14} /></a>
            </div>
          </div>
          <div className="radar-stage">
            {radarUrl ? (
              <>
                {/* NWS radar GIFs are animated and intentionally bypass image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="radar-backdrop" src={radarUrl} alt="" aria-hidden="true" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="radar-image" src={radarUrl} alt={`Animated NWS radar loop from ${data?.location.radarStation}`} />
              </>
            ) : (
              <div className="radar-placeholder"><Crosshair size={32} /><span>Acquiring radar</span></div>
            )}
            <div className="radar-scanline" aria-hidden="true" />
            <div className="radar-corner nw">NOAA / MRMS</div>
            <div className="radar-corner se">{data?.location.radarStation ?? "—"} · 0.5° BR</div>
          </div>
        </section>

        <aside className="status-column">
          <section className="panel current-panel">
            <div className="panel-heading compact">
              <div><span className="eyebrow">Observed conditions</span><h2>Right now</h2></div>
              <span className="freshness">{data ? observationAge(data.current.timestamp) : "acquiring"}</span>
            </div>
            <div className="current-hero">
              <div className="condition-icon"><WeatherIcon condition={data?.current.description ?? "cloudy"} size={72} strokeWidth={1.25} /></div>
              <div className="temperature-block">
                <strong>{data?.current.temperatureF ?? "—"}<sup>°</sup></strong>
                <span>{data?.current.description ?? "Loading observation"}</span>
              </div>
            </div>
            <div className="metrics-grid">
              <Metric icon={<Wind size={18} />} label="Wind" value={data ? `${cardinalDirection(data.current.windDirectionDeg)} ${data.current.windSpeedMph ?? "—"} mph${data.current.windGustMph ? ` · G${data.current.windGustMph}` : ""}` : "—"} />
              <Metric icon={<Droplets size={18} />} label="Humidity" value={data?.current.humidityPct === null || !data ? "—" : `${Math.round(data.current.humidityPct)}% · dew ${data.current.dewpointF}°`} />
              <Metric icon={<Gauge size={18} />} label="Pressure" value={data?.current.pressureInHg ? `${data.current.pressureInHg.toFixed(2)} inHg` : "—"} />
              <Metric icon={<Navigation size={18} />} label="Visibility" value={data?.current.visibilityMiles ? `${data.current.visibilityMiles} mi` : "—"} />
            </div>
            <div className="solar-track">
              <div><Sunrise size={17} /><span>Sunrise</span><strong>{formatTime(data?.astronomy.sunrise ?? null, timeZone)}</strong></div>
              <div className="daylight-line"><i /></div>
              <div><Sunset size={17} /><span>Sunset</span><strong>{formatTime(data?.astronomy.sunset ?? null, timeZone)}</strong></div>
            </div>
          </section>

          <section className="panel aviation-panel">
            <div className="aviation-topline">
              <div><span className="eyebrow">Airport weather</span><h2>{data?.location.stationId ?? "METAR"}</h2></div>
              <span className={`flight-category cat-${(data?.aviation?.flightCategory ?? "na").toLowerCase()}`}>{data?.aviation?.flightCategory ?? "—"}</span>
            </div>
            <p className="metar-raw">{data?.aviation?.raw ?? "Waiting for the latest aviation observation."}</p>
            <div className="aviation-facts">
              <span><b>Ceiling</b>{data?.aviation?.ceilingFeet ? `${data.aviation.ceilingFeet.toLocaleString()} ft` : "CLR"}</span>
              <span><b>Visibility</b>{data?.aviation?.visibility ? `${data.aviation.visibility} sm` : "—"}</span>
              <span><b>Altimeter</b>{data?.aviation?.altimeterInHg ? data.aviation.altimeterInHg.toFixed(2) : "—"}</span>
            </div>
          </section>
        </aside>

        <section className="panel hourly-panel">
          <div className="panel-heading compact">
            <div><span className="eyebrow">Temperature / probability</span><h2>Next nine hours</h2></div>
            <span className="panel-note">NWS hourly grid</span>
          </div>
          <div className="hourly-chart">
            <TemperatureTrace periods={hourly} />
            {hourly.map((period, index) => {
              const label = formatHour(period.startTime, timeZone);
              return (
                <div className="hour-cell" key={period.startTime}>
                  <span className="hour-day">{index === 0 ? "NOW" : label.day}</span>
                  <strong className="hour-time">{index === 0 ? "" : label.hour}</strong>
                  <div className="hour-icon"><WeatherIcon condition={period.shortForecast} isDaytime={period.isDaytime} size={21} /></div>
                  <strong className="hour-temp">{period.temperatureF}°</strong>
                  <span className={`rain-chance ${(period.precipitationPct ?? 0) >= 40 ? "likely" : ""}`}>{period.precipitationPct ?? 0}%</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel outlook-panel">
          <div className="panel-heading compact">
            <div><span className="eyebrow">Five day signal</span><h2>Outlook</h2></div>
          </div>
          <div className="daily-list">
            {daily.map((period) => (
              <div className="day-row" key={period.startTime} title={period.detailedForecast}>
                <span className="day-name">{period.name.slice(0, 3)}</span>
                <WeatherIcon condition={period.shortForecast} isDaytime={period.isDaytime} size={20} />
                <strong>{period.temperatureF}°</strong>
                <span className="day-condition">{period.shortForecast}</span>
                <span className="day-pop">{period.precipitationPct ?? 0}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel discussion-panel">
          <div className="panel-heading compact">
            <div><span className="eyebrow">Forecaster reasoning</span><h2>Area discussion</h2></div>
            <span className="panel-note">{data?.discussion ? formatTime(data.discussion.issuedAt, timeZone) : "—"}</span>
          </div>
          <p>{data?.discussion?.summary ?? "The latest Area Forecast Discussion has not loaded yet."}</p>
          {data?.discussion && <a href={data.discussion.sourceUrl} target="_blank" rel="noreferrer">Read full NWS product <ChevronRight size={14} /></a>}
        </section>
      </div>

      <footer className="source-strip">
        <span><i className={error ? "status-dot degraded" : "status-dot"} /> {error ? "Serving last successful observation" : "All live feeds connected"}</span>
        <span>Weather: NOAA / National Weather Service</span>
        <span>Radar: NEXRAD RIDGE</span>
        <span>Aviation: AviationWeather.gov</span>
        {data?.notices.map((notice) => <span className="source-notice" key={notice}>{notice}</span>)}
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-heading">
              <div><span className="eyebrow">Display position</span><h2 id="settings-title">Change location</h2></div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button>
            </div>
            <p className="settings-intro">WeatherGuy resolves your forecast office, radar site, and nearest reporting airport automatically.</p>
            <button className="locate-button" type="button" onClick={useMyLocation}><LocateFixed size={18} /> Use this iMac’s location</button>
            <div className="preset-list">
              {PRESETS.map((preset) => (
                <button type="button" key={preset.name} onClick={() => setFormConfig(preset)}>
                  <MapPin size={14} /><span>{preset.name}</span><small>{preset.latitude.toFixed(2)}, {preset.longitude.toFixed(2)}</small>
                </button>
              ))}
            </div>
            <form onSubmit={saveLocation}>
              <div className="coordinate-grid">
                <label>Latitude<input type="number" min="-90" max="90" step="0.0001" required value={formConfig.latitude} onChange={(event) => setFormConfig((current) => ({ ...current, latitude: Number(event.target.value) }))} /></label>
                <label>Longitude<input type="number" min="-180" max="180" step="0.0001" required value={formConfig.longitude} onChange={(event) => setFormConfig((current) => ({ ...current, longitude: Number(event.target.value) }))} /></label>
              </div>
              {geoError && <p className="form-error">{geoError}</p>}
              <div className="form-actions"><button type="button" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="primary-button" type="submit">Load location</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
