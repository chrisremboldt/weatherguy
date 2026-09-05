"use client";

import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, Columns2, Compass, Droplets, Expand, Gauge, Leaf, Minimize, Moon, Pause, Plane, Play, Radio, RefreshCw, Settings2, ShieldCheck, ShieldAlert, Sun, Telescope, Wind, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { AviationData, DisplayMode, FavoriteLocation, IntelligenceData, WeatherDashboardData } from "@/lib/types";
import { apparentTemperatureF, currentAndFutureHourlyPeriods } from "@/lib/weather-display";
import { buildForecastDays } from "@/lib/forecast-days";
import { buildWeatherStory } from "@/lib/weather-story";
import { WeatherIcon } from "@/components/weather-icon";
import { RadarMap } from "@/components/radar-map";
import { SatelliteView } from "@/components/satellite-view";
import { IntelligenceGrid } from "@/components/intelligence-grid";
import { AviationConsole } from "@/components/aviation-console";
import { ObservationContext } from "@/components/observation-context";
import { DaylightArc, WeatherRibbon } from "@/components/observatory-sky";
import styles from "./weather-observatory.module.css";

const ObservatoryRadar = memo(RadarMap);
const ObservatorySatellite = memo(SatelliteView);
const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "maps", label: "Radar & satellite" },
  { id: "outlook", label: "Outlook" },
  { id: "intelligence", label: "Intelligence" },
  { id: "aviation", label: "Aviation" },
] as const;
type View = typeof VIEWS[number]["id"];

type Props = {
  data: WeatherDashboardData | null;
  intelligence: IntelligenceData | null;
  regionalAviation: AviationData | null;
  now: Date;
  mounted: boolean;
  loading: boolean;
  error: string | null;
  online: boolean;
  offlineSnapshot: boolean;
  refreshKey: number;
  isFullscreen: boolean;
  customLabel?: string;
  favorites: FavoriteLocation[];
  displayMode: DisplayMode;
  suspended: boolean;
  intelligenceUnavailable: boolean;
  aviationUnavailable: boolean;
  onSettings: () => void;
  onRefresh: () => void;
  onFullscreen: () => void;
  onClassic: () => void;
  onCompare: (opener: HTMLElement) => void;
  onFavorite: (favorite: FavoriteLocation) => void;
};

function number(value: number | null | undefined, suffix = "", digits = 0) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}${suffix}`;
}
function direction(value: number | null) {
  return value === null ? "Direction unavailable" : ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(value / 22.5) % 16];
}
function preferredView(mode: DisplayMode): View {
  return mode === "aviation" ? "aviation" : mode === "severe" ? "intelligence" : "overview";
}
function oldTimestamp(timestamp: string | undefined, reference: number, minutes: number) {
  const age = reference - Date.parse(timestamp ?? "");
  return !Number.isFinite(age) || age < -5 * 60_000 || age > minutes * 60_000;
}
function observationAge(timestamp: string | undefined, reference: number) {
  const age = reference - Date.parse(timestamp ?? "");
  if (!Number.isFinite(age) || age < -5 * 60_000) return "Observation time unavailable";
  const minutes = Math.max(0, Math.floor(age / 60_000));
  return minutes < 1 ? "Observed just now" : minutes < 60 ? `Observed ${minutes} min ago` : `Observed ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
function OrbitalMark() {
  return <svg viewBox="0 0 44 44" width="38" height="38" fill="none" aria-hidden="true"><circle cx="22" cy="22" r="7" fill="currentColor" /><ellipse cx="22" cy="22" rx="20" ry="9" transform="rotate(-42 22 22)" stroke="currentColor" strokeWidth="1.4" /><path d="M5 30C2 21 10 6 22 3" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 4" /><circle cx="34" cy="8" r="2.5" fill="currentColor" /></svg>;
}

