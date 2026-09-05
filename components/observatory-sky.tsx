"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Droplet, Moon, Sunrise, Sunset, Wind } from "lucide-react";
import type { Astronomy, HourlyPeriod } from "@/lib/types";
import { currentAndFutureHourlyPeriods } from "@/lib/weather-display";
import { WeatherIcon } from "./weather-icon";
import styles from "./observatory-sky.module.css";

function clockLabel(value: number | string, timeZone: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDate(value: number, timeZone: string) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone });
}

function durationLabel(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${minutes}m`;
}

export function DaylightArc({
  astronomy,
  now,
  timeZone,
  compact = true,
}: {
  astronomy: Astronomy;
  now: Date;
  timeZone: string;
  compact?: boolean;
}) {
  const gradientId = `daylight-${useId().replaceAll(":", "")}`;
  const sunrise = astronomy.sunrise ? Date.parse(astronomy.sunrise) : NaN;
  const sunset = astronomy.sunset ? Date.parse(astronomy.sunset) : NaN;
  const reference = now.getTime();
  const valid = Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise;
  const today = valid && localDate(sunrise, timeZone) === localDate(reference, timeZone);
  const daytime = today && reference >= sunrise && reference < sunset;
  const beforeSunrise = valid && reference < sunrise;
  const night = today && reference >= sunset;
  const progress = daytime ? (reference - sunrise) / (sunset - sunrise) : night ? 1 : 0;
  const angle = Math.PI * (1 - progress);
  const sunX = 160 + 116 * Math.cos(angle);
  const sunY = 144 - 116 * Math.sin(angle);
  const headline = daytime
    ? durationLabel(sunset - reference)
    : beforeSunrise
      ? durationLabel(sunrise - reference)
      : night
        ? "After sunset"
        : "Sun & horizon";
  const caption = daytime
    ? "of daylight left"
    : beforeSunrise
      ? "until sunrise"
      : night
        ? "The day has given way to night."
        : valid
          ? "Updated solar times are pending."
          : "Solar times are unavailable.";
  const dateLabel = valid && !today
    ? new Date(sunrise).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })
    : "Today";

  return (
    <div className={`${styles.daylight} ${compact ? "" : styles.expanded}`}>
      <div className={styles.solarHeadline}>
        <span className={`${styles.solarValue} ${daytime || beforeSunrise ? styles.solarDuration : ""}`}>{headline}</span>
        <span className={styles.solarCaption}>{caption}</span>
      </div>
      <div className={styles.arcFrame}>
        <svg
          className={styles.arc}
          viewBox="0 0 320 174"
          role="img"
          aria-label={valid
            ? `${dateLabel}: sunrise ${clockLabel(sunrise, timeZone)}, sunset ${clockLabel(sunset, timeZone)}. ${headline} ${caption}`
            : "Sunrise and sunset times are unavailable"}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={daytime ? ".13" : ".035"} />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M44 144 A116 116 0 0 1 276 144 Z" fill={`url(#${gradientId})`} />
          <path className={styles.arcTrack} d="M44 144 A116 116 0 0 1 276 144" />
          {(daytime || night) && (
            <path
              className={`${styles.arcProgress} ${night ? styles.arcComplete : ""}`}
              d="M44 144 A116 116 0 0 1 276 144"
              pathLength="100"
              strokeDasharray={`${progress * 100} 100`}
            />
          )}
          <line className={styles.horizon} x1="20" y1="144" x2="300" y2="144" />
          <line className={styles.horizonTick} x1="44" y1="140" x2="44" y2="149" />
          <line className={styles.horizonTick} x1="276" y1="140" x2="276" y2="149" />
          <text className={styles.arcDirection} x="44" y="166" textAnchor="middle">E</text>
          <text className={styles.arcDirection} x="276" y="166" textAnchor="middle">W</text>
          {(daytime || (beforeSunrise && today)) && (
            <g transform={`translate(${sunX} ${sunY})`}>
              <circle className={styles.sunHalo} r="18" />
              <circle className={styles.sunCore} r="6" />
              {Array.from({ length: 8 }, (_, index) => (
                <line key={index} className={styles.sunRay} x1="0" y1="-10" x2="0" y2="-13" transform={`rotate(${index * 45})`} />
              ))}
            </g>
          )}
          {night && (
            <g className={styles.moonIllustration} transform="translate(148 72)">
              <Moon size={24} strokeWidth={1.4} aria-hidden="true" />
            </g>
          )}
          {valid && <text className={styles.arcDuration} x="160" y="126" textAnchor="middle">{durationLabel(sunset - sunrise)} daylight</text>}
        </svg>
      </div>
      <div className={styles.solarTimes}>
        <div><Sunrise size={16} aria-hidden="true" /><span>Sunrise<strong>{Number.isFinite(sunrise) ? clockLabel(sunrise, timeZone) : "—"}</strong></span></div>
        <div><Sunset size={16} aria-hidden="true" /><span>Sunset<strong>{Number.isFinite(sunset) ? clockLabel(sunset, timeZone) : "—"}</strong></span></div>
      </div>
      {valid && !today && <p className={styles.solarDate}>Solar times for {dateLabel}</p>}
    </div>
  );
}

