function defaultSpecialAnimation() {
  return { notes: "" };
}

function parseSpecialAnimation(body) {
  return {
    notes: String(body.special_animation_notes || "").trim()
  };
}

function mergeSpecialAnimation(stored) {
  if (stored && typeof stored.notes === "string") {
    return { notes: stored.notes };
  }

  if (Array.isArray(stored?.items)) {
    const lines = stored.items
      .filter((item) => item.label?.trim() || item.song?.trim())
      .map((item) => {
        const label = item.label?.trim();
        const song = item.song?.trim();
        if (label && song) return `${label}: ${song}`;
        return label || song;
      });
    return { notes: lines.join("\n") };
  }

  return defaultSpecialAnimation();
}

module.exports = {
  defaultSpecialAnimation,
  parseSpecialAnimation,
  mergeSpecialAnimation
};
