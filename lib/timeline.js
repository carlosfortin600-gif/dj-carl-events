const { isWeddingEvent } = require("./questionnaire-shared");

function getTimelineItems(db, eventId) {
  return db
    .prepare(
      `SELECT * FROM timeline_items
       WHERE event_id = ?
       ORDER BY sort_order ASC, time ASC, id ASC`
    )
    .all(eventId);
}

function compareTimelineTime(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function findInsertSortOrder(items, newTime) {
  for (const item of items) {
    if (compareTimelineTime(newTime, item.time) < 0) {
      return item.sort_order;
    }
  }
  if (items.length === 0) return 0;
  return items[items.length - 1].sort_order + 1;
}

function bumpSortOrdersFrom(db, eventId, fromOrder) {
  db.prepare(
    `UPDATE timeline_items SET sort_order = sort_order + 1
     WHERE event_id = ? AND sort_order >= ?`
  ).run(eventId, fromOrder);
}

function repositionTimelineItemByTime(db, eventId, itemId, newTime) {
  const item = db
    .prepare("SELECT id, sort_order FROM timeline_items WHERE id = ? AND event_id = ?")
    .get(itemId, eventId);
  if (!item) return;

  const tx = db.transaction(() => {
    db.prepare("UPDATE timeline_items SET sort_order = -1 WHERE id = ?").run(itemId);
    db.prepare(
      `UPDATE timeline_items SET sort_order = sort_order - 1
       WHERE event_id = ? AND sort_order > ?`
    ).run(eventId, item.sort_order);

    const others = getTimelineItems(db, eventId).filter((i) => i.id !== itemId);
    const insertOrder = findInsertSortOrder(others, newTime);
    bumpSortOrdersFrom(db, eventId, insertOrder);
    db.prepare("UPDATE timeline_items SET sort_order = ? WHERE id = ?").run(insertOrder, itemId);
  });
  tx();
}

function reorderTimelineByTime(db, eventId) {
  const items = getTimelineItems(db, eventId);
  if (items.length < 2) return;

  const sorted = [...items].sort((a, b) => {
    const timeCmp = compareTimelineTime(a.time, b.time);
    if (timeCmp !== 0) return timeCmp;
    return a.id - b.id;
  });

  const tx = db.transaction(() => {
    sorted.forEach((item, index) => {
      if (item.sort_order !== index) {
        db.prepare("UPDATE timeline_items SET sort_order = ? WHERE id = ?").run(index, item.id);
      }
    });
  });
  tx();
}

function reorderAllTimelinesByTime(db) {
  const eventIds = db.prepare("SELECT DISTINCT event_id FROM timeline_items").all();
  for (const { event_id: eventId } of eventIds) {
    reorderTimelineByTime(db, eventId);
  }
}

function addTimelineItem(db, eventId, data) {
  const newTime = data.time?.trim() || null;
  const items = getTimelineItems(db, eventId);
  const insertOrder = findInsertSortOrder(items, newTime);

  const tx = db.transaction(() => {
    bumpSortOrdersFrom(db, eventId, insertOrder);
    return db
      .prepare(
        `INSERT INTO timeline_items (
        event_id, time, title, description, song_artist, song_title, dj_notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        newTime,
        data.title.trim(),
        data.description?.trim() || null,
        data.song_artist?.trim() || null,
        data.song_title?.trim() || null,
        data.dj_notes?.trim() || null,
        insertOrder
      );
  });
  return tx().lastInsertRowid;
}

function updateTimelineItem(db, itemId, eventId, data) {
  const existing = db
    .prepare("SELECT time FROM timeline_items WHERE id = ? AND event_id = ?")
    .get(itemId, eventId);
  if (!existing) return { changes: 0 };

  const newTime = data.time?.trim() || null;
  const timeChanged = newTime !== (existing.time || null);

  const result = db
    .prepare(
      `UPDATE timeline_items SET
        time = ?, title = ?, description = ?,
        song_artist = ?, song_title = ?, dj_notes = ?
       WHERE id = ? AND event_id = ?`
    )
    .run(
      newTime,
      data.title.trim(),
      data.description?.trim() || null,
      data.song_artist?.trim() || null,
      data.song_title?.trim() || null,
      data.dj_notes?.trim() || null,
      itemId,
      eventId
    );

  if (timeChanged) {
    repositionTimelineItemByTime(db, eventId, itemId, newTime);
  }

  return result;
}

function deleteTimelineItem(db, itemId, eventId) {
  const item = db
    .prepare("SELECT sort_order FROM timeline_items WHERE id = ? AND event_id = ?")
    .get(itemId, eventId);
  if (!item) return false;

  db.prepare("DELETE FROM timeline_items WHERE id = ? AND event_id = ?").run(itemId, eventId);

  db.prepare(
    `UPDATE timeline_items SET sort_order = sort_order - 1
     WHERE event_id = ? AND sort_order > ?`
  ).run(eventId, item.sort_order);

  return true;
}

function moveTimelineItem(db, itemId, eventId, direction) {
  const items = getTimelineItems(db, eventId);
  const index = items.findIndex((i) => i.id === Number(itemId));
  if (index === -1) return false;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= items.length) return false;

  const current = items[index];
  const other = items[swapIndex];

  const tx = db.transaction(() => {
    db.prepare("UPDATE timeline_items SET sort_order = ? WHERE id = ?").run(
      other.sort_order,
      current.id
    );
    db.prepare("UPDATE timeline_items SET sort_order = ? WHERE id = ?").run(
      current.sort_order,
      other.id
    );
  });
  tx();
  return true;
}

function parseSongField(songStr) {
  if (!songStr) return { artist: null, title: null };
  const parts = songStr.split(" — ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" — ").trim() };
  }
  return { artist: null, title: songStr.trim() };
}

function createStepBuilder() {
  const steps = [];
  const titles = new Set();

  function addStep(time, title, songStr, description) {
    if (!title) return;
    const key = title.toLowerCase();
    if (titles.has(key)) return;
    titles.add(key);

    const song = parseSongField(songStr);
    steps.push({
      time: time || null,
      title,
      description: description || null,
      song_artist: song.artist,
      song_title: song.title
    });
  }

  function addMoment(moment) {
    if (!moment) return;
    const hasContent =
      moment.active === "yes" ||
      Boolean(String(moment.time || "").trim()) ||
      Boolean(String(moment.song || "").trim()) ||
      Boolean(String(moment.notes || "").trim());
    if (!hasContent) return;
    addStep(moment.time, moment.label, moment.song, moment.notes);
  }

  return { steps, addStep, addMoment, titles };
}

function buildStepsFromWeddingQuestionnaire(q) {
  const { steps, addStep, addMoment } = createStepBuilder();

  const ceremony = q.ceremony || {};
  if (ceremony.start_time || ceremony.location) {
    const details = [ceremony.location, ceremony.end_time ? `fin ${ceremony.end_time.slice(0, 5)}` : ""]
      .filter(Boolean)
      .join(" · ");
    addStep(ceremony.start_time || null, "Cérémonie", null, details || null);
  }

  if (q.general?.guest_arrival_time) {
    addStep(q.general.guest_arrival_time, "Entrée des invités en salle", null);
  }

  if (q.couple_entrance?.procession_entrance === "yes") {
    addStep(
      q.general?.couple_entrance_time ||
        q.important_moments?.find((m) => m.key === "procession")?.time,
      "Entrée du cortège",
      q.couple_entrance.procession_song
    );
  }

  if (q.couple_entrance?.official_entrance === "yes") {
    addStep(
      q.general?.couple_entrance_time ||
        q.important_moments?.find((m) => m.key === "couple_entrance")?.time,
      "Entrée des mariés",
      q.couple_entrance.couple_entrance_song
    );
  }

  if (q.general?.dinner_time) {
    addStep(q.general.dinner_time, "Souper", null);
  }

  addMoment(q.important_moments?.find((m) => m.key === "speeches"));

  if (q.first_dance?.enabled === "yes" || q.general?.first_dance_approx_time) {
    const song =
      q.first_dance.artist && q.first_dance.song
        ? `${q.first_dance.artist} — ${q.first_dance.song}`
        : q.first_dance.song || q.first_dance.artist;
    addStep(
      q.general?.first_dance_approx_time ||
        q.important_moments?.find((m) => m.key === "first_dance")?.time,
      "Première danse",
      song
    );
  }

  if (q.special_dances?.father_daughter_enabled === "yes") {
    addStep(
      q.important_moments?.find((m) => m.key === "father_daughter")?.time,
      "Danse père / fille",
      q.special_dances.father_daughter_song
    );
  }

  if (q.special_dances?.mother_son_enabled === "yes") {
    addStep(
      q.important_moments?.find((m) => m.key === "mother_son")?.time,
      "Danse mère / fils",
      q.special_dances.mother_son_song
    );
  }

  if (q.special_dances?.other_people) {
    addStep(null, `Danse spéciale — ${q.special_dances.other_people}`, q.special_dances.other_song);
  }

  addMoment(q.important_moments?.find((m) => m.key === "cake"));
  addMoment(q.important_moments?.find((m) => m.key === "bouquet"));

  if (q.general?.party_start_time) {
    addStep(q.general.party_start_time, "Ouverture du plancher", null);
  }

  addMoment(q.important_moments?.find((m) => m.key === "dance_floor"));
  addMoment(q.important_moments?.find((m) => m.key === "last_dance"));

  for (const moment of q.important_moments || []) {
    addMoment(moment);
  }

  return steps;
}

function buildStepsFromPartyQuestionnaire(q) {
  const { steps, addStep, addMoment } = createStepBuilder();

  if (q.general?.guest_arrival_time) {
    addStep(q.general.guest_arrival_time, "Entrée des invités en salle", null);
  }

  if (q.schedule?.has_cocktail === "yes") {
    const welcome = q.important_moments?.find((m) => m.key === "welcome");
    addStep(
      welcome?.time || q.general?.guest_arrival_time,
      welcome?.label || "Cocktail / accueil",
      welcome?.song,
      welcome?.notes
    );
  }

  if (q.schedule?.has_meal === "yes") {
    const dinner = q.important_moments?.find((m) => m.key === "dinner");
    addStep(
      dinner?.time,
      dinner?.label || "Repas / souper",
      dinner?.song,
      dinner?.notes
    );
  }

  if (q.schedule?.speeches_planned === "yes") {
    addStep(null, "Discours / annonces", null, q.schedule?.special_moments_notes || null);
  }

  if (q.general?.party_start_time) {
    addStep(q.general.party_start_time, "Ouverture du plancher", null);
  }

  if (q.general?.expected_end_time) {
    addStep(q.general.expected_end_time, "Fin de soirée prévue", null);
  }

  for (const moment of q.important_moments || []) {
    addMoment(moment);
  }

  return steps;
}

function buildStepsFromQuestionnaire(q, eventType) {
  if (!q || typeof q !== "object") return [];

  if (q._formType === "party" || (eventType && !isWeddingEvent(eventType))) {
    return buildStepsFromPartyQuestionnaire(q);
  }

  return buildStepsFromWeddingQuestionnaire(q);
}

function titleExists(db, eventId, title) {
  const row = db
    .prepare(
      `SELECT id FROM timeline_items
       WHERE event_id = ? AND LOWER(title) = LOWER(?)
       LIMIT 1`
    )
    .get(eventId, title);
  return Boolean(row);
}

function generateFromQuestionnaire(db, eventId, questionnaireData, options = {}) {
  const existing = getTimelineItems(db, eventId);
  const proposed = buildStepsFromQuestionnaire(questionnaireData, options.eventType);

  if (existing.length > 0 && !options.confirm) {
    return { needsConfirm: true, existingCount: existing.length, proposedCount: proposed.length };
  }

  let added = 0;
  let skipped = 0;

  for (const step of proposed) {
    if (titleExists(db, eventId, step.title)) {
      skipped++;
      continue;
    }
    addTimelineItem(db, eventId, step);
    added++;
  }

  return { needsConfirm: false, added, skipped, proposedCount: proposed.length };
}

module.exports = {
  getTimelineItems,
  addTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  moveTimelineItem,
  reorderTimelineByTime,
  reorderAllTimelinesByTime,
  generateFromQuestionnaire,
  buildStepsFromQuestionnaire,
  buildStepsFromWeddingQuestionnaire,
  buildStepsFromPartyQuestionnaire
};
