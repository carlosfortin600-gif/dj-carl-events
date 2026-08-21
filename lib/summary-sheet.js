const { formatDateFr, formatTime, formatDateTimeFr, formatTimestampFr, formatDateRangeFr, formatDateTimeRangeFr, localTimestampNow, endDatetimeLocalValue, statusLabel, clientFullName, googleMapsUrl, googleMapsDirectionsUrl } = require("./helpers");
const { loadRouteOrigins, resolveRouteOrigin, resolveDepartureAddress } = require("./route-time");
const { isWeddingEvent } = require("./questionnaire-shared");
const {
  COCKTAIL_LOCATION_OPTIONS,
  ANIMATION_LEVELS,
  GUEST_REQUEST_OPTIONS
} = require("./questionnaire-shared");
const { INVITE_GUESTS_OPTIONS, MOMENT_KEYS } = require("./questionnaire");
const { PARTY_MOMENT_KEYS, PARTY_GUEST_REQUEST_OPTIONS } = require("./party-questionnaire");

function dash(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && !value.trim()) return "—";
  if (Array.isArray(value) && value.length === 0) return "—";
  return value;
}

function ynLabel(value) {
  if (value === "yes") return "Oui";
  if (value === "no") return "Non";
  return "—";
}

function listLabel(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "—";
  return arr.join(", ");
}

function optionLabel(value, options) {
  if (!value) return "—";
  const found = options.find((opt) => opt.value === value);
  return found ? found.label : value;
}

function row(label, value, link) {
  const display =
    typeof value === "string" || typeof value === "number"
      ? dash(String(value))
      : Array.isArray(value)
        ? listLabel(value)
        : dash(value);
  return { label, value: display, link: link || null };
}

function section(title, rows) {
  return { title, rows: rows.filter(Boolean) };
}

function cocktailLocationLabel(value) {
  return optionLabel(value, COCKTAIL_LOCATION_OPTIONS);
}

function animationLevelLabel(value) {
  return optionLabel(value, ANIMATION_LEVELS);
}

function guestRequestLabel(value, wedding) {
  const options = wedding ? GUEST_REQUEST_OPTIONS : PARTY_GUEST_REQUEST_OPTIONS;
  return optionLabel(value, options);
}

function inviteGuestsLabel(value) {
  return optionLabel(value, INVITE_GUESTS_OPTIONS);
}

function songLine(artist, title) {
  const parts = [artist, title].filter((s) => s && String(s).trim());
  return parts.length ? parts.join(" — ") : "—";
}

function songDetail(song, spotify, confirmed) {
  const parts = [dash(song)];
  if (spotify) parts.push(`Spotify : ${spotify}`);
  if (confirmed === true || confirmed === "1" || confirmed === 1) parts.push("Validée");
  const text = parts.filter((p) => p && p !== "—").join(" · ");
  return text || "—";
}

function songLineWithMeta(artist, title, spotify, confirmed) {
  const base = songLine(artist, title);
  const parts = [base === "—" ? "" : base];
  if (spotify) parts.push(`Spotify : ${spotify}`);
  if (confirmed) parts.push("Validée");
  return parts.filter(Boolean).join(" · ") || "—";
}

function buildEventHeaderSection(event) {
  const origins = loadRouteOrigins();
  const originAddress = resolveDepartureAddress(
    event.route_origin_key,
    event.route_origin_custom,
    origins
  );
  const directionsUrl =
    originAddress && event.address
      ? googleMapsDirectionsUrl(originAddress, event.address)
      : null;

  return section("Client et événement", [
    row("Client", clientFullName(event)),
    row("Téléphone", event.phone),
    row("Courriel", event.email),
    row("Type d'événement", event.event_type),
    row("Date", formatDateFr(event.event_date)),
    row("Heure début", formatTime(event.start_time)),
    row("Fin", formatDateTimeFr(event.end_date || event.event_date, event.end_time)),
    row("Salle", event.venue),
    row("Adresse", event.address, googleMapsUrl(event.address)),
    originAddress ? row("Départ (route)", originAddress, directionsUrl) : null,
    row("Nombre d'invités", event.guest_count),
    row("Statut", statusLabel(event.status))
  ]);
}

