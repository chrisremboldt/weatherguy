# WeatherGuy

WeatherGuy turns an unused iMac, monitor, or TV into an always-on weather observation desk. It combines authoritative U.S. government feeds into one large-screen display with no API keys and no database.

On first run, search for any U.S. city, state, ZIP code, or supported territory; use the browser's location; or enter coordinates directly. The selection persists in that browser and the resulting `?lat=…&lon=…` URL is shareable. WeatherGuy automatically resolves the correct National Weather Service office, radar site, and nearest reporting airport for the selected point.

## What is on the desk

- Dual live sensor deck with animated NWS NEXRAD radar and auto-selected GOES-East/West imagery
- GOES GeoColor, infrared, water vapor, cloud phase, lightning, fire-temperature, and dust loops
- Interactive Radar Lab with pan/zoom, time scrubber, alert polygons, opacity, and product switching
- Super-resolution base reflectivity, radial velocity, dual-pol hydrometeor class, one-hour rain, storm-total rain, and MRMS composite reflectivity
- Current observation with wind, gusts, dew point, pressure, humidity, and visibility
- Nine-hour temperature trace plus apparent temperature, rainfall/snowfall totals, cloud peak, freezing level, and a best-outdoor-window signal
- Five-day NWS outlook
- Active watches, warnings, and advisories for the selected point
- Latest Area Forecast Discussion from the responsible forecast office
- Nearest-airport METAR and TAF timeline, nearby airport categories, PIREPs, and regional SIGMETs
- SPC Day 1 outlook, tornado/wind/hail products, watches, mesoscale discussions, and storm reports
- Air quality, nearest USGS earthquake, NOAA geomagnetic Kp, rivers, buoys, tropical, and fire tools
- Sunrise and sunset
- Desk, Severe, Aviation, and Minimal layouts; fullscreen kiosk mode; auto-dimming; and burn-in drift
- Family-share URLs, saved favorites, optional location rotation and alert tone
- Installable PWA shell and a last-good local snapshot for brief network interruptions

The server-side data adapter tolerates partial upstream outages. A missing Area Forecast Discussion or aviation report does not take down the rest of the display, and METAR values fill occasional gaps in the NWS observation feed.

## Data sources

| Display | Source | Refresh |
| --- | --- | --- |
| Forecasts, observations, alerts, astronomy, office/station resolution | [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | 1–15 minutes by product |
| Animated radar | [NWS RIDGE radar](https://radar.weather.gov) | 2 minutes |
| Interactive radar products | [NWS OpenGeo / NEXRAD Level III](https://opengeo.ncep.noaa.gov/geoserver/www/index.html) | 1–2 minutes |
| Satellite imagery and lightning | [NOAA NESDIS STAR GOES](https://www.star.nesdis.noaa.gov/GOES/) | 5 minutes |
| METAR and flight category | [AviationWeather.gov Data API](https://aviationweather.gov/data/api/) | 1 minute |
| TAF, nearby METARs, PIREPs, and SIGMETs | AviationWeather.gov Data API | 1–5 minutes |
| Forecast discussion | NWS text products API | 10 minutes |
| Forecast signals and AQI | [Open-Meteo](https://open-meteo.com/en/docs) | 15 minutes |
| Severe-weather outlook | [NOAA Storm Prediction Center](https://www.spc.noaa.gov/products/outlook/) | Operational cadence |
| Earthquakes | [USGS real-time GeoJSON](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | 5 minutes |
| Space weather | [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/products/planetary-k-index) | 5 minutes |
| City, state, ZIP code, and territory search | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | Cached for 24 hours |

NWS asks clients to identify themselves with a user agent. The project includes a safe default; deployed instances should set `NWS_USER_AGENT` to a URL or contact address.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production check:

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

## Deploy to Vercel

The app uses standard Next.js route handlers and deploys directly to Vercel.

1. Import this GitHub repository in Vercel.
2. Keep the detected framework preset as **Next.js**.
3. Optionally add `NWS_USER_AGENT` with your deployed URL or contact address.
4. Deploy.

No API keys, storage products, cron jobs, or custom build settings are required.

## iMac kiosk setup

After deployment, open the Vercel URL in Chrome and use the fullscreen control in the upper-right corner. For a dedicated macOS kiosk, launch Chrome with an app window:

```bash
open -a "Google Chrome" --args --app="https://your-project.vercel.app" --start-fullscreen
```

Useful operating-system settings:

- Disable display sleep while the iMac is serving as a dashboard.
- Enable automatic login only if the machine is physically secure.
- Add the Chrome launch command as a login item.
- Use macOS Night Shift or reduce brightness overnight to limit burn-in and glare.

### Tailnet-only alternative

Vercel is the simplest target, but WeatherGuy can also stay private on a Tailnet:

```bash
npm run build
npm start
tailscale serve --bg http://localhost:3000
```

Then open the HTTPS URL reported by `tailscale serve` from another device on the same Tailnet.

## Architecture

The browser calls `/api/locations` for location searches and `/api/weather`, `/api/satellite`, `/api/radar`, `/api/aviation`, and `/api/intelligence` after a point is selected. Route handlers resolve the coordinate, fetch independent products concurrently, normalize their schemas, and return cacheable dashboard payloads. Keeping CORS-restricted feeds server-side lets the same build run locally or on Vercel.

The wall loop loads directly from NWS RIDGE. Radar Lab uses NWS OpenGeo Web Map Service tiles in Leaflet, while NOAA STAR supplies the satellite frames. No commercial map, weather, database, or API-key service is required.

### Radar scope

Radar Lab exposes the operational public NEXRAD Level III products that work well in a browser. Raw Level II volumes also contain differential reflectivity, correlation coefficient, differential phase, and spectrum width, but they require binary decoding, volume selection, reprojection, and tile generation. Running that pipeline inside a Vercel request would be slow and brittle. A future Level II adapter should preprocess NOAA Open Data Distribution files into tiles outside the web request, then point Radar Lab at the resulting WMS/tileset.

## Extension points

The field-tools panel intentionally deep-links products that do not offer a reliable universal point API. Natural next integrations are webcam catalogs, ADS-B, personal weather stations, Home Assistant sensors, and a preprocessed Level II tile service. Those can be added as new route handlers and contextual cards without changing the core desk.

The design deliberately keeps radar dominant, alerts interruptive, and everything else subordinate. Any new layer should earn permanent screen space by changing a decision.

## License

MIT
