"use client";

import { useId, useMemo } from "react";
import type { HourlyPeriod } from "@/lib/types";
import styles from "./comparison-trend.module.css";

const HOUR_MS = 3_600_000;
const WINDOW_MS = 24 * HOUR_MS;

type ForecastPoint = { time: number; temperature: number };

export type ComparisonTrendProps = {
  primary: HourlyPeriod[];
  secondary: HourlyPeriod[];
  now: Date;
  primaryTimeZone: string;
  secondaryTimeZone: string | null;
};

function forecastPoints(periods: HourlyPeriod[], start: number) {
  return periods
    .map((period) => ({ time: Date.parse(period.startTime), temperature: period.temperatureF }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.temperature) && point.time >= start && point.time <= start + WINDOW_MS)
    .toSorted((left, right) => left.time - right.time)
    .filter((point, index, sorted) => index === 0 || point.time !== sorted[index - 1].time);
}

function splitAtGaps(points: ForecastPoint[]) {
  const segments: ForecastPoint[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || point.time - previous.time > HOUR_MS * 1.1) {
      segments.push([point]);
    } else {
      current.push(point);
    }
  }
  return segments;
}

function temperatureRange(points: ForecastPoint[]) {
  return points.length
    ? `${Math.round(Math.min(...points.map((point) => point.temperature)))}–${Math.round(Math.max(...points.map((point) => point.temperature)))}°`
    : "unavailable";
}

function localClock(time: number, start: number, timeZone: string) {
  const clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(new Date(time)).replace(" AM", "a").replace(" PM", "p");
  const day = new Date(time).toLocaleDateString("en-CA", { timeZone });
  const startDay = new Date(start).toLocaleDateString("en-CA", { timeZone });
  return day === startDay ? clock : `${new Date(time).toLocaleDateString("en-US", { timeZone, weekday: "short" })} ${clock}`;
}

export function ComparisonTrend({
  primary,
  secondary,
  now,
  primaryTimeZone,
  secondaryTimeZone,
}: ComparisonTrendProps) {
  const id = `comparison-trend-${useId().replaceAll(":", "")}`;
  const start = Math.floor(now.getTime() / 60_000) * 60_000;
  const { pointsA, pointsB, combined, bottom, top, rangeA, rangeB, series, description } = useMemo(() => {
    const pointsA = forecastPoints(primary, start);
    const pointsB = forecastPoints(secondary, start);
    const combined = [...pointsA, ...pointsB];
    const values = combined.map((point) => point.temperature);
    const bottom = combined.length ? Math.floor((Math.min(...values) - 2) / 5) * 5 : 0;
    const top = combined.length ? Math.ceil((Math.max(...values) + 2) / 5) * 5 : 10;
    const y = (temperature: number) => 3 + (top - temperature) / (top - bottom) * 46;
    const x = (time: number) => 3 + (time - start) / WINDOW_MS * 794;
    const rangeA = temperatureRange(pointsA);
    const rangeB = temperatureRange(pointsB);
    const series = [
      { points: pointsA, className: styles.lineA, side: "A" },
      { points: pointsB, className: styles.lineB, side: "B" },
    ].map(({ points, ...attributes }) => ({
      ...attributes,
      segments: splitAtGaps(points).map((segment) => ({
        time: segment[0].time,
        point: segment.length === 1 ? { x: x(segment[0].time), y: y(segment[0].temperature) } : null,
        path: segment.map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(2)} ${y(point.temperature).toFixed(2)}`).join(" "),
      })),
    }));
    const description = [
      "Temperature forecasts for the next 24 hours, using one shared Fahrenheit scale and the same absolute time axis.",
      pointsA.length ? `Location A: ${pointsA.length} hourly forecast values, ${rangeA} Fahrenheit, shown in peach.` : "Location A forecast is unavailable.",
      pointsB.length ? `Location B: ${pointsB.length} hourly forecast values, ${rangeB} Fahrenheit, shown as a dashed lavender line.` : "Location B forecast is unavailable.",
      "Gaps indicate missing hourly forecasts. Each pair of A and B clock labels represents the same moment in their respective local time zones.",
    ].join(" ");
    return { pointsA, pointsB, combined, bottom, top, rangeA, rangeB, series, description };
  }, [primary, secondary, start]);
  const clockLabels = useMemo(() => [0, .5, 1].map((fraction) => {
    const time = start + fraction * WINDOW_MS;
    return {
      time,
      iso: new Date(time).toISOString(),
      primary: localClock(time, start, primaryTimeZone),
      secondary: secondaryTimeZone ? localClock(time, start, secondaryTimeZone) : null,
    };
  }), [start, primaryTimeZone, secondaryTimeZone]);

  return (
    <div className={styles.trend}>
      <div className={styles.heading}>
        <span className={styles.label}>24-hour temperature <span>°F</span></span>
        <div className={styles.legend} aria-label="Forecast temperature ranges">
          <span className={styles.legendItem}><i className={styles.swatchA} aria-hidden="true" /><b>A</b><span className={pointsA.length ? undefined : styles.missing}>{rangeA}</span></span>
          <span className={styles.legendItem}><i className={styles.swatchB} aria-hidden="true" /><b>B</b><span className={pointsB.length ? undefined : styles.missing}>{rangeB}</span></span>
        </div>
      </div>
      {combined.length === 0 ? (
        <p className={styles.empty}>Hourly forecasts are unavailable for both locations.</p>
      ) : (
        <>
          <div className={styles.plotFrame}>
            <div className={styles.scale} aria-hidden="true"><span>{top}°</span><span>{bottom}°</span></div>
            <svg className={styles.plot} viewBox="0 0 800 52" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title ${id}-description`}>
              <title id={`${id}-title`}>24-hour temperature comparison</title>
              <desc id={`${id}-description`}>{description}{secondaryTimeZone ? "" : " Location B local time is unavailable."}</desc>
              {[3, 26, 49].map((lineY) => <line key={lineY} className={styles.gridLine} x1="0" x2="800" y1={lineY} y2={lineY} />)}
              {[0, .5, 1].map((fraction) => <line key={fraction} className={styles.timeGuide} x1={3 + fraction * 794} x2={3 + fraction * 794} y1="0" y2="52" />)}
              {series.map(({ segments, className, side }) => (
                <g key={side} className={className}>
                  {segments.map((segment) => segment.point ? (
                    <circle className={styles.singlePoint} key={segment.time} cx={segment.point.x} cy={segment.point.y} r="2.5" />
                  ) : (
                    <path key={segment.time} d={segment.path} />
                  ))}
                </g>
              ))}
            </svg>
          </div>
          <div className={styles.clockAxis} aria-label="Local times at the start, middle, and end of the forecast window">
            {clockLabels.map((clock) => (
              <div className={styles.clockPair} key={clock.time}>
                <span><b className={styles.clockA}>A</b><time dateTime={clock.iso}>{clock.primary}</time></span>
                {clock.secondary && <span><b className={styles.clockB}>B</b><time dateTime={clock.iso}>{clock.secondary}</time></span>}
              </div>
            ))}
            {!secondaryTimeZone && <span className={styles.clockUnavailable}>B local time unavailable</span>}
          </div>
        </>
      )}
    </div>
  );
}
