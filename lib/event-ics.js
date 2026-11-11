const {
  clientShortName,
  clientFullName,
  calendarEventTitle,
  formatDateFr,
  formatTime,
  formatDateTimeFr
} = require("./helpers");

const DEFAULT_DURATION_HOURS = 5;
const CALLBACK_DEFAULT_TIME = "10:00";
const CALLBACK_DURATION_MINUTES = 15;
const CALENDAR_TZ = process.env.CALENDAR_TZ || "America/Toronto";

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const parts = [line.slice(0, max)];
  let rest = line.slice(max);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, max - 1)}`);
    rest = rest.slice(max - 1);
  }
  return parts.join("\r\n");
}

function toIcsLocalDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = String(timeStr || "18:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return {
    year,
    month,
    day,
    hour: Number.isFinite(hour) ? hour : 18,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

function formatIcsDateTime(parts) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}00`;
}

function addHours(dateStr, timeStr, hours) {
  const base = toIcsLocalDateTime(dateStr, timeStr);
  const dt = new Date(base.year, base.month - 1, base.day, base.hour, base.minute, 0);
  dt.setHours(dt.getHours() + hours);
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
    hour: dt.getHours(),
    minute: dt.getMinutes()
  };
}

function addMinutesToParts(parts, minutes) {
  const dt = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  dt.setMinutes(dt.getMinutes() + minutes);
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
    hour: dt.getHours(),
    minute: dt.getMinutes()
  };
}

function normalizeCallbackParty(party) {
  if (party === "venue") return "venue";
  return "client";
}

function clientCallbackEligible(djNotes) {
  if (!djNotes?.tech_callback_date?.trim()) return false;
  return normalizeCallbackParty(djNotes.tech_callback_party) === "client";
}

function clientCallbackChanged(before, after) {
  if (!before || !after) return false;
  return (
    (before.tech_callback_date || "") !== (after.tech_callback_date || "") ||
    (before.tech_callback_time || "") !== (after.tech_callback_time || "") ||
    (before.tech_callback_name || "") !== (after.tech_callback_name || "") ||
    normalizeCallbackParty(before.tech_callback_party) !== normalizeCallbackParty(after.tech_callback_party)
  );
}

function resolveEventDateTimes(event) {
  const start = toIcsLocalDateTime(event.event_date, event.start_time || "18:00");
  let end = null;

  if (event.end_time) {
    end = toIcsLocalDateTime(event.end_date || event.event_date, event.end_time);
  } else {
    end = addHours(event.event_date, event.start_time || "18:00", DEFAULT_DURATION_HOURS);
  }

  if (!start || !end) return null;

  const startKey = formatIcsDateTime(start);
  const endKey = formatIcsDateTime(end);
  if (endKey <= startKey) {
    end = addHours(event.event_date, event.start_time || "18:00", DEFAULT_DURATION_HOURS);
  }

  return { start, end };
}

function buildCalendarSummary(event) {
  return calendarEventTitle(event);
}

function buildCalendarLocation(event) {
  const parts = [];
  if (event.venue?.trim()) parts.push(event.venue.trim());
  if (event.address?.trim()) parts.push(event.address.trim());
  return parts.join(", ");
}

function buildCalendarDescription(event, services, appUrl) {
  const lines = [
    `Client : ${clientFullName(event)}`,
    event.phone ? `Téléphone : ${event.phone}` : null,
    event.email ? `Courriel : ${event.email}` : null,
    `Type : ${event.event_type}`,
    `Date : ${formatDateFr(event.event_date)}`,
    event.start_time ? `Début : ${formatTime(event.start_time)}` : null,
    event.end_time
      ? `Fin : ${formatDateTimeFr(event.end_date || event.event_date, event.end_time)}`
      : null,
    event.venue ? `Salle : ${event.venue}` : null,
    event.address ? `Adresse : ${event.address}` : null,
    event.guest_count ? `Invités : ${event.guest_count}` : null,
    services?.length ? `Services : ${services.join(", ")}` : null,
    event.animation_notes ? `Animation : ${event.animation_notes}` : null,
    appUrl ? `Dossier : ${appUrl}/events/${event.id}` : null
  ].filter(Boolean);

  return lines.join("\n");
}

