const STATUS_LABELS = {
  a_completer: "À compléter",
  en_preparation: "En préparation",
  pret: "Prêt",
  termine: "Terminé"
};

const EVENT_TYPES = [
  "Mariage",
  "Party privé",
  "Party entreprise",
  "Party de Noël",
  "Anniversaire",
  "Autre"
];

const CUSTOM_SERVICE_SLOT_COUNT = 12;

const BASE_SERVICE_OPTIONS = [
  "Système de son premium — 2 tops, 2 subs",
  "DJ",
  "Animation",
  "Photobooth",
  "8 uplights à batterie",
  "Projection de vidéoclips musicaux",
  "2 lumières pour plancher de danse LED",
  "2 Moving heads",
  "Console",
  "Ordi"
];

const ADDON_SERVICE_OPTIONS = [
  "1 delay",
  "2 delays",
  "Sub",
  "Kit de son supplémentaire",
  "Télé 43 po",
  "Télé 60 po",
  "Écran géant 7x10",
  "Karaoké",
  "Color FX",
  "Color pallettes",
  "Uplight filaire",
  "Terbly"
];

const SUPPLEMENTARY_SERVICE_OPTIONS = [
  "Bingo musical",
  "On connaît la chanson",
  "Roue pour tirages",
  "Selon réaction",
  "Laser"
];

const BINGO_MUSICAL_STYLE_OPTIONS = ["Noël", "80", "90", "Country", "Pop"];

const SERVICE_OPTIONS = [
  ...BASE_SERVICE_OPTIONS,
  ...ADDON_SERVICE_OPTIONS,
  ...SUPPLEMENTARY_SERVICE_OPTIONS
];

function todayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi"
];

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

