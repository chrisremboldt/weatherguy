"use client";

import { Pause, Play, Satellite, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SatelliteData, SatelliteProductId } from "@/lib/types";

const PRODUCTS: { id: SatelliteProductId; short: string; title: string }[] = [
  { id: "GEOCOLOR", short: "Color", title: "GeoColor day/night composite" },
  { id: "13", short: "IR", title: "Clean longwave infrared" },
  { id: "09", short: "Vapor", title: "Mid-level water vapor" },
  { id: "DayNightCloudMicroCombo", short: "Phase", title: "Day/night cloud phase" },
  { id: "EXTENT3", short: "GLM", title: "Geostationary Lightning Mapper density" },
  { id: "FireTemperature", short: "Fire", title: "Fire temperature RGB" },
  { id: "Dust", short: "Dust", title: "Dust RGB" },
];

function frameAge(iso: string, referenceIso: string) {
  const minutes = Math.max(0, Math.round((new Date(referenceIso).getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function SatelliteView({ latitude, longitude, refreshKey }: { latitude: number; longitude: number; refreshKey: number }) {
  const [product, setProduct] = useState<SatelliteProductId>("GEOCOLOR");
  const [data, setData] = useState<SatelliteData | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/satellite?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}&product=${product}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as SatelliteData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Satellite data is unavailable.");
        setData(payload);
        setFrameIndex(Math.max(0, payload.frames.length - 1));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [latitude, longitude, product, refreshKey]);

  useEffect(() => {
    if (!playing || !data || data.frames.length < 2) return;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % data.frames.length);
    }, 850);
    return () => window.clearInterval(timer);
  }, [data, playing]);

  const frame = data?.frames[Math.min(frameIndex, Math.max(0, data.frames.length - 1))];
  const stale = useMemo(() => frame && data ? new Date(data.fetchedAt).getTime() - new Date(frame.capturedAt).getTime() > 30 * 60_000 : false, [data, frame]);

  return (
    <div className="satellite-console">
      <div className="sensor-toolbar satellite-toolbar">
        <div className="product-tabs" aria-label="Satellite product">
          {PRODUCTS.map((item) => (
            <button key={item.id} className={product === item.id ? "active" : ""} onClick={() => { if (item.id !== product) { setLoading(true); setProduct(item.id); } }} title={item.title}>
              {item.short}
            </button>
          ))}
        </div>
      </div>
      <div className={`satellite-stage ${loading ? "is-loading" : ""}`}>
        {frame ? (
          <>
            {/* NOAA's five-minute source frames are intentionally loaded without image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame.url} alt={`${data?.satellite} ${data?.productLabel} view of ${data?.sectorLabel}`} />
            <span className="satellite-crosshair" aria-hidden="true"><i /><b /></span>
          </>
        ) : (
          <div className="radar-placeholder"><Satellite size={32} /><span>Acquiring GOES imagery</span></div>
        )}
        <div className="sensor-badge nw">{data?.satellite ?? "GOES"} · {data?.sectorLabel ?? "AUTO SECTOR"}</div>
        <div className={`sensor-badge se ${stale ? "stale" : ""}`}>
          {frame && data ? `${data.productLabel} · ${frameAge(frame.capturedAt, data.fetchedAt)}` : "WAITING"}
        </div>
      </div>
      <div className="loop-controls">
        <button onClick={() => setFrameIndex(0)} aria-label="First satellite frame"><SkipBack size={14} /></button>
        <button onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause satellite loop" : "Play satellite loop"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min="0"
          max={Math.max(0, (data?.frames.length ?? 1) - 1)}
          value={frameIndex}
          onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
          aria-label="Satellite loop frame"
        />
        <button onClick={() => setFrameIndex(Math.max(0, (data?.frames.length ?? 1) - 1))} aria-label="Latest satellite frame"><SkipForward size={14} /></button>
        <span>{frameIndex + 1}/{data?.frames.length ?? 0}</span>
        {data?.notice && <span className="feed-notice" title={data.notice}>DEGRADED</span>}
      </div>
    </div>
  );
}
