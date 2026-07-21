# WeatherGuy

WeatherGuy turns an unused iMac, monitor, or TV into an always-on weather observation desk. It combines authoritative U.S. government feeds into one large-screen display with no API keys and no database.

The default station is Traverse City, Michigan. Choose a preset, use the browser's location, enter coordinates, or share a location with `?lat=44.7631&lon=-85.6206`. WeatherGuy automatically resolves the correct National Weather Service office, radar site, and nearest reporting airport.

## What is on the desk

- Animated NWS NEXRAD radar loop, refreshed every two minutes
- Current observation with wind, gusts, dew point, pressure, humidity, and visibility
- Nine-hour temperature trace and precipitation probabilities
- Five-day NWS outlook
- Active watches, warnings, and advisories for the selected point
- Latest Area Forecast Discussion from the responsible forecast office
- Nearest-airport METAR, flight category, ceiling, visibility, and altimeter
- Sunrise and sunset
- Fullscreen kiosk mode, five-minute data refresh, stale-feed messaging, and responsive layouts

The server-side data adapter tolerates partial upstream outages. A missing Area Forecast Discussion or aviation report does not take down the rest of the display, and METAR values fill occasional gaps in the NWS observation feed.

## Data sources

| Display | Source | Refresh |
| --- | --- | --- |
| Forecasts, observations, alerts, astronomy, office/station resolution | [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | 1–15 minutes by product |
| Animated radar | [NWS RIDGE radar](https://radar.weather.gov) | 2 minutes |
| METAR and flight category | [AviationWeather.gov Data API](https://aviationweather.gov/data/api/) | 1 minute |
| Forecast discussion | NWS text products API | 10 minutes |

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

The browser calls a single `/api/weather` route. That server route resolves a coordinate through NWS, fetches the independent weather products concurrently, normalizes their different units and schemas, and returns one dashboard payload. Keeping the upstream calls server-side avoids browser CORS problems and lets Vercel cache public data close to viewers.

The animated radar image is loaded directly from NWS RIDGE. This keeps the radar authoritative and animated without a paid mapping provider or a large client-side GIS bundle.

## Good next layers

The first additions should increase decision value without turning the screen into a collage:

1. Alert geometry and storm-based warning polygons over an interactive MRMS map.
2. SPC convective outlook and mesoscale discussion state for severe-weather days.
3. Air quality, wildfire smoke, and visibility—especially useful in summer.
4. Local webcams and Great Lakes buoy observations for ground truth.
5. A small plug-in rail for ADS-B, river gauges, personal sensors, or space weather.
6. Offline snapshot persistence so a network interruption leaves the last known desk visible after a reboot.

The design deliberately keeps radar dominant, alerts interruptive, and everything else subordinate. Any new layer should earn permanent screen space by changing a decision.

## License

MIT
