const { MOMENT_KEYS } = require("./questionnaire");
const { PARTY_MOMENT_KEYS } = require("./party-questionnaire");
const { isWeddingEvent } = require("./questionnaire-shared");

function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return !String(value ?? "").trim();
}

function shouldSkipField(name, q, wedding) {
  if (!name || name === "_completed") return true;
  if (name.endsWith("_confirmed") || name.endsWith("_spotify")) return true;
  if (/^moment_.+_(time|song|notes)$/.test(name)) return true;
  if (name.endsWith("_notes")) return true;

  if (
    name.startsWith("first_dance_") &&
    !["first_dance_enabled", "first_dance_approx_time"].includes(name)
  ) {
    if (q.first_dance?.enabled === "no") return true;
  }
  if (name === "first_dance_dj_announces" && q.first_dance?.enabled === "no") return true;

  if (name.startsWith("father_daughter_") && name !== "father_daughter_enabled") {
    if (q.special_dances?.father_daughter_enabled === "no") return true;
  }
  if (name.startsWith("mother_son_") && name !== "mother_son_enabled") {
    if (q.special_dances?.mother_son_enabled === "no") return true;
  }

  if (!wedding && ["cocktail_location", "cocktail_place", "cocktail_dj_distance"].includes(name)) {
    if (q.schedule?.has_cocktail === "no") return true;
  }

  if (name === "evening_theme_other") {
    const themes = q.general?.evening_themes || [];
    if (!themes.includes("Autre")) return true;
  }

  return false;
}

function pushIfMissing(list, q, wedding, section, label, fieldName, empty) {
  if (!empty || shouldSkipField(fieldName, q, wedding)) return;
  list.push({ section, label, fieldName });
}

function checkText(list, q, wedding, section, label, fieldName, value) {
  pushIfMissing(list, q, wedding, section, label, fieldName, isEmpty(value));
}

function checkRadio(list, q, wedding, section, label, fieldName, value) {
  pushIfMissing(list, q, wedding, section, label, fieldName, value !== "yes" && value !== "no");
}

function checkMomentActive(list, q, wedding, section, label, fieldName, active) {
  pushIfMissing(list, q, wedding, section, label, fieldName, active !== "yes" && active !== "no");
}

function checkCheckboxGroup(list, q, wedding, section, label, fieldName, values) {
  pushIfMissing(list, q, wedding, section, label, fieldName, isEmpty(values));
}

