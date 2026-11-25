const {
  CLIENT_CONTACT_SQL,
  clientShortName,
  clientCompanyName,
  clientContactPersonName,
  formatDateFr,
  formatDateTimeFr,
  formatDateTimeRangeFr,
  formatTime,
  formatHourFr,
  todayLocal,
  formatPhoneDisplay,
  formatPhoneWithExtension
} = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups } = require("./calendar");
const { eventDestinationAddress } = require("./tech-departure");
const { getQuestionnaireForEvent } = require("./questionnaire");
const { compareLateTime } = require("./late-time");
const { loadRouteOrigins, resolveDepartureAddress } = require("./route-time");
const {
  parseViewParam,
  parseDateParam,
  parseMonthParam,
  getWeekDates,
  addDays,
  formatDateIso,
  getDaysInMonth,
  getFirstWeekday,
  MONTH_NAMES,
  WEEKDAY_SHORT,
  queryString
} = require("./calendar");

function gestionUrl(eventId, section) {
  const q = section ? `?tab=gestion&gestion=${section}` : "?tab=gestion";
  return `/events/${eventId}${q}`;
}

function loadLogisticsRows(db) {
  return db
    .prepare(
      `SELECT e.id AS event_id, e.event_date, e.start_time, e.end_time, e.end_date,
              e.venue, e.address, e.city, e.status, e.route_origin_key, e.route_origin_custom,
              ${CLIENT_CONTACT_SQL},
              n.tech_departure_date, n.tech_departure_time,
              n.tech_arrival_date, n.tech_arrival_time,
              n.tech_trailer_needed, n.tech_trailer_start, n.tech_trailer_start_time,
              n.tech_trailer_end, n.tech_trailer_end_time, n.tech_trailer_location,
              n.tech_room_needed, n.tech_room_location,
              n.tech_room_start, n.tech_room_start_time,
              n.tech_room_end, n.tech_room_end_time,
              n.tech_room_event_distance, n.tech_room_notes,
              n.tech_entry_distance, n.tech_entry_doors, n.tech_entry_procedure,
              n.tech_callback_date, n.tech_callback_time
       FROM events e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN dj_notes n ON n.event_id = e.id
       WHERE e.deleted_at IS NULL`
    )
    .all();
}

function clientLabel(row) {
  return clientShortName(row);
}

function pushItem(byDate, dateIso, item) {
  if (!dateIso) return;
  if (!byDate[dateIso]) byDate[dateIso] = [];
  byDate[dateIso].push(item);
}

function sortDayItems(items) {
  return [...items].sort((a, b) => {
    const tc = compareLateTime(a.sortTime || "", b.sortTime || "");
    if (tc !== 0) return tc;
    return a.clientLabel.localeCompare(b.clientLabel, "fr");
  });
}

function buildAccessDetail(row) {
  const parts = [];
  if (row.tech_entry_distance?.trim()) parts.push(`Distance : ${row.tech_entry_distance.trim()}`);
  if (row.tech_entry_doors?.trim()) parts.push(`${row.tech_entry_doors.trim()} porte(s)`);
  if (row.tech_entry_procedure?.trim()) parts.push(row.tech_entry_procedure.trim());
  if (row.tech_room_event_distance?.trim()) {
    parts.push(`Hôtel ↔ salle : ${row.tech_room_event_distance.trim()}`);
  }
  if (row.venue?.trim()) parts.push(row.venue.trim());
  if (row.address?.trim()) {
    const addr = [row.address, row.city].filter(Boolean).join(", ");
    if (addr) parts.push(addr);
  }
  return parts.length ? parts.join(" · ") : null;
}

