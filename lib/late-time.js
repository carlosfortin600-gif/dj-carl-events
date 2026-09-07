const LATE_NIGHT_CUTOFF = "06:00";

function parseTimeParts(timeStr) {
  const match = String(timeStr || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    raw: `${match[1].padStart(2, "0")}:${match[2]}`
  };
}

function normalizeTimeForSort(timeStr) {
  const parts = parseTimeParts(timeStr);
  if (!parts) return null;
  let hours = parts.hours;
  if (hours < 6) hours += 24;
  return `${String(hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}`;
}

function compareLateTime(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const sortA = normalizeTimeForSort(a);
  const sortB = normalizeTimeForSort(b);
  if (!sortA && !sortB) return String(a).localeCompare(String(b));
  if (!sortA) return 1;
  if (!sortB) return -1;
  return sortA.localeCompare(sortB);
}

function isLateNightTime(timeStr) {
  const parts = parseTimeParts(timeStr);
  if (!parts) return false;
  return parts.hours < 6;
}

function formatLateTime(timeStr) {
  if (!timeStr) return "—";
  const parts = parseTimeParts(timeStr);
  if (!parts) return String(timeStr);
  const label = `${parts.hours.toString().padStart(2, "0")}:${parts.minutes.toString().padStart(2, "0")}`;
  return isLateNightTime(timeStr) ? `${label} (nuit)` : label;
}

module.exports = {
  LATE_NIGHT_CUTOFF,
  parseTimeParts,
  normalizeTimeForSort,
  compareLateTime,
  isLateNightTime,
  formatLateTime
};