function buildServicesSection(services, event) {
  const items = services?.length ? [...services] : [];
  if (event?.bingo_musical_style && items.includes("Bingo musical")) {
    const index = items.indexOf("Bingo musical");
    items[index] = `Bingo musical (${event.bingo_musical_style})`;
  }
  if (event?.on_connait_chanson_notes && items.includes("On connaît la chanson")) {
    const index = items.indexOf("On connaît la chanson");
    items[index] = `On connaît la chanson (${event.on_connait_chanson_notes})`;
  }
  const list = items.length ? items.join(", ") : "—";
  return section("Services", [row("Services retenus", list)]);
}

function buildDayContactSection(q) {
  const dc = q.day_contact || {};
  return section("Personne à contacter le jour J", [
    row("Nom", dc.name),
    row("Téléphone", dc.phone),
    row("Courriel", dc.email)
  ]);
}

function buildAnimationSection(q) {
  const anim = q.animation || {};
  return section("Animation", [
    row("Niveau désiré", animationLevelLabel(anim.level)),
    row("Activités", listLabel(anim.activities)),
    row("Commentaires", anim.comments)
  ]);
}

function buildImportantQuestionsSection(q, wedding) {
  const iq = q.important_questions || {};
  return section("Questions importantes", [
    row("Soirée parfaite", iq.perfect_evening),
    row("Autres informations", iq.other_info),
    row(
      wedding ? "Situations familiales à éviter" : "Situations sensibles à éviter",
      wedding ? iq.family_situations : iq.sensitive_situations
    )
  ]);
}

function buildMomentsSection(q, momentKeys) {
  const moments = q.important_moments || [];
  const rows = momentKeys.map((def) => {
    const item = moments.find((m) => m.key === def.key) || {};
    const parts = [];
    if (item.active === "yes") parts.push("Oui");
    else if (item.active === "no") parts.push("Non");
    if (item.time) parts.push(formatTime(item.time));
    if (item.song) parts.push(`Chanson : ${item.song}`);
    if (item.notes) parts.push(item.notes);
    return row(def.label, parts.length ? parts.join(" · ") : "—");
  });
  return section("Moments importants", rows);
}

function buildPartyMusicQuestionnaireSection(q, wedding) {
  const pm = q.party_music || {};
  return section("Musique — questionnaire", [
    row("Styles / décennies", listLabel(pm.decades)),
    row("Chansons incontournables", pm.must_play),
    row("Artistes préférés", pm.preferred_artists),
    row("Chansons interdites", pm.forbidden_songs),
    row("Styles à éviter", pm.avoid_styles),
    row("Demandes des invités", guestRequestLabel(pm.guest_requests, wedding))
  ]);
}

function buildWeddingQuestionnaireSections(q) {
  const g = q.general || {};
  const ce = q.couple_entrance || {};
  const fd = q.first_dance || {};
  const sd = q.special_dances || {};
  const cd = q.cocktail_dinner || {};

  return [
    section("Informations générales", [
      row("Entrée invités en salle", formatTime(g.guest_arrival_time)),
      row("Entrée des mariés", formatTime(g.couple_entrance_time)),
      row("Heure souper", formatTime(g.dinner_time)),
      row("Première danse (approx.)", formatTime(g.first_dance_approx_time)),
      row("Début du party", formatTime(g.party_start_time))
    ]),
    section("Entrée", [
      row("Entrée officielle", ynLabel(ce.official_entrance)),
      row(
        "Garçons d'honneur",
        songDetail(ce.groomsmen_song, ce.groomsmen_spotify, ce.groomsmen_confirmed)
      ),
      row("Notes — garçons d'honneur", ce.groomsmen_notes),
      row(
        "Demoiselles d'honneur",
        songDetail(ce.bridesmaids_song, ce.bridesmaids_spotify, ce.bridesmaids_confirmed)
      ),
      row("Notes — demoiselles d'honneur", ce.bridesmaids_notes),
      row(
        "Entrée des mariés",
        songDetail(ce.couple_entrance_song, ce.couple_entrance_spotify, ce.couple_entrance_confirmed)
      ),
      row("Notes — entrée des mariés", ce.couple_entrance_notes)
    ]),
    section("Première danse", [
      row("Première danse", ynLabel(fd.enabled)),
      row("DJ annonce", ynLabel(fd.dj_announces)),
      row(
        "Chanson",
        songDetail(
          [fd.artist, fd.song].filter(Boolean).join(" — "),
          fd.spotify,
          fd.confirmed
        )
      ),
      row("Inviter les invités", inviteGuestsLabel(fd.invite_guests))
    ]),
    section("Danses spéciales", [
      row("Danse père / fille", ynLabel(sd.father_daughter_enabled)),
      row("Chanson père / fille", sd.father_daughter_song),
      row("Danse mère / fils", ynLabel(sd.mother_son_enabled)),
      row("Chanson mère / fils", sd.mother_son_song),
      row("Autre danse — personnes", sd.other_people),
      row("Autre danse — chanson", sd.other_song)
    ]),
    section("Cocktail et repas", [
      row("Styles cocktail", listLabel(cd.styles)),
      row("Emplacement cocktail", cocktailLocationLabel(cd.cocktail_location)),
      row("Lieu / endroit", cd.cocktail_place),
      row("Distance DJ au cocktail", cd.cocktail_dj_distance),
      row("Demandes souper", cd.dinner_requests)
    ]),
    buildPartyMusicQuestionnaireSection(q, true),
    buildAnimationSection(q),
    buildMomentsSection(q, MOMENT_KEYS),
    buildImportantQuestionsSection(q, true)
  ];
}

