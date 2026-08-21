function parseSongMeta(notes) {
  if (!notes) {
    return { spotify_url: "", confirmed: false, legacy_notes: "" };
  }
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object" && ("spotify_url" in parsed || "confirmed" in parsed)) {
      return {
        spotify_url: parsed.spotify_url || "",
        confirmed: Boolean(parsed.confirmed),
        legacy_notes: ""
      };
    }
  } catch {
    // plain text notes
  }
  return { spotify_url: "", confirmed: false, legacy_notes: notes };
}

function encodeSongMeta(spotify_url, confirmed) {
  return JSON.stringify({
    spotify_url: spotify_url || "",
    confirmed: confirmed === true || confirmed === "1" || confirmed === 1
  });
}

function normalizeSongRow(row) {
  if (!row) {
    return { artist: "", title: "", spotify_url: "", confirmed: false };
  }
  const meta = parseSongMeta(row.notes);
  return {
    artist: row.artist || "",
    title: row.title || "",
    spotify_url: meta.spotify_url,
    confirmed: meta.confirmed
  };
}

module.exports = {
  parseSongMeta,
  encodeSongMeta,
  normalizeSongRow
};