function indexLogisticsByDate(db) {
  const rows = loadLogisticsRows(db);
  const byDate = {};
  const origins = loadRouteOrigins();

  for (const row of rows) {
    const client = clientLabel(row);
    const eventId = row.event_id;
    const access = buildAccessDetail(row);
    const origin = resolveDepartureAddress(
      row.route_origin_key,
      row.route_origin_custom,
      origins
    );

    if (row.tech_departure_date?.trim()) {
      pushItem(byDate, row.tech_departure_date.trim(), {
        eventId,
        clientLabel: client,
        kind: "depart",
        label: "Départ",
        when: formatDateTimeFr(row.tech_departure_date, row.tech_departure_time),
        sortTime: row.tech_departure_time || "",
        detail: origin || null,
        gestionUrl: gestionUrl(eventId, "depart")
      });
    }

    if (row.tech_arrival_date?.trim()) {
      pushItem(byDate, row.tech_arrival_date.trim(), {
        eventId,
        clientLabel: client,
        kind: "arrivee",
        label: "Arrivée / installation",
        when: formatDateTimeFr(row.tech_arrival_date, row.tech_arrival_time),
        sortTime: row.tech_arrival_time || "",
        detail: access,
        gestionUrl: gestionUrl(eventId, "depart")
      });
    }

    if (row.tech_callback_date?.trim()) {
      pushItem(byDate, row.tech_callback_date.trim(), {
        eventId,
        clientLabel: client,
        kind: "rappel",
        label: "Rappel client",
        when: formatDateTimeFr(row.tech_callback_date, row.tech_callback_time),
        sortTime: row.tech_callback_time || "",
        detail: null,
        gestionUrl: gestionUrl(eventId, "depart")
      });
    }

    const trailerStart = row.tech_trailer_start?.trim();
    const trailerEnd = row.tech_trailer_end?.trim() || trailerStart;
    if (trailerStart && (row.tech_trailer_needed === "yes" || trailerEnd)) {
      const period = formatDateTimeRangeFr(
        row.tech_trailer_start,
        row.tech_trailer_start_time,
        row.tech_trailer_end || row.tech_trailer_start,
        row.tech_trailer_end_time
      );
      if (trailerStart) {
        pushItem(byDate, trailerStart, {
          eventId,
          clientLabel: client,
          kind: "trailer",
          label: "Trailer — début",
          when: formatDateTimeFr(row.tech_trailer_start, row.tech_trailer_start_time),
          sortTime: row.tech_trailer_start_time || "",
          detail: [row.tech_trailer_location?.trim(), period !== "—" ? period : null]
            .filter(Boolean)
            .join(" · ") || null,
          gestionUrl: gestionUrl(eventId, "location")
        });
      }
      if (trailerEnd && trailerEnd !== trailerStart) {
        pushItem(byDate, trailerEnd, {
          eventId,
          clientLabel: client,
          kind: "trailer",
          label: "Trailer — fin",
          when: formatDateTimeFr(row.tech_trailer_end, row.tech_trailer_end_time),
          sortTime: row.tech_trailer_end_time || "",
          detail: null,
          gestionUrl: gestionUrl(eventId, "location")
        });
      }
    }

    const roomStart = row.tech_room_start?.trim();
    const roomEnd = row.tech_room_end?.trim() || roomStart;
    const roomOn =
      row.tech_room_needed === "yes" || row.tech_room_location || roomStart;
    if (roomOn && roomStart) {
      pushItem(byDate, roomStart, {
        eventId,
        clientLabel: client,
        kind: "hotel",
        label: "Hôtel — arrivée",
        when: formatDateTimeFr(row.tech_room_start, row.tech_room_start_time),
        sortTime: row.tech_room_start_time || "",
        detail: [row.tech_room_location?.trim(), row.tech_room_notes?.trim()]
          .filter(Boolean)
          .join(" · ") || null,
        gestionUrl: gestionUrl(eventId, "location")
      });
    }
    if (roomOn && roomEnd && roomEnd !== roomStart) {
      pushItem(byDate, roomEnd, {
        eventId,
        clientLabel: client,
        kind: "hotel",
        label: "Hôtel — départ",
        when: formatDateTimeFr(row.tech_room_end, row.tech_room_end_time),
        sortTime: row.tech_room_end_time || "",
        detail: null,
        gestionUrl: gestionUrl(eventId, "location")
      });
    }

  }

  for (const iso of Object.keys(byDate)) {
    byDate[iso] = sortDayItems(byDate[iso]);
  }
  return byDate;
}

