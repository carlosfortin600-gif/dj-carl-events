const { clientShortName, formatDateFr, escapeHtml } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const {
  sendNotificationEmail,
  describeMailError,
  validateMailConfig,
  isResendTestMode
} = require("./email-send");
const { ensurePortalToken, getPublicPortalUrl, buildPortalUrl } = require("./portal");
const { getConfirmationEmailCopyTo } = require("./confirmation-email");
const { defaultDatetimeLocalValue } = require("./app-timezone");
const { addQuestionnaireSentLog } = require("./questionnaire-sent-log");

function resolvePortalUrlForEmail(token) {
  const publicUrl = getPublicPortalUrl(token);
  if (publicUrl) return publicUrl;
  const base =
    process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`;
  return buildPortalUrl(base, token);
}

function buildQuestionnaireInviteEmailContent(event, portalUrl) {
  const clientName = clientShortName(event);
  const eventDateLabel = formatDateFr(event.event_date);
  const eventTypeLabel = String(event.event_type || "événement").trim();
  const safePortalUrl = String(portalUrl || "").trim();

  const subject = `Votre questionnaire — ${eventTypeLabel} (${eventDateLabel})`;

  const text = [
    `Bonjour ${clientName},`,
    "",
    `Pour préparer votre ${eventTypeLabel} prévu le ${eventDateLabel}, merci de remplir le questionnaire en ligne au mieux de votre connaissance :`,
    "",
    safePortalUrl || "(lien indisponible — contactez DJ Carl)",
    "",
    "Une fois le formulaire complété, prenez rendez-vous avec moi pour finaliser les détails ensemble.",
    "",
    "Merci,",
    "",
    "DJ Carl"
  ].join("\n");

  const html = `<p>Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
<p>Pour préparer votre <strong>${escapeHtml(eventTypeLabel)}</strong> prévu le <strong>${escapeHtml(eventDateLabel)}</strong>, merci de remplir le questionnaire en ligne <strong>au mieux de votre connaissance</strong> :</p>
${
  safePortalUrl
    ? `<p><a href="${escapeHtml(safePortalUrl)}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Ouvrir le questionnaire</a></p>
<p class="text-muted" style="font-size:14px;color:#666;">${escapeHtml(safePortalUrl)}</p>`
    : `<p>Contactez DJ Carl pour recevoir votre lien.</p>`
}
<p>Une fois le formulaire complété, <strong>prenez rendez-vous avec moi</strong> pour finaliser les détails ensemble.</p>
<p>Merci,<br><strong>DJ Carl</strong></p>`;

  return { subject, text, html };
}

function wrapInviteForDjForward(content, clientName, clientEmail) {
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
      (response.includes("verify") && response.includes("domain")))
  );
}

function resolveInviteBcc(clientEmail) {
  const copyTo = getConfirmationEmailCopyTo();
  if (!copyTo) return [];
  const client = clientEmail?.trim().toLowerCase();
  if (client && copyTo.toLowerCase() === client) return [];
  return [copyTo];
}

function getQuestionnaireInviteEmailPreview(event, token) {
  const portalUrl = resolvePortalUrlForEmail(token);
  return buildQuestionnaireInviteEmailContent(event, portalUrl);
}

async function sendQuestionnaireInviteEmail(db, event) {
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
  const content = buildQuestionnaireInviteEmailContent(event, portalUrl);
  const copyTo = getConfirmationEmailCopyTo();
  const mailCheck = validateMailConfig(config);
  const testMode = mailCheck.ok && isResendTestMode(config);
  const clientName = clientShortName(event);

  let recipient = clientEmail;
  let bcc = resolveInviteBcc(clientEmail);
  let payload = content;
  let forwardedViaDj = false;

  if (testMode) {
    recipient = copyTo || config.emailTo;
    bcc = [];
    payload = wrapInviteForDjForward(content, clientName, clientEmail);
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

    addQuestionnaireSentLog(db, event.id, {
      sent_datetime: defaultDatetimeLocalValue()
    });

    return {
      ok: true,
      to: clientEmail,
      deliveredTo: recipient,
      copyTo: copyTo || null,
      forwardedViaDj
    };
  } catch (err) {
    if (!forwardedViaDj && copyTo && isResendRecipientBlockedError(err)) {
      try {
        const fallback = wrapInviteForDjForward(content, clientName, clientEmail);
        await sendNotificationEmail(config, {
          to: copyTo,
          subject: fallback.subject,
          text: fallback.text,
          html: fallback.html
        });
        addQuestionnaireSentLog(db, event.id, {
          sent_datetime: defaultDatetimeLocalValue()
        });
        return {
          ok: true,
          to: clientEmail,
          deliveredTo: copyTo,
          copyTo,
          forwardedViaDj: true
        };
      } catch (fallbackErr) {
        return {
          ok: false,
          reason: "send_failed",
          error: describeMailError(fallbackErr)
        };
      }
    }

    console.error(
      `Questionnaire invite email failed (event ${event.id}, ${clientEmail}):`,
      describeMailError(err)
    );
    return { ok: false, reason: "send_failed", error: describeMailError(err) };
  }
}

function questionnaireInviteEmailErrorMessage(result) {
  if (result.reason === "missing_client_email") {
    return "Courriel client manquant — ajoutez-le dans l'onglet Résumé.";
  }
  if (result.reason === "portal_disabled") {
    return "L'accès client est désactivé — réactivez-le avant d'envoyer le courriel.";
  }
  if (result.reason === "send_failed") {
    return result.error || "Envoi du courriel impossible.";
  }
  return "Envoi du courriel impossible.";
}

module.exports = {
  buildQuestionnaireInviteEmailContent,
  getQuestionnaireInviteEmailPreview,
  sendQuestionnaireInviteEmail,
  questionnaireInviteEmailErrorMessage,
  getQuestionnaireInviteCopyTo: getConfirmationEmailCopyTo
};
