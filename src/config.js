export const API_BASE = 'https://nsw-rainfall-analyser-api.onrender.com';
export const MHL_BASE = 'https://wiski.mhl.nsw.gov.au/KiWIS/KiWIS';
export const BOM_RADAR_URL = 'https://www.bom.gov.au/radar/IDR714.gif';
export const BOM_RADAR_NAME = 'BoM Sydney 512 km radar';
export const BOM_RADAR_BOUNDS = [
  [-36.02, 148.42],
  [-31.38, 154.00]
];

export const ACTIVE_GAUGE_MAX_AGE_DAYS = 90;
export const ACTIVE_GAUGE_WINDOWS_DAYS = [1, 7, 30, ACTIVE_GAUGE_MAX_AGE_DAYS];
export const ACTIVE_GAUGE_CACHE_KEY = 'atmos.activeGaugeCache.v1';
export const ACTIVE_GAUGE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const LIVE_RAIN_LOOKBACK_MINUTES = 75;
export const STALE_DATA_MINUTES = 15;

export const DEFAULT_MAP_CENTER = [-33.75, 151.25];
export const DEFAULT_MAP_ZOOM = 10;
