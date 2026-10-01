const { formatLateTime } = require("./late-time");

const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Toronto";

const WEEKDAYS_EN_TO_FR = {
  sunday: "dimanche",
  monday: "lundi",
  tuesday: "mardi",
  wednesday: "mercredi",
  thursday: "jeudi",
  friday: "vendredi",
  saturday: "samedi"
};

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre"
];

function capitalizeFr(text) {
  if (!text || text === "—") return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getZonedParts(date, options) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    ...options
  }).formatToParts(date);
}

function partValue(parts, type) {
  return parts.find((entry) => entry.type === type)?.value;
}

function zonedNowParts() {
  const dateParts = getZonedParts(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const timeParts = getZonedParts(new Date(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return {
    year: partValue(dateParts, "year"),
    month: partValue(dateParts, "month"),
    day: partValue(dateParts, "day"),
    hour: partValue(timeParts, "hour"),
    minute: partValue(timeParts, "minute"),
    second: partValue(timeParts, "second") || "00"
  };
}

function defaultDatetimeLocalValue() {
  const p = zonedNowParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function timestampNowForDb() {
  const p = zonedNowParts();
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** @deprecated use timestampNowForDb — kept for imports */
function timestampNowUtcForDb() {
  return timestampNowForDb();
}

function parseStoredTimestamp(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
  const hasTime = match[4] != null;
  if (!hasTime) {
    return { dateOnly: true, isoDate };
  }

  return {
    dateOnly: false,
    isoDate,
    hour: match[4],
    minute: match[5]
  };
}

function formatStoredTimestampFr(value, formatDateFr) {
  if (!value) return "—";
  const parsed = parseStoredTimestamp(value);
  if (!parsed) return String(value);
  if (parsed.dateOnly) return formatDateFr(parsed.isoDate);

  const datePart = formatDateFr(parsed.isoDate);
  if (datePart === "—") return String(value);
  const timePart = formatLateTime(`${parsed.hour}:${parsed.minute}`);
  return `${datePart} à ${timePart}`;
}

function todayInAppTimezone() {
  const parts = getZonedParts(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");
  return `${year}-${month}-${day}`;
}

function applyAppTimezoneToProcess() {
  if (!process.env.TZ) {
    process.env.TZ = APP_TIMEZONE;
  }
}

module.exports = {
  APP_TIMEZONE,
  applyAppTimezoneToProcess,
  defaultDatetimeLocalValue,
  formatStoredTimestampFr,
  todayInAppTimezone,
  timestampNowForDb,
  timestampNowUtcForDb,
  zonedNowParts
};
