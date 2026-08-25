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

function describeMailError(err) {
  const code = err?.code || "";
  const response = String(err?.response || err?.message || "Erreur inconnue");
  const lower = response.toLowerCase();

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

async function sendViaResend(config, { to, subject, text, html }) {
  const apiKey = config.resendApiKey.trim();
  const from = resolveResendFrom(config);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body.message ||
      (Array.isArray(body.errors) ? body.errors.map((e) => e.message).join(" ") : "") ||
      body.error ||
      `Resend HTTP ${response.status}`;
    const err = new Error(detail);
    err.code = "ERESEND";
    throw err;
  }

  return { sent: true, provider: "resend", id: body.id, from };
}

async function sendViaSmtp(config, { to, subject, text, html }) {
  const nodemailer = loadNodemailer();
  if (!nodemailer) {
    const err = new Error("Module nodemailer indisponible sur le serveur.");
    err.code = "missing_module";
    throw err;
  }

  const transporter = nodemailer.createTransport(normalizeSmtpConfig(config));
  await transporter.verify();

  await transporter.sendMail({
    from: resolveSmtpFrom(config),
    to,
    subject,
    text,
    html
  });

  return { sent: true, provider: "smtp" };
}

async function sendNotificationEmail(config, { to, subject, text, html }) {
  const check = validateMailConfig(config);
  if (!check.ok) {
    const err = new Error(check.message);
    err.code = check.reason;
    throw err;
  }

  const recipient = to || config.emailTo;
  const payload = { to: recipient, subject, text, html };

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
  RESEND_TEST_FROM
};
