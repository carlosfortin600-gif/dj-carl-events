const fs = require("fs");
const path = require("path");

const PATCH_PATH = path.join(__dirname, "..", "data", "soundswitch-patch.json");

const PROFILES = {
  rgb: {
    label: "RGB (3)",
    channels: ["r", "g", "b"]
  },
  rgbw: {
    label: "RGBW (4)",
    channels: ["r", "g", "b", "w"]
  },
  "dim-rgb": {
    label: "Dim + RGB (4)",
    channels: ["dim", "r", "g", "b"]
  },
  "dim-rgbw": {
    label: "Dim + RGBW (5)",
    channels: ["dim", "r", "g", "b", "w"]
  },
  "dim-rgb-strobe": {
    label: "Dim + RGB + Strobe (5)",
    channels: ["dim", "r", "g", "b", "strobe"]
  },
  "dim-rgbw-strobe": {
    label: "Dim + RGBW + Strobe (6)",
    channels: ["dim", "r", "g", "b", "w", "strobe"]
  },
  rgbwa: {
    label: "RGBWA (5)",
    channels: ["r", "g", "b", "w", "a"]
  },
  "rgbwa-plus": {
    label: "RGBWA + Dim + extras (8)",
    channels: ["r", "g", "b", "w", "a", "dim", "strobe", "extra"]
  },
  rgbwauv: {
    label: "RGBWA UV (6)",
    channels: ["r", "g", "b", "w", "a", "uv"]
  },
  "rgbw-dim-strobe": {
    label: "RGBW + Dim + Strobe (6)",
    channels: ["r", "g", "b", "w", "dim", "strobe"]
  },
  "rgbw-plus8": {
    label: "RGBW + Dim Strobe extras (8)",
    channels: ["r", "g", "b", "w", "dim", "strobe", "a", "uv"]
  },
  "rgb-dim-strobe": {
    label: "RGB + Dim + Strobe (5)",
    channels: ["r", "g", "b", "dim", "strobe"]
  },
  parled10: {
    label: "Par LED 10 ch (Strobe RGBWA UV)",
    channels: ["strobe", "r", "g", "b", "w", "a", "uv", "extra", "extra2", "extra3"]
  },
  laser4: {
    label: "Laser 4 ch",
    channels: ["color", "extra", "dim", "strobe"]
  },
  fs6: {
    label: "FS-6 10 ch (Dim Strobe XY Color)",
    channels: ["dim", "strobe", "pan", "tilt", "gobo", "extra", "extra2", "color", "extra3", "extra4"]
  },
  wash10: {
    label: "Wash 10 ch (Dim RGBWA UV)",
    channels: ["dim", "r", "g", "b", "w", "a", "uv", "strobe", "mode", "speed"]
  },
  "mh-dim-rgbw": {
    label: "Lyre Pan/Tilt + Dim RGBW (7)",
    channels: ["pan", "tilt", "dim", "r", "g", "b", "w"]
  },
  "mh-beam9": {
    label: "Lyre Beam 9 ch (Dim Strobe Pan Tilt Color)",
    channels: ["dim", "strobe", "pan", "tilt", "color", "gobo", "prism", "speed", "function"]
  },
  "mh-beam12": {
    label: "Betopper LB150 12 ch",
    channels: ["pan", "panFine", "tilt", "tiltFine", "speed", "dim", "strobe", "color", "gobo", "goboShake", "prism", "function"]
  },
  strobe: {
    label: "Strobe dim + vitesse (2)",
    channels: ["dim", "strobe"]
  },
  dimmer: {
    label: "Dimmer (1)",
    channels: ["dim"]
  },
  partybar32: {
    label: "PartyBar 32 ch",
    channels: [
      "dim", "strobe",
      "r", "g", "b", "w",
      "r2", "g2", "b2", "w2",
      "derbyStrobe",
      "r3", "g3", "b3", "w3", "a3", "uv3",
      "r4", "g4", "b4", "w4", "a4", "uv4",
      "motor", "laser", "laserMotor",
      "barStrobe", "barMode", "uvStrobe", "uvMode",
      "function", "speed"
    ]
  },
  palette27: {
    label: "COLORpalette 27 ch",
    channels: Array.from({ length: 27 }, (_, index) => {
      const group = Math.floor(index / 3);
      const slot = ["r", "g", "b"][index % 3];
      return group === 0 ? slot : `${slot}${group + 1}`;
    })
  }
};

const KINDS = ["par", "bar", "mh", "strobe", "laser"];

