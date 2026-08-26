const { parseEndDatetime, formatDateFr, formatDateTimeFr } = require("./helpers");

function parseStoredDatetime(data, datetimeKey) {
  if (data[datetimeKey] === undefined) return { date: null, time: null };
  const parsed = parseEndDatetime(data[datetimeKey]);
  return { date: parsed.end_date, time: parsed.end_time };
}

function isYes(value) {
  return value === "yes";
}

function hasText(value) {
  return Boolean(value && String(value).trim());
}

function isHotelRented(notes) {
  if (!isYes(notes.tech_room_needed)) return false;
  return (
    hasText(notes.tech_room_location) ||
    hasText(notes.tech_room_start) ||
    hasText(notes.tech_room_end)
  );
}

function isTrailerRented(notes) {
  if (!isYes(notes.tech_trailer_needed)) return false;
  return hasText(notes.tech_trailer_start) || hasText(notes.tech_trailer_end);
}

function formatStoredDatetime(date, time) {
  if (!date) return null;
  if (time) return formatDateTimeFr(date, time);
  return formatDateFr(date);
}

function getDjNotes(db, eventId) {
  return (
    db
      .prepare(
        `SELECT content, updated_at,
                tech_departure_date, tech_departure_time,
                tech_arrival_date, tech_arrival_time,
                tech_charged_price,
                tech_client_called,
                tech_client_call_date, tech_client_call_time,
                tech_callback_name,
                tech_callback_date, tech_callback_time,
                tech_questionnaire_sent,
                tech_questionnaire_sent_date, tech_questionnaire_sent_time,
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
      tech_charged_price: null,
      tech_client_called: null,
      tech_client_call_date: null,
      tech_client_call_time: null,
      tech_callback_name: null,
      tech_callback_date: null,
      tech_callback_time: null,
      tech_questionnaire_sent: null,
      tech_questionnaire_sent_date: null,
      tech_questionnaire_sent_time: null,
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
  const existing = getDjNotes(db, eventId);
  const scope = data.save_scope || data.return_tab || "all";
  const saveContent = scope === "notes" || scope === "all";
  const saveAllTechnique = scope === "gestion" || scope === "all";
  const saveLocation = saveAllTechnique || scope === "location";
  const saveDepart = saveAllTechnique || scope === "depart";
  const saveQuestionnaireSent = scope === "questionnaire_sent";

  const content = saveContent ? (data.content || "") : (existing.content || "");

  let techDepartureDate = existing.tech_departure_date;
  let techDepartureTime = existing.tech_departure_time;
  let techArrivalDate = existing.tech_arrival_date;
  let techArrivalTime = existing.tech_arrival_time;
  let techChargedPrice = existing.tech_charged_price;
  let techClientCalled = existing.tech_client_called || "no";
  let techClientCallDate = existing.tech_client_call_date;
  let techClientCallTime = existing.tech_client_call_time;
  let techCallbackName = existing.tech_callback_name;
  let techCallbackDate = existing.tech_callback_date;
  let techCallbackTime = existing.tech_callback_time;
  let techQuestionnaireSent = existing.tech_questionnaire_sent || "no";
  let techQuestionnaireSentDate = existing.tech_questionnaire_sent_date;
  let techQuestionnaireSentTime = existing.tech_questionnaire_sent_time;
  let techTrailerNeeded = existing.tech_trailer_needed || "no";
  let techTrailerStart = existing.tech_trailer_start;
  let techTrailerStartTime = existing.tech_trailer_start_time;
  let techTrailerEnd = existing.tech_trailer_end;
  let techTrailerEndTime = existing.tech_trailer_end_time;
  let techRoomNeeded = existing.tech_room_needed || "no";
  let techRoomLocation = existing.tech_room_location;
  let techRoomStart = existing.tech_room_start;
  let techRoomStartTime = existing.tech_room_start_time;
  let techRoomEnd = existing.tech_room_end;
  let techRoomEndTime = existing.tech_room_end_time;

  if (saveDepart) {
    if (data.tech_departure_datetime !== undefined) {
      const parsed = parseStoredDatetime(data, "tech_departure_datetime");
      techDepartureDate = parsed.date;
      techDepartureTime = parsed.time;
    } else {
      techDepartureDate = data.tech_departure_date?.trim() || null;
      techDepartureTime = data.tech_departure_time?.trim() || null;
    }

    if (data.tech_arrival_datetime !== undefined) {
      const parsed = parseStoredDatetime(data, "tech_arrival_datetime");
      techArrivalDate = parsed.date;
      techArrivalTime = parsed.time;
    } else {
      techArrivalDate = data.tech_arrival_date?.trim() || null;
      techArrivalTime = data.tech_arrival_time?.trim() || null;
    }

    if (data.tech_charged_price !== undefined) {
      techChargedPrice = data.tech_charged_price?.trim() || null;
    }

    techClientCalled = data.tech_client_called === "yes" ? "yes" : "no";
    techClientCallDate = null;
    techClientCallTime = null;
    if (isYes(techClientCalled)) {
      if (data.tech_client_call_datetime !== undefined) {
        const parsed = parseStoredDatetime(data, "tech_client_call_datetime");
        techClientCallDate = parsed.date;
        techClientCallTime = parsed.time;
      } else {
        techClientCallDate = data.tech_client_call_date?.trim() || null;
        techClientCallTime = data.tech_client_call_time?.trim() || null;
      }
    }

    techCallbackName = data.tech_callback_name?.trim() || null;
    if (data.tech_callback_datetime !== undefined) {
      const parsed = parseStoredDatetime(data, "tech_callback_datetime");
      techCallbackDate = parsed.date;
      techCallbackTime = parsed.time;
    } else {
      techCallbackDate = data.tech_callback_date?.trim() || null;
      techCallbackTime = data.tech_callback_time?.trim() || null;
    }

    techQuestionnaireSent = data.tech_questionnaire_sent === "yes" ? "yes" : "no";
    techQuestionnaireSentDate = null;
    techQuestionnaireSentTime = null;
    if (isYes(techQuestionnaireSent)) {
      if (data.tech_questionnaire_sent_datetime !== undefined) {
        const parsed = parseStoredDatetime(data, "tech_questionnaire_sent_datetime");
        techQuestionnaireSentDate = parsed.date;
        techQuestionnaireSentTime = parsed.time;
      } else {
        techQuestionnaireSentDate = data.tech_questionnaire_sent_date?.trim() || null;
        techQuestionnaireSentTime = data.tech_questionnaire_sent_time?.trim() || null;
      }
    }
  }

  if (saveQuestionnaireSent) {
    techQuestionnaireSent = data.tech_questionnaire_sent === "yes" ? "yes" : "no";
    techQuestionnaireSentDate = null;
    techQuestionnaireSentTime = null;
    if (isYes(techQuestionnaireSent)) {
      if (data.tech_questionnaire_sent_datetime !== undefined) {
        const parsed = parseStoredDatetime(data, "tech_questionnaire_sent_datetime");
        techQuestionnaireSentDate = parsed.date;
        techQuestionnaireSentTime = parsed.time;
      } else {
        techQuestionnaireSentDate = data.tech_questionnaire_sent_date?.trim() || null;
        techQuestionnaireSentTime = data.tech_questionnaire_sent_time?.trim() || null;
      }
    }
  }

  if (saveLocation) {
    techTrailerNeeded = data.tech_trailer_needed === "yes" ? "yes" : "no";
    techTrailerStart = null;
    techTrailerStartTime = null;
    techTrailerEnd = null;
    techTrailerEndTime = null;
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

    techRoomNeeded = data.tech_room_needed === "yes" ? "yes" : "no";
    techRoomLocation = null;
    techRoomStart = null;
    techRoomStartTime = null;
    techRoomEnd = null;
    techRoomEndTime = null;
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
  }

  const rowExists = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);
  if (rowExists) {
    db.prepare(
      `UPDATE dj_notes
       SET content = ?,
           tech_departure_date = ?,
           tech_departure_time = ?,
           tech_arrival_date = ?,
           tech_arrival_time = ?,
           tech_charged_price = ?,
           tech_client_called = ?,
           tech_client_call_date = ?,
           tech_client_call_time = ?,
           tech_callback_name = ?,
           tech_callback_date = ?,
           tech_callback_time = ?,
           tech_questionnaire_sent = ?,
           tech_questionnaire_sent_date = ?,
           tech_questionnaire_sent_time = ?,
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
      techChargedPrice,
      techClientCalled,
      techClientCallDate,
      techClientCallTime,
      techCallbackName,
      techCallbackDate,
      techCallbackTime,
      techQuestionnaireSent,
      techQuestionnaireSentDate,
      techQuestionnaireSentTime,
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
         tech_charged_price,
         tech_client_called,
         tech_client_call_date, tech_client_call_time,
         tech_callback_name,
         tech_callback_date, tech_callback_time,
         tech_questionnaire_sent,
         tech_questionnaire_sent_date, tech_questionnaire_sent_time,
         tech_trailer_needed,
         tech_trailer_start, tech_trailer_start_time,
         tech_trailer_end, tech_trailer_end_time,
         tech_room_needed, tech_room_location,
         tech_room_start, tech_room_start_time,
         tech_room_end, tech_room_end_time
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      content,
      techDepartureDate,
      techDepartureTime,
      techArrivalDate,
      techArrivalTime,
      techChargedPrice,
      techClientCalled,
      techClientCallDate,
      techClientCallTime,
      techCallbackName,
      techCallbackDate,
      techCallbackTime,
      techQuestionnaireSent,
      techQuestionnaireSentDate,
      techQuestionnaireSentTime,
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

function summarizeLocationNotes(notes) {
  return {
    hotelNeeded: isYes(notes.tech_room_needed),
    hotelRented: isHotelRented(notes),
    trailerNeeded: isYes(notes.tech_trailer_needed),
    trailerRented: isTrailerRented(notes),
    chargedPrice: notes.tech_charged_price?.trim() || null,
    clientCalled: isYes(notes.tech_client_called),
    clientCallAt: formatStoredDatetime(notes.tech_client_call_date, notes.tech_client_call_time),
    callbackName: notes.tech_callback_name?.trim() || null,
    callbackAt: formatStoredDatetime(notes.tech_callback_date, notes.tech_callback_time),
    questionnaireSent: isYes(notes.tech_questionnaire_sent),
    questionnaireSentAt: formatStoredDatetime(
      notes.tech_questionnaire_sent_date,
      notes.tech_questionnaire_sent_time
    ),
    questionnaireSentDate: notes.tech_questionnaire_sent_date || null,
    questionnaireSentTime: notes.tech_questionnaire_sent_time || null,
    questionnaireSentValue: notes.tech_questionnaire_sent || null
  };
}

function getEventLocationSummaries(db) {
  const rows = db
    .prepare(
      `SELECT event_id, tech_trailer_needed, tech_trailer_start, tech_trailer_end,
              tech_room_needed, tech_room_location, tech_room_start, tech_room_end,
              tech_charged_price,
              tech_client_called,
              tech_client_call_date, tech_client_call_time,
              tech_callback_name,
              tech_callback_date, tech_callback_time,
              tech_questionnaire_sent,
              tech_questionnaire_sent_date, tech_questionnaire_sent_time
       FROM dj_notes`
    )
    .all();

  const summaries = {};
  for (const row of rows) {
    summaries[row.event_id] = summarizeLocationNotes(row);
  }
  return summaries;
}

module.exports = {
  getDjNotes,
  saveDjNotes,
  getEventLocationSummaries,
  summarizeLocationNotes
};
