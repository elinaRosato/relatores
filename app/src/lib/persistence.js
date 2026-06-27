const DELAY_PREFIX = 'relata:delay:';
const LAST_STATION_KEY = 'relata:lastStation';

export function getStationDelay(stationId) {
  const raw = localStorage.getItem(DELAY_PREFIX + stationId);
  return raw === null ? 0 : parseFloat(raw);
}

export function setStationDelay(stationId, seconds) {
  localStorage.setItem(DELAY_PREFIX + stationId, String(seconds));
}

export function getLastStationId() {
  return localStorage.getItem(LAST_STATION_KEY);
}

export function setLastStationId(stationId) {
  localStorage.setItem(LAST_STATION_KEY, stationId);
}
