const { encodeSongMeta, normalizeSongRow } = require("./music-song-meta");
const {
  parseAmbianceData,
  encodeAmbianceData,
  parseThemeData,
  encodeThemeData
} = require("./party-ambiance-meta");

const CATEGORIES = {
  FIRST_DANCE: "first_dance",
  ENTRANCE: "entrance",
  ENTRANCE_PROCESSION: "entrance_procession",
  ENTRANCE_GROOMSMEN_BEFORE: "entrance_groomsmen_before",
  ENTRANCE_BRIDESMAIDS: "entrance_bridesmaids",
  ENTRANCE_GROOMSMEN: "entrance_groomsmen",
  SPECIAL_DANCE: "special_dance",
  MUST_PLAY: "must_play",
  DO_NOT_PLAY: "do_not_play",
  SPECIAL_REQUESTS: "special_requests",
  COCKTAIL_AMBIANCE: "cocktail_ambiance",
  DINNER_AMBIANCE: "dinner_ambiance",
  EVENING_THEME: "evening_theme",
  PARTY_DO_NOT_PLAY: "party_do_not_play",
  ENTRANCE_NOTES: "entrance_notes",
  ENTRANCE_GROOMSMEN_NOTES: "entrance_groomsmen_notes",
  ENTRANCE_BRIDESMAIDS_NOTES: "entrance_bridesmaids_notes",
  ENTRANCE_COUPLE_NOTES: "entrance_couple_notes"
};

const WEDDING_ENTRANCE_SECTIONS = [
  {
    key: "groomsmen",
    category: CATEGORIES.ENTRANCE_GROOMSMEN,
    notesCategory: CATEGORIES.ENTRANCE_GROOMSMEN_NOTES,
    label: "Garçons d'honneur"
  },
  {
    key: "bridesmaids",
    category: CATEGORIES.ENTRANCE_BRIDESMAIDS,
    notesCategory: CATEGORIES.ENTRANCE_BRIDESMAIDS_NOTES,
    label: "Demoiselles d'honneur"
  },
  {
    key: "couple",
    category: CATEGORIES.ENTRANCE,
    notesCategory: CATEGORIES.ENTRANCE_COUPLE_NOTES,
    label: "Entrée des mariés"
  }
];

