const { getQuestionnaireForEvent } = require("./questionnaire");
const {
  summarizeFullDossierChanges,
  buildChangeSummaryText,
  buildChangeSummaryHtml
} = require("./portal-change-summary");

function ensureConfirmationHistoryTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_confirmation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      confirmed_at TEXT NOT NULL,
      confirmed_by_name TEXT NOT NULL,
      unconfirmed_at TEXT,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      changes_json TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_client_confirmation_event
    ON client_confirmation_records(event_id, confirmed_at)
  `);
}

function captureQuestionnaireSnapshot(db, eventId, eventType) {
  const questionnaire = getQuestionnaireForEvent(db, eventId, eventType);
  return JSON.parse(JSON.stringify(questionnaire.data || {}));
}

function getLastConfirmationRecord(db, eventId) {
  const row = db
    .prepare(
      `SELECT id, confirmed_at, confirmed_by_name, unconfirmed_at, snapshot_json, changes_json
       FROM client_confirmation_records
       WHERE event_id = ?
       ORDER BY confirmed_at DESC, id DESC
       LIMIT 1`
    )
    .get(eventId);
  if (!row) return null;
  return {
    ...row,
    snapshot: JSON.parse(row.snapshot_json || "{}"),
    changes: row.changes_json ? JSON.parse(row.changes_json) : []
  };
}

function getConfirmationHistory(db, eventId) {
  return db
    .prepare(
      `SELECT id, confirmed_at, confirmed_by_name, unconfirmed_at, changes_json
       FROM client_confirmation_records
       WHERE event_id = ?
       ORDER BY confirmed_at ASC, id ASC`
    )
    .all(eventId)
    .map((row, index) => ({
      ...row,
      sequence: index + 1,
      changes: row.changes_json ? JSON.parse(row.changes_json) : [],
      hasChanges: Boolean(row.changes_json && row.changes_json !== "[]")
    }));
}

function backfillConfirmationHistory(db) {
  const done = db.prepare("SELECT value FROM app_meta WHERE key = 'client_confirmation_history_backfill'").get();
  if (done) return;

  const events = db
    .prepare(
      `SELECT id, event_type, client_confirmed_at, client_confirmed_by_name
       FROM events
       WHERE client_confirmed_at IS NOT NULL AND deleted_at IS NULL`
    )
    .all();

  const insert = db.prepare(
    `INSERT INTO client_confirmation_records
       (event_id, confirmed_at, confirmed_by_name, snapshot_json, changes_json)
     VALUES (?, ?, ?, ?, NULL)`
  );

  for (const event of events) {
    const existing = db
      .prepare("SELECT 1 FROM client_confirmation_records WHERE event_id = ? LIMIT 1")
      .get(event.id);
    if (existing) continue;

    const snapshot = captureQuestionnaireSnapshot(db, event.id, event.event_type);
    insert.run(
      event.id,
      event.client_confirmed_at,
      event.client_confirmed_by_name || "",
      JSON.stringify(snapshot)
    );
  }

  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('client_confirmation_history_backfill', '1')"
  ).run();
}

function markLatestConfirmationUnconfirmed(db, eventId) {
  const active = db
    .prepare(
      `SELECT id FROM client_confirmation_records
       WHERE event_id = ? AND unconfirmed_at IS NULL
       ORDER BY confirmed_at DESC, id DESC
       LIMIT 1`
    )
    .get(eventId);
  if (!active) return;

  db.prepare(
    `UPDATE client_confirmation_records
     SET unconfirmed_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(active.id);
}

function recordConfirmationHistory(db, eventId, confirmedByName, eventType) {
  const snapshot = captureQuestionnaireSnapshot(db, eventId, eventType);
  const previous = getLastConfirmationRecord(db, eventId);
  const changes = previous
    ? summarizeFullDossierChanges(previous.snapshot, snapshot, eventType)
    : [];

  const result = db
    .prepare(
      `INSERT INTO client_confirmation_records
         (event_id, confirmed_at, confirmed_by_name, snapshot_json, changes_json)
       VALUES (?, datetime('now', 'localtime'), ?, ?, ?)`
    )
    .run(
      eventId,
      confirmedByName,
      JSON.stringify(snapshot),
      changes.length ? JSON.stringify(changes) : null
    );

  return {
    recordId: result.lastInsertRowid,
    changes,
    isReconfirmation: Boolean(previous),
    changeSummaryText: buildChangeSummaryText(changes),
    changeSummaryHtml: buildChangeSummaryHtml(changes)
  };
}

module.exports = {
  ensureConfirmationHistoryTable,
  backfillConfirmationHistory,
  captureQuestionnaireSnapshot,
  getLastConfirmationRecord,
  getConfirmationHistory,
  markLatestConfirmationUnconfirmed,
  recordConfirmationHistory
};