function Atmosphere({ night, condition }: { night: boolean; condition: string }) {
  const cloudy = /cloud|overcast|rain|shower|storm|snow|fog/i.test(condition);
  const rainy = /rain|shower|storm/i.test(condition);
  return <div className={`${styles.atmosphere} ${night ? styles.nightSky : ""}`} aria-hidden="true">
    <div className={styles.celestial} />
    {night && <svg className={styles.stars} viewBox="0 0 600 300"><g fill="currentColor">{[[65,48],[155,85],[228,30],[360,70],[470,26],[526,118],[295,119],[97,155],[399,150],[548,54]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} />)}</g></svg>}
    {cloudy && <><div className={styles.cloudOne} /><div className={styles.cloudTwo} /></>}
    {rainy && <div className={styles.rain} />}
    <svg className={styles.horizon} viewBox="0 0 800 180" preserveAspectRatio="none"><path d="M0 120 Q160 10 355 105 T800 95 V180 H0Z" fill="currentColor" opacity=".28" /><path d="M0 153 Q150 90 340 138 T800 104 V180 H0Z" fill="currentColor" opacity=".5" /><path d="M0 169 Q230 128 465 164 T800 140 V180 H0Z" fill="currentColor" /></svg>
  </div>;
}

export function WeatherObservatory(props: Props) {
  const { data, intelligence, regionalAviation, now, mounted, loading, error, online, offlineSnapshot, refreshKey, isFullscreen } = props;
  const [selection, setSelection] = useState<{ mode: DisplayMode; view: View }>(() => ({ mode: props.displayMode, view: preferredView(props.displayMode) }));
  const [ambient, setAmbient] = useState(false);
  const [tour, setTour] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const zone = data?.location.timeZone ?? "UTC";
  const minute = Math.floor(now.getTime() / 60_000);
  const hasData = Boolean(data);
  const stale = Boolean(data && oldTimestamp(data.fetchedAt, minute * 60_000, 20));
  const degraded = !online || offlineSnapshot || Boolean(error) || stale;
  const activeAlerts = useMemo(() => (data?.alerts ?? []).filter(alert => !Number.isFinite(Date.parse(alert.expires)) || Date.parse(alert.expires) > minute * 60_000), [data?.alerts, minute]);
  const story = useMemo(() => {
    if (!data) return null;
    const result = buildWeatherStory(degraded ? { ...data, alertFeedAvailable: false } : data, intelligence, new Date(minute * 60_000));
    if (!degraded) return result;
    return {
      ...result,
      headline: activeAlerts.length ? `Saved alert: ${activeAlerts[0].event}` : "The weather picture needs a refresh.",
      summary: "This briefing uses the last received weather. Live conditions and alert status need to be checked again.",
      nextChange: null,
      outdoorWindow: null,
      insights: result.insights.map(insight => ({ ...insight, detail: `${insight.detail} · last received data` })),
    };
  }, [data, intelligence, minute, degraded, activeAlerts]);
  const days = useMemo(() => buildForecastDays(data?.daily ?? [], zone), [data, zone]);
  const hours = currentAndFutureHourlyPeriods(data?.hourly ?? [], now.getTime());
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now));
  const sunset = data?.astronomy.sunset ? Date.parse(data.astronomy.sunset) : NaN;
  const sunrise = data?.astronomy.sunrise ? Date.parse(data.astronomy.sunrise) : NaN;
  const night = Number.isFinite(sunrise) && Number.isFinite(sunset) ? now.getTime() < sunrise || now.getTime() >= sunset : localHour < 6 || localHour >= 20;
  const observed = data?.current;
  const feels = observed ? apparentTemperatureF(observed.temperatureF, observed.humidityPct, observed.windSpeedMph) : null;
  const alertsAvailable = Boolean(data?.alertFeedAvailable && !degraded);
  const observationLabel = observationAge(observed?.timestamp, minute * 60_000);
  const observationStale = Boolean(observed && oldTimestamp(observed.timestamp, minute * 60_000, 90));
  const intelligenceStale = Boolean(intelligence && oldTimestamp(intelligence.fetchedAt, minute * 60_000, 90));
  const airQualityStale = Boolean(intelligence?.airQuality && (intelligenceStale || oldTimestamp(intelligence.airQuality.observedAt, minute * 60_000, 90)));
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).formatToParts(now);
  const clockTime = clock.filter(part => part.type !== "dayPeriod").map(part => part.value).join("").trim();
  const dayPeriod = clock.find(part => part.type === "dayPeriod")?.value;
  const selectedForecast = days.find(day => day.key === selectedDay);
  const primaryView = selection.mode === props.displayMode ? selection.view : preferredView(props.displayMode);
  const compact = props.displayMode === "minimal";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setAmbient(localStorage.getItem("weatherguy-observatory-ambient") === "true");
        setTour(localStorage.getItem("weatherguy-observatory-tour") === "true");
      } catch { /* Optional preferences work without storage. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!tour || ambient || props.suspended || focusWithin || activeAlerts.length || !hasData) return;
    const timer = window.setTimeout(() => {
      setSelection({ mode: props.displayMode, view: VIEWS[(VIEWS.findIndex(item => item.id === primaryView) + 1) % VIEWS.length].id });
      window.scrollTo(0, 0);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [tour, ambient, props.suspended, focusWithin, activeAlerts.length, hasData, primaryView, props.displayMode]);

  function toggleAmbient() {
    setAmbient(!ambient);
    window.scrollTo(0, 0);
    try { localStorage.setItem("weatherguy-observatory-ambient", String(!ambient)); } catch { /* Session-only preference. */ }
  }
  function toggleTour() {
    setTour(!tour);
    try { localStorage.setItem("weatherguy-observatory-tour", String(!tour)); } catch { /* Session-only preference. */ }
  }
  function selectView(next: View) {
    window.scrollTo(0, 0);
    setSelection({ mode: props.displayMode, view: next });
    setAmbient(false);
    try { localStorage.setItem("weatherguy-observatory-ambient", "false"); } catch { /* Session-only preference. */ }
  }

  const radar = data && <ObservatoryRadar latitude={data.location.latitude} longitude={data.location.longitude} station={data.location.radarStation} timeZone={zone} alerts={data.alerts} refreshKey={refreshKey} initialLabMode />;
  const condition = observed?.description || hours[0]?.shortForecast || "Waiting for observations";
  const locationName = props.customLabel || data?.location.city || "Your home observatory";

  return <div className={`${styles.observatory} ${ambient ? styles.ambientMode : ""}`} data-observatory-view={ambient ? "ambient" : primaryView} onFocusCapture={() => setFocusWithin(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false); }}>
    <header className={styles.header}>
      <button className={styles.brand} onClick={() => selectView("overview")} aria-label="wxDynamics observatory overview"><OrbitalMark /><span>wx<span>Dynamics</span><small>THE HOME OBSERVATORY</small></span></button>
      <nav className={styles.navigation} aria-label="Observatory views">{VIEWS.map(item => <button key={item.id} aria-current={!ambient && primaryView === item.id ? "page" : undefined} onClick={() => selectView(item.id)}>{item.label}</button>)}</nav>
      <div className={styles.headerTools}>
        <button className={styles.classicButton} onClick={props.onClassic} title="Open the original weather desk">Classic desk <ArrowRight size={13} /></button>
        <button className={styles.toolButton} onClick={props.onSettings} title="Settings and location" aria-label="Open settings"><Settings2 size={18} /></button>
        <button className={styles.toolButton} onClick={event => { if (event.detail > 0) event.currentTarget.blur(); props.onFullscreen(); }} title={isFullscreen ? "Exit fullscreen" : "Open fullscreen wallboard"} aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen wallboard"}>{isFullscreen ? <Minimize size={18} /> : <Expand size={18} />}</button>
      </div>
    </header>

    <div className={styles.locationRow}>
      <div className={styles.locationTitle}><span className={styles.eyebrow}>{night ? "UNDER THE NIGHT SKY" : localHour < 12 ? "A NEW DAY OUTSIDE" : "YOUR CORNER OF THE ATMOSPHERE"}</span><button onClick={props.onSettings}><h1>{locationName}</h1><ChevronDown size={19} /></button><span className={styles.coordinates}>{data ? `${data.location.state} · ${Math.abs(data.location.latitude).toFixed(2)}° ${data.location.latitude < 0 ? "S" : "N"} / ${Math.abs(data.location.longitude).toFixed(2)}° ${data.location.longitude < 0 ? "W" : "E"}` : "A little closer to the world outside."}</span></div>
      <div className={styles.clock}><span suppressHydrationWarning>{mounted ? new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(now) : ""}</span><strong suppressHydrationWarning>{mounted ? clockTime : "—"}<small>{mounted ? dayPeriod : ""}</small></strong></div>
    </div>

    {(degraded || (data && !alertsAvailable)) && <div className={styles.alertBanner} role="status"><ShieldAlert size={18} /><span>{!online ? "Offline · showing the last received weather." : offlineSnapshot ? "Saved weather snapshot · live updates unavailable." : error ? error : stale ? "Weather is getting old · reconnecting to live feeds." : "NWS alert status unavailable."}</span><button onClick={props.onRefresh}>Refresh <RefreshCw size={13} /></button></div>}
    {activeAlerts.length > 0 && <div className={styles.alertDetails}>{activeAlerts.map(alert => <details key={alert.id}><summary><ShieldAlert size={15} />{alertsAvailable ? "Active" : "Saved"} · {alert.event}<span>Read advisory<ChevronDown size={14} /></span></summary><p>{alert.headline}</p><p>{alert.description}</p>{alert.instruction && <p><strong>{alert.instruction}</strong></p>}<small>{Number.isFinite(Date.parse(alert.expires)) ? `Expires ${new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(alert.expires))}` : "Expiration time unavailable"}</small></details>)}</div>}

    {!data ? <div className={styles.emptyState}><Atmosphere night={night} condition="partly cloudy" /><Telescope size={40} /><h2>{loading ? "Finding your place in the sky." : error ? "Waiting for the weather." : "The world outside, brought inside."}</h2><p>{loading ? "Connecting your local observations, forecasts, and radar." : error || "Choose a location to bring your observatory to life."}</p><button className={styles.actionButton} onClick={error ? props.onRefresh : props.onSettings}>{error ? "Try again" : "Choose your location"}<ArrowRight size={16} /></button></div> : <>
      {ambient ? <section className={styles.ambientScene} aria-label="Ambient weather display"><Atmosphere night={night} condition={condition} /><div className={styles.ambientReading}><WeatherIcon condition={condition} isDaytime={!night} size={48} /><strong>{number(observed?.temperatureF, "°")}</strong><h2>{condition}</h2><p>{story?.headline}</p><span>Feels like {number(feels, "°")} · Wind {number(observed?.windSpeedMph, " mph")} · {observationLabel}</span></div><div className={styles.ambientSun}><DaylightArc astronomy={data.astronomy} now={now} timeZone={zone} /></div></section> : <>
        {primaryView === "overview" && <>
          <div className={styles.heroGrid}>
            <section className={`${styles.card} ${styles.conditions}`} aria-label="Current weather"><Atmosphere night={night} condition={condition} /><div className={styles.conditionTop}><span className={styles.eyebrow}><i className={`${styles.statusDot} ${degraded || observationStale ? styles.warningDot : ""}`} />{degraded || observationStale ? "LAST RECEIVED OBSERVATION" : "OUTSIDE RIGHT NOW"}</span><WeatherIcon condition={condition} isDaytime={!night} size={34} /></div><div className={styles.temperatureRow}><strong className={styles.temperature}>{number(observed?.temperatureF)}<sup>°</sup></strong><div><h2>{condition}</h2><span>Feels like {number(feels, "°")}</span><p><ArrowUp size={13} />{number(days[0]?.highF, "°")}<ArrowDown size={13} />{number(days[0]?.lowF, "°")}</p></div></div><div className={styles.briefing}><span className={styles.eyebrow}><Compass size={13} /> THE WEATHER STORY</span><h3>{story?.headline}</h3><p>{story?.summary}</p></div><span className={styles.observationSource}>{data.current.source} · {data.location.stationId} · {observationLabel}</span></section>
            <section className={`${styles.card} ${styles.radarCard}`} aria-label="Local radar"><div className={styles.cardHeading}><h2><Radio size={16} />The regional picture</h2><button onClick={() => selectView("maps")}>Explore maps <ArrowRight size={14} /></button></div><div className={styles.overviewRadar}>{radar}</div><div className={styles.mapCaption}><span><i className={styles.statusDot} />NEXRAD · {data.location.radarStation}</span><span>NOAA / National Weather Service</span></div></section>
          </div>
          <div className={styles.metrics}>
            <div><Wind size={19} /><span>Wind<strong>{number(observed?.windSpeedMph)}<small> mph</small></strong><em>{observed?.windGustMph ? `Gusts ${number(observed.windGustMph)} mph` : direction(observed?.windDirectionDeg ?? null)}</em></span></div>
            <div><Droplets size={19} /><span>Humidity<strong>{number(observed?.humidityPct)}<small>%</small></strong><em>Dew point {number(observed?.dewpointF, "°")}</em></span></div>
            <div><Gauge size={19} /><span>Pressure<strong>{number(observed?.pressureInHg, "", 2)}<small> inHg</small></strong><em>Station observation</em></span></div>
            <div><Leaf size={19} /><span>Air quality<strong>{number(intelligence?.airQuality?.aqi)}<small> US AQI</small></strong><em>{airQualityStale ? "Saved · " : ""}{intelligence?.airQuality?.category ?? "Awaiting air quality"}</em></span></div>
            <div><Sun size={19} /><span>UV index<strong>{number(intelligence?.forecast?.currentUvIndex, "", 1)}</strong><em>{intelligenceStale ? "Saved model · " : ""}{intelligence?.forecast?.currentUvCategory ?? "Awaiting UV model"}</em></span></div>
            <div><Plane size={19} /><span>Flight conditions<strong className={styles.flightValue}>{data.aviation?.flightCategory ?? "—"}</strong><em>{data.location.stationId} · {number(observed?.visibilityMiles, " mi visibility", 0)}</em></span></div>
          </div>
          {!compact && <div className={styles.insightGrid}>
            <section className={`${styles.card} ${styles.timelineCard}`}><div className={styles.cardHeading}><h2>The hours ahead</h2><span>Temperature / rain chance</span></div><WeatherRibbon periods={data.hourly} now={now} timeZone={zone} /></section>
            <section className={`${styles.card} ${styles.daylightCard}`}><div className={styles.cardHeading}><h2><Sun size={15} />Chasing daylight</h2></div><DaylightArc astronomy={data.astronomy} now={now} timeZone={zone} /></section>
            <section className={`${styles.card} ${styles.nextCard}`}><div className={styles.cardHeading}><h2><Compass size={15} />Worth a little planning</h2></div>{story?.outdoorWindow ? <><span className={styles.nextKicker}>YOUR OUTSIDE WINDOW</span><strong>{story.outdoorWindow.timeLabel}</strong><p>{story.outdoorWindow.detail}</p></> : story?.nextChange ? <><span className={styles.nextKicker}>NEXT CHANGE · {story.nextChange.timeLabel}</span><strong>{story.nextChange.title}</strong><p>{story.nextChange.detail}</p></> : <><span className={styles.nextKicker}>THE NEAR-TERM OUTLOOK</span><strong>{story?.insights[0]?.value ?? "Waiting for a clearer picture"}</strong><p>{story?.insights[0]?.detail ?? "More forecast data will fill in the day ahead."}</p></>}<button onClick={() => selectView("outlook")}>Look a little further <ArrowRight size={14} /></button></section>
          </div>}
        </>}

        {primaryView === "maps" && <div className={styles.mapsView}><section className={`${styles.card} ${styles.largeRadar}`}><div className={styles.cardHeading}><h2><Radio size={17} />Ground radar</h2><span>{data.location.radarStation} · NWS NEXRAD</span></div>{radar}</section><section className={`${styles.card} ${styles.satelliteCard}`}><div className={styles.cardHeading}><h2>From 22,000 miles above</h2><span>NOAA GOES</span></div><ObservatorySatellite latitude={data.location.latitude} longitude={data.location.longitude} refreshKey={refreshKey} /></section><div className={styles.mapsNote}><Compass size={16} />Radar shows precipitation. Satellite reveals the bigger cloud story. Switch products to explore wind, lightning, water vapor, and more.</div></div>}

        {primaryView === "outlook" && <div className={styles.outlookView}><section className={`${styles.card} ${styles.outlookRibbon}`}><div className={styles.cardHeading}><h2>A day in the atmosphere</h2><span>Select an hour to explore</span></div><WeatherRibbon periods={data.hourly} now={now} timeZone={zone} compact={false} /></section><div className={styles.outlookStories}>{story?.insights.map(insight => <article className={styles.card} key={insight.label}><span className={styles.eyebrow}>{insight.label}</span><h3>{insight.value}</h3><p>{insight.detail}</p></article>)}</div><div className={styles.discussionGrid}><section className={`${styles.card} ${styles.discussion}`}><div className={styles.cardHeading}><h2>The forecaster’s notebook</h2><span>NWS {data.location.wfo}</span></div><p>{data.discussion?.summary ?? "The local forecast discussion is currently unavailable."}</p>{data.discussion && <details><summary>Read the full forecast discussion <ChevronDown size={14} /></summary><pre>{data.discussion.raw}</pre><a href={data.discussion.sourceUrl} target="_blank" rel="noreferrer">Open official NWS discussion <ArrowRight size={14} /></a></details>}</section><div className={styles.observationPanel}><ObservationContext data={data} regional={regionalAviation} mode={props.displayMode} /></div></div></div>}
        {primaryView === "intelligence" && <div className={styles.specialistView}><div className={styles.sectionIntro}><span className={styles.eyebrow}>THE BIGGER PICTURE</span><h2>A little more situational awareness.</h2><p>Forecast signals, severe weather, air quality, and the world beyond your local sky.</p></div>{props.intelligenceUnavailable && <p role="status" className={styles.unavailable}>Intelligence feeds are currently unavailable. Core weather continues to update.</p>}<IntelligenceGrid data={intelligence} timeZone={zone} /></div>}
        {primaryView === "aviation" && <div className={`${styles.specialistView} mode-aviation`}><div className={styles.sectionIntro}><span className={styles.eyebrow}>THE FLIGHT DECK</span><h2>Eyes on the airspace.</h2><p>METAR, TAF, nearby airports, and regional hazards for {data.location.label}.</p></div>{props.aviationUnavailable && <p role="status" className={styles.unavailable}>Regional aviation feeds are currently unavailable.</p>}<AviationConsole data={data} intelligence={intelligence} regional={regionalAviation} /></div>}

        {(primaryView === "overview" || primaryView === "outlook") && !compact && <section className={styles.week} aria-label="Seven-day forecast"><div className={styles.weekHeading}><h2>A little further ahead</h2><span>Daily high / low · NWS forecast</span></div><div className={styles.weekDays}>{days.map((day, index) => <button key={day.key} onClick={() => setSelectedDay(selectedDay === day.key ? null : day.key)} aria-expanded={selectedDay === day.key} className={selectedDay === day.key ? styles.selectedDay : ""}><span>{index === 0 ? day.isDaytime ? "Today" : "Tonight" : day.label.replace(" Night", "")}</span><WeatherIcon condition={day.shortForecast} isDaytime={day.isDaytime} chancePct={day.precipitationPct} size={25} /><strong>{number(day.highF, "°")}<small>{number(day.lowF, "°")}</small></strong><em><Droplets size={11} />{number(day.precipitationPct, "%")}</em></button>)}</div>{!days.length && <p className={styles.unavailable}>The daily forecast is currently unavailable.</p>}{selectedForecast && <div className={styles.dayDetail}><span><strong>{selectedForecast.label} · {selectedForecast.dateLabel}</strong>{selectedForecast.detailedForecast}</span><button onClick={() => setSelectedDay(null)} aria-label="Close daily forecast"><X size={17} /></button></div>}</section>}
      </>}
    </>}

    <footer className={styles.footer}><div className={styles.feedStatus}>{alertsAvailable && !activeAlerts.length ? <ShieldCheck size={15} /> : activeAlerts.length ? <ShieldAlert size={15} /> : <Radio size={15} />}<span>{!data ? "Connecting to your local sky" : degraded ? "Updates interrupted" : activeAlerts.length ? `${activeAlerts.length} NWS alert${activeAlerts.length > 1 ? "s" : ""}` : alertsAvailable ? "No active NWS alerts" : "NWS alerts unavailable"}</span><span className={styles.sourceText}>{story?.updatedLabel} · NOAA / NWS{data?.notices.length || intelligence?.notices.length || regionalAviation?.notices.length || props.intelligenceUnavailable || props.aviationUnavailable ? " · Some products unavailable" : intelligenceStale || airQualityStale ? " · Saved environment readings" : ""}</span></div><div className={styles.footerTools}>{props.favorites.length > 1 && <select value={props.favorites.find(favorite => favorite.latitude === data?.location.latitude && favorite.longitude === data?.location.longitude)?.id ?? ""} onChange={event => { const favorite = props.favorites.find(item => item.id === event.target.value); if (favorite) props.onFavorite(favorite); }} aria-label="Switch saved location"><option value="" disabled>Saved places</option>{props.favorites.map(favorite => <option key={favorite.id} value={favorite.id}>{favorite.label}</option>)}</select>}<button onClick={event => { toggleTour(); if (event.detail > 0) event.currentTarget.blur(); }} aria-pressed={tour} title="Cycle through views every minute; pauses while a control has focus or an alert is active">{tour ? <Pause size={13} /> : <Play size={13} />}<span>{tour ? "Pause tour" : "Auto tour"}</span></button><button onClick={event => props.onCompare(event.currentTarget)} disabled={!data}><Columns2 size={14} /><span>Compare</span></button><button onClick={toggleAmbient} aria-pressed={ambient}><Moon size={14} /><span>{ambient ? "Full observatory" : "Ambient"}</span></button><button onClick={props.onRefresh} disabled={loading} aria-label="Refresh weather data" title="Refresh weather data"><RefreshCw size={14} className={loading ? "spin" : ""} /></button></div></footer>
    {(data?.notices.length || intelligence?.notices.length || regionalAviation?.notices.length || intelligenceStale || airQualityStale) ? <details className={styles.feedNotes}><summary>Feed notes <ChevronDown size={12} /></summary>{[...(data?.notices ?? []), ...(intelligence?.notices ?? []), ...(regionalAviation?.notices ?? [])].map((notice, index) => <p key={index}>{notice}</p>)}{(intelligenceStale || airQualityStale) && <p>Environment readings are more than 90 minutes old or their reporting time is unavailable. Saved values remain visible while fresh data is acquired.</p>}</details> : null}
  </div>;
}
