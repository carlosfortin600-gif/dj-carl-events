const { parseEndDatetime } = require("./helpers");
const {
  loadRouteOrigins,
  resolveDepartureAddress,
  fetchDrivingRoute
} = require("./route-time");

function eventDestinationAddress(event) {
  const parts = [event.address, event.city].filter((s) => s && String(s).trim());
  const joined = parts.join(", ");
  if (joined) return joined.trim();
  return event.venue?.trim() || "";
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

async function applyAutoDepartureFromArrival(db, eventId, data) {
  const { date: arrivalDate, time: arrivalTime } = parseArrivalFromForm(data);

  if (!arrivalDate || !arrivalTime) {
    data.tech_departure_date = null;
    data.tech_departure_time = null;
    data.tech_departure_datetime = "";
    return { ok: true, cleared: true };
  }

  const event = db.prepare("SELECT * FROM events WHERE id = ? AND deleted_at IS NULL").get(eventId);
  if (!event) return { ok: false, error: "Event not found" };

  const origins = loadRouteOrigins();
  const origin = resolveDepartureAddress(
    event.route_origin_key,
    event.route_origin_custom,
    origins
  );
  const destination = eventDestinationAddress(event);

  if (!origin) {
    return { ok: false, error: "missing_origin" };
  }
  if (!destination) {
    return { ok: false, error: "missing_destination" };
  }

  try {
    const route = await fetchDrivingRoute(origin, destination);
    const dep = subtractSecondsFromArrival(
      arrivalDate,
      arrivalTime,
      route.durationSeconds
    );
    if (!dep.date || !dep.time) {
      return { ok: false, error: "invalid_arrival" };
    }
    data.tech_departure_date = dep.date;
    data.tech_departure_time = dep.time;
    data.tech_departure_datetime = `${dep.date}T${dep.time}`;
    return { ok: true, durationLabel: route.durationLabel };
  } catch (err) {
    return { ok: false, error: err.message || "route_failed" };
  }
}

module.exports = {
  eventDestinationAddress,
  subtractSecondsFromArrival,
  applyAutoDepartureFromArrival
};