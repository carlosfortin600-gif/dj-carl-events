const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");

function getEmailRdvSentLogs(db, eventId) {
  return db
    .prepare(
      `SELECT id, event_id, sent_date, sent_time, created_at
       FROM event_email_rdv_sent_logs
       WHERE event_id = ?
       ORDER BY sent_date DESC, sent_time DESC, id DESC`
    )
    .all(eventId);
}

function getEmailRdvSentLogsGrouped(db) {
  const rows = db
    .prepare(
      `SELECT id, event_id, sent_date, sent_time, created_at
       FROM event_email_rdv_sent_logs
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

function syncLegacyEmailRdvSentFields(db, eventId) {
  const logs = getEmailRdvSentLogs(db, eventId);
  const latest = logs[0] || null;

  db.prepare(
    `UPDATE dj_notes
     SET tech_email_rdv_sent = ?,
         tech_email_rdv_date = ?,
         tech_email_rdv_time = ?,
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

function addEmailRdvSentLog(db, eventId, body) {
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
    `INSERT INTO event_email_rdv_sent_logs (event_id, sent_date, sent_time)
     VALUES (?, ?, ?)`
  ).run(eventId, sentDate, sentTime);

  syncLegacyEmailRdvSentFields(db, eventId);
  return { ok: true };
}

function deleteEmailRdvSentLog(db, eventId, logId) {
  const result = db
    .prepare("DELETE FROM event_email_rdv_sent_logs WHERE id = ? AND event_id = ?")
    .run(logId, eventId);

  if (result.changes > 0) {
    syncLegacyEmailRdvSentFields(db, eventId);
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

function migrateLegacyEmailRdvSentLogs(db) {
  const rows = db
    .prepare(
      `SELECT event_id, tech_email_rdv_date, tech_email_rdv_time
       FROM dj_notes
       WHERE tech_email_rdv_sent = 'yes'
         AND tech_email_rdv_date IS NOT NULL
         AND tech_email_rdv_date != ''`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO event_email_rdv_sent_logs (event_id, sent_date, sent_time)
     VALUES (?, ?, ?)`
  );

  for (const row of rows) {
    const existing = db
      .prepare("SELECT 1 FROM event_email_rdv_sent_logs WHERE event_id = ? LIMIT 1")
      .get(row.event_id);
    if (existing) continue;
    insert.run(row.event_id, row.tech_email_rdv_date, row.tech_email_rdv_time || null);
  }
}

module.exports = {
  getEmailRdvSentLogs,
  getEmailRdvSentLogsGrouped,
  formatSentAt,
  addEmailRdvSentLog,
  deleteEmailRdvSentLog,
  syncLegacyEmailRdvSentFields,
  defaultSentDatetime,
  migrateLegacyEmailRdvSentLogs
};
