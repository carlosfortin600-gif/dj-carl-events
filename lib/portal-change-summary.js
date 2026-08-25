const { formatTime } = require("./helpers");
const { isWeddingEvent, ANIMATION_LEVELS } = require("./questionnaire-shared");

const MAX_CHANGES = 20;

function norm(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => norm(item))
      .filter(Boolean)
      .sort()
      .join("|");
  }
  if (value === true || value === "1") return "yes";
  if (value === false || value === "0") return "no";
  return String(value ?? "").trim();
}

function displayValue(value, fieldKey = "") {
  if (value === "yes") return "Oui";
  if (value === "no") return "Non";
  if (Array.isArray(value)) {
    const items = value.filter(Boolean);
    return items.length ? items.join(", ") : "—";
  }
  if (fieldKey === "animation.level") {
    const match = ANIMATION_LEVELS.find((opt) => opt.value === value);
    if (match) return match.label;
  }
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}

function compareField(changes, section, label, beforeValue, afterValue) {
  if (norm(beforeValue) === norm(afterValue)) return;
  changes.push({
    section,
    label,
    before: displayValue(beforeValue),
    after: displayValue(afterValue)
  });
}

function compareObjectFields(changes, section, beforeObj, afterObj, fields) {
  for (const field of fields) {
    compareField(
      changes,
      section,
      field.label,
      beforeObj?.[field.key],
      afterObj?.[field.key]
    );
  }
}

function weddingQuestionnaireFields() {
  return [
    {
      section: "Informations générales",
      before: (q) => q.general,
      after: (q) => q.general,
      fields: [
        { key: "guest_arrival_time", label: "Heure entrée invités" },
        { key: "couple_entrance_time", label: "Heure entrée mariés" },
        { key: "dinner_time", label: "Heure souper" },
        { key: "first_dance_approx_time", label: "Heure approx. première danse" },
        { key: "party_start_time", label: "Heure début du party" }
      ]
    },
    {
      section: "Contact jour J",
      before: (q) => q.day_contact,
      after: (q) => q.day_contact,
      fields: [
        { key: "name", label: "Nom" },
        { key: "phone", label: "Téléphone" },
        { key: "email", label: "Courriel" }
      ]
    },
    {
      section: "Cérémonie",
      before: (q) => q.ceremony,
      after: (q) => q.ceremony,
      fields: [
        { key: "location", label: "Endroit" },
        { key: "start_time", label: "Heure de début" },
        { key: "end_time", label: "Heure de fin" }
      ]
    },
    {
      section: "Entrée",
      before: (q) => q.couple_entrance,
      after: (q) => q.couple_entrance,
      fields: [
        { key: "official_entrance", label: "Entrée officielle" },
        { key: "groomsmen_song", label: "Chanson garçons d'honneur" },
        { key: "bridesmaids_song", label: "Chanson demoiselles" },
        { key: "couple_entrance_song", label: "Chanson entrée mariés" }
      ]
    },
    {
      section: "Première danse",
      before: (q) => q.first_dance,
      after: (q) => q.first_dance,
      fields: [
        { key: "enabled", label: "Première danse" },
        { key: "artist", label: "Artiste" },
        { key: "song", label: "Chanson" },
        { key: "dj_announces", label: "Annonce DJ" },
        { key: "invite_guests", label: "Inviter les invités" }
      ]
    },
    {
      section: "Danses spéciales",
      before: (q) => q.special_dances,
      after: (q) => q.special_dances,
      fields: [
        { key: "father_daughter_enabled", label: "Danse père/fille" },
        { key: "father_daughter_song", label: "Chanson père/fille" },
        { key: "mother_son_enabled", label: "Danse mère/fils" },
        { key: "mother_son_song", label: "Chanson mère/fils" },
        { key: "other_people", label: "Autre danse — personnes" },
        { key: "other_song", label: "Autre danse — chanson" }
      ]
    },
    {
      section: "Cocktail",
      before: (q) => q.cocktail,
      after: (q) => q.cocktail,
      fields: [
        { key: "styles", label: "Styles de musique" },
        { key: "cocktail_location", label: "Lieu" },
        { key: "requests", label: "Commentaires" }
      ]
    },
    {
      section: "Repas",
      before: (q) => q.dinner,
      after: (q) => q.dinner,
      fields: [
        { key: "styles", label: "Styles de musique" },
        { key: "requests", label: "Commentaires" }
      ]
    },
    {
      section: "Musique de soirée",
      before: (q) => q.party_music,
      after: (q) => q.party_music,
      fields: [
        { key: "decades", label: "Décennies" },
        { key: "must_play", label: "À jouer absolument" },
        { key: "preferred_artists", label: "Artistes préférés" },
        { key: "forbidden_songs", label: "Chansons interdites" },
        { key: "avoid_styles", label: "Styles à éviter" },
        { key: "guest_requests", label: "Demandes invités" }
      ]
    },
    {
      section: "Animation",
      before: (q) => q.animation,
      after: (q) => q.animation,
      fields: [
        { key: "level", label: "Niveau désiré" },
        { key: "activities", label: "Activités" },
        { key: "comments", label: "Commentaires" }
      ]
    },
    {
      section: "Animation spéciale",
      before: (q) => q.special_animation,
      after: (q) => q.special_animation,
      fields: [{ key: "notes", label: "Notes" }]
    },
    {
      section: "Questions importantes",
      before: (q) => q.important_questions,
      after: (q) => q.important_questions,
      fields: [
        { key: "perfect_evening", label: "Soirée parfaite" },
        { key: "other_info", label: "Autres informations" },
        { key: "family_situations", label: "Situations familiales" }
      ]
    }
  ];
}

