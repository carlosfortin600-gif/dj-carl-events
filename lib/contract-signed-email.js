const { clientShortName, formatDateFr, escapeHtml } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const { sendNotificationEmail, validateMailConfig } = require("./email-send");
const { DJ_CARL_CONTACT_EMAIL } = require("./email-branding");
const { getPortalBaseUrls } = require("./portal");
const { isContractFullySigned } = require("./subcontractor-contracts");
const { getSubcontractorLabel } = require("./subcontractors-registry");
const { getEventById } = require("./events-db");

function hasSignature(value) {
  return Boolean(String(value || "").trim());
}

function detectContractSignedEvent(before, after) {
  const wasFull = isContractFullySigned(before);
  const nowFull = isContractFullySigned(after);
  if (nowFull && !wasFull) {
    return { kind: "complete", label: "Contrat entièrement signé" };
  }

  const subNew = !hasSignature(before?.signature_subcontractor) && hasSignature(after?.signature_subcontractor);
  if (subNew) {
    return { kind: "subcontractor", label: "Signature du sous-traitant reçue" };
  }

  const conNew =
    !hasSignature(before?.signature_contractant) && hasSignature(after?.signature_contractant);
  if (conNew) {
    return { kind: "contractant", label: "Votre signature a été enregistrée" };
  }

  return null;
}

function buildContractSignedEmail({ event, subcontractorLabel, eventUrl, signedEvent }) {
  const clientName = clientShortName(event);
  const dateLabel = formatDateFr(event.event_date);
  const subject = `${signedEvent.label} — ${clientName} (${subcontractorLabel})`;

  const statusLine =
    signedEvent.kind === "complete"
      ? "Les deux signatures sont présentes."
      : signedEvent.kind === "subcontractor"
        ? "Signature sous-traitant : oui — signature contractant : en attente."
        : "Signature contractant : oui — signature sous-traitant : en attente.";

  const text = [
    signedEvent.label,
    "",
    `Client : ${clientName}`,
    `Sous-traitant : ${subcontractorLabel}`,
    `Événement : ${event.event_type} — ${dateLabel}`,
    event.venue ? `Salle : ${event.venue}` : null,
    "",
    statusLine,
    "",
    `Ouvrir le contrat : ${eventUrl}`
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `<p><strong>${escapeHtml(signedEvent.label)}</strong></p>
<p>Client : <strong>${escapeHtml(clientName)}</strong><br>
Sous-traitant : <strong>${escapeHtml(subcontractorLabel)}</strong><br>
${escapeHtml(event.event_type)} — ${escapeHtml(dateLabel)}${event.venue ? `<br>Salle : ${escapeHtml(event.venue)}` : ""}</p>
<p>${escapeHtml(statusLine)}</p>
<p><a href="${escapeHtml(eventUrl)}">Ouvrir le contrat dans DJ Carl Events</a></p>`;

  return { subject, text, html };
}

async function notifyContractSignedIfNeeded({
  db,
  req,
  eventId,
  subcontractorId,
  beforeContract,
  afterContract
}) {
  const signedEvent = detectContractSignedEvent(beforeContract, afterContract);
  if (!signedEvent) return null;

  const event = getEventById(db, eventId);
  if (!event || event.deleted_at) return null;

  const config = getEffectiveNotificationConfig(db);
  const mailCheck = validateMailConfig(config);
  if (!mailCheck.ok) return { skipped: true, reason: mailCheck.message };

  const recipient = DJ_CARL_CONTACT_EMAIL || config.emailTo?.trim();
  if (!recipient) return { skipped: true, reason: "no_recipient" };

  const { currentBase } = getPortalBaseUrls(req);
  const eventUrl = `${currentBase}/events/${eventId}?tab=gestion&gestion=contrat&sousTraitant=${encodeURIComponent(subcontractorId)}`;
  const subcontractorLabel = getSubcontractorLabel(db, subcontractorId);

  const content = buildContractSignedEmail({
    event,
    subcontractorLabel,
    eventUrl,
    signedEvent
  });

  await sendNotificationEmail(config, {
    to: recipient,
    subject: content.subject,
    text: content.text,
    html: content.html
  });

  return { ok: true, to: recipient, kind: signedEvent.kind };
}

module.exports = {
  detectContractSignedEvent,
  notifyContractSignedIfNeeded
};