function getDayLogisticsDetails(db, dateIso) {
  const byDate = indexLogisticsByDate(db);
  return { items: byDate[dateIso] || [] };
}

function buildQuery(params) {
  const q = {};
  if (params.view) q.view = params.view;
  if (params.date) q.date = params.date;
  if (params.year) q.year = String(params.year);
  if (params.month) q.month = String(params.month);
  return q;
}

function getLogisticsViewData(db, options = {}) {
  const view = parseViewParam(options.view);
  const todayIso = formatDateIso(...require("./app-timezone").todayInAppTimezone().split("-").map(Number));

  let anchor;
  if (options.date) {
    anchor = parseDateParam(options.date);
  } else if (options.year && options.month) {
    anchor = parseDateParam(formatDateIso(Number(options.year), Number(options.month), 1));
  } else {
    anchor = parseDateParam(null);
  }

  let rangeStart;
  let rangeEnd;
  let periodLabel;
  let prevQuery;
  let nextQuery;
  let weekDays = null;
  let dayLogistics = null;
  let year = anchor.year;
  let month = anchor.month;
  let daysInMonth = null;
  let firstWeekday = null;

  if (view === "day") {
    rangeStart = anchor.iso;
    rangeEnd = anchor.iso;
    periodLabel = formatDateFr(anchor.iso);
    prevQuery = buildQuery({ view: "day", date: addDays(anchor.iso, -1) });
    nextQuery = buildQuery({ view: "day", date: addDays(anchor.iso, 1) });
  } else if (view === "week") {
    const dates = getWeekDates(anchor.iso);
    rangeStart = dates[0];
    rangeEnd = dates[6];
    periodLabel = `${formatDateFr(dates[0])} — ${formatDateFr(dates[6])}`;
    prevQuery = buildQuery({ view: "week", date: addDays(anchor.iso, -7) });
    nextQuery = buildQuery({ view: "week", date: addDays(anchor.iso, 7) });
  } else {
    year = options.year ? Number(options.year) : anchor.year;
    month = options.month ? Number(options.month) : anchor.month;
    rangeStart = formatDateIso(year, month, 1);
    rangeEnd = formatDateIso(year, month, getDaysInMonth(year, month));
    periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;
    const prevMonth =
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    const nextMonth =
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    prevQuery = buildQuery({ view: "month", year: prevMonth.year, month: prevMonth.month });
    nextQuery = buildQuery({ view: "month", year: nextMonth.year, month: nextMonth.month });
    daysInMonth = getDaysInMonth(year, month);
    firstWeekday = getFirstWeekday(year, month);
  }

  const fullIndex = indexLogisticsByDate(db);
  const byDate = {};
  for (const [iso, items] of Object.entries(fullIndex)) {
    if (iso >= rangeStart && iso <= rangeEnd) byDate[iso] = items;
  }

  if (view === "week") {
    const dates = getWeekDates(anchor.iso);
    weekDays = dates.map((iso) => ({
      iso,
      dayNum: parseDateParam(iso).day,
      weekdayLabel: WEEKDAY_SHORT[new Date(`${iso}T12:00:00`).getDay()],
      items: fullIndex[iso] || [],
      isToday: iso === todayIso
    }));
  }

  if (view === "day") {
    dayLogistics = getDayLogisticsDetails(db, anchor.iso);
  }

  return {
    view,
    anchorDate: anchor.iso,
    year,
    month,
    periodLabel,
    daysInMonth,
    firstWeekday,
    byDate,
    prevQuery,
    nextQuery,
    weekDays,
    dayLogistics,
    todayIso,
    navPrevLabel:
      view === "day" ? "Jour précédent" : view === "week" ? "Semaine précédente" : "Mois précédent",
    navNextLabel:
      view === "day" ? "Jour suivant" : view === "week" ? "Semaine suivante" : "Mois suivant"
  };
}

