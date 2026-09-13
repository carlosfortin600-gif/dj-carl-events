const { todayLocal } = require("./helpers");

/** Location trailer louée — appliquée aux événements actuels et futurs. */
const TRAILER_RENTAL = {
  needed: "yes",
  start: "2026-11-18",
  end: "2026-12-20"
};

function getDefaultTrailerFields() {
  return {
    tech_trailer_needed: TRAILER_RENTAL.needed,
    tech_trailer_start: TRAILER_RENTAL.start,
    tech_trailer_end: TRAILER_RENTAL.end,
    tech_trailer_start_time: null,
    tech_trailer_end_time: null
  };
}

function applyTrailerDefaultsToEvent(db, eventId) {
  const fields = getDefaultTrailerFields();
  const row = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);

  if (row) {
    db.prepare(
      `UPDATE dj_notes
       SET tech_trailer_needed = ?,
           tech_trailer_start = ?,
           tech_trailer_end = ?,
           tech_trailer_start_time = ?,
           tech_trailer_end_time = ?,
           updated_at = datetime('now', 'localtime')
       WHERE event_id = ?`
    ).run(
      fields.tech_trailer_needed,
      fields.tech_trailer_start,
      fields.tech_trailer_end,
      fields.tech_trailer_start_time,
      fields.tech_trailer_end_time,
      eventId
    );
    return;
  }

  db.prepare(
    `INSERT INTO dj_notes (
       event_id, content,
       tech_trailer_needed, tech_trailer_start, tech_trailer_end,
       tech_trailer_start_time, tech_trailer_end_time
     ) VALUES (?, '', ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    fields.tech_trailer_needed,
    fields.tech_trailer_start,
    fields.tech_trailer_end,
    fields.tech_trailer_start_time,
    fields.tech_trailer_end_time
  );
}

function applyTrailerDefaultsToActiveEvents(db, fromDate = todayLocal()) {
  const eventIds = db
    .prepare(
      `SELECT id FROM events
       WHERE deleted_at IS NULL AND event_date >= ?
       ORDER BY event_date`
    )
    .all(fromDate)
    .map((row) => row.id);

  const applyAll = db.transaction((ids) => {
    for (const eventId of ids) {
      applyTrailerDefaultsToEvent(db, eventId);
    }
  });

  applyAll(eventIds);
  return eventIds.length;
}

module.exports = {
  TRAILER_RENTAL,
  getDefaultTrailerFields,
  applyTrailerDefaultsToEvent,
  applyTrailerDefaultsToActiveEvents
};
