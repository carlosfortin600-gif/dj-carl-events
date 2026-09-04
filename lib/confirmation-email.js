const { clientShortName, formatDateFr, todayLocal } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const { sendNotificationEmail, describeMailError } = require("./email-send");
const { ensurePortalToken, getPublicPortalUrl, buildPortalUrl } = require("./portal");

const CONFIRMATION_DAYS_BEFORE = 6;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CONFIRMATION_EMAIL_COPY_TO =
  process.env.CONFIRMATION_EMAIL_COPY_TO?.trim() || "carlos-fortin@hotmail.com";

function getConfirmationEmailCopyTo() {
  return CONFIRMATION_EMAIL_COPY_TO;
}

function addDaysToIsoDate(dateStr, days) {
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + days,
    12,
    0,
    0
  );
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolvePortalUrlForEmail(token) {
  const publicUrl = getPublicPortalUrl(token);
  if (publicUrl) return publicUrl;
  const base =
    process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`;
  return buildPortalUrl(base, token);
}

function getEventsDueForConfirmationEmail(db) {
  const targetDate = addDaysToIsoDate(todayLocal(), CONFIRMATION_DAYS_BEFORE);
  if (!targetDate) return [];

  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.deleted_at IS NULL
         AND e.portal_enabled = 1
         AND e.event_date = ?
         AND e.confirmation_email_sent_at IS NULL
         AND c.email IS NOT NULL
         AND TRIM(c.email) != ''`
    )
    .all(targetDate);
}

function buildConfirmationEmailContent(event, portalUrl, { manual = false } = {}) {
  const clientName = clientShortName(event);
  const eventDateLabel = formatDateFr(event.event_date);
  const subject = manual
    ? `Confirmez vos informations — ${event.event_type} (${eventDateLabel})`
    : `Votre événement dans ${CONFIRMATION_DAYS_BEFORE} jours — confirmez vos informations`;

  const eventLine = manual
    ? `Votre ${event.event_type} est prévu le ${eventDateLabel}.`
    : `Votre ${event.event_type} approche : ${eventDateLabel}.`;

  const text = [
    `Bonjour ${clientName},`,
    "",
    eventLine,
    "",
    "Pour que tout se déroule parfaitement, merci de prendre quelques minutes pour vérifier que les informations de votre questionnaire et notre discussion sont encore correctes.",
    "",
    "Si quelque chose a changé (horaire, musique, plan de soirée, etc.), vous pouvez le mettre à jour directement via votre espace client :",
    portalUrl,
    "",
    "Merci et à bientôt !",
    "",
    "DJ Carl"
  ].join("\n");

  const html = `<p>Bonjour <strong>${clientName}</strong>,</p>
<p>Votre <strong>${event.event_type}</strong> ${manual ? "est prévu le" : "approche :"} <strong>${eventDateLabel}</strong>.</p>
<p>Pour que tout se déroule parfaitement, merci de prendre quelques minutes pour vérifier que les informations de votre <strong>questionnaire</strong> et notre <strong>discussion</strong> sont encore correctes.</p>
<p>Si quelque chose a changé (horaire, musique, plan de soirée, etc.), vous pouvez le mettre à jour directement via votre espace client :</p>
<p><a href="${portalUrl}">Ouvrir mon espace client</a></p>
<p>Merci et à bientôt !<br><strong>DJ Carl</strong></p>`;

  return { subject, text, html };
}

function markConfirmationEmailSent(db, eventId) {
  db.prepare(
    `UPDATE events
     SET confirmation_email_sent_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
}

function resolveConfirmationBcc(clientEmail) {
  const copyTo = getConfirmationEmailCopyTo();
  if (!copyTo) return [];
  const client = clientEmail?.trim().toLowerCase();
  if (client && copyTo.toLowerCase() === client) return [];
  return [copyTo];
}

async function sendConfirmationEmailToClient(db, event, { manual = false } = {}) {
  const config = getEffectiveNotificationConfig(db);
  const clientEmail = event.email?.trim();
  if (!clientEmail) {
    return { ok: false, reason: "missing_client_email" };
  }

  if (!event.portal_enabled) {
    return { ok: false, reason: "portal_disabled" };
  }

  const token = ensurePortalToken(db, event.id);
  if (!token) {
    return { ok: false, reason: "missing_event" };
  }

  const portalUrl = resolvePortalUrlForEmail(token);
  const { subject, text, html } = buildConfirmationEmailContent(event, portalUrl, { manual });
  const bcc = resolveConfirmationBcc(clientEmail);

  try {
    await sendNotificationEmail(config, {
      to: clientEmail,
      subject,
      text,
      html,
      bcc
    });
    markConfirmationEmailSent(db, event.id);
    return {
      ok: true,
      to: clientEmail,
      copyTo: bcc[0] || null,
      eventId: event.id,
      manual
    };
  } catch (err) {
    console.error(
      `Confirmation email failed (event ${event.id}, ${clientEmail}):`,
      describeMailError(err)
    );
    return { ok: false, reason: "send_failed", error: describeMailError(err) };
  }
}

function confirmationEmailErrorMessage(result) {
  if (result.reason === "missing_client_email") {
    return "Courriel client manquant — ajoutez-le dans la fiche résumé.";
  }
  if (result.reason === "portal_disabled") {
    return "L'accès client est désactivé — réactivez-le avant d'envoyer le courriel.";
  }
  if (result.reason === "send_failed") {
    return result.error || "Envoi du courriel impossible.";
  }
  return "Envoi du courriel impossible.";
}

async function runConfirmationEmailJob(db) {
  const due = getEventsDueForConfirmationEmail(db);
  if (!due.length) {
    return { checked: true, sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const event of due) {
    const result = await sendConfirmationEmailToClient(db, event);
    if (result.ok) sent += 1;
    else failed += 1;
  }

  if (sent || failed) {
    console.log(
      `Confirmation emails (${CONFIRMATION_DAYS_BEFORE} jours avant) : ${sent} envoyé(s), ${failed} échec(s).`
    );
  }

  return { checked: true, sent, failed, skipped: 0, due: due.length };
}

function startConfirmationEmailScheduler(db) {
  const run = () => {
    runConfirmationEmailJob(db).catch((err) => {
      console.error("Confirmation email job:", err.message);
    });
  };

  run();
  return setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = {
  CONFIRMATION_DAYS_BEFORE,
  CONFIRMATION_EMAIL_COPY_TO,
  getConfirmationEmailCopyTo,
  getEventsDueForConfirmationEmail,
  sendConfirmationEmailToClient,
  confirmationEmailErrorMessage,
  runConfirmationEmailJob,
  startConfirmationEmailScheduler
};
