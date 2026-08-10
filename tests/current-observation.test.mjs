import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMetarSkyCondition,
  normalizeNwsSkyCondition,
  selectCurrentObservation,
  selectObservationHistory,
} from "../lib/current-observation.ts";

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
    skyCondition: { kind: "ceiling", cover: "BKN", baseFeet: 3600 },
  });
});

test("Traverse City raw CLR reports produce Clear instead of the generic placeholder", () => {
  const nwsClear = {
    properties: {
      ...olderNwsObservation.properties,
      timestamp: "2026-08-10T02:50:00Z",
      textDescription: "Clear",
      cloudLayers: [{ amount: "CLR", base: { value: 3810, unitCode: "wmoUnit:m" } }],
    },
  };
  const ktvcMetar = {
    ...newerMetar,
    icaoId: "KTVC",
    obsTime: Date.parse("2026-08-10T02:53:00Z") / 1000,
    rawOb: "METAR KTVC 100253Z AUTO 19005KT 10SM CLR 19/17 A2992 RMK AO2",
    wxString: null,
    clouds: [],
  };

  const current = selectCurrentObservation(nwsClear, ktvcMetar);

  assert.deepEqual(
    normalizeNwsSkyCondition(nwsClear),
    { kind: "clear-report", cover: "CLR", baseFeet: null },
  );
  assert.equal(current.source, "METAR");
  assert.equal(current.description, "Clear");
  assert.deepEqual(current.skyCondition, { kind: "clear-report", cover: "CLR", baseFeet: null });
});

test("cloud normalization reports a ceiling before lower scattered layers", () => {
  assert.deepEqual(
    normalizeMetarSkyCondition({
      clouds: [
        { cover: "SCT", base: 2300 },
        { cover: "BKN", base: 3600 },
        { cover: "OVC", base: 7000 },
      ],
    }),
    { kind: "ceiling", cover: "BKN", baseFeet: 3600 },
  );
  assert.deepEqual(
    normalizeMetarSkyCondition({
      clouds: [],
      rawOb: "METAR KBNA 220153Z 05017KT 2SM SCT023 BKN036 OVC070 24/22 A2991",
    }),
    { kind: "ceiling", cover: "BKN", baseFeet: 3600 },
  );
});

test("cloud normalization reports the lowest FEW or SCT layer when there is no ceiling", () => {
  assert.deepEqual(
    normalizeMetarSkyCondition({
      clouds: [
        { cover: "FEW", base: 5000 },
        { cover: "SCT", base: 2500 },
      ],
    }),
    { kind: "layer", cover: "SCT", baseFeet: 2500 },
  );
});

test("vertical visibility and NWS meter bases normalize to feet AGL", () => {
  assert.deepEqual(
    normalizeMetarSkyCondition({ clouds: [{ cover: "OVX", base: 300 }] }),
    { kind: "ceiling", cover: "VV", baseFeet: 300 },
  );
  assert.deepEqual(
    normalizeMetarSkyCondition({ clouds: [], rawOb: "METAR KORD 100251Z 00000KT 1/4SM FG VV003" }),
    { kind: "ceiling", cover: "VV", baseFeet: 300 },
  );
  assert.deepEqual(
    normalizeNwsSkyCondition({
      properties: {
        cloudLayers: [{ amount: "BKN", base: { value: 914.4, unitCode: "wmoUnit:m" } }],
      },
    }),
    { kind: "ceiling", cover: "BKN", baseFeet: 3000 },
  );
});

test("missing cloud data stays unknown rather than being called clear", () => {
  assert.equal(normalizeMetarSkyCondition({ clouds: [], rawOb: "METAR KTVC 100253Z AUTO 19005KT 10SM 19/17 A2992" }), null);
  assert.equal(normalizeNwsSkyCondition({ properties: {} }), null);
});

test("a newer NWS report stays intact instead of silently borrowing older METAR fields", () => {
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
  assert.equal(current.windSpeedMph, null);
  assert.equal(current.visibilityMiles, null);
  assert.equal(current.pressureInHg, null);
});

test("NWS remains the source when AviationWeather has no same-station report", () => {
  const current = selectCurrentObservation(olderNwsObservation);

  assert.equal(current.source, "NWS");
  assert.equal(current.timestamp, "2026-07-22T01:35:00.000Z");
  assert.equal(current.temperatureF, 86);
  assert.equal(current.description, "Mostly Cloudy");
});

test("station history merges same-station feeds so it reaches the newest report", () => {
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

  const history = selectObservationHistory(nwsCollection, metars);

  assert.equal(history.length, 4);
  assert.equal(history.at(-1)?.source, "METAR");
  assert.equal(history.at(-1)?.timestamp, "2026-07-22T03:00:00.000Z");
  assert.deepEqual(history.map((point) => point.temperatureF), [59, 61, 63, 64]);
});

test("station history preserves a reported calm wind instead of treating zero as missing", () => {
  const calmObservation = {
    features: [{
      properties: {
        ...olderNwsObservation.properties,
        windSpeed: { value: 0 },
        windGust: { value: null },
      },
    }],
  };

  const history = selectObservationHistory(calmObservation, []);

  assert.equal(history[0]?.windSpeedMph, 0);
  assert.equal(history[0]?.windGustMph, null);
});
