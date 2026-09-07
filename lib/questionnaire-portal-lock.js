const { isWeddingEvent } = require("./questionnaire-shared");

function hasText(value) {
  return value != null && String(value).trim() !== "";
}

function hasYn(value) {
  return value === "yes" || value === "no";
}

function checkboxItemKeys(groupName, values) {
  return (values || []).filter(Boolean).map((value) => `${groupName}:${value}`);
}

function computePartyDjLockedFields(data) {
  const locked = [];
  const g = data.general || {};
  const s = data.schedule || {};
  const pm = data.party_music || {};
  const anim = data.animation || {};
  const iq = data.important_questions || {};
  const dc = data.day_contact || {};
  const sa = data.special_animation || {};

  if (hasText(g.guest_arrival_time)) locked.push("guest_arrival_time");
  if (hasText(g.party_start_time)) locked.push("party_start_time");
  if (hasText(g.expected_end_time)) locked.push("expected_end_time");
  if (hasText(g.celebration_notes)) locked.push("celebration_notes");
  if (hasText(g.age_range)) locked.push("age_range");
  if (hasText(g.general_notes)) locked.push("general_notes");
  locked.push(...checkboxItemKeys("evening_themes", g.evening_themes));
  if (hasText(g.evening_theme_other)) locked.push("evening_theme_other");

  if (hasYn(s.has_cocktail)) locked.push("has_cocktail");
  if (hasText(s.cocktail_location)) locked.push("cocktail_location");
  if (hasText(s.cocktail_place)) locked.push("cocktail_place");
  if (hasText(s.cocktail_dj_distance)) locked.push("cocktail_dj_distance");
  if (hasYn(s.cocktail_equipment_provided)) locked.push("cocktail_equipment_provided");
  if (hasYn(s.has_meal)) locked.push("has_meal");
  if (hasText(s.meal_service_type)) locked.push("meal_service_type");
  if (hasYn(s.speeches_planned)) locked.push("speeches_planned");
  if (hasText(s.special_moments_notes)) locked.push("special_moments_notes");

  locked.push(...checkboxItemKeys("party_decades", pm.decades));
  if (hasText(pm.must_play)) locked.push("must_play");
  if (hasText(pm.preferred_artists)) locked.push("preferred_artists");
  if (hasText(pm.forbidden_songs)) locked.push("forbidden_songs");
  if (hasText(pm.avoid_styles)) locked.push("avoid_styles");
  if (hasText(pm.guest_requests)) locked.push("guest_requests");

  if (hasText(anim.level)) locked.push("animation_level");
  locked.push(...checkboxItemKeys("animation_activities", anim.activities));
  if (hasText(anim.comments)) locked.push("animation_comments");

  if (hasText(iq.perfect_evening)) locked.push("perfect_evening");
  if (hasText(iq.other_info)) locked.push("other_info");
  if (hasText(iq.sensitive_situations)) locked.push("sensitive_situations");

  if (hasText(dc.name)) locked.push("day_contact_name");
  if (hasText(dc.phone)) locked.push("day_contact_phone");
  if (hasText(dc.email)) locked.push("day_contact_email");

  if (hasText(sa.notes)) locked.push("special_animation_notes");

  for (const m of data.important_moments || []) {
    if (hasYn(m.active)) locked.push(`moment_${m.key}_active`);
    if (hasText(m.time)) locked.push(`moment_${m.key}_time`);
    if (hasText(m.song)) locked.push(`moment_${m.key}_song`);
    if (hasText(m.notes)) locked.push(`moment_${m.key}_notes`);
  }

  return [...new Set(locked)];
}

function lockWeddingObjectFields(prefix, obj, locked, options = {}) {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    const fieldName = `${prefix}${prefix ? "_" : ""}${key}`;
    if (options.ynKeys?.includes(key)) {
      if (hasYn(value)) locked.push(fieldName);
      continue;
    }
    if (options.boolKeys?.includes(key)) {
      if (value === true) locked.push(fieldName);
      continue;
    }
    if (Array.isArray(value)) {
      locked.push(...checkboxItemKeys(fieldName.replace(/_styles$/, "_styles"), value));
      continue;
    }
    if (hasText(value)) locked.push(fieldName);
  }
}

