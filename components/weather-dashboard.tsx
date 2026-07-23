"use client";

import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Copy,
  Droplets,
  Expand,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  MapPin,
  Minimize,
  Moon,
  Navigation,
  Pause,
  Plane,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Star,
  Trash2,
  Sunrise,
  Sunset,
  Wind,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  HourlyPeriod,
  DisplayMode,
  FavoriteLocation,
  LocationConfig,
  LocationSearchResult,
  WeatherDashboardData,
} from "@/lib/types";
import { WeatherIcon } from "@/components/weather-icon";
import { AviationConsole } from "@/components/aviation-console";
import { IntelligenceGrid } from "@/components/intelligence-grid";
import { SensorDeck } from "@/components/sensor-deck";
import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from "@/lib/themes";

type LocationFormConfig = {
  latitude: string;
  longitude: string;
  customLabel?: string;
};

const WALLBOARD_SCENES = [
  { id: "forecast", label: "Forecast", detail: "Hourly trend, outlook, and forecaster reasoning" },
  { id: "intelligence", label: "Intelligence", detail: "Decision signals, storm center, environment, and field tools" },
  { id: "aviation", label: "Aviation", detail: "TAF, nearby airports, advisories, and pilot reports" },
] as const;

const DISPLAY_PROFILES: Array<{ id: DisplayMode; name: string; detail: string }> = [
  { id: "desk", name: "Weather desk", detail: "Balanced radar, forecast, and situational awareness" },
  { id: "severe", name: "Storm watch", detail: "Warnings and convective intelligence move forward" },
  { id: "aviation", name: "Flight operations", detail: "METAR, TAF, alternates, hazards, and pilot products" },
  { id: "minimal", name: "Essential", detail: "Radar, satellite, and current conditions only" },
];

const EXPANDED_WALLBOARD_QUERY = "(min-width: 3000px) and (min-height: 900px)";

type WallboardSceneId = (typeof WALLBOARD_SCENES)[number]["id"];
type WallboardScenes = Record<WallboardSceneId, boolean>;

const DEFAULT_WALLBOARD_SCENES: WallboardScenes = {
  forecast: true,
  intelligence: true,
  aviation: true,
};

function savedWallboardScenes(value: string | null): WallboardScenes {
  if (!value) return DEFAULT_WALLBOARD_SCENES;
  try {
    const parsed = JSON.parse(value) as Partial<Record<WallboardSceneId, unknown>>;
    const next = {
      forecast: parsed.forecast !== false,
      intelligence: parsed.intelligence !== false,
      aviation: parsed.aviation !== false,
    };
    return Object.values(next).some(Boolean) ? next : DEFAULT_WALLBOARD_SCENES;
  } catch {
    return DEFAULT_WALLBOARD_SCENES;
  }
}

