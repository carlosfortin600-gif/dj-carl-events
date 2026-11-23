const fs = require("fs");
const path = require("path");

const ORIGINS_PATH = path.join(__dirname, "../config/route-origins.json");
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api/";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const USER_AGENT = "DJCarlEvents/1.0 (route-time)";
const QUEBEC_BBOX = "-79.8,44.9,-57.0,50.3";
const SUGGEST_CACHE_TTL_MS = 5 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000;
const suggestCache = new Map();
const geocodeCache = new Map();

function loadRouteOrigins() {
  try {
    const raw = fs.readFileSync(ORIGINS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveRouteOrigin(key, custom, origins = loadRouteOrigins()) {
  const id = key?.trim();
  if (!id) return null;
  if (id === "custom") return custom?.trim() || null;
  const found = origins.find((entry) => entry.id === id);
  return found?.address?.trim() || null;
}

function routeOriginLabel(key, custom, origins = loadRouteOrigins()) {
  const customAddress = custom?.trim();
  if (customAddress) return customAddress;
  const id = key?.trim();
  if (!id || id === "custom") return null;
  const found = origins.find((entry) => entry.id === id);
  if (!found) return id;
  const address = found.address?.trim();
  return address ? `${found.label} (${address})` : found.label;
}

function resolveDepartureAddress(key, custom, origins = loadRouteOrigins()) {
  const customAddress = custom?.trim();
  if (customAddress) return customAddress;
  return resolveRouteOrigin(key, custom, origins) || "";
}

function formatRouteDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function formatRouteDistance(meters) {
  if (!meters || meters <= 0) return null;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function formatPhotonAddress(properties) {
  const parts = [
    properties.housenumber,
    properties.street || properties.name,
    properties.city || properties.locality,
    properties.state,
    properties.postcode,
    properties.country
  ]
    .filter(Boolean)
    .map((part) => String(part).trim());

  const unique = [];
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part);
  }

  return unique.join(", ");
}

async function fetchPhotonFeatures(q, limit, useBbox) {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "fr");
  if (useBbox) url.searchParams.set("bbox", QUEBEC_BBOX);

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT }
  });
  if (!response.ok) return [];

  const data = await response.json();
  return Array.isArray(data?.features) ? data.features : [];
}

function featuresToSuggestions(features, limit) {
  const seen = new Set();
  const items = [];

  for (const feature of features) {
    const properties = feature.properties || {};
    const address = formatPhotonAddress(properties);
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const [lon, lat] = feature.geometry?.coordinates || [];
    items.push({
      label: address,
      address,
      city: properties.city || properties.locality || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null
    });
    if (items.length >= limit) break;
  }

  return items;
}

async function suggestWithNominatim(query, limit = 6) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "ca");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
  });
  if (!response.ok) return [];

  const results = await response.json();
  if (!Array.isArray(results)) return [];

  return results
    .map((row) => {
      const address = row.display_name?.trim();
      if (!address) return null;
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      return {
        label: address,
        address,
        city:
          row.address?.city ||
          row.address?.town ||
          row.address?.village ||
          row.address?.municipality ||
          null,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null
      };
    })
    .filter(Boolean);
}

async function suggestAddresses(query, limit = 6) {
  const q = query?.trim();
  if (!q || q.length < 3) return [];

  const cacheKey = q.toLowerCase();
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SUGGEST_CACHE_TTL_MS) {
    return cached.items;
  }

  let items = featuresToSuggestions(await fetchPhotonFeatures(q, limit, true), limit);
  if (!items.length) {
    items = featuresToSuggestions(await fetchPhotonFeatures(q, limit, false), limit);
  }
  if (!items.length) {
    items = await suggestWithNominatim(q, limit);
  }

  suggestCache.set(cacheKey, { at: Date.now(), items });
  return items;
}

