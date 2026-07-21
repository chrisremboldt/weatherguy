"use client";

import { ChevronRight } from "lucide-react";
import type { WeatherDashboardData } from "@/lib/types";
import { RadarMap } from "@/components/radar-map";
import { SatelliteView } from "@/components/satellite-view";

export function SensorDeck({ data, refreshKey }: { data: WeatherDashboardData; refreshKey: number }) {
  return (
    <section className="panel sensor-panel">
      <div className="panel-heading radar-heading">
        <div>
          <span className="eyebrow">Dual sensor deck / live operations</span>
          <h1>Radar + orbital view</h1>
        </div>
        <div className="panel-actions">
          <span className="live-chip"><i /> LIVE</span>
          <a href="https://radar.weather.gov" target="_blank" rel="noreferrer">Open NWS radar <ChevronRight size={14} /></a>
        </div>
      </div>
      <div className="sensor-grid">
        <div className="sensor-cell radar-cell">
          <div className="sensor-label"><span>01</span><strong>Ground radar</strong><small>{data.location.radarStation}</small></div>
          <RadarMap
            latitude={data.location.latitude}
            longitude={data.location.longitude}
            station={data.location.radarStation}
            alerts={data.alerts}
            refreshKey={refreshKey}
          />
        </div>
        <div className="sensor-cell satellite-cell">
          <div className="sensor-label"><span>02</span><strong>Geostationary</strong><small>Auto sector</small></div>
          <SatelliteView latitude={data.location.latitude} longitude={data.location.longitude} refreshKey={refreshKey} />
        </div>
      </div>
    </section>
  );
}
