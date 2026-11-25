const {
  clientShortName,
  clientCompanyName,
  escapeHtml,
  formatDateFr,
  formatHourFr
} = require("./helpers");
const { getSubcontractorRow } = require("./subcontractors-registry");
const {
  validateMailConfig,
  sendNotificationEmail,
  describeMailError,
  isResendTestMode
} = require("./email-send");
const { getEffectiveNotificationConfig } = require("./app-settings");
const { getEmailCopyTo } = require("./email-copy-to");
const {
  emailLogoHtml,
  emailClientSignatureText,
  emailClientSignatureHtml,
  resolveEmailLogoUrl
} = require("./email-branding");

const EMAIL_LABEL_STYLE =
  "font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6c757d;font-weight:600;margin-bottom:2px;";
const EMAIL_CARD_STYLE =
  "margin:0 0 16px;border:1px solid rgba(0,0,0,0.12);border-left:4px solid #0d6efd;border-radius:12px;padding:16px;background:#ffffff;";
const EMAIL_TIME_STYLE = "color:#0d6efd;font-weight:700;";
const EMAIL_BADGE_STYLE =
  "display:inline-block;font-size:12px;font-weight:500;padding:3px 10px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;color:#212529;margin-bottom:8px;";
const EMAIL_EMPLOYEE_BOX_STYLE =
  "margin-top:14px;padding:12px 14px;border:2px solid #198754;border-radius:10px;background:#d1e7dd;";
const EMAIL_EMPLOYEE_PILL =
  "display:inline-block;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:600;margin-left:4px;";

function recipientFirstName(label) {
  const raw = String(label || "").trim();
  if (!raw) return "là";
  if (/^vous\s*\(test\)/i.test(raw)) return "Carl";
  const first = raw.split(/\s+/)[0];
  return first || raw;
}

function resolveLogisticsSelfRecipient(config) {
  const copyTo = getEmailCopyTo();
  if (isResendTestMode(config)) {
    return (copyTo || config.emailTo?.trim() || "").trim() || null;
  }
  return (config.emailTo?.trim() || copyTo || "").trim() || null;
}

function isResendRecipientBlockedError(err) {
  const code = err?.code || "";
  const response = String(err?.message || "").toLowerCase();
  return (
    code === "ERESEND" &&
    (response.includes("only send") ||
      response.includes("testing") ||
      response.includes("verify a domain") ||
      (response.includes("verify") && response.includes("domain")))
  );
}

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

function emailFieldHtml(label, valueInnerHtml) {
  return `<div style="margin:0 0 10px;">
<div style="${EMAIL_LABEL_STYLE}">${escapeHtml(label)}</div>
<div style="font-size:15px;line-height:1.45;">${valueInnerHtml}</div>
</div>`;
}

