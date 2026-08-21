function parseAmbianceData(notes) {
  if (!notes) {
    return { styles: [], spotify_url: "", notes: "" };
  }
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) {
      return { styles: parsed.filter(Boolean), spotify_url: "", notes: "" };
    }
    if (parsed && typeof parsed === "object") {
      return {
        styles: Array.isArray(parsed.styles) ? parsed.styles.filter(Boolean) : [],
        spotify_url: parsed.spotify_url || "",
        notes: parsed.notes || ""
      };
    }
  } catch {
    // legacy plain text stored as notes
  }
  return { styles: [], spotify_url: "", notes: notes };
}

function encodeAmbianceData(styles, spotify_url, notes) {
  return JSON.stringify({
    styles: (styles || []).filter(Boolean),
    spotify_url: spotify_url || "",
    notes: notes || ""
  });
}

function parseThemeData(notes) {
  if (!notes) {
    return { theme: "", notes: "" };
  }
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object" && ("theme" in parsed || "notes" in parsed)) {
      return { theme: parsed.theme || "", notes: parsed.notes || "" };
    }
  } catch {
    // plain text theme
  }
  return { theme: notes, notes: "" };
}

function encodeThemeData(theme, notes) {
  return JSON.stringify({ theme: theme || "", notes: notes || "" });
}

module.exports = {
  parseAmbianceData,
  encodeAmbianceData,
  parseThemeData,
  encodeThemeData
};
