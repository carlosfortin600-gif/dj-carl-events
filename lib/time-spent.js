const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");

const TIME_SPENT_ACTIVITIES = [
  { id: "tel", label: "Tél." },
  { id: "email", label: "E-mail" },
  { id: "recherche_musique", label: "Recherche musique" },
  { id: "montage", label: "Montage" },
  { id: "rencontre_teams", label: "Rencontre Teams" }
];

const ACTIVITY_IDS = new Set(TIME_SPENT_ACTIVITIES.map((a) => a.id));

function buildDurationOptions(maxHours = 8) {
  const options = [];
  for (let value = 0.5; value <= maxHours + 0.001; value += 0.5) {
    options.push({ value, label: formatDurationHours(value) });
  }
  return options;
}

const TIME_SPENT_DURATIONS = buildDurationOptions(8);
const DURATION_VALUES = new Set(TIME_SPENT_DURATIONS.map((d) => d.value));

function formatDurationHours(hours) {
  const whole = Math.floor(hours);
  const mins = Math.round((hours - whole) * 60);
  if (whole && mins) return `${whole} h ${mins} min`;
  if (whole) return `${whole} h`;
  return `${mins} min`;
}

function activityLabel(activityId) {
  return TIME_SPENT_ACTIVITIES.find((a) => a.id === activityId)?.label || activityId;
}

function getTimeSpentLogs(db, eventId) {
  return db
    .prepare(
      `SELECT id, activity, logged_date, logged_time, duration_hours, created_at
       FROM event_time_logs
       WHERE event_id = ?
       ORDER BY logged_date DESC, logged_time DESC, id DESC`
    )
    .all(eventId);
}

function getTimeSpentTotalHours(db, eventId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(duration_hours), 0) AS total
       FROM event_time_logs
       WHERE event_id = ?`
    )
    .get(eventId);
  return row?.total || 0;
}

function addTimeSpentLog(db, eventId, body) {
  const activity = body.activity?.trim();
  if (!ACTIVITY_IDS.has(activity)) {
    return { ok: false, error: "Choisissez une activité." };
  }

  const duration = Number.parseFloat(body.duration_hours);
  if (!Number.isFinite(duration) || !DURATION_VALUES.has(duration)) {
    return { ok: false, error: "Choisissez une durée valide." };
  }

  let loggedDate = null;
  let loggedTime = null;
  if (body.logged_datetime !== undefined) {
    const parsed = parseEndDatetime(body.logged_datetime);
    loggedDate = parsed.end_date;
    loggedTime = parsed.end_time;
  } else {
    loggedDate = body.logged_date?.trim() || null;
    loggedTime = body.logged_time?.trim() || null;
  }

  if (!loggedDate) {
    return { ok: false, error: "Indiquez la date et l'heure." };
  }

  db.prepare(
    `INSERT INTO event_time_logs (event_id, activity, logged_date, logged_time, duration_hours)
     VALUES (?, ?, ?, ?, ?)`
  ).run(eventId, activity, loggedDate, loggedTime, duration);

  return { ok: true };
}

function deleteTimeSpentLog(db, eventId, logId) {
  const result = db
    .prepare("DELETE FROM event_time_logs WHERE id = ? AND event_id = ?")
    .run(logId, eventId);
  return result.changes > 0;
}

function defaultLoggedDatetime(eventDate) {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}T${time}`;
}

function formatLoggedAt(date, time) {
  if (!date) return "—";
  if (time) return formatDateTimeFr(date, time);
  return formatDateFr(date);
}

module.exports = {
  TIME_SPENT_ACTIVITIES,
  TIME_SPENT_DURATIONS,
  formatDurationHours,
  activityLabel,
  getTimeSpentLogs,
  getTimeSpentTotalHours,
  addTimeSpentLog,
  deleteTimeSpentLog,
  defaultLoggedDatetime,
  formatLoggedAt
};