const DEFAULT_PATCH = {
  name: "Carl full kit",
  fixtures: [
    { id: "ss-partybar", name: "PartyBar Mobile 250", type: "partybar32", kind: "bar", universe: 0, address: 1, x: 0.5, y: 0.08 },
    { id: "ss-palette-1", name: "COLORpalette 1", type: "palette27", kind: "bar", universe: 0, address: 40, x: 0.18, y: 0.42 },
    { id: "ss-palette-10", name: "COLORpalette 10", type: "palette27", kind: "bar", universe: 0, address: 70, x: 0.82, y: 0.42 },
    { id: "ss-terbly", name: "Terbly PB4D", type: "rgbw", kind: "par", universe: 0, address: 99, x: 0.5, y: 0.22 },
    { id: "ss-wash-1", name: "LED WASH - 1", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 150, x: 0.14, y: 0.16 },
    { id: "ss-wash-2", name: "LED WASH - 2", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 160, x: 0.38, y: 0.16 },
    { id: "ss-wash-3", name: "LED WASH - 3", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 170, x: 0.62, y: 0.16 },
    { id: "ss-wash-4", name: "LED WASH - 4", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 180, x: 0.86, y: 0.16 },
    { id: "ss-lb150-1", name: "LB150 - 1", type: "mh-beam12", kind: "mh", universe: 0, address: 200, x: 0.36, y: 0.06 },
    { id: "ss-lb150-2", name: "LB150 - 2", type: "mh-beam12", kind: "mh", universe: 0, address: 212, x: 0.64, y: 0.06 },
    { id: "ss-washfx-1", name: "Wash Effect - 1", type: "rgbw", kind: "bar", universe: 0, address: 260, x: 0.38, y: 0.2 },
    { id: "ss-washfx-2", name: "Wash Effect - 2", type: "rgbw", kind: "bar", universe: 0, address: 264, x: 0.62, y: 0.2 },
    { id: "ss-parled-1", name: "Par led 4 - 1", type: "wash10", kind: "par", mount: "hang", universe: 0, address: 300, x: 0.244, y: 0.468 },
    { id: "ss-parled-2", name: "Par led 4 - 2", type: "wash10", kind: "par", mount: "hang", universe: 0, address: 310, x: 0.756, y: 0.468 },
    { id: "ss-electro-1", name: "Electro 86", type: "rgbw", kind: "laser", mount: "hang", universe: 0, address: 365, x: 0.5, y: 0.02 }
  ]
};

function getProfiles() {
  return Object.fromEntries(
    Object.entries(PROFILES).map(([id, profile]) => [
      id,
      {
        id,
        label: profile.label,
        channels: profile.channels,
        channelCount: profile.channels.length
      }
    ])
  );
}

function clamp01(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function clampRot(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const wrapped = ((number % 360) + 360) % 360;
  return Math.round(wrapped * 10) / 10;
}

function normalizeSpot(raw, fallback) {
  return {
    x: clamp01(raw?.x, fallback.x),
    y: clamp01(raw?.y, fallback.y),
    rot: clampRot(raw?.rot ?? fallback.rot)
  };
}

function normalizeSpots(raw, count, x, y, rot) {
  const source = Array.isArray(raw?.spots) ? raw.spots : [];
  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const prev = spots[i - 1] || { x, y, rot };
    const fallback = i === 0
      ? { x, y, rot }
      : { x: Math.min(1, prev.x + 0.05), y: prev.y, rot: prev.rot };
    spots.push(normalizeSpot(source[i], fallback));
  }
  return spots;
}

function defaultMount(raw) {
  if (raw?.mount === "uplight" || raw?.mount === "hang") return raw.mount;
  const id = String(raw?.id || "");
  const name = String(raw?.name || "");
  if (/^ss-wash-[1-4]$/.test(id) || /^LED WASH/i.test(name)) return "uplight";
  return "hang";
}

function normalizeFixture(raw, index) {
  const type = PROFILES[raw?.type] ? raw.type : "dim-rgbw";
  const kind = KINDS.includes(raw?.kind) ? raw.kind : "par";
  const universe = Math.max(0, Math.min(32767, Number(raw?.universe) || 0));
  const address = Math.max(1, Math.min(512, Number(raw?.address) || 1));
  const name = String(raw?.name || `Fixture ${index + 1}`).trim().slice(0, 50);
  const countRaw = Number(raw?.count);
  const count = Number.isFinite(countRaw)
    ? Math.max(0, Math.min(32, Math.round(countRaw)))
    : 1;
  const x = clamp01(raw?.x, 0.5);
  const y = clamp01(raw?.y, 0.2);
  const rot = clampRot(raw?.rot);
  const spots = normalizeSpots(raw, Math.max(count, 1), x, y, rot);

  return {
    id: String(raw?.id || `fix-${index + 1}`).slice(0, 40),
    name: name || `Fixture ${index + 1}`,
    type,
    kind,
    mount: defaultMount(raw),
    universe,
    address,
    count,
    rot: spots[0].rot,
    x: spots[0].x,
    y: spots[0].y,
    spots
  };
}

function normalizePatch(raw) {
  const fixtures = Array.isArray(raw?.fixtures)
        ? raw.fixtures.slice(0, 64).map(normalizeFixture)
    : DEFAULT_PATCH.fixtures.map(normalizeFixture);

  return {
    name: String(raw?.name || DEFAULT_PATCH.name).trim().slice(0, 60) || DEFAULT_PATCH.name,
    fixtures
  };
}

function loadPatch() {
  try {
    const raw = JSON.parse(fs.readFileSync(PATCH_PATH, "utf8"));
    return normalizePatch(raw);
  } catch {
    return normalizePatch(DEFAULT_PATCH);
  }
}

function savePatch(raw) {
  const patch = normalizePatch(raw);
  fs.mkdirSync(path.dirname(PATCH_PATH), { recursive: true });
  fs.writeFileSync(PATCH_PATH, `${JSON.stringify(patch, null, 2)}\n`, "utf8");
  return patch;
}

module.exports = {
  DEFAULT_PATCH,
  getProfiles,
  loadPatch,
  normalizePatch,
  savePatch
};