function getWeddingMissingFields(q) {
  const items = [];
  const wedding = true;
  const g = q.general || {};
  const ceremony = q.ceremony || {};
  const ce = q.couple_entrance || {};
  const fd = q.first_dance || {};
  const sd = q.special_dances || {};
  const cd = q.cocktail || {};
  const dn = q.dinner || {};
  const pm = q.party_music || {};
  const anim = q.animation || {};
  const iq = q.important_questions || {};
  const dc = q.day_contact || {};

  checkText(items, q, wedding, "Informations générales", "Heure entrée des invités en salle", "guest_arrival_time", g.guest_arrival_time);
  checkText(items, q, wedding, "Informations générales", "Heure entrée des mariés", "couple_entrance_time", g.couple_entrance_time);
  checkText(items, q, wedding, "Informations générales", "Heure souper", "dinner_time", g.dinner_time);
  checkText(items, q, wedding, "Informations générales", "Heure approx. première danse", "first_dance_approx_time", g.first_dance_approx_time);
  checkText(items, q, wedding, "Informations générales", "Heure début du party", "party_start_time", g.party_start_time);

  checkText(items, q, wedding, "Contact jour J", "Nom", "day_contact_name", dc.name);
  checkText(items, q, wedding, "Contact jour J", "Téléphone", "day_contact_phone", dc.phone);
  checkText(items, q, wedding, "Contact jour J", "Courriel", "day_contact_email", dc.email);

  checkText(items, q, wedding, "Cérémonie", "Endroit", "ceremony_location", ceremony.location);
  checkText(items, q, wedding, "Cérémonie", "Heure de début", "ceremony_start_time", ceremony.start_time);
  checkText(items, q, wedding, "Cérémonie", "Heure de fin", "ceremony_end_time", ceremony.end_time);

  checkRadio(items, q, wedding, "Entrée", "Entrée officielle des mariés", "official_entrance", ce.official_entrance);
  checkText(items, q, wedding, "Entrée", "Garçons d'honneur — chanson", "groomsmen_song", ce.groomsmen_song);
  checkText(items, q, wedding, "Entrée", "Demoiselles d'honneur — chanson", "bridesmaids_song", ce.bridesmaids_song);
  checkText(items, q, wedding, "Entrée", "Entrée des mariés — chanson", "couple_entrance_song", ce.couple_entrance_song);

  checkRadio(items, q, wedding, "Première danse", "Première danse", "first_dance_enabled", fd.enabled);
  checkRadio(items, q, wedding, "Première danse", "DJ doit annoncer la danse", "first_dance_dj_announces", fd.dj_announces);
  checkText(items, q, wedding, "Première danse", "Artiste", "first_dance_artist", fd.artist);
  checkText(items, q, wedding, "Première danse", "Chanson", "first_dance_song", fd.song);
  checkText(items, q, wedding, "Première danse", "Quand inviter les invités", "first_dance_invite_guests", fd.invite_guests);

  checkRadio(items, q, wedding, "Danses spéciales", "Danse père / fille", "father_daughter_enabled", sd.father_daughter_enabled);
  checkText(items, q, wedding, "Danses spéciales", "Danse père / fille — chanson", "father_daughter_song", sd.father_daughter_song);
  checkRadio(items, q, wedding, "Danses spéciales", "Danse mère / fils", "mother_son_enabled", sd.mother_son_enabled);
  checkText(items, q, wedding, "Danses spéciales", "Danse mère / fils — chanson", "mother_son_song", sd.mother_son_song);
  checkText(items, q, wedding, "Danses spéciales", "Autre danse — personnes", "other_dance_people", sd.other_people);
  checkText(items, q, wedding, "Danses spéciales", "Autre danse — chanson", "other_dance_song", sd.other_song);

  checkRadio(items, q, wedding, "Cocktail", "Emplacement", "cocktail_location", cd.cocktail_location);
  checkText(items, q, wedding, "Cocktail", "Lieu / endroit", "cocktail_place", cd.cocktail_place);
  checkText(items, q, wedding, "Cocktail", "Distance du DJ", "cocktail_dj_distance", cd.cocktail_dj_distance);
  checkCheckboxGroup(items, q, wedding, "Cocktail", "Styles désirés", "cocktail_styles", cd.styles);
  checkText(items, q, wedding, "Cocktail", "Demandes spéciales", "cocktail_requests", cd.requests);

  checkRadio(items, q, wedding, "Repas", "Emplacement", "dinner_location", dn.dinner_location);
  checkText(items, q, wedding, "Repas", "Lieu / endroit", "dinner_place", dn.dinner_place);
  checkText(items, q, wedding, "Repas", "Distance du DJ", "dinner_dj_distance", dn.dinner_dj_distance);
  checkCheckboxGroup(items, q, wedding, "Repas", "Styles désirés", "dinner_styles", dn.styles);
  checkText(items, q, wedding, "Repas", "Demandes spéciales", "dinner_requests", dn.requests);

  checkCheckboxGroup(items, q, wedding, "Musique de soirée", "Styles / décennies", "party_decades", pm.decades);
  checkText(items, q, wedding, "Musique de soirée", "Chansons incontournables", "must_play", pm.must_play);
  checkText(items, q, wedding, "Musique de soirée", "Artistes préférés", "preferred_artists", pm.preferred_artists);
  checkText(items, q, wedding, "Musique de soirée", "Chansons interdites", "forbidden_songs", pm.forbidden_songs);
  checkText(items, q, wedding, "Musique de soirée", "Styles à éviter", "avoid_styles", pm.avoid_styles);
  checkText(items, q, wedding, "Musique de soirée", "Demandes des invités", "guest_requests", pm.guest_requests);

  checkText(items, q, wedding, "Animation", "Niveau désiré", "animation_level", anim.level);
  checkCheckboxGroup(items, q, wedding, "Animation", "Activités désirées", "animation_activities", anim.activities);
  checkText(items, q, wedding, "Animation", "Commentaires", "animation_comments", anim.comments);

  for (const moment of MOMENT_KEYS) {
    const row = (q.important_moments || []).find((m) => m.key === moment.key) || {};
    checkMomentActive(
      items,
      q,
      wedding,
      "Moments importants",
      `${moment.label} — actif`,
      `moment_${moment.key}_active`,
      row.active
    );
  }

  checkText(items, q, wedding, "Questions importantes", "Soirée parfaite", "perfect_evening", iq.perfect_evening);
  checkText(items, q, wedding, "Questions importantes", "Autres informations", "other_info", iq.other_info);
  checkText(items, q, wedding, "Questions importantes", "Situations familiales", "family_situations", iq.family_situations);

  return items;
}

