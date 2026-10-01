const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal, clientShortName } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups } = require("./calendar");
const { getThematicSummariesForEventIds } = require("./party-questionnaire");
const { getEventContractAgreementLines } = require("./event-contract-lines");

function buildClientEntenteRow(ev, loc, lines, thematicSummary) {
  if (!lines.length) return null;

  const employeeNeeded = Boolean(loc.employeeNeeded);
  const withContract = lines.filter((line) => line.agreementPassed);
  const contractLabels = withContract.map((line) => line.subcontractorLabel);
  const allPassed = lines.every((line) => line.agreementPassed);
  const anyPassed = withContract.length > 0;
  const allSigned =
    withContract.length > 0 && withContract.every((line) => line.signed);
  const anySigned = withContract.some((line) => line.signed);

  let signedLabel = "Non";
  if (allSigned) signedLabel = "Oui";
  else if (anySigned) signedLabel = "Partiel";

  return {
    eventId: ev.id,
    clientLabel: clientShortName(ev),
    eventDate: ev.event_date,
    startTime: ev.start_time,
    endTime: ev.end_time,
    endDate: ev.end_date,
    eventType: ev.event_type,
    thematicSummary: thematicSummary || null,
    employeeNeeded,
    contractSummary: contractLabels.length ? contractLabels.join(" · ") : "—",
    agreementPassed: allPassed,
    agreementPassedLabel: allPassed ? "Oui" : anyPassed ? "Partiel" : "Non",
    signed: allSigned,
    signedLabel,
    status: ev.status
  };
}

function getEntentesPageData(db) {
  const today = todayLocal();
  const events = db
    .prepare(
      `SELECT e.*, c.first_name_1, c.first_name_2, c.last_name
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND e.event_date >= ?
       ORDER BY e.event_date ASC, e.start_time ASC`
    )
    .all(today);

  const locationSummaries = getEventLocationSummaries(db);
  const thematicSummaries = getThematicSummariesForEventIds(
    db,
    events.map((ev) => ev.id)
  );

  const allRows = [];
  for (const ev of events) {
    const loc = locationSummaries[ev.id] || {};
    const lines = getEventContractAgreementLines(db, ev, loc);
    const row = buildClientEntenteRow(
      ev,
      loc,
      lines,
      thematicSummaries[ev.id]
    );
    if (row) allRows.push(row);
  }

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