async function geocodeWithPhoton(query, useBbox = true) {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "fr");
  if (useBbox) url.searchParams.set("bbox", QUEBEC_BBOX);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;

  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature?.geometry?.coordinates) return null;

  const [lon, lat] = feature.geometry.coordinates;
  return {
    lat: Number(lat),
    lon: Number(lon),
    label: formatPhotonAddress(feature.properties || {}) || query
  };
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDrivingFromHaversine(from, to, origin, destination) {
  const meters = haversineMeters(from.lat, from.lon, to.lat, to.lon);
  const durationSeconds = Math.max(300, Math.round((meters / 1000 / 65) * 3600));

  return {
    durationSeconds,
    durationLabel: formatRouteDuration(durationSeconds),
    distanceMeters: meters,
    distanceLabel: formatRouteDistance(meters),
    originLabel: from.label || origin,
    destinationLabel: to.label || destination,
    originLat: from.lat,
    originLon: from.lon,
    destLat: to.lat,
    destLon: to.lon,
    source: "estimate",
    sourceNote:
      "Estimation à vol d'oiseau — le service d'itinéraire détaillé est indisponible pour le moment."
  };
}

function coordinatesFromParams(lat, lon, label) {
  const parsedLat = parseCoordinate(lat);
  const parsedLon = parseCoordinate(lon);
  if (parsedLat === null || parsedLon === null) return null;
  return { lat: parsedLat, lon: parsedLon, label: label?.trim() || null };
}

async function geocodeAddress(address) {
  const query = address?.trim();
  if (!query) return null;

  const cacheKey = query.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GEOCODE_CACHE_TTL_MS) {
    return cached.hit;
  }

  let hit = await geocodeWithPhoton(query, true);
  if (!hit) hit = await geocodeWithPhoton(query, false);
  if (!hit) {
    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "ca");

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
      });
      if (response.ok) {
        const results = await response.json();
        if (Array.isArray(results) && results.length > 0) {
          const result = results[0];
          hit = {
            lat: Number(result.lat),
            lon: Number(result.lon),
            label: result.display_name
          };
        }
      }
    } catch {
      // ignore
    }
  }

  geocodeCache.set(cacheKey, { at: Date.now(), hit });
  return hit;
}

async function fetchDrivingRoute(origin, destination, originCoords = null, destinationCoords = null) {
  const from =
    originCoords ||
    (origin?.trim() ? await geocodeAddress(origin) : null);
  const to =
    destinationCoords ||
    (destination?.trim() ? await geocodeAddress(destination) : null);

  if (!from) throw new Error("Origin not found");
  if (!to) throw new Error("Destination not found");

  const { fetchGoogleDrivingRoute } = require("./google-route");
  const googleRoute = await fetchGoogleDrivingRoute(from, to, origin, destination);
  if (googleRoute) {
    return {
      ...googleRoute,
      originLat: from.lat,
      originLon: from.lon,
      destLat: to.lat,
      destLon: to.lon
    };
  }

  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_URL}/${coords}?overview=false&alternatives=3`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.code === "Ok" && data.routes?.length) {
        const route = data.routes.reduce((best, current) =>
          current.duration < best.duration ? current : best
        );

        return {
          durationSeconds: route.duration,
          durationLabel: formatRouteDuration(route.duration),
          distanceMeters: route.distance,
          distanceLabel: formatRouteDistance(route.distance),
          originLabel: from.label || origin,
          destinationLabel: to.label || destination,
          originLat: from.lat,
          originLon: from.lon,
          destLat: to.lat,
          destLon: to.lon,
          source: "osrm",
          sourceNote:
            "Estimation sans trafic — Google affiche souvent moins selon le trafic et l'itinéraire."
        };
      }
    }
  } catch {
    // fall through to straight-line estimate
  }

  return estimateDrivingFromHaversine(from, to, origin, destination);
}

module.exports = {
  loadRouteOrigins,
  resolveRouteOrigin,
  routeOriginLabel,
  resolveDepartureAddress,
  formatRouteDuration,
  formatRouteDistance,
  fetchDrivingRoute,
  suggestAddresses,
  coordinatesFromParams
};
