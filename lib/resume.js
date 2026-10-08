const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups, sumWeekChargedPrice } = require("./calendar");
const {
  getEventContractAgreementLines,
  toAgreementStatus
} = require("./event-contract-lines");
const { getSubcontractorAgreementSummaries } = require("./subcontractor-contracts");
const { getSubcontractors } = require("./subcontractors-registry");
const { getThematicSummariesForEventIds } = require("./party-questionnaire");

function getResumeEventsList(db) {
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
  const eventsList = events.map((ev) => {
    const loc = locationSummaries[ev.id] || {};
    const agreements = getEventContractAgreementLines(db, ev, loc).map(toAgreementStatus);

    return {
      ...ev,
      thematicSummary: thematicSummaries[ev.id] || null,
      chargedPrice: loc.chargedPrice || null,
      hotelNeeded: Boolean(loc.hotelNeeded),
      hotelRented: Boolean(loc.hotelRented),
      trailerNeeded: Boolean(loc.trailerNeeded),
      trailerRented: Boolean(loc.trailerRented),
      employeeNeeded: Boolean(loc.employeeNeeded),
      clientCalled: Boolean(loc.clientCalled),
      clientCallAt: loc.clientCallAt || null,
      clientContactLogs: loc.clientContactLogs || [],
      emailRdvSent: Boolean(loc.emailRdvSent),
      emailRdvAt: loc.emailRdvAt || null,
      emailRdvSentLogs: loc.emailRdvSentLogs || [],
      questionnaireSent: Boolean(loc.questionnaireSent),
      questionnaireSentAt: loc.questionnaireSentAt || null,
      callbackName: loc.callbackName || null,
      callbackAt: loc.callbackAt || null,
      agreements
    };
  });

  const eventsByMonth = enrichUpcomingMonthGroups(
    groupEventsByMonth(eventsList),
    today
  );

  const grandTotals = sumWeekChargedPrice(eventsList);

  return {
    eventsList,
    eventsByMonth,
    chargedGrandTotalLabel: grandTotals.chargedTotalLabel
  };
}

function getEventAgreementStatuses(db, eventId) {
  return getSubcontractors(db).map((st) => {
    const ag = getSubcontractorAgreementSummaries(db, st.id)[eventId];
    return {
      id: st.id,
      label: st.label,
      passed: Boolean(ag),
      signed: Boolean(ag?.signed),
      amount: ag?.amount || null
    };
  });
}

module.exports = {
  getResumeEventsList,
  getEventAgreementStatuses
};
