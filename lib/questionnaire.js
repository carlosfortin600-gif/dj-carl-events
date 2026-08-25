const {
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
} = require("./questionnaire-shared");
const {
  defaultPartyQuestionnaire,
  bodyToPartyQuestionnaire,
  getPartyQuestionnaire,
  savePartyQuestionnaire,
  isPartyQuestionnaireComplete,
  AGE_GROUPS,
  EVENING_THEME_OPTIONS,
  PARTY_GUEST_REQUEST_OPTIONS
} = require("./party-questionnaire");
const { parseClientPlanSteps, defaultClientPlan, mergeClientPlan } = require("./plan-soiree");
const {
  parseSpecialAnimation,
  defaultSpecialAnimation,
  mergeSpecialAnimation
} = require("./special-animation");

const MOMENT_KEYS = [
  { key: "procession", label: "Entrée cortège" },
  { key: "couple_entrance", label: "Entrée mariés" },
  { key: "speeches", label: "Discours" },
  { key: "cake", label: "Coupe gâteau" },
  { key: "first_dance", label: "Première danse" },
  { key: "father_daughter", label: "Danse père/fille" },
  { key: "mother_son", label: "Danse mère/fils" },
  { key: "bouquet", label: "Lancer bouquet" },
  { key: "dance_floor", label: "Ouverture du plancher" },
  { key: "last_dance", label: "Dernière danse" }
];

const COCKTAIL_STYLES = [
  "Lounge",
  "Pop douce",
  "Francophone",
  "Country",
  "Jazz",
  "Classiques",
  "Mélange"
];

const INVITE_GUESTS_OPTIONS = [
  { value: "immediately", label: "Immédiatement" },
  { value: "after_1_min", label: "Après 1 minute" },
  { value: "after_2_min", label: "Après 2 minutes" },
  { value: "end_of_song", label: "À la fin de la chanson" },
  { value: "do_not_invite", label: "Ne pas les inviter" }
];

function defaultQuestionnaire() {
  return {
    _formType: "wedding",
    _completed: false,
    general: {
      guest_arrival_time: "",
      couple_entrance_time: "",
      dinner_time: "",
      first_dance_approx_time: "",
      party_start_time: ""
    },
    ceremony: {
      location: "",
      start_time: "",
      end_time: ""
    },
    couple_entrance: {
      official_entrance: "",
      procession_entrance: "",
      procession_song: "",
      procession_spotify: "",
      procession_confirmed: "",
      groomsmen_before_song: "",
      groomsmen_before_spotify: "",
      groomsmen_before_confirmed: "",
      bridesmaids_song: "",
      bridesmaids_spotify: "",
      bridesmaids_confirmed: "",
      groomsmen_song: "",
      groomsmen_spotify: "",
      groomsmen_confirmed: "",
      groomsmen_notes: "",
      bridesmaids_notes: "",
      couple_entrance_song: "",
      couple_entrance_spotify: "",
      couple_entrance_confirmed: "",
      couple_entrance_notes: ""
    },
    first_dance: {
      enabled: "",
      artist: "",
      song: "",
      spotify: "",
      confirmed: "",
      dj_announces: "",
      invite_guests: ""
    },
    special_dances: {
      father_daughter_enabled: "",
      father_daughter_song: "",
      mother_son_enabled: "",
      mother_son_song: "",
      other_people: "",
      other_song: ""
    },
    cocktail: {
      cocktail_location: "",
      cocktail_place: "",
      cocktail_dj_distance: "",
      styles: [],
      requests: ""
    },
    dinner: {
      dinner_location: "",
      dinner_place: "",
      dinner_dj_distance: "",
      styles: [],
      requests: ""
    },
    party_music: {
      decades: [],
      must_play: "",
      preferred_artists: "",
      forbidden_songs: "",
      avoid_styles: "",
      guest_requests: ""
    },
    animation: {
      level: "",
      activities: [],
      comments: ""
    },
    important_moments: MOMENT_KEYS.map((m) => ({
      key: m.key,
      label: m.label,
      active: "",
      time: "",
      song: "",
      notes: ""
    })),
    important_questions: {
      perfect_evening: "",
      other_info: "",
      family_situations: ""
    },
    day_contact: {
      name: "",
      phone: "",
      email: ""
    },
    client_plan: defaultClientPlan(),
    special_animation: defaultSpecialAnimation()
  };
}

