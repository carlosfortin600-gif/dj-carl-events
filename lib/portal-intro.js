function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function introCookieName(token) {
  return `portal_intro_${token}`;
}

function hasPortalIntroAck(req, event) {
  const token = event?.portal_token;
  if (!token) return false;
  return parseCookies(req)[introCookieName(token)] === "1";
}

function ackPortalIntro(res, event) {
  const token = event?.portal_token;
  if (!token) return;
  res.cookie(introCookieName(token), "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function ackPortalIntroDb(db, eventId) {
  db.prepare(
    `UPDATE events
     SET portal_intro_ack_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
}

module.exports = {
  hasPortalIntroAck,
  ackPortalIntro,
  ackPortalIntroDb
};
