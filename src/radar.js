import { BOM_RADAR_BOUNDS, BOM_RADAR_NAME, BOM_RADAR_URL } from './config.js';
import { formatTimestamp } from './status.js';

let map;
let radarLayer = null;
let opacity = 0.55;

export async function initRadar(leafletMap) {
  map = leafletMap;
  bindRadarControls();
  renderBomRadar();
}

function renderBomRadar() {
  if (!map) return;
  const cacheBustUrl = `${BOM_RADAR_URL}?_=${Date.now()}`;

  if (radarLayer) map.removeLayer(radarLayer);
  radarLayer = L.imageOverlay(cacheBustUrl, BOM_RADAR_BOUNDS, {
    opacity,
    attribution: 'Radar &copy; Bureau of Meteorology',
    zIndex: 450,
    interactive: false
  });

  radarLayer.once('load', () => {
    setRadarWarning('');
    setRadarTimestamp(`${BOM_RADAR_NAME}: loaded ${formatTimestamp(new Date())}`);
  });
  radarLayer.once('error', () => {
    setRadarWarning('BoM radar image could not be loaded in this browser. Gauge data remains available.');
    setRadarTimestamp('BoM radar unavailable');
  });

  radarLayer.addTo(map);
  setRadarTimestamp(`${BOM_RADAR_NAME}: loading...`);
}

function bindRadarControls() {
  document.getElementById('radar-reload')?.addEventListener('click', renderBomRadar);
  document.getElementById('radar-opacity')?.addEventListener('input', event => {
    opacity = Number(event.target.value || 55) / 100;
    if (radarLayer) radarLayer.setOpacity(opacity);
  });
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