function buildClientCallbackDescription(event, djNotes, appUrl) {
  const who = djNotes.tech_callback_name?.trim() || clientFullName(event);
  const lines = [
    `Rappeler : ${who}`,
    event.phone ? `Téléphone : ${event.phone}` : null,
    event.email ? `Courriel : ${event.email}` : null,
    `Événement : ${formatDateFr(event.event_date)} (${event.event_type})`,
    event.venue ? `Salle : ${event.venue}` : null,
    appUrl ? `Dossier : ${appUrl}/events/${event.id}?tab=gestion&gestion=depart` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function buildClientCallbackIcsFilename(event, callbackDate) {
  const slug = clientShortName(event)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `dj-carl-rappel-${slug || "client"}-${callbackDate || "date"}.ics`;
}

function buildClientCallbackIcs({ event, djNotes, appUrl = "" }) {
  if (!clientCallbackEligible(djNotes)) {
    throw new Error("Rappel client invalide ou incomplet.");
  }

  const callbackDate = djNotes.tech_callback_date.trim();
  const timeRaw = djNotes.tech_callback_time?.trim();
  const start = toIcsLocalDateTime(callbackDate, timeRaw || CALLBACK_DEFAULT_TIME);
  if (!start) {
    throw new Error("Date de rappel invalide.");
  }

  const end = addMinutesToParts(start, CALLBACK_DURATION_MINUTES);
  const who = djNotes.tech_callback_name?.trim() || clientShortName(event);
  const summary = escapeIcs(`Rappeler — ${who}`);
  const description = escapeIcs(buildClientCallbackDescription(event, djNotes, appUrl));
  const dtStamp = formatIcsDateTime(
    toIcsLocalDateTime(
      new Date().toISOString().slice(0, 10),
      new Date().toTimeString().slice(0, 5)
    )
  );
  const uid = `djcarl-callback-client-${event.id}@dj-carl-events`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DJ Carl Events//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${CALENDAR_TZ}`,
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${CALENDAR_TZ}:${formatIcsDateTime(start)}`,
    `DTEND;TZID=${CALENDAR_TZ}:${formatIcsDateTime(end)}`,
    foldIcsLine(`SUMMARY:${summary}`),
    foldIcsLine(`DESCRIPTION:${description}`),
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function buildEventIcsFilename(event) {
  const slug = clientShortName(event)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `dj-carl-${slug || "evenement"}-${event.event_date}.ics`;
}

function buildEventIcs({ event, services = [], appUrl = "" }) {
  const times = resolveEventDateTimes(event);
  if (!times) {
    throw new Error("Impossible de générer le calendrier sans date d'événement.");
  }

  const summary = escapeIcs(buildCalendarSummary(event));
  const location = escapeIcs(buildCalendarLocation(event));
  const description = escapeIcs(buildCalendarDescription(event, services, appUrl));
  const dtStamp = formatIcsDateTime(
    toIcsLocalDateTime(
      new Date().toISOString().slice(0, 10),
      new Date().toTimeString().slice(0, 5)
    )
  );
  const uid = `djcarl-event-${event.id}@dj-carl-events`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DJ Carl Events//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${CALENDAR_TZ}`,
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${CALENDAR_TZ}:${formatIcsDateTime(times.start)}`,
    `DTEND;TZID=${CALENDAR_TZ}:${formatIcsDateTime(times.end)}`,
    foldIcsLine(`SUMMARY:${summary}`),
    location ? foldIcsLine(`LOCATION:${location}`) : null,
    foldIcsLine(`DESCRIPTION:${description}`),
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean);

  return `${lines.join("\r\n")}\r\n`;
}

module.exports = {
  buildEventIcs,
  buildEventIcsFilename,
  buildClientCallbackIcs,
  buildClientCallbackIcsFilename,
  clientCallbackEligible,
  clientCallbackChanged,
  buildCalendarSummary,
  buildCalendarLocation,
  buildCalendarDescription
};
