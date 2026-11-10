const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");
const { defaultDatetimeLocalValue } = require("./app-timezone");

const TIME_SPENT_ACTIVITIES = [
  { id: "tel", label: "Tél." },
  { id: "email", label: "E-mail" },
  { id: "recherche_musique", label: "Recherche musique" },
  { id: "montage", label: "Montage" },
  { id: "rencontre_teams", label: "Rencontre Teams" }
];

const ACTIVITY_IDS = new Set(TIME_SPENT_ACTIVITIES.map((a) => a.id));

/** Activités qui comptent comme une communication client (historique « Client contacté »). */
const CLIENT_CONTACT_ACTIVITY_IDS = new Set(["tel", "email", "rencontre_teams"]);

const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_HOURS = 8;
const DURATION_STEP_MINUTES = 5;

function buildDurationOptions(maxHours = MAX_DURATION_HOURS) {
  const options = [];
  const maxMinutes = maxHours * 60;
  for (let mins = MIN_DURATION_MINUTES; mins <= maxMinutes; mins += DURATION_STEP_MINUTES) {
    const value = mins / 60;
    options.push({ value, minutes: mins, label: formatDurationHours(value) });
  }
  return options;
}

const TIME_SPENT_DURATIONS = buildDurationOptions(MAX_DURATION_HOURS);

function isValidDurationHours(hours) {
  if (!Number.isFinite(hours)) return false;
  const mins = Math.round(hours * 60);
  if (mins < MIN_DURATION_MINUTES || mins > MAX_DURATION_HOURS * 60) return false;
  return mins % DURATION_STEP_MINUTES === 0;
}

function snapDurationToStep(hours) {
  const mins = Math.round(Number(hours) * 60);
  const snapped = Math.round(mins / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES;
  return snapped / 60;
}

function durationSelectValue(hours) {
  return String(snapDurationToStep(hours));
}

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
      `SELECT id, activity, logged_date, logged_time, duration_hours, description, created_at
       FROM event_time_logs
       WHERE event_id = ?
       ORDER BY logged_date DESC, logged_time DESC, id DESC`
    )
    .all(eventId);
}

function getTimeSpentLogById(db, logId, eventId) {
  return db
    .prepare(
      `SELECT id, activity, logged_date, logged_time, duration_hours, description, created_at
       FROM event_time_logs
       WHERE id = ? AND event_id = ?`
    )
    .get(logId, eventId);
}

function loggedDatetimeLocalValue(loggedDate, loggedTime) {
  if (!loggedDate) return "";
  const time = loggedTime ? String(loggedTime).slice(0, 5) : "00:00";
  return `${loggedDate}T${time}`;
}

function parseTimeSpentFields(body) {
  const activity = body.activity?.trim();
  if (!ACTIVITY_IDS.has(activity)) {
    return { ok: false, error: "Choisissez une activité." };
  }

  const duration = Number.parseFloat(String(body.duration_hours || "").replace(",", "."));
  if (!isValidDurationHours(duration)) {
    return { ok: false, error: "Choisissez une durée valide (par pas de 5 minutes)." };
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

  const description = body.description?.trim() || null;

  return {
    ok: true,
    data: {
      activity,
      loggedDate,
      loggedTime,
      duration,
      description
    }
  };
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
  const parsed = parseTimeSpentFields(body);
  if (!parsed.ok) return parsed;
  const { activity, loggedDate, loggedTime, duration, description } = parsed.data;

  db.prepare(
    `INSERT INTO event_time_logs (event_id, activity, logged_date, logged_time, duration_hours, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(eventId, activity, loggedDate, loggedTime, duration, description);

  let clientContactLogged = false;
  if (CLIENT_CONTACT_ACTIVITY_IDS.has(activity)) {
    const { addClientContactLog } = require("./client-contact-log");
    const label = activityLabel(activity);
    const note = description ? `${label} — ${description}` : label;
    const timePart = loggedTime ? loggedTime.slice(0, 5) : "00:00";
    const contactResult = addClientContactLog(db, eventId, {
      contact_datetime: `${loggedDate}T${timePart}`,
      contact_person: body.contact_person,
      contact_party: body.contact_party,
      note
    });
    clientContactLogged = contactResult.ok;
  }

  return { ok: true, clientContactLogged };
}

function updateTimeSpentLog(db, eventId, logId, body) {
  const existing = getTimeSpentLogById(db, logId, eventId);
  if (!existing) {
    return { ok: false, error: "Entrée introuvable." };
  }

  const parsed = parseTimeSpentFields(body);
  if (!parsed.ok) return parsed;
  const { activity, loggedDate, loggedTime, duration, description } = parsed.data;

  db.prepare(
    `UPDATE event_time_logs
     SET activity = ?, logged_date = ?, logged_time = ?, duration_hours = ?, description = ?
     WHERE id = ? AND event_id = ?`
  ).run(activity, loggedDate, loggedTime, duration, description, logId, eventId);

  return { ok: true };
}

function deleteTimeSpentLog(db, eventId, logId) {
  const result = db
    .prepare("DELETE FROM event_time_logs WHERE id = ? AND event_id = ?")
    .run(logId, eventId);
  return result.changes > 0;
}

function defaultLoggedDatetime() {
  return defaultDatetimeLocalValue();
}

function formatLoggedAt(date, time) {
  if (!date) return "—";
  if (time) return formatDateTimeFr(date, time);
  return formatDateFr(date);
}

module.exports = {
  TIME_SPENT_ACTIVITIES,
  CLIENT_CONTACT_ACTIVITY_IDS,
  TIME_SPENT_DURATIONS,
  formatDurationHours,
  activityLabel,
  getTimeSpentLogs,
  getTimeSpentLogById,
  getTimeSpentTotalHours,
  addTimeSpentLog,
  updateTimeSpentLog,
  deleteTimeSpentLog,
  defaultLoggedDatetime,
  formatLoggedAt,
  loggedDatetimeLocalValue,
  durationSelectValue,
  DURATION_STEP_MINUTES
};
