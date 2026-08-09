"use client";

import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Copy,
  Droplets,
  Expand,
  MapPin,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WeatherIcon } from "@/components/weather-icon";
import {
  alignHourlyPeriods,
  COMPARISON_STORAGE_KEY,
  comparisonDeltaLabel,
  comparisonLocationFromParams,
  isValidLocationConfig,
  normalizeRadarStation,
  ridgeRadarUrl,
  sameComparisonLocation,
  withComparisonLocation,
  withoutComparisonLocation,
} from "@/lib/comparison";
import { buildForecastDays, type ForecastDaySummary } from "@/lib/forecast-days";
import { alertFeedPresentationState } from "@/lib/weather-alerts";
import {
  apparentTemperatureF,
  currentAndFutureHourlyPeriods,
  precipitationChanceLabel,
} from "@/lib/weather-display";
import type {
  CurrentObservation,
  HourlyPeriod,
  LocationConfig,
  LocationSearchResult,
  WeatherAlert,
  WeatherDashboardData,
} from "@/lib/types";
import styles from "./weather-comparison.module.css";

const DASH = "—";

export type WeatherComparisonProps = {
  primaryConfig: LocationConfig;
  primaryData: WeatherDashboardData;
  primaryAlertsAvailable: boolean;
  onRefreshPrimary: () => void;
  onClose: () => void;
};

type SideHeroProps = {
  side: "A" | "B";
  label: string;
  data: WeatherDashboardData | null;
  loading?: boolean;
  error?: string | null;
  now: Date;
};

type MetricComparison = {
  label: string;
  primary: string;
  secondary: string;
  delta: string;
};

type ComparisonRadarProps = {
  side: "A" | "B";
  label: string;
  station: string | null;
  playing: boolean;
  refreshKey: number;
  loading?: boolean;
  error?: string | null;
};

export async function requestComparisonFullscreen() {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return true;
  if (!document.documentElement.requestFullscreen) return false;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

function localClock(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function localHour(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
  }).format(new Date(iso));
}

function observationAge(iso: string) {
  const observed = Date.parse(iso);
  if (!Number.isFinite(observed)) return "time unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - observed) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function cardinalDirection(degrees: number | null) {
  if (degrees === null) return DASH;
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round(degrees / 45) % 8];
}

function numericValue(value: number | null, suffix: string, digits = 0) {
  return value === null ? DASH : `${value.toFixed(digits)}${suffix}`;
}

function windValue(observation: CurrentObservation | null) {
  if (!observation || observation.windSpeedMph === null) return DASH;
  const gust = observation.windGustMph === null ? "" : ` · G${observation.windGustMph}`;
  return `${cardinalDirection(observation.windDirectionDeg)} ${observation.windSpeedMph} mph${gust}`;
}

function sideLabel(config: LocationConfig, data: WeatherDashboardData | null) {
  return config.customLabel || data?.location.label || "Selected point";
}

function topAlert(alerts: WeatherAlert[]) {
  return alerts[0] ?? null;
}

function SideHero({ side, label, data, loading = false, error, now }: SideHeroProps) {
  const current = data?.current ?? null;
  const feelsLike = current
    ? apparentTemperatureF(current.temperatureF, current.humidityPct, current.windSpeedMph)
    : null;

  return (
    <article className={`${styles.sideHero} ${side === "A" ? styles.sideA : styles.sideB}`} aria-label={`${label} observed conditions`}>
      <div className={styles.sideHeading}>
        <span className={styles.sideMarker}>{side}</span>
        <div>
          <span className={styles.eyebrow}>Observed station</span>
          <h2>{label}</h2>
        </div>
        <div className={styles.sideClock}>
          <strong>{data ? localClock(now, data.location.timeZone) : DASH}</strong>
          <span>{data ? `${data.location.stationId} · ${data.current.source}` : "Resolving station"}</span>
        </div>
      </div>

      {error && !data ? (
        <div className={styles.sideError} role="alert">
          <AlertTriangle size={20} />
          <span><strong>Station unavailable</strong>{error}</span>
        </div>
      ) : (
        <div className={styles.conditionReadout} aria-busy={loading && !data}>
          <WeatherIcon
            condition={current?.description ?? "cloudy"}
            size={68}
            strokeWidth={1.2}
          />
          <div className={styles.temperature}>
            <strong>{current?.temperatureF ?? DASH}{current?.temperatureF === null || !current ? "" : "°"}</strong>
            <span>{current?.description ?? (loading ? "Acquiring observation" : "Observation unavailable")}</span>
            <small>Feels like {feelsLike ?? DASH}{feelsLike === null ? "" : "°"}</small>
          </div>
          <div className={styles.freshness}>
            <span>{current ? observationAge(current.timestamp) : loading ? "loading" : "unavailable"}</span>
            <small>{data ? data.location.stationName : "NWS coverage"}</small>
          </div>
        </div>
      )}
    </article>
  );
}

