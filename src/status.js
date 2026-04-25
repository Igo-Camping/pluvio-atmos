import { STALE_DATA_MINUTES } from './config.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTimestamp(dateLike) {
  if (!dateLike) return 'Not loaded';
  return new Date(dateLike).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatRadarTimestamp(unixSeconds) {
  if (!unixSeconds) return 'Radar unavailable';
  return new Date(unixSeconds * 1000).toLocaleString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDataAge(ageMinutes) {
  if (!Number.isFinite(ageMinutes)) return 'No data';
  if (ageMinutes < 1) return '<1 min';
  if (ageMinutes < 60) return `${Math.round(ageMinutes)} min`;
  return `${Math.round(ageMinutes / 60)} hr`;
}

export function isStale(ageMinutes) {
  return !Number.isFinite(ageMinutes) || ageMinutes > STALE_DATA_MINUTES;
}

export function setStatus(message, level = 'ok') {
  const text = document.getElementById('status-text');
  const dot = document.getElementById('status-dot');
  if (text) text.textContent = message;
  if (dot) {
    dot.classList.toggle('warn', level === 'warn');
    dot.classList.toggle('error', level === 'error');
  }
}

export function stationArea(station) {
  return station?.lga && station.lga !== 'Unknown' ? station.lga : 'NSW';
}
