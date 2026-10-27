const { clientShortName, formatDateFr, escapeHtml } = require("./helpers");
const { getEffectiveNotificationConfig } = require("./app-settings");
const {
  sendNotificationEmail,
  describeMailError,
  validateMailConfig,
  isResendTestMode
} = require("./email-send");
const { getEmailCopyTo } = require("./email-copy-to");
const {
  resolveEmailLogoUrl,
  emailLogoHtml,
  emailClientSignatureHtml,
  emailClientSignatureText,
  DJ_CARL_CONTACT_EMAIL
} = require("./email-branding");
const {
  getSubcontractorContract,
  updateSubcontractorContractEmail,
  hasSubcontractorContract,
  ensureContractSignToken,
  getContractSignLinks,
  getSubcontractorLabel
} = require("./subcontractor-contracts");

function buildContractSignInviteEmailContent(event, subcontractorName, signUrl, options = {}) {
  const clientName = clientShortName(event);
  const eventDateLabel = formatDateFr(event.event_date);
  const eventTypeLabel = String(event.event_type || "événement").trim();
  const safeUrl = String(signUrl || "").trim();
  const logoUrl = options.logoUrl || resolveEmailLogoUrl();

  const subject = `Contrat à signer — ${eventTypeLabel} (${eventDateLabel})`;

  const text = [
    `Bonjour ${subcontractorName},`,
    "",
    `Voici votre contrat de service pour l'événement de ${clientName} (${eventTypeLabel}, ${eventDateLabel}).`,
    "Merci de lire le document et de signer électroniquement en ouvrant le lien ci-dessous :",
    "",
    safeUrl || `(lien indisponible — contactez DJ Carl : ${DJ_CARL_CONTACT_EMAIL})`,
    "",
    "Ce lien fonctionne sur téléphone ou ordinateur.",
    "",
    emailClientSignatureText("Merci,")
  ].join("\n");

  const html = `${emailLogoHtml(logoUrl)}
<p>Bonjour <strong>${escapeHtml(subcontractorName)}</strong>,</p>
<p>Voici votre <strong>contrat de service</strong> pour l'événement de <strong>${escapeHtml(clientName)}</strong>
 (${escapeHtml(eventTypeLabel)}, ${escapeHtml(eventDateLabel)}).</p>
<p>Merci de lire le document et de <strong>signer électroniquement</strong> :</p>
${
  safeUrl
    ? `<p><a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Ouvrir et signer le contrat</a></p>
<p style="font-size:14px;color:#666;">${escapeHtml(safeUrl)}</p>`
    : `<p>Contactez DJ Carl à <a href="mailto:${escapeHtml(DJ_CARL_CONTACT_EMAIL)}">${escapeHtml(DJ_CARL_CONTACT_EMAIL)}</a>.</p>`
}
<p style="font-size:14px;color:#666;">Ce lien fonctionne sur téléphone ou ordinateur.</p>
${emailClientSignatureHtml("<p>Merci,</p>")}`;

  return { subject, text, html };
}

function wrapContractInviteForDjForward(content, subcontractorName, subcontractorEmail) {
  return {
    subject: `[Sous-traitant: ${subcontractorEmail}] ${content.subject}`,
    text: [
      "Mode test Resend — transmettez ce message au sous-traitant :",
      `${subcontractorName} <${subcontractorEmail}>`,
      "",
      "---",
      "",
      content.text
    ].join("\n"),
    html: `<div style="background:#fff3cd;padding:12px;border-radius:6px;margin-bottom:16px;">
<strong>Mode test Resend — transmettez ce message au sous-traitant :</strong><br>
${escapeHtml(subcontractorName)} &lt;${escapeHtml(subcontractorEmail)}&gt;
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

function resolveInviteBcc(recipientEmail) {
  const copyTo = getEmailCopyTo();
  if (!copyTo) return [];
  const to = recipientEmail?.trim().toLowerCase();
  if (to && copyTo.toLowerCase() === to) return [];
  return [copyTo];
}

async function sendContractSignInviteEmail(db, req, event, subcontractorId, recipientEmail) {
  const config = getEffectiveNotificationConfig(db);
  const toEmail = recipientEmail?.trim();
  if (!toEmail) {
    return { ok: false, reason: "missing_email" };
  }

  if (!hasSubcontractorContract(db, event.id, subcontractorId)) {
    return { ok: false, reason: "contract_not_saved" };
  }

  updateSubcontractorContractEmail(db, event.id, subcontractorId, toEmail);

  const signToken = ensureContractSignToken(db, event.id, subcontractorId);
  if (!signToken) {
    return { ok: false, reason: "missing_sign_token" };
  }

  const links = getContractSignLinks(req, signToken);
  const signUrl = links?.primary || "";
  const contract = getSubcontractorContract(db, event.id, subcontractorId);
  const subcontractorName =
    contract.full_name?.trim() || getSubcontractorLabel(db, subcontractorId);

  const content = buildContractSignInviteEmailContent(event, subcontractorName, signUrl);
  const copyTo = getEmailCopyTo();
  const mailCheck = validateMailConfig(config);
  const testMode = mailCheck.ok && isResendTestMode(config);

  let recipient = toEmail;
  let bcc = resolveInviteBcc(toEmail);
  let payload = content;
  let forwardedViaDj = false;

  if (testMode) {
    recipient = copyTo || config.emailTo;
    bcc = [];
    payload = wrapContractInviteForDjForward(content, subcontractorName, toEmail);
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

    return {
      ok: true,
      to: toEmail,
      deliveredTo: recipient,
      copyTo: copyTo || null,
      forwardedViaDj
    };
  } catch (err) {
    if (!forwardedViaDj && copyTo && isResendRecipientBlockedError(err)) {
      try {
        const fallback = wrapContractInviteForDjForward(content, subcontractorName, toEmail);
        await sendNotificationEmail(config, {
          to: copyTo,
          subject: fallback.subject,
          text: fallback.text,
          html: fallback.html
        });
        return {
          ok: true,
          to: toEmail,
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
      `Contract sign invite email failed (event ${event.id}, ${subcontractorId}, ${toEmail}):`,
      describeMailError(err)
    );
    return { ok: false, reason: "send_failed", error: describeMailError(err) };
  }
}

function contractSignInviteEmailErrorMessage(result) {
  if (result.reason === "missing_email") {
    return "Courriel du sous-traitant manquant.";
  }
  if (result.reason === "contract_not_saved") {
    return "Enregistrez le contrat avant d'envoyer le courriel.";
  }
  if (result.reason === "send_failed") {
    return result.error || "Envoi du courriel impossible.";
  }
  return "Envoi du courriel impossible.";
}

module.exports = {
  sendContractSignInviteEmail,
  contractSignInviteEmailErrorMessage
};
