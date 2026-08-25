const SETTINGS_KEY = "notification_settings";
const { resolveFromAddress } = require("./email-send");

function defaultNotificationSettings() {
  return {
    emailTo: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    resendApiKey: "",
    resendFrom: ""
  };
}

function getNotificationSettings(db) {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SETTINGS_KEY);
  if (!row?.value) return defaultNotificationSettings();

  try {
    const parsed = JSON.parse(row.value);
    return { ...defaultNotificationSettings(), ...parsed };
  } catch {
    return defaultNotificationSettings();
  }
}

function saveNotificationSettings(db, data) {
  const existing = getNotificationSettings(db);
  const smtpPass =
    String(data.smtpPass || "").trim() || existing.smtpPass || "";
  const resendApiKey =
    String(data.resendApiKey || "").trim() || existing.resendApiKey || "";

  const settings = {
    emailTo: String(data.emailTo || "").trim(),
    smtpHost: String(data.smtpHost || "").trim(),
    smtpPort: String(data.smtpPort || "587").trim() || "587",
    smtpSecure: data.smtpSecure === "1" || data.smtpSecure === true,
    smtpUser: String(data.smtpUser || "").trim(),
    smtpPass,
    smtpFrom: String(data.smtpFrom || "").trim(),
    resendApiKey,
    resendFrom: String(data.resendFrom || "").trim()
  };

  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, JSON.stringify(settings));

  return settings;
}

function getEffectiveNotificationConfig(db) {
  const stored = getNotificationSettings(db);
  return mergeNotificationConfigWithEnv(stored);
}

function mergeNotificationConfigWithEnv(config) {
  return {
    emailTo: config.emailTo || process.env.NOTIFY_EMAIL_TO?.trim() || "",
    smtpHost: config.smtpHost || process.env.SMTP_HOST?.trim() || "",
    smtpPort: config.smtpPort || process.env.SMTP_PORT?.trim() || "587",
    smtpSecure: config.smtpSecure || process.env.SMTP_SECURE === "1",
    smtpUser: config.smtpUser || process.env.SMTP_USER?.trim() || "",
    smtpPass: config.smtpPass || process.env.SMTP_PASS?.trim() || "",
    smtpFrom:
      config.smtpFrom ||
      process.env.SMTP_FROM?.trim() ||
      config.smtpUser ||
      process.env.SMTP_USER?.trim() ||
      "",
    resendApiKey: config.resendApiKey || process.env.RESEND_API_KEY?.trim() || "",
    resendFrom: config.resendFrom || process.env.RESEND_FROM?.trim() || ""
  };
}

function notificationConfigFromBody(db, body) {
  const existing = getNotificationSettings(db);
  const smtpPass =
    String(body.smtpPass || "").trim() || existing.smtpPass || "";
  const resendApiKey =
    String(body.resendApiKey || "").trim() || existing.resendApiKey || "";

  return mergeNotificationConfigWithEnv({
    emailTo: String(body.emailTo || "").trim(),
    smtpHost: String(body.smtpHost || "").trim(),
    smtpPort: String(body.smtpPort || "587").trim() || "587",
    smtpSecure: body.smtpSecure === "1" || body.smtpSecure === true,
    smtpUser: String(body.smtpUser || "").trim(),
    smtpPass,
    smtpFrom: String(body.smtpFrom || "").trim(),
    resendApiKey,
    resendFrom: String(body.resendFrom || "").trim()
  });
}

function isEmailNotificationConfigured(db) {
  const config = getEffectiveNotificationConfig(db);
  if (!config.emailTo) return false;
  if (config.resendApiKey?.trim()) {
    return Boolean(resolveFromAddress(config));
  }
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

module.exports = {
  getNotificationSettings,
  saveNotificationSettings,
  getEffectiveNotificationConfig,
  notificationConfigFromBody,
  isEmailNotificationConfigured
};
