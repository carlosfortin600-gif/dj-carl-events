const { setPortalEnabled } = require("./portal");
const { recordPortalClientUpdate } = require("./portal-notifications");

function isClientConfirmed(event) {
  return Boolean(event?.client_confirmed_at);
}

function getEventForPortalConfirm(db, token) {
  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.portal_token = ?
         AND e.deleted_at IS NULL
         AND e.portal_enabled = 1
         AND e.client_confirmed_at IS NULL`
    )
    .get(token);
}

function getPortalAccessDeniedReason(db, token) {
  const row = db
    .prepare(
      `SELECT portal_enabled, client_confirmed_at, deleted_at
       FROM events WHERE portal_token = ?`
    )
    .get(token);
  if (!row || row.deleted_at) return "invalid";
  if (row.client_confirmed_at) return "confirmed";
  if (!row.portal_enabled) return "disabled";
  return null;
}

function portalAccessDeniedMessage(reason) {
  if (reason === "confirmed") {
    return "Votre dossier est confirmé. Pour toute modification, contactez DJ Carl directement.";
  }
  if (reason === "disabled") {
    return "L'accès à cet espace client a été désactivé. Contactez DJ Carl si vous avez besoin d'aide.";
  }
  return "Ce lien n'est plus valide ou a été désactivé.";
}

function confirmClientDossier(db, eventId) {
  db.prepare(
    `UPDATE events
     SET client_confirmed_at = datetime('now', 'localtime'),
         portal_enabled = 0,
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
}

function recordClientConfirmation(db, eventId) {
  confirmClientDossier(db, eventId);
  recordPortalClientUpdate(db, eventId, "confirmation");
}

module.exports = {
  isClientConfirmed,
  getEventForPortalConfirm,
  getPortalAccessDeniedReason,
  portalAccessDeniedMessage,
  confirmClientDossier,
  recordClientConfirmation
};
