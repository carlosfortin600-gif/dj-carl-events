const crypto = require("crypto");
const os = require("os");

function generatePortalToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) {
          return entry.address;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getPortalBaseUrls(req) {
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  if (publicUrl) {
    return {
      currentBase: publicUrl,
      lanBase: null,
      localhostBase: publicUrl
    };
  }

  const port = process.env.PORT || 3000;
  const host = req.get("host") || `localhost:${port}`;
  const protocol = req.protocol || "http";
  const currentBase = `${protocol}://${host}`;

  const lanIp = getLanIp();
  const lanBase = lanIp ? `http://${lanIp}:${port}` : null;

  return { currentBase, lanBase, localhostBase: `http://localhost:${port}` };
}

function buildPortalUrl(baseUrl, token) {
  return `${baseUrl}/portal/${token}`;
}

function getPublicPortalUrl(token) {
  const base = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  if (!base || !token) return null;
  return buildPortalUrl(base, token);
}

function getPortalLinks(req, token) {
  if (!token) return null;

  const { currentBase, lanBase, localhostBase } = getPortalBaseUrls(req);
  return {
    primary: buildPortalUrl(currentBase, token),
    lan: lanBase ? buildPortalUrl(lanBase, token) : null,
    localhost: buildPortalUrl(localhostBase, token)
  };
}

function ensurePortalToken(db, eventId) {
  const event = db
    .prepare("SELECT id, portal_token FROM events WHERE id = ?")
    .get(eventId);

  if (!event) return null;
  if (event.portal_token) return event.portal_token;

  const token = generatePortalToken();
  db.prepare(
    `UPDATE events
     SET portal_token = ?, portal_created_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(token, eventId);

  return token;
}

function regeneratePortalToken(db, eventId) {
  const token = generatePortalToken();
  db.prepare(
    `UPDATE events
     SET portal_token = ?, portal_created_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(token, eventId);
  return token;
}

function setPortalEnabled(db, eventId, enabled) {
  db.prepare("UPDATE events SET portal_enabled = ? WHERE id = ?").run(
    enabled ? 1 : 0,
    eventId
  );
}

function getEventByPortalToken(db, token) {
  return db
    .prepare(
      `SELECT e.*,
              c.first_name_1, c.first_name_2, c.last_name,
              c.phone, c.email
       FROM events e
       JOIN clients c ON c.id = e.client_id
       WHERE e.portal_token = ? AND e.portal_enabled = 1 AND e.deleted_at IS NULL`
    )
    .get(token);
}

function touchPortalAccess(db, eventId) {
  db.prepare(
    "UPDATE events SET portal_last_accessed = datetime('now', 'localtime') WHERE id = ?"
  ).run(eventId);
}

module.exports = {
  generatePortalToken,
  getLanIp,
  getPortalBaseUrls,
  buildPortalUrl,
  getPublicPortalUrl,
  getPortalLinks,
  ensurePortalToken,
  regeneratePortalToken,
  setPortalEnabled,
  getEventByPortalToken,
  touchPortalAccess
};
