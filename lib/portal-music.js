const { parseCheckboxList } = require("./questionnaire-shared");

function applyPortalMusicFromBody(data, body) {
  if (!data.party_music || typeof data.party_music !== "object") {
    data.party_music = {
      decades: [],
      must_play: "",
      preferred_artists: "",
      forbidden_songs: "",
      avoid_styles: "",
      guest_requests: ""
    };
  }

  data.party_music.decades = parseCheckboxList(body, "party_decades");
  data.party_music.must_play = body.must_play || "";
  data.party_music.preferred_artists = body.preferred_artists || "";
  data.party_music.forbidden_songs = body.forbidden_songs || "";
  data.party_music.avoid_styles = body.avoid_styles || "";
  data.party_music.guest_requests = body.guest_requests || "";

  return data;
}

module.exports = {
  applyPortalMusicFromBody
};
