function hasPortalIntroAck(event) {
  return Boolean(event?.portal_intro_ack_at);
}

function ackPortalIntro(db, eventId) {
  db.prepare(
    `UPDATE events
     SET portal_intro_ack_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id = ?`
  ).run(eventId);
}

module.exports = {
  hasPortalIntroAck,
  ackPortalIntro
};
