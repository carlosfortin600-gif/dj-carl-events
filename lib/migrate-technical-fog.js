function migrateTechnicalFogToDjNotes(db) {
  const done = db
    .prepare("SELECT value FROM app_meta WHERE key = 'technical_fog_migrated_to_dj_notes'")
    .get();
  if (done) return;

  const rows = db.prepare("SELECT event_id, data FROM wedding_questionnaires").all();
  const update = db.prepare(
    `UPDATE dj_notes SET tech_technical_fog_allowed = ?
     WHERE event_id = ?
       AND (tech_technical_fog_allowed IS NULL OR tech_technical_fog_allowed = '')`
  );
  const insertRow = db.prepare("INSERT INTO dj_notes (event_id, content) VALUES (?, '')");

  for (const row of rows) {
    let data;
    try {
      data = JSON.parse(row.data || "{}");
    } catch {
      continue;
    }
    const fog = data?.venue_contact?.technical_fog_allowed;
    if (fog !== "yes" && fog !== "no") continue;

    const notes = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(row.event_id);
    if (!notes) insertRow.run(row.event_id);
    update.run(fog, row.event_id);
  }

  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('technical_fog_migrated_to_dj_notes', '1')"
  ).run();
}

module.exports = { migrateTechnicalFogToDjNotes };
