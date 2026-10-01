const { todayLocal } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups } = require("./calendar");
const { getThematicSummariesForEventIds } = require("./party-questionnaire");
const { getUpcomingEntenteRows } = require("./event-contract-lines");

function getEntentesPageData(db) {
  const today = todayLocal();
  const baseRows = getUpcomingEntenteRows(db, today);

  const thematicSummaries = getThematicSummariesForEventIds(
    db,
    [...new Set(baseRows.map((row) => row.eventId))]
  );

  const allRows = baseRows.map((row) => ({
    ...row,
    thematicSummary: thematicSummaries[row.eventId] || null
  }));

  const rowsByMonth = enrichUpcomingMonthGroups(
    groupEventsByMonth(
      allRows.map((row) => ({
        ...row,
        event_date: row.eventDate
      }))
    ),
    today
  );

  return {
    rows: allRows,
    rowsByMonth,
    rowCount: allRows.length
  };
}

module.exports = {
  getEntentesPageData
};
