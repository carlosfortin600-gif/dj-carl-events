const { clientShortName, formatDateFr, todayLocal, escapeHtml } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const { sendNotificationEmail, describeMailError, validateMailConfig, isResendTestMode } = require("./email-send");
const { ensurePortalToken, getPublicPortalUrl, buildPortalUrl } = require("./portal");

const CONFIRMATION_DAYS_BEFORE = 6;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CONFIRMATION_EMAIL_COPY_TO =
  process.env.CONFIRMATION_EMAIL_COPY_TO?.trim() || "carlos.fortin.600@gmail.com";

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
         AND e.client_confirmed_at IS NULL
         AND c.email IS NOT NULL
         AND TRIM(c.email) != ''`
    )
    .all(targetDate);
}

function buildConfirmationEmailContent(event, portalUrl, { manual = false } = {}) {
  const clientName = clientShortName(event);
  const eventDateLabel = formatDateFr(event.event_date);
  const eventTypeLabel = String(event.event_type || "événement").trim();
  const safePortalUrl = String(portalUrl || "").trim();
  const confirmUrl = safePortalUrl ? `${safePortalUrl.replace(/\/$/, "")}/confirmer` : "";
  const subject = manual
    ? `Confirmez vos informations — ${eventTypeLabel} (${eventDateLabel})`
    : `Votre événement dans ${CONFIRMATION_DAYS_BEFORE} jours — confirmez vos informations`;

  const eventLine = manual
    ? `Votre ${eventTypeLabel} est prévu le ${eventDateLabel}.`
    : `Votre ${eventTypeLabel} approche : ${eventDateLabel}.`;

  const text = [
    `Bonjour ${clientName},`,
    "",
    eventLine,
    "",
    "Pour que tout se déroule parfaitement, merci de prendre quelques minutes pour vérifier que les informations de votre questionnaire et notre discussion sont encore correctes.",
    "",
    "Si quelque chose a changé (horaire, musique, plan de soirée, etc.), vous pouvez le mettre à jour directement via votre espace client :",
    safePortalUrl || "(lien client indisponible — contactez DJ Carl)",
    "",
    "Si tout est encore correct, confirmez en un clic (votre dossier sera verrouillé après confirmation) :",
    confirmUrl || safePortalUrl || "(lien de confirmation indisponible — contactez DJ Carl)",
    "",
    "Merci et à bientôt !",
    "",
    "DJ Carl"
  ].join("\n");

  const html = `<p>Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
<p>Votre <strong>${escapeHtml(eventTypeLabel)}</strong> ${manual ? "est prévu le" : "approche :"} <strong>${escapeHtml(eventDateLabel)}</strong>.</p>
<p>Pour que tout se déroule parfaitement, merci de prendre quelques minutes pour vérifier que les informations de votre <strong>questionnaire</strong> et notre <strong>discussion</strong> sont encore correctes.</p>
${
  safePortalUrl
    ? `<p>Si quelque chose a changé (horaire, musique, plan de soirée, etc.), vous pouvez le mettre à jour directement via votre <a href="${escapeHtml(safePortalUrl)}">espace client</a>.</p>`
    : `<p>Si quelque chose a changé, contactez DJ Carl directement.</p>`
}
<p><strong>Si tout est encore correct</strong>, confirmez en un clic — votre dossier sera verrouillé après confirmation :</p>
${
  confirmUrl
    ? `<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Tout est correct — confirmer</a></p>`
    : `<p>Contactez DJ Carl pour confirmer votre dossier.</p>`
}
<p>Merci et à bientôt !<br><strong>DJ Carl</strong></p>`;

  return { subject, text, html };
}

function getConfirmationEmailPreview(event, token) {
  const portalUrl = resolvePortalUrlForEmail(token);
  return buildConfirmationEmailContent(event, portalUrl, { manual: true });
}

function wrapConfirmationForDjForward(content, clientName, clientEmail) {
  return {
    subject: `[Client: ${clientEmail}] ${content.subject}`,
    text: [
      "Mode test Resend — transmettez ce message à votre client :",
      `${clientName} <${clientEmail}>`,
      "",
      "---",
      "",
      content.text
    ].join("\n"),
    html: `<div style="background:#fff3cd;padding:12px;border-radius:6px;margin-bottom:16px;">
<strong>Mode test Resend — transmettez ce message à votre client :</strong><br>
${escapeHtml(clientName)} &lt;${escapeHtml(clientEmail)}&gt;
</div>
${content.html}`
  };
}

function isResendRecipientBlockedError(err) {
  const code = err?.code || "";
  const response = String(err?.message || "").toLowerCase();
  return (
    code === "ERESEND" &&
    (response.includes("only send") ||
      response.includes("testing") ||
      response.includes("verify a domain") ||
      response.includes("verify") && response.includes("domain"))
  );
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

  if (event.client_confirmed_at) {
    return { ok: false, reason: "already_confirmed" };
  }

  const token = ensurePortalToken(db, event.id);
  if (!token) {
    return { ok: false, reason: "missing_event" };
  }

  const portalUrl = resolvePortalUrlForEmail(token);
  const content = buildConfirmationEmailContent(event, portalUrl, { manual });
  const copyTo = getConfirmationEmailCopyTo();
  const mailCheck = validateMailConfig(config);
  const testMode = mailCheck.ok && isResendTestMode(config);
  const clientName = clientShortName(event);

  let recipient = clientEmail;
  let bcc = resolveConfirmationBcc(clientEmail);
  let payload = content;
  let forwardedViaDj = false;

  if (testMode) {
    recipient = copyTo || config.emailTo;
    bcc = [];
    payload = wrapConfirmationForDjForward(content, clientName, clientEmail);
    forwardedViaDj = true;
  }

  try {
    await sendNotificationEmail(config, {
      to: recipient,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      bcc
    });
    markConfirmationEmailSent(db, event.id);
    return {
      ok: true,
      to: clientEmail,
      deliveredTo: recipient,
      copyTo: copyTo || null,
      eventId: event.id,
      manual,
      forwardedViaDj
    };
  } catch (err) {
    if (!forwardedViaDj && copyTo && isResendRecipientBlockedError(err)) {
      try {
        const fallback = wrapConfirmationForDjForward(content, clientName, clientEmail);
        await sendNotificationEmail(config, {
          to: copyTo,
          subject: fallback.subject,
          text: fallback.text,
          html: fallback.html
        });
        markConfirmationEmailSent(db, event.id);
        return {
          ok: true,
          to: clientEmail,
          deliveredTo: copyTo,
          copyTo,
          eventId: event.id,
          manual,
          forwardedViaDj: true
        };
      } catch (fallbackErr) {
        console.error(
          `Confirmation email fallback failed (event ${event.id}):`,
          describeMailError(fallbackErr)
        );
        return {
          ok: false,
          reason: "send_failed",
          error: describeMailError(fallbackErr)
        };
      }
    }

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
  if (result.reason === "already_confirmed") {
    return "Le client a déjà confirmé son dossier.";
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
  buildConfirmationEmailContent,
  getConfirmationEmailPreview,
  sendConfirmationEmailToClient,
  confirmationEmailErrorMessage,
  runConfirmationEmailJob,
  startConfirmationEmailScheduler
};
