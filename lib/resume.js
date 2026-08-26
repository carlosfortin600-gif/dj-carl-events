const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal } = require("./helpers");
const {
  SUBCONTRACTORS,
  getSubcontractorAgreementSummaries
} = require("./subcontractor-contracts");

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
  const agreementBySub = {};
  for (const st of SUBCONTRACTORS) {
    agreementBySub[st.id] = getSubcontractorAgreementSummaries(db, st.id);
  }

  return events.map((ev) => {
    const loc = locationSummaries[ev.id] || {};
    const agreements = SUBCONTRACTORS.map((st) => {
      const ag = agreementBySub[st.id][ev.id];
      return {
        id: st.id,
        label: st.label,
        passed: Boolean(ag),
        signed: Boolean(ag?.signed),
        amount: ag?.amount || null
      };
    }).filter((st) => st.passed);

    return {
      ...ev,
      chargedPrice: loc.chargedPrice || null,
      hotelNeeded: Boolean(loc.hotelNeeded),
      hotelRented: Boolean(loc.hotelRented),
      trailerNeeded: Boolean(loc.trailerNeeded),
      trailerRented: Boolean(loc.trailerRented),
      clientCalled: Boolean(loc.clientCalled),
      clientCallAt: loc.clientCallAt || null,
      callbackName: loc.callbackName || null,
      callbackAt: loc.callbackAt || null,
      agreements
    };
  });
}

function getEventAgreementStatuses(db, eventId) {
  return SUBCONTRACTORS.map((st) => {
    const summaries = getSubcontractorAgreementSummaries(db, st.id);
    const ag = summaries[eventId];
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
