import {
  BOM_RADAR_BOUNDS,
  BOM_RADAR_NAME,
  BOM_RADAR_URL,
  RADAR_DISPLAY_MAX_ZOOM,
  RAINVIEWER_API,
  RAINVIEWER_FALLBACK_HOST,
  RAINVIEWER_NATIVE_MAX_ZOOM
} from './config.js';
import { getMap } from './map.js';
import { formatRadarTimestamp, formatTimestamp } from './status.js';

const PROVIDERS = {
  auto: 'auto',
  bom: 'bom',
  rainviewer: 'rainviewer'
};

let map;
let radarPane = null;
let frames = [];
let frameIndex = 0;
let activeProvider = null;
let sourceMode = PROVIDERS.auto;
let radarLayer = null;
let opacity = 0.55;
let playTimer = null;
let controlsBound = false;

export async function initRadar(mode = PROVIDERS.auto) {
  console.info('[Atmos radar] build marker: BOM_PROVIDER_TEST_001');
  map = getMap();
  sourceMode = mode || PROVIDERS.auto;
  ensureRadarPane();
  bindRadarControls();
  stopPlayback();
  console.info('[Atmos radar] mode:', sourceMode);

  if (sourceMode === PROVIDERS.auto) {
    return loadRadarAuto();
  }

  clearRadarLayer();

  if (sourceMode === PROVIDERS.rainviewer) {
    return loadRainViewerRadar();
  }

  if (sourceMode === PROVIDERS.bom) {
    return loadBomRadar();
  }

  return loadRadarAuto();
}

async function loadRadarAuto() {
  clearRadarLayer();
  console.info('[Atmos radar] attempting BoM');

  try {
    await loadBomRadar();
    setRadarStatus('Radar: BoM');
    console.info('[Atmos radar] BoM success');
    return;
  } catch (err) {
    console.warn('[Atmos radar] BoM failed:', err);
    showRadarMessage('BoM radar unavailable — using RainViewer fallback.');
  }

  console.info('[Atmos radar] attempting RainViewer fallback');

  try {
    await loadRainViewerRadar();
    setRadarStatus('Radar: RainViewer fallback');
  } catch (err) {
    console.warn('[Atmos radar] RainViewer failed:', err);
    clearRadarLayer();
    showRadarMessage('Radar unavailable — gauge data still active.');
    setRadarStatus('Radar: unavailable');
    setRadarTimestamp('Radar unavailable');
    activeProvider = null;
    logActiveProvider(activeProvider);
  }
}

async function loadBomRadar() {
  const selectedUrl = getBomRadarUrl();
  const frame = {
    provider: PROVIDERS.bom,
    time: Date.now(),
    url: selectedUrl
  };

  logRadar('frame count', 1);
  logRadar('selected frame timestamp', 'latest');
  logRadar('selected URL/template', selectedUrl);
  console.info('[Atmos radar] BoM URL:', selectedUrl);

  await renderBomFrame(frame);
  frames = [frame];
  frameIndex = 0;
  activeProvider = PROVIDERS.bom;
  setRadarStatus('Radar: BoM');
  setRadarTimestamp(`${BOM_RADAR_NAME}: loaded ${formatTimestamp(new Date())}`);
  console.info('[Atmos radar] BoM radar succeeded');
  logActiveProvider(activeProvider);
}

async function loadRainViewerRadar() {
  throwIfForcedFailure(PROVIDERS.rainviewer);
  const metadata = await loadRainViewerMetadata();
  const pastFrames = metadata?.radar?.past || [];
  if (!pastFrames.length) throw new Error('RainViewer returned no past radar frames');

  const host = metadata.host || RAINVIEWER_FALLBACK_HOST;
  frames = pastFrames.map(frame => ({
    provider: PROVIDERS.rainviewer,
    time: frame.time,
    path: frame.path,
    url: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
  }));
  frameIndex = frames.length - 1;
  renderRainViewerFrame(frames[frameIndex]);
  activeProvider = PROVIDERS.rainviewer;
  setRadarStatus(sourceMode === PROVIDERS.auto ? 'Radar: RainViewer fallback' : 'Radar: RainViewer');
  logActiveProvider(activeProvider);
}

async function loadRainViewerMetadata() {
  const response = await fetch(RAINVIEWER_API);
  if (!response.ok) throw new Error(`RainViewer metadata ${response.status}`);
  const data = await response.json();
  logRadar('metadata loaded', 'RainViewer');
  return data;
}

function renderRainViewerFrame(frame) {
  logRadar('frame count', frames.length);
  logRadar('selected frame timestamp', frame.time);
  logRadar('selected URL/template', frame.url);
  clearRadarLayer();
  radarLayer = L.tileLayer(frame.url, {
    opacity,
    attribution: 'Radar &copy; RainViewer',
    maxNativeZoom: RAINVIEWER_NATIVE_MAX_ZOOM,
    maxZoom: RADAR_DISPLAY_MAX_ZOOM,
    pane: 'radarPane'
  }).addTo(map);
  setRadarTimestamp(`Radar: ${formatRadarTimestamp(frame.time)}`);
}