function parseIsoDateParts(dateStr) {
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function capitalizeFr(text) {
  if (!text || text === "—") return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDateFr(dateStr) {
  if (!dateStr) return "—";
  const parts = parseIsoDateParts(dateStr);
  if (!parts) return String(dateStr);
  const date = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const weekday = WEEKDAYS_FR[date.getDay()];
  const month = MONTHS_FR[parts.month - 1];
  return capitalizeFr(`${weekday} le ${parts.day} ${month} ${parts.year}`);
}

function formatTime(timeStr) {
  if (!timeStr) return "—";
  const match = String(timeStr).trim().match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : String(timeStr);
}

function formatDateTimeFr(dateStr, timeStr) {
  if (!dateStr && !timeStr) return "—";
  const datePart = dateStr ? formatDateFr(dateStr) : null;
  const timePart = timeStr && timeStr !== "—" ? formatTime(timeStr) : null;
  if (datePart && datePart !== "—" && timePart && timePart !== "—") {
    return `${datePart} à ${timePart}`;
  }
  if (datePart && datePart !== "—") return datePart;
  return timePart || "—";
}

function formatTimestampFr(timestampStr) {
  if (!timestampStr) return "—";
  const match = String(timestampStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return String(timestampStr);
  const datePart = formatDateFr(`${match[1]}-${match[2]}-${match[3]}`);
  if (match[4] != null && match[5] != null) {
    return `${datePart} à ${match[4]}:${match[5]}`;
  }
  return datePart;
}

function localTimestampNow() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatDateRangeFr(start, end) {
  const from = formatDateFr(start);
  const to = formatDateFr(end);
  if (from === "—" && to === "—") return "—";
  if (from !== "—" && to !== "—") return `${from} au ${to}`;
  return from !== "—" ? `À partir du ${from}` : `Jusqu'au ${to}`;
}

function formatDateTimeRangeFr(startDate, startTime, endDate, endTime) {
  const from = formatDateTimeFr(startDate, startTime);
  const to = formatDateTimeFr(endDate, endTime);
  if (from === "—" && to === "—") return "—";
  if (from !== "—" && to !== "—") return `${from} au ${to}`;
  return from !== "—" ? `À partir du ${from}` : `Jusqu'au ${to}`;
}

function endDatetimeLocalValue(eventDate, endDate, endTime) {
  const date = endDate || eventDate;
  if (!date || !endTime) return "";
  return `${date}T${endTime.slice(0, 5)}`;
}

function parseEndDatetime(value) {
  if (!value || !String(value).trim()) {
    return { end_date: null, end_time: null };
  }
  const [date, time] = String(value).trim().split("T");
  return {
    end_date: date || null,
    end_time: time ? time.slice(0, 5) : null
  };
}

function clientShortName(client) {
  const wedding = client.event_type === "Mariage";
  if (wedding) {
    const parts = [client.first_name_2, client.first_name_1].filter(Boolean);
    if (parts.length === 0) return client.last_name || "Client";
    if (parts.length === 1) return parts[0];
    return `${parts[0]} & ${parts[1]}`;
  }

  const company =
    client.last_name && client.last_name !== "—" ? client.last_name.trim() : "";
  const contacts = [client.first_name_1, client.first_name_2].filter(Boolean);
  if (company && contacts.length) return `${company} — ${contacts.join(" & ")}`;
  if (company) return company;
  if (contacts.length === 0) return "Client";
  if (contacts.length === 1) return contacts[0];
  return `${contacts[0]} & ${contacts[1]}`;
}

function clientFullName(client) {
  return clientShortName(client);
}

function weddingLastName(lastName) {
  const trimmed = lastName?.trim();
  return trimmed && trimmed !== "—" ? trimmed : "—";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function statusBadgeClass(status) {
  return `status-badge-${status}`;
}

function googleMapsUrl(address) {
  const query = address?.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsDirectionsUrl(origin, destination, coords = {}) {
  const from =
    coords.fromLat != null && coords.fromLon != null
      ? `${coords.fromLat},${coords.fromLon}`
      : origin?.trim();
  const to =
    coords.toLat != null && coords.toLon != null
      ? `${coords.toLat},${coords.toLon}`
      : destination?.trim();
  if (!from || !to) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`;
}

function parseServices(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return [raw].filter(Boolean);
}

function parseCustomServices(body) {
  const custom = [];
  for (let i = 1; i <= CUSTOM_SERVICE_SLOT_COUNT; i++) {
    const name = body[`custom_service_${i}`]?.trim();
    if (name) custom.push(name);
  }
  return custom;
}

function parseAllServices(body) {
  const standard = parseServices(body.services);
  const custom = parseCustomServices(body);
  return [...new Set([...standard, ...custom])];
}

function parseBingoMusicalStyle(body) {
  const services = parseServices(body.services);
  if (!services.includes("Bingo musical")) return null;
  const style = body.bingo_musical_style?.trim();
  return style || null;
}

function parseOnConnaitChansonNotes(body) {
  const services = parseServices(body.services);
  if (!services.includes("On connaît la chanson")) return null;
  const notes = body.on_connait_chanson_notes?.trim();
  return notes || null;
}

function splitServicesForForm(allServices, standardOptions = SERVICE_OPTIONS) {
  const standardSet = new Set(standardOptions);
  const selectedServices = allServices.filter((service) => standardSet.has(service));
  const customNames = allServices.filter((service) => !standardSet.has(service));
  const customServiceSlots = Array.from({ length: CUSTOM_SERVICE_SLOT_COUNT }, (_, index) => ({
    enabled: Boolean(customNames[index]),
    name: customNames[index] || ""
  }));

  return { selectedServices, customServiceSlots };
}

module.exports = {
  STATUS_LABELS,
  EVENT_TYPES,
  SERVICE_OPTIONS,
  BASE_SERVICE_OPTIONS,
  ADDON_SERVICE_OPTIONS,
  SUPPLEMENTARY_SERVICE_OPTIONS,
  BINGO_MUSICAL_STYLE_OPTIONS,
  CUSTOM_SERVICE_SLOT_COUNT,
  todayLocal,
  formatDateFr,
  formatTime,
  formatDateTimeFr,
  formatTimestampFr,
  formatDateRangeFr,
  formatDateTimeRangeFr,
  localTimestampNow,
  endDatetimeLocalValue,
  parseEndDatetime,
  clientShortName,
  clientFullName,
  weddingLastName,
  statusLabel,
  statusBadgeClass,
  googleMapsUrl,
  googleMapsDirectionsUrl,
  parseServices,
  parseCustomServices,
  parseAllServices,
  parseBingoMusicalStyle,
  parseOnConnaitChansonNotes,
  splitServicesForForm
};
