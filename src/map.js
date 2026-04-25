import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './config.js';
import { escapeHtml, formatDataAge, stationArea } from './status.js';

let map;
let markerLayer;
const markers = new Map();
let selectedStationId = null;

export function initMap(onSelect) {
  map = L.map('map', { zoomControl: true }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on('resize', () => map.invalidateSize());
  return { map, onSelect };
}

export function getMap() {
  return map;
}

export function renderGaugeMarkers(rows, onSelect) {
  if (!map || !markerLayer) return;
  const activeIds = new Set(rows.map(row => row.stationId));

  markers.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      markerLayer.removeLayer(marker);
      markers.delete(id);
    }
  });

  rows.forEach(row => {
    const marker = markers.get(row.stationId);
    const style = markerStyle(row);
    const popup = markerPopup(row);

    if (marker) {
      marker.setStyle(style).setPopupContent(popup);
    } else {
      const newMarker = L.circleMarker([row.lat, row.lon], style)
        .bindPopup(popup)
        .bindTooltip(row.name, { className: 'station-tooltip', direction: 'top', offset: [0, -6] })
        .on('click', () => onSelect(row.stationId));
      newMarker.addTo(markerLayer);
      markers.set(row.stationId, newMarker);
    }
  });

  if (rows.length && !selectedStationId) {
    const bounds = L.latLngBounds(rows.map(row => [row.lat, row.lon]));
    map.fitBounds(bounds, { padding: [36, 36] });
  }
}

export function selectGaugeMarker(stationId) {
  selectedStationId = stationId;
  markers.forEach((marker, id) => {
    const row = marker.options.atmosRow;
    if (row) marker.setStyle(markerStyle(row));
    if (id === stationId) marker.openPopup();
  });
}

export function focusGauge(row) {
  if (!map || !row) return;
  map.panTo([row.lat, row.lon]);
  markers.get(row.stationId)?.openPopup();
}

function markerStyle(row) {
  const selected = row.stationId === selectedStationId;
  const style = {
    radius: selected ? 9 : 7,
    fillColor: row.intensity.color,
    color: row.stale ? '#C0392B' : '#102C44',
    weight: selected ? 3 : 1.5,
    opacity: 1,
    fillOpacity: row.stale ? 0.55 : 0.9
  };
  style.atmosRow = row;
  return style;
}

function markerPopup(row) {
  return `<strong>${escapeHtml(row.name)}</strong><br>
    <small>${escapeHtml(stationArea(row.station))}</small><br>
    <small>${row.rainRate.toFixed(1)} mm/hr - ${escapeHtml(row.intensity.label)}</small><br>
    <small>Data age: ${escapeHtml(formatDataAge(row.dataAgeMinutes))}${row.stale ? ' - stale' : ''}</small>`;
}