function buildPartyQuestionnaireSections(q) {
  const g = q.general || {};
  const sch = q.schedule || {};
  const themes = [...(g.evening_themes || [])];
  if (g.evening_theme_other && themes.includes("Autre")) {
    const idx = themes.indexOf("Autre");
    themes[idx] = `Autre : ${g.evening_theme_other}`;
  } else if (g.evening_theme_other) {
    themes.push(`Autre : ${g.evening_theme_other}`);
  }

  return [
    section("Informations générales", [
      row("Entrée invités en salle", formatTime(g.guest_arrival_time)),
      row("Début du party", formatTime(g.party_start_time)),
      row("Fin prévue", formatTime(g.expected_end_time)),
      row("Notes célébration", g.celebration_notes),
      row("Tranche d'âge", listLabel(g.age_groups)),
      row("Thème pour la soirée", listLabel(themes))
    ]),
    section("Déroulement", [
      row("Cocktail / accueil", ynLabel(sch.has_cocktail)),
      row("Repas / souper", ynLabel(sch.has_meal)),
      row("Discours / annonces", ynLabel(sch.speeches_planned)),
      row("Emplacement cocktail", cocktailLocationLabel(sch.cocktail_location)),
      row("Lieu / endroit", sch.cocktail_place),
      row("Distance DJ au cocktail", sch.cocktail_dj_distance),
      row("Moments spéciaux", sch.special_moments_notes)
    ]),
    buildPartyMusicQuestionnaireSection(q, false),
    buildAnimationSection(q),
    buildMomentsSection(q, PARTY_MOMENT_KEYS),
    buildImportantQuestionsSection(q, false)
  ];
}

function buildWeddingMusicTabSection(music) {
  const { WEDDING_ENTRANCE_SECTIONS } = require("./music");
  const specialDances = (music.specialDances || [])
    .filter((s) => s.artist || s.title || s.notes)
    .map((s) => {
      const parts = [s.notes, songLine(s.artist, s.title)].filter((p) => p && p !== "—");
      return parts.join(" — ");
    });
  const mustPlay = music.mustPlayText;
  const doNotPlay = music.doNotPlayText;

  const entranceRows = WEDDING_ENTRANCE_SECTIONS.flatMap((section) => {
    const song = music.entrances?.[section.key] || music.entrance || {};
    const rows = [
      row(
        section.label,
        songLineWithMeta(song.artist, song.title, song.spotify_url, song.confirmed)
      )
    ];
    if (song.notes?.trim()) {
      rows.push(row(`Notes — ${section.label.toLowerCase()}`, song.notes));
    }
    return rows;
  });

  if (music.entranceNotes?.trim()) {
    entranceRows.push(row("Notes — entrée (ancien)", music.entranceNotes));
  }

  return section("Musique — onglet Musique", [
    ...entranceRows,
    row(
      "Première danse",
      songLineWithMeta(
        music.firstDance?.artist,
        music.firstDance?.title,
        music.firstDance?.spotify_url,
        music.firstDance?.confirmed
      )
    ),
    row("Danses spéciales", specialDances.length ? specialDances.join(" ; ") : "—"),
    row("Musique cocktail — styles", listLabel(music.cocktailStyles)),
    row("Musique cocktail — Spotify", music.cocktailSpotify),
    row("Musique cocktail — notes", music.cocktailNotes),
    row("Musique souper — styles", listLabel(music.dinnerStyles)),
    row("Musique souper — Spotify", music.dinnerSpotify),
    row("Musique souper — notes", music.dinnerNotes),
    row("Incontournables", mustPlay || "—"),
    row("Ne pas jouer", doNotPlay || "—"),
    row("Demandes spéciales", music.specialRequests?.notes || music.specialRequests)
  ]);
}

