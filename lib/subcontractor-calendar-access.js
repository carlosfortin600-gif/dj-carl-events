const crypto = require("crypto");
const { getPortalBaseUrls } = require("./portal");
const { isValidSubcontractor, getSubcontractorLabel } = require("./subcontractor-contracts");

function generateCalendarToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getCalendarTokenRow(db, subcontractorId) {
  return db
    .prepare(
      `SELECT subcontractor_id, access_token
       FROM subcontractor_calendar_tokens
       WHERE subcontractor_id = ?`
    )
    .get(subcontractorId);
}

function ensureSubcontractorCalendarToken(db, subcontractorId) {
  if (!isValidSubcontractor(subcontractorId)) return null;

  const existing = getCalendarTokenRow(db, subcontractorId);
  if (existing?.access_token) return existing.access_token;

  const token = generateCalendarToken();
  db.prepare(
    `INSERT INTO subcontractor_calendar_tokens (subcontractor_id, access_token)
     VALUES (?, ?)`
  ).run(subcontractorId, token);
  return token;
}

function getSubcontractorByCalendarToken(db, token) {
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT subcontractor_id, access_token
       FROM subcontractor_calendar_tokens
       WHERE access_token = ?`
    )
    .get(token);

  if (!row || !isValidSubcontractor(row.subcontractor_id)) return null;

  return {
    subcontractorId: row.subcontractor_id,
    subcontractorLabel: getSubcontractorLabel(row.subcontractor_id),
    accessToken: row.access_token
  };
}

function getSubcontractorCalendarLinks(req, token) {
  if (!token) return null;

  const { currentBase, lanBase, localhostBase } = getPortalBaseUrls(req);
  const path = `/calendrier/${token}`;
  return {
    primary: `${currentBase}${path}`,
    lan: lanBase ? `${lanBase}${path}` : null,
    localhost: `${localhostBase}${path}`
  };
}

function getAllSubcontractorCalendarLinks(db, req) {
  const { SUBCONTRACTORS } = require("./subcontractor-contracts");
  return SUBCONTRACTORS.map((sub) => {
    const token = ensureSubcontractorCalendarToken(db, sub.id);
    return {
      id: sub.id,
      label: sub.label,
      token,
      links: getSubcontractorCalendarLinks(req, token),
      hostPath: `/gestion/calendrier/${sub.id}`
    };
  });
}

module.exports = {
  ensureSubcontractorCalendarToken,
  getSubcontractorByCalendarToken,
  getSubcontractorCalendarLinks,
  getAllSubcontractorCalendarLinks
};
