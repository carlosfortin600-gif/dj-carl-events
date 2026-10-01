const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal, clientShortName } = require("./helpers");
const {
  isContractFullySigned,
  getSubcontractorContract
} = require("./subcontractor-contracts");
const { getSubcontractors, getSubcontractorLabel } = require("./subcontractors-registry");

function mapContractRow(db, eventRow, subcontractorId, loc) {
  const contract = getSubcontractorContract(db, eventRow.id, subcontractorId);
  const employeeNeeded = Boolean(loc.employeeNeeded);

  return {
    eventId: eventRow.id,
    clientLabel: clientShortName(eventRow),
    eventDate: eventRow.event_date,
    startTime: eventRow.start_time,
    endTime: eventRow.end_time,
    endDate: eventRow.end_date,
    eventType: eventRow.event_type,
    employeeNeeded,
    subcontractorId,
    subcontractorLabel:
      getSubcontractorLabel(db, subcontractorId) ||
      contract.full_name?.trim() ||
      subcontractorId,
    agreementPassed: true,
    signed: isContractFullySigned(contract),
    amount: contract.amount?.trim() || null,
    status: eventRow.status
  };
}

function mapPlaceholderRow(eventRow, subcontractor, loc) {
  const employeeNeeded = Boolean(loc.employeeNeeded);

  return {
    eventId: eventRow.id,
    clientLabel: clientShortName(eventRow),
    eventDate: eventRow.event_date,
    startTime: eventRow.start_time,
    endTime: eventRow.end_time,
    endDate: eventRow.end_date,
    eventType: eventRow.event_type,
    employeeNeeded,
    subcontractorId: subcontractor.id,
    subcontractorLabel: subcontractor.label,
    agreementPassed: false,
    signed: false,
    amount: null,
    status: eventRow.status
  };
}

/**
 * Agreement lines for one event: one entry per saved contract;
 * if employee needed and no contract yet, one placeholder per registered subcontractor.
 */
function getEventContractAgreementLines(db, eventRow, loc) {
  const employeeNeeded = Boolean(loc?.employeeNeeded);
  const contractRows = db
    .prepare(
      `SELECT subcontractor_id FROM subcontractor_contracts
       WHERE event_id = ?
       ORDER BY subcontractor_id ASC`
    )
    .all(eventRow.id);

  if (contractRows.length) {
    return contractRows.map((row) =>
      mapContractRow(db, eventRow, row.subcontractor_id, loc || {})
    );
  }

  if (!employeeNeeded) return [];

  return getSubcontractors(db).map((st) =>
    mapPlaceholderRow(eventRow, st, loc || {})
  );
}

function toAgreementStatus(line) {
  return {
    id: line.subcontractorId,
    label: line.subcontractorLabel,
    passed: line.agreementPassed,
    signed: line.signed,
    amount: line.amount
  };
}

function getUpcomingEntenteRows(db, today = todayLocal()) {
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
  const rows = [];

  for (const ev of events) {
    const loc = locationSummaries[ev.id] || {};
    rows.push(...getEventContractAgreementLines(db, ev, loc));
  }

  return rows;
}

module.exports = {
  getEventContractAgreementLines,
  toAgreementStatus,
  getUpcomingEntenteRows
};