export function WeatherRibbon({
  periods,
  now,
  timeZone,
  compact = true,
}: {
  periods: HourlyPeriod[];
  now: Date;
  timeZone: string;
  compact?: boolean;
}) {
  const gradientId = `temperature-${useId().replaceAll(":", "")}`;
  const detailId = `hour-detail-${useId().replaceAll(":", "")}`;
  const [horizon, setHorizon] = useState<12 | 24>(24);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const ordered = periods
    .filter((period) => Number.isFinite(period.temperatureF) && Number.isFinite(Date.parse(period.startTime)))
    .toSorted((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))
    .filter((period, index, sorted) => index === 0 || Date.parse(period.startTime) !== Date.parse(sorted[index - 1].startTime));
  const upcoming = currentAndFutureHourlyPeriods(ordered, now.getTime(), 24);
  const hours = upcoming.filter((period) => Date.parse(period.startTime) < now.getTime() + horizon * 3_600_000).slice(0, horizon);

  if (!hours.length) {
    return <div className={styles.empty}>The hourly forecast is unavailable. New forecast data will appear here when it returns.</div>;
  }

  const slotCount = Math.min(8, hours.length);
  const firstTime = Date.parse(hours[0].startTime);
  const lastTime = Date.parse(hours[hours.length - 1].startTime);
  const timeSpan = lastTime - firstTime;
  // Sample the time axis, preserving real gaps in the forecast and leaving room for labels.
  const sampleIndices: number[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const target = slotCount === 1 ? firstTime : firstTime + timeSpan * slot / (slotCount - 1);
    const closest = hours.reduce((best, hour, index) =>
      Math.abs(Date.parse(hour.startTime) - target) < Math.abs(Date.parse(hours[best].startTime) - target) ? index : best,
    0);
    const previous = sampleIndices.at(-1);
    if (previous === undefined || (closest !== previous && Date.parse(hours[closest].startTime) - Date.parse(hours[previous].startTime) >= timeSpan / Math.max(1, slotCount - 1) * .75)) {
      sampleIndices.push(closest);
    }
  }
  if (sampleIndices.at(-1) !== hours.length - 1) {
    if (sampleIndices.length > 1 && lastTime - Date.parse(hours[sampleIndices.at(-1)!].startTime) < timeSpan / Math.max(1, slotCount - 1) * .75) sampleIndices.pop();
    sampleIndices.push(hours.length - 1);
  }
  const selectedIndex = Math.max(0, hours.findIndex((hour) => hour.startTime === selectedTime));
  const selected = hours[selectedIndex];
  const temperatures = hours.map((hour) => hour.temperatureF);
  const low = Math.min(...temperatures);
  const high = Math.max(...temperatures);
  const range = Math.max(8, high - low + 6);
  const mid = (low + high) / 2;
  const sidePadding = 400 / slotCount;
  const points = hours.map((hour) => ({
    x: hours.length === 1 ? 400 : sidePadding + (Date.parse(hour.startTime) - firstTime) / (lastTime - firstTime) * (800 - sidePadding * 2),
    y: 66 - (hour.temperatureF - mid) / range * 102,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x} 130 L${points[0].x} 130 Z`;
  const selectedPoint = points[selectedIndex];
  const selectedLabel = new Date(selected.startTime).toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  function navigateHours(event: KeyboardEvent<HTMLButtonElement>, slot: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? sampleIndices.length - 1 : (slot + direction + sampleIndices.length) % sampleIndices.length;
    setSelectedTime(hours[sampleIndices[next]].startTime);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
  }

  return (
    <div className={`${styles.ribbon} ${compact ? "" : styles.expanded}`}>
      <div className={styles.ribbonToolbar}>
        <span className={styles.chartCaption}>TEMPERATURE <span>°F</span></span>
        <div className={styles.horizonControl} aria-label="Forecast time range">
          {([12, 24] as const).map((value) => (
            <button key={value} type="button" aria-pressed={horizon === value} onClick={() => setHorizon(value)}>{value} hours</button>
          ))}
        </div>
      </div>
      <svg className={styles.temperaturePlot} viewBox="0 0 800 132" preserveAspectRatio="none" role="img" aria-label={`Hourly temperature forecast, low ${low} degrees Fahrenheit, high ${high} degrees Fahrenheit.`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[30, 80, 130].map((y) => <line key={y} className={styles.chartGrid} x1="0" y1={y} x2="800" y2={y} />)}
        <path d={area} fill={`url(#${gradientId})`} />
        <path className={styles.temperatureLine} d={line} />
        <line className={styles.selectionLine} x1={selectedPoint.x} y1="4" x2={selectedPoint.x} y2="132" />
        <circle className={styles.selectionHalo} cx={selectedPoint.x} cy={selectedPoint.y} r="10" />
        <circle className={styles.selectionDot} cx={selectedPoint.x} cy={selectedPoint.y} r="4" />
      </svg>
      <div className={styles.hourButtons} aria-label="Explore the hourly forecast">
        {sampleIndices.map((periodIndex, slot) => {
          const hour = hours[periodIndex];
          const timestamp = Date.parse(hour.startTime);
          const isNow = timestamp <= now.getTime() && timestamp + 3_600_000 > now.getTime();
          const hourLabel = isNow ? "Now" : new Date(timestamp).toLocaleTimeString("en-US", { timeZone, hour: "numeric" }).replace(" ", "").toLowerCase();
          return (
            <button
              key={hour.startTime}
              type="button"
              className={styles.hourButton}
              style={{ left: `${points[periodIndex].x / 8}%`, width: `${100 / slotCount}%` }}
              aria-pressed={selectedIndex === periodIndex}
              aria-controls={detailId}
              aria-label={`${new Date(timestamp).toLocaleString("en-US", { timeZone, weekday: "short", hour: "numeric" })}: ${hour.temperatureF} degrees Fahrenheit, ${hour.shortForecast}, ${hour.precipitationPct === null ? "precipitation chance unavailable" : `${hour.precipitationPct}% chance of precipitation`}`}
              onClick={() => setSelectedTime(hour.startTime)}
              onKeyDown={(event) => navigateHours(event, slot)}
            >
              <span className={styles.hourTemperature}>{Math.round(hour.temperatureF)}°</span>
              <span className={styles.hourLabel}>{hourLabel}</span>
              <WeatherIcon condition={hour.shortForecast} isDaytime={hour.isDaytime} chancePct={hour.precipitationPct} size={22} strokeWidth={1.4} />
              <span className={`${styles.rainChance} ${hour.precipitationPct !== null && hour.precipitationPct >= 30 ? styles.rainLikely : ""}`}><Droplet size={10} aria-hidden="true" />{hour.precipitationPct === null ? "—" : `${hour.precipitationPct}%`}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.hourDetail} id={detailId} aria-live="polite" aria-atomic="true">
        <div className={styles.detailCondition}><span>{selectedLabel}</span><strong>{selected.shortForecast || "Conditions unavailable"}</strong></div>
        <span className={styles.detailWind}><Wind size={14} aria-hidden="true" />{selected.windDirection} {selected.windSpeed || "Wind unavailable"}</span>
      </div>
    </div>
  );
}
