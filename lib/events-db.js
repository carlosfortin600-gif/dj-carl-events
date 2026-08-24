const {
  todayLocal,
  clientShortName,
  clientFullName,
  weddingLastName,
  parseServices,
  parseAllServices,
  parseBingoMusicalStyle,
  parseOnConnaitChansonNotes,
  parseAnimationIncluded,
  parseAnimationNotes,
  parseVenueElevator,
  applyAnimationServiceSelection,
  splitServicesForForm,
  parseEndDatetime
} = require("./helpers");
const { isQuestionnaireCompleteForEvent, isWeddingEvent, getQuestionnaireLabel } = require("./questionnaire");
const { defaultPartyQuestionnaire } = require("./party-questionnaire");
const { getPartyMusicData, isPartyMusicFilled } = require("./music");
const { ensurePortalToken } = require("./portal");

function applyEndDatetimeFields(data) {
  if (data.end_datetime !== undefined) {
    const parsed = parseEndDatetime(data.end_datetime);
    data.end_date = parsed.end_date;
    data.end_time = parsed.end_time;
  }
  return data;
}

function getAllEvents(db, { includeDeleted = false } = {}) {
  const deletedClause = includeDeleted ? "" : "WHERE e.deleted_at IS NULL";
  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email
       FROM events e
       JOIN clients c ON c.id = e.client_id
       ${deletedClause}
       ORDER BY e.event_date ASC, e.start_time ASC`
    )
    .all();
}

function getDeletedEvents(db) {
  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NOT NULL
       ORDER BY e.deleted_at DESC`
    )
    .all();
}

function getDashboardData(db) {
  const events = getAllEvents(db);
  const today = todayLocal();

  const upcoming = enrichEventsWithChecklist(
    db,
    events.filter((e) => e.event_date >= today)
  );
  const past = enrichEventsWithChecklist(
    db,
    events.filter((e) => e.event_date < today).reverse()
  );

  const stats = {
    total: events.length,
    incomplete: events.filter((e) => e.status === "a_completer").length,
    ready: events.filter((e) => e.status === "pret").length,
    inPreparation: events.filter((e) => e.status === "en_preparation").length,
    done: events.filter((e) => e.status === "termine").length,
    deleted: getDeletedEvents(db).length
  };

  return {
    events,
    upcoming,
    past,
    deletedEvents: getDeletedEvents(db),
    stats,
    today
  };
}

