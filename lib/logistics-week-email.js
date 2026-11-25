const {
  clientShortName,
  clientCompanyName,
  escapeHtml,
  formatDateFr,
  formatHourFr
} = require("./helpers");
const { getSubcontractorRow } = require("./subcontractors-registry");
const { validateMailConfig, sendNotificationEmail, describeMailError } = require("./email-send");
const { getEffectiveNotificationConfig } = require("./app-settings");

function getLogisticsEmailRecipients(db) {
  return db
    .prepare(
      `SELECT id, label, email FROM subcontractors
       ORDER BY sort_order ASC, label COLLATE NOCASE ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      label: row.label,
      email: row.email?.trim() || ""
    }));
}

function formatEmployeeLineEmail(emp) {
  if (!emp) return null;
  if (emp.withMe === "yes") {
    return "Déjà avec moi : Oui";
  }
  const arrival = emp.arrivalTime ? formatHourFr(emp.arrivalTime) : "—";
  const place = emp.locationDisplay || "—";
  return `Arrivée : ${arrival} — ${place} (déjà avec moi : Non)`;
}

function buildEventTextBlock(ev, recipientId) {
  const lines = [];
  const title = clientCompanyName(ev) || clientShortName(ev);
  lines.push(title);
  lines.push(`Date : ${formatDateFr(ev.event_date)}`);
  if (ev.contractTimeLabel) lines.push(`Heures contrat : ${ev.contractTimeLabel}`);
  if (ev.thematicSummary && ev.event_type !== "Mariage") {
    lines.push(`Thématique : ${ev.thematicSummary}`);
  }
  lines.push(`Départ : ${ev.departureTimeLabel || "—"}${ev.departureFrom ? ` — ${ev.departureFrom}` : ""}`);
  lines.push(`Arrivée : ${ev.arrivalTimeLabel || "—"}${ev.arrivalAddress ? ` — ${ev.arrivalAddress}` : ""}`);
  if (ev.dayContactName || ev.dayContactPhoneDisplay) {
    lines.push(
      `Contact jour J : ${[ev.dayContactName, ev.dayContactPhoneDisplay].filter(Boolean).join(" · ")}`
    );
  }
  if (ev.accessSummary) lines.push(`Accès : ${ev.accessSummary}`);
  if (ev.hotelPeriod && ev.hotelPeriod !== "—") {
    lines.push(`Hôtel : ${ev.hotelPeriod}${ev.hotelLocation ? ` — ${ev.hotelLocation}` : ""}`);
  } else if (ev.hotelNeeded) {
    lines.push("Hôtel : besoin Oui");
  }
  const empBlock = buildEmployeeBlockText(ev, recipientId);
  if (empBlock) lines.push(empBlock);
  return lines.join("\n");
}

function buildEmployeeBlockText(ev, recipientId) {
  if (recipientId) {
    const emp = (ev.employeeLines || []).find((l) => l.subcontractorId === recipientId);
    const empLine = formatEmployeeLineEmail(emp);
    return empLine ? `Employé : ${empLine}` : null;
  }
  if (!ev.employeeLines?.length) return null;
  return ev.employeeLines
    .map((emp) => `${emp.label} : ${formatEmployeeLineEmail(emp)}`)
    .join("\n");
}

function buildEventHtmlBlock(ev, recipientId) {
  const title = escapeHtml(clientCompanyName(ev) || clientShortName(ev));
  const empRow = buildEmployeeBlockHtml(ev, recipientId);

  const rows = [
    ["Date", formatDateFr(ev.event_date)],
    ev.contractTimeLabel ? ["Heures", ev.contractTimeLabel] : null,
    ev.thematicSummary && ev.event_type !== "Mariage" ? ["Thématique", ev.thematicSummary] : null,
    [
      "Départ",
      `${ev.departureTimeLabel || "—"}${ev.departureFrom ? ` — ${ev.departureFrom}` : ""}`
    ],
    [
      "Arrivée",
      `${ev.arrivalTimeLabel || "—"}${ev.arrivalAddress ? ` — ${ev.arrivalAddress}` : ""}`
    ],
    ev.dayContactName || ev.dayContactPhoneDisplay
      ? [
          "Contact jour J",
          [ev.dayContactName, ev.dayContactPhoneDisplay].filter(Boolean).join(" · ")
        ]
      : null,
    ev.accessSummary ? ["Accès", ev.accessSummary] : null,
    empRow
  ].filter(Boolean);

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(String(value))}</td></tr>`
    )
    .join("");

  return `
<section style="margin:0 0 1.5rem;border:1px solid #dee2e6;border-radius:8px;padding:1rem;">
  <h2 style="margin:0 0 0.75rem;font-size:1.1rem;">${title}</h2>
  <table style="border-collapse:collapse;font-size:15px;line-height:1.45;">${rowsHtml}</table>
</section>`;
}

