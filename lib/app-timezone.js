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

function formatInstantInAppTimezone(date) {
  const dateParts = getZonedParts(date, {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });
  const timeParts = getZonedParts(date, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const weekdayFr =
    WEEKDAYS_EN_TO_FR[String(partValue(dateParts, "weekday") || "").toLowerCase()] ||
    partValue(dateParts, "weekday");
  const monthFr = MONTHS_FR[Number(partValue(dateParts, "month")) - 1];
  const day = Number(partValue(dateParts, "day"));
  const year = partValue(dateParts, "year");
  const hour = partValue(timeParts, "hour");
  const minute = partValue(timeParts, "minute");

  return capitalizeFr(
    `${weekdayFr} le ${day} ${monthFr} ${year} à ${hour}:${minute}`
  );
}

function parseStoredTimestamp(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const hasTime = match[4] != null;
  if (!hasTime) {
    return {
      dateOnly: true,
      isoDate: `${match[1]}-${match[2]}-${match[3]}`
    };
  }

  return {
    dateOnly: false,
    instant: new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0)
      )
    )
  };
}

function formatStoredTimestampFr(value, formatDateFr) {
  if (!value) return "—";
  const parsed = parseStoredTimestamp(value);
  if (!parsed) return String(value);
  if (parsed.dateOnly) return formatDateFr(parsed.isoDate);
  if (Number.isNaN(parsed.instant.getTime())) return String(value);
  return formatInstantInAppTimezone(parsed.instant);
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

function timestampNowUtcForDb() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

module.exports = {
  APP_TIMEZONE,
  formatStoredTimestampFr,
  todayInAppTimezone,
  timestampNowUtcForDb
};
