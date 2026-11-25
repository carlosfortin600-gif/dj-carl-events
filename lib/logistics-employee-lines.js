const { getSubcontractorContract } = require("./subcontractor-contracts");
const { getSubcontractorLabel } = require("./subcontractors-registry");

const LOCATION_KEYS = ["departure", "event", "hotel", "other"];

function parseLogisticsEmployeesJson(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function normalizeTimeInput(value) {
  if (!value || !String(value).trim()) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeInputValue(timeStr) {
  const normalized = normalizeTimeInput(timeStr);
  return normalized || "";
}

function normalizeLocationKey(key) {
  const k = String(key || "").trim();
  return LOCATION_KEYS.includes(k) ? k : "event";
}

function buildLocationChoices(context) {
  const choices = [
    { key: "departure", label: "Chez Carl", address: context.departureFrom || null },
    { key: "event", label: "Salle / événement", address: context.arrivalAddress || null },
    { key: "hotel", label: "Hôtel", address: context.hotelLocation || null },
    { key: "other", label: "Autre", address: null }
  ];
  return choices.filter((c) => c.key === "other" || (c.address && String(c.address).trim()));
}

function resolveLocationDisplay(line, choices) {
  if (line.locationKey === "other") {
    return line.locationCustom?.trim() || "Autre — à préciser";
  }
  const match = choices.find((c) => c.key === line.locationKey);
  if (match?.address) return match.address;
  return match?.label || "—";
}

function getContractSubcontractorIds(db, eventId) {
  return db
    .prepare(
      `SELECT subcontractor_id FROM subcontractor_contracts
       WHERE event_id = ?
       ORDER BY subcontractor_id ASC`
    )
    .all(eventId)
    .map((row) => row.subcontractor_id);
}

function getLogisticsEmployeeLines(db, eventId, context, storedJson) {
  const stored = parseLogisticsEmployeesJson(storedJson);
  const ids = getContractSubcontractorIds(db, eventId);
  const locationChoices = buildLocationChoices(context);

  return ids.map((subcontractorId) => {
    const contract = getSubcontractorContract(db, eventId, subcontractorId);
    const entry = stored[subcontractorId] || {};
    const locationKey = normalizeLocationKey(entry.location_key);
    const line = {
      subcontractorId,
      label:
        contract.full_name?.trim() ||
        getSubcontractorLabel(db, subcontractorId) ||
        subcontractorId,
      arrivalTime: timeInputValue(entry.arrival_time),
      locationKey,
      locationCustom: entry.location_custom?.trim() || "",
      withMe: entry.with_me === "yes" ? "yes" : "no"
    };
    return {
      ...line,
      locationChoices,
      locationDisplay: resolveLocationDisplay(line, locationChoices)
    };
  });
}

function ensureDjNotesRow(db, eventId) {
  const row = db.prepare("SELECT id FROM dj_notes WHERE event_id = ?").get(eventId);
  if (!row) {
    db.prepare("INSERT INTO dj_notes (event_id, content) VALUES (?, '')").run(eventId);
  }
}

function saveLogisticsEmployeeLines(db, eventId, body) {
  const ids = getContractSubcontractorIds(db, eventId);
  const next = {};
  const existingRaw = db
    .prepare("SELECT tech_logistics_employees FROM dj_notes WHERE event_id = ?")
    .get(eventId)?.tech_logistics_employees;
  const existing = parseLogisticsEmployeesJson(existingRaw);

  for (const subcontractorId of ids) {
    const prefix = `emp_${subcontractorId}_`;
    const withMe = body[`${prefix}with_me`] === "yes" ? "yes" : "no";
    if (withMe === "no") {
      next[subcontractorId] = {
        arrival_time: null,
        location_key: null,
        location_custom: null,
        with_me: "no"
      };
      continue;
    }
    const arrivalTime = normalizeTimeInput(body[`${prefix}arrival_time`]);
    const locationKey = normalizeLocationKey(
      body[`${prefix}location`] ?? existing[subcontractorId]?.location_key
    );
    let locationCustom = body[`${prefix}location_custom`]?.trim() || null;
    if (locationKey !== "other") locationCustom = null;
    next[subcontractorId] = {
      arrival_time: arrivalTime,
      location_key: locationKey,
      location_custom: locationCustom,
      with_me: "yes"
    };
  }
  ensureDjNotesRow(db, eventId);
  db.prepare(
    `UPDATE dj_notes
     SET tech_logistics_employees = ?,
         updated_at = datetime('now', 'localtime')
     WHERE event_id = ?`
  ).run(JSON.stringify(next), eventId);
}

module.exports = {
  getLogisticsEmployeeLines,
  saveLogisticsEmployeeLines,
  parseLogisticsEmployeesJson,
  buildLocationChoices
};