function buildEmployeeBlockHtml(ev, recipientId) {
  if (recipientId) {
    const emp = (ev.employeeLines || []).find((l) => l.subcontractorId === recipientId);
    const empLine = formatEmployeeLineEmail(emp);
    return empLine ? ["Ta logistique", empLine] : null;
  }
  if (!ev.employeeLines?.length) return null;
  const text = ev.employeeLines
    .map((emp) => `${emp.label} : ${formatEmployeeLineEmail(emp)}`)
    .join("\n");
  return ["Employés", text];
}

function buildLogisticsWeekEmail(week, recipientLabel) {
  const heading = week.heading || `Semaine du ${week.weekLabel}`;
  const subject = `Logistique — ${heading}`;

  const textBlocks = week.events.map((ev) => buildEventTextBlock(ev, week._recipientId)).join("\n\n—\n\n");

  const text = [
    `Bonjour ${recipientLabel},`,
    "",
    `Voici la logistique pour ${heading} (${week.eventCount} événement${week.eventCount !== 1 ? "s" : ""}).`,
    "",
    textBlocks,
    "",
    "— DJ Carl"
  ].join("\n");

  const htmlEvents = week.events
    .map((ev) => buildEventHtmlBlock(ev, week._recipientId))
    .join("");

  const html = `
<p>Bonjour <strong>${escapeHtml(recipientLabel)}</strong>,</p>
<p>Logistique pour <strong>${escapeHtml(heading)}</strong> — ${week.eventCount} événement${week.eventCount !== 1 ? "s" : ""}.</p>
${htmlEvents}
<p style="color:#666;font-size:14px;margin-top:1.5rem;">DJ Carl</p>`;

  return { subject, text, html };
}

async function sendLogisticsWeekEmailTest(db, { week }) {
  const config = getEffectiveNotificationConfig(db);
  const mailCheck = validateMailConfig(config);
  if (!mailCheck.ok) {
    return { ok: false, error: mailCheck.message || "Courriels non configurés." };
  }
  const toEmail = config.emailTo?.trim();
  if (!toEmail) {
    return {
      ok: false,
      error: "Courriel de notification manquant — Paramètres → Notifications."
    };
  }

  const weekForMail = { ...week, _recipientId: null };
  let { subject, text, html } = buildLogisticsWeekEmail(weekForMail, "Carl");
  subject = `[Test] ${subject}`;
  text = `[Ceci est un envoi test — vous seul le recevez.]\n\n${text}`;
  html = `<p style="background:#fff3cd;padding:8px 12px;border-radius:6px;font-size:14px;"><strong>Test</strong> — copie envoyée à votre courriel de notification seulement.</p>${html}`;

  try {
    await sendNotificationEmail(config, { to: toEmail, subject, text, html });
    return { ok: true, to: toEmail, recipientLabel: "vous (test)", test: true };
  } catch (err) {
    console.error("Logistics week test email failed:", err);
    return { ok: false, error: describeMailError(err) };
  }
}

async function sendLogisticsWeekEmail(db, { week, recipientId }) {
  const recipient = getSubcontractorRow(db, recipientId);
  if (!recipient) {
    return { ok: false, error: "Personne introuvable." };
  }
  const toEmail = recipient.email?.trim();
  if (!toEmail) {
    return { ok: false, error: "Cette personne n'a pas de courriel — ajoutez-le dans Gestion ou la fiche sous-traitant." };
  }

  const config = getEffectiveNotificationConfig(db);
  const mailCheck = validateMailConfig(config);
  if (!mailCheck.ok) {
    return { ok: false, error: mailCheck.message || "Courriels non configurés." };
  }

  const weekForMail = { ...week, _recipientId: recipientId };
  const { subject, text, html } = buildLogisticsWeekEmail(weekForMail, recipient.label);

  try {
    await sendNotificationEmail(config, { to: toEmail, subject, text, html });
    return { ok: true, to: toEmail, recipientLabel: recipient.label };
  } catch (err) {
    console.error("Logistics week email failed:", err);
    return { ok: false, error: describeMailError(err) };
  }
}

module.exports = {
  getLogisticsEmailRecipients,
  buildLogisticsWeekEmail,
  sendLogisticsWeekEmail,
  sendLogisticsWeekEmailTest
};