const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");

function getClientContactLogs(db, eventId) {
  return db
    .prepare(
      `SELECT id, event_id, contact_date, contact_time, note, created_at
       FROM event_client_contact_logs
       WHERE event_id = ?
       ORDER BY contact_date DESC, contact_time DESC, id DESC`
    )
    .all(eventId);
}

function getClientContactLogsGrouped(db) {
  const rows = db
    .prepare(
      `SELECT id, event_id, contact_date, contact_time, note, created_at
       FROM event_client_contact_logs
       ORDER BY contact_date DESC, contact_time DESC, id DESC`
    )
    .all();

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.event_id]) grouped[row.event_id] = [];
    grouped[row.event_id].push(row);
  }
  return grouped;
}

function formatContactAt(date, time, note) {
  let label = "";
  if (!date) return "—";
  label = time ? formatDateTimeFr(date, time) : formatDateFr(date);
  if (note?.trim()) label = `${label} — ${note.trim()}`;
  return label;
}

function syncLegacyClientContactFields(db, eventId) {
  const logs = getClientContactLogs(db, eventId);
  const latest = logs[0] || null;

  db.prepare(
    `UPDATE dj_notes
     SET tech_client_called = ?,
         tech_client_call_date = ?,
         tech_client_call_time = ?,
         updated_at = datetime('now', 'localtime')
     WHERE event_id = ?`
  ).run(
    logs.length ? "yes" : "no",
    latest?.contact_date || null,
    latest?.contact_time || null,
    eventId
  );
}

function ensureDjNotesRow(db, eventId) {
  const row = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);
  if (!row) {
    db.prepare("INSERT INTO dj_notes (event_id, content) VALUES (?, '')").run(eventId);
  }
}

function addClientContactLog(db, eventId, body) {
  let contactDate = null;
  let contactTime = null;

  if (body.contact_datetime !== undefined) {
    const parsed = parseEndDatetime(body.contact_datetime);
    contactDate = parsed.end_date;
    contactTime = parsed.end_time;
  } else {
    contactDate = body.contact_date?.trim() || null;
    contactTime = body.contact_time?.trim() || null;
  }

  if (!contactDate) {
    return { ok: false, error: "Indiquez la date du contact." };
  }

  const note = body.note?.trim() || null;

  ensureDjNotesRow(db, eventId);

  db.prepare(
    `INSERT INTO event_client_contact_logs (event_id, contact_date, contact_time, note)
     VALUES (?, ?, ?, ?)`
  ).run(eventId, contactDate, contactTime, note);

  syncLegacyClientContactFields(db, eventId);
  return { ok: true };
}

function deleteClientContactLog(db, eventId, logId) {
  const result = db
    .prepare("DELETE FROM event_client_contact_logs WHERE id = ? AND event_id = ?")
    .run(logId, eventId);

  if (result.changes > 0) {
    syncLegacyClientContactFields(db, eventId);
    return true;
  }
  return false;
}

function defaultContactDatetime() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `${date}T${time}`;
}

function migrateLegacyClientContactLogs(db) {
  const rows = db
    .prepare(
      `SELECT event_id, tech_client_call_date, tech_client_call_time
       FROM dj_notes
       WHERE tech_client_called = 'yes'
         AND tech_client_call_date IS NOT NULL
         AND tech_client_call_date != ''`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO event_client_contact_logs (event_id, contact_date, contact_time, note)
     VALUES (?, ?, ?, ?)`
  );

  for (const row of rows) {
    const existing = db
      .prepare("SELECT 1 FROM event_client_contact_logs WHERE event_id = ? LIMIT 1")
      .get(row.event_id);
    if (existing) continue;
    insert.run(row.event_id, row.tech_client_call_date, row.tech_client_call_time || null, null);
  }
}

module.exports = {
  getClientContactLogs,
  getClientContactLogsGrouped,
  formatContactAt,
  addClientContactLog,
  deleteClientContactLog,
  syncLegacyClientContactFields,
  defaultContactDatetime,
  migrateLegacyClientContactLogs
};