function renderBomFrame(frame) {
  return new Promise((resolve, reject) => {
    clearRadarLayer();
    try {
      const layer = L.imageOverlay(frame.url, BOM_RADAR_BOUNDS, {
        opacity,
        attribution: 'Radar &copy; Bureau of Meteorology',
        pane: 'radarPane',
        interactive: false
      });
      layer.once('load', () => resolve());
      layer.once('error', () => {
        if (radarLayer === layer) clearRadarLayer();
        reject(new Error('BoM radar image failed to load'));
      });
      radarLayer = layer.addTo(map);
    } catch (err) {
      clearRadarLayer();
      reject(err);
    }
  });
}

function getBomRadarUrl() {
  const mode = getRadarTestMode();
  const base = mode === 'all-fail' || mode === 'bom-fail'
    ? `${BOM_RADAR_URL}.forced-failure`
    : BOM_RADAR_URL;
  return `${base}?_=${Date.now()}`;
}

function bindRadarControls() {
  if (controlsBound) return;
  controlsBound = true;
  document.getElementById('radar-source')?.addEventListener('change', event => {
    initRadar(event.target.value);
  });
  document.getElementById('radar-prev')?.addEventListener('click', () => stepRadar(-1));
  document.getElementById('radar-next')?.addEventListener('click', () => stepRadar(1));
  document.getElementById('radar-play')?.addEventListener('click', toggleRadarPlayback);
  document.getElementById('radar-reload')?.addEventListener('click', () => initRadar(sourceMode));
  document.getElementById('radar-opacity')?.addEventListener('input', event => {
    opacity = Number(event.target.value || 55) / 100;
    if (radarLayer) radarLayer.setOpacity(opacity);
  });
}

function stepRadar(delta) {
  if (!frames.length) return;
  frameIndex = (frameIndex + delta + frames.length) % frames.length;
  const frame = frames[frameIndex];
  if (frame.provider === PROVIDERS.rainviewer) {
    renderRainViewerFrame(frame);
  } else {
    setRadarTimestamp(`${BOM_RADAR_NAME}: loaded ${formatTimestamp(frame.time)}`);
  }
}

function toggleRadarPlayback() {
  const button = document.getElementById('radar-play');
  if (playTimer) {
    stopPlayback();
    return;
  }

  playTimer = setInterval(() => stepRadar(1), 900);
  button?.classList.add('active');
  if (button) button.textContent = 'Pause';
}

function stopPlayback() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  const button = document.getElementById('radar-play');
  button?.classList.remove('active');
  if (button) button.textContent = 'Play';
}

function clearRadarLayer() {
  if (radarLayer && map) map.removeLayer(radarLayer);
  radarLayer = null;
}

function ensureRadarPane() {
  if (!map || radarPane) return;
  radarPane = map.createPane('radarPane');
  radarPane.style.zIndex = 350;
  radarPane.style.pointerEvents = 'none';
}

function throwIfForcedFailure(provider) {
  const mode = getRadarTestMode();
  if (mode === 'all-fail' && provider === PROVIDERS.rainviewer) throw new Error('RainViewer forced failure');
  if (mode === 'rainviewer-fail' && provider === PROVIDERS.rainviewer) throw new Error('RainViewer forced failure');
}

function getRadarTestMode() {
  return new URLSearchParams(window.location.search).get('radarTest');
}

function setRadarTimestamp(text) {
  const el = document.getElementById('radar-timestamp');
  if (el) el.textContent = text;
}

function setRadarStatus(text) {
  const el = document.getElementById('radar-source-status');
  if (el) el.textContent = text;
  const attribution = document.querySelector('.radar-attribution');
  if (!attribution) return;
  if (text === 'Radar: BoM') {
    attribution.textContent = 'Radar visual only: Bureau of Meteorology';
  } else if (text === 'Radar: RainViewer' || text === 'Radar: RainViewer fallback') {
    attribution.textContent = 'Radar visual only: RainViewer';
  } else {
    attribution.textContent = 'Radar visual only';
  }
}

function showRadarMessage(message) {
  const el = document.getElementById('radar-warning');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message;
}

function logRadar(label, value) {
  const suffix = value === '' ? '' : ` ${value}`;
  console.info(`[Atmos radar] ${label}${suffix}`);
}

function logActiveProvider(provider) {
  const label = provider === PROVIDERS.bom
    ? 'BoM'
    : provider === PROVIDERS.rainviewer
      ? 'RainViewer'
      : 'unavailable';
  console.info('[Atmos radar] Active radar provider:', label);
}