function buildEventLogisticsSheet(event, djNotes) {
  const rows = [];
  const add = (label, when, detail, href) => {
    if (!when && !detail) return;
    rows.push({ label, when: when || "—", detail: detail || null, href });
  };

  const origins = loadRouteOrigins();
  const origin = resolveDepartureAddress(
    event.route_origin_key,
    event.route_origin_custom,
    origins
  );

  add(
    "Départ",
    formatDateTimeFr(djNotes?.tech_departure_date, djNotes?.tech_departure_time),
    origin,
    gestionUrl(event.id, "depart")
  );
  add(
    "Arrivée / installation",
    formatDateTimeFr(djNotes?.tech_arrival_date, djNotes?.tech_arrival_time),
    buildAccessDetail({ ...event, ...djNotes }),
    gestionUrl(event.id, "depart")
  );
  add(
    "Hôtel",
    formatDateTimeRangeFr(
      djNotes?.tech_room_start,
      djNotes?.tech_room_start_time,
      djNotes?.tech_room_end,
      djNotes?.tech_room_end_time
    ),
    [djNotes?.tech_room_location, djNotes?.tech_room_event_distance]
      .filter((s) => s && String(s).trim())
      .join(" · ") || null,
    gestionUrl(event.id, "location")
  );
  add(
    "Trailer",
    formatDateTimeRangeFr(
      djNotes?.tech_trailer_start,
      djNotes?.tech_trailer_start_time,
      djNotes?.tech_trailer_end,
      djNotes?.tech_trailer_end_time
    ),
    djNotes?.tech_trailer_location?.trim() || null,
    gestionUrl(event.id, "location")
  );
  add(
    "Accès salle",
    null,
    [
      djNotes?.tech_entry_distance,
      djNotes?.tech_entry_doors ? `${djNotes.tech_entry_doors} porte(s)` : null,
      djNotes?.tech_entry_procedure
    ]
      .filter((s) => s && String(s).trim())
      .join(" · ") || null,
    gestionUrl(event.id, "depart")
  );
  add(
    "Début contrat (référence)",
    formatDateTimeFr(event.event_date, event.start_time),
    [event.venue, event.address, event.city].filter(Boolean).join(", ") || null,
    `/events/${event.id}?tab=resume`
  );

  return { rows };
}

function formatAccessSummary(row) {
  const parts = [];
  if (row.tech_entry_distance?.trim()) parts.push(`Distance entrée : ${row.tech_entry_distance.trim()}`);
  if (row.tech_entry_doors?.trim()) parts.push(`${row.tech_entry_doors.trim()} porte(s)`);
  if (row.tech_entry_procedure?.trim()) parts.push(row.tech_entry_procedure.trim());
  return parts.length ? parts.join(" · ") : null;
}

