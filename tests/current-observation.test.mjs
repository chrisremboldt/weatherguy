import assert from "node:assert/strict";
import test from "node:test";

import { selectCurrentObservation, selectObservationHistory } from "../lib/current-observation.ts";

const olderNwsObservation = {
  properties: {
    timestamp: "2026-07-22T01:35:00+00:00",
    textDescription: "Mostly Cloudy",
    temperature: { value: 30 },
    dewpoint: { value: 23 },
    relativeHumidity: { value: 66.2 },
    windDirection: { value: 50 },
    windSpeed: { value: 31.5 },
    windGust: { value: 64.8 },
    visibility: { value: 16093.44 },
    barometricPressure: { value: 101290 },
  },
};

const newerMetar = {
  icaoId: "KBNA",
  obsTime: 1784685180,
  reportTime: "2026-07-22T02:00:00.000Z",
  receiptTime: "2026-07-22T01:56:28.051Z",
  temp: 23.9,
  dewp: 21.7,
  wdir: 50,
  wspd: 17,
  wgst: null,
  visib: 2,
  altim: 1013,
  wxString: "+TSRA BR",
  clouds: [
    { cover: "SCT", base: 2300 },
    { cover: "BKN", base: 3600 },
    { cover: "OVC", base: 7000 },
  ],
};

test("a newer same-station METAR replaces an older NWS observation", () => {
  const current = selectCurrentObservation(olderNwsObservation, newerMetar);

  assert.deepEqual(current, {
    timestamp: "2026-07-22T01:53:00.000Z",
    source: "METAR",
    description: "Heavy Thunderstorm Rain · Mist",
    temperatureF: 75,
    dewpointF: 71,
    humidityPct: 88,
    windDirectionDeg: 50,
    windSpeedMph: 20,
    windGustMph: null,
    visibilityMiles: 2,
    pressureInHg: 29.91,
  });
});

test("a newer NWS report stays primary and fills unavailable fields from METAR", () => {
  const newerNws = {
    properties: {
      ...olderNwsObservation.properties,
      timestamp: "2026-07-22T02:05:00+00:00",
      textDescription: "Thunderstorm Heavy Rain and Mist",
      temperature: { value: 24.4 },
      windDirection: { value: null },
      windSpeed: { value: null },
      visibility: { value: null },
      barometricPressure: { value: null },
    },
  };

  const current = selectCurrentObservation(newerNws, newerMetar);

  assert.equal(current.source, "NWS");
  assert.equal(current.timestamp, "2026-07-22T02:05:00.000Z");
  assert.equal(current.temperatureF, 76);
  assert.equal(current.description, "Thunderstorm Heavy Rain and Mist");
  assert.equal(current.windSpeedMph, 20);
  assert.equal(current.visibilityMiles, 2);
  assert.equal(current.pressureInHg, 29.91);
});

test("NWS remains the source when AviationWeather has no same-station report", () => {
  const current = selectCurrentObservation(olderNwsObservation);

  assert.equal(current.source, "NWS");
  assert.equal(current.timestamp, "2026-07-22T01:35:00.000Z");
  assert.equal(current.temperatureF, 86);
  assert.equal(current.description, "Mostly Cloudy");
});

test("station history prefers a usable NWS series and falls back to METAR history", () => {
  const nwsCollection = {
    features: [0, 1, 2].map((index) => ({
      properties: {
        ...olderNwsObservation.properties,
        timestamp: new Date(Date.parse("2026-07-22T00:00:00Z") + index * 3_600_000).toISOString(),
        temperature: { value: 20 + index },
      },
    })),
  };
  const metars = [0, 1, 2, 3].map((index) => ({
    ...newerMetar,
    obsTime: Date.parse("2026-07-22T00:00:00Z") / 1000 + index * 3_600,
    temp: 15 + index,
  }));

  const nwsHistory = selectObservationHistory(nwsCollection, metars);
  const metarFallback = selectObservationHistory({ features: nwsCollection.features.slice(0, 2) }, metars);

  assert.equal(nwsHistory.length, 3);
  assert.ok(nwsHistory.every((point) => point.source === "NWS"));
  assert.deepEqual(nwsHistory.map((point) => point.temperatureF), [68, 70, 72]);
  assert.equal(metarFallback.length, 4);
  assert.ok(metarFallback.every((point) => point.source === "METAR"));
  assert.deepEqual(metarFallback.map((point) => point.temperatureF), [59, 61, 63, 64]);
});
