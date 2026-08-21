const {
  parseCheckboxList,
  yn,
  getQuestionnaireRow,
  saveQuestionnaireRow,
  isWeddingEvent,
  PARTY_DECADES,
  ANIMATION_LEVELS,
  ANIMATION_ACTIVITIES,
  GUEST_REQUEST_OPTIONS
} = require("./questionnaire-shared");

const AGE_GROUPS = [
  "18-30 ans",
  "31-45 ans",
  "46-60 ans",
  "60 ans et +",
  "Tous âges"
];

const EVENING_THEME_OPTIONS = [
  "Country",
  "Croisière",
  "Chic / Oscar",
  "Autre"
];

const PARTY_MOMENT_KEYS = [
  { key: "welcome", label: "Accueil / cocktail" },
  { key: "dinner", label: "Repas / souper" },
  { key: "special_1", label: "Moment spécial 1" },
  { key: "special_2", label: "Moment spécial 2" },
  { key: "special_3", label: "Moment spécial 3" },
  { key: "dance_floor", label: "Ouverture du plancher" },
  { key: "last_song", label: "Dernière chanson" }
];

const PARTY_GUEST_REQUEST_OPTIONS = GUEST_REQUEST_OPTIONS.map((opt) =>
  opt.value === "ask_couple"
    ? { value: "ask_client", label: "Demander au client" }
    : opt
);

function defaultPartyQuestionnaire() {
  return {
    _formType: "party",
    _completed: false,
    general: {
      guest_arrival_time: "",
      party_start_time: "",
      expected_end_time: "",
      celebration_notes: "",
      age_groups: [],
      evening_themes: [],
      evening_theme_other: ""
    },
    schedule: {
      has_cocktail: "",
      cocktail_location: "",
      cocktail_place: "",
      cocktail_dj_distance: "",
      has_meal: "",
      speeches_planned: "",
      special_moments_notes: ""
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
    important_moments: PARTY_MOMENT_KEYS.map((m) => ({
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
      sensitive_situations: ""
    },
    day_contact: {
      name: "",
      phone: "",
      email: ""
    }
  };
}

function bodyToPartyQuestionnaire(body) {
  const data = defaultPartyQuestionnaire();
  data._completed = body._completed === "1";

  Object.assign(data.general, {
    guest_arrival_time: body.guest_arrival_time || "",
    party_start_time: body.party_start_time || "",
    expected_end_time: body.expected_end_time || "",
    celebration_notes: body.celebration_notes || ""
  });
  data.general.age_groups = parseCheckboxList(body, "age_groups");
  data.general.evening_themes = parseCheckboxList(body, "evening_themes");
  data.general.evening_theme_other = body.evening_theme_other || "";
  if (data.general.evening_theme_other && !data.general.evening_themes.includes("Autre")) {
    data.general.evening_themes.push("Autre");
  }

  Object.assign(data.schedule, {
    has_cocktail: yn(body.has_cocktail),
    cocktail_location: body.cocktail_location || "",
    cocktail_place: body.cocktail_place || "",
    cocktail_dj_distance: body.cocktail_dj_distance || "",
    has_meal: yn(body.has_meal),
    speeches_planned: yn(body.speeches_planned),
    special_moments_notes: body.special_moments_notes || ""
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

  data.important_moments = PARTY_MOMENT_KEYS.map((m) => ({
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
    sensitive_situations: body.sensitive_situations || ""
  });

  Object.assign(data.day_contact, {
    name: body.day_contact_name || "",
    phone: body.day_contact_phone || "",
    email: body.day_contact_email || ""
  });

  return data;
}

function mergePartyQuestionnaire(stored) {
  const base = defaultPartyQuestionnaire();
  if (!stored || typeof stored !== "object") return base;

  const merged = { ...base, ...stored };
  merged.general = { ...base.general, ...(stored.general || {}) };
  if (!Array.isArray(merged.general.evening_themes)) {
    merged.general.evening_themes = [];
  }
  if (typeof merged.general.evening_theme_other !== "string") {
    merged.general.evening_theme_other = "";
  }
  merged.schedule = { ...base.schedule, ...(stored.schedule || {}) };
  merged.party_music = { ...base.party_music, ...(stored.party_music || {}) };
  merged.animation = { ...base.animation, ...(stored.animation || {}) };
  merged.important_questions = {
    ...base.important_questions,
    ...(stored.important_questions || {})
  };
  merged.day_contact = { ...base.day_contact, ...(stored.day_contact || {}) };

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

function getPartyQuestionnaire(db, eventId) {
  const row = getQuestionnaireRow(db, eventId);
  if (!row) return { data: defaultPartyQuestionnaire(), updated_at: null };

  try {
    return {
      data: mergePartyQuestionnaire(JSON.parse(row.data || "{}")),
      updated_at: row.updated_at
    };
  } catch {
    return { data: defaultPartyQuestionnaire(), updated_at: row.updated_at };
  }
}

function savePartyQuestionnaire(db, eventId, data) {
  saveQuestionnaireRow(db, eventId, data);
}

function isPartyQuestionnaireComplete(data) {
  if (data._completed) return true;

  const hasSchedule =
    Object.values(data.schedule || {}).some(Boolean) ||
    Object.values(data.general || {}).some((v) =>
      Array.isArray(v) ? v.length > 0 : Boolean(v)
    );
  const hasMusic =
    (data.party_music?.decades || []).length > 0 ||
    Boolean(data.party_music?.must_play?.trim());
  const hasText = Object.values(data.important_questions || {}).some(
    (v) => v && String(v).trim().length > 15
  );

  return hasSchedule && (hasMusic || hasText);
}

module.exports = {
  AGE_GROUPS,
  EVENING_THEME_OPTIONS,
  PARTY_MOMENT_KEYS,
  PARTY_GUEST_REQUEST_OPTIONS,
  defaultPartyQuestionnaire,
  bodyToPartyQuestionnaire,
  getPartyQuestionnaire,
  savePartyQuestionnaire,
  isPartyQuestionnaireComplete,
  mergePartyQuestionnaire
};