function buildEventHtmlBlock(ev, recipientId) {
  const title = escapeHtml(clientCompanyName(ev) || clientShortName(ev));
  const metaParts = [escapeHtml(formatDateFr(ev.event_date))];
  if (ev.contractTimeLabel) metaParts.push(escapeHtml(ev.contractTimeLabel));
  if (ev.thematicSummary && ev.event_type !== "Mariage") {
    metaParts.push(escapeHtml(ev.thematicSummary));
  }
  const metaLine = metaParts.join(' <span style="color:#adb5bd;">·</span> ');

  const departTime = ev.departureTimeLabel
    ? `<span style="${EMAIL_TIME_STYLE}">${escapeHtml(ev.departureTimeLabel)}</span>`
    : "—";
  const departPlace = ev.departureFrom
    ? `<div style="color:#6c757d;font-size:14px;margin-top:4px;">de ${escapeHtml(ev.departureFrom)}</div>`
    : "";
  const arriveTime = ev.arrivalTimeLabel
    ? `<span style="${EMAIL_TIME_STYLE}">${escapeHtml(ev.arrivalTimeLabel)}</span>`
    : "—";
  const arrivePlace = ev.arrivalAddress
    ? `<div style="color:#6c757d;font-size:14px;margin-top:4px;">à ${escapeHtml(ev.arrivalAddress)}</div>`
    : "";

  const empHtml = buildEmployeeBlockHtmlContent(ev, recipientId);

  const hotelLine =
    ev.hotelPeriod && ev.hotelPeriod !== "—"
      ? escapeHtml(
          `${ev.hotelPeriod}${ev.hotelLocation ? ` · ${ev.hotelLocation}` : ""}`
        )
      : ev.hotelNeeded
        ? "Besoin <strong>Oui</strong>"
        : null;

  return `<article style="${EMAIL_CARD_STYLE}">
<h2 style="margin:0 0 6px;font-size:1.2rem;font-weight:700;line-height:1.25;">${title}</h2>
<p style="margin:0 0 12px;font-size:14px;color:#6c757d;line-height:1.4;">${metaLine}</p>
<p style="margin:0 0 10px;font-size:13px;color:#6c757d;">${escapeHtml(ev.event_type || "")}</p>
<span style="${EMAIL_BADGE_STYLE}">Adresses — trajet</span>
${emailFieldHtml("Départ", `${departTime}${departPlace}`)}
${emailFieldHtml("Arrivée", `${arriveTime}${arrivePlace}`)}
${
  hotelLine
    ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e9ecef;">
<span style="${EMAIL_BADGE_STYLE}">Locations</span>
${emailFieldHtml("Hôtel", hotelLine)}
</div>`
    : ""
}
${empHtml || ""}
</article>`;
}

function buildEmployeeGreenBoxHtml(emp) {
  if (!emp) return "";
  const withMeYes = emp.withMe === "yes";
  const arrival = emp.arrivalTime ? formatHourFr(emp.arrivalTime) : "—";
  const place = emp.locationDisplay || "—";
  const yesOn =
    "background:#0d6efd;color:#ffffff;border:1px solid #0d6efd;";
  const yesOff = "background:#ffffff;color:#0d6efd;border:1px solid #0d6efd;";
  const noOn = yesOn;
  const noOff = yesOff;
  return `<div style="${EMAIL_EMPLOYEE_BOX_STYLE}">
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.4;">
<tr>
<td style="font-weight:700;padding:4px 10px 4px 0;vertical-align:middle;">${escapeHtml(emp.label || "")}</td>
<td style="padding:4px 10px;vertical-align:middle;white-space:nowrap;"><span style="${EMAIL_TIME_STYLE}">${escapeHtml(arrival)}</span></td>
<td style="padding:4px 10px;vertical-align:middle;">${escapeHtml(place)}</td>
<td style="padding:4px 0;text-align:right;vertical-align:middle;white-space:nowrap;">
<span style="${EMAIL_EMPLOYEE_PILL}${withMeYes ? yesOn : yesOff}">Oui</span><span style="${EMAIL_EMPLOYEE_PILL}${withMeYes ? noOff : noOn}">Non</span>
</td>
</tr>
</table>
</div>`;
}

function buildEmployeeBlockHtmlContent(ev, recipientId) {
  if (recipientId) {
    const emp = (ev.employeeLines || []).find((l) => l.subcontractorId === recipientId);
    return buildEmployeeGreenBoxHtml(emp);
  }
  if (!ev.employeeLines?.length) return "";
  return ev.employeeLines.map((emp) => buildEmployeeGreenBoxHtml(emp)).join("");
}

function buildLogisticsWeekEmail(week, recipientLabel, options = {}) {
  const heading = week.heading || `Semaine du ${week.weekLabel}`;
  const firstName = recipientFirstName(recipientLabel);
  const eventWord = week.eventCount !== 1 ? "événements" : "événement";
  const subject = `Planning de la semaine — ${heading}`;
  const introSentence = week._recipientId
    ? `Voici le planning de la semaine (${heading}) — ${week.eventCount} ${eventWord} où tu es sur le contrat.`
    : `Voici le planning de la semaine (${heading}) — ${week.eventCount} ${eventWord}.`;

  const textBlocks = week.events.map((ev) => buildEventTextBlock(ev, week._recipientId)).join("\n\n—\n\n");

  let text = [
    `Salut ${firstName},`,
    "",
    introSentence,
    "",
    textBlocks,
    "",
    emailClientSignatureText("")
  ].join("\n");

  const htmlEvents = week.events
    .map((ev) => buildEventHtmlBlock(ev, week._recipientId))
    .join("");

  const logoUrl = resolveEmailLogoUrl();
  let html = `<div style="max-width:640px;margin:0 auto;">
