import {
  RADAR_DISPLAY_MAX_ZOOM,
  RAINVIEWER_API,
  RAINVIEWER_FALLBACK_HOST,
  RAINVIEWER_NATIVE_MAX_ZOOM
} from './config.js';
import { formatRadarTimestamp } from './status.js';

let map;
let metadata = null;
let frames = [];
let frameIndex = 0;
let radarLayer = null;
let opacity = 0.55;
let playTimer = null;

export async function initRadar(leafletMap) {
  map = leafletMap;
  bindRadarControls();
  await loadAndRenderRadar();
}

async function loadAndRenderRadar() {
  try {
    metadata = await loadRadarMetadata();
    frames = metadata?.radar?.past || [];
    if (!frames.length) throw new Error('RainViewer returned no past radar frames');

    frameIndex = frames.length - 1;
    renderRadarFrame(frameIndex);
    setRadarWarning('');
  } catch (error) {
    console.warn('Radar overlay unavailable:', error);
    setRadarWarning(`Radar overlay unavailable: ${error.message}`);
    setRadarTimestamp('Radar unavailable');
  }
}

async function loadRadarMetadata() {
  const response = await fetch(RAINVIEWER_API);
  if (!response.ok) throw new Error(`RainViewer metadata ${response.status}`);
  const data = await response.json();
  console.log('RainViewer metadata loaded', data);
  return data;
}

function renderRadarFrame(index) {
  if (!map || !metadata || !frames.length) return;
  const data = metadata;
  const frame = data.radar.past[index];
  const host = data.host || RAINVIEWER_FALLBACK_HOST;
  const tileUrl = `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

  console.log('RainViewer selected frame time', frame.time);
  console.log('RainViewer selected frame path', frame.path);
  console.log('RainViewer tile URL template', tileUrl);

  if (radarLayer) map.removeLayer(radarLayer);
  radarLayer = L.tileLayer(tileUrl, {
    opacity,
    attribution: 'Radar &copy; RainViewer',
    maxNativeZoom: RAINVIEWER_NATIVE_MAX_ZOOM,
    maxZoom: RADAR_DISPLAY_MAX_ZOOM,
    zIndex: 450
  }).addTo(map);

  setRadarTimestamp(`Radar: ${formatRadarTimestamp(frame.time)}`);
}

function bindRadarControls() {
  document.getElementById('radar-prev')?.addEventListener('click', () => stepRadar(-1));
  document.getElementById('radar-next')?.addEventListener('click', () => stepRadar(1));
  document.getElementById('radar-play')?.addEventListener('click', toggleRadarPlayback);
  document.getElementById('radar-reload')?.addEventListener('click', loadAndRenderRadar);
  document.getElementById('radar-opacity')?.addEventListener('input', event => {
    opacity = Number(event.target.value || 55) / 100;
    if (radarLayer) radarLayer.setOpacity(opacity);
  });
}

function stepRadar(delta) {
  if (!frames.length) return;
  frameIndex = (frameIndex + delta + frames.length) % frames.length;
  renderRadarFrame(frameIndex);
}

function toggleRadarPlayback() {
  const button = document.getElementById('radar-play');
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    button?.classList.remove('active');
    if (button) button.textContent = 'Play';
    return;
  }

  playTimer = setInterval(() => stepRadar(1), 900);
  button?.classList.add('active');
  if (button) button.textContent = 'Pause';
}

function setRadarTimestamp(text) {
  const el = document.getElementById('radar-timestamp');
  if (el) el.textContent = text;
}

function setRadarWarning(message) {
  const el = document.getElementById('radar-warning');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message;
}
