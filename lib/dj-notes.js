const { parseEndDatetime } = require("./helpers");

function parseStoredDatetime(data, datetimeKey) {
  if (data[datetimeKey] === undefined) return { date: null, time: null };
  const parsed = parseEndDatetime(data[datetimeKey]);
  return { date: parsed.end_date, time: parsed.end_time };
}

function isYes(value) {
  return value === "yes";
}

function getDjNotes(db, eventId) {
  return (
    db
      .prepare(
        `SELECT content, updated_at,
                tech_departure_date, tech_departure_time,
                tech_arrival_date, tech_arrival_time,
                tech_trailer_needed,
                tech_trailer_start, tech_trailer_start_time,
                tech_trailer_end, tech_trailer_end_time,
                tech_room_needed, tech_room_location,
                tech_room_start, tech_room_start_time,
                tech_room_end, tech_room_end_time
         FROM dj_notes WHERE event_id = ?`
      )
      .get(eventId) || {
      content: "",
      updated_at: null,
      tech_departure_date: null,
      tech_departure_time: null,
      tech_arrival_date: null,
      tech_arrival_time: null,
      tech_trailer_needed: null,
      tech_trailer_start: null,
      tech_trailer_start_time: null,
      tech_trailer_end: null,
      tech_trailer_end_time: null,
      tech_room_needed: null,
      tech_room_location: null,
      tech_room_start: null,
      tech_room_start_time: null,
      tech_room_end: null,
      tech_room_end_time: null
    }
  );
}

function saveDjNotes(db, eventId, data) {
  const content = data.content || "";

  let techDepartureDate = data.tech_departure_date?.trim() || null;
  let techDepartureTime = data.tech_departure_time?.trim() || null;
  if (data.tech_departure_datetime !== undefined) {
    const parsed = parseStoredDatetime(data, "tech_departure_datetime");
    techDepartureDate = parsed.date;
    techDepartureTime = parsed.time;
  }

  let techArrivalDate = data.tech_arrival_date?.trim() || null;
  let techArrivalTime = data.tech_arrival_time?.trim() || null;
  if (data.tech_arrival_datetime !== undefined) {
    const parsed = parseStoredDatetime(data, "tech_arrival_datetime");
    techArrivalDate = parsed.date;
    techArrivalTime = parsed.time;
  }

  const techTrailerNeeded = data.tech_trailer_needed === "yes" ? "yes" : "no";
  let techTrailerStart = null;
  let techTrailerStartTime = null;
  let techTrailerEnd = null;
  let techTrailerEndTime = null;
  if (isYes(techTrailerNeeded)) {
    if (data.tech_trailer_start_datetime !== undefined) {
      const start = parseStoredDatetime(data, "tech_trailer_start_datetime");
      techTrailerStart = start.date;
      techTrailerStartTime = start.time;
    } else {
      techTrailerStart = data.tech_trailer_start?.trim() || null;
      techTrailerStartTime = data.tech_trailer_start_time?.trim() || null;
    }
    if (data.tech_trailer_end_datetime !== undefined) {
      const end = parseStoredDatetime(data, "tech_trailer_end_datetime");
      techTrailerEnd = end.date;
      techTrailerEndTime = end.time;
    } else {
      techTrailerEnd = data.tech_trailer_end?.trim() || null;
      techTrailerEndTime = data.tech_trailer_end_time?.trim() || null;
    }
  }

  const techRoomNeeded = data.tech_room_needed === "yes" ? "yes" : "no";
  let techRoomLocation = null;
  let techRoomStart = null;
  let techRoomStartTime = null;
  let techRoomEnd = null;
  let techRoomEndTime = null;
  if (isYes(techRoomNeeded)) {
    techRoomLocation = data.tech_room_location?.trim() || null;
    if (data.tech_room_start_datetime !== undefined) {
      const start = parseStoredDatetime(data, "tech_room_start_datetime");
      techRoomStart = start.date;
      techRoomStartTime = start.time;
    } else {
      techRoomStart = data.tech_room_start?.trim() || null;
      techRoomStartTime = data.tech_room_start_time?.trim() || null;
    }
    if (data.tech_room_end_datetime !== undefined) {
      const end = parseStoredDatetime(data, "tech_room_end_datetime");
      techRoomEnd = end.date;
      techRoomEndTime = end.time;
    } else {
      techRoomEnd = data.tech_room_end?.trim() || null;
      techRoomEndTime = data.tech_room_end_time?.trim() || null;
    }
  }

  const existing = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);
  if (existing) {
    db.prepare(
      `UPDATE dj_notes
       SET content = ?,
           tech_departure_date = ?,
           tech_departure_time = ?,
           tech_arrival_date = ?,
           tech_arrival_time = ?,
           tech_trailer_needed = ?,
           tech_trailer_start = ?,
           tech_trailer_start_time = ?,
           tech_trailer_end = ?,
           tech_trailer_end_time = ?,
           tech_room_needed = ?,
           tech_room_location = ?,
           tech_room_start = ?,
           tech_room_start_time = ?,
           tech_room_end = ?,
           tech_room_end_time = ?,
           updated_at = datetime('now', 'localtime')
       WHERE event_id = ?`
    ).run(
      content,
      techDepartureDate,
      techDepartureTime,
      techArrivalDate,
      techArrivalTime,
      techTrailerNeeded,
      techTrailerStart,
      techTrailerStartTime,
      techTrailerEnd,
      techTrailerEndTime,
      techRoomNeeded,
      techRoomLocation,
      techRoomStart,
      techRoomStartTime,
      techRoomEnd,
      techRoomEndTime,
      eventId
    );
  } else {
    db.prepare(
      `INSERT INTO dj_notes (
         event_id, content,
         tech_departure_date, tech_departure_time,
         tech_arrival_date, tech_arrival_time,
         tech_trailer_needed,
         tech_trailer_start, tech_trailer_start_time,
         tech_trailer_end, tech_trailer_end_time,
         tech_room_needed, tech_room_location,
         tech_room_start, tech_room_start_time,
         tech_room_end, tech_room_end_time
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      content,
      techDepartureDate,
      techDepartureTime,
      techArrivalDate,
      techArrivalTime,
      techTrailerNeeded,
      techTrailerStart,
      techTrailerStartTime,
      techTrailerEnd,
      techTrailerEndTime,
      techRoomNeeded,
      techRoomLocation,
      techRoomStart,
      techRoomStartTime,
      techRoomEnd,
      techRoomEndTime
    );
  }
}

module.exports = {
  getDjNotes,
  saveDjNotes
};
