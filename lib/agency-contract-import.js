const pdf = require("pdf-parse");
const { EVENT_TYPES } = require("./helpers");
const { normalizePhone } = require("./phone");

const FRENCH_MONTHS = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseFrenchLongDate(text) {
  const re =
    /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(20\d{2})\b/i;
  const match = String(text || "").match(re);
  if (!match) return null;
  const month = FRENCH_MONTHS[match[2].toLowerCase()];
  return toIsoDate(Number(match[3]), month, Number(match[1]));
}

function parseNumericDate(text) {
  const slash = String(text || "").match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    return toIsoDate(year, month, day);
  }
  const iso = String(text || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function parseEventDate(text) {
  return parseFrenchLongDate(text) || parseNumericDate(text);
}

function parseTime(text) {
  const m = String(text || "").match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/i);
  if (!m) {
    const t = String(text || "").match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!t) return null;
    return `${pad2(Number(t[1]))}:${t[2]}`;
  }
  return `${pad2(Number(m[1]))}:${pad2(Number(m[2] || "0"))}`;
}

function extractLabeledValue(text, labelPattern) {
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-–]\\s*([^\\n]+)`,
    "im"
  );
  const match = String(text || "").match(re);
  return match && match[1] != null ? match[1].trim() : null;
}

function detectEventType(text) {
  const t = String(text || "").toLowerCase();
  if (/\bmariage\b/.test(t)) return "Mariage";
  if (/\bparty de noël\b|\bparty de noel\b/.test(t)) return "Party de Noël";
  if (/\banniversaire\b/.test(t)) return "Anniversaire";
  if (/\bparty privé\b|\bparty prive\b/.test(t)) return "Party privé";
  if (/\b(corpo|corporatif|entreprise|gala)\b/.test(t)) return "Corpo";
  return "Mariage";
}

function detectGuestCount(text) {
  const m = String(text || "").match(
    /(?:nombre d['’]?invités|invités|convives|personnes)\s*[:\-–]?\s*(\d{1,4})/i
  );
  if (m) return Number(m[1]);
  const m2 = String(text || "").match(/\b(\d{2,4})\s+invités\b/i);
  return m2 ? Number(m2[1]) : null;
}

function detectPrice(text) {
  const m = String(text || "").match(
    /(?:prix|tarif|montant|total|honoraires)\s*[:\-–]?\s*([0-9\s,.]+)\s*\$?/i
  );
  if (!m) return null;
  const digits = m[1].replace(/\s/g, "").replace(",", ".");
  if (!digits) return null;
  return `${m[1].trim()} $`;
}

function pickFirstEmail(text) {
  const m = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].trim() : null;
}

function pickFirstPhone(text) {
  const m = String(text || "").match(
    /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/
  );
  return m ? normalizePhone(m[0]) : null;
}

function parseAgencyContractText(rawText) {
  const text = String(rawText || "").replace(/\r\n/g, "\n").trim();
  const hints = [];

  const draft = {
    event_type: detectEventType(text),
    event_date: parseEventDate(text),
    start_time: null,
    end_time: null,
    end_date: null,
    first_name_1: null,
    first_name_2: null,
    last_name: null,
    email: pickFirstEmail(text),
    phone: pickFirstPhone(text),
    phone_cell: null,
    venue: extractLabeledValue(text, "(?:nom de la )?salle|lieu|venue|établissement"),
    address: extractLabeledValue(text, "adresse(?: complète)?"),
    city: extractLabeledValue(text, "ville|municipalité"),
    guest_count: detectGuestCount(text),
    tech_charged_price: detectPrice(text)
  };

  const marie = extractLabeledValue(text, "marié(?!e)");
  const mariee = extractLabeledValue(text, "mariée|mariee");
  const contact = extractLabeledValue(
    text,
    "personne contact|contact|client|demandeur"
  );
  const entreprise = extractLabeledValue(
    text,
    "entreprise|organisation|compagnie|nom de l['’]entreprise"
  );

  if (draft.event_type === "Mariage") {
    if (mariee) draft.first_name_2 = mariee.split(/\s+/)[0];
    if (marie) draft.first_name_1 = marie.split(/\s+/)[0];
    draft.last_name = "—";
    if (mariee) hints.push("Mariée détectée");
    if (marie) hints.push("Marié détecté");
  } else {
    if (entreprise) draft.last_name = entreprise;
    else if (contact) draft.last_name = contact.split(/\s+/)[0];
    if (contact) {
      const parts = contact.split(/\s+/);
      draft.first_name_1 = parts[0] || null;
      if (parts.length > 1) draft.first_name_2 = parts.slice(1).join(" ");
    }
  }

  const startLabel = extractLabeledValue(
    text,
    "heure de début|début|debut|cocktail|installation"
  );
  const endLabel = extractLabeledValue(text, "heure de fin|fin|départ|depart");
  draft.start_time = parseTime(startLabel) || parseTime(text);

  const endParsed = parseTime(endLabel);
  if (endParsed && draft.event_date) {
    draft.end_time = endParsed;
    draft.end_date = draft.event_date;
  }

  if (draft.event_date) hints.push(`Date : ${draft.event_date}`);
  if (draft.venue) hints.push("Salle / lieu");
  if (draft.email) hints.push("Courriel");
  if (draft.phone) hints.push("Téléphone");

  const missing = [];
  if (!draft.event_date) missing.push("Date de l'événement");
  if (draft.event_type === "Mariage" && !draft.first_name_1) missing.push("Prénom du mari");
  if (draft.event_type !== "Mariage" && !draft.last_name) missing.push("Nom de l'entreprise");

  return {
    text,
    draft,
    hints,
    missing,
    eventTypes: EVENT_TYPES
  };
}

async function extractTextFromPdfBuffer(buffer) {
  if (!buffer?.length) {
    throw new Error("Fichier PDF vide.");
  }
  const result = await pdf(buffer);
  const text = String(result.text || "").trim();
  if (!text) {
    throw new Error(
      "Impossible d'extraire du texte — essayez de coller le contenu du contrat."
    );
  }
  return text;
}

function draftToFormValues(draft) {
  const values = { ...draft };
  for (const key of Object.keys(values)) {
    if (values[key] === null || values[key] === undefined) values[key] = "";
  }
  if (values.guest_count === "") values.guest_count = "";
  return values;
}

module.exports = {
  parseAgencyContractText,
  extractTextFromPdfBuffer,
  draftToFormValues
};
