const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");

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
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}T${time}`;
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