function getSongsByCategory(db, eventId, category) {
  return db
    .prepare(
      `SELECT * FROM songs WHERE event_id = ? AND category = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(eventId, category);
}

function getSingleSong(db, eventId, category) {
  return db
    .prepare("SELECT * FROM songs WHERE event_id = ? AND category = ? LIMIT 1")
    .get(eventId, category);
}

function upsertSingleSong(db, eventId, category, artist, title, spotify_url, confirmed) {
  const notes = encodeSongMeta(spotify_url, confirmed);
  const existing = getSingleSong(db, eventId, category);
  if (existing) {
    db.prepare("UPDATE songs SET artist = ?, title = ?, notes = ? WHERE id = ?").run(
      artist || null,
      title || null,
      notes,
      existing.id
    );
  } else {
    db.prepare(
      "INSERT INTO songs (event_id, category, artist, title, notes, sort_order) VALUES (?, ?, ?, ?, ?, 0)"
    ).run(eventId, category, artist || null, title || null, notes);
  }
}

function upsertSingleSongFromBody(db, eventId, category, body, prefix) {
  upsertSingleSong(
    db,
    eventId,
    category,
    body[`${prefix}_artist`],
    body[`${prefix}_title`],
    body[`${prefix}_spotify`],
    body[`${prefix}_confirmed`]
  );
}

function upsertCategoryNotes(db, eventId, category, notes) {
  const existing = getSingleSong(db, eventId, category);
  if (existing) {
    db.prepare("UPDATE songs SET notes = ? WHERE id = ?").run(notes || "", existing.id);
  } else {
    db.prepare(
      "INSERT INTO songs (event_id, category, notes, sort_order) VALUES (?, ?, ?, 0)"
    ).run(eventId, category, notes || "");
  }
}

function parseStyleList(notes) {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return notes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function getNotesText(db, eventId, category) {
  const row = getSingleSong(db, eventId, category);
  return row?.notes || "";
}

function saveAmbianceSectionsFromBody(db, eventId, body) {
  const cocktailStyles = []
    .concat(body.cocktail_styles || [])
    .filter(Boolean);
  const dinnerStyles = []
    .concat(body.dinner_styles || [])
    .filter(Boolean);

  upsertCategoryNotes(
    db,
    eventId,
    CATEGORIES.COCKTAIL_AMBIANCE,
    encodeAmbianceData(cocktailStyles, body.cocktail_spotify, body.cocktail_notes)
  );
  upsertCategoryNotes(
    db,
    eventId,
    CATEGORIES.DINNER_AMBIANCE,
    encodeAmbianceData(dinnerStyles, body.dinner_spotify, body.dinner_notes)
  );
}

function getPartyMusicData(db, eventId) {
  const cocktail = parseAmbianceData(getNotesText(db, eventId, CATEGORIES.COCKTAIL_AMBIANCE));
  const dinner = parseAmbianceData(getNotesText(db, eventId, CATEGORIES.DINNER_AMBIANCE));
  const theme = parseThemeData(getNotesText(db, eventId, CATEGORIES.EVENING_THEME));

  return {
    cocktailStyles: cocktail.styles,
    cocktailSpotify: cocktail.spotify_url,
    cocktailNotes: cocktail.notes,
    dinnerStyles: dinner.styles,
    dinnerSpotify: dinner.spotify_url,
    dinnerNotes: dinner.notes,
    eveningTheme: theme.theme,
    eveningThemeNotes: theme.notes,
    specialRequests: getNotesText(db, eventId, CATEGORIES.SPECIAL_REQUESTS),
    doNotPlay: getNotesText(db, eventId, CATEGORIES.PARTY_DO_NOT_PLAY)
  };
}

function savePartyMusicFromBody(db, eventId, body) {
  const tx = db.transaction(() => {
    saveAmbianceSectionsFromBody(db, eventId, body);
    upsertCategoryNotes(
      db,
      eventId,
      CATEGORIES.EVENING_THEME,
      encodeThemeData(body.evening_theme, body.evening_theme_notes)
    );
    upsertCategoryNotes(db, eventId, CATEGORIES.SPECIAL_REQUESTS, body.special_requests || "");
    upsertCategoryNotes(db, eventId, CATEGORIES.PARTY_DO_NOT_PLAY, body.do_not_play || "");
  });
  tx();
}

function isPartyMusicFilled(data) {
  return (
    data.cocktailStyles.length > 0 ||
    Boolean(data.cocktailSpotify?.trim()) ||
    Boolean(data.cocktailNotes?.trim()) ||
    data.dinnerStyles.length > 0 ||
    Boolean(data.dinnerSpotify?.trim()) ||
    Boolean(data.dinnerNotes?.trim()) ||
    Boolean(data.eveningTheme?.trim()) ||
    Boolean(data.eveningThemeNotes?.trim()) ||
    Boolean(data.specialRequests?.trim()) ||
    Boolean(data.doNotPlay?.trim())
  );
}

function getMusicDataForEvent(db, eventId, eventType) {
  const { isWeddingEvent } = require("./questionnaire-shared");
  if (isWeddingEvent(eventType)) return getMusicData(db, eventId);
  return getPartyMusicData(db, eventId);
}

function saveMusicForEvent(db, eventId, eventType, body) {
  const { isWeddingEvent } = require("./questionnaire-shared");
  if (isWeddingEvent(eventType)) return saveMusicFromBody(db, eventId, body);
  return savePartyMusicFromBody(db, eventId, body);
}

function getMusicData(db, eventId) {
  const entrances = {};
  WEDDING_ENTRANCE_SECTIONS.forEach((section) => {
    entrances[section.key] = {
      ...normalizeSongRow(getSingleSong(db, eventId, section.category)),
      notes: getNotesText(db, eventId, section.notesCategory)
    };
  });

  const legacyEntranceNotes = getNotesText(db, eventId, CATEGORIES.ENTRANCE_NOTES);
  const cocktail = parseAmbianceData(getNotesText(db, eventId, CATEGORIES.COCKTAIL_AMBIANCE));
  const dinner = parseAmbianceData(getNotesText(db, eventId, CATEGORIES.DINNER_AMBIANCE));

  return {
    firstDance: normalizeSongRow(getSingleSong(db, eventId, CATEGORIES.FIRST_DANCE)),
    entrance: entrances.couple,
    entrances,
    entranceSections: WEDDING_ENTRANCE_SECTIONS,
    entranceNotes: legacyEntranceNotes,
    cocktailStyles: cocktail.styles,
    cocktailSpotify: cocktail.spotify_url,
    cocktailNotes: cocktail.notes,
    dinnerStyles: dinner.styles,
    dinnerSpotify: dinner.spotify_url,
    dinnerNotes: dinner.notes,
    specialDances: getSongsByCategory(db, eventId, CATEGORIES.SPECIAL_DANCE),
    mustPlayText: getCategoryText(db, eventId, CATEGORIES.MUST_PLAY),
    doNotPlayText: getCategoryText(db, eventId, CATEGORIES.DO_NOT_PLAY),
    specialRequests: getSingleSong(db, eventId, CATEGORIES.SPECIAL_REQUESTS)
  };
}

function saveSpecialRequests(db, eventId, text) {
  const existing = getSingleSong(db, eventId, CATEGORIES.SPECIAL_REQUESTS);
  if (existing) {
    db.prepare("UPDATE songs SET notes = ? WHERE id = ?").run(text || "", existing.id);
  } else {
    db.prepare(
      "INSERT INTO songs (event_id, category, notes, sort_order) VALUES (?, ?, ?, 0)"
    ).run(eventId, CATEGORIES.SPECIAL_REQUESTS, text || "");
  }
}

function replaceCategoryList(db, eventId, category, items) {
  db.prepare("DELETE FROM songs WHERE event_id = ? AND category = ?").run(eventId, category);

  const insert = db.prepare(
    "INSERT INTO songs (event_id, category, artist, title, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );

  items.forEach((item, index) => {
    if (!item.artist && !item.title && !item.notes && !item.moment && !item.people) return;
    insert.run(
      eventId,
      category,
      item.artist?.trim() || null,
      item.title?.trim() || null,
      item.notes?.trim() || item.people?.trim() || item.moment?.trim() || null,
      index
    );
  });
}

function saveMusicFromBody(db, eventId, body) {
  const tx = db.transaction(() => {
    upsertSingleSongFromBody(db, eventId, CATEGORIES.FIRST_DANCE, body, "first_dance");

    WEDDING_ENTRANCE_SECTIONS.forEach((section) => {
      upsertSingleSongFromBody(db, eventId, section.category, body, `entrance_${section.key}`);
      upsertCategoryNotes(
        db,
        eventId,
        section.notesCategory,
        body[`entrance_${section.key}_notes`] || ""
      );
    });

    saveSpecialRequests(db, eventId, body.special_requests);

    saveAmbianceSectionsFromBody(db, eventId, body);

    const specialDances = [];
    for (let i = 1; i <= 10; i++) {
      if (body[`special_${i}_moment`] || body[`special_${i}_artist`] || body[`special_${i}_title`]) {
        specialDances.push({
          moment: body[`special_${i}_moment`],
          people: body[`special_${i}_people`],
          artist: body[`special_${i}_artist`],
          title: body[`special_${i}_title`],
          notes: [body[`special_${i}_moment`], body[`special_${i}_people`]]
            .filter(Boolean)
            .join(" — ")
        });
      }
    }
    replaceCategoryList(db, eventId, CATEGORIES.SPECIAL_DANCE, specialDances);

    saveCategoryText(db, eventId, CATEGORIES.MUST_PLAY, body.must_play || "");
    saveCategoryText(db, eventId, CATEGORIES.DO_NOT_PLAY, body.do_not_play || "");
  });
  tx();
}

const Q_ENTRANCE_FIELDS = {
  groomsmen: {
    song: "groomsmen_song",
    spotify: "groomsmen_spotify",
    confirmed: "groomsmen_confirmed",
    notes: "groomsmen_notes"
  },
  bridesmaids: {
    song: "bridesmaids_song",
    spotify: "bridesmaids_spotify",
    confirmed: "bridesmaids_confirmed",
    notes: "bridesmaids_notes"
  },
  couple: {
    song: "couple_entrance_song",
    spotify: "couple_entrance_spotify",
    confirmed: "couple_entrance_confirmed",
    notes: "couple_entrance_notes"
  }
};

function parseSongField(songStr) {
  if (!songStr) return { artist: null, title: null };
  const parts = songStr.split(" — ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" — ").trim() };
  }
  return { artist: null, title: songStr.trim() };
}

function formatSongField(artist, title) {
  const a = (artist || "").trim();
  const t = (title || "").trim();
  if (a && t) return `${a} — ${t}`;
  return a || t || "";
}

function serializeSongListRows(rows) {
  return rows
    .filter((row) => row.artist || row.title || row.notes)
    .map((row) => formatSongField(row.artist, row.title) || row.notes || "")
    .filter(Boolean)
    .join("\n");
}

function getCategoryText(db, eventId, category) {
  const rows = getSongsByCategory(db, eventId, category);
  if (!rows.length) return "";
  if (rows.length === 1 && !rows[0].artist && !rows[0].title && rows[0].notes) {
    return rows[0].notes;
  }
  return serializeSongListRows(rows);
}

function saveCategoryText(db, eventId, category, text) {
  db.prepare("DELETE FROM songs WHERE event_id = ? AND category = ?").run(eventId, category);
  if (!text?.trim()) return;
  db.prepare(
    "INSERT INTO songs (event_id, category, notes, sort_order) VALUES (?, ?, ?, 0)"
  ).run(eventId, category, text.trim());
}

function mustPlayTextFromQuestionnaire(partyMusic) {
  if (!partyMusic) return "";
  if (typeof partyMusic.must_play === "string") return partyMusic.must_play;
  if (!Array.isArray(partyMusic.must_play)) return "";
  return partyMusic.must_play
    .filter((song) => song.artist || song.title)
    .map((song) => formatSongField(song.artist, song.title))
    .join("\n");
}

function buildSpecialDancesFromQuestionnaire(q) {
  const sd = q.special_dances || {};
  const items = [];

  if (sd.father_daughter_enabled === "yes" || sd.father_daughter_song) {
    const song = parseSongField(sd.father_daughter_song);
    items.push({
      moment: "Danse père/fille",
      people: "",
      artist: song.artist,
      title: song.title
    });
  }
  if (sd.mother_son_enabled === "yes" || sd.mother_son_song) {
    const song = parseSongField(sd.mother_son_song);
    items.push({
      moment: "Danse mère/fils",
      people: "",
      artist: song.artist,
      title: song.title
    });
  }
  if (sd.other_song || sd.other_people) {
    const song = parseSongField(sd.other_song);
    items.push({
      moment: "Autre",
      people: sd.other_people || "",
      artist: song.artist,
      title: song.title
    });
  }

  return items.map((item) => ({
    artist: item.artist,
    title: item.title,
    notes: [item.moment, item.people].filter(Boolean).join(" — ")
  }));
}

function applySpecialDancesToQuestionnaire(data, specialDances) {
  data.special_dances.father_daughter_enabled = "";
  data.special_dances.father_daughter_song = "";
  data.special_dances.mother_son_enabled = "";
  data.special_dances.mother_son_song = "";
  data.special_dances.other_people = "";
  data.special_dances.other_song = "";

  for (const row of specialDances) {
    const notes = row.notes || "";
    const moment = notes.includes(" — ") ? notes.split(" — ")[0] : notes;
    const people = notes.includes(" — ") ? notes.split(" — ").slice(1).join(" — ") : "";
    const songStr = formatSongField(row.artist, row.title);

    if (/père|fille/i.test(moment)) {
      data.special_dances.father_daughter_enabled = "yes";
      data.special_dances.father_daughter_song = songStr;
    } else if (/mère|fils/i.test(moment)) {
      data.special_dances.mother_son_enabled = "yes";
      data.special_dances.mother_son_song = songStr;
    } else if (songStr || people) {
      data.special_dances.other_people = people;
      data.special_dances.other_song = songStr;
    }
  }
}

function syncMusicFromQuestionnaire(db, eventId, q) {
  const tx = db.transaction(() => {
    const ce = q.couple_entrance || {};

    if (q.first_dance?.enabled === "yes" || q.first_dance?.artist || q.first_dance?.song) {
      upsertSingleSong(
        db,
        eventId,
        CATEGORIES.FIRST_DANCE,
        q.first_dance.artist,
        q.first_dance.song,
        q.first_dance.spotify,
        q.first_dance.confirmed
      );
    }

    WEDDING_ENTRANCE_SECTIONS.forEach((section) => {
      const fields = Q_ENTRANCE_FIELDS[section.key];
      const songStr = ce[fields.song];
      if (!songStr && !ce[fields.spotify] && !ce[fields.notes]) return;

      const song = parseSongField(songStr);
      upsertSingleSong(
        db,
        eventId,
        section.category,
        song.artist,
        song.title,
        ce[fields.spotify],
        ce[fields.confirmed]
      );
      upsertCategoryNotes(db, eventId, section.notesCategory, ce[fields.notes] || "");
    });

    replaceCategoryList(
      db,
      eventId,
      CATEGORIES.SPECIAL_DANCE,
      buildSpecialDancesFromQuestionnaire(q)
    );

    saveCategoryText(
      db,
      eventId,
      CATEGORIES.MUST_PLAY,
      mustPlayTextFromQuestionnaire(q.party_music)
    );
    saveCategoryText(db, eventId, CATEGORIES.DO_NOT_PLAY, q.party_music?.forbidden_songs || "");
  });
  tx();
}

function syncQuestionnaireFromMusic(db, eventId) {
  const { getQuestionnaire, saveQuestionnaire } = require("./questionnaire");
  const { data } = getQuestionnaire(db, eventId);
  const music = getMusicData(db, eventId);

  if (music.firstDance.artist || music.firstDance.title) {
    data.first_dance.enabled = data.first_dance.enabled || "yes";
    data.first_dance.artist = music.firstDance.artist;
    data.first_dance.song = music.firstDance.title;
    data.first_dance.spotify = music.firstDance.spotify_url;
    data.first_dance.confirmed = music.firstDance.confirmed;
  }

  WEDDING_ENTRANCE_SECTIONS.forEach((section) => {
    const ent = music.entrances[section.key];
    const fields = Q_ENTRANCE_FIELDS[section.key];
    data.couple_entrance[fields.song] = formatSongField(ent.artist, ent.title);
    data.couple_entrance[fields.spotify] = ent.spotify_url || "";
    data.couple_entrance[fields.confirmed] = ent.confirmed || false;
    data.couple_entrance[fields.notes] = ent.notes || "";
  });

  applySpecialDancesToQuestionnaire(data, music.specialDances);

  data.party_music.must_play = music.mustPlayText || "";
  data.party_music.forbidden_songs = music.doNotPlayText || "";

  saveQuestionnaire(db, eventId, data);
}

function syncPartyMusicFromQuestionnaire(db, eventId, q) {
  const tx = db.transaction(() => {
    upsertCategoryNotes(
      db,
      eventId,
      CATEGORIES.PARTY_DO_NOT_PLAY,
      q.party_music?.forbidden_songs || ""
    );

    const themes = q.general?.evening_themes || [];
    const themeParts = themes.filter((theme) => theme && theme !== "Autre");
    let themeStr = themeParts.join(", ");
    let themeNotes = q.general?.evening_theme_other || "";

    if (themes.includes("Autre")) {
      if (!themeStr) themeStr = "Autre";
      else if (themeNotes) themeStr = `${themeStr}, Autre`;
    }

    upsertCategoryNotes(
      db,
      eventId,
      CATEGORIES.EVENING_THEME,
      encodeThemeData(themeStr, themeNotes)
    );
  });
  tx();
}

function syncPartyQuestionnaireFromMusic(db, eventId) {
  const { getPartyQuestionnaire, savePartyQuestionnaire } = require("./party-questionnaire");
  const { EVENING_THEME_OPTIONS } = require("./party-questionnaire");
  const { data } = getPartyQuestionnaire(db, eventId);
  const music = getPartyMusicData(db, eventId);

  data.party_music.forbidden_songs = music.doNotPlay || "";

  const knownThemes = EVENING_THEME_OPTIONS.filter((theme) => theme !== "Autre");
  const selected = [];
  const themeParts = (music.eveningTheme || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of themeParts) {
    const match = knownThemes.find((theme) => theme.toLowerCase() === part.toLowerCase());
    if (match && !selected.includes(match)) selected.push(match);
  }

  if (themeParts.some((part) => part.toLowerCase() === "autre") || music.eveningThemeNotes) {
    if (!selected.includes("Autre")) selected.push("Autre");
    data.general.evening_theme_other = music.eveningThemeNotes || "";
  } else {
    data.general.evening_theme_other = "";
  }

  data.general.evening_themes = selected;
  savePartyQuestionnaire(db, eventId, data);
}

function syncMusicFromQuestionnaireForEvent(db, eventId, eventType, q) {
  const { isWeddingEvent } = require("./questionnaire-shared");
  if (isWeddingEvent(eventType)) syncMusicFromQuestionnaire(db, eventId, q);
  else syncPartyMusicFromQuestionnaire(db, eventId, q);
}

function syncQuestionnaireFromMusicForEvent(db, eventId, eventType) {
  const { isWeddingEvent } = require("./questionnaire-shared");
  if (isWeddingEvent(eventType)) syncQuestionnaireFromMusic(db, eventId);
  else syncPartyQuestionnaireFromMusic(db, eventId);
}

module.exports = {
  CATEGORIES,
  WEDDING_ENTRANCE_SECTIONS,
  getMusicData,
  getPartyMusicData,
  getMusicDataForEvent,
  saveMusicFromBody,
  savePartyMusicFromBody,
  saveMusicForEvent,
  isPartyMusicFilled,
  syncMusicFromQuestionnaire,
  syncQuestionnaireFromMusic,
  syncPartyMusicFromQuestionnaire,
  syncPartyQuestionnaireFromMusic,
  syncMusicFromQuestionnaireForEvent,
  syncQuestionnaireFromMusicForEvent,
  formatSongField,
  parseSongField
};
