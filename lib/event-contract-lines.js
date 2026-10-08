const { getEventLocationSummaries } = require("./dj-notes");
const { todayLocal, clientShortName } = require("./helpers");
const {
  isContractFullySigned,
  getSubcontractorContract
} = require("./subcontractor-contracts");
const { getSubcontractorLabel } = require("./subcontractors-registry");

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

/** One line per contrat enregistré en base (Résumé, PDF, Ententes). */
function getEventContractAgreementLines(db, eventRow, loc) {
  const contractRows = db
    .prepare(
      `SELECT subcontractor_id FROM subcontractor_contracts
       WHERE event_id = ?
       ORDER BY subcontractor_id ASC`
    )
    .all(eventRow.id);

  return contractRows.map((row) =>
    mapContractRow(db, eventRow, row.subcontractor_id, loc || {})
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

module.exports = {
  getEventContractAgreementLines,
  toAgreementStatus
};
