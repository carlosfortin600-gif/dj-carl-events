const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal } = require("./helpers");
const { groupEventsByMonth, enrichUpcomingMonthGroups, sumWeekChargedPrice } = require("./calendar");
const {
  getEventContractAgreementLines,
  toAgreementStatus
} = require("./event-contract-lines");
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
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  if (!event) return [];
  const loc = getEventLocationSummaries(db)[eventId] || {};
  return getEventContractAgreementLines(db, event, loc).map(toAgreementStatus);
}

module.exports = {
  getResumeEventsList,
  getEventAgreementStatuses
};
