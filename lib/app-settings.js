const SETTINGS_KEY = "notification_settings";

function defaultNotificationSettings() {
  return {
    emailTo: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: ""
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

  const settings = {
    emailTo: String(data.emailTo || "").trim(),
    smtpHost: String(data.smtpHost || "").trim(),
    smtpPort: String(data.smtpPort || "587").trim() || "587",
    smtpSecure: data.smtpSecure === "1" || data.smtpSecure === true,
    smtpUser: String(data.smtpUser || "").trim(),
    smtpPass,
    smtpFrom: String(data.smtpFrom || "").trim()
  };

  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(SETTINGS_KEY, JSON.stringify(settings));

  return settings;
}

function getEffectiveNotificationConfig(db) {
  const stored = getNotificationSettings(db);
  return {
    emailTo: stored.emailTo || process.env.NOTIFY_EMAIL_TO?.trim() || "",
    smtpHost: stored.smtpHost || process.env.SMTP_HOST?.trim() || "",
    smtpPort: stored.smtpPort || process.env.SMTP_PORT?.trim() || "587",
    smtpSecure:
      stored.smtpSecure ||
      process.env.SMTP_SECURE === "1",
    smtpUser: stored.smtpUser || process.env.SMTP_USER?.trim() || "",
    smtpPass: stored.smtpPass || process.env.SMTP_PASS?.trim() || "",
    smtpFrom:
      stored.smtpFrom ||
      process.env.SMTP_FROM?.trim() ||
      stored.smtpUser ||
      process.env.SMTP_USER?.trim() ||
      ""
  };
}

function isEmailNotificationConfigured(db) {
  const config = getEffectiveNotificationConfig(db);
  return Boolean(config.emailTo && config.smtpHost);
}

module.exports = {
  getNotificationSettings,
  saveNotificationSettings,
  getEffectiveNotificationConfig,
  isEmailNotificationConfigured
};
