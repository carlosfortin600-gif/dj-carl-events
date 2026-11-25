const { parseEndDatetime } = require("./helpers");
const { resolveDepartureAddress, loadRouteOrigins } = require("./route-time");

function eventDestinationAddress(event) {
  const parts = [event.address, event.city].filter((s) => s && String(s).trim());
  const joined = parts.join(", ");
  if (joined) return joined.trim();
  return event.venue?.trim() || "";
}

function parseTravelDurationMinutes(data) {
  if (data.tech_travel_duration_minutes !== undefined && data.tech_travel_duration_minutes !== "") {
    const n = parseInt(String(data.tech_travel_duration_minutes), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const hours = parseInt(String(data.tech_travel_duration_hours ?? ""), 10);
  const mins = parseInt(String(data.tech_travel_duration_mins ?? ""), 10);
  const h = Number.isFinite(hours) && hours >= 0 ? hours : 0;
  const m = Number.isFinite(mins) && mins >= 0 ? mins : 0;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

function formatTravelDurationLabel(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function subtractSecondsFromArrival(arrivalDate, arrivalTime, durationSeconds) {
  const match = String(arrivalTime || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match || !arrivalDate?.trim()) return { date: null, time: null };

  const [y, m, d] = arrivalDate.trim().split("-").map(Number);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const arrivalMs = new Date(y, m - 1, d, hours, minutes, 0).getTime();
  const departureMs = arrivalMs - Math.max(0, Number(durationSeconds) || 0) * 1000;
  const dt = new Date(departureMs);
  const pad = (n) => String(n).padStart(2, "0");

  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  };
}

function parseArrivalFromForm(data) {
  if (data.tech_arrival_datetime !== undefined) {
    const parsed = parseEndDatetime(data.tech_arrival_datetime);
    return { date: parsed.end_date, time: parsed.end_time };
  }
  return {
    date: data.tech_arrival_date?.trim() || null,
    time: data.tech_arrival_time?.trim() || null
  };
}

function applyComputedDeparture(data) {
  const { date: arrivalDate, time: arrivalTime } = parseArrivalFromForm(data);
  const durationMinutes = parseTravelDurationMinutes(data);

  data.tech_travel_duration_minutes =
    durationMinutes !== null ? String(durationMinutes) : "";

  if (!arrivalDate || !arrivalTime) {
    data.tech_departure_date = null;
    data.tech_departure_time = null;
    data.tech_departure_datetime = "";
    return { ok: true, cleared: true };
  }

  if (!durationMinutes) {
    return { ok: false, error: "missing_duration" };
  }

  const dep = subtractSecondsFromArrival(
    arrivalDate,
    arrivalTime,
    durationMinutes * 60
  );
  if (!dep.date || !dep.time) {
    return { ok: false, error: "invalid_arrival" };
  }

  data.tech_departure_date = dep.date;
  data.tech_departure_time = dep.time;
  data.tech_departure_datetime = `${dep.date}T${dep.time}`;
  return { ok: true, durationLabel: formatTravelDurationLabel(durationMinutes) };
}

module.exports = {
  eventDestinationAddress,
  parseTravelDurationMinutes,
  formatTravelDurationLabel,
  subtractSecondsFromArrival,
  applyComputedDeparture,
  resolveDepartureAddress,
  loadRouteOrigins
};