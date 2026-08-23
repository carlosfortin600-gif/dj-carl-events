const { statusLabel, formatDateFr } = require("./helpers");
const { getDayGestionDetails } = require("./calendar-day-gestion");

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const WEEKDAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateIso(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseMonthParam(yearStr, monthStr) {
  const now = new Date();
  const year = yearStr ? Number(yearStr) : now.getFullYear();
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1;
  return { year, month };
}

function parseViewParam(view) {
  if (view === "day" || view === "week") return view;
  return "month";
}

function parseDateParam(dateStr) {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { year, month, day, iso: dateStr };
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    iso: formatDateIso(now.getFullYear(), now.getMonth() + 1, now.getDate())
  };
}

function monthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstWeekday(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return formatDateIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function getWeekDates(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const startOffset = d.getDay();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const curr = new Date(d);
    curr.setDate(d.getDate() - startOffset + i);
    dates.push(formatDateIso(curr.getFullYear(), curr.getMonth() + 1, curr.getDate()));
  }
  return dates;
}

function getEventsInRange(db, startIso, endIso) {
  return db
    .prepare(
      `SELECT e.*, c.first_name_1, c.first_name_2, c.last_name
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND e.event_date >= ?
         AND e.event_date <= ?
       ORDER BY e.event_date, e.start_time`
    )
    .all(startIso, endIso);
}

function groupByDate(events) {
  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.event_date]) byDate[ev.event_date] = [];
    byDate[ev.event_date].push(ev);
  }
  return byDate;
}

function buildQuery(params) {
  const q = {};
  if (params.view) q.view = params.view;
  if (params.date) q.date = params.date;
  if (params.year) q.year = String(params.year);
  if (params.month) q.month = String(params.month);
  if (params.selectedDate) q.date = params.selectedDate;
  return q;
}

function getCalendarViewData(db, options = {}) {
  const view = parseViewParam(options.view);
  const selectedDate = options.selectedDate || null;
  const todayIso = formatDateIso(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate()
  );

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
  let dayEvents = null;
  let dayGestionDetails = null;
  let year = anchor.year;
  let month = anchor.month;
  let daysInMonth = null;
  let firstWeekday = null;
  let prevMonth = null;
  let nextMonth = null;

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
    prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    prevQuery = buildQuery({ view: "month", year: prevMonth.year, month: prevMonth.month });
    nextQuery = buildQuery({ view: "month", year: nextMonth.year, month: nextMonth.month });
    daysInMonth = getDaysInMonth(year, month);
    firstWeekday = getFirstWeekday(year, month);
  }

  const events = getEventsInRange(db, rangeStart, rangeEnd);
  const byDate = groupByDate(events);

  if (view === "week") {
    const dates = getWeekDates(anchor.iso);
    weekDays = dates.map((iso) => ({
      iso,
      dayNum: parseDateParam(iso).day,
      weekdayLabel: WEEKDAY_SHORT[new Date(`${iso}T12:00:00`).getDay()],
      events: byDate[iso] || [],
      isToday: iso === todayIso,
      isSelected: iso === selectedDate,
      gestionDetails: options.includeDayGestion ? getDayGestionDetails(db, iso) : null
    }));
  }

  if (view === "day") {
    dayEvents = byDate[anchor.iso] || [];
    if (options.includeDayGestion) {
      dayGestionDetails = getDayGestionDetails(db, anchor.iso);
    }
  }

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return {
    view,
    anchorDate: anchor.iso,
    year,
    month,
    monthLabel,
    periodLabel,
    daysInMonth,
    firstWeekday,
    byDate,
    prevMonth,
    nextMonth,
    prevQuery,
    nextQuery,
    weekDays,
    dayEvents,
    dayGestionDetails,
    selectedDate,
    todayIso,
    statusLabel,
    navPrevLabel: view === "day" ? "Jour précédent" : view === "week" ? "Semaine précédente" : "Mois précédent",
    navNextLabel: view === "day" ? "Jour suivant" : view === "week" ? "Semaine suivante" : "Mois suivant"
  };
}

function getCalendarData(db, year, month) {
  return getCalendarViewData(db, { view: "month", year, month });
}

function enrichByDate(byDate, enrichEvent) {
  const enriched = {};
  for (const [date, events] of Object.entries(byDate)) {
    enriched[date] = events.map(enrichEvent);
  }
  return enriched;
}

function getSubcontractorCalendarData(db, subcontractorId, options = {}) {
  const cal = getCalendarViewData(db, options);
  const byDate = enrichByDate(cal.byDate, (ev) => ({
    ...ev,
    contractUrl: `/events/${ev.id}?tab=gestion&gestion=contrat&sousTraitant=${subcontractorId}`
  }));

  let weekDays = cal.weekDays;
  if (weekDays) {
    weekDays = weekDays.map((day) => ({
      ...day,
      events: (byDate[day.iso] || []).map((ev) => ev)
    }));
  }

  let dayEvents = cal.dayEvents;
  if (dayEvents) {
    dayEvents = dayEvents.map((ev) => ({
      ...ev,
      contractUrl: `/events/${ev.id}?tab=gestion&gestion=contrat&sousTraitant=${subcontractorId}`
    }));
  }

  return {
    ...cal,
    byDate,
    weekDays,
    dayEvents
  };
}

function queryString(params, baseExtra = {}) {
  const merged = { ...baseExtra, ...params };
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== null && value !== undefined && value !== "") {
      q.set(key, String(value));
    }
  }
  return q.toString();
}

module.exports = {
  parseMonthParam,
  parseViewParam,
  parseDateParam,
  getCalendarData,
  getCalendarViewData,
  getSubcontractorCalendarData,
  queryString,
  monthKey
};