function partyQuestionnaireFields() {
  return [
    {
      section: "Informations générales",
      before: (q) => q.general,
      after: (q) => q.general,
      fields: [
        { key: "guest_arrival_time", label: "Heure arrivée invités" },
        { key: "party_start_time", label: "Heure début party" },
        { key: "expected_end_time", label: "Heure fin prévue" },
        { key: "celebration_notes", label: "Notes célébration" },
        { key: "age_groups", label: "Groupes d'âge" },
        { key: "evening_themes", label: "Thèmes de soirée" },
        { key: "evening_theme_other", label: "Autre thème" }
      ]
    },
    {
      section: "Contact jour J",
      before: (q) => q.day_contact,
      after: (q) => q.day_contact,
      fields: [
        { key: "name", label: "Nom" },
        { key: "phone", label: "Téléphone" },
        { key: "email", label: "Courriel" }
      ]
    },
    {
      section: "Déroulement",
      before: (q) => q.schedule,
      after: (q) => q.schedule,
      fields: [
        { key: "has_cocktail", label: "Cocktail" },
        { key: "cocktail_location", label: "Lieu cocktail" },
        { key: "has_meal", label: "Repas" },
        { key: "speeches_planned", label: "Discours prévus" },
        { key: "special_moments_notes", label: "Moments spéciaux" }
      ]
    },
    {
      section: "Musique",
      before: (q) => q.party_music,
      after: (q) => q.party_music,
      fields: [
        { key: "decades", label: "Décennies" },
        { key: "must_play", label: "À jouer absolument" },
        { key: "preferred_artists", label: "Artistes préférés" },
        { key: "forbidden_songs", label: "Chansons interdites" },
        { key: "avoid_styles", label: "Styles à éviter" },
        { key: "guest_requests", label: "Demandes invités" }
      ]
    },
    {
      section: "Animation",
      before: (q) => q.animation,
      after: (q) => q.animation,
      fields: [
        { key: "level", label: "Niveau désiré" },
        { key: "activities", label: "Activités" },
        { key: "comments", label: "Commentaires" }
      ]
    },
    {
      section: "Animation spéciale",
      before: (q) => q.special_animation,
      after: (q) => q.special_animation,
      fields: [{ key: "notes", label: "Notes" }]
    },
    {
      section: "Questions importantes",
      before: (q) => q.important_questions,
      after: (q) => q.important_questions,
      fields: [
        { key: "perfect_evening", label: "Soirée parfaite" },
        { key: "other_info", label: "Autres informations" },
        { key: "sensitive_situations", label: "Situations sensibles" }
      ]
    }
  ];
}

