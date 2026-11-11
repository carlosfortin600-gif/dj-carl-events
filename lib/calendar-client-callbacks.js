const { CLIENT_CONTACT_SQL, clientShortName, formatDateFr, compareChronologicalTime } = require("./helpers");
const { formatContactPersonDisplay } = require("./client-contact-log");

function getClientCallbacksInRange(db, startIso, endIso) {
  return db
    .prepare(
      `SELECT e.*, ${CLIENT_CONTACT_SQL}, c.phone,
              n.tech_callback_name, n.tech_callback_party,
              n.tech_callback_date, n.tech_callback_time
       FROM dj_notes n
       JOIN events e ON e.id = n.event_id
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND n.tech_callback_date IS NOT NULL
         AND TRIM(n.tech_callback_date) != ''
         AND n.tech_callback_date >= ?
         AND n.tech_callback_date <= ?
         AND COALESCE(NULLIF(TRIM(n.tech_callback_party), ''), 'client') = 'client'`
    )
    .all(startIso, endIso);
}

function enrichClientCallbackRow(row) {
  const person = row.tech_callback_name?.trim() || null;
  const who = person || clientShortName(row);
  return {
    ...row,
    isClientCallback: true,
    calendarDate: row.tech_callback_date,
    calendarTime: row.tech_callback_time?.trim() || null,
    callbackContactLabel: formatContactPersonDisplay(row.tech_callback_name, row.tech_callback_party),
    calendarEntryPrimary: `Rappeler — ${who}`,
    calendarEntrySubtitle: `Dossier ${clientShortName(row)} · événement le ${formatDateFr(row.event_date)}`,
    gestionDepartUrl: `/events/${row.id}?tab=gestion&gestion=depart`
  };
}

function sortCalendarDayItems(items) {
  return [...items].sort((a, b) => {
    const timeA = a.isClientCallback ? a.calendarTime || "" : a.calendarTime || a.start_time || "";
    const timeB = b.isClientCallback ? b.calendarTime || "" : b.calendarTime || b.start_time || "";
    const timeCmp = compareChronologicalTime(timeA, timeB);
    if (timeCmp !== 0) return timeCmp;
    if (a.isClientCallback !== b.isClientCallback) return a.isClientCallback ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
}

function mergeClientCallbacksIntoByDate(byDate, callbacks) {
  const merged = { ...byDate };
  for (const row of callbacks) {
    const date = row.tech_callback_date;
    if (!merged[date]) merged[date] = [];
    merged[date].push(enrichClientCallbackRow(row));
  }
  for (const date of Object.keys(merged)) {
    merged[date] = sortCalendarDayItems(merged[date]);
  }
  return merged;
}

function attachClientCallbacksToCalendar(db, byDate, rangeStart, rangeEnd, enabled = true) {
  if (!enabled) return byDate;
  const callbacks = getClientCallbacksInRange(db, rangeStart, rangeEnd);
  if (!callbacks.length) return byDate;
  return mergeClientCallbacksIntoByDate(byDate, callbacks);
}

module.exports = {
  getClientCallbacksInRange,
  enrichClientCallbackRow,
  mergeClientCallbacksIntoByDate,
  attachClientCallbacksToCalendar,
  sortCalendarDayItems
};