${emailLogoHtml(logoUrl)}
<p style="font-size:16px;line-height:1.5;">Salut <strong>${escapeHtml(firstName)}</strong>,</p>
<p style="font-size:16px;line-height:1.5;">Voici le <strong>planning de la semaine</strong> — ${escapeHtml(heading)}.<br>
<span style="color:#6c757d;">${week.eventCount} ${eventWord}${week._recipientId ? " pour ta logistique" : ""}.</span></p>
${htmlEvents}
${emailClientSignatureHtml("")}
</div>`;

  if (options.testBannerHtml) {
    html = `${options.testBannerHtml}${html}`;
  }
  if (options.testBannerText) {
    text = `${options.testBannerText}\n\n${text}`;
  }

  return { subject, text, html };
}

function filterWeekEventsForSubcontractor(db, week, subcontractorId) {
  const eventIds = week.events.map((ev) => ev.id);
  if (!eventIds.length) return { ...week, events: [], eventCount: 0 };

  const placeholders = eventIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT event_id FROM subcontractor_contracts
       WHERE subcontractor_id = ?
         AND event_id IN (${placeholders})`
    )
    .all(subcontractorId, ...eventIds);
  const allowed = new Set(rows.map((row) => row.event_id));
  const events = week.events.filter((ev) => allowed.has(ev.id));
  return { ...week, events, eventCount: events.length };
}

async function sendLogisticsWeekEmailTest(db, { week }) {
  const config = getEffectiveNotificationConfig(db);
  const mailCheck = validateMailConfig(config);
  if (!mailCheck.ok) {
    return { ok: false, error: mailCheck.message || "Courriels non configurés." };
  }
  const toEmail = resolveLogisticsSelfRecipient(config);
  if (!toEmail) {
    return {
      ok: false,
      error:
        "Courriel manquant — même réglage que le questionnaire : Paramètres → Notifications ou copie pro@djcarl.ca."
    };
  }

  const weekForMail = { ...week, _recipientId: null };
  const resendTest = isResendTestMode(config);
  const intro = resendTest
    ? `Test — livré à ${toEmail} (même principe que l’envoi questionnaire en mode Resend test).`
    : "Test — copie pour vérification avant envoi à l’employé.";
  let { subject, text, html } = buildLogisticsWeekEmail(weekForMail, "Carl", {
    testBannerText: intro,
    testBannerHtml: `<p style="background:#fff3cd;padding:10px 14px;border-radius:8px;font-size:14px;margin:0 0 20px;"><strong>Test</strong> — ${escapeHtml(intro)}</p>`
  });
  subject = `[Test] ${subject}`;

  try {
    const sent = await sendNotificationEmail(config, { to: toEmail, subject, text, html });
    return {
      ok: true,
      to: toEmail,
      from: sent.from || null,
      recipientLabel: "vous (test)",
      test: true
    };
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

  const filteredWeek = filterWeekEventsForSubcontractor(db, week, recipientId);
  if (!filteredWeek.events.length) {
    return {
      ok: false,
      error: "Aucun contrat pour cette personne durant cette semaine."
    };
  }

  const weekForMail = { ...filteredWeek, _recipientId: recipientId };
  const { subject, text, html } = buildLogisticsWeekEmail(weekForMail, recipient.label);

  try {
    const sent = await sendNotificationEmail(config, { to: toEmail, subject, text, html });
    return { ok: true, to: toEmail, from: sent.from || null, recipientLabel: recipient.label };
  } catch (err) {
    const copyTo = getEmailCopyTo();
    if (copyTo && isResendRecipientBlockedError(err)) {
      try {
        const fwdSubject = `[À transmettre: ${recipient.label}] ${subject}`;
        const fwdText = `Transmettre à ${recipient.label} <${toEmail}>.\n\n${text}`;
        const fwdHtml = `<p style="background:#fff3cd;padding:8px 12px;border-radius:6px;"><strong>Transmettre à ${escapeHtml(recipient.label)}</strong> &lt;${escapeHtml(toEmail)}&gt;</p>${html}`;
        const sent = await sendNotificationEmail(config, {
          to: copyTo,
          subject: fwdSubject,
          text: fwdText,
          html: fwdHtml
        });
        return {
          ok: true,
          to: copyTo,
          from: sent.from || null,
          recipientLabel: `${recipient.label} (copie ${copyTo})`,
          forwarded: true
        };
      } catch (fallbackErr) {
        console.error("Logistics week email fallback failed:", fallbackErr);
        return { ok: false, error: describeMailError(fallbackErr) };
      }
    }
    console.error("Logistics week email failed:", err);
    return { ok: false, error: describeMailError(err) };
  }
}

module.exports = {
  getLogisticsEmailRecipients,
  buildLogisticsWeekEmail,
  sendLogisticsWeekEmail,
  sendLogisticsWeekEmailTest,
  resolveLogisticsSelfRecipient
};