function compareImportantMoments(changes, beforeMoments, afterMoments) {
  const beforeMap = new Map((beforeMoments || []).map((m) => [m.key, m]));
  const afterMap = new Map((afterMoments || []).map((m) => [m.key, m]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const key of keys) {
    const before = beforeMap.get(key) || {};
    const after = afterMap.get(key) || {};
    const momentLabel = after.label || before.label || key;
    compareField(changes, "Moments importants", `${momentLabel} — Actif`, before.active, after.active);
    compareField(changes, "Moments importants", `${momentLabel} — Heure`, before.time, after.time);
    compareField(changes, "Moments importants", `${momentLabel} — Chanson`, before.song, after.song);
    compareField(changes, "Moments importants", `${momentLabel} — Notes`, before.notes, after.notes);
  }
}

function stepSignature(step) {
  return [norm(step.time), norm(step.title), norm(step.description)].join("::");
}

function stepSummary(step) {
  const time = step.time ? `${formatTime(step.time)} — ` : "";
  const title = step.title || "Sans titre";
  const desc = step.description ? ` (${step.description})` : "";
  return `${time}${title}${desc}`;
}

function compareClientPlanSteps(changes, beforeSteps, afterSteps) {
  const before = beforeSteps || [];
  const after = afterSteps || [];
  const beforeSigs = before.map(stepSignature);
  const afterSigs = after.map(stepSignature);

  after.forEach((step, index) => {
    const sig = afterSigs[index];
    if (!beforeSigs.includes(sig)) {
      changes.push({
        section: "Plan de soirée",
        label: "Étape ajoutée ou modifiée",
        before: "—",
        after: stepSummary(step)
      });
    }
  });

  before.forEach((step, index) => {
    const sig = beforeSigs[index];
    if (!afterSigs.includes(sig)) {
      changes.push({
        section: "Plan de soirée",
        label: "Étape retirée",
        before: stepSummary(step),
        after: "—"
      });
    }
  });
}

function summarizePortalChanges({ before, after, eventType, kind }) {
  const changes = [];

  if (kind === "plan-soiree") {
    compareImportantMoments(changes, before.important_moments, after.important_moments);
    compareClientPlanSteps(changes, before.client_plan?.steps, after.client_plan?.steps);
  } else {
    const sections = isWeddingEvent(eventType)
      ? weddingQuestionnaireFields()
      : partyQuestionnaireFields();

    for (const block of sections) {
      compareObjectFields(
        changes,
        block.section,
        block.before(before),
        block.after(after),
        block.fields
      );
    }

    compareImportantMoments(changes, before.important_moments, after.important_moments);
  }

  if (norm(before._completed) !== norm(after._completed)) {
    compareField(
      changes,
      "Questionnaire",
      "Marqué complété",
      before._completed ? "yes" : "no",
      after._completed ? "yes" : "no"
    );
  }

  return changes;
}

function formatChangeLine(change) {
  if (change.before === "—" && change.after !== "—") {
    return `${change.section} — ${change.label} : ${change.after}`;
  }
  if (change.after === "—" && change.before !== "—") {
    return `${change.section} — ${change.label} : ${change.before} (retiré)`;
  }
  return `${change.section} — ${change.label} : ${change.before} → ${change.after}`;
}

function buildChangeSummaryText(changes) {
  if (!changes?.length) {
    return "Aucun détail de modification détecté (enregistrement sans changement visible).";
  }

  const visible = changes.slice(0, MAX_CHANGES);
  const lines = visible.map((change) => `• ${formatChangeLine(change)}`);
  if (changes.length > MAX_CHANGES) {
    lines.push(`• … et ${changes.length - MAX_CHANGES} autre(s) modification(s)`);
  }
  return lines.join("\n");
}

function buildChangeSummaryHtml(changes) {
  if (!changes?.length) {
    return "<p>Aucun détail de modification détecté.</p>";
  }

  const visible = changes.slice(0, MAX_CHANGES);
  const items = visible
    .map((change) => `<li>${escapeHtml(formatChangeLine(change))}</li>`)
    .join("");
  const extra =
    changes.length > MAX_CHANGES
      ? `<li>… et ${changes.length - MAX_CHANGES} autre(s) modification(s)</li>`
      : "";

  return `<p><strong>Modifications :</strong></p><ul>${items}${extra}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  summarizePortalChanges,
  buildChangeSummaryText,
  buildChangeSummaryHtml,
  formatChangeLine
};
