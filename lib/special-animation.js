const DEFAULT_SPECIAL_ANIMATION_SLOTS = 6;

function defaultSpecialAnimationItems() {
  return Array.from({ length: DEFAULT_SPECIAL_ANIMATION_SLOTS }, () => ({
    label: "",
    song: ""
  }));
}

function parseSpecialAnimationItems(body) {
  const items = [];
  let i = 0;
  while (
    Object.prototype.hasOwnProperty.call(body, `special_anim_label_${i}`) ||
    Object.prototype.hasOwnProperty.call(body, `special_anim_song_${i}`)
  ) {
    const label = String(body[`special_anim_label_${i}`] || "").trim();
    const song = String(body[`special_anim_song_${i}`] || "").trim();
    if (label || song) {
      items.push({ label, song });
    }
    i += 1;
  }
  return items;
}

function mergeSpecialAnimation(stored) {
  const items = Array.isArray(stored?.items)
    ? stored.items.map((item) => ({
        label: item.label || "",
        song: item.song || ""
      }))
    : [];

  while (items.length < DEFAULT_SPECIAL_ANIMATION_SLOTS) {
    items.push({ label: "", song: "" });
  }

  return { items };
}

module.exports = {
  DEFAULT_SPECIAL_ANIMATION_SLOTS,
  defaultSpecialAnimationItems,
  parseSpecialAnimationItems,
  mergeSpecialAnimation
};