function getEventById(db, id) {
  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email, c.created_at AS client_created_at
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.id = ?`
    )
    .get(id);
}

function getEventServices(db, eventId) {
  return db
    .prepare(
      "SELECT service_name FROM event_services WHERE event_id = ? ORDER BY service_name"
    )
    .all(eventId)
    .map((row) => row.service_name);
}

function getEventSummary(db, eventId, eventType) {
  const timelineCount = db
    .prepare("SELECT COUNT(*) AS count FROM timeline_items WHERE event_id = ?")
    .get(eventId).count;

  const songCount = db
    .prepare("SELECT COUNT(*) AS count FROM songs WHERE event_id = ?")
    .get(eventId).count;

  const questionnaire = db
    .prepare("SELECT data FROM wedding_questionnaires WHERE event_id = ?")
    .get(eventId);

  let questionnaireComplete = false;
  let firstDanceDefined = false;

  if (questionnaire) {
    try {
      const data = JSON.parse(questionnaire.data || "{}");
      questionnaireComplete = isQuestionnaireCompleteForEvent(data, eventType);
      if (isWeddingEvent(eventType)) {
        firstDanceDefined = Boolean(
          data.first_dance?.enabled === "yes" &&
            (data.first_dance?.song || data.first_dance?.artist)
        );
      }
    } catch {
      questionnaireComplete = false;
    }
  }

  const firstDanceSong = db
    .prepare(
      "SELECT id FROM songs WHERE event_id = ? AND category = 'first_dance' LIMIT 1"
    )
    .get(eventId);

  if (firstDanceSong) {
    firstDanceDefined = true;
  }

  let musicReceived = songCount > 0;
  if (!isWeddingEvent(eventType)) {
    musicReceived = isPartyMusicFilled(getPartyMusicData(db, eventId));
  }

  return {
    timelineCount,
    songCount,
    questionnaireComplete,
    firstDanceDefined,
    musicReceived
  };
}

function getEventChecklist(db, event) {
  const summary = getEventSummary(db, event.id, event.event_type);
  const items = [];

  if (!event.phone?.trim()) {
    items.push({ label: "Téléphone client", tab: "resume" });
  }
  if (!event.email?.trim()) {
    items.push({ label: "Courriel client", tab: "resume" });
  }
  if (!event.venue?.trim()) {
    items.push({ label: "Nom de la salle", tab: "resume" });
  }
  if (!event.address?.trim()) {
    items.push({ label: "Adresse", tab: "resume" });
  }
  if (!event.start_time) {
    items.push({ label: "Heure de début", tab: "resume" });
  }

  items.push({
    key: "questionnaire",
    label: getQuestionnaireLabel(event.event_type),
    done: summary.questionnaireComplete,
    tab: "questionnaire"
  });

  items.push({
    key: "timeline",
    label: "Plan de soirée",
    done: summary.timelineCount > 0,
    tab: "timeline",
    detail: summary.timelineCount > 0 ? `${summary.timelineCount} étape(s)` : null
  });

  if (isWeddingEvent(event.event_type)) {
    items.push({
      key: "first_dance",
      label: "Première danse",
      done: summary.firstDanceDefined,
      tab: "musique"
    });
  }

  items.push({
    key: "music",
    label: "Liste musique",
    done: summary.musicReceived,
    tab: "musique"
  });

  const tracked = items.filter((i) => "done" in i);
  const missing = tracked.filter((i) => !i.done);
  const complete = tracked.filter((i) => i.done);
  const infoMissing = items.filter((i) => !("done" in i));

  return {
    items: tracked,
    missing: [...infoMissing, ...missing],
    complete,
    allDone: missing.length === 0 && infoMissing.length === 0,
    missingCount: missing.length + infoMissing.length
  };
}

function enrichEventsWithChecklist(db, events) {
  return events.map((ev) => ({
    ...ev,
    checklist: getEventChecklist(db, ev)
  }));
}

function createEvent(db, payload) {
  const insertClient = db.prepare(`
    INSERT INTO clients (first_name_1, first_name_2, last_name, phone, email)
    VALUES (@first_name_1, @first_name_2, @last_name, @phone, @email)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (
      client_id, event_type, event_date, start_time, end_date, end_time,
      venue, venue_elevator, address, guest_count, status
    ) VALUES (
      @client_id, @event_type, @event_date, @start_time, @end_date, @end_time,
      @venue, @venue_elevator, @address, @guest_count, 'a_completer'
    )
  `);

  const insertQuestionnaire = db.prepare(`
    INSERT INTO wedding_questionnaires (event_id, data) VALUES (?, ?)
  `);

  const insertDjNotes = db.prepare(`
    INSERT INTO dj_notes (event_id, content) VALUES (?, '')
  `);

  const transaction = db.transaction((data) => {
    applyEndDatetimeFields(data);
    const clientResult = insertClient.run({
      first_name_1: data.first_name_1.trim(),
      first_name_2: data.first_name_2?.trim() || null,
      last_name: isWeddingEvent(data.event_type)
        ? weddingLastName(data.last_name)
        : data.last_name.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null
    });

    const eventResult = insertEvent.run({
      client_id: clientResult.lastInsertRowid,
      event_type: data.event_type,
      event_date: data.event_date,
      start_time: data.start_time || null,
      end_date: data.end_date || null,
      end_time: data.end_time || null,
      venue: data.venue?.trim() || null,
      venue_elevator: parseVenueElevator(data),
      address: data.address?.trim() || null,
      guest_count: data.guest_count ? Number(data.guest_count) : null
    });

    const eventId = eventResult.lastInsertRowid;
    saveServiceFormData(db, eventId, data);
    saveRouteOrigin(db, eventId, data);

    const initialQuestionnaire = isWeddingEvent(data.event_type)
      ? "{}"
      : JSON.stringify(defaultPartyQuestionnaire());
    insertQuestionnaire.run(eventId, initialQuestionnaire);

    insertDjNotes.run(eventId);
    ensurePortalToken(db, eventId);
    return eventId;
  });

  return transaction(payload);
}

function saveBingoMusicalStyle(db, eventId, style) {
  db.prepare("UPDATE events SET bingo_musical_style = ? WHERE id = ?").run(style || null, eventId);
}

function saveOnConnaitChansonNotes(db, eventId, notes) {
  db.prepare("UPDATE events SET on_connait_chanson_notes = ? WHERE id = ?").run(notes || null, eventId);
}

function saveAnimationFields(db, eventId, included, notes) {
  db.prepare("UPDATE events SET animation_included = ?, animation_notes = ? WHERE id = ?").run(
    included || null,
    notes || null,
    eventId
  );
}

function saveVenueElevator(db, eventId, value) {
  db.prepare("UPDATE events SET venue_elevator = ? WHERE id = ?").run(value || null, eventId);
}

function saveRouteOrigin(db, eventId, data) {
  const address = data.route_origin_custom?.trim() || null;
  db.prepare("UPDATE events SET route_origin_key = ?, route_origin_custom = ? WHERE id = ?").run(
    address ? "custom" : null,
    address,
    eventId
  );
}

function saveEventServices(db, eventId, services) {
  const insert = db.prepare(`
    INSERT INTO event_services (event_id, service_name) VALUES (?, ?)
  `);

  const tx = db.transaction((serviceList) => {
    db.prepare("DELETE FROM event_services WHERE event_id = ?").run(eventId);
    for (const service of serviceList) {
      insert.run(eventId, service);
    }
  });

  tx(services);
}

function saveServiceFormData(db, eventId, body) {
  let services = parseAllServices(body);
  const animationIncluded = parseAnimationIncluded(body);
  if (animationIncluded) {
    services = applyAnimationServiceSelection(services, animationIncluded);
  }
  saveEventServices(db, eventId, services);
  saveBingoMusicalStyle(db, eventId, parseBingoMusicalStyle(body));
  saveOnConnaitChansonNotes(db, eventId, parseOnConnaitChansonNotes(body));
  saveAnimationFields(db, eventId, animationIncluded, parseAnimationNotes(body));
}

function updateEventDetails(db, eventId, data) {
  const event = getEventById(db, eventId);
  if (!event) {
    throw new Error("Événement introuvable");
  }

  const allowedStatus = ["a_completer", "en_preparation", "pret", "termine"];
  const status = data.status || event.status;
  if (!allowedStatus.includes(status)) {
    throw new Error("Statut invalide");
  }

  const tx = db.transaction(() => {
    applyEndDatetimeFields(data);
    db.prepare(
      `UPDATE clients
       SET first_name_1 = ?, first_name_2 = ?, last_name = ?, phone = ?, email = ?
       WHERE id = ?`
    ).run(
      data.first_name_1.trim(),
      data.first_name_2?.trim() || null,
      isWeddingEvent(data.event_type)
        ? weddingLastName(data.last_name)
        : data.last_name.trim(),
      data.phone?.trim() || null,
      data.email?.trim() || null,
      event.client_id
    );

    db.prepare(
      `UPDATE events
       SET event_type = ?, event_date = ?, start_time = ?, end_date = ?, end_time = ?,
           venue = ?, venue_elevator = ?, address = ?, guest_count = ?, status = ?,
           updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    ).run(
      data.event_type,
      data.event_date,
      data.start_time || null,
      data.end_date || null,
      data.end_time || null,
      data.venue?.trim() || null,
      parseVenueElevator(data),
      data.address?.trim() || null,
      data.guest_count ? Number(data.guest_count) : null,
      status,
      eventId
    );

    saveServiceFormData(db, eventId, data);
    saveRouteOrigin(db, eventId, data);
  });

  tx();
}