function AlertCell({
  alerts,
  label,
  available,
}: {
  alerts: WeatherAlert[] | null;
  label: string;
  available: boolean;
}) {
  const items = alerts ?? [];
  const state = alertFeedPresentationState(alerts, available);
  const alert = topAlert(items);
  if (state === "loading" || state === "unavailable") {
    return (
      <div className={`${styles.alertCell} ${styles.alertUnknown}`}>
        <span>{state === "loading" ? "Status pending" : "Unavailable"}</span>
        <div className={styles.alertSummary}>
          <strong>{state === "loading" ? "Loading NWS alerts" : "NWS alert status unavailable"}</strong>
          <small>{state === "loading" ? `Waiting for the active alerts feed for ${label}.` : "Do not interpret this as an all-clear."}</small>
        </div>
      </div>
    );
  }
  const saved = state === "saved";
  return (
    <div className={`${styles.alertCell} ${alert ? styles.alertActive : styles.alertClear} ${saved ? styles.alertUnknown : ""}`}>
      <span>{alert ? `${items.length} ${saved ? "saved" : "active"}` : "All clear"}</span>
      {alert ? (
        <details className={styles.alertDisclosure}>
          <summary>
            <strong>{alert.event}</strong>
            <small>{saved ? `Saved alert snapshot · ${alert.headline}` : items.length > 1 ? `${alert.headline} · ${items.length - 1} more` : alert.headline}</small>
          </summary>
          <div className={styles.alertList} aria-label={`All active alerts for ${label}`}>
            {items.map((item) => (
              <article key={item.id}>
                <span>{item.severity} / {item.urgency}</span>
                <strong>{item.event}</strong>
                <p>{item.headline}</p>
                {item.instruction && <small><b>What to do:</b> {item.instruction}</small>}
              </article>
            ))}
          </div>
        </details>
      ) : (
        <div className={styles.alertSummary}>
          <strong>No active NWS alerts</strong>
          <small>Monitoring watches, warnings, and advisories for {label}.</small>
        </div>
      )}
    </div>
  );
}

function HourCell({ period, timeZone, secondary = false }: { period: HourlyPeriod | null; timeZone: string; secondary?: boolean }) {
  const className = `${styles.hourCell} ${secondary ? styles.secondRow : ""}`;
  if (!period) return <div className={`${className} ${styles.emptyCell}`}>{DASH}</div>;
  return (
    <div className={className}>
      <span>{localHour(period.startTime, timeZone)}</span>
      <WeatherIcon condition={period.shortForecast} isDaytime={period.isDaytime} size={20} />
      <strong>{period.temperatureF}°</strong>
      <small><Droplets size={9} /> {precipitationChanceLabel(period.precipitationPct)}</small>
    </div>
  );
}

function DayCell({ day, secondary = false }: { day: ForecastDaySummary | null; secondary?: boolean }) {
  const className = `${styles.dayCell} ${secondary ? styles.secondRow : ""}`;
  if (!day) return <div className={`${className} ${styles.emptyCell}`}>{DASH}</div>;
  return (
    <div className={className} title={day.detailedForecast} aria-label={`${day.label}: high ${day.highF ?? "unavailable"} degrees, low ${day.lowF ?? "unavailable"} degrees, ${day.shortForecast}; precipitation ${precipitationChanceLabel(day.precipitationPct)} maximum. ${day.detailedForecast}`}>
      <span><b>{day.label}</b><small>{day.dateLabel}</small></span>
      <WeatherIcon condition={day.shortForecast} isDaytime={day.isDaytime} size={22} />
      <strong>
        <i>{day.highF === null ? DASH : `${day.highF}°`}</i>
        <i>{day.lowF === null ? DASH : `${day.lowF}°`}</i>
      </strong>
      <small><Droplets size={9} /> {precipitationChanceLabel(day.precipitationPct)}</small>
    </div>
  );
}