function validLocation(value: unknown): value is LocationConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocationConfig>;
  return (
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

function isDisplayMode(value: string | null): value is DisplayMode {
  return DISPLAY_PROFILES.some((profile) => profile.id === value);
}

function initialLocation(): LocationConfig | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const queryLat = Number(params.get("lat"));
  const queryLon = Number(params.get("lon"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(queryLat) && Number.isFinite(queryLon)) {
    const queryLocation = {
      latitude: queryLat,
      longitude: queryLon,
      customLabel: params.get("location")?.slice(0, 120) || undefined,
    };
    return validLocation(queryLocation) ? queryLocation : null;
  }

  const saved = window.localStorage.getItem("weatherguy-location");
  if (!saved) return null;
  try {
    const location = JSON.parse(saved) as unknown;
    return validLocation(location) ? location : null;
  } catch {
    window.localStorage.removeItem("weatherguy-location");
    return null;
  }
}

function formFromLocation(location: LocationConfig | null): LocationFormConfig {
  return {
    latitude: location ? String(location.latitude) : "",
    longitude: location ? String(location.longitude) : "",
    customLabel: location?.customLabel,
  };
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
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function apparentTemperatureF(temperatureF: number | null, humidityPct: number | null, windSpeedMph: number | null) {
  if (temperatureF === null) return null;
  if (temperatureF >= 80 && humidityPct !== null && humidityPct >= 40) {
    const humidity = humidityPct;
    const heatIndex =
      -42.379 +
      2.04901523 * temperatureF +
      10.14333127 * humidity -
      0.22475541 * temperatureF * humidity -
      0.00683783 * temperatureF ** 2 -
      0.05481717 * humidity ** 2 +
      0.00122874 * temperatureF ** 2 * humidity +
      0.00085282 * temperatureF * humidity ** 2 -
      0.00000199 * temperatureF ** 2 * humidity ** 2;
    return Math.round(heatIndex);
  }
  if (temperatureF <= 50 && windSpeedMph !== null && windSpeedMph > 3) {
    const windFactor = windSpeedMph ** 0.16;
    return Math.round(35.74 + 0.6215 * temperatureF - 35.75 * windFactor + 0.4275 * temperatureF * windFactor);
  }
  return Math.round(temperatureF);
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
  const [config, setConfig] = useState<LocationConfig | null>(initialLocation);
  const [formConfig, setFormConfig] = useState<LocationFormConfig>(() => formFromLocation(initialLocation()));
  const [data, setData] = useState<WeatherDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(new Date());
  const [geoError, setGeoError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("desk");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [autoRotate, setAutoRotate] = useState(false);
  const [autoDim, setAutoDim] = useState(false);
  const [alertAudio, setAlertAudio] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offlineSnapshot, setOfflineSnapshot] = useState(false);
  const [online, setOnline] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wallboardScenes, setWallboardScenes] = useState<WallboardScenes>(DEFAULT_WALLBOARD_SCENES);
  const [wallboardRotate, setWallboardRotate] = useState(true);
  const [wallboardIntervalSeconds, setWallboardIntervalSeconds] = useState(20);
  const [wallboardSceneIndex, setWallboardSceneIndex] = useState(0);
  const [wallboardPaused, setWallboardPaused] = useState(false);
  const [largeDisplayWallboard, setLargeDisplayWallboard] = useState(false);
  const locationModalOpen = mounted && (settingsOpen || !config);
  const searchMode = searchQuery.trim().length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
      setOnline(navigator.onLine);
      try {
        setFavorites(JSON.parse(window.localStorage.getItem("weatherguy-favorites") || "[]") as FavoriteLocation[]);
        const savedDisplayMode = window.localStorage.getItem("weatherguy-display-mode");
        setDisplayMode(isDisplayMode(savedDisplayMode) ? savedDisplayMode : "desk");
        const savedTheme = window.localStorage.getItem("weatherguy-theme");
        if (isThemeId(savedTheme)) setTheme(savedTheme);
        setAutoRotate(window.localStorage.getItem("weatherguy-auto-rotate") === "true");
        setAutoDim(window.localStorage.getItem("weatherguy-auto-dim") === "true");
        setAlertAudio(window.localStorage.getItem("weatherguy-alert-audio") === "true");
        setWallboardScenes(savedWallboardScenes(window.localStorage.getItem("weatherguy-wallboard-scenes")));
        setWallboardRotate(window.localStorage.getItem("weatherguy-wallboard-rotate") !== "false");
        const savedInterval = Number(window.localStorage.getItem("weatherguy-wallboard-interval"));
        setWallboardIntervalSeconds([20, 30, 60].includes(savedInterval) ? savedInterval : 20);
      } catch {
        // A privacy-mode browser may disable persistent storage; the desk still works live.
      }
    }, 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.dataset.theme = theme;
    const browserColor = THEMES.find((option) => option.id === theme)?.browserColor;
    if (browserColor) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", browserColor);
  }, [mounted, theme]);

  useEffect(() => {
    const media = window.matchMedia(EXPANDED_WALLBOARD_QUERY);
    const syncLargeDisplay = () => setLargeDisplayWallboard(media.matches);
    syncLargeDisplay();
    media.addEventListener("change", syncLargeDisplay);
    return () => media.removeEventListener("change", syncLargeDisplay);
  }, []);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!locationModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locationModalOpen]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    const refresh = window.setInterval(() => setRefreshKey((value) => value + 1), 60_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const activeConfig = config;
    if (!activeConfig) return;
    const { latitude, longitude } = activeConfig;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/weather?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}&schema=3`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Weather data could not be loaded.");
        setData(payload as WeatherDashboardData);
        setOfflineSnapshot(false);
        window.localStorage.setItem(`weatherguy-snapshot-${latitude.toFixed(3)}-${longitude.toFixed(3)}`, JSON.stringify(payload));
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        const cached = window.localStorage.getItem(`weatherguy-snapshot-${latitude.toFixed(3)}-${longitude.toFixed(3)}`);
        if (cached) {
          try {
            setData(JSON.parse(cached) as WeatherDashboardData);
            setOfflineSnapshot(true);
          } catch {
            window.localStorage.removeItem(`weatherguy-snapshot-${latitude.toFixed(3)}-${longitude.toFixed(3)}`);
          }
        }
        setError(requestError instanceof Error ? requestError.message : "Weather data could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [config, refreshKey]);

  useEffect(() => {
    if (!autoRotate || favorites.length < 2) return;
    const timer = window.setInterval(() => {
      setConfig((current) => {
        const currentIndex = favorites.findIndex((favorite) => favorite.latitude === current?.latitude && favorite.longitude === current?.longitude);
        const next = favorites[(currentIndex + 1 + favorites.length) % favorites.length];
        window.localStorage.setItem("weatherguy-location", JSON.stringify(next));
        const params = new URLSearchParams({ lat: next.latitude.toFixed(4), lon: next.longitude.toFixed(4), location: next.label });
        window.history.replaceState(null, "", `?${params.toString()}`);
        return next;
      });
    }, 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRotate, favorites]);

  useEffect(() => {
    if (!alertAudio || !data?.alerts.length) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    return () => { void context.close(); };
  }, [alertAudio, data?.alerts.length]);

  const timeZone = data?.location.timeZone ?? "UTC";
  const hourly = data?.hourly.slice(0, 9) ?? [];
  const daily = useMemo(() => data?.daily.filter((period) => period.isDaytime).slice(0, 5) ?? [], [data]);
  const nearTermHours = hourly.slice(1, 5);
  const nearTermTarget = hourly[Math.min(3, Math.max(0, hourly.length - 1))];
  const currentFeelsLike = data
    ? apparentTemperatureF(data.current.temperatureF, data.current.humidityPct, data.current.windSpeedMph)
    : null;
  const nearTermTrend = data?.current.temperatureF !== null && data?.current.temperatureF !== undefined && nearTermTarget
    ? nearTermTarget.temperatureF - data.current.temperatureF
    : null;
  const nearTermTrendLabel = nearTermTrend === null
    ? "—"
    : Math.abs(nearTermTrend) < 2
      ? "Steady"
      : `${nearTermTrend > 0 ? "↑" : "↓"} ${Math.abs(Math.round(nearTermTrend))}°`;
  const nearTermRainPeak = hourly.slice(0, 4).reduce(
    (peak, period) => Math.max(peak, period.precipitationPct ?? 0),
    0,
  );
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  const nightDimmed = mounted && autoDim && (localHour >= 22 || localHour < 6);
  const enabledWallboardScenes = useMemo(
    () => WALLBOARD_SCENES.filter((scene) => wallboardScenes[scene.id]),
    [wallboardScenes],
  );
  const activeWallboardScene = enabledWallboardScenes[wallboardSceneIndex % enabledWallboardScenes.length]?.id ?? "forecast";
  const activeWallboardScenePosition = Math.max(0, enabledWallboardScenes.findIndex((scene) => scene.id === activeWallboardScene));
  const activeWallboardSceneLabel = enabledWallboardScenes[activeWallboardScenePosition]?.label ?? "Forecast";
  const showAllWallboardScenes = isFullscreen && largeDisplayWallboard && enabledWallboardScenes.length > 1;

  useEffect(() => {
    if (!isFullscreen || showAllWallboardScenes || !wallboardRotate || wallboardPaused || enabledWallboardScenes.length < 2) return;
    const timer = window.setInterval(
      () => setWallboardSceneIndex((current) => (current + 1) % enabledWallboardScenes.length),
      wallboardIntervalSeconds * 1_000,
    );
    return () => window.clearInterval(timer);
  }, [enabledWallboardScenes.length, isFullscreen, showAllWallboardScenes, wallboardIntervalSeconds, wallboardPaused, wallboardRotate]);

  const commitLocation = useCallback((next: LocationConfig) => {
    window.localStorage.setItem("weatherguy-location", JSON.stringify(next));
    const params = new URLSearchParams({ lat: next.latitude.toFixed(4), lon: next.longitude.toFixed(4) });
    if (next.customLabel) params.set("location", next.customLabel);
    window.history.replaceState(null, "", `?${params.toString()}`);
    setData(null);
    setConfig(next);
    setSettingsOpen(false);
    setGeoError(null);
    setSearchQuery("");
    setSearchError(null);
    setSearchResults([]);
    setWallboardSceneIndex(0);
  }, []);

  const saveLocation = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const latitude = Number(formConfig.latitude);
      const longitude = Number(formConfig.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setGeoError("Enter valid numeric coordinates.");
        return;
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setGeoError("Coordinates are outside the valid range.");
        return;
      }
      commitLocation({
        latitude,
        longitude,
        customLabel: formConfig.customLabel?.trim() || undefined,
      });
    },
    [commitLocation, formConfig],
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
          latitude: position.coords.latitude.toFixed(4),
          longitude: position.coords.longitude.toFixed(4),
        });
      },
      () => setGeoError("Location access was not granted. Enter coordinates instead."),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const openLocationSettings = () => {
    setFormConfig(formFromLocation(config));
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setGeoError(null);
    setSettingsOpen(true);
  };

  const closeLocationSettings = () => {
    if (config) setSettingsOpen(false);
  };

  const searchLocations = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchError("Enter a city, state, territory, or ZIP code.");
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as { results?: LocationSearchResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Location search failed.");
      const results = payload.results ?? [];
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No NWS-covered locations matched. Try a nearby city or ZIP code.");
      }
    } catch (searchRequestError) {
      setSearchResults([]);
      setSearchError(
        searchRequestError instanceof Error ? searchRequestError.message : "Location search failed.",
      );
    } finally {
      setSearching(false);
    }
  };

  const chooseSearchResult = (result: LocationSearchResult) => {
    commitLocation({
      latitude: result.latitude,
      longitude: result.longitude,
      customLabel: result.label,
    });
  };

  const requestFullscreen = async () => {
    if (!document.fullscreenElement) {
      const preferredScene = displayMode === "aviation"
        ? enabledWallboardScenes.findIndex((scene) => scene.id === "aviation")
        : 0;
      setWallboardSceneIndex(Math.max(0, preferredScene));
      setWallboardPaused(false);
      await document.documentElement.requestFullscreen?.();
    }
    else await document.exitFullscreen?.();
  };

  const persistSetting = (key: string, value: string) => window.localStorage.setItem(key, value);

  const selectTheme = (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    persistSetting("weatherguy-theme", nextTheme);
  };

  const selectDisplayProfile = (mode: DisplayMode) => {
    setDisplayMode(mode);
    persistSetting("weatherguy-display-mode", mode);

    if (mode === "aviation") {
      const nextScenes = wallboardScenes.aviation ? wallboardScenes : { ...wallboardScenes, aviation: true };
      if (nextScenes !== wallboardScenes) {
        setWallboardScenes(nextScenes);
        persistSetting("weatherguy-wallboard-scenes", JSON.stringify(nextScenes));
      }
      const aviationIndex = WALLBOARD_SCENES.filter((scene) => nextScenes[scene.id]).findIndex((scene) => scene.id === "aviation");
      setWallboardSceneIndex(Math.max(0, aviationIndex));
    }
  };

  const addFavorite = () => {
    if (!config || !data) return;
    const favorite: FavoriteLocation = {
      ...config,
      id: `${config.latitude.toFixed(4)},${config.longitude.toFixed(4)}`,
      label: config.customLabel || data.location.label,
    };
    const next = [...favorites.filter((item) => item.id !== favorite.id), favorite];
    setFavorites(next);
    window.localStorage.setItem("weatherguy-favorites", JSON.stringify(next));
  };

  const removeFavorite = (id: string) => {
    const next = favorites.filter((favorite) => favorite.id !== id);
    setFavorites(next);
    window.localStorage.setItem("weatherguy-favorites", JSON.stringify(next));
  };

  const loadFavorite = (favorite: FavoriteLocation) => {
    const next: LocationConfig = { latitude: favorite.latitude, longitude: favorite.longitude, customLabel: favorite.label };
    window.localStorage.setItem("weatherguy-location", JSON.stringify(next));
    const params = new URLSearchParams({ lat: favorite.latitude.toFixed(4), lon: favorite.longitude.toFixed(4), location: favorite.label });
    window.history.replaceState(null, "", `?${params.toString()}`);
    setConfig(next);
    setWallboardSceneIndex(0);
    setSettingsOpen(false);
  };

  const toggleWallboardScene = (sceneId: WallboardSceneId) => {
    const next = { ...wallboardScenes, [sceneId]: !wallboardScenes[sceneId] };
    if (!Object.values(next).some(Boolean)) return;
    setWallboardScenes(next);
    setWallboardSceneIndex(0);
    persistSetting("weatherguy-wallboard-scenes", JSON.stringify(next));
  };

  const showAdjacentWallboardScene = (direction: -1 | 1) => {
    setWallboardSceneIndex((current) => (
      (current + direction + enabledWallboardScenes.length) % enabledWallboardScenes.length
    ));
  };

  const copyFamilyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <main className={`app-shell mode-${displayMode} ${nightDimmed ? "night-dim" : ""} ${isFullscreen ? "is-fullscreen" : ""} ${showAllWallboardScenes ? `wallboard-expanded wallboard-scenes-${enabledWallboardScenes.length}` : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="radar-mark" aria-hidden="true"><span /></span>
          <div>
            <strong className="brand-name">WX DYNAMICS</strong>
            <span className="brand-subtitle">Weather intelligence</span>
          </div>
        </div>

        <div className="location-lockup">
          <MapPin size={15} aria-hidden="true" />
          <div>
            <strong>{(mounted ? config?.customLabel : undefined) ?? data?.location.label ?? "Choose a location"}</strong>
            <span>{data ? `${data.location.stationId} · NWS ${data.location.wfo}` : "U.S. / NWS coverage"}</span>
          </div>
        </div>

        <div className="header-status">
          <div className="clock-block">
            <span suppressHydrationWarning>{new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(now)}</span>
            <strong suppressHydrationWarning>{new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(now)}</strong>
          </div>
          <label className="mode-picker" title="Change dashboard layout">
            <LayoutDashboard size={15} aria-hidden="true" />
            <select value={displayMode} onChange={(event) => selectDisplayProfile(event.target.value as DisplayMode)} aria-label="Display mode">
              <option value="desk">Desk</option>
              <option value="severe">Severe</option>
              <option value="aviation">Aviation</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          <button className="icon-button" onClick={() => setRefreshKey((value) => value + 1)} title="Refresh data" aria-label="Refresh weather data">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button className="icon-button" onClick={() => void requestFullscreen()} title={isFullscreen ? "Exit fullscreen" : "Open fullscreen wallboard"} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen wallboard"}>
            {isFullscreen ? <Minimize size={18} /> : <Expand size={18} />}
          </button>
          <button className="icon-button" onClick={openLocationSettings} title="Open settings" aria-label="Open settings">
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

      {data?.alerts[0] && (
        <details className="alert-detail">
          <summary>Read {data.alerts[0].event} details</summary>
          <div><p>{data.alerts[0].description}</p>{data.alerts[0].instruction && <p><strong>What to do:</strong> {data.alerts[0].instruction}</p>}</div>
        </details>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span><strong>Live feed interrupted.</strong> {error}</span>
          <button onClick={() => setRefreshKey((value) => value + 1)}>Try again</button>
        </div>
      )}

      <div className={`dashboard-grid ${loading && !data ? "is-loading" : ""}`}>
        {data ? <SensorDeck data={data} refreshKey={refreshKey} /> : (
          <section className="panel sensor-panel sensor-loading"><RefreshCw className="spin" size={28} /><span>Resolving sensor network</span></section>
        )}

        <aside className="status-column">
          <section className="panel current-panel">
            <div className="panel-heading compact">
              <div><span className="eyebrow">Observed conditions</span><h2>Right now</h2></div>
              <span className="freshness">{data ? `${data.location.stationId} ${data.current.source ?? "NWS"} · ${observationAge(data.current.timestamp)}` : "acquiring"}</span>
            </div>
            <div className="current-hero">
              <div className="condition-icon"><WeatherIcon condition={data?.current.description ?? "cloudy"} size={72} strokeWidth={1.25} /></div>
              <div className="temperature-block">
                <strong>{data?.current.temperatureF ?? "—"}<sup>°</sup></strong>
                <span>{data?.current.description ?? "Loading observation"}</span>
              </div>
            </div>
            <div className="current-nowcast" aria-label="Short-term weather outlook">
              <div className="current-nowcast-summary">
                <span><b>Feels like</b><strong>{currentFeelsLike ?? "—"}°</strong><small>humidity + wind</small></span>
                <span><b>Next 3 hours</b><strong>{nearTermTrendLabel}</strong><small>{nearTermTarget ? `by ${formatHour(nearTermTarget.startTime, timeZone).hour}` : "trend pending"}</small></span>
                <span><b>Rain peak</b><strong>{nearTermRainPeak}%</strong><small>next 3 hours</small></span>
              </div>
              <div className="current-nowcast-hours">
                {nearTermHours.map((period) => {
                  const label = formatHour(period.startTime, timeZone);
                  return (
                    <span key={period.startTime}>
                      <b>{label.hour}</b>
                      <WeatherIcon condition={period.shortForecast} isDaytime={period.isDaytime} size={17} />
                      <strong>{period.temperatureF}°</strong>
                      <em>{period.shortForecast}</em>
                      <small>{period.precipitationPct ?? 0}%</small>
                      <i>{period.windDirection} {period.windSpeed}</i>
                    </span>
                  );
                })}
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

        <section className="wallboard-bay" aria-label="Fullscreen wallboard scenes">
          <div className="wallboard-cycle">
            <div className="wallboard-cycle-status">
              <span>{showAllWallboardScenes ? "Large display" : "Wallboard cycle"}</span>
              <strong aria-live="polite">{showAllWallboardScenes ? "All stations open" : activeWallboardSceneLabel}</strong>
              <small>{showAllWallboardScenes ? `${enabledWallboardScenes.length} live` : `${activeWallboardScenePosition + 1} / ${enabledWallboardScenes.length}`}</small>
            </div>
            {!showAllWallboardScenes && (
              <>
                <div className="wallboard-scene-tabs" aria-label="Choose wallboard scene">
                  {enabledWallboardScenes.map((scene, index) => (
                    <button
                      className={activeWallboardScene === scene.id ? "active" : ""}
                      type="button"
                      key={scene.id}
                      onClick={() => setWallboardSceneIndex(index)}
                      title={scene.detail}
                    >
                      {scene.label}
                    </button>
                  ))}
                </div>
                <div className="wallboard-cycle-actions">
                  <button type="button" onClick={() => showAdjacentWallboardScene(-1)} aria-label="Previous wallboard scene"><ChevronLeft size={14} /></button>
                  {wallboardRotate && enabledWallboardScenes.length > 1 && (
                    <button type="button" onClick={() => setWallboardPaused((current) => !current)} aria-label={wallboardPaused ? "Resume wallboard rotation" : "Pause wallboard rotation"}>
                      {wallboardPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                  )}
                  <button type="button" onClick={() => showAdjacentWallboardScene(1)} aria-label="Next wallboard scene"><ChevronRight size={14} /></button>
                </div>
                {wallboardRotate && !wallboardPaused && enabledWallboardScenes.length > 1 && (
                  <span className="wallboard-progress" aria-hidden="true">
                    <i key={`${activeWallboardScene}-${wallboardSceneIndex}`} style={{ animationDuration: `${wallboardIntervalSeconds}s` }} />
                  </span>
                )}
              </>
            )}
          </div>

          <div className={`wallboard-scene wallboard-scene-forecast ${wallboardScenes.forecast ? "enabled" : ""} ${activeWallboardScene === "forecast" ? "active" : ""}`} aria-hidden={isFullscreen ? (showAllWallboardScenes ? !wallboardScenes.forecast : activeWallboardScene !== "forecast") : undefined}>
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
          {data?.discussion && (
            <details className="discussion-product">
              <summary>Read full NWS product <ChevronRight size={14} aria-hidden="true" /></summary>
              <pre>{data.discussion.raw || data.discussion.summary}</pre>
            </details>
          )}
            </section>
          </div>

          {data && (
            <>
              <div className={`wallboard-scene wallboard-scene-intelligence ${wallboardScenes.intelligence ? "enabled" : ""} ${activeWallboardScene === "intelligence" ? "active" : ""}`} aria-hidden={isFullscreen ? (showAllWallboardScenes ? !wallboardScenes.intelligence : activeWallboardScene !== "intelligence") : undefined}>
                <IntelligenceGrid latitude={data.location.latitude} longitude={data.location.longitude} timeZone={data.location.timeZone} refreshKey={refreshKey} />
              </div>
              <div className={`wallboard-scene wallboard-scene-aviation ${wallboardScenes.aviation ? "enabled" : ""} ${activeWallboardScene === "aviation" ? "active" : ""}`} aria-hidden={isFullscreen ? (showAllWallboardScenes ? !wallboardScenes.aviation : activeWallboardScene !== "aviation") : undefined}>
                <AviationConsole data={data} refreshKey={refreshKey} />
              </div>
            </>
          )}
        </section>
      </div>

      <aside className="sponsor-slot" aria-label="Sponsored project">
        <a className="sponsor-project" href="https://lightconesystems.com/" target="_blank" rel="sponsored noreferrer">
          <span className="sponsor-mark" aria-hidden="true"><Plane size={18} /></span>
          <span className="sponsor-copy">
            <span className="sponsor-kicker">Sponsored signal</span>
            <strong>Lightcone Ledger</strong>
            <small>Dispatch and proof for controlled UAS operations.</small>
          </span>
          <span className="release-rail" aria-hidden="true">
            <i>Record</i><i>Check</i><i>Release</i><i>Prove</i>
          </span>
          <span className="sponsor-visit">Visit Lightcone <ChevronRight size={14} /></span>
        </a>
        <div className="sponsor-inquiries">
          <span>Reserved sponsor position</span>
          <a href="mailto:chris.remboldt@gmail.com?subject=wxdynamics%20ad%20space">Contact for ad space inquiries</a>
        </div>
      </aside>

      <footer className="source-strip">
        <span><i className={!online || error ? "status-dot degraded" : "status-dot"} /> {!online ? "Offline · cached desk remains available" : offlineSnapshot ? "Serving the last saved snapshot" : error ? "Live feed degraded" : "All live feeds connected"}</span>
        <span>Weather: NOAA / National Weather Service</span>
        <span>Radar: NEXRAD RIDGE + NWS OpenGeo</span>
        <span>Satellite: NOAA GOES</span>
        <span>Aviation: AviationWeather.gov</span>
        {data?.notices.map((notice) => <span className="source-notice" key={notice}>{notice}</span>)}
      </footer>

      {locationModalOpen && createPortal(
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeLocationSettings()}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-heading">
              <div><span className="eyebrow">wxDynamics controls</span><h2 id="settings-title">{config ? "Desk settings" : "Choose an area"}</h2></div>
              {config && <button className="icon-button" onClick={closeLocationSettings} aria-label="Close settings"><X size={18} /></button>}
            </div>
            <div className="settings-modal-body">
              <p className="settings-intro">{config ? "Choose the desk’s visual channel, configure the fullscreen wallboard, or switch to another NWS-covered area." : "Search for a city or ZIP code, then choose a result. wxDynamics resolves the forecast office, radar site, and nearest reporting airport automatically."}</p>

              {config && (
                <>
                  <div className="display-mode-preferences">
                    <span className="settings-section-label">Desk profile</span>
                    <p>Choose what wxDynamics puts first. The profile is saved on this browser and carries into fullscreen.</p>
                    <div className="display-mode-options" role="radiogroup" aria-label="Dashboard operating profile">
                      {DISPLAY_PROFILES.map((profile) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={displayMode === profile.id}
                          className={`display-mode-option ${displayMode === profile.id ? "active" : ""}`}
                          key={profile.id}
                          onClick={() => selectDisplayProfile(profile.id)}
                        >
                          <span className="display-mode-icon" aria-hidden="true">
                            {profile.id === "desk" && <LayoutDashboard size={18} />}
                            {profile.id === "severe" && <ShieldAlert size={18} />}
                            {profile.id === "aviation" && <Plane size={18} />}
                            {profile.id === "minimal" && <Navigation size={18} />}
                          </span>
                          <span><b>{profile.name}</b><small>{profile.detail}</small></span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="theme-preferences">
                    <span className="settings-section-label">Color console</span>
                    <p>Switch the entire desk instantly. Your choice follows this browser into fullscreen.</p>
                    <div className="theme-options" role="radiogroup" aria-label="Dashboard color scheme">
                      {THEMES.map((option) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={theme === option.id}
                          className={`theme-option ${theme === option.id ? "active" : ""}`}
                          key={option.id}
                          onClick={() => selectTheme(option.id)}
                        >
                          <span className="theme-swatch" aria-hidden="true">
                            {option.swatches.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                          </span>
                          <span><b>{option.name}</b><small>{option.detail}</small></span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wallboard-preferences">
                    <span className="settings-section-label">Fullscreen wallboard</span>
                    <p>Radar, satellite, and current conditions stay fixed. Standard displays rotate these briefing scenes; very large displays open every enabled scene at once.</p>
                    <div className="wallboard-scene-options">
                      {WALLBOARD_SCENES.map((scene) => (
                        <label key={scene.id}>
                          <input
                            type="checkbox"
                            checked={wallboardScenes[scene.id]}
                            disabled={wallboardScenes[scene.id] && enabledWallboardScenes.length === 1}
                            onChange={() => toggleWallboardScene(scene.id)}
                          />
                          <span><b>{scene.label}</b><small>{scene.detail}</small></span>
                        </label>
                      ))}
                    </div>
                    <div className="wallboard-timing">
                      <label>
                        <span><b>Rotate scenes</b><small>Advance automatically on standard fullscreen displays</small></span>
                        <input type="checkbox" checked={wallboardRotate} onChange={(event) => {
                          setWallboardRotate(event.target.checked);
                          setWallboardPaused(false);
                          persistSetting("weatherguy-wallboard-rotate", String(event.target.checked));
                        }} />
                      </label>
                      <label>
                        <span><b>Scene time</b><small>A full three-scene pass takes about one minute at 20 seconds</small></span>
                        <select value={wallboardIntervalSeconds} disabled={!wallboardRotate} onChange={(event) => {
                          const seconds = Number(event.target.value);
                          setWallboardIntervalSeconds(seconds);
                          persistSetting("weatherguy-wallboard-interval", String(seconds));
                        }}>
                          <option value="20">20 seconds</option>
                          <option value="30">30 seconds</option>
                          <option value="60">1 minute</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="display-preferences">
                    <span className="settings-section-label">Family & display profile</span>
                    <div className="preference-actions">
                      <button type="button" onClick={() => void copyFamilyUrl()}><Copy size={15} /> {copied ? "Copied" : "Copy family URL"}</button>
                      <button type="button" onClick={addFavorite}><Star size={15} /> Save current area</button>
                    </div>
                    <div className="preference-toggles">
                      <label><span><Moon size={16} /><b>Auto-dim</b><small>10 PM–6 AM local time</small></span><input type="checkbox" checked={autoDim} onChange={(event) => { setAutoDim(event.target.checked); persistSetting("weatherguy-auto-dim", String(event.target.checked)); }} /></label>
                      <label><span>{alertAudio ? <Bell size={16} /> : <BellOff size={16} />}<b>Alert tone</b><small>One chime when alerts appear</small></span><input type="checkbox" checked={alertAudio} onChange={(event) => { setAlertAudio(event.target.checked); persistSetting("weatherguy-alert-audio", String(event.target.checked)); }} /></label>
                      <label><span><RefreshCw size={16} /><b>Rotate favorites</b><small>Change area every 15 minutes</small></span><input type="checkbox" checked={autoRotate} onChange={(event) => { setAutoRotate(event.target.checked); persistSetting("weatherguy-auto-rotate", String(event.target.checked)); }} /></label>
                    </div>
                    {favorites.length > 0 && (
                      <div className="favorite-list">
                        {favorites.map((favorite) => (
                          <div key={favorite.id}>
                            <button type="button" onClick={() => loadFavorite(favorite)}><MapPin size={14} /><span>{favorite.label}</span></button>
                            <button type="button" onClick={() => removeFavorite(favorite.id)} aria-label={`Remove ${favorite.label}`}><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className={config ? "location-preferences" : "welcome-location-controls"}>
                {config && (
                  <div className="location-preferences-heading">
                    <span className="settings-section-label">Weather area</span>
                    <p>Search for another place, use this device, or enter coordinates directly.</p>
                  </div>
                )}

                <form className="location-search-form" onSubmit={(event) => void searchLocations(event)}>
                  <label htmlFor="location-search">City, state, territory, or ZIP code</label>
                  <div>
                    <Search size={17} aria-hidden="true" />
                    <input id="location-search" type="search" value={searchQuery} onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchResults([]);
                      setSearchError(null);
                    }} placeholder="City and state, or ZIP code" autoComplete="off" />
                    <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
                  </div>
                </form>

                {searchResults.length > 0 && (
                  <div className="search-results-region" aria-live="polite">
                    <div className="search-results-prompt"><strong>Choose a result to continue</strong><span>Clicking a place opens its live weather desk.</span></div>
                    <div className="search-results" aria-label="Location search results">
                      {searchResults.map((result) => (
                        <button type="button" key={result.id} aria-label={`Use ${result.label}`} onClick={() => chooseSearchResult(result)}>
                          <MapPin size={15} aria-hidden="true" />
                          <span className="search-result-copy"><strong>{result.name}</strong><small>{Array.from(new Set([result.region, result.country].filter(Boolean))).join(" · ")}</small></span>
                          <span className="search-result-action">Use this area <ChevronRight size={14} aria-hidden="true" /></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {searchError && <p className="form-error">{searchError}</p>}

                {!searchMode && (
                  <div className="direct-location-controls">
                    <div className="settings-or"><span>or position directly</span></div>
                    <button className="locate-button" type="button" onClick={useMyLocation}><LocateFixed size={18} /> Use this device’s location</button>
                    <form id="location-coordinate-form" onSubmit={saveLocation}>
                      <div className="coordinate-grid">
                        <label>Latitude<input type="number" min="-90" max="90" step="0.0001" required value={formConfig.latitude} onChange={(event) => setFormConfig((current) => ({ ...current, latitude: event.target.value, customLabel: undefined }))} /></label>
                        <label>Longitude<input type="number" min="-180" max="180" step="0.0001" required value={formConfig.longitude} onChange={(event) => setFormConfig((current) => ({ ...current, longitude: event.target.value, customLabel: undefined }))} /></label>
                      </div>
                      {geoError && <p className="form-error">{geoError}</p>}
                      <div className="coordinate-action-row">
                        <p className="coverage-note">United States and supported territories</p>
                        <button className="coordinate-submit-button" type="submit">Use coordinates</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>
            {config && (
              <div className="form-actions">
                <span>Changes save automatically</span>
                <button className="primary-button" type="button" onClick={closeLocationSettings}>Done</button>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </main>
  );
}
