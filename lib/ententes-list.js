const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal, clientShortName } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups } = require("./calendar");
const {
  isContractFullySigned,
  getSubcontractorContract
} = require("./subcontractor-contracts");
const { getSubcontractorLabel } = require("./subcontractors-registry");
const { getThematicSummariesForEventIds } = require("./party-questionnaire");

function getEntentesPageData(db) {
  const today = todayLocal();
  const contractRows = db
    .prepare(
      `SELECT sc.subcontractor_id, sc.data,
              e.*, c.first_name_1, c.first_name_2, c.last_name
       FROM subcontractor_contracts sc
       JOIN events e ON e.id = sc.event_id
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND e.event_date >= ?
       ORDER BY e.event_date ASC, e.start_time ASC, sc.subcontractor_id ASC`
    )
    .all(today);

  const locationSummaries = getEventLocationSummaries(db);
  const thematicSummaries = getThematicSummariesForEventIds(
    db,
    contractRows.map((row) => row.id)
  );

  const allRows = contractRows.map((row) => {
    const loc = locationSummaries[row.id] || {};
    const thematic = thematicSummaries[row.id] || null;
    const contract = getSubcontractorContract(db, row.id, row.subcontractor_id);
    const employeeNeeded = Boolean(loc.employeeNeeded);

    return {
      eventId: row.id,
      clientLabel: clientShortName(row),
      eventDate: row.event_date,
      startTime: row.start_time,
      endTime: row.end_time,
      endDate: row.end_date,
      eventType: row.event_type,
      thematicSummary: thematic || null,
      employeeNeeded,
      subcontractorId: row.subcontractor_id,
      subcontractorLabel:
        getSubcontractorLabel(db, row.subcontractor_id) ||
        contract.full_name?.trim() ||
        row.subcontractor_id,
      agreementPassed: true,
      signed: isContractFullySigned(contract),
      status: row.status
    };
  });

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
