const { statusLabel } = require("./helpers");

function parseMonthParam(yearStr, monthStr) {
  const now = new Date();
  const year = yearStr ? Number(yearStr) : now.getFullYear();
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1;
  return { year, month };
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstWeekday(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function getCalendarData(db, year, month) {
  const events = db
    .prepare(
      `SELECT e.*, c.first_name_1, c.first_name_2, c.last_name
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND strftime('%Y', e.event_date) = ?
         AND strftime('%m', e.event_date) = ?
       ORDER BY e.event_date, e.start_time`
    )
    .all(String(year), String(month).padStart(2, "0"));

  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.event_date]) byDate[ev.event_date] = [];
    byDate[ev.event_date].push(ev);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  return {
    year,
    month,
    monthLabel: `${monthNames[month - 1]} ${year}`,
    daysInMonth,
    firstWeekday,
    byDate,
    prevMonth,
    nextMonth,
    selectedDate: null,
    statusLabel
  };
}

module.exports = {
  parseMonthParam,
  getCalendarData,
  monthKey
};
