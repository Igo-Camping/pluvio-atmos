import { RAINVIEWER_API } from './config.js';
import { formatRadarTimestamp } from './status.js';

let map;
let frames = [];
let frameIndex = 0;
let radarLayer = null;
let opacity = 0.55;
let playTimer = null;

export async function initRadar(leafletMap) {
  map = leafletMap;
  bindRadarControls();
  try {
    await loadRadarFrames();
    showLatestRadarFrame();
    setRadarWarning('');
  } catch (error) {
    setRadarWarning(`Radar overlay unavailable: ${error.message}`);
    setRadarTimestamp('Radar unavailable');
  }
}

async function loadRadarFrames() {
  const response = await fetch(RAINVIEWER_API);
  if (!response.ok) throw new Error(`RainViewer ${response.status}`);
  const data = await response.json();
  frames = data?.radar?.past || [];
  if (!frames.length) throw new Error('no recent frames');
}

function showLatestRadarFrame() {
  frameIndex = Math.max(0, frames.length - 1);
  renderRadarFrame();
}

function renderRadarFrame() {
  if (!map || !frames.length) return;
  const frame = frames[frameIndex];
  const template = `${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
  const tileUrl = template.startsWith('http')
    ? template
    : `https://tilecache.rainviewer.com${template}`;

  if (radarLayer) map.removeLayer(radarLayer);
  radarLayer = L.tileLayer(tileUrl, {
    opacity,
    attribution: 'Radar &copy; RainViewer',
    zIndex: 450
  }).addTo(map);
  setRadarTimestamp(`Radar: ${formatRadarTimestamp(frame.time)}`);
}

function bindRadarControls() {
  document.getElementById('radar-prev')?.addEventListener('click', () => {
    stepRadar(-1);
  });
  document.getElementById('radar-next')?.addEventListener('click', () => {
    stepRadar(1);
  });
  document.getElementById('radar-play')?.addEventListener('click', toggleRadarPlayback);
  document.getElementById('radar-opacity')?.addEventListener('input', event => {
    opacity = Number(event.target.value || 55) / 100;
    if (radarLayer) radarLayer.setOpacity(opacity);
  });
}

function stepRadar(delta) {
  if (!frames.length) return;
  frameIndex = (frameIndex + delta + frames.length) % frames.length;
  renderRadarFrame();
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