function updateEventStatus(db, eventId, status) {
  const allowed = ["a_completer", "en_preparation", "pret", "termine"];
  if (!allowed.includes(status)) {
    throw new Error("Statut invalide");
  }

  return db
    .prepare(
      `UPDATE events
       SET status = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(status, eventId);
}

function deleteEvent(db, eventId) {
  const event = getEventById(db, eventId);
  if (!event || event.deleted_at) return false;

  db.prepare(
    `UPDATE events
     SET deleted_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
  return true;
}

function restoreEvent(db, eventId) {
  const event = getEventById(db, eventId);
  if (!event || !event.deleted_at) return false;

  db.prepare(
    `UPDATE events
     SET deleted_at = NULL,
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
  return true;
}

function permanentlyDeleteEvent(db, eventId) {
  const event = getEventById(db, eventId);
  if (!event || !event.deleted_at) return false;

  const clientId = event.client_id;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM events WHERE id = ?").run(eventId);
    const remaining = db
      .prepare("SELECT COUNT(*) AS count FROM events WHERE client_id = ?")
      .get(clientId).count;
    if (remaining === 0) {
      db.prepare("DELETE FROM clients WHERE id = ?").run(clientId);
    }
  });
  tx();
  return true;
}

module.exports = {
  getAllEvents,
  getDashboardData,
  getEventById,
  getEventServices,
  getEventSummary,
  getEventChecklist,
  createEvent,
  saveEventServices,
  saveServiceFormData,
  updateEventDetails,
  updateEventStatus,
  deleteEvent,
  restoreEvent,
  permanentlyDeleteEvent,
  getDeletedEvents,
  clientShortName,
  clientFullName
};
