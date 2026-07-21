"use client";

import { Layers3, Pause, Play, RadioTower } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, TileLayer } from "leaflet";
import type { RadarData, RadarProductId, WeatherAlert } from "@/lib/types";

export function RadarMap({
  latitude,
  longitude,
  station,
  alerts,
  refreshKey,
}: {
  latitude: number;
  longitude: number;
  station: string;
  alerts: WeatherAlert[];
  refreshKey: number;
}) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const radarLayerRef = useRef<TileLayer.WMS | null>(null);
  const [labMode, setLabMode] = useState(false);
  const [radar, setRadar] = useState<RadarData | null>(null);
  const [productId, setProductId] = useState<RadarProductId>("bref");
  const [opacity, setOpacity] = useState(0.78);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/radar?station=${encodeURIComponent(station)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as RadarData;
        if (!response.ok) throw new Error("Radar metadata is unavailable.");
        setRadar(payload);
        setFrameIndex(Math.max(0, payload.times.length - 1));
      })
      .catch(() => setRadar(null));
    return () => controller.abort();
  }, [station, refreshKey]);

  useEffect(() => {
    if (!labMode || !mapNode.current || mapRef.current) return;
    let active = true;
    void import("leaflet").then((module) => {
      if (!active || !mapNode.current) return;
      const L = module.default;
      const map = L.map(mapNode.current, { zoomControl: true, attributionControl: true }).setView([latitude, longitude], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 13,
        attribution: "© OpenStreetMap · NOAA/NWS",
      }).addTo(map);
      L.circleMarker([latitude, longitude], {
        radius: 5,
        color: "#e7f0ef",
        fillColor: "#63e2b7",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map).bindTooltip("Selected location");
      alerts.forEach((alert) => {
        if (!alert.geometry) return;
        L.geoJSON({ type: "Feature", geometry: alert.geometry, properties: {} } as GeoJSON.Feature, {
          style: { color: "#ff6577", weight: 2, fillColor: "#ff6577", fillOpacity: 0.08 },
        }).addTo(map).bindTooltip(alert.event);
      });
      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      radarLayerRef.current = null;
    };
  }, [alerts, labMode, latitude, longitude]);

  const selectedProduct = useMemo(() => radar?.products.find((item) => item.id === productId) ?? radar?.products[0], [productId, radar]);
  const selectedTime = radar?.times[Math.min(frameIndex, Math.max(0, radar.times.length - 1))];

  useEffect(() => {
    if (!labMode || !mapRef.current || !selectedProduct) return;
    let active = true;
    void import("leaflet").then((module) => {
      if (!active || !mapRef.current) return;
      const L = module.default;
      radarLayerRef.current?.remove();
      radarLayerRef.current = L.tileLayer.wms(selectedProduct.wmsUrl, {
        layers: selectedProduct.layer,
        styles: selectedProduct.style,
        format: "image/png",
        transparent: true,
        opacity,
        version: "1.3.0",
        ...(selectedTime ? { time: selectedTime } : {}),
      }).addTo(mapRef.current);
    });
    return () => { active = false; };
  }, [labMode, opacity, selectedProduct, selectedTime]);

  useEffect(() => {
    if (!playing || !labMode || !radar || radar.times.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % radar.times.length), 650);
    return () => window.clearInterval(timer);
  }, [labMode, playing, radar]);

  const ridgeUrl = `https://radar.weather.gov/ridge/standard/${station}_loop.gif?v=${refreshKey}`;

  return (
    <div className="radar-console">
      <div className="sensor-toolbar radar-toolbar">
        <div className="mode-switch" aria-label="Radar mode">
          <button className={!labMode ? "active" : ""} onClick={() => setLabMode(false)}><RadioTower size={13} /> Wall loop</button>
          <button className={labMode ? "active" : ""} onClick={() => setLabMode(true)}><Layers3 size={13} /> Radar lab</button>
        </div>
        {labMode && (
          <select value={productId} onChange={(event) => setProductId(event.target.value as RadarProductId)} aria-label="Radar product">
            {radar?.products.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        )}
      </div>
      {!labMode ? (
        <div className="radar-stage">
          {/* The authoritative NWS GIF is animated and intentionally bypasses image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="radar-backdrop" src={ridgeUrl} alt="" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="radar-image" src={ridgeUrl} alt={`Animated NWS radar loop from ${station}`} />
          <div className="radar-scanline" aria-hidden="true" />
          <div className="sensor-badge nw">NWS RIDGE · 10 FRAME LOOP</div>
          <div className="sensor-badge se">{station} · 0.5° BR</div>
        </div>
      ) : (
        <>
          <div className="radar-map" ref={mapNode} aria-label={`Interactive ${selectedProduct?.label ?? "radar"} map`} />
          <div className="radar-lab-strip">
            <button onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause radar loop" : "Play radar loop"}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input type="range" min="0" max={Math.max(0, (radar?.times.length ?? 1) - 1)} value={frameIndex} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-label="Radar time" />
            <span>{selectedTime ? new Date(selectedTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "LATEST"}</span>
            <label>Opacity <input type="range" min="0.25" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
            {selectedProduct && <span title={selectedProduct.detail}>{selectedProduct.detail}</span>}
          </div>
        </>
      )}
    </div>
  );
}
