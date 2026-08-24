function parseCheckboxList(body, fieldName) {
  const raw = body[fieldName];
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [raw].filter(Boolean);
}

function yn(value) {
  if (value === "yes" || value === "no") return value;
  return "";
}

function getQuestionnaireRow(db, eventId) {
  return db
    .prepare("SELECT data, updated_at FROM wedding_questionnaires WHERE event_id = ?")
    .get(eventId);
}

function saveQuestionnaireRow(db, eventId, data) {
  const json = JSON.stringify(data);
  const existing = db
    .prepare("SELECT id FROM wedding_questionnaires WHERE event_id = ?")
    .get(eventId);

  if (existing) {
    db.prepare(
      `UPDATE wedding_questionnaires
       SET data = ?, updated_at = datetime('now', 'localtime')
       WHERE event_id = ?`
    ).run(json, eventId);
  } else {
    db.prepare(
      `INSERT INTO wedding_questionnaires (event_id, data) VALUES (?, ?)`
    ).run(eventId, json);
  }
}

function isWeddingEvent(eventType) {
  return eventType === "Mariage";
}

const PARTY_DECADES = [
  "Années 70",
  "Années 80",
  "Années 90",
  "Années 2000",
  "Hits actuels",
  "Disco",
  "Dance",
  "Rock",
  "Rock classique",
  "Québécois",
  "Francophone",
  "Country",
  "Latino",
  "Hip-hop / R&B"
];

const COCKTAIL_LOCATION_OPTIONS = [
  { value: "same_room", label: "Même salle" },
  { value: "other_room", label: "Autre salle" },
  { value: "outside", label: "Extérieur" }
];

const ANIMATION_LEVELS = [
  { value: "aucun", label: "Aucun" },
  { value: "discret", label: "Très discret" },
  { value: "quelques", label: "Quelques interventions" },
  { value: "moderee", label: "Animation modérée" },
  { value: "tres_anime", label: "Très animé" }
];

const ANIMATION_ACTIVITIES = [
  "Jeux",
  "Quiz",
  "Bingo musical",
  "Karaoké",
  "Photobooth",
  "Roue pour les tirages",
  "On connaît la chanson"
];

const GUEST_REQUEST_OPTIONS = [
  { value: "yes", label: "Oui" },
  { value: "yes_if_ambiance", label: "Oui selon l'ambiance" },
  { value: "ask_couple", label: "Demander aux mariés" },
  { value: "no", label: "Non" }
];

module.exports = {
  parseCheckboxList,
  yn,
  getQuestionnaireRow,
  saveQuestionnaireRow,
  isWeddingEvent,
  PARTY_DECADES,
  COCKTAIL_LOCATION_OPTIONS,
  ANIMATION_LEVELS,
  ANIMATION_ACTIVITIES,
  GUEST_REQUEST_OPTIONS
};
