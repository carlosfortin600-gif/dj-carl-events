const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal, clientShortName } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups } = require("./calendar");
const { getSubcontractorAgreementSummaries } = require("./subcontractor-contracts");
const { getSubcontractors } = require("./subcontractors-registry");
const { getThematicSummariesForEventIds } = require("./party-questionnaire");

function buildEntenteRowsForEvent(ev, loc, thematicSummary, subcontractors, agreementBySub) {
  const employeeNeeded = Boolean(loc.employeeNeeded);
  const rows = [];

  for (const st of subcontractors) {
    const ag = agreementBySub[st.id][ev.id];
    const agreementPassed = Boolean(ag);
    if (!agreementPassed) continue;

    rows.push({
      eventId: ev.id,
      clientLabel: clientShortName(ev),
      eventDate: ev.event_date,
      startTime: ev.start_time,
      endTime: ev.end_time,
      endDate: ev.end_date,
      eventType: ev.event_type,
      thematicSummary: thematicSummary || null,
      employeeNeeded,
      subcontractorId: st.id,
      subcontractorLabel: st.label,
      agreementPassed,
      signed: Boolean(ag?.signed),
      status: ev.status
    });
  }

  return rows;
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
  const subcontractors = getSubcontractors(db);
  const agreementBySub = {};
  for (const st of subcontractors) {
    agreementBySub[st.id] = getSubcontractorAgreementSummaries(db, st.id);
  }

  const allRows = [];
  for (const ev of events) {
    const loc = locationSummaries[ev.id] || {};
    const thematic = thematicSummaries[ev.id] || null;
    allRows.push(
      ...buildEntenteRowsForEvent(ev, loc, thematic, subcontractors, agreementBySub)
    );
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
