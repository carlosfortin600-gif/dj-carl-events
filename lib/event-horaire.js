const {
  formatDateFr,
  formatTime,
  formatDateTimeFr,
  formatDateTimeRangeFr
} = require("./helpers");
const { isWeddingEvent } = require("./questionnaire-shared");
const { MOMENT_KEYS } = require("./questionnaire");
const { PARTY_MOMENT_KEYS } = require("./party-questionnaire");
const { isLateNightTime } = require("./late-time");
const { loadRouteOrigins, resolveDepartureAddress } = require("./route-time");

function addDaysIso(dateStr, days) {
  if (!dateStr) return dateStr;
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

function sortKeyFromDateTime(dateStr, timeStr) {
  const d = (dateStr || "").trim();
  const t = (timeStr || "").trim();
  if (!d || !t) return null;
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${d}T${match[1].padStart(2, "0")}:${match[2]}`;
}

function sortKeyEventTime(eventDate, timeStr) {
  if (!timeStr?.trim()) return null;
  let day = eventDate || "";
  if (day && isLateNightTime(timeStr)) day = addDaysIso(day, 1);
  return sortKeyFromDateTime(day, timeStr);
}

function whenDisplayDateTime(dateStr, timeStr) {
  const formatted = formatDateTimeFr(dateStr, timeStr);
  return formatted === "—" ? null : formatted;
}

function whenDisplayTime(timeStr) {
  const formatted = formatTime(timeStr);
  return formatted === "—" ? null : formatted;
}

function pushEntry(list, entry) {
  if (!entry.when && !entry.detail) return;
  list.push(entry);
}

function buildEventHoraire({
  event,
  questionnaire,
  timelineItems,
  djNotes
}) {
  const q = questionnaire?.data || {};
  const eventId = event.id;
  const entries = [];

  const link = (tab, extra = "") => `/events/${eventId}?tab=${tab}${extra}`;

  pushEntry(entries, {
    sortKey: sortKeyFromDateTime(event.event_date, event.start_time),
    when: [formatDateFr(event.event_date), whenDisplayTime(event.start_time)].filter(Boolean).join(" · "),
    label: "Heure début (contrat / événement)",
    detail: null,
    source: "Contrat",
    href: link("resume")
  });

  const endDate = event.end_date || event.event_date;
  pushEntry(entries, {
    sortKey: sortKeyFromDateTime(endDate, event.end_time),
    when: whenDisplayDateTime(endDate, event.end_time),
    label: "Fin (contrat / événement)",
    detail: null,
    source: "Contrat",
    href: link("resume")
  });

  const origins = loadRouteOrigins();
  const originAddress = resolveDepartureAddress(
    event.route_origin_key,
    event.route_origin_custom,
    origins
  );
  if (originAddress) {
    pushEntry(entries, {
      sortKey: null,
      when: "—",
      label: "Point de départ (trajet)",
      detail: originAddress,
      source: "Contrat",
      href: link("resume")
    });
  }

  pushEntry(entries, {
    sortKey: sortKeyFromDateTime(djNotes?.tech_departure_date, djNotes?.tech_departure_time),
    when: whenDisplayDateTime(djNotes?.tech_departure_date, djNotes?.tech_departure_time),
    label: "Départ DJ",
    detail: null,
    source: "Gestion",
    href: link("gestion", "&gestion=depart")
  });

  pushEntry(entries, {
    sortKey: sortKeyFromDateTime(djNotes?.tech_arrival_date, djNotes?.tech_arrival_time),
    when: whenDisplayDateTime(djNotes?.tech_arrival_date, djNotes?.tech_arrival_time),
    label: "Arrivée sur place",
    detail: null,
    source: "Gestion",
    href: link("gestion", "&gestion=depart")
  });

  pushEntry(entries, {
    sortKey: sortKeyFromDateTime(djNotes?.tech_callback_date, djNotes?.tech_callback_time),
    when: whenDisplayDateTime(djNotes?.tech_callback_date, djNotes?.tech_callback_time),
    label: "Rappel / suivi",
    detail: null,
    source: "Gestion",
    href: link("gestion", "&gestion=depart")
  });

  const hotelRange = formatDateTimeRangeFr(
    djNotes?.tech_room_start,
    djNotes?.tech_room_start_time,
    djNotes?.tech_room_end,
    djNotes?.tech_room_end_time
  );
  if (hotelRange && hotelRange !== "—") {
    pushEntry(entries, {
      sortKey: sortKeyFromDateTime(djNotes?.tech_room_start, djNotes?.tech_room_start_time),
      when: hotelRange,
      label: "Hôtel (location)",
      detail: djNotes?.tech_room_location?.trim() || null,
      source: "Gestion",
      href: link("gestion", "&gestion=location")
    });
  }

  const trailerRange = formatDateTimeRangeFr(
    djNotes?.tech_trailer_start,
    djNotes?.tech_trailer_start_time,
    djNotes?.tech_trailer_end,
    djNotes?.tech_trailer_end_time
  );
  if (trailerRange && trailerRange !== "—") {
    pushEntry(entries, {
      sortKey: sortKeyFromDateTime(djNotes?.tech_trailer_start, djNotes?.tech_trailer_start_time),
      when: trailerRange,
      label: "Trailer (location)",
      detail: djNotes?.tech_trailer_location?.trim() || null,
      source: "Gestion",
      href: link("gestion", "&gestion=location")
    });
  }

  const g = q.general || {};
  const generalTimes = isWeddingEvent(event.event_type)
    ? [
        ["Entrée invités en salle", g.guest_arrival_time],
        ["Entrée des mariés", g.couple_entrance_time],
        ["Heure souper", g.dinner_time],
        ["Première danse (approx.)", g.first_dance_approx_time],
        ["Début du party", g.party_start_time],
        ["Fin prévue", g.expected_end_time]
      ]
    : [
        ["Entrée invités en salle", g.guest_arrival_time],
        ["Début du party", g.party_start_time],
        ["Fin prévue", g.expected_end_time]
      ];

  generalTimes.forEach(([label, time]) => {
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, time),
      when: whenDisplayTime(time),
      label,
      detail: null,
      source: "Questionnaire",
      href: link("questionnaire")
    });
  });

  if (isWeddingEvent(event.event_type)) {
    const ceremony = q.ceremony || {};
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, ceremony.start_time),
      when: whenDisplayTime(ceremony.start_time),
      label: "Cérémonie — début",
      detail: ceremony.location?.trim() || null,
      source: "Questionnaire",
      href: link("questionnaire")
    });
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, ceremony.end_time),
      when: whenDisplayTime(ceremony.end_time),
      label: "Cérémonie — fin",
      detail: null,
      source: "Questionnaire",
      href: link("questionnaire")
    });
  }

  const momentKeys = isWeddingEvent(event.event_type) ? MOMENT_KEYS : PARTY_MOMENT_KEYS;
  const momentByKey = Object.fromEntries(momentKeys.map((m) => [m.key, m.label]));
  (q.important_moments || []).forEach((moment) => {
    if (moment.active !== "yes") return;
    const label = momentByKey[moment.key] || moment.label || moment.key;
    const parts = [];
    if (moment.song?.trim()) parts.push(moment.song.trim());
    if (moment.notes?.trim()) parts.push(moment.notes.trim());
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, moment.time),
      when: whenDisplayTime(moment.time),
      label: `Moment — ${label}`,
      detail: parts.length ? parts.join(" · ") : null,
      source: "Plan client",
      href: link("timeline")
    });
  });

  (q.client_plan?.steps || []).forEach((step) => {
    if (!step.title && !step.time && !step.description) return;
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, step.time),
      when: whenDisplayTime(step.time),
      label: step.title?.trim() || "Étape client",
      detail: step.description?.trim() || null,
      source: "Plan client",
      href: link("timeline")
    });
  });

  (timelineItems || []).forEach((item) => {
    const song = [item.song_artist, item.song_title].filter((s) => s && String(s).trim()).join(" — ");
    const detailParts = [];
    if (song) detailParts.push(song);
    if (item.description?.trim()) detailParts.push(item.description.trim());
    if (item.dj_notes?.trim()) detailParts.push(`Notes DJ : ${item.dj_notes.trim()}`);
    pushEntry(entries, {
      sortKey: sortKeyEventTime(event.event_date, item.time),
      when: whenDisplayTime(item.time),
      label: item.title,
      detail: detailParts.length ? detailParts.join(" · ") : null,
      source: "Plan DJ",
      href: link("timeline")
    });
  });

  const withSort = entries.filter((e) => e.sortKey);
  const withoutSort = entries.filter((e) => !e.sortKey);
  withSort.sort((a, b) => {
    const c = a.sortKey.localeCompare(b.sortKey);
    if (c !== 0) return c;
    return a.label.localeCompare(b.label, "fr");
  });

  const chronological = [...withSort, ...withoutSort];

  const bySource = {};
  for (const entry of chronological) {
    const key = entry.source;
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(entry);
  }

  return {
    eventDate: event.event_date,
    chronological,
    bySource
  };
}

module.exports = {
  buildEventHoraire,
  sortKeyEventTime
};