function bodyToQuestionnaire(body) {
  const data = defaultQuestionnaire();
  data._completed = body._completed === "1";

  Object.assign(data.general, {
    guest_arrival_time: body.guest_arrival_time || "",
    couple_entrance_time: body.couple_entrance_time || "",
    dinner_time: body.dinner_time || "",
    first_dance_approx_time: body.first_dance_approx_time || "",
    party_start_time: body.party_start_time || ""
  });

  Object.assign(data.ceremony, {
    location: body.ceremony_location?.trim() || "",
    start_time: body.ceremony_start_time || "",
    end_time: body.ceremony_end_time || ""
  });

  Object.assign(data.couple_entrance, {
    official_entrance: yn(body.official_entrance),
    procession_entrance: yn(body.procession_entrance),
    procession_song: body.procession_song || "",
    procession_spotify: body.procession_spotify || "",
    procession_confirmed: body.procession_confirmed === "1",
    groomsmen_before_song: body.groomsmen_before_song || "",
    groomsmen_before_spotify: body.groomsmen_before_spotify || "",
    groomsmen_before_confirmed: body.groomsmen_before_confirmed === "1",
    bridesmaids_song: body.bridesmaids_song || "",
    bridesmaids_spotify: body.bridesmaids_spotify || "",
    bridesmaids_confirmed: body.bridesmaids_confirmed === "1",
    groomsmen_song: body.groomsmen_song || "",
    groomsmen_spotify: body.groomsmen_spotify || "",
    groomsmen_confirmed: body.groomsmen_confirmed === "1",
    groomsmen_notes: body.groomsmen_notes || "",
    bridesmaids_notes: body.bridesmaids_notes || "",
    couple_entrance_song: body.couple_entrance_song || "",
    couple_entrance_spotify: body.couple_entrance_spotify || "",
    couple_entrance_confirmed: body.couple_entrance_confirmed === "1",
    couple_entrance_notes: body.couple_entrance_notes || ""
  });

  Object.assign(data.first_dance, {
    enabled: yn(body.first_dance_enabled),
    artist: body.first_dance_artist || "",
    song: body.first_dance_song || "",
    spotify: body.first_dance_spotify || "",
    confirmed: body.first_dance_confirmed === "1",
    dj_announces: yn(body.first_dance_dj_announces),
    invite_guests: body.first_dance_invite_guests || ""
  });

  Object.assign(data.special_dances, {
    father_daughter_enabled: yn(body.father_daughter_enabled),
    father_daughter_song: body.father_daughter_song || "",
    mother_son_enabled: yn(body.mother_son_enabled),
    mother_son_song: body.mother_son_song || "",
    other_people: body.other_dance_people || "",
    other_song: body.other_dance_song || ""
  });

  data.cocktail.styles = parseCheckboxList(body, "cocktail_styles");
  Object.assign(data.cocktail, {
    cocktail_location: body.cocktail_location || "",
    cocktail_place: body.cocktail_place || "",
    cocktail_dj_distance: body.cocktail_dj_distance || "",
    requests: body.cocktail_requests?.trim() || ""
  });

  data.dinner.styles = parseCheckboxList(body, "dinner_styles");
  Object.assign(data.dinner, {
    dinner_location: body.dinner_location || "",
    dinner_place: body.dinner_place || "",
    dinner_dj_distance: body.dinner_dj_distance || "",
    requests: body.dinner_requests?.trim() || ""
  });

  data.party_music.decades = parseCheckboxList(body, "party_decades");
  data.party_music.must_play = body.must_play || "";
  data.party_music.preferred_artists = body.preferred_artists || "";
  data.party_music.forbidden_songs = body.forbidden_songs || "";
  data.party_music.avoid_styles = body.avoid_styles || "";
  data.party_music.guest_requests = body.guest_requests || "";

  data.animation.level = body.animation_level || "";
  data.animation.activities = parseCheckboxList(body, "animation_activities");
  data.animation.comments = body.animation_comments || "";

  data.important_moments = MOMENT_KEYS.map((m) => ({
    key: m.key,
    label: m.label,
    active: yn(body[`moment_${m.key}_active`]),
    time: body[`moment_${m.key}_time`] || "",
    song: body[`moment_${m.key}_song`] || "",
    notes: body[`moment_${m.key}_notes`] || ""
  }));

  Object.assign(data.important_questions, {
    perfect_evening: body.perfect_evening || "",
    other_info: body.other_info || "",
    family_situations: body.family_situations || ""
  });

  Object.assign(data.day_contact, {
    name: body.day_contact_name || "",
    phone: body.day_contact_phone || "",
    email: body.day_contact_email || ""
  });

  data.client_plan = { steps: parseClientPlanSteps(body) };
  data.special_animation = parseSpecialAnimation(body);

  return data;
}

