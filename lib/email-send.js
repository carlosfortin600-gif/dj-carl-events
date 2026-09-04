function loadNodemailer() {
  try {
    return require("nodemailer");
  } catch {
    return null;
  }
}

function normalizeSmtpConfig(config) {
  const port = Number(config.smtpPort || 587);
  let secure = Boolean(config.smtpSecure);
  if (port === 465) secure = true;
  if (port === 587) secure = false;

  return {
    host: config.smtpHost,
    port,
    secure,
    requireTLS: !secure,
    auth:
      config.smtpUser && config.smtpPass
        ? {
            user: config.smtpUser,
            pass: config.smtpPass
          }
        : undefined,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 25000
  };
}

const RESEND_TEST_FROM = "DJ Carl Events <onboarding@resend.dev>";

function wrapTransactionalHtml(html) {
  const body = String(html || "").trim();
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DJ Carl</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;margin:0;padding:20px;background:#ffffff;">
${body}
</body>
</html>`;
}

function normalizeEmailBody(text, html) {
  const plain = String(text || "").trim();
  const markup = String(html || "").trim();
  if (!plain && !markup) {
    const err = new Error("Le contenu du courriel est vide.");
    err.code = "EEMPTY";
    throw err;
  }
  return {
    text: plain || "Ouvrez ce courriel dans un client compatible HTML pour voir le message complet.",
    html: wrapTransactionalHtml(markup || `<p>${plain.replace(/\n/g, "<br>")}</p>`)
  };
}

function resolveResendFrom(config) {
  if (config.resendFrom?.trim()) return config.resendFrom.trim();
  return RESEND_TEST_FROM;
}

function resolveSmtpFrom(config) {
  if (config.smtpFrom?.trim()) return config.smtpFrom.trim();
  if (config.smtpUser?.trim()) return config.smtpUser.trim();
  return config.emailTo;
}

function resolveFromAddress(config, provider = "smtp") {
  if (provider === "resend") return resolveResendFrom(config);
  return resolveSmtpFrom(config);
}

function isResendTestMode(config) {
  if (!config.resendApiKey?.trim()) return false;
  return resolveResendFrom(config).includes("onboarding@resend.dev");
}

function describeMailError(err) {
  const code = err?.code || "";
  const response = String(err?.response || err?.message || "Erreur inconnue");
  const lower = response.toLowerCase();

  if (code === "EEMPTY") {
    return "Le contenu du courriel est vide — vérifiez l'expéditeur Resend et le lien client.";
  }

  if (code === "EAUTH" || lower.includes("authentication") || lower.includes("535")) {
    return "Authentification refusée — vérifiez l'utilisateur SMTP et le mot de passe d'application Gmail.";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNREFUSED" || code === "ENETUNREACH") {
    return `${response} — connexion SMTP impossible (hôte, port ou blocage réseau du serveur, fréquent sur l'hébergement cloud).`;
  }
  if (lower.includes("missing credentials") || lower.includes("auth")) {
    return "Identifiants SMTP manquants — renseignez utilisateur et mot de passe, puis enregistrez.";
  }
  if (lower.includes("self signed") || lower.includes("certificate")) {
    return `${response} — problème de certificat TLS sur le serveur SMTP.`;
  }

  if (code === "ERESEND" || lower.includes("resend") || lower.includes("domain")) {
    if (lower.includes("only send") && lower.includes("testing")) {
      const allowedMatch = response.match(/\(([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\)/i);
      const allowed = allowedMatch ? allowedMatch[1] : "";
      if (allowed) {
        return `En mode test Resend, le courriel de notification doit être ${allowed} (identique à votre compte Resend). Pour recevoir sur une autre adresse (ex. Hotmail), vérifiez un domaine sur resend.com/domains puis changez l'expéditeur.`;
      }
      return "En mode test Resend, le courriel de notification doit être identique à votre compte Resend.";
    }
    if (lower.includes("verify a domain") || lower.includes("verify") && lower.includes("domain")) {
      return "Resend exige un domaine vérifié pour envoyer à cette adresse. Ajoutez votre domaine sur resend.com/domains, puis mettez un expéditeur avec ce domaine.";
    }
    if (lower.includes("from") && (lower.includes("domain") || lower.includes("invalid"))) {
      return `Expéditeur Resend invalide. Sans domaine vérifié, utilisez : ${RESEND_TEST_FROM}`;
    }
    return response;
  }

  return response;
}

function validateMailConfig(config) {
  if (!config.emailTo?.trim()) {
    return { ok: false, reason: "not_configured", message: "Courriel de notification manquant." };
  }

  if (config.resendApiKey?.trim()) {
    return { ok: true, provider: "resend", from: resolveResendFrom(config) };
  }

  if (!config.smtpHost?.trim()) {
    return { ok: false, reason: "not_configured", message: "Serveur SMTP manquant." };
  }
  if (!config.smtpUser?.trim() || !config.smtpPass?.trim()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Utilisateur ou mot de passe SMTP manquant — enregistrez vos paramètres."
    };
  }

  return { ok: true, provider: "smtp" };
}

async function sendViaResend(config, { to, subject, text, html, bcc }) {
  const apiKey = config.resendApiKey.trim();
  const from = resolveResendFrom(config);
  const emailBody = normalizeEmailBody(text, html);

  const payload = {
    from,
    to: [to],
    subject: String(subject || "").trim() || "Message de DJ Carl",
    text: emailBody.text,
    html: emailBody.html
  };
  if (bcc?.length) {
    payload.bcc = bcc;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      responseBody.message ||
      (Array.isArray(responseBody.errors)
        ? responseBody.errors.map((e) => e.message).join(" ")
        : "") ||
      responseBody.error ||
      `Resend HTTP ${response.status}`;
    const err = new Error(detail);
    err.code = "ERESEND";
    throw err;
  }

  return { sent: true, provider: "resend", id: responseBody.id, from };
}

async function sendViaSmtp(config, { to, subject, text, html, bcc }) {
  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    const err = new Error("Module nodemailer indisponible sur le serveur.");
    err.code = "missing_module";
    throw err;
  }

  const emailBody = normalizeEmailBody(text, html);
  const transporter = nodemailer.createTransport(normalizeSmtpConfig(config));
  await transporter.verify();

  const mail = {
    from: resolveSmtpFrom(config),
    to,
    subject: String(subject || "").trim() || "Message de DJ Carl",
    text: emailBody.text,
    html: emailBody.html
  };
  if (bcc?.length) {
    mail.bcc = bcc.join(", ");
  }

  await transporter.sendMail(mail);

  return { sent: true, provider: "smtp" };
}

async function sendNotificationEmail(config, { to, subject, text, html, bcc }) {
  const check = validateMailConfig(config);
  if (!check.ok) {
    const err = new Error(check.message);
    err.code = check.reason;
    throw err;
  }

  const recipient = to || config.emailTo;
  const payload = { to: recipient, subject, text, html, bcc };

  if (check.provider === "resend") {
    return sendViaResend(config, payload);
  }

  try {
    return await sendViaSmtp(config, payload);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  describeMailError,
  validateMailConfig,
  sendNotificationEmail,
  resolveFromAddress,
  resolveResendFrom,
  isResendTestMode,
  RESEND_TEST_FROM
};
