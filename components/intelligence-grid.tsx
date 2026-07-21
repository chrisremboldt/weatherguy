"use client";

import { Activity, ChevronRight, CloudSun, Flame, Leaf, Radio, ShipWheel, Sparkles, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import type { IntelligenceData } from "@/lib/types";

function value(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

function timeRange(start: string, end: string, timeZone: string) {
  const format = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric" }).format(new Date(iso));
  return `${format(start)}–${format(end)}`;
}

export function IntelligenceGrid({ latitude, longitude, timeZone, refreshKey }: { latitude: number; longitude: number; timeZone: string; refreshKey: number }) {
  const [data, setData] = useState<IntelligenceData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/intelligence?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as IntelligenceData;
        if (!response.ok) throw new Error("Intelligence feeds are unavailable.");
        setData(payload);
      })
      .catch(() => setData(null));
    return () => controller.abort();
  }, [latitude, longitude, refreshKey]);

  const forecast = data?.forecast;
  const aqi = data?.airQuality;
  const quake = data?.earthquake;
  const space = data?.spaceWeather;

  return (
    <section className="intelligence-grid" aria-label="Weather intelligence modules">
      <article className="panel signal-panel">
        <div className="panel-heading compact">
          <div><span className="eyebrow">Decision weather</span><h2>Forecast signals</h2></div>
          <CloudSun size={20} aria-hidden="true" />
        </div>
        <div className="signal-matrix">
          <span><b>Feels like now</b><strong>{value(forecast?.hours[0]?.feelsLikeF, "°")}</strong></span>
          <span><b>Rain / 24h</b><strong>{value(forecast?.next24PrecipitationIn, '"')}</strong></span>
          <span><b>Rain / 72h</b><strong>{value(forecast?.next72PrecipitationIn, '"')}</strong></span>
          <span><b>Snow / 72h</b><strong>{value(forecast?.next72SnowfallIn, '"')}</strong></span>
          <span><b>Cloud peak</b><strong>{value(forecast?.peakCloudCoverPct, "%")}</strong></span>
          <span><b>Freezing level</b><strong>{forecast?.freezingLevelFt ? `${Math.round(forecast.freezingLevelFt).toLocaleString()} ft` : "—"}</strong></span>
        </div>
        <div className="best-window">
          <Sparkles size={16} />
          <span><b>Best outdoor window</b>{forecast?.bestOutdoorWindow ? timeRange(forecast.bestOutdoorWindow.start, forecast.bestOutdoorWindow.end, timeZone) : "No three-hour window meets the comfort filter"}</span>
        </div>
      </article>

      <article className="panel severe-center">
        <div className="panel-heading compact">
          <div><span className="eyebrow">National convective picture</span><h2>Storm center</h2></div>
          <a href={data?.links.spc ?? "https://www.spc.noaa.gov/products/outlook/"} target="_blank" rel="noreferrer">SPC outlook <ChevronRight size={14} /></a>
        </div>
        <div className="spc-stage">
          {/* SPC's operational outlook image updates in place throughout the day. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.spc.noaa.gov/products/outlook/day1otlk.png" alt="NOAA Storm Prediction Center Day 1 convective outlook" />
        </div>
        <div className="spc-links">
          <a href="https://www.spc.noaa.gov/products/outlook/day1probotlk.html" target="_blank" rel="noreferrer">Tornado / wind / hail</a>
          <a href="https://www.spc.noaa.gov/products/md/" target="_blank" rel="noreferrer">Mesoscale discussions</a>
          <a href="https://www.spc.noaa.gov/products/watch/" target="_blank" rel="noreferrer">Watches</a>
          <a href="https://www.spc.noaa.gov/climo/reports/today.html" target="_blank" rel="noreferrer">Storm reports</a>
        </div>
      </article>

      <article className="panel environment-panel">
        <div className="panel-heading compact">
          <div><span className="eyebrow">Air / earth / sun</span><h2>Environment</h2></div>
          <Activity size={20} />
        </div>
        <div className="environment-list">
          <div><Leaf size={17} /><span><b>Air quality</b>{aqi ? `${aqi.category} · PM2.5 ${value(aqi.pm25)}` : "Acquiring"}</span><strong className={`aqi-${aqi?.category.toLowerCase().replaceAll(" ", "-")}`}>{value(aqi?.aqi)}</strong></div>
          <div><Radio size={17} /><span><b>Space weather</b>{space?.category ?? "Acquiring"}</span><strong>Kp {value(space?.kp)}</strong></div>
          <div><Waves size={17} /><span><b>Nearest quake / 24h</b>{quake ? `${quake.place} · ${quake.distanceMiles} mi` : "No nearby report loaded"}</span><strong>{quake?.magnitude === null || quake?.magnitude === undefined ? "—" : `M${quake.magnitude}`}</strong></div>
        </div>
      </article>

      <article className="panel field-tools">
        <div className="panel-heading compact"><div><span className="eyebrow">Location-aware launchpad</span><h2>Field tools</h2></div></div>
        <div className="tool-links">
          <a href={data?.links.rivers ?? "https://water.noaa.gov/"} target="_blank" rel="noreferrer"><Waves size={18} /><span><b>Rivers & floods</b>NWPS gauges and stream forecasts</span><ChevronRight size={15} /></a>
          <a href={data?.links.buoys ?? "https://www.ndbc.noaa.gov/"} target="_blank" rel="noreferrer"><ShipWheel size={18} /><span><b>Buoys & marine</b>NDBC observations and wave state</span><ChevronRight size={15} /></a>
          <a href={data?.links.tropical ?? "https://www.nhc.noaa.gov/"} target="_blank" rel="noreferrer"><Activity size={18} /><span><b>Tropical</b>NHC tracks, cones, and discussions</span><ChevronRight size={15} /></a>
          <a href={data?.links.fire ?? "https://www.nifc.gov/fire-information/maps"} target="_blank" rel="noreferrer"><Flame size={18} /><span><b>Fire & smoke</b>NIFC incidents + GOES fire layer above</span><ChevronRight size={15} /></a>
        </div>
      </article>
    </section>
  );
}
