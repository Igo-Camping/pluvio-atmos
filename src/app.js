import { api, fetchStations, filterActiveStations, getLiveRain } from './liveRain.js';
import { initMap, renderGaugeMarkers, selectGaugeMarker, focusGauge, getMap } from './map.js';
import { initRadar } from './radar.js?v=BOM_PROVIDER_TEST_001';
import { escapeHtml, formatDataAge, formatTimestamp, setStatus, stationArea } from './status.js';

let activeStations = [];
let liveRows = [];
let selectedStationId = null;

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  initMap(selectStation);
  bindControls();
  initRadar('auto');
  await loadStationsAndRain();
}

function bindControls() {
  document.getElementById('refresh-btn')?.addEventListener('click', refreshLiveRain);
}

async function loadStationsAndRain() {
  try {
    setStatus('Connecting to rainfall services...');
    const health = await api('/health');
    setStatus(`${Number(health.stations_loaded || 0).toLocaleString()} stations available`);
    const stations = await fetchStations();
    setStatus(`Checking active gauges... 0/${stations.length}`);
    activeStations = await filterActiveStations(stations, checked => {
      setStatus(`Checking active gauges... ${checked}/${stations.length}`);
    });
    setStatus(`${activeStations.length.toLocaleString()} active gauges`);
    await refreshLiveRain();
  } catch (error) {
    setStatus(`Atmos data unavailable: ${error.message}`, 'error');
    renderEmptyTable(`Atmos could not load rainfall data: ${escapeHtml(error.message)}`);
  }
}

async function refreshLiveRain() {
  if (!activeStations.length) {
    renderEmptyTable('No active gauges available.');
    return;
  }

  const refreshButton = document.getElementById('refresh-btn');
  refreshButton?.setAttribute('disabled', 'disabled');
  try {
    setStatus('Refreshing live rainfall...');
    liveRows = await getLiveRain(activeStations);
    if (!selectedStationId && liveRows.length) selectedStationId = liveRows[0].stationId;
    renderGaugeMarkers(liveRows, selectStation);
    renderTable(liveRows);
    renderSummary(liveRows);
    renderStationDetail(liveRows.find(row => row.stationId === selectedStationId));
    selectGaugeMarker(selectedStationId);
    document.getElementById('last-updated').textContent = `Updated ${formatTimestamp(new Date())}`;
    setStatus(`${liveRows.length.toLocaleString()} gauges refreshed`);
  } catch (error) {
    setStatus(`Live rainfall refresh failed: ${error.message}`, 'warn');
  } finally {
    refreshButton?.removeAttribute('disabled');
  }
}

function selectStation(stationId) {
  selectedStationId = stationId;
  const row = liveRows.find(item => item.stationId === stationId);
  renderTable(liveRows);
  renderStationDetail(row);
  selectGaugeMarker(stationId);
  focusGauge(row);
}

function renderSummary(rows) {
  document.getElementById('gauge-count').textContent = rows.length.toLocaleString();
  document.getElementById('wet-count').textContent = rows.filter(row => row.rainRate > 0).length.toLocaleString();
  document.getElementById('stale-count').textContent = rows.filter(row => row.stale).length.toLocaleString();
}

function renderTable(rows) {
  const body = document.getElementById('live-rain-body');
  if (!body) return;
  if (!rows.length) {
    renderEmptyTable('No active gauges available.');
    return;
  }

  body.innerHTML = rows.map(row => `
    <tr class="${row.stationId === selectedStationId ? 'selected' : ''} ${row.stale ? 'stale' : ''}" data-station-id="${escapeHtml(row.stationId)}">
      <td>
        <div class="station-name">${escapeHtml(row.name)}</div>
        <div class="station-meta">${escapeHtml(stationArea(row.station))}</div>
      </td>
      <td class="right">${row.windows[5].toFixed(1)}</td>
      <td class="right">${row.windows[15].toFixed(1)}</td>
      <td class="right">${row.windows[30].toFixed(1)}</td>
      <td class="right">${row.windows[60].toFixed(1)}</td>
      <td class="right"><strong>${row.rainRate.toFixed(1)}</strong> mm/hr</td>
      <td><span class="intensity ${row.intensity.className}">${escapeHtml(row.intensity.label)}</span></td>
      <td>${escapeHtml(formatDataAge(row.dataAgeMinutes))}${row.stale ? ' <span class="stale-flag">Stale</span>' : ''}</td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-station-id]').forEach(row => {
    row.addEventListener('click', () => selectStation(row.dataset.stationId));
  });
}

function renderStationDetail(row) {
  const name = document.getElementById('selected-name');
  const detail = document.getElementById('station-detail');
  if (!name || !detail) return;

  if (!row) {
    name.textContent = 'Select a gauge';
    detail.textContent = 'Select a marker or table row to inspect recent rainfall.';
    return;
  }

  name.textContent = row.name;
  detail.innerHTML = `
    <div><strong>${escapeHtml(stationArea(row.station))}</strong></div>
    <div style="margin-top:6px">Gauge data is the quantitative source of truth. Radar is visual situational awareness only.</div>
    <div class="detail-grid">
      <div class="detail-card">
        <div class="detail-label">Rain rate</div>
        <div class="detail-value">${row.rainRate.toFixed(1)} mm/hr</div>
      </div>
      <div class="detail-card">
        <div class="detail-label">Intensity</div>
        <div class="detail-value">${escapeHtml(row.intensity.label)}</div>
      </div>
      <div class="detail-card">
        <div class="detail-label">Last 15 min</div>
        <div class="detail-value">${row.windows[15].toFixed(1)} mm</div>
      </div>
      <div class="detail-card">
        <div class="detail-label">Data age</div>
        <div class="detail-value">${escapeHtml(formatDataAge(row.dataAgeMinutes))}</div>
      </div>
    </div>
  `;
}

function renderEmptyTable(message) {
  const body = document.getElementById('live-rain-body');
  if (body) body.innerHTML = `<tr><td colspan="8" class="empty-row">${message}</td></tr>`;
}
