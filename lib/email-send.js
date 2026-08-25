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

function resolveFromAddress(config) {
  if (config.resendFrom?.trim()) return config.resendFrom.trim();
  if (config.smtpFrom?.trim()) return config.smtpFrom.trim();
  if (config.smtpUser?.trim()) return config.smtpUser.trim();
  return config.emailTo;
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

  return response;
}

function validateMailConfig(config) {
  if (!config.emailTo?.trim()) {
    return { ok: false, reason: "not_configured", message: "Courriel de notification manquant." };
  }

  if (config.resendApiKey?.trim()) {
    const from = resolveFromAddress(config);
    if (!from) {
      return {
        ok: false,
        reason: "not_configured",
        message: "Expéditeur Resend manquant (ex. DJ Carl <notifications@votredomaine.com>)."
      };
    }
    return { ok: true, provider: "resend" };
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
  const from = resolveFromAddress(config);

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
    const err = new Error(body.message || body.error || `Resend HTTP ${response.status}`);
    err.code = "ERESEND";
    throw err;
  }

  return { sent: true, provider: "resend", id: body.id };
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
    from: resolveFromAddress(config),
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
  resolveFromAddress
};