function getLogisticsEventsList(db) {
  const today = todayLocal();
  const origins = loadRouteOrigins();
  const rows = db
    .prepare(
      `SELECT e.*, ${CLIENT_CONTACT_SQL},
              c.phone AS client_phone, c.phone_cell AS client_phone_cell,
              c.phone_ext AS client_phone_ext, c.email AS client_email,
              n.tech_departure_date, n.tech_departure_time,
              n.tech_arrival_date, n.tech_arrival_time,
              n.tech_trailer_needed, n.tech_trailer_location,
              n.tech_trailer_start, n.tech_trailer_start_time,
              n.tech_trailer_end, n.tech_trailer_end_time,
              n.tech_room_needed, n.tech_room_location,
              n.tech_room_start, n.tech_room_start_time,
              n.tech_room_end, n.tech_room_end_time,
              n.tech_room_event_distance, n.tech_room_notes,
              n.tech_entry_distance, n.tech_entry_doors, n.tech_entry_procedure
       FROM events e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN dj_notes n ON n.event_id = e.id
       WHERE e.deleted_at IS NULL
         AND e.event_date >= ?
       ORDER BY e.event_date ASC, e.start_time ASC`
    )
    .all(today);

  const eventsList = rows.map((row) => {
    const departureAt = formatDateTimeFr(row.tech_departure_date, row.tech_departure_time);
    const arrivalAt = formatDateTimeFr(row.tech_arrival_date, row.tech_arrival_time);
    const hotelNeeded = row.tech_room_needed === "yes";
    const trailerNeeded = row.tech_trailer_needed === "yes";
    const hotelPeriod =
      hotelNeeded || row.tech_room_start?.trim()
        ? formatDateTimeRangeFr(
            row.tech_room_start,
            row.tech_room_start_time,
            row.tech_room_end,
            row.tech_room_end_time
          )
        : null;
    const trailerPeriod =
      trailerNeeded || row.tech_trailer_start?.trim()
        ? formatDateTimeRangeFr(
            row.tech_trailer_start,
            row.tech_trailer_start_time,
            row.tech_trailer_end,
            row.tech_trailer_end_time
          )
        : null;

    const departureFrom = resolveDepartureAddress(
      row.route_origin_key,
      row.route_origin_custom,
      origins
    );
    const arrivalAddress = eventDestinationAddress(row);
    const companyLabel = clientCompanyName(row);
    const contactPersonLabel = clientContactPersonName(row);
    const questionnaire = getQuestionnaireForEvent(db, row.id, row.event_type);
    const dayContact = questionnaire?.data?.day_contact || {};
    const dayContactPhone = dayContact.phone?.trim() || null;
    const dayContactName = dayContact.name?.trim() || null;
    const dayContactEmail = dayContact.email?.trim() || null;
    const clientPhoneMain = row.client_phone?.trim() || row.phone?.trim() || null;
    const clientPhoneCell = row.client_phone_cell?.trim() || row.phone_cell?.trim() || null;
    const clientPhoneExt = row.client_phone_ext?.trim() || row.phone_ext?.trim() || null;
    const clientEmail = row.client_email?.trim() || row.email?.trim() || null;

    return {
      ...row,
      companyLabel,
      contactPersonLabel,
      clientPhoneMain,
      clientPhoneCell,
      clientPhoneMainDisplay: clientPhoneMain
        ? formatPhoneWithExtension(clientPhoneMain, clientPhoneExt)
        : null,
      clientPhoneCellDisplay: clientPhoneCell
        ? formatPhoneDisplay(clientPhoneCell)
        : null,
      clientEmail,
      dayContactName,
      dayContactPhone,
      dayContactEmail,
      dayContactPhoneDisplay: dayContactPhone
        ? formatPhoneDisplay(dayContactPhone)
        : null,
      departureAt: departureAt !== "—" ? departureAt : null,
      arrivalAt: arrivalAt !== "—" ? arrivalAt : null,
      departureTimeLabel:
        row.tech_departure_time?.trim() ? formatHourFr(row.tech_departure_time) : null,
      arrivalTimeLabel:
        row.tech_arrival_time?.trim() ? formatHourFr(row.tech_arrival_time) : null,
      departureDateLabel: row.tech_departure_date?.trim()
        ? formatDateFr(row.tech_departure_date)
        : null,
      arrivalDateLabel: row.tech_arrival_date?.trim()
        ? formatDateFr(row.tech_arrival_date)
        : null,
      departureFrom: departureFrom || null,
      arrivalAddress: arrivalAddress || null,
      accessSummary: formatAccessSummary(row),
      hotelNeeded,
      trailerNeeded,
      hotelPeriod,
      trailerPeriod,
      hotelLocation: row.tech_room_location?.trim() || null,
      hotelEventDistance: row.tech_room_event_distance?.trim() || null,
      trailerLocation: row.tech_trailer_location?.trim() || null
    };
  });

  const eventsByMonth = enrichUpcomingMonthGroups(
    groupEventsByMonth(eventsList),
    today
  );

  return { eventsList, eventsByMonth };
}

module.exports = {
  getLogisticsViewData,
  getLogisticsEventsList,
  getDayLogisticsDetails,
  buildEventLogisticsSheet,
  indexLogisticsByDate
};