function ComparisonRadar({
  side,
  label,
  station,
  playing,
  refreshKey,
  loading = false,
  error,
}: ComparisonRadarProps) {
  const normalizedStation = normalizeRadarStation(station);
  const source = ridgeRadarUrl(normalizedStation, playing, refreshKey);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const unavailable = Boolean(source && failedSource === source);
  const status = error
    ? "Radar site unavailable"
    : loading
      ? "Resolving radar site"
      : "Radar loop unavailable";

  return (
    <article
      className={`${styles.comparisonRadar} ${side === "A" ? styles.radarA : styles.radarB}`}
      aria-label={`${label} ground radar`}
      aria-busy={loading && !normalizedStation}
    >
      <div className={styles.radarHeader}>
        <span className={styles.radarSide}>{side}</span>
        <span><b>Ground radar</b><strong>{normalizedStation ?? "Station pending"}</strong></span>
        <small>{playing ? "10-frame loop" : "Latest frame"}</small>
      </div>
      <div className={styles.radarStage}>
        {source && !unavailable ? (
          // The authoritative animated NWS RIDGE product intentionally bypasses image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source}
            alt={`${playing ? "Animated" : "Latest"} NWS radar near ${label} from ${normalizedStation}`}
            onError={() => setFailedSource(source)}
          />
        ) : (
          <div className={styles.radarEmpty} role={error || unavailable ? "alert" : "status"}>
            <RefreshCw size={17} className={loading ? styles.spin : ""} />
            <span><strong>{status}</strong><small>{normalizedStation ?? "Waiting for Place B weather"}</small></span>
          </div>
        )}
        <div className={styles.radarCaption}>
          <strong>{normalizedStation ? `${normalizedStation} local window` : label}</strong>
          <span>Radar near {label} · base reflectivity</span>
        </div>
      </div>
    </article>
  );
}

