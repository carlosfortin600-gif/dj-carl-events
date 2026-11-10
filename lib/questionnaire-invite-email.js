const { clientCourtesyName, formatDateFr, escapeHtml } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const {
  sendNotificationEmail,
  describeMailError,
  validateMailConfig,
  isResendTestMode
} = require("./email-send");
const { ensurePortalToken, getPublicPortalUrl, buildPortalUrl } = require("./portal");
const { getEmailCopyTo } = require("./email-copy-to");
const {
  resolveEmailLogoUrl,
  emailLogoHtml,
  emailClientSignatureText,
  emailClientSignatureHtml,
  DJ_CARL_CONTACT_EMAIL
} = require("./email-branding");
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

function buildQuestionnaireInviteEmailContent(event, portalUrl, options = {}) {
  const greetingName = clientCourtesyName(event);
  const eventDateLabel = formatDateFr(event.event_date);
  const eventTypeLabel = String(event.event_type || "événement").trim();
  const safePortalUrl = String(portalUrl || "").trim();
  const logoUrl = options.logoUrl || resolveEmailLogoUrl();

  const subject = `Votre ${eventTypeLabel} — ${eventDateLabel}`;

  const portalBlock = safePortalUrl
    ? [
        "En attendant notre échange, merci de remplir le questionnaire en ligne au mieux de votre connaissance :",
        "",
        safePortalUrl,
        ""
      ]
    : [
        `En attendant notre échange, contactez DJ Carl (${DJ_CARL_CONTACT_EMAIL}) pour recevoir le lien du questionnaire.`,
        ""
      ];

  const text = [
    `Bonjour, ${greetingName},`,
    "",
    `Votre ${eventTypeLabel} approche à grands pas ! Afin de bien préparer cet événement et de nous assurer que tout se déroule selon vos attentes, j'aimerais prendre un moment pour discuter avec vous des différents détails de la soirée.`,
    "",
    "Je souhaiterais que nous puissions planifier cette rencontre le plus rapidement possible afin d'avoir suffisamment de temps pour tout organiser.",
    "",
    "Je m'adapterai à vos disponibilités. Prévoyez environ 1 h 15 à 1 h 30 pour notre discussion.",
    "",
    "Il vous suffit de me communiquer le moment qui vous conviendrait le mieux et je vous contacterai à ce moment-là.",
    "",
    ...portalBlock,
    "Merci et au plaisir d'échanger avec vous !",
    "",
    "Bonne soirée !",
    "",
    emailClientSignatureText("")
  ].join("\n");

  const portalHtml = safePortalUrl
    ? `<p>En attendant notre échange, merci de remplir le <strong>questionnaire en ligne</strong> au mieux de votre connaissance :</p>
<p><a href="${escapeHtml(safePortalUrl)}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Ouvrir le questionnaire</a></p>
<p style="font-size:14px;color:#666;">${escapeHtml(safePortalUrl)}</p>`
    : `<p>Contactez DJ Carl à <a href="mailto:${escapeHtml(DJ_CARL_CONTACT_EMAIL)}">${escapeHtml(DJ_CARL_CONTACT_EMAIL)}</a> pour recevoir le lien du questionnaire.</p>`;

  const html = `${emailLogoHtml(logoUrl)}
<p>Bonjour, <strong>${escapeHtml(greetingName)}</strong>,</p>
<p>Votre <strong>${escapeHtml(eventTypeLabel)}</strong> approche à grands pas ! Afin de bien préparer cet événement et de nous assurer que tout se déroule selon vos attentes, j'aimerais prendre un moment pour discuter avec vous des différents détails de la soirée.</p>
<p>Je souhaiterais que nous puissions planifier cette rencontre le plus rapidement possible afin d'avoir suffisamment de temps pour tout organiser.</p>
<p>Je m'adapterai à vos disponibilités. Prévoyez environ <strong>1 h 15 à 1 h 30</strong> pour notre discussion.</p>
<p>Il vous suffit de me communiquer le moment qui vous conviendrait le mieux et je vous contacterai à ce moment-là.</p>
${portalHtml}
<p>Merci et au plaisir d'échanger avec vous !</p>
<p><strong>Bonne soirée !</strong></p>
${emailClientSignatureHtml("")}`;

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
  const copyTo = getEmailCopyTo();
  if (!copyTo) return [];
  const client = clientEmail?.trim().toLowerCase();
  if (client && copyTo.toLowerCase() === client) return [];
  return [copyTo];
}

function getQuestionnaireInviteEmailPreview(event, token) {
  const portalUrl = resolvePortalUrlForEmail(token);
  return buildQuestionnaireInviteEmailContent(event, portalUrl);
}

function recordQuestionnaireEmailSent(db, eventId) {
  try {
    const result = addQuestionnaireSentLog(db, eventId, {
      sent_datetime: defaultDatetimeLocalValue()
    });
    if (!result.ok) {
      console.error("Questionnaire sent log:", result.error);
    }
  } catch (err) {
    console.error("Questionnaire sent log failed:", err.message);
  }
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
  const copyTo = getEmailCopyTo();
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

    recordQuestionnaireEmailSent(db, event.id);

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
        recordQuestionnaireEmailSent(db, event.id);
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
  getQuestionnaireInviteCopyTo: getEmailCopyTo
};
