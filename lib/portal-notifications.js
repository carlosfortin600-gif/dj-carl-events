const { clientShortName, formatDateFr, formatTimestampFr, localTimestampNow, escapeHtml } = require("./helpers");
const { getPortalBaseUrls } = require("./portal");
const { getEffectiveNotificationConfig, notificationConfigFromBody } = require("./app-settings");
const { sendNotificationEmail, describeMailError } = require("./email-send");
const {
  buildChangeSummaryText,
  buildChangeSummaryHtml
} = require("./portal-change-summary");

const KIND_LABELS = {
  questionnaire: "questionnaire",
  "plan-soiree": "plan de soirée",
  confirmation: "confirmation client"
};

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function recordPortalClientUpdate(db, eventId, kind) {
  db.prepare(
    `INSERT INTO portal_client_notifications (event_id, kind, created_at)
     VALUES (?, ?, datetime('now', 'localtime'))`
  ).run(eventId, kind);
}

function getUnreadPortalNotifications(db, limit = 15) {
  return db
    .prepare(
      `SELECT n.id, n.event_id, n.kind, n.created_at,
              e.event_type, e.event_date, e.venue,
              c.first_name_1, c.first_name_2, c.last_name
       FROM portal_client_notifications n
       JOIN events e ON e.id = n.event_id
       JOIN clients c ON c.id = e.client_id
       WHERE n.read_at IS NULL AND e.deleted_at IS NULL
       ORDER BY n.created_at DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      ...row,
      clientName: clientShortName(row),
      kindLabel: kindLabel(row.kind)
    }));
}

function getUnreadPortalNotificationCount(db) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM portal_client_notifications n
       JOIN events e ON e.id = n.event_id
       WHERE n.read_at IS NULL AND e.deleted_at IS NULL`
    )
    .get().count;
}

function getLastPortalClientUpdate(db, eventId) {
  const row = db
    .prepare(
      `SELECT id, kind, created_at, read_at
       FROM portal_client_notifications
       WHERE event_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(eventId);
  if (!row) return null;
  return { ...row, kindLabel: kindLabel(row.kind) };
}

function markPortalNotificationsReadForEvent(db, eventId) {
  db.prepare(
    `UPDATE portal_client_notifications
     SET read_at = datetime('now', 'localtime')
     WHERE event_id = ? AND read_at IS NULL`
  ).run(eventId);
}

function markPortalNotificationRead(db, notificationId) {
  db.prepare(
    `UPDATE portal_client_notifications
     SET read_at = datetime('now', 'localtime')
     WHERE id = ? AND read_at IS NULL`
  ).run(notificationId);
}

function hasUnreadPortalNotificationForEvent(db, eventId) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM portal_client_notifications
         WHERE event_id = ? AND read_at IS NULL LIMIT 1`
      )
      .get(eventId)
  );
}

async function sendClientUpdateEmail({ db, event, kind, req, changes = [] }) {
  const config = getEffectiveNotificationConfig(db);

  const { currentBase } = getPortalBaseUrls(req);
  const eventUrl = `${currentBase}/events/${event.id}?tab=client`;
  const clientName = clientShortName(event);
  const section = kindLabel(kind);
  const when = formatTimestampFr(localTimestampNow());
  const changeText = buildChangeSummaryText(changes);
  const changeHtml = buildChangeSummaryHtml(changes);

  const subject = `Modification client — ${clientName} (${section})`;
  const text = [
    `${clientName} a modifié le ${section}.`,
    `Heure : ${when}`,
    `Événement : ${event.event_type} — ${formatDateFr(event.event_date)}`,
    event.venue ? `Salle : ${event.venue}` : null,
    "",
    "Ce qui a changé :",
    changeText,
    "",
    `Ouvrir le dossier : ${eventUrl}`
  ]
    .filter((line) => line !== null)
    .join("\n");

  return sendNotificationEmail(config, {
    to: config.emailTo,
    subject,
    text,
    html: `<p><strong>${escapeHtml(clientName)}</strong> a modifié le <strong>${escapeHtml(section)}</strong>.</p>
<p class="text-muted">${escapeHtml(when)}</p>
<p>${escapeHtml(event.event_type)} — ${escapeHtml(formatDateFr(event.event_date))}${event.venue ? `<br>Salle : ${escapeHtml(event.venue)}` : ""}</p>
${changeHtml}
<p><a href="${escapeHtml(eventUrl)}">Ouvrir le dossier dans DJ Carl Events</a></p>`
  });
}