export function WeatherComparison({ primaryConfig, primaryData, primaryAlertsAvailable, onRefreshPrimary, onClose }: WeatherComparisonProps) {
  const [secondaryConfig, setSecondaryConfig] = useState<LocationConfig | null>(null);
  const [secondaryData, setSecondaryData] = useState<WeatherDashboardData | null>(null);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [secondaryRefresh, setSecondaryRefresh] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarRefresh, setRadarRefresh] = useState(0);
  const shellRoot = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pickerDialog = useRef<HTMLElement>(null);
  const pickerReturnFocus = useRef<HTMLElement | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const primaryLatitude = primaryConfig.latitude;
  const primaryLongitude = primaryConfig.longitude;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    const refresh = window.setInterval(() => setSecondaryRefresh((value) => value + 1), 60_000);
    const radarRefreshTimer = window.setInterval(() => setRadarRefresh((value) => value + 1), 300_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(refresh);
      window.clearInterval(radarRefreshTimer);
    };
  }, []);

  useEffect(() => () => searchController.current?.abort(), []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      setRadarPlaying(!reducedMotion.matches);
    };
    syncMotionPreference();
    reducedMotion.addEventListener("change", syncMotionPreference);
    return () => reducedMotion.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => shellRoot.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const primary = { latitude: primaryLatitude, longitude: primaryLongitude };
      let next = comparisonLocationFromParams(window.location.search);
      if (!next) {
        try {
          const saved = JSON.parse(window.localStorage.getItem(COMPARISON_STORAGE_KEY) || "null") as unknown;
          if (isValidLocationConfig(saved)) next = saved;
        } catch {
          window.localStorage.removeItem(COMPARISON_STORAGE_KEY);
        }
      }

      if (next && sameComparisonLocation(primary, next)) {
        next = null;
        setSearchError("Choose a second place with different coordinates.");
      }
      setSecondaryData(null);
      setSecondaryConfig(next);
      setPickerOpen(!next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [primaryLatitude, primaryLongitude]);

  useEffect(() => {
    if (!pickerOpen) return;
    const dialog = pickerDialog.current;
    pickerReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "a[href]",
      "summary",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const frame = window.requestAnimationFrame(() => searchInput.current?.focus());
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog?.querySelector<HTMLButtonElement>("[data-picker-close]")?.click();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((control) => control.getClientRects().length > 0);
      if (!controls.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", containFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      dialog?.removeEventListener("keydown", containFocus);
      pickerReturnFocus.current?.focus();
      pickerReturnFocus.current = null;
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!secondaryConfig) return;
    const controller = new AbortController();
    const latitude = secondaryConfig.latitude.toFixed(4);
    const longitude = secondaryConfig.longitude.toFixed(4);

    async function loadSecondary() {
      setSecondaryLoading(true);
      setSecondaryError(null);
      try {
        const response = await fetch(
          `/api/weather?lat=${latitude}&lon=${longitude}&schema=3`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as WeatherDashboardData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Weather data could not be loaded.");
        setSecondaryData(payload);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setSecondaryError(
          requestError instanceof Error ? requestError.message : "Weather data could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setSecondaryLoading(false);
      }
    }

    void loadSecondary();
    return () => controller.abort();
  }, [secondaryConfig, secondaryRefresh]);

  const updateBrowserUrl = useCallback((next: LocationConfig) => {
    const params = withComparisonLocation(window.location.search, next);
    const queryString = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${queryString}${window.location.hash}`);
  }, []);

  const chooseSecondary = useCallback((next: LocationConfig) => {
    if (sameComparisonLocation(primaryConfig, next)) {
      setSearchError("Choose a second place with different coordinates.");
      return;
    }
    setSecondaryData(null);
    setSecondaryError(null);
    setSecondaryConfig(next);
    setPickerOpen(false);
    setQuery("");
    setResults([]);
    setSearchError(null);
    try {
      window.localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Comparison still works when privacy settings disable local persistence.
    }
    updateBrowserUrl(next);
  }, [primaryConfig, updateBrowserUrl]);

  const searchLocations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchError("Enter a city, state, territory, or ZIP code.");
      return;
    }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as { results?: LocationSearchResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Location search failed.");
      const nextResults = payload.results ?? [];
      setResults(nextResults);
      if (!nextResults.length) setSearchError("No NWS-covered locations matched that search.");
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setSearchError(requestError instanceof Error ? requestError.message : "Location search failed.");
    } finally {
      if (searchController.current === controller) {
        searchController.current = null;
        setSearching(false);
      }
    }
  };

  const closePicker = () => {
    if (secondaryConfig) setPickerOpen(false);
    else void closeComparison();
  };

  const closeComparison = useCallback(async () => {
    const params = withoutComparisonLocation(window.location.search);
    const queryString = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`,
    );
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Closing the comparison should not depend on fullscreen browser support.
      }
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else await requestComparisonFullscreen();
  };

  const refreshComparison = () => {
    onRefreshPrimary();
    setSecondaryRefresh((value) => value + 1);
    setRadarRefresh((value) => value + 1);
  };

  const copyShareUrl = async () => {
    if (!secondaryConfig) return;
    updateBrowserUrl(secondaryConfig);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  const primaryLabel = sideLabel(primaryConfig, primaryData);
  const secondaryLabel = secondaryConfig
    ? sideLabel(secondaryConfig, secondaryData)
    : "Choose a second place";
  const primaryCurrent = primaryData.current;
  const secondaryCurrent = secondaryData?.current ?? null;
  const primaryFeelsLike = apparentTemperatureF(
    primaryCurrent.temperatureF,
    primaryCurrent.humidityPct,
    primaryCurrent.windSpeedMph,
  );
  const secondaryFeelsLike = secondaryCurrent
    ? apparentTemperatureF(
      secondaryCurrent.temperatureF,
      secondaryCurrent.humidityPct,
      secondaryCurrent.windSpeedMph,
    )
    : null;
  const alignedHours = alignHourlyPeriods(
    currentAndFutureHourlyPeriods(primaryData.hourly, now.getTime(), 12),
    currentAndFutureHourlyPeriods(secondaryData?.hourly ?? [], now.getTime(), 12),
    6,
  );
  const primaryDays = useMemo(
    () => buildForecastDays(primaryData.daily, primaryData.location.timeZone, 5),
    [primaryData.daily, primaryData.location.timeZone],
  );
  const secondaryDays = useMemo(
    () => secondaryData
      ? buildForecastDays(secondaryData.daily, secondaryData.location.timeZone, 5)
      : [],
    [secondaryData],
  );
  const daySlots = Array.from({ length: Math.max(primaryDays.length, secondaryDays.length) }, (_, index) => index).slice(0, 5);
  const metricRows: MetricComparison[] = [
    {
      label: "Wind",
      primary: windValue(primaryCurrent),
      secondary: windValue(secondaryCurrent),
      delta: comparisonDeltaLabel(primaryCurrent.windSpeedMph, secondaryCurrent?.windSpeedMph ?? null, " mph"),
    },
    {
      label: "Humidity",
      primary: numericValue(primaryCurrent.humidityPct, "%"),
      secondary: numericValue(secondaryCurrent?.humidityPct ?? null, "%"),
      delta: comparisonDeltaLabel(primaryCurrent.humidityPct, secondaryCurrent?.humidityPct ?? null, " pt"),
    },
    {
      label: "Dew point",
      primary: numericValue(primaryCurrent.dewpointF, "°"),
      secondary: numericValue(secondaryCurrent?.dewpointF ?? null, "°"),
      delta: comparisonDeltaLabel(primaryCurrent.dewpointF, secondaryCurrent?.dewpointF ?? null, "°"),
    },
    {
      label: "Pressure",
      primary: numericValue(primaryCurrent.pressureInHg, " inHg", 2),
      secondary: numericValue(secondaryCurrent?.pressureInHg ?? null, " inHg", 2),
      delta: comparisonDeltaLabel(primaryCurrent.pressureInHg, secondaryCurrent?.pressureInHg ?? null, " inHg", 2),
    },
    {
      label: "Visibility",
      primary: numericValue(primaryCurrent.visibilityMiles, " mi", 1),
      secondary: numericValue(secondaryCurrent?.visibilityMiles ?? null, " mi", 1),
      delta: comparisonDeltaLabel(primaryCurrent.visibilityMiles, secondaryCurrent?.visibilityMiles ?? null, " mi", 1),
    },
  ];
  const hourlyStyle = { "--comparison-hours": Math.max(1, alignedHours.length) } as CSSProperties;
  const dailyStyle = { "--comparison-days": Math.max(1, daySlots.length) } as CSSProperties;
  const comparisonHasDegradedProducts = !primaryAlertsAvailable
    || primaryData.notices.length > 0
    || Boolean(secondaryData && (
      secondaryData.alertFeedAvailable !== true
      || secondaryData.notices.length > 0
    ));

  return (
    <section ref={shellRoot} className={styles.shell} aria-label="Two-location weather comparison" tabIndex={-1}>
      <header className={styles.topbar} inert={pickerOpen} aria-hidden={pickerOpen}>
        <div className={styles.brand}>
          <span className={styles.radarMark} aria-hidden="true"><i /></span>
          <div><strong>WX DYNAMICS</strong><span>Crosscheck / two-station view</span></div>
        </div>

        <div className={styles.route} aria-label="Compared locations">
          <span><b>A</b><strong>{primaryLabel}</strong></span>
          <ArrowLeftRight size={15} aria-hidden="true" />
          <button type="button" onClick={() => setPickerOpen(true)}><b>B</b><strong>{secondaryLabel}</strong></button>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={refreshComparison} aria-label="Refresh comparison weather and radar" title="Refresh comparison weather and radar">
            <RefreshCw size={17} className={secondaryLoading ? styles.spin : ""} />
          </button>
          <button type="button" onClick={() => setRadarPlaying((current) => !current)} aria-label={radarPlaying ? "Pause both radar loops" : "Play both radar loops"} title={radarPlaying ? "Pause both radar loops" : "Play both radar loops"} aria-pressed={radarPlaying}>
            {radarPlaying ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button type="button" onClick={() => void copyShareUrl()} disabled={!secondaryConfig} aria-label="Copy comparison URL" title="Copy comparison URL">
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}>
            {isFullscreen ? <Minimize size={17} /> : <Expand size={17} />}
          </button>
          <button type="button" onClick={() => void closeComparison()} aria-label="Close comparison" title="Close comparison"><X size={18} /></button>
        </div>
      </header>

      <main className={styles.workspace} inert={pickerOpen} aria-hidden={pickerOpen}>
        <section className={styles.heroGrid}>
          <SideHero side="A" label={primaryLabel} data={primaryData} now={now} />
          <div className={styles.deltaRail} aria-label="Current temperature difference">
            <span>Observed spread</span>
            <strong>{comparisonDeltaLabel(primaryCurrent.temperatureF, secondaryCurrent?.temperatureF ?? null, "°")}</strong>
            <small>{primaryCurrent.temperatureF !== null && secondaryCurrent?.temperatureF !== null && secondaryCurrent
              ? `${Math.abs(secondaryCurrent.temperatureF - primaryCurrent.temperatureF)}° between stations`
              : "Waiting for both observations"}</small>
            <i aria-hidden="true" />
            <span>Feels</span>
            <b>{comparisonDeltaLabel(primaryFeelsLike, secondaryFeelsLike, "°")}</b>
          </div>
          <SideHero
            side="B"
            label={secondaryLabel}
            data={secondaryData}
            loading={secondaryLoading}
            error={secondaryError}
            now={now}
          />
        </section>

        <section className={styles.alertRow} aria-label="Active alerts comparison">
          <AlertCell alerts={primaryData.alerts} label={primaryLabel} available={primaryAlertsAvailable} />
          <div className={styles.rowAxis}><AlertTriangle size={14} /><span>NWS alerts</span></div>
          <AlertCell
            alerts={secondaryData?.alerts ?? null}
            label={secondaryLabel}
            available={Boolean(secondaryData && !secondaryError && secondaryData.alertFeedAvailable === true)}
          />
        </section>

        <section className={styles.situationalBand} aria-label="Paired radar and current observation comparison">
          <ComparisonRadar
            side="A"
            label={primaryLabel}
            station={primaryData.location.radarStation}
            playing={radarPlaying}
            refreshKey={radarRefresh}
          />
          <section className={styles.metricPanel} aria-label="Current observation metrics comparison">
            <div className={styles.metricHeader} aria-hidden="true">
              <span>A · {primaryData.location.stationId}</span><strong>Current observations</strong><span>B · {secondaryData?.location.stationId ?? "pending"}</span>
            </div>
            {metricRows.map((metric) => (
              <div className={styles.metricRow} key={metric.label}>
                <strong>{metric.primary}</strong>
                <span><b>{metric.label}</b><small>{metric.delta}</small></span>
                <strong>{metric.secondary}</strong>
              </div>
            ))}
          </section>
          <ComparisonRadar
            side="B"
            label={secondaryLabel}
            station={secondaryData?.location.radarStation ?? null}
            playing={radarPlaying}
            refreshKey={radarRefresh}
            loading={secondaryLoading}
            error={secondaryError}
          />
        </section>

        <div className={styles.outlookGrid}>
          <section className={styles.outlookPanel} aria-label="Aligned hourly forecast comparison">
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}>Same instant / local clocks</span><h2>Next six hours</h2></div>
              <small>NWS point forecast</small>
            </div>
            {alignedHours.length ? (
              <div className={styles.hourlyScroller} role="region" aria-label="Scrollable aligned hourly forecasts" tabIndex={0}>
                <div className={styles.hourlyGrid} style={hourlyStyle}>
                  <div className={styles.railLabel}><b>A</b><span>{primaryLabel}</span></div>
                  {alignedHours.map((hour) => <HourCell key={`a-${hour.startTime}`} period={hour.primary} timeZone={primaryData.location.timeZone} />)}
                  <div className={`${styles.railLabel} ${styles.secondRow}`}><b>B</b><span>{secondaryLabel}</span></div>
                  {alignedHours.map((hour) => <HourCell key={`b-${hour.startTime}`} period={hour.secondary} timeZone={secondaryData?.location.timeZone ?? "UTC"} secondary />)}
                </div>
              </div>
            ) : (
              <div className={styles.outlookEmpty}>{secondaryConfig ? "Waiting for aligned forecast hours." : "Choose Place B to load the shared forecast timeline."}</div>
            )}
          </section>

          <section className={styles.outlookPanel} aria-label="Daily forecast comparison">
            <div className={styles.panelHeading}>
              <div><span className={styles.eyebrow}>Local days / paired lead</span><h2>Five-day outlook</h2></div>
              <small>High / low / precip</small>
            </div>
            {daySlots.length ? (
              <div className={styles.dailyScroller} role="region" aria-label="Scrollable five-day forecast comparison" tabIndex={0}>
                <div className={styles.dailyGrid} style={dailyStyle}>
                  <div className={styles.railLabel}><b>A</b><span>{primaryLabel}</span></div>
                  {daySlots.map((index) => <DayCell key={`a-day-${index}`} day={primaryDays[index] ?? null} />)}
                  <div className={`${styles.railLabel} ${styles.secondRow}`}><b>B</b><span>{secondaryLabel}</span></div>
                  {daySlots.map((index) => <DayCell key={`b-day-${index}`} day={secondaryDays[index] ?? null} secondary />)}
                </div>
              </div>
            ) : <div className={styles.outlookEmpty}>Daily forecast unavailable.</div>}
          </section>
        </div>
      </main>

      <footer className={styles.footer} inert={pickerOpen} aria-hidden={pickerOpen}>
        <span><i className={secondaryError || comparisonHasDegradedProducts ? styles.degraded : ""} /> {!secondaryConfig ? "Choose Place B" : secondaryError ? "Place B feed degraded" : secondaryLoading ? "Updating Place B" : secondaryData ? comparisonHasDegradedProducts ? "Comparison loaded · some feeds unavailable" : "Both station feeds loaded" : "Waiting for Place B"}</span>
        <span>Observed: NWS / AviationWeather · Forecast: National Weather Service</span>
      </footer>

      {pickerOpen && (
        <div className={styles.pickerBackdrop} role="presentation">
          <section ref={pickerDialog} className={styles.picker} role="dialog" aria-modal="true" aria-labelledby="comparison-picker-title" tabIndex={-1}>
            <div className={styles.pickerHeading}>
              <div><span className={styles.eyebrow}>Crosscheck station B</span><h2 id="comparison-picker-title">Choose a second place</h2></div>
              <button type="button" onClick={closePicker} aria-label={secondaryConfig ? "Close location picker" : "Cancel comparison"} data-picker-close><X size={18} /></button>
            </div>
            <p>Place A stays locked to <strong>{primaryLabel}</strong>. Search for a different U.S. location or supported territory.</p>
            <form className={styles.searchForm} onSubmit={(event) => void searchLocations(event)}>
              <label htmlFor="comparison-location-search">City, state, territory, or ZIP code</label>
              <div>
                <Search size={17} aria-hidden="true" />
                <input
                  ref={searchInput}
                  id="comparison-location-search"
                  type="search"
                  value={query}
                  onChange={(event) => {
                    searchController.current?.abort();
                    searchController.current = null;
                    setSearching(false);
                    setQuery(event.target.value);
                    setResults([]);
                    setSearchError(null);
                  }}
                  placeholder="Denver, CO or 80202"
                  autoComplete="off"
                />
                <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
              </div>
            </form>
            {searchError && <p className={styles.searchError} role="alert">{searchError}</p>}
            {results.length > 0 && (
              <div className={styles.searchResults} aria-label="Comparison location results">
                {results.map((result) => (
                  <button
                    type="button"
                    key={result.id}
                    onClick={() => chooseSecondary({ latitude: result.latitude, longitude: result.longitude, customLabel: result.label })}
                  >
                    <MapPin size={15} aria-hidden="true" />
                    <span><strong>{result.name}</strong><small>{Array.from(new Set([result.region, result.country].filter(Boolean))).join(" · ")}</small></span>
                    <b>Compare</b>
                  </button>
                ))}
              </div>
            )}
            {!results.length && !searchError && (
              <div className={styles.pickerStandby}>
                <ArrowLeftRight size={22} />
                <span><strong>One shared timeline</strong><small>Observed conditions remain distinct; forecast hours align to the same instant.</small></span>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
