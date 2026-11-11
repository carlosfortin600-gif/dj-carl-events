const { parseEndDatetime, formatDateFr, formatDateTimeFr, CLIENT_CONTACT_SQL, clientCourtesyName } =
  require("./helpers");
const { defaultDatetimeLocalValue } = require("./app-timezone");

function getQuestionnaireSentLogs(db, eventId) {
  return db
    .prepare(
      `SELECT id, event_id, sent_date, sent_time, created_at
       FROM event_questionnaire_sent_logs
       WHERE event_id = ?
       ORDER BY sent_date DESC, sent_time DESC, id DESC`
    )
    .all(eventId);
}

function getQuestionnaireSentLogsGrouped(db) {
  const rows = db
    .prepare(
      `SELECT id, event_id, sent_date, sent_time, created_at
       FROM event_questionnaire_sent_logs
       ORDER BY sent_date DESC, sent_time DESC, id DESC`
    )
    .all();

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.event_id]) grouped[row.event_id] = [];
    grouped[row.event_id].push(row);
  }
  return grouped;
}

function formatSentAt(date, time) {
  if (!date) return "—";
  if (time) return formatDateTimeFr(date, time);
  return formatDateFr(date);
}

function syncLegacyQuestionnaireSentFields(db, eventId) {
  ensureDjNotesRow(db, eventId);
  const logs = getQuestionnaireSentLogs(db, eventId);
  const latest = logs[0] || null;

  db.prepare(
    `UPDATE dj_notes
     SET tech_questionnaire_sent = ?,
         tech_questionnaire_sent_date = ?,
         tech_questionnaire_sent_time = ?,
         updated_at = datetime('now', 'localtime')
     WHERE event_id = ?`
  ).run(
    logs.length ? "yes" : "no",
    latest?.sent_date || null,
    latest?.sent_time || null,
    eventId
  );
}

function ensureDjNotesRow(db, eventId) {
  const row = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);
  if (!row) {
    db.prepare("INSERT INTO dj_notes (event_id, content) VALUES (?, '')").run(eventId);
  }
}

const QUESTIONNAIRE_TIME_SPENT_MINUTES = 5;

function getEventForQuestionnaireTimeSpent(db, eventId) {
  return db
    .prepare(
      `SELECT e.*, ${CLIENT_CONTACT_SQL}
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.id = ?`
    )
    .get(eventId);
}

function syncTimeSpentForQuestionnaireSent(db, eventId, sentDate, sentTime) {
  const event = getEventForQuestionnaireTimeSpent(db, eventId);
  if (!event) return;

  const { addTimeSpentLog } = require("./time-spent");
  const timePart = sentTime ? String(sentTime).slice(0, 5) : "12:00";
  const contactPerson = clientCourtesyName(event);

  addTimeSpentLog(db, eventId, {
    activity: "email",
    logged_datetime: `${sentDate}T${timePart}`,
    duration_hours: String(QUESTIONNAIRE_TIME_SPENT_MINUTES / 60),
    description: "Courriel questionnaire",
    contact_person: contactPerson,
    contact_party: "client"
  });
}

function addQuestionnaireSentLog(db, eventId, body) {
  let sentDate = null;
  let sentTime = null;

  if (body.sent_datetime !== undefined) {
    const parsed = parseEndDatetime(body.sent_datetime);
    sentDate = parsed.end_date;
    sentTime = parsed.end_time;
  } else {
    sentDate = body.sent_date?.trim() || null;
    sentTime = body.sent_time?.trim() || null;
  }

  if (!sentDate) {
    return { ok: false, error: "Indiquez la date d'envoi." };
  }

  ensureDjNotesRow(db, eventId);

  db.prepare(
    `INSERT INTO event_questionnaire_sent_logs (event_id, sent_date, sent_time)
     VALUES (?, ?, ?)`
  ).run(eventId, sentDate, sentTime);

  syncLegacyQuestionnaireSentFields(db, eventId);
  syncTimeSpentForQuestionnaireSent(db, eventId, sentDate, sentTime);
  return { ok: true };
}

function deleteQuestionnaireSentLog(db, eventId, logId) {
  const result = db
    .prepare("DELETE FROM event_questionnaire_sent_logs WHERE id = ? AND event_id = ?")
    .run(logId, eventId);

  if (result.changes > 0) {
    syncLegacyQuestionnaireSentFields(db, eventId);
    return true;
  }
  return false;
}

function defaultSentDatetime() {
  return defaultDatetimeLocalValue();
}

function migrateLegacyQuestionnaireSentLogs(db) {
  const rows = db
    .prepare(
      `SELECT event_id, tech_questionnaire_sent_date, tech_questionnaire_sent_time
       FROM dj_notes
       WHERE tech_questionnaire_sent = 'yes'
         AND tech_questionnaire_sent_date IS NOT NULL
         AND tech_questionnaire_sent_date != ''`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO event_questionnaire_sent_logs (event_id, sent_date, sent_time)
     VALUES (?, ?, ?)`
  );

  for (const row of rows) {
    const existing = db
      .prepare("SELECT 1 FROM event_questionnaire_sent_logs WHERE event_id = ? LIMIT 1")
      .get(row.event_id);
    if (existing) continue;
    insert.run(row.event_id, row.tech_questionnaire_sent_date, row.tech_questionnaire_sent_time || null);
  }
}

module.exports = {
  getQuestionnaireSentLogs,
  getQuestionnaireSentLogsGrouped,
  formatSentAt,
  addQuestionnaireSentLog,
  deleteQuestionnaireSentLog,
  syncLegacyQuestionnaireSentFields,
  defaultSentDatetime,
  migrateLegacyQuestionnaireSentLogs
};