function getPartyMissingFields(q) {
  const items = [];
  const wedding = false;
  const g = q.general || {};
  const sch = q.schedule || {};
  const pm = q.party_music || {};
  const anim = q.animation || {};
  const iq = q.important_questions || {};
  const dc = q.day_contact || {};

  checkText(items, q, wedding, "Informations générales", "Heure entrée des invités en salle", "guest_arrival_time", g.guest_arrival_time);
  checkText(items, q, wedding, "Informations générales", "Heure début du party", "party_start_time", g.party_start_time);
  checkText(items, q, wedding, "Informations générales", "Heure de fin prévue", "expected_end_time", g.expected_end_time);
  checkText(items, q, wedding, "Informations générales", "Notes sur la célébration", "celebration_notes", g.celebration_notes);
  checkCheckboxGroup(items, q, wedding, "Informations générales", "Tranche d'âge des invités", "age_groups", g.age_groups);
  checkCheckboxGroup(items, q, wedding, "Informations générales", "Thème pour la soirée", "evening_themes", g.evening_themes);
  checkText(items, q, wedding, "Informations générales", "Thème — précisions (Autre)", "evening_theme_other", g.evening_theme_other);

  checkText(items, q, wedding, "Contact jour J", "Nom", "day_contact_name", dc.name);
  checkText(items, q, wedding, "Contact jour J", "Téléphone", "day_contact_phone", dc.phone);
  checkText(items, q, wedding, "Contact jour J", "Courriel", "day_contact_email", dc.email);

  checkRadio(items, q, wedding, "Déroulement", "Cocktail / accueil", "has_cocktail", sch.has_cocktail);
  checkRadio(items, q, wedding, "Déroulement", "Repas / souper", "has_meal", sch.has_meal);
  checkRadio(items, q, wedding, "Déroulement", "Discours / annonces prévus", "speeches_planned", sch.speeches_planned);
  checkRadio(items, q, wedding, "Déroulement", "Cocktail — emplacement", "cocktail_location", sch.cocktail_location);
  checkText(items, q, wedding, "Déroulement", "Lieu / endroit", "cocktail_place", sch.cocktail_place);
  checkText(items, q, wedding, "Déroulement", "Distance du DJ au cocktail", "cocktail_dj_distance", sch.cocktail_dj_distance);
  checkText(items, q, wedding, "Déroulement", "Moments spéciaux à prévoir", "special_moments_notes", sch.special_moments_notes);

  checkCheckboxGroup(items, q, wedding, "Musique de soirée", "Styles / décennies", "party_decades", pm.decades);
  checkText(items, q, wedding, "Musique de soirée", "Chansons incontournables", "must_play", pm.must_play);
  checkText(items, q, wedding, "Musique de soirée", "Artistes préférés", "preferred_artists", pm.preferred_artists);
  checkText(items, q, wedding, "Musique de soirée", "Chansons interdites", "forbidden_songs", pm.forbidden_songs);
  checkText(items, q, wedding, "Musique de soirée", "Styles à éviter", "avoid_styles", pm.avoid_styles);
  checkText(items, q, wedding, "Musique de soirée", "Demandes des invités", "guest_requests", pm.guest_requests);

  checkText(items, q, wedding, "Animation", "Niveau désiré", "animation_level", anim.level);
  checkCheckboxGroup(items, q, wedding, "Animation", "Activités désirées", "animation_activities", anim.activities);
  checkText(items, q, wedding, "Animation", "Commentaires", "animation_comments", anim.comments);

  for (const moment of PARTY_MOMENT_KEYS) {
    const row = (q.important_moments || []).find((m) => m.key === moment.key) || {};
    checkMomentActive(
      items,
      q,
      wedding,
      "Moments importants",
      `${moment.label} — actif`,
      `moment_${moment.key}_active`,
      row.active
    );
  }

  checkText(items, q, wedding, "Questions importantes", "Soirée parfaite", "perfect_evening", iq.perfect_evening);
  checkText(items, q, wedding, "Questions importantes", "Autres informations", "other_info", iq.other_info);
  checkText(
    items,
    q,
    wedding,
    "Questions importantes",
    "Situations particulières à éviter",
    "sensitive_situations",
    iq.sensitive_situations
  );

  return items;
}

function groupMissingBySection(items) {
  const sections = [];
  const index = new Map();

  for (const item of items) {
    if (!index.has(item.section)) {
      const group = { section: item.section, items: [] };
      index.set(item.section, group);
      sections.push(group);
    }
    index.get(item.section).items.push(item);
  }

  return sections;
}

function getQuestionnaireMissing(eventType, questionnaireData) {
  const items = isWeddingEvent(eventType)
    ? getWeddingMissingFields(questionnaireData)
    : getPartyMissingFields(questionnaireData);

  return {
    count: items.length,
    sections: groupMissingBySection(items),
    allDone: items.length === 0
  };
}

module.exports = {
  getQuestionnaireMissing,
  getWeddingMissingFields,
  getPartyMissingFields
};
