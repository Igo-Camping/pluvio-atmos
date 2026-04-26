import {
  ACTIVE_GAUGE_CACHE_KEY,
  ACTIVE_GAUGE_CACHE_MAX_AGE_MS,
  ACTIVE_GAUGE_WINDOWS_DAYS,
  API_BASE,
  LIVE_RAIN_LOOKBACK_MINUTES,
  MHL_BASE,
  STATION_DATA_URL
} from './config.js';
import { isStale } from './status.js';

const activeGaugeCache = loadActiveGaugeCache();
const activeGaugePromises = {};

export async function api(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`Atmos API ${response.status}`);
  return response.json();
}

export async function fetchStations() {
  const response = await fetch(`${STATION_DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${STATION_DATA_URL} returned ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data?.stations)) throw new Error(`${STATION_DATA_URL} is missing stations[]`);
  const stations = data.stations.map(normaliseSharedStation).filter(Boolean);
  const mhlCount = stations.filter(station => station.source === 'mhl').length;
  const bomCount = stations.filter(station => station.source === 'bom').length;
  console.info('[Atmos stations] dataset URL:', STATION_DATA_URL);
  console.info('[Atmos stations] generated_at:', data.generated_at || 'unknown');
  console.info('[Atmos stations] total stations loaded:', stations.length);
  console.info('[Atmos stations] MHL stations:', mhlCount);
  console.info('[Atmos stations] BOM stations:', bomCount);
  return stations;
}

function normaliseSharedStation(station) {
  if (!station || typeof station !== 'object') return null;
  const source = String(station.source || '').toLowerCase();
  const dataIdentifier = String(station.data_identifier || '');
  const dataId = prefix => dataIdentifier.toLowerCase().startsWith(`${prefix}:`)
    ? dataIdentifier.slice(prefix.length + 1)
    : '';
  const tsId = source === 'mhl'
    ? String(station.ts_id || dataId('mhl') || '').trim()
    : String(station.ts_id || '').trim();
  const bomId = source === 'bom'
    ? String(station.bom_id || dataId('bom') || station.station_id || '').replace(/\D/g, '').padStart(6, '0')
    : '';
  return {
    ...station,
    name: station.name || station.station_name,
    station_name: station.station_name || station.name,
    source,
    ts_id: tsId || null,
    bom_id: bomId || station.bom_id,
    lat: Number(station.lat),
    lon: Number(station.lon)
  };
}

function loadActiveGaugeCache() {
  try {
    const raw = localStorage.getItem(ACTIVE_GAUGE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistActiveGaugeCache() {
  try {
    localStorage.setItem(ACTIVE_GAUGE_CACHE_KEY, JSON.stringify(activeGaugeCache));
  } catch {}
}

function getCachedActiveGaugeState(tsId) {
  const cached = activeGaugeCache[tsId];
  if (!cached) return null;
  if ((Date.now() - (cached.checked_at || 0)) > ACTIVE_GAUGE_CACHE_MAX_AGE_MS) return null;
  return !!cached.active;
}

function setCachedActiveGaugeState(tsId, active) {
  activeGaugeCache[tsId] = { active: !!active, checked_at: Date.now() };
  persistActiveGaugeCache();
}

function formatMhlDate(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

async function fetchMhlTimestampPresence(tsId, fromDt, toDt) {
  const params = new URLSearchParams({
    service: 'kisters',
    type: 'queryServices',
    request: 'getTimeseriesValues',
    ts_id: tsId,
    from: formatMhlDate(fromDt),
    to: formatMhlDate(toDt),
    format: 'json',
    returnfields: 'Timestamp'
  });

  const response = await fetch(`${MHL_BASE}?${params}`);
  if (!response.ok) throw new Error(`MHL activity fetch ${response.status}`);
  const data = await response.json();
  return Number(data?.[0]?.rows || 0) > 0;
}

export async function hasRecentGaugeReadings(station) {
  if (station?.source === 'bom') return station.verification_status === 'verified';
  if (!station?.ts_id) return false;
  const cached = getCachedActiveGaugeState(station.ts_id);
  if (cached !== null) return cached;
  if (activeGaugePromises[station.ts_id]) return activeGaugePromises[station.ts_id];

  activeGaugePromises[station.ts_id] = (async () => {
    const now = new Date();
    try {
      for (const days of ACTIVE_GAUGE_WINDOWS_DAYS) {
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (await fetchMhlTimestampPresence(station.ts_id, from, now)) {
          setCachedActiveGaugeState(station.ts_id, true);
          return true;
        }
      }
      setCachedActiveGaugeState(station.ts_id, false);
      return false;
    } catch {
      const fallback = station.active !== false;
      setCachedActiveGaugeState(station.ts_id, fallback);
      return fallback;
    } finally {
      delete activeGaugePromises[station.ts_id];
    }
  })();

  return activeGaugePromises[station.ts_id];
}

export async function filterActiveStations(stations, onProgress = () => {}) {
  const source = Array.isArray(stations)
    ? stations.filter(station => station?.ts_id || station?.source === 'bom')
    : [];
  const keep = [];
  let checked = 0;

  const workers = Array.from({ length: Math.min(8, Math.max(1, source.length)) }, async () => {
    while (source.length) {
      const station = source.shift();
      if (await hasRecentGaugeReadings(station)) keep.push(station);
      checked += 1;
      if (checked % 10 === 0 || checked === checked + source.length) {
        onProgress(checked);
      }
    }
  });

  await Promise.all(workers);
  return keep.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function fetchMhlRainfall(tsId, fromDt, toDt) {
  const params = new URLSearchParams({
    service: 'kisters',
    type: 'queryServices',
    request: 'getTimeseriesValues',
    ts_id: tsId,
    from: formatMhlDate(fromDt),
    to: formatMhlDate(toDt),
    format: 'json',
    returnfields: 'Timestamp,Value'
  });

  const response = await fetch(`${MHL_BASE}?${params}`);
  if (!response.ok) throw new Error(`MHL rainfall fetch ${response.status}`);
  const data = await response.json();
  const raw = data?.[0]?.data || [];

  return raw.map(row => ({
    timestamp: row[0],
    value: row[1] === null || row[1] === '' || row[1] === '--'
      ? 0
      : Math.max(0, parseFloat(row[1]) || 0)
  })).filter(reading => reading.timestamp);
}

export async function fetchBomRainfall(bomId, fromDt, toDt) {
  const params = new URLSearchParams({
    bom_id: bomId,
    from_dt: fromDt.toISOString(),
    to_dt: toDt.toISOString(),
    duration_minutes: '30'
  });

  const data = await api(`/bom/rainfall?${params}`);
  const raw = data?.readings || [];
  return raw.map(reading => ({
    timestamp: reading.timestamp,
    value: reading.value === null || reading.value === '' || reading.value === '--'
      ? 0
      : Math.max(0, parseFloat(reading.value) || 0)
  })).filter(reading => reading.timestamp);
}

async function fetchStationRainfall(station, fromDt, toDt) {
  if (station?.source === 'bom') {
    const bomId = String(station.bom_id || station.data_identifier || station.station_id || '').replace(/\D/g, '').padStart(6, '0');
    if (!bomId) throw new Error('BoM station number unavailable');
    return {
      readings: await fetchBomRainfall(bomId, fromDt, toDt),
      source: 'BoM rainfall observations'
    };
  }
  return {
    readings: await fetchMhlRainfall(station.ts_id, fromDt, toDt),
    source: 'MHL KiWIS 5-minute rainfall'
  };
}

function readingTimeMs(reading) {
  const time = new Date(reading?.timestamp).getTime();
  return Number.isFinite(time) ? time : 0;
}

function readingValue(reading) {
  const value = Number(reading?.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function sumRainfallWindow(readings, windowMinutes, nowMs = Date.now()) {
  const cutoff = nowMs - windowMinutes * 60000;
  return (readings || []).reduce((sum, reading) => {
    const time = readingTimeMs(reading);
    return time >= cutoff && time <= nowMs ? sum + readingValue(reading) : sum;
  }, 0);
}

export function calculateRainRate(readings, windowMinutes = 15, nowMs = Date.now()) {
  const depth = sumRainfallWindow(readings, windowMinutes, nowMs);
  return Math.round((depth * 60 / windowMinutes) * 10) / 10;
}

export function classifyRainRate(rateMmHr) {
  const rate = Number(rateMmHr) || 0;
  if (rate <= 0) return { label: 'None', className: 'none', color: '#9AA7B2' };
  if (rate < 2.5) return { label: 'Light', className: 'light', color: '#2ECC71' };
  if (rate < 10) return { label: 'Moderate', className: 'moderate', color: '#F1C40F' };
  if (rate < 50) return { label: 'Heavy', className: 'heavy', color: '#E67E22' };
  return { label: 'Very heavy', className: 'very-heavy', color: '#C0392B' };
}

export async function getLiveRain(stations) {
  const now = new Date();
  const from = new Date(now.getTime() - LIVE_RAIN_LOOKBACK_MINUTES * 60000);
  const queue = [...stations];
  const rows = [];

  const workers = Array.from({ length: Math.min(8, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      const station = queue.shift();
      try {
        const rainfall = await fetchStationRainfall(station, from, now);
        const readings = rainfall.readings;
        const latestMs = readings.reduce((max, reading) => Math.max(max, readingTimeMs(reading)), 0);
        const dataAgeMinutes = latestMs ? (Date.now() - latestMs) / 60000 : Infinity;
        const windows = {
          5: roundRain(sumRainfallWindow(readings, 5)),
          15: roundRain(sumRainfallWindow(readings, 15)),
          30: roundRain(sumRainfallWindow(readings, 30)),
          60: roundRain(sumRainfallWindow(readings, 60))
        };
        const rainRate = calculateRainRate(readings, 15);
        rows.push({
          station,
          stationId: station.station_id,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          windows,
          readings,
          rainRate,
          intensity: classifyRainRate(rainRate),
          dataAgeMinutes,
          stale: isStale(dataAgeMinutes),
          source: rainfall.source
        });
      } catch (error) {
        rows.push({
          station,
          stationId: station.station_id,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          windows: { 5: 0, 15: 0, 30: 0, 60: 0 },
          readings: [],
          rainRate: 0,
          intensity: classifyRainRate(0),
          dataAgeMinutes: Infinity,
          stale: true,
          source: 'Unavailable',
          error: error.message
        });
      }
    }
  });

  await Promise.all(workers);
  return rows.sort((a, b) => b.rainRate - a.rainRate || String(a.name).localeCompare(String(b.name)));
}

function roundRain(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}