function buildPartyMusicTabSection(music) {
  return section("Musique — onglet Musique", [
    row("Ambiance cocktail — styles", listLabel(music.cocktailStyles)),
    row("Ambiance cocktail — Spotify", music.cocktailSpotify),
    row("Ambiance cocktail — notes", music.cocktailNotes),
    row("Ambiance souper — styles", listLabel(music.dinnerStyles)),
    row("Ambiance souper — Spotify", music.dinnerSpotify),
    row("Ambiance souper — notes", music.dinnerNotes),
    row("Thème de la soirée", music.eveningTheme),
    row("Thème — notes", music.eveningThemeNotes),
    row("Demandes spéciales", music.specialRequests),
    row("À ne surtout pas jouer", music.doNotPlay)
  ]);
}

function buildTimelineSection(timelineItems) {
  if (!timelineItems?.length) {
    return section("Plan de soirée", [row("Étapes", "—")]);
  }
  const rows = timelineItems.map((item, index) => {
    const parts = [formatTime(item.time), item.title].filter((p) => p && p !== "—");
    if (item.description) parts.push(item.description);
    const song = songLine(item.song_artist, item.song_title);
    if (song !== "—") parts.push(song);
    if (item.dj_notes) parts.push(`Notes DJ : ${item.dj_notes}`);
    return row(`${index + 1}.`, parts.join(" · "));
  });
  return section("Plan de soirée", rows);
}

function formatTrailerRental(startDate, startTime, endDate, endTime) {
  return formatDateTimeRangeFr(startDate, startTime, endDate, endTime);
}

function formatRoomLocation(location, startDate, startTime, endDate, endTime) {
  const place = location?.trim() || "";
  const dates = formatDateTimeRangeFr(startDate, startTime, endDate, endTime);
  if (!place && dates === "—") return "—";
  if (place && dates !== "—") return `${place} — ${dates}`;
  return place || dates;
}

function buildDjNotesSection(djNotes) {
  const trailerRow =
    djNotes?.tech_trailer_needed === "no"
      ? row("Location trailer", "Non")
      : row(
          "Location trailer",
          formatTrailerRental(
            djNotes?.tech_trailer_start,
            djNotes?.tech_trailer_start_time,
            djNotes?.tech_trailer_end,
            djNotes?.tech_trailer_end_time
          )
        );

  const roomRow =
    djNotes?.tech_room_needed === "no"
      ? row("Location chambre", "Non")
      : row("Location chambre", formatRoomLocation(
          djNotes?.tech_room_location,
          djNotes?.tech_room_start,
          djNotes?.tech_room_start_time,
          djNotes?.tech_room_end,
          djNotes?.tech_room_end_time
        ));

  return section("Notes DJ (privées)", [
    row("Départ", formatDateTimeFr(djNotes?.tech_departure_date, djNotes?.tech_departure_time)),
    row("Arrivée", formatDateTimeFr(djNotes?.tech_arrival_date, djNotes?.tech_arrival_time)),
    trailerRow,
    roomRow,
    row("Notes", djNotes?.content),
    row("Dernière modification", formatTimestampFr(djNotes?.updated_at))
  ]);
}

function buildSummarySheet({ event, services, questionnaire, music, timelineItems, djNotes }) {
  const q = questionnaire?.data || {};
  const wedding = isWeddingEvent(event.event_type);
  const meta = [];

  if (questionnaire?.updated_at) {
    meta.push(row("Questionnaire modifié le", formatTimestampFr(questionnaire.updated_at)));
  }
  meta.push(row("Questionnaire complété", q._completed ? "Oui" : "Non"));

  const sections = [
    buildEventHeaderSection(event),
    buildServicesSection(services, event),
    buildDayContactSection(q),
    ...(wedding ? buildWeddingQuestionnaireSections(q) : buildPartyQuestionnaireSections(q)),
    wedding ? buildWeddingMusicTabSection(music) : buildPartyMusicTabSection(music),
    buildTimelineSection(timelineItems),
    buildDjNotesSection(djNotes),
    section("Métadonnées", meta)
  ];

  return {
    generatedAt: formatTimestampFr(localTimestampNow()),
    wedding,
    sections
  };
}

module.exports = { buildSummarySheet };
