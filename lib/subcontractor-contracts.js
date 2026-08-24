const crypto = require("crypto");
const { parseEndDatetime, formatDateTimeRangeFr } = require("./helpers");

const SUBCONTRACTORS = [
  { id: "mario", label: "Mario" },
  { id: "eric", label: "Eric" }
];

const CONTRACT_DEFAULTS = {
  mario: {
    full_name: "Mario",
    service_description:
      "Prestation de services techniques pour l'événement (montage, opération et démontage selon les besoins convenus).",
    payment_terms: "Paiement à la fin de la prestation, sauf entente contraire."
  },
  eric: {
    full_name: "Eric",
    service_description:
      "Prestation de services techniques pour l'événement (montage, opération et démontage selon les besoins convenus).",
    payment_terms: "Paiement à la fin de la prestation, sauf entente contraire."
  }
};

function parseContractData(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getSubcontractorContract(db, eventId, subcontractorId) {
  const row = db
    .prepare(
      `SELECT data, updated_at FROM subcontractor_contracts
       WHERE event_id = ? AND subcontractor_id = ?`
    )
    .get(eventId, subcontractorId);

  const data = parseContractData(row?.data);
  const defaults = CONTRACT_DEFAULTS[subcontractorId] || {};
  if (!row) {
    return { ...defaults, updated_at: null };
  }
  return { ...defaults, ...data, updated_at: row.updated_at || null };
}

function persistContractData(db, eventId, subcontractorId, data) {
  const rowExists = db
    .prepare(
      `SELECT 1 FROM subcontractor_contracts WHERE event_id = ? AND subcontractor_id = ?`
    )
    .get(eventId, subcontractorId);

  if (rowExists) {
    db.prepare(
      `UPDATE subcontractor_contracts
       SET data = ?, updated_at = datetime('now', 'localtime')
       WHERE event_id = ? AND subcontractor_id = ?`
    ).run(JSON.stringify(data), eventId, subcontractorId);
  } else {
    db.prepare(
      `INSERT INTO subcontractor_contracts (event_id, subcontractor_id, data)
       VALUES (?, ?, ?)`
    ).run(eventId, subcontractorId, JSON.stringify(data));
  }
}

function saveSubcontractorContract(db, eventId, subcontractorId, body) {
  const existing = getSubcontractorContract(db, eventId, subcontractorId);

  let contractDate = existing.contract_date || "";
  let contractTime = existing.contract_time || "";
  if (body.contract_datetime !== undefined) {
    const parsed = parseEndDatetime(body.contract_datetime);
    contractDate = parsed.end_date || "";
    contractTime = parsed.end_time || "";
  } else {
    if (body.contract_date !== undefined) contractDate = body.contract_date?.trim() || "";
    if (body.contract_time !== undefined) contractTime = body.contract_time?.trim() || "";
  }

  let contractEndDate = existing.contract_end_date || "";
  let contractEndTime = existing.contract_end_time || "";
  if (body.contract_end_datetime !== undefined) {
    const parsedEnd = parseEndDatetime(body.contract_end_datetime);
    contractEndDate = parsedEnd.end_date || "";
    contractEndTime = parsedEnd.end_time || "";
  } else {
    if (body.contract_end_date !== undefined) {
      contractEndDate = body.contract_end_date?.trim() || "";
    }
    if (body.contract_end_time !== undefined) {
      contractEndTime = body.contract_end_time?.trim() || "";
    }
  }

  const data = {
    full_name: body.full_name?.trim() || existing.full_name || "",
    service_description: body.service_description?.trim() || "",
    contract_date: contractDate,
    contract_time: contractTime,
    contract_end_date: contractEndDate,
    contract_end_time: contractEndTime,
    amount: body.amount?.trim() || "",
    payment_terms: body.payment_terms?.trim() || "",
    additional_notes: body.additional_notes?.trim() || "",
    sign_token: existing.sign_token || generateSignToken(),
    signature_contractant:
      body.signature_contractant !== undefined
        ? body.signature_contractant?.trim() || null
        : existing.signature_contractant || null,
    signature_subcontractor:
      body.signature_subcontractor !== undefined
        ? body.signature_subcontractor?.trim() || null
        : existing.signature_subcontractor || null
  };

  persistContractData(db, eventId, subcontractorId, data);
}

function saveSubcontractorSignatureOnly(db, eventId, subcontractorId, signature) {
  const existing = getSubcontractorContract(db, eventId, subcontractorId);
  const data = {
    ...existing,
    signature_subcontractor: signature?.trim() || null,
    updated_at: undefined
  };
  delete data.updated_at;
  persistContractData(db, eventId, subcontractorId, data);
}

function generateSignToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function hasSubcontractorContract(db, eventId, subcontractorId) {
  return !!db
    .prepare(
      `SELECT 1 FROM subcontractor_contracts WHERE event_id = ? AND subcontractor_id = ?`
    )
    .get(eventId, subcontractorId);
}

function deleteSubcontractorContract(db, eventId, subcontractorId) {
  db.prepare(
    `DELETE FROM subcontractor_contracts WHERE event_id = ? AND subcontractor_id = ?`
  ).run(eventId, subcontractorId);
}

function ensureContractSignToken(db, eventId, subcontractorId) {
  if (!hasSubcontractorContract(db, eventId, subcontractorId)) return null;

  const existing = getSubcontractorContract(db, eventId, subcontractorId);
  if (existing.sign_token) return existing.sign_token;

  const token = generateSignToken();
  const data = { ...existing, sign_token: token };
  delete data.updated_at;
  persistContractData(db, eventId, subcontractorId, data);
  return token;
}

function getContractBySignToken(db, token) {
  if (!token) return null;

  const rows = db
    .prepare(
      `SELECT sc.event_id, sc.subcontractor_id, sc.data, sc.updated_at,
              e.event_type, e.event_date, e.start_time, e.venue, e.address, e.deleted_at,
              c.first_name_1, c.first_name_2, c.last_name
       FROM subcontractor_contracts sc
       JOIN events e ON e.id = sc.event_id
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL`
    )
    .all();

  for (const row of rows) {
    const data = parseContractData(row.data);
    if (data.sign_token === token) {
      const defaults = CONTRACT_DEFAULTS[row.subcontractor_id] || {};
      return {
        eventId: row.event_id,
        subcontractorId: row.subcontractor_id,
        subcontractorLabel: getSubcontractorLabel(row.subcontractor_id),
        contract: { ...defaults, ...data, updated_at: row.updated_at || null },
        event: row
      };
    }
  }

  return null;
}

function isValidSubcontractor(id) {
  return SUBCONTRACTORS.some((s) => s.id === id);
}

function getSubcontractorLabel(subcontractorId) {
  return SUBCONTRACTORS.find((s) => s.id === subcontractorId)?.label || subcontractorId;
}

function buildAgreementSummary(contract) {
  const parts = [];

  const period = formatDateTimeRangeFr(
    contract.contract_date,
    contract.contract_time,
    contract.contract_end_date || contract.contract_date,
    contract.contract_end_time
  );
  if (period && period !== "—") parts.push(period);

  if (contract.amount?.trim()) parts.push(contract.amount.trim());

  const service = contract.service_description?.trim();
  if (service) {
    parts.push(service.length > 100 ? `${service.slice(0, 97)}…` : service);
  }

  return parts.length ? parts.join(" · ") : null;
}

function getSubcontractorAgreementSummaries(db, subcontractorId) {
  const rows = db
    .prepare(
      `SELECT event_id, data FROM subcontractor_contracts WHERE subcontractor_id = ?`
    )
    .all(subcontractorId);

  const defaults = CONTRACT_DEFAULTS[subcontractorId] || {};
  const summaries = {};

  for (const row of rows) {
    const data = parseContractData(row.data);
    const contract = { ...defaults, ...data };
    summaries[row.event_id] = {
      text: buildAgreementSummary(contract),
      signed: !!(contract.signature_contractant && contract.signature_subcontractor),
      signToken: data.sign_token || null
    };
  }

  return summaries;
}

function contractUrlForEvent(eventId, subcontractorId) {
  return `/events/${eventId}?tab=gestion&gestion=contrat&sousTraitant=${subcontractorId}`;
}

function datetimeLocalValue(dateStr, timeStr) {
  if (!dateStr) return "";
  if (!timeStr) return `${dateStr}T`;
  return `${dateStr}T${String(timeStr).slice(0, 5)}`;
}

function getContractSignLinks(req, token) {
  if (!token) return null;
  const { getPortalBaseUrls } = require("./portal");
  const { currentBase, lanBase, localhostBase } = getPortalBaseUrls(req);
  const path = `/signer/contrat/${token}`;
  return {
    primary: `${currentBase}${path}`,
    lan: lanBase ? `${lanBase}${path}` : null,
    localhost: `${localhostBase}${path}`
  };
}

module.exports = {
  SUBCONTRACTORS,
  CONTRACT_DEFAULTS,
  parseContractData,
  buildAgreementSummary,
  getSubcontractorAgreementSummaries,
  getSubcontractorContract,
  saveSubcontractorContract,
  saveSubcontractorSignatureOnly,
  ensureContractSignToken,
  getContractBySignToken,
  hasSubcontractorContract,
  deleteSubcontractorContract,
  isValidSubcontractor,
  getSubcontractorLabel,
  contractUrlForEvent,
  datetimeLocalValue,
  getContractSignLinks
};