function computeWeddingDjLockedFields(data) {
  const locked = [];
  const g = data.general || {};
  const ceremony = data.ceremony || {};
  const ce = data.couple_entrance || {};
  const fd = data.first_dance || {};
  const sd = data.special_dances || {};
  const cocktail = data.cocktail || {};
  const dinner = data.dinner || {};
  const pm = data.party_music || {};
  const anim = data.animation || {};
  const iq = data.important_questions || {};
  const dc = data.day_contact || {};
  const sa = data.special_animation || {};

  if (hasText(g.guest_arrival_time)) locked.push("guest_arrival_time");
  if (hasText(g.couple_entrance_time)) locked.push("couple_entrance_time");
  if (hasText(g.dinner_time)) locked.push("dinner_time");
  if (hasText(g.first_dance_approx_time)) locked.push("first_dance_approx_time");
  if (hasText(g.party_start_time)) locked.push("party_start_time");
  if (hasText(g.expected_end_time)) locked.push("expected_end_time");
  if (hasText(g.general_notes)) locked.push("general_notes");

  if (hasText(ceremony.ceremony_room)) locked.push("ceremony_room");
  if (hasText(ceremony.ceremony_place) || hasText(ceremony.location)) locked.push("ceremony_place");
  if (hasText(ceremony.start_time)) locked.push("ceremony_start_time");
  if (hasText(ceremony.end_time)) locked.push("ceremony_end_time");
  if (hasYn(ceremony.equipment_provided)) locked.push("ceremony_equipment_provided");
  if (hasYn(ceremony.sound_provided)) locked.push("ceremony_sound_provided");

  if (hasYn(ce.official_entrance)) locked.push("official_entrance");
  if (hasYn(ce.procession_entrance)) locked.push("procession_entrance");
  if (hasText(ce.procession_song)) locked.push("procession_song");
  if (hasText(ce.procession_spotify)) locked.push("procession_spotify");
  if (ce.procession_confirmed) locked.push("procession_confirmed");
  if (hasText(ce.groomsmen_before_song)) locked.push("groomsmen_before_song");
  if (hasText(ce.groomsmen_before_spotify)) locked.push("groomsmen_before_spotify");
  if (ce.groomsmen_before_confirmed) locked.push("groomsmen_before_confirmed");
  if (hasText(ce.bridesmaids_song)) locked.push("bridesmaids_song");
  if (hasText(ce.bridesmaids_spotify)) locked.push("bridesmaids_spotify");
  if (ce.bridesmaids_confirmed) locked.push("bridesmaids_confirmed");
  if (hasText(ce.groomsmen_song)) locked.push("groomsmen_song");
  if (hasText(ce.groomsmen_spotify)) locked.push("groomsmen_spotify");
  if (ce.groomsmen_confirmed) locked.push("groomsmen_confirmed");
  if (hasText(ce.groomsmen_notes)) locked.push("groomsmen_notes");
  if (hasText(ce.bridesmaids_notes)) locked.push("bridesmaids_notes");
  if (hasText(ce.couple_entrance_song)) locked.push("couple_entrance_song");
  if (hasText(ce.couple_entrance_spotify)) locked.push("couple_entrance_spotify");
  if (ce.couple_entrance_confirmed) locked.push("couple_entrance_confirmed");
  if (hasText(ce.couple_entrance_notes)) locked.push("couple_entrance_notes");

  if (hasYn(fd.enabled)) locked.push("first_dance_enabled");
  if (hasText(fd.artist)) locked.push("first_dance_artist");
  if (hasText(fd.song)) locked.push("first_dance_song");
  if (hasText(fd.spotify)) locked.push("first_dance_spotify");
  if (fd.confirmed) locked.push("first_dance_confirmed");
  if (hasYn(fd.dj_announces)) locked.push("first_dance_dj_announces");
  if (hasText(fd.invite_guests)) locked.push("first_dance_invite_guests");

  if (hasYn(sd.father_daughter_enabled)) locked.push("father_daughter_enabled");
  if (hasText(sd.father_daughter_song)) locked.push("father_daughter_song");
  if (hasYn(sd.mother_son_enabled)) locked.push("mother_son_enabled");
  if (hasText(sd.mother_son_song)) locked.push("mother_son_song");
  if (hasText(sd.other_people)) locked.push("other_dance_people");
  if (hasText(sd.other_song)) locked.push("other_dance_song");

  locked.push(...checkboxItemKeys("cocktail_styles", cocktail.styles));
  if (hasText(cocktail.cocktail_location)) locked.push("cocktail_location");
  if (hasText(cocktail.cocktail_place)) locked.push("cocktail_place");
  if (hasText(cocktail.cocktail_dj_distance)) locked.push("cocktail_dj_distance");
  if (hasYn(cocktail.equipment_provided)) locked.push("cocktail_equipment_provided");
  if (hasText(cocktail.requests)) locked.push("cocktail_requests");

  locked.push(...checkboxItemKeys("dinner_styles", dinner.styles));
  if (hasText(dinner.dinner_location)) locked.push("dinner_location");
  if (hasText(dinner.dinner_place)) locked.push("dinner_place");
  if (hasText(dinner.dinner_dj_distance)) locked.push("dinner_dj_distance");
  if (hasText(dinner.service_type)) locked.push("dinner_service_type");
  if (hasText(dinner.requests)) locked.push("dinner_requests");

  locked.push(...checkboxItemKeys("party_decades", pm.decades));
  if (hasText(pm.must_play)) locked.push("must_play");
  if (hasText(pm.preferred_artists)) locked.push("preferred_artists");
  if (hasText(pm.forbidden_songs)) locked.push("forbidden_songs");
  if (hasText(pm.avoid_styles)) locked.push("avoid_styles");
  if (hasText(pm.guest_requests)) locked.push("guest_requests");

  if (hasText(anim.level)) locked.push("animation_level");
  locked.push(...checkboxItemKeys("animation_activities", anim.activities));
  if (hasText(anim.comments)) locked.push("animation_comments");

  if (hasText(iq.perfect_evening)) locked.push("perfect_evening");
  if (hasText(iq.other_info)) locked.push("other_info");
  if (hasText(iq.family_situations)) locked.push("family_situations");

  if (hasText(dc.name)) locked.push("day_contact_name");
  if (hasText(dc.phone)) locked.push("day_contact_phone");
  if (hasText(dc.email)) locked.push("day_contact_email");

  if (hasText(sa.notes)) locked.push("special_animation_notes");

  for (const m of data.important_moments || []) {
    if (hasYn(m.active)) locked.push(`moment_${m.key}_active`);
    if (hasText(m.time)) locked.push(`moment_${m.key}_time`);
    if (hasText(m.song)) locked.push(`moment_${m.key}_song`);
    if (hasText(m.notes)) locked.push(`moment_${m.key}_notes`);
  }

  return [...new Set(locked)];
}