async function sendClientConfirmationEmail({
  db,
  event,
  req,
  confirmedByName,
  changes = [],
  isReconfirmation = false
}) {
  const config = getEffectiveNotificationConfig(db);
  if (!config.emailTo?.trim()) return null;

  const { currentBase } = getPortalBaseUrls(req);
  const eventUrl = `${currentBase}/events/${event.id}?tab=client`;
  const clientName = clientShortName(event);
  const when = formatTimestampFr(localTimestampNow());
  const changeText = buildChangeSummaryText(changes);
  const changeHtml = buildChangeSummaryHtml(changes);

  const subject = `Client confirmé — ${clientName}`;
  const textParts = [
    `${clientName} a confirmé son dossier.`,
    `Confirmé par : ${confirmedByName}`,
    `Heure : ${when}`,
    `Événement : ${event.event_type} — ${formatDateFr(event.event_date)}`,
    event.venue ? `Salle : ${event.venue}` : null
  ].filter((line) => line !== null);

  if (isReconfirmation) {
    textParts.push("", "Modifications depuis la dernière confirmation :", changeText);
  }

  textParts.push("", `Ouvrir le dossier : ${eventUrl}`);
  const text = textParts.join("\n");

  const reconfirmBlock = isReconfirmation
    ? `<p><strong>Modifications depuis la dernière confirmation :</strong></p>${changeHtml}`
    : "";

  return sendNotificationEmail(config, {
    to: config.emailTo,
    subject,
    text,
    html: `<p><strong>${escapeHtml(clientName)}</strong> a confirmé son dossier.</p>
<p>Confirmé par : <strong>${escapeHtml(confirmedByName)}</strong></p>
<p class="text-muted">${escapeHtml(when)}</p>
<p>${escapeHtml(event.event_type)} — ${escapeHtml(formatDateFr(event.event_date))}${event.venue ? `<br>Salle : ${escapeHtml(event.venue)}` : ""}</p>
${reconfirmBlock}
<p><a href="${escapeHtml(eventUrl)}">Ouvrir le dossier dans DJ Carl Events</a></p>`
  });
}

async function notifyDjCarlClientConfirmation({
  db,
  event,
  req,
  confirmedByName,
  changes = [],
  isReconfirmation = false
}) {
  try {
    await sendClientConfirmationEmail({
      db,
      event,
      req,
      confirmedByName,
      changes,
      isReconfirmation
    });
  } catch (err) {
    console.error("Confirmation notification email:", describeMailError(err));
  }
}

async function sendTestNotificationEmail({ db, body }) {
  const config = notificationConfigFromBody(db, body);
  const when = formatTimestampFr(localTimestampNow());
  const subject = "Test — DJ Carl Events";
  const text = [
    "Ceci est un courriel de test depuis DJ Carl Events.",
    `Heure : ${when}`,
    "",
    "Si vous recevez ce message, la configuration fonctionne."
  ].join("\n");

  const result = await sendNotificationEmail(config, {
    to: config.emailTo,
    subject,
    text,
    html: `<p>Ceci est un <strong>courriel de test</strong> depuis DJ Carl Events.</p>
<p class="text-muted">${when}</p>
<p>Si vous recevez ce message, la configuration fonctionne.</p>`
  });

  return { ...result, to: config.emailTo };
}

async function notifyDjCarlClientUpdate({ db, event, kind, req, changes = [] }) {
  recordPortalClientUpdate(db, event.id, kind);
  try {
    await sendClientUpdateEmail({ db, event, kind, req, changes });
  } catch (err) {
    console.error("Notification email client:", err.message);
  }
}

module.exports = {
  kindLabel,
  recordPortalClientUpdate,
  getUnreadPortalNotifications,
  getUnreadPortalNotificationCount,
  getLastPortalClientUpdate,
  markPortalNotificationsReadForEvent,
  markPortalNotificationRead,
  hasUnreadPortalNotificationForEvent,
  notifyDjCarlClientUpdate,
  notifyDjCarlClientConfirmation,
  sendTestNotificationEmail,
  describeMailError
};
