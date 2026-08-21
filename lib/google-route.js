const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "../config/google-maps.json");

function loadGoogleMapsApiKey() {
  const fromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.apiKey?.trim() || "";
  } catch {
    return "";
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function formatDistance(meters) {
  if (!meters || meters <= 0) return null;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function formatGoogleLocation(coords, address) {
  if (coords?.lat != null && coords?.lon != null) {
    return `${coords.lat},${coords.lon}`;
  }
  return address?.trim() || "";
}

async function fetchGoogleDrivingRoute(from, to, origin, destination) {
  const apiKey = loadGoogleMapsApiKey();
  if (!apiKey) return null;

  const origins = formatGoogleLocation(from, origin);
  const destinations = formatGoogleLocation(to, destination);
  if (!origins || !destinations) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origins);
  url.searchParams.set("destinations", destinations);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "fr");
  url.searchParams.set("region", "ca");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (data.status !== "OK") return null;

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;

  const durationSeconds =
    element.duration_in_traffic?.value || element.duration?.value || 0;
  const distanceMeters = element.distance?.value || 0;

  return {
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    distanceMeters,
    distanceLabel: formatDistance(distanceMeters),
    originLabel: from.label || origin,
    destinationLabel: to.label || destination,
    source: "google",
    sourceNote: element.duration_in_traffic
      ? "Google Maps · trafic en direct"
      : "Google Maps"
  };
}

module.exports = {
  loadGoogleMapsApiKey,
  fetchGoogleDrivingRoute
};
