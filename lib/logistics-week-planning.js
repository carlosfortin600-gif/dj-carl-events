const crypto = require("crypto");
const { formatDateFr } = require("./helpers");
const { getSubcontractorRow } = require("./subcontractors-registry");

function ensureLogisticsWeekPlanningTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS logistics_week_planning (
      week_start TEXT NOT NULL,
      subcontractor_id TEXT NOT NULL,
      confirm_token TEXT NOT NULL UNIQUE,
      sent_at TEXT,
      confirmed_at TEXT,
      PRIMARY KEY (week_start, subcontractor_id),
      FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_week_planning_token
    ON logistics_week_planning(confirm_token)
  `);
}

function generateConfirmToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function resolveLogisticsConfirmUrl(token) {
  const safe = String(token || "").trim();
  if (!safe) return "";
  const base =
    process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ||
    `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/logistique/planning/confirmer/${safe}`;
}

function getPlanningRow(db, weekStart, subcontractorId) {
  return db
    .prepare(
      `SELECT week_start, subcontractor_id, confirm_token, sent_at, confirmed_at
       FROM logistics_week_planning
       WHERE week_start = ? AND subcontractor_id = ?`
    )
    .get(weekStart, subcontractorId);
}

function getPlanningByToken(db, token) {
  return db
    .prepare(
      `SELECT week_start, subcontractor_id, confirm_token, sent_at, confirmed_at
       FROM logistics_week_planning
       WHERE confirm_token = ?`
    )
    .get(String(token || "").trim());
}

function recordWeekPlanningSent(db, { weekStart, subcontractorId }) {
  ensureLogisticsWeekPlanningTable(db);
  const now = new Date().toISOString();
  const existing = getPlanningRow(db, weekStart, subcontractorId);
  if (existing) {
    db.prepare(
      `UPDATE logistics_week_planning
       SET sent_at = ?, confirmed_at = NULL
       WHERE week_start = ? AND subcontractor_id = ?`
    ).run(now, weekStart, subcontractorId);
    return existing.confirm_token;
  }
  const token = generateConfirmToken();
  db.prepare(
    `INSERT INTO logistics_week_planning
     (week_start, subcontractor_id, confirm_token, sent_at, confirmed_at)
     VALUES (?, ?, ?, ?, NULL)`
  ).run(weekStart, subcontractorId, token, now);
  return token;
}

function confirmWeekPlanningByToken(db, token) {
  ensureLogisticsWeekPlanningTable(db);
  const row = getPlanningByToken(db, token);
  if (!row) return { ok: false, error: "Lien invalide ou expiré." };
  if (row.confirmed_at) {
    return { ok: true, already: true, row };
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE logistics_week_planning SET confirmed_at = ? WHERE confirm_token = ?`
  ).run(now, row.confirm_token);
  return {
    ok: true,
    row: { ...row, confirmed_at: now }
  };
}

function loadPlanningMapForWeeks(db, weekStarts) {
  ensureLogisticsWeekPlanningTable(db);
  const ids = [...new Set((weekStarts || []).filter(Boolean))];
  const map = {};
  for (const ws of ids) {
    map[ws] = {};
  }
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT week_start, subcontractor_id, sent_at, confirmed_at
       FROM logistics_week_planning
       WHERE week_start IN (${placeholders})`
    )
    .all(...ids);

  for (const row of rows) {
    if (!map[row.week_start]) map[row.week_start] = {};
    map[row.week_start][row.subcontractor_id] = {
      sentAt: row.sent_at || null,
      confirmedAt: row.confirmed_at || null
    };
  }
  return map;
}

function attachWeekPlanningToWeeks(db, weeks) {
  const planningMap = loadPlanningMapForWeeks(
    db,
    (weeks || []).map((w) => w.weekStart)
  );
  return (weeks || []).map((week) => ({
    ...week,
    planningBySubcontractor: planningMap[week.weekStart] || {}
  }));
}

function getPlanningConfirmContext(db, token) {
  const row = getPlanningByToken(db, token);
  if (!row) return null;
  const person = getSubcontractorRow(db, row.subcontractor_id);
  const weekEnd = addDaysIso(row.week_start, 6);
  return {
    row,
    personLabel: person?.label || row.subcontractor_id,
    weekLabel: formatWeekRangeLabel(row.week_start, weekEnd)
  };
}

function addDaysIso(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWeekRangeLabel(weekStart, weekEnd) {
  const start = formatDateFr(weekStart);
  const end = formatDateFr(weekEnd);
  if (weekStart.slice(0, 7) === weekEnd.slice(0, 7) && weekStart !== weekEnd) {
    const sd = Number(weekStart.slice(8, 10));
    const ed = Number(weekEnd.slice(8, 10));
    const monthYear = start.replace(/^\d+\s/, "");
    return `${sd}–${ed} ${monthYear}`;
  }
  if (weekStart === weekEnd) return start;
  return `${start} – ${end}`;
}

module.exports = {
  ensureLogisticsWeekPlanningTable,
  resolveLogisticsConfirmUrl,
  recordWeekPlanningSent,
  confirmWeekPlanningByToken,
  attachWeekPlanningToWeeks,
  getPlanningConfirmContext,
  getPlanningRow
};