function computeDjLockedFields(data, eventType) {
  if (!data || typeof data !== "object") return [];
  if (isWeddingEvent(eventType) || data._formType === "wedding") {
    return computeWeddingDjLockedFields(data);
  }
  return computePartyDjLockedFields(data);
}

function getDjLockedFields(data, eventType) {
  if (Array.isArray(data?._dj_locked_fields) && data._dj_locked_fields.length) {
    return data._dj_locked_fields;
  }
  return computeDjLockedFields(data, eventType);
}

function stampDjLockedFields(data, eventType) {
  data._dj_locked_fields = computeDjLockedFields(data, eventType);
  return data;
}

function mergeCheckboxValues(groupName, lockedFields, existingValues, incomingValues) {
  const lockedSet = new Set(
    lockedFields
      .filter((key) => key.startsWith(`${groupName}:`))
      .map((key) => key.slice(groupName.length + 1))
  );
  if (!lockedSet.size) return incomingValues || [];

  const existing = existingValues || [];
  const incoming = incomingValues || [];
  const preserved = existing.filter((value) => lockedSet.has(value));
  const unlockedIncoming = incoming.filter((value) => !lockedSet.has(value));
  return [...new Set([...preserved, ...unlockedIncoming])];
}

function copyScalar(target, source, path, value) {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!node[parts[i]] || typeof node[parts[i]] !== "object") {
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function getScalar(source, path) {
  const parts = path.split(".");
  let node = source;
  for (const part of parts) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
}

const PARTY_SCALAR_LOCKS = {
  guest_arrival_time: "general.guest_arrival_time",
  party_start_time: "general.party_start_time",
  expected_end_time: "general.expected_end_time",
  celebration_notes: "general.celebration_notes",
  age_range: "general.age_range",
  general_notes: "general.general_notes",
  evening_theme_other: "general.evening_theme_other",
  has_cocktail: "schedule.has_cocktail",
  cocktail_location: "schedule.cocktail_location",
  cocktail_place: "schedule.cocktail_place",
  cocktail_dj_distance: "schedule.cocktail_dj_distance",
  cocktail_equipment_provided: "schedule.cocktail_equipment_provided",
  has_meal: "schedule.has_meal",
  meal_service_type: "schedule.meal_service_type",
  speeches_planned: "schedule.speeches_planned",
  special_moments_notes: "schedule.special_moments_notes",
  must_play: "party_music.must_play",
  preferred_artists: "party_music.preferred_artists",
  forbidden_songs: "party_music.forbidden_songs",
  avoid_styles: "party_music.avoid_styles",
  guest_requests: "party_music.guest_requests",
  animation_level: "animation.level",
  animation_comments: "animation.comments",
  perfect_evening: "important_questions.perfect_evening",
  other_info: "important_questions.other_info",
  sensitive_situations: "important_questions.sensitive_situations",
  day_contact_name: "day_contact.name",
  day_contact_phone: "day_contact.phone",
  day_contact_email: "day_contact.email",
  special_animation_notes: "special_animation.notes"
};

const WEDDING_SCALAR_LOCKS = {
  ...PARTY_SCALAR_LOCKS,
  sensitive_situations: undefined,
  couple_entrance_time: "general.couple_entrance_time",
  dinner_time: "general.dinner_time",
  first_dance_approx_time: "general.first_dance_approx_time",
  ceremony_room: "ceremony.ceremony_room",
  ceremony_place: "ceremony.ceremony_place",
  ceremony_start_time: "ceremony.start_time",
  ceremony_end_time: "ceremony.end_time",
  ceremony_equipment_provided: "ceremony.equipment_provided",
  ceremony_sound_provided: "ceremony.sound_provided",
  official_entrance: "couple_entrance.official_entrance",
  procession_entrance: "couple_entrance.procession_entrance",
  procession_song: "couple_entrance.procession_song",
  procession_spotify: "couple_entrance.procession_spotify",
  groomsmen_before_song: "couple_entrance.groomsmen_before_song",
  groomsmen_before_spotify: "couple_entrance.groomsmen_before_spotify",
  bridesmaids_song: "couple_entrance.bridesmaids_song",
  bridesmaids_spotify: "couple_entrance.bridesmaids_spotify",
  groomsmen_song: "couple_entrance.groomsmen_song",
  groomsmen_spotify: "couple_entrance.groomsmen_spotify",
  groomsmen_notes: "couple_entrance.groomsmen_notes",
  bridesmaids_notes: "couple_entrance.bridesmaids_notes",
  couple_entrance_song: "couple_entrance.couple_entrance_song",
  couple_entrance_spotify: "couple_entrance.couple_entrance_spotify",
  couple_entrance_notes: "couple_entrance.couple_entrance_notes",
  first_dance_enabled: "first_dance.enabled",
  first_dance_artist: "first_dance.artist",
  first_dance_song: "first_dance.song",
  first_dance_spotify: "first_dance.spotify",
  first_dance_dj_announces: "first_dance.dj_announces",
  first_dance_invite_guests: "first_dance.invite_guests",
  father_daughter_enabled: "special_dances.father_daughter_enabled",
  father_daughter_song: "special_dances.father_daughter_song",
  mother_son_enabled: "special_dances.mother_son_enabled",
  mother_son_song: "special_dances.mother_son_song",
  other_dance_people: "special_dances.other_people",
  other_dance_song: "special_dances.other_song",
  cocktail_location: "cocktail.cocktail_location",
  cocktail_place: "cocktail.cocktail_place",
  cocktail_dj_distance: "cocktail.cocktail_dj_distance",
  cocktail_equipment_provided: "cocktail.equipment_provided",
  cocktail_requests: "cocktail.requests",
  dinner_location: "dinner.dinner_location",
  dinner_place: "dinner.dinner_place",
  dinner_dj_distance: "dinner.dinner_dj_distance",
  dinner_service_type: "dinner.service_type",
  dinner_requests: "dinner.requests",
  family_situations: "important_questions.family_situations"
};

const BOOL_LOCK_PATHS = {
  procession_confirmed: "couple_entrance.procession_confirmed",
  groomsmen_before_confirmed: "couple_entrance.groomsmen_before_confirmed",
  bridesmaids_confirmed: "couple_entrance.bridesmaids_confirmed",
  groomsmen_confirmed: "couple_entrance.groomsmen_confirmed",
  couple_entrance_confirmed: "couple_entrance.couple_entrance_confirmed",
  first_dance_confirmed: "first_dance.confirmed"
};

function mergePartyQuestionnaireWithLocks(existing, incoming, lockedFields) {
  const out = JSON.parse(JSON.stringify(incoming));
  const locked = lockedFields || [];

  for (const [field, path] of Object.entries(PARTY_SCALAR_LOCKS)) {
    if (!path || !locked.includes(field)) continue;
    copyScalar(out, existing, path, getScalar(existing, path));
  }

  out.general.evening_themes = mergeCheckboxValues(
    "evening_themes",
    locked,
    existing.general?.evening_themes,
    incoming.general?.evening_themes
  );
  out.party_music.decades = mergeCheckboxValues(
    "party_decades",
    locked,
    existing.party_music?.decades,
    incoming.party_music?.decades
  );
  out.animation.activities = mergeCheckboxValues(
    "animation_activities",
    locked,
    existing.animation?.activities,
    incoming.animation?.activities
  );

  out.important_moments = (out.important_moments || []).map((moment) => {
    const existingMoment = (existing.important_moments || []).find((m) => m.key === moment.key);
    if (!existingMoment) return moment;
    const merged = { ...moment };
    for (const suffix of ["active", "time", "song", "notes"]) {
      const field = `moment_${moment.key}_${suffix}`;
      if (locked.includes(field)) {
        merged[suffix] = existingMoment[suffix];
      }
    }
    return merged;
  });

  out._dj_locked_fields = locked;
  out._formType = incoming._formType || existing._formType || "party";
  return out;
}

function mergeWeddingQuestionnaireWithLocks(existing, incoming, lockedFields) {
  const out = JSON.parse(JSON.stringify(incoming));
  const locked = lockedFields || [];

  for (const [field, path] of Object.entries(WEDDING_SCALAR_LOCKS)) {
    if (!path || !locked.includes(field)) continue;
    copyScalar(out, existing, path, getScalar(existing, path));
  }

  for (const [field, path] of Object.entries(BOOL_LOCK_PATHS)) {
    if (!locked.includes(field)) continue;
    copyScalar(out, existing, path, getScalar(existing, path));
  }

  out.cocktail.styles = mergeCheckboxValues(
    "cocktail_styles",
    locked,
    existing.cocktail?.styles,
    incoming.cocktail?.styles
  );
  out.dinner.styles = mergeCheckboxValues(
    "dinner_styles",
    locked,
    existing.dinner?.styles,
    incoming.dinner?.styles
  );
  out.party_music.decades = mergeCheckboxValues(
    "party_decades",
    locked,
    existing.party_music?.decades,
    incoming.party_music?.decades
  );
  out.animation.activities = mergeCheckboxValues(
    "animation_activities",
    locked,
    existing.animation?.activities,
    incoming.animation?.activities
  );

  out.important_moments = (out.important_moments || []).map((moment) => {
    const existingMoment = (existing.important_moments || []).find((m) => m.key === moment.key);
    if (!existingMoment) return moment;
    const merged = { ...moment };
    for (const suffix of ["active", "time", "song", "notes"]) {
      const field = `moment_${moment.key}_${suffix}`;
      if (locked.includes(field)) {
        merged[suffix] = existingMoment[suffix];
      }
    }
    return merged;
  });

  out._dj_locked_fields = locked;
  out._formType = incoming._formType || existing._formType || "wedding";
  return out;
}

function mergePortalQuestionnaire(existing, incoming, eventType) {
  const locked = getDjLockedFields(existing, eventType);
  if (isWeddingEvent(eventType) || existing._formType === "wedding") {
    return mergeWeddingQuestionnaireWithLocks(existing, incoming, locked);
  }
  return mergePartyQuestionnaireWithLocks(existing, incoming, locked);
}

module.exports = {
  computeDjLockedFields,
  getDjLockedFields,
  stampDjLockedFields,
  mergePortalQuestionnaire
};