function mergeQuestionnaire(stored) {
  const base = defaultQuestionnaire();
  if (!stored || typeof stored !== "object") return base;

  const merged = { ...base, ...stored };
  merged.general = { ...base.general, ...(stored.general || {}) };
  merged.ceremony = { ...base.ceremony, ...(stored.ceremony || {}) };
  merged.couple_entrance = { ...base.couple_entrance, ...(stored.couple_entrance || {}) };
  merged.first_dance = { ...base.first_dance, ...(stored.first_dance || {}) };
  merged.special_dances = { ...base.special_dances, ...(stored.special_dances || {}) };
  merged.cocktail = { ...base.cocktail, ...(stored.cocktail || {}) };
  merged.dinner = { ...base.dinner, ...(stored.dinner || {}) };

  if (stored.cocktail_dinner) {
    const old = stored.cocktail_dinner;
    if (!stored.cocktail) {
      merged.cocktail = {
        ...merged.cocktail,
        cocktail_location: old.cocktail_location || "",
        cocktail_place: old.cocktail_place || "",
        cocktail_dj_distance: old.cocktail_dj_distance || "",
        styles: Array.isArray(old.styles) ? old.styles : [],
        requests: old.cocktail_requests || ""
      };
    }
    if (!stored.dinner) {
      merged.dinner = {
        ...merged.dinner,
        dinner_location: old.dinner_location || "",
        dinner_place: old.dinner_place || "",
        dinner_dj_distance: old.dinner_dj_distance || "",
        styles: Array.isArray(old.dinner_styles) ? old.dinner_styles : [],
        requests: old.dinner_requests || ""
      };
    }
  }

  merged.party_music = { ...base.party_music, ...(stored.party_music || {}) };
  merged.animation = { ...base.animation, ...(stored.animation || {}) };
  merged.important_questions = { ...base.important_questions, ...(stored.important_questions || {}) };
  merged.day_contact = { ...base.day_contact, ...(stored.day_contact || {}) };
  merged.client_plan = mergeClientPlan(stored.client_plan);
  merged.special_animation = mergeSpecialAnimation(stored.special_animation);

  if (Array.isArray(stored.important_moments)) {
    merged.important_moments = base.important_moments.map((item) => {
      const found = stored.important_moments.find((m) => m.key === item.key);
      return found ? { ...item, ...found } : item;
    });
  }

  if (Array.isArray(stored.party_music?.must_play)) {
    merged.party_music.must_play = stored.party_music.must_play
      .filter((song) => song.artist || song.title)
      .map((song) => {
        const artist = (song.artist || "").trim();
        const title = (song.title || "").trim();
        if (artist && title) return `${artist} — ${title}`;
        return artist || title;
      })
      .join("\n");
  } else if (typeof stored.party_music?.must_play !== "string") {
    merged.party_music.must_play = "";
  }

  return merged;
}

function getQuestionnaire(db, eventId) {
  const row = getQuestionnaireRow(db, eventId);
  if (!row) return { data: defaultQuestionnaire(), updated_at: null };

  try {
    return {
      data: mergeQuestionnaire(JSON.parse(row.data || "{}")),
      updated_at: row.updated_at
    };
  } catch {
    return { data: defaultQuestionnaire(), updated_at: row.updated_at };
  }
}

function saveQuestionnaire(db, eventId, data) {
  saveQuestionnaireRow(db, eventId, data);
}

function isQuestionnaireComplete(data) {
  if (data._completed) return true;

  const hasGeneral = Object.values(data.general || {}).some(Boolean);
  const hasFirstDance =
    data.first_dance?.enabled === "yes" &&
    (data.first_dance?.song || data.first_dance?.artist);
  const hasText = Object.values(data.important_questions || {}).some(
    (v) => v && String(v).trim().length > 20
  );

  return hasGeneral && (hasFirstDance || hasText);
}

function getQuestionnaireForEvent(db, eventId, eventType) {
  if (isWeddingEvent(eventType)) return getQuestionnaire(db, eventId);
  return getPartyQuestionnaire(db, eventId);
}

function bodyToQuestionnaireForEvent(body, eventType) {
  if (isWeddingEvent(eventType)) return bodyToQuestionnaire(body);
  return bodyToPartyQuestionnaire(body);
}

function saveQuestionnaireForEvent(db, eventId, eventType, data) {
  if (isWeddingEvent(eventType)) return saveQuestionnaire(db, eventId, data);
  return savePartyQuestionnaire(db, eventId, data);
}

function isQuestionnaireCompleteForEvent(data, eventType) {
  if (isWeddingEvent(eventType)) return isQuestionnaireComplete(data);
  return isPartyQuestionnaireComplete(data);
}

function getQuestionnaireLabel(eventType) {
  if (isWeddingEvent(eventType)) return "Questionnaire mariage";
  return `Questionnaire — ${eventType}`;
}

module.exports = {
  MOMENT_KEYS,
  COCKTAIL_STYLES,
  COCKTAIL_LOCATION_OPTIONS,
  PARTY_DECADES,
  ANIMATION_LEVELS,
  ANIMATION_ACTIVITIES,
  INVITE_GUESTS_OPTIONS,
  GUEST_REQUEST_OPTIONS,
  AGE_GROUPS,
  EVENING_THEME_OPTIONS,
  PARTY_GUEST_REQUEST_OPTIONS,
  defaultQuestionnaire,
  bodyToQuestionnaire,
  getQuestionnaire,
  saveQuestionnaire,
  isQuestionnaireComplete,
  getQuestionnaireForEvent,
  bodyToQuestionnaireForEvent,
  saveQuestionnaireForEvent,
  isQuestionnaireCompleteForEvent,
  isWeddingEvent,
  getQuestionnaireLabel
};
