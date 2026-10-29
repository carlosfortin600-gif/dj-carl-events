(() => {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const hud = document.getElementById("hud");
  const statusEl = document.getElementById("status");
  const modeRoomBtn = document.getElementById("modeRoom");
  const modeShowBtn = document.getElementById("modeShow");
  const mode3dBtn = document.getElementById("mode3d");
  const view3dHint = document.getElementById("view3dHint");
  const connectSsBtn = document.getElementById("connectSsBtn");
  const demoBtn = document.getElementById("demoBtn");
  const patchBtn = document.getElementById("patchBtn");
  const fsBtn = document.getElementById("fsBtn");
  const patchPanel = document.getElementById("patchPanel");
  const patchClose = document.getElementById("patchClose");
  const patchName = document.getElementById("patchName");
  const fixtureList = document.getElementById("fixtureList");
  const addFixtureBtn = document.getElementById("addFixture");
  const resetPatchBtn = document.getElementById("resetPatch");
  const importSoundSwitchBtn = document.getElementById("importSoundSwitch");
  const savePatchBtn = document.getElementById("savePatch");
  const patchMsg = document.getElementById("patchMsg");

  const backdropImg = new Image();
  backdropImg.src = "/backdrop-artdeco.jpg";

  const PATCH_STORE = "djcarl-viz-patch-v2";
  const DEFAULT_PATCH = {
    name: "Carl full kit",
    fixtures: [
      { id: "ss-partybar", name: "PartyBar Mobile 250", type: "partybar32", kind: "bar", universe: 0, address: 1, x: 0.5, y: 0.08 },
      { id: "ss-palette-1", name: "COLORpalette 1", type: "palette27", kind: "bar", universe: 0, address: 40, x: 0.18, y: 0.42 },
      { id: "ss-palette-10", name: "COLORpalette 10", type: "palette27", kind: "bar", universe: 0, address: 70, x: 0.82, y: 0.42 },
      { id: "ss-terbly", name: "Terbly PB4D", type: "rgbw", kind: "par", universe: 0, address: 99, x: 0.5, y: 0.22 },
      { id: "ss-wash-1", name: "LED WASH - 1", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 150, x: 0.14, y: 0.16 },
      { id: "ss-wash-2", name: "LED WASH - 2", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 160, count: 2, x: 0.38, y: 0.16 },
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

  function isDefaultVenue(patch) {
    return Array.isArray(patch?.fixtures)
      && patch.fixtures.some((fixture) => fixture.id === "par-fl")
      && !patch.fixtures.some((fixture) => String(fixture.id || "").startsWith("ss-"));
  }

  function readStoredPatch() {
    try {
      const raw = JSON.parse(localStorage.getItem(PATCH_STORE) || "");
      if (raw && Array.isArray(raw.fixtures) && raw.fixtures.length && !isDefaultVenue(raw)) {
        return raw;
      }
    } catch {
      // ignore broken local cache
    }
    return null;
  }

  function rememberPatch(patch) {
    if (!patch || isDefaultVenue(patch)) return;
    try {
      localStorage.setItem(PATCH_STORE, JSON.stringify(patch));
    } catch {
      // quota / private mode
    }
  }

  const state = {
    mode: "show",
    demo: false,
    patch: readStoredPatch() || structuredClone(DEFAULT_PATCH),
    profiles: {},
    universes: {},
    status: { listening: false, lastPacketAt: 0, packets: 0, error: "" },
    pointer: { x: -9999, y: -9999, overCanvas: false },
    selectedId: "",
    selectedSpot: 0,
    drag: null,
    cam: null,
    view: null
  };
  const lightTip = document.getElementById("lightTip");
  const patchCountHint = document.getElementById("patchCountHint");

  const socket = io();

  function toBytes(data) {
    if (!data) return new Uint8Array(512);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return Uint8Array.from(data);
    return new Uint8Array(data.data || data);
  }

  function emptyUniverse() {
    return new Uint8Array(512);
  }

  function getUniverse(universe) {
    return state.universes[universe] || emptyUniverse();
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    let r;
    let g;
    let b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, hue + 1 / 3);
      g = hue2rgb(p, q, hue);
      b = hue2rgb(p, q, hue - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function writeChannel(data, address, offset, value) {
    const index = address - 1 + offset;
    if (index >= 0 && index < 512) data[index] = Math.max(0, Math.min(255, value));
  }

  function fillDemoUniverses(now) {
    const data = emptyUniverse();
    const hue = (now * 0.018) % 360;
    const pulse = 0.55 + 0.45 * Math.sin(now * 0.004);
    const beat = Math.sin(now * 0.012) > 0.82 ? 1 : 0;

    state.patch.fixtures.forEach((fixture, index) => {
      const profile = state.profiles[fixture.type];
      if (!profile) return;
      const [r, g, b] = hslToRgb(hue + index * 28, 1, 0.5);
      const dim = Math.round(220 * pulse);
      profile.channels.forEach((channel, offset) => {
        if (channel === "dim") writeChannel(data, fixture.address, offset, dim);
        if (channel === "r") writeChannel(data, fixture.address, offset, r);
        if (channel === "g") writeChannel(data, fixture.address, offset, g);
        if (channel === "b") writeChannel(data, fixture.address, offset, b);
        if (channel === "w") writeChannel(data, fixture.address, offset, Math.round(40 * pulse));
        if (channel === "pan") writeChannel(data, fixture.address, offset, Math.round((now * 0.04 + index * 42) % 255));
        if (channel === "tilt") writeChannel(data, fixture.address, offset, Math.round(126 + Math.cos(now * 0.0009 + index) * 22));
        if (channel === "strobe") writeChannel(data, fixture.address, offset, beat ? 180 : 0);
        if (channel === "color") writeChannel(data, fixture.address, offset, Math.round((hue + index * 28) % 120));
        if (channel === "gobo") writeChannel(data, fixture.address, offset, 20 + ((Math.floor(now * 0.00035 + index) % 7) * 32));
        if (channel === "goboShake") writeChannel(data, fixture.address, offset, 0);
      });
    });

    state.universes.demo = data;
  }

  const BEAM_WHEEL = [
    [255, 255, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [255, 153, 0],
    [255, 71, 255],
    [0, 225, 255],
    [0, 255, 0],
    [0, 255, 255],
    [255, 239, 121],
    [255, 252, 121]
  ];

  function mixRgb(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  const BEAM_WHEEL_NAMES = [
    "Blanc", "Rouge", "Vert", "Bleu", "Jaune", "Pizazz",
    "Rose", "Azure", "Vert", "Cyan", "Kournikova", "Paris Daisy"
  ];

  function beamColorWheel(value) {
    const dmx = Math.max(0, Math.min(255, Number(value) || 0));
    if (dmx < 120) return BEAM_WHEEL[Math.min(11, Math.floor(dmx / 10))];
    if (dmx < 128) return BEAM_WHEEL[11];
    const idx = ((dmx - 128) / 128) * BEAM_WHEEL.length;
    const a = Math.floor(idx) % BEAM_WHEEL.length;
    const b = (a + 1) % BEAM_WHEEL.length;
    return mixRgb(BEAM_WHEEL[a], BEAM_WHEEL[b], idx - Math.floor(idx));
  }

  function beamColorName(value) {
    const dmx = Math.max(0, Math.min(255, Number(value) || 0));
    if (dmx >= 128) return "Arc-en-ciel";
    if (dmx < 120) return BEAM_WHEEL_NAMES[Math.min(11, Math.floor(dmx / 10))];
    return BEAM_WHEEL_NAMES[11];
  }

  function readByte(data, address, offset) {
    const index = address - 1 + offset;
    return index >= 0 && index < data.length ? data[index] : 0;
  }

  const LOOK_COLORS = [
    [255, 24, 16],
    [255, 96, 0],
    [255, 210, 0],
    [40, 255, 50],
    [0, 230, 210],
    [20, 90, 255],
    [170, 40, 255],
    [255, 30, 150],
    [255, 255, 255]
  ];

  function mixCell(r, g, b, dim) {
    return {
      r: Math.min(255, r),
      g: Math.min(255, g),
      b: Math.min(255, b),
      dim
    };
  }

  function rgbCell(values, suffix, dim) {
    const key = (base) => (suffix ? `${base}${suffix}` : base);
    if (values[key("r")] == null && values[key("g")] == null && values[key("b")] == null) return null;
    const white = (values[key("w")] || 0) * dim;
    const amber = (values[key("a")] || 0) * dim;
    const uv = (values[key("uv")] || 0) * dim;
    return mixCell(
      (values[key("r")] || 0) * dim + white + amber,
      (values[key("g")] || 0) * dim + white + amber * 0.55,
      (values[key("b")] || 0) * dim + white + uv * 0.85,
      dim
    );
  }

  function lookRate(speed, kind) {
    const base = kind === "chase" ? 0.55 : 0.32;
    return base + (Math.max(0, Number(speed) || 0) / 255) * 2.2;
  }

  function programKind(mode) {
    const value = Number(mode);
    if (!Number.isFinite(value) || value < 32) return "";
    if (value < 96) return "macro";
    if (value < 128) return "fade";
    if (value < 151) return "chase";
    return "fade";
  }

  function fadeSwatch(now, speed) {
    const t = now * 0.001 * lookRate(speed, "fade") * 1.6;
    const idx = ((t % LOOK_COLORS.length) + LOOK_COLORS.length) % LOOK_COLORS.length;
    const a = Math.floor(idx) % LOOK_COLORS.length;
    const b = (a + 1) % LOOK_COLORS.length;
    return mixRgb(LOOK_COLORS[a], LOOK_COLORS[b], idx - Math.floor(idx));
  }

  function chaseSwatch(now, speed, seed) {
    const t = now * 0.001 * lookRate(speed, "chase") + seed;
    return LOOK_COLORS[Math.floor(t) % LOOK_COLORS.length];
  }

  function lookFamily(name) {
    return String(name || "")
      .replace(/\s*[-–]\s*\d+\s*$/g, "")
      .replace(/\s+\d+\s*$/g, "")
      .trim()
      .toLowerCase() || "fix";
  }

  function sameTypeGroup(fixture) {
    const list = state.patch.fixtures.filter((item) => lookFamily(item.name) === lookFamily(fixture.name));
    return {
      index: Math.max(0, list.findIndex((item) => item.id === fixture.id)),
      count: Math.max(1, list.length)
    };
  }

  function chaseLevel(now, speed, fixture) {
    const { index, count } = sameTypeGroup(fixture);
    const step = Math.floor(now * 0.001 * lookRate(speed, "chase") * count) % count;
    return index === step ? 1 : 0.04;
  }

  function colorAmount(values) {
    return (values.r || 0) + (values.g || 0) + (values.b || 0) + (values.w || 0);
  }

  function fixtureLook(values, now, fixture) {
    if (colorAmount(values) >= 40) return null;
    const mode = Number(values.mode);
    const kind = programKind(mode);
    if (!kind) return null;
    const speed = Number(values.speed) || 0;
    const seed = (Number(fixture.address) || 1) * 0.031;
    const swatch = kind === "fade"
      ? fadeSwatch(now, speed)
      : kind === "chase"
        ? chaseSwatch(now, speed, seed)
        : LOOK_COLORS[Math.floor((mode - 32) / 8) % LOOK_COLORS.length];
    const level = kind === "chase" ? chaseLevel(now, speed, fixture) : 1;
    return { swatch, label: kind === "macro" ? "Macro" : kind === "chase" ? "Chase" : "Fade", kind, speed, level };
  }

  function decodeCells(values, dim, look) {
    if (look) {
      return [mixCell(look.swatch[0] * dim * look.level, look.swatch[1] * dim * look.level, look.swatch[2] * dim * look.level, dim * look.level)];
    }
    const cells = [];
    const first = rgbCell(values, "", dim);
    if (first) cells.push(first);
    for (let i = 2; i <= 9; i += 1) {
      const cell = rgbCell(values, String(i), dim);
      if (cell) cells.push(cell);
    }
    return cells.length ? cells : [mixCell(0, 0, 0, dim)];
  }

  function decodeFixture(fixture, now) {
    const profile = state.profiles[fixture.type] || { channels: [] };
    const live = Date.now() - (state.status.lastPacketAt || 0) < 2500;
    const universeId = state.demo || !live ? "demo" : fixture.universe;
    const data = getUniverse(universeId);
    const values = {};

    profile.channels.forEach((channel, offset) => {
      values[channel] = readByte(data, fixture.address, offset);
    });

    const dim = values.dim == null ? 1 : values.dim / 255;
    const look = fixtureLook(values, now, fixture);
    let cells = decodeCells(values, dim, look);

    if (!look && values.color != null && cells.every((cell) => cell.r + cell.g + cell.b === 0)) {
      const swatch = beamColorWheel(values.color);
      cells = [mixCell(swatch[0] * dim, swatch[1] * dim, swatch[2] * dim, dim)];
    }

    if (fixture.kind === "strobe" && values.r == null && values.color == null && !look) {
      cells = [mixCell(255 * dim, 255 * dim, 255 * dim, dim)];
    }

    const strobe = values.strobe || values.barStrobe || values.derbyStrobe || 0;
    let strobeOn = 1;
    if (fixture.type === "mh-beam12") {
      if (strobe >= 11 && strobe <= 99) {
        const hz = 1.2 + ((strobe - 11) / 88) * 14;
        strobeOn = Math.sin(now * 0.001 * hz * Math.PI * 2) > 0.15 ? 1 : 0.08;
      }
    } else if (strobe > 12) {
      const hz = 1.5 + (strobe / 255) * 16;
      strobeOn = Math.sin(now * 0.001 * hz * Math.PI * 2) > 0.15 ? 1 : 0.08;
    }

    cells = cells.map((cell) => ({
      r: cell.r * strobeOn,
      g: cell.g * strobeOn,
      b: cell.b * strobeOn,
      dim: cell.dim * strobeOn
    }));

    const mix = cells.reduce((acc, cell) => {
      acc.r += cell.r;
      acc.g += cell.g;
      acc.b += cell.b;
      acc.dim += cell.dim;
      return acc;
    }, { r: 0, g: 0, b: 0, dim: 0 });
    const n = cells.length;

    return {
      fixture,
      r: mix.r / n,
      g: mix.g / n,
      b: mix.b / n,
      dim: mix.dim / n,
      cells,
      look: look?.label || "",
      pan: values.pan == null ? 128 : values.pan,
      tilt: values.tilt == null ? 128 : values.tilt,
      strobe,
      gobo: values.gobo == null ? 0 : values.gobo,
      goboShake: values.goboShake == null ? 0 : values.goboShake,
      prism: values.prism == null ? 0 : values.prism,
      colorName: values.color == null ? "" : beamColorName(values.color)
    };
  }

  function lightCells(light) {
    return light.cells && light.cells.length ? light.cells : [light];
  }

  function cellSpread(count) {
    return count > 6 ? 11 : count > 3 ? 15 : 18;
  }

  function cellOrigins(origin, rot, count) {
    const spread = cellSpread(count);
    return Array.from({ length: count }, (_, index) => {
      const offset = (index - (count - 1) / 2) * spread;
      return {
        x: origin.x + Math.cos(rot) * offset,
        y: origin.y + Math.sin(rot) * offset
      };
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function color(light, alpha) {
    return `rgba(${Math.round(light.r)}, ${Math.round(light.g)}, ${Math.round(light.b)}, ${alpha})`;
  }

  function washColor(lights) {
    return lights.reduce((acc, light) => {
      lightCells(light).forEach((cell) => {
        acc.r += cell.r * cell.dim;
        acc.g += cell.g * cell.dim;
        acc.b += cell.b * cell.dim;
        acc.dim += cell.dim;
      });
      return acc;
    }, { r: 0, g: 0, b: 0, dim: 0 });
  }

  function drawHaze(w, h, lights, now) {
    const wash = washColor(lights);
    const fog = ctx.createLinearGradient(0, 0, 0, h);
    fog.addColorStop(0, "rgba(78, 86, 104, 0.16)");
    fog.addColorStop(0.42, "rgba(110, 120, 140, 0.26)");
    fog.addColorStop(1, "rgba(48, 54, 68, 0.2)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 5; i += 1) {
      const t = (now * 0.000035 + i * 0.18) % 1;
      const x = w * (0.08 + ((i * 0.23 + t * 0.35) % 1) * 0.84);
      const y = h * (0.12 + ((i * 0.17 + t) % 1) * 0.7);
      const radius = Math.max(w, h) * (0.22 + (i % 3) * 0.08);
      const puff = ctx.createRadialGradient(x, y, 10, x, y, radius);
      puff.addColorStop(0, "rgba(210, 218, 232, 0.09)");
      puff.addColorStop(1, "rgba(210, 218, 232, 0)");
      ctx.fillStyle = puff;
      ctx.fillRect(0, 0, w, h);
    }

    if (wash.dim > 0.01) {
      const tint = Math.min(0.16, 0.04 + wash.dim / lights.length * 0.14);
      ctx.fillStyle = `rgba(${Math.round(wash.r / wash.dim)}, ${Math.round(wash.g / wash.dim)}, ${Math.round(wash.b / wash.dim)}, ${tint})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function fixtureSpots(fixture) {
    const n = fixtureCount(fixture);
    if (!Array.isArray(fixture.spots)) fixture.spots = [];
    if (!fixture.spots[0]) {
      fixture.spots[0] = { x: fixture.x ?? 0.5, y: fixture.y ?? 0.2, rot: fixture.rot || 0 };
    }
    while (fixture.spots.length < Math.max(n, 1)) {
      const prev = fixture.spots[fixture.spots.length - 1];
      fixture.spots.push({
        x: Math.min(1, (prev?.x ?? fixture.x) + 0.05),
        y: prev?.y ?? fixture.y,
        rot: prev?.rot ?? fixture.rot ?? 0
      });
    }
    fixture.x = fixture.spots[0].x;
    fixture.y = fixture.spots[0].y;
    fixture.rot = fixture.spots[0].rot;
    return n === 0 ? [] : fixture.spots.slice(0, n);
  }

  function expandLights(now) {
    return state.patch.fixtures.flatMap((fixture) => {
      if (fixtureCount(fixture) <= 0) return [];
      const decoded = decodeFixture(fixture, now);
      return fixtureSpots(fixture).map((spot, spotIndex) => ({
        ...decoded,
        fixture,
        spot,
        spotIndex
      }));
    });
  }

  function drawFixtureLabel(x, y, light) {
    const qty = fixtureCount(light.fixture);
    const text = qty > 1
      ? `${light.fixture.name} ${light.spotIndex + 1}`
      : light.fixture.name;
    const dy = light.fixture.kind === "mh" ? 56 : 12;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "700 12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText(text, x + 1, y + dy + 1);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(text, x, y + dy);
    ctx.restore();
  }

  function drawFixtureLabels(lights, w, h) {
    if (state.mode === "3d") return;
    lights.forEach((light) => {
      const point = lightAnchor(light, w, h);
      drawFixtureLabel(point.x, point.y, light);
    });
  }

  function fixtureRot(fixture) {
    return ((Number(fixture.rot) || 0) * Math.PI) / 180;
  }

  function fixtureCount(fixture) {
    const n = Math.round(Number(fixture?.count));
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(32, n));
  }

  function goboPattern(value) {
    const dmx = Math.max(0, Math.min(255, Number(value) || 0));
    if (dmx < 8) return 0;
    return 1 + Math.min(7, Math.floor((dmx - 8) / 31));
  }

  function goboLabel(value) {
    const names = ["Ouvert", "Cercle", "Points", "Étoile", "Tunnel", "Croix", "Triangle", "Anneau", "Rayons"];
    return names[goboPattern(value)] || "Gobo";
  }

  function drawGobo2d(x, y, angle, length, light) {
    const pattern = goboPattern(light.gobo);
    if (!pattern || light.dim < 0.05) return;
    const shake = (light.goboShake || 0) > 20
      ? Math.sin(performance.now() * 0.04) * 0.08
      : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + shake);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 6, 12, 0.55)";
    ctx.strokeStyle = "rgba(4, 6, 12, 0.55)";
    const spots = [length * 0.28, length * 0.48, length * 0.68];
    spots.forEach((d, i) => {
      const r = 10 + i * 4;
      ctx.beginPath();
      if (pattern === 1) {
        ctx.arc(0, d, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (pattern === 2) {
        for (let k = 0; k < 5; k += 1) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.35, d + Math.sin(a) * r * 0.35, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (pattern === 3) {
        for (let k = 0; k < 5; k += 1) {
          const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
          const rr = k % 2 ? r * 0.35 : r * 0.75;
          const px = Math.cos(a) * rr;
          const py = d + Math.sin(a) * rr;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (pattern === 4) {
        ctx.arc(0, d, r * 0.85, 0, Math.PI * 2);
        ctx.moveTo(r * 0.45, d);
        ctx.arc(0, d, r * 0.35, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
      } else if (pattern === 5) {
        ctx.rect(-r * 0.15, d - r * 0.75, r * 0.3, r * 1.5);
        ctx.rect(-r * 0.75, d - r * 0.15, r * 1.5, r * 0.3);
        ctx.fill();
      } else if (pattern === 6) {
        ctx.moveTo(0, d - r * 0.75);
        ctx.lineTo(r * 0.7, d + r * 0.55);
        ctx.lineTo(-r * 0.7, d + r * 0.55);
        ctx.closePath();
        ctx.fill();
      } else if (pattern === 7) {
        ctx.arc(0, d, r * 0.8, 0, Math.PI * 2);
        ctx.moveTo(r * 0.45, d);
        ctx.arc(0, d, r * 0.4, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
      } else {
        ctx.lineWidth = 2.4;
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, d);
          ctx.lineTo(Math.cos(a) * r, d + Math.sin(a) * r);
          ctx.stroke();
        }
      }
    });
    ctx.restore();
  }

  function isUplight(fixture) {
    if (!fixture) return false;
    if (fixture.mount === "hang") return false;
    if (fixture.mount === "uplight") return true;
    return /^ss-wash-[1-4]$/.test(fixture.id || "") || /^LED WASH/i.test(fixture.name || "");
  }

  function beamAngle(light) {
    if (isUplight(light.fixture)) return Math.PI;
    if (isParLed4(light.fixture) && state.venue?.danceFloor) {
      const spot = light.spot || light.fixture;
      const target = worldToSpot(state.venue.danceFloor.x, state.venue.danceFloor.z);
      return Math.atan2(target.x - (spot.x ?? 0.5), target.y - (spot.y ?? 0.5));
    }
    return fixtureRot(light.spot || light.fixture);
  }

  function totalFixtureCount() {
    return state.patch.fixtures.reduce((sum, fixture) => sum + fixtureCount(fixture), 0);
  }

  function setFixtureCount() {
    const units = totalFixtureCount();
    const cards = state.patch.fixtures.length;
    const label = units === 1 ? "1 fixture" : `${units} fixtures`;
    if (patchCountHint) {
      patchCountHint.textContent = cards === units
        ? `${label} · même liste que SoundSwitch.`
        : `${cards} dans le patch · ${label} au total.`;
    }
  }

  function isLaser(fixture) {
    return fixture?.kind === "laser"
      || /^ss-electro/i.test(fixture?.id || "")
      || /^Electro\s*86/i.test(fixture?.name || "");
  }

  function isLb150(fixture) {
    return fixture?.type === "mh-beam12" || /^LB150/i.test(fixture?.name || "");
  }

  function mhPanRad(light) {
    const yaw = fixtureRot(light.spot || light.fixture);
    // Betopper LB150: pan 540°
    return ((Number(light.pan) || 0) / 255) * Math.PI * 3 + yaw;
  }

  function mhTiltRad(light) {
    // Betopper LB150: tilt 270°. 0 = bas, milieu (128) = horizontal, 255 = 270°.
    const dmx = Math.max(0, Math.min(255, Number(light.tilt) || 0));
    if (dmx <= 128) return (dmx / 128) * (Math.PI / 2);
    return Math.PI / 2 + ((dmx - 128) / 127) * Math.PI;
  }

  function drawLb150Tripod2d(x, y, light) {
    const pan = mhPanRad(light);
    const tilt = mhTiltRad(light);
    const on = light.dim > 0.04;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(x, y);

    // K&M-style stand
    const feet = [[-22, 44], [22, 44], [0, 50]];
    const braceY = 32;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1c20";
    ctx.lineWidth = 3.2;
    feet.forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.moveTo(0, braceY);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    });
    ctx.strokeStyle = "#22252b";
    ctx.lineWidth = 2;
    feet.forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.moveTo(0, braceY);
      ctx.lineTo(lx * 0.55, braceY + (ly - braceY) * 0.55);
      ctx.stroke();
    });
    ctx.fillStyle = "#0a0b0d";
    feet.forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.ellipse(lx, ly + 1, 4.2, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#14161a";
    ctx.beginPath();
    ctx.arc(0, braceY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2e36";
    ctx.beginPath();
    ctx.arc(7, braceY + 1, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8e8ea";
    ctx.beginPath();
    ctx.arc(7, braceY + 1, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1e24";
    ctx.fillRect(-3.2, 10, 6.4, braceY - 10);
    ctx.fillStyle = "#252830";
    ctx.fillRect(-2.2, 2, 4.4, 10);
    ctx.fillStyle = "#121418";
    ctx.fillRect(-4.5, 9, 9, 5);
    ctx.fillStyle = "#2a2e36";
    ctx.beginPath();
    ctx.arc(8, 11.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8e8ea";
    ctx.beginPath();
    ctx.arc(8, 11.5, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9aa0aa";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, 7);
    ctx.lineTo(5, 7);
    ctx.stroke();
    ctx.fillStyle = "#c5c9d0";
    ctx.fillRect(-1.6, -1, 3.2, 3.5);

    // ——— Betopper LB150 moving head on tip ———
    ctx.save();
    ctx.rotate(pan * 0.4);

    // Base with mounting ears
    ctx.fillStyle = "#12151a";
    ctx.strokeStyle = "#2c323c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-16, -6, 32, 14, 2);
    ctx.fill();
    ctx.stroke();
    // Ears
    ctx.fillStyle = "#0e1014";
    ctx.fillRect(-20, -2, 5, 8);
    ctx.fillRect(15, -2, 5, 8);
    // LCD
    ctx.fillStyle = "#061820";
    ctx.fillRect(-13, -3, 8, 6);
    ctx.fillStyle = on ? "#1ee0ff" : "#0a3a44";
    ctx.globalAlpha = on ? 0.55 : 0.35;
    ctx.fillRect(-12, -2, 6, 4);
    ctx.globalAlpha = 1;
    // DMX / ERR LEDs
    ctx.fillStyle = on ? "#22c55e" : "#14532d";
    ctx.beginPath();
    ctx.arc(-2, -1, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath();
    ctx.arc(-2, 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Buttons
    ctx.fillStyle = "#1a1e26";
    [[2, 0], [6, 0], [10, 0], [14, 0]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
    // Label strip
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.font = "600 5px Arial";
    ctx.textAlign = "left";
    ctx.fillText("LB150", 1, 6);

    // U-yoke (black, BETOPPER arm)
    ctx.strokeStyle = "#1a1d24";
    ctx.fillStyle = "#1a1d24";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(-13, -30);
    ctx.lineTo(13, -30);
    ctx.lineTo(13, -4);
    ctx.stroke();
    // Yoke pivot hubs
    ctx.beginPath();
    ctx.arc(-13, -18, 3.2, 0, Math.PI * 2);
    ctx.arc(13, -18, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "700 6px Arial";
    ctx.save();
    ctx.translate(13, -18);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("BETOPPER", 0, 2);
    ctx.restore();

    // Cylindrical head + big lens (tilt)
    ctx.save();
    ctx.translate(0, -18);
    ctx.rotate((tilt - Math.PI * 0.65) * 0.7);
    // Barrel body
    ctx.fillStyle = "#0c0e12";
    ctx.strokeStyle = "#2a303a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-10, -16, 20, 22, 8);
    ctx.fill();
    ctx.stroke();
    // Tapered rear
    ctx.fillStyle = "#161a22";
    ctx.beginPath();
    ctx.ellipse(0, -14, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Front lens bezel
    ctx.fillStyle = "#050608";
    ctx.beginPath();
    ctx.arc(0, 10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a4250";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const lens = ctx.createRadialGradient(-2, 8, 0, 0, 10, 9);
    if (on) {
      lens.addColorStop(0, color(light, 0.98));
      lens.addColorStop(0.35, color(light, 0.65));
      lens.addColorStop(0.75, "rgba(30,40,55,0.85)");
      lens.addColorStop(1, "rgba(8,10,14,0.95)");
    } else {
      lens.addColorStop(0, "#3a4558");
      lens.addColorStop(0.55, "#1a2230");
      lens.addColorStop(1, "#080a10");
    }
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(0, 10, 9, 0, Math.PI * 2);
    ctx.fill();
    // Lens reflection
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(-2, 7, 5, -Math.PI * 0.9, -Math.PI * 0.2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  function drawLaserBeams3d(light) {
    if (light.dim < 0.04) return;
    const origin = lightWorld(light);
    const cell = lightCells(light)[0] || light;
    const yaw0 = fixtureRot(light.spot || light.fixture);
    const t = performance.now() * 0.0015;
    const rays = 8;
    for (let i = 0; i < rays; i += 1) {
      const fan = (i - (rays - 1) / 2) * 0.22;
      const sweep = Math.sin(t + i * 0.7) * 0.18;
      const yaw = yaw0 + fan + sweep;
      const pitch = -0.22 + Math.cos(t * 0.8 + i) * 0.1;
      const dir = vecNorm({
        x: Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: Math.cos(yaw) * Math.cos(pitch)
      });
      const len = beamLengthToRoom(origin, dir, 22, { fullThrow: true, wallThrow: true, skipFloor: true });
      const steps = 10;
      const r = 0.012;
      let side = vecCross(dir, { x: 0, y: 1, z: 0 });
      if (vecLen(side) < 0.08) side = { x: 1, y: 0, z: 0 };
      side = vecNorm(side);
      const up = vecNorm(vecCross(side, dir));
      for (let s = 0; s < steps; s += 1) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const a = {
          x: origin.x + dir.x * len * t0,
          y: origin.y + dir.y * len * t0,
          z: origin.z + dir.z * len * t0
        };
        const b = {
          x: origin.x + dir.x * len * t1,
          y: origin.y + dir.y * len * t1,
          z: origin.z + dir.z * len * t1
        };
        const alpha = 0.75 * (1 - t0 * 0.4) * cell.dim;
        const ring0 = ringPoints(a, side, up, r, 6);
        const ring1 = ringPoints(b, side, up, r, 6);
        for (let k = 0; k < 6; k += 1) {
          const n = (k + 1) % 6;
          fillProjected([ring0[k], ring0[n], ring1[n], ring1[k]], color(cell, alpha));
        }
      }
    }
    // Emitter body
    fillProjected(
      ringPoints(origin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.08, 10),
      "#11141a"
    );
  }

  function drawFixtureBody(x, y, light) {
    if (light.fixture.kind === "mh" || isLb150(light.fixture)) {
      drawLb150Tripod2d(x, y, light);
      return;
    }
    if (isLaser(light.fixture)) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#11141a";
      ctx.strokeStyle = "#3a4150";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - 10, y - 6, 20, 12, 2);
      ctx.fill();
      ctx.stroke();
      if (light.dim > 0.04) {
        ctx.fillStyle = color(light, 0.9);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const cells = lightCells(light);
    const rot = fixtureRot(light.spot || light.fixture);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    if (cells.length > 1) {
      ctx.translate(x, y);
      ctx.rotate(rot);
      const spread = cellSpread(cells.length);
      cells.forEach((cell, index) => {
        const cx = (index - (cells.length - 1) / 2) * spread;
        ctx.fillStyle = cell.dim > 0.04 ? color(cell, 0.95) : "rgba(170, 176, 188, 0.75)";
        ctx.beginPath();
        ctx.roundRect(cx - 6, -6, 12, 12, 2);
        ctx.fill();
      });
    } else {
      ctx.fillStyle = light.dim > 0.04 ? color(light, 0.95) : "rgba(170, 176, 188, 0.75)";
      ctx.beginPath();
      ctx.roundRect(x - 12, y - 7, 24, 14, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function beam(x, y, angle, length, width, light) {
    if (light.dim < 0.03) return;
    const isMh = light.fixture?.kind === "mh";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (isMh) {
      // Conical 2D beam: narrow at head, wider at tip — no round blob
      const tip = length * 0.95;
      const halfNear = Math.max(1.5, width * 0.06);
      const halfFar = Math.max(6, width * 0.42);
      const grad = ctx.createLinearGradient(0, 0, 0, tip);
      grad.addColorStop(0, color(light, 0.8 * light.dim));
      grad.addColorStop(0.5, color(light, 0.38 * light.dim));
      grad.addColorStop(1, color(light, 0.08 * light.dim));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-halfNear, 0);
      ctx.lineTo(halfNear, 0);
      ctx.lineTo(halfFar, tip);
      ctx.lineTo(-halfFar, tip);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    const steps = 7;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.55) / steps;
      const d = length * t;
      const radius = width * (0.12 + t * 0.88) * 0.5;
      const alpha = (0.62 * (1 - t * 0.82)) * Math.min(1, light.dim + 0.12);
      const glow = ctx.createRadialGradient(0, d, 0, 0, d, radius);
      glow.addColorStop(0, color(light, alpha));
      glow.addColorStop(0.45, color(light, alpha * 0.38));
      glow.addColorStop(1, color(light, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, d, radius * 0.72, radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const core = ctx.createRadialGradient(0, length * 0.18, 0, 0, length * 0.18, width * 0.22);
    core.addColorStop(0, color(light, 0.55 * light.dim));
    core.addColorStop(1, color(light, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, length * 0.12, width * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShow(w, h, lights, now) {
    ctx.fillStyle = "#07080d";
    ctx.fillRect(0, 0, w, h);
    drawHaze(w, h, lights, now);

    ctx.globalCompositeOperation = "lighter";

    lights.forEach((light) => {
      const point = lightAnchor(light, w, h);
      const rot = fixtureRot(light.spot || light.fixture);
      const cells = lightCells(light);
      const origins = cellOrigins(point, rot, cells.length);

      if (light.fixture.kind === "mh") {
        const pan = mhPanRad(light);
        const tilt = mhTiltRad(light);
        const len = h * (0.55 + Math.sin(tilt) * 0.7 + 0.2);
        const wide = isLb150(light.fixture) ? 34 + light.dim * 16 : 88 + light.dim * 40;
        beam(point.x, point.y, pan, len, wide, light);
        return;
      }

      if (light.fixture.kind === "strobe" && !isLaser(light.fixture)) {
        if (!light.spotIndex && light.dim > 0.35 && light.strobe > 12) {
          ctx.fillStyle = `rgba(255,255,255,${0.06 + light.dim * 0.12})`;
          ctx.fillRect(0, 0, w, h);
        }
        return;
      }

      if (isLaser(light.fixture)) {
        if (light.dim < 0.04) return;
        const yaw = fixtureRot(light.spot || light.fixture);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color(light, 0.85);
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 7; i += 1) {
          const a = yaw + (i - 3) * 0.2 + Math.sin(now * 0.002 + i) * 0.12;
          const len = h * (0.55 + (i % 3) * 0.08);
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(point.x + Math.sin(a) * len, point.y + Math.cos(a) * len);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      cells.forEach((cell, index) => {
        const wide = isUplight(light.fixture)
          ? 96
          : light.fixture.kind === "bar"
            ? (cells.length > 1 ? 48 : 72)
            : (cells.length > 1 ? 56 : 100);
        beam(
          origins[index].x,
          origins[index].y,
          beamAngle(light),
          h * (isUplight(light.fixture) ? 0.48 : light.fixture.kind === "bar" ? 0.66 : 0.62),
          wide,
          cell
        );
      });
    });

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(180, 190, 210, 0.06)";
    ctx.fillRect(0, 0, w, h);
    lights.forEach((light) => {
      const point = lightAnchor(light, w, h);
      drawFixtureBody(point.x, point.y, light);
    });

    ctx.font = "800 28px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.textAlign = "center";
    ctx.fillText("DJ CARL", w / 2, h - 28);
  }

  function lightAnchor(light, w, h) {
    if (state.mode === "3d") {
      return projectWorld(lightWorld(light), w, h) || { x: -9999, y: -9999, s: 0 };
    }
    const spot = light.spot || light.fixture;
    return {
      x: spot.x * w,
      y: spot.y * h,
      s: 40
    };
  }

  function normFromPoint(px, py, w, h) {
    return {
      x: px / w,
      y: py / h
    };
  }

  function rotateHandle(point, spot) {
    const rot = fixtureRot(spot);
    return {
      x: point.x + Math.sin(rot) * 44,
      y: point.y + Math.cos(rot) * 44
    };
  }

  function drawSelection(lights, w, h) {
    const light = lights.find((item) => (
      item.fixture.id === state.selectedId && item.spotIndex === state.selectedSpot
    ));
    if (!light) return;
    const point = lightAnchor(light, w, h);
    const handle = rotateHandle(point, light.spot);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#00d4ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(handle.x, handle.y);
    ctx.stroke();
    ctx.fillStyle = "#00d4ff";
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#041018";
    ctx.font = "800 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↻", handle.x, handle.y + 0.5);
    ctx.restore();
  }

  function findHovered(lights, w, h) {
    if (!state.pointer.overCanvas) return null;
    let best = null;
    let bestDist = 52;
    lights.forEach((light) => {
      const point = lightAnchor(light, w, h);
      if (point.x < -1000) return;
      const reach = state.mode === "3d" ? Math.max(20, Math.min(64, (point.s || 28) * 0.85)) : 52;
      const dist = Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y);
      if (dist < reach && dist < bestDist) {
        bestDist = dist;
        best = { light, point };
      }
    });
    return best;
  }

  function drawHover(hit, w, h) {
    if (!hit) {
      lightTip.hidden = true;
      if (state.drag && (state.drag.mode === "orbit" || state.drag.mode === "pan")) {
        canvas.style.cursor = "grabbing";
      } else {
        canvas.style.cursor = state.mode === "3d" ? "grab" : "default";
      }
      return;
    }

    if (hit.venue) {
      lightTip.innerHTML = `<strong>${hit.venue.label}</strong><span>Glisser pour déplacer</span>`;
      lightTip.hidden = false;
      const tipW = lightTip.offsetWidth;
      const tipH = lightTip.offsetHeight;
      const left = Math.min(w - tipW - 12, Math.max(12, hit.venue.point.x + 18));
      const top = Math.min(h - tipH - 12, Math.max(72, hit.venue.point.y - tipH - 12));
      lightTip.style.left = `${left}px`;
      lightTip.style.top = `${top}px`;
      canvas.style.cursor = state.drag ? "grabbing" : "move";
      return;
    }

    const { light, point } = hit;
    const profile = state.profiles[light.fixture.type];
    const colorLine = light.look ? ` · ${light.look}` : light.colorName ? ` · ${light.colorName}` : "";
    const goboLine = light.fixture.kind === "mh" && goboPattern(light.gobo)
      ? ` · Gobo ${goboLabel(light.gobo)}`
      : "";
    const universe = Number(light.fixture.universe) || 0;
    const qty = fixtureCount(light.fixture);
    const qtyLine = qty > 1 ? ` · ×${qty}` : qty === 0 ? " · masquée" : "";
    const moveHint = state.mode === "3d" ? " · glisser pour déplacer" : "";
    lightTip.innerHTML = `<strong>${light.fixture.name}</strong><span>U${universe + 1} · DMX ${light.fixture.address} · ${profile?.label || light.fixture.type}${colorLine}${goboLine}${qtyLine}${moveHint}</span>`;
    lightTip.hidden = false;
    const tipW = lightTip.offsetWidth;
    const tipH = lightTip.offsetHeight;
    const left = Math.min(w - tipW - 12, Math.max(12, point.x + 18));
    const top = Math.min(h - tipH - 12, Math.max(72, point.y - tipH - 12));
    lightTip.style.left = `${left}px`;
    lightTip.style.top = `${top}px`;
    canvas.style.cursor = state.drag ? "grabbing" : state.mode === "3d" ? "move" : "grab";
    void h;
  }

  function drawRoom(w, h, lights) {
    const floorTop = h * 0.46;
    const wall = ctx.createLinearGradient(0, 0, 0, floorTop);
    wall.addColorStop(0, "#060508");
    wall.addColorStop(1, "#120e10");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#1a120e";
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h);
    ctx.lineTo(w * 0.18, floorTop);
    ctx.lineTo(w * 0.82, floorTop);
    ctx.lineTo(w * 0.92, h);
    ctx.closePath();
    ctx.fill();

    const dfy0 = floorTop + (h - floorTop) * 0.18;
    const dfy1 = floorTop + (h - floorTop) * 0.72;
    const dfx0 = w * 0.28;
    const dfx1 = w * 0.72;
    const woods2 = ["#8a5c34", "#7a4e2a", "#946640", "#6e4428", "#825430"];
    for (let iz = 0; iz < 14; iz += 1) {
      ctx.fillStyle = woods2[iz % woods2.length];
      const y0 = dfy0 + (dfy1 - dfy0) * (iz / 14);
      const y1 = dfy0 + (dfy1 - dfy0) * ((iz + 1) / 14);
      ctx.fillRect(dfx0, y0, dfx1 - dfx0, Math.max(1, y1 - y0 - 1));
    }

    ctx.strokeStyle = "rgba(40, 24, 16, 0.18)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i += 1) {
      const y = floorTop + (h - floorTop) * (i / 6);
      ctx.beginPath();
      ctx.moveTo(w * (0.08 + 0.1 * (i / 6)), y);
      ctx.lineTo(w * (0.92 - 0.1 * (i / 6)), y);
      ctx.stroke();
    }

    ctx.fillStyle = "#1a1d28";
    ctx.fillRect(w * 0.12, h * 0.12, w * 0.76, 16);
    ctx.fillStyle = "#00d4ff";
    ctx.globalAlpha = 0.35;
    ctx.fillRect(w * 0.12, h * 0.12, w * 0.76, 3);
    ctx.globalAlpha = 1;
    drawHaze(w, h, lights, performance.now());

    ctx.globalCompositeOperation = "lighter";
    lights.forEach((light) => {
      const origin = lightAnchor(light, w, h);
      const rot = fixtureRot(light.spot || light.fixture);
      const cells = lightCells(light);
      const origins = cellOrigins(origin, rot, cells.length);
      if (light.fixture.kind === "mh") {
        const pan = mhPanRad(light);
        const tilt = mhTiltRad(light);
        const len = h * (0.5 + Math.sin(tilt) * 0.65 + 0.18);
        beam(origin.x, origin.y, pan, len, isLb150(light.fixture) ? 32 : 70, light);
      } else {
        cells.forEach((cell, index) => {
          const wide = isUplight(light.fixture)
            ? 80
            : light.fixture.kind === "bar"
              ? (cells.length > 1 ? 40 : 62)
              : (cells.length > 1 ? 48 : 78);
          beam(
            origins[index].x,
            origins[index].y,
            beamAngle(light),
            h * (isUplight(light.fixture) ? 0.42 : 0.58),
            wide,
            cell
          );
        });
      }
    });
    ctx.globalCompositeOperation = "source-over";
    lights.forEach((light) => {
      const origin = lightAnchor(light, w, h);
      drawFixtureBody(origin.x, origin.y, light);
    });

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = "700 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(state.patch.name || "Salle", w / 2, h * 0.1);
  }

  const FT = 0.3048;
  const ROOM = { w: 14, d: 11, h: 10 * FT };
  const CAM_STORE = "djcarl-viz-cam-v7";
  const DEFAULT_CAM = { yaw: 0.22, pitch: 0.16, dist: 8.8, tx: 0, ty: 1.45, tz: 1.35 };

  function clampCam(cam) {
    return {
      yaw: cam.yaw,
      pitch: Math.min(1.45, Math.max(-1.45, cam.pitch)),
      dist: Math.min(40, Math.max(3.5, cam.dist)),
      tx: Math.min(ROOM.w * 0.85, Math.max(-ROOM.w * 0.85, cam.tx)),
      ty: Math.min(ROOM.h - 0.4, Math.max(0.2, cam.ty)),
      tz: Math.min(ROOM.d * 0.85, Math.max(-ROOM.d * 0.85, cam.tz))
    };
  }

  function readCam() {
    try {
      const raw = JSON.parse(localStorage.getItem(CAM_STORE) || "");
      if (raw && Number.isFinite(raw.dist)) return clampCam({ ...DEFAULT_CAM, ...raw });
    } catch {
      // ignore
    }
    return { ...DEFAULT_CAM };
  }

  function rememberCam() {
    try {
      localStorage.setItem(CAM_STORE, JSON.stringify(state.cam));
    } catch {
      // quota / private mode
    }
  }

  function resetCam() {
    state.cam = { ...DEFAULT_CAM };
    rememberCam();
  }

  state.cam = readCam();

  function isLedWash2(fixture) {
    return fixture?.id === "ss-wash-2" || /^LED WASH\s*-?\s*2$/i.test(fixture?.name || "");
  }

  function paFrontOffset(pa, dist) {
    const yaw = pa.yaw || 0;
    return {
      x: pa.x - Math.sin(yaw) * dist,
      z: pa.z + Math.cos(yaw) * dist
    };
  }

  function syncWash2OnCaisses() {
    const fixture = state.patch.fixtures.find((f) => isLedWash2(f));
    if (!fixture) return;
    const pas = state.venue?.pas || [];
    const left = pas.find((p) => p.id === "paL") || pas[0];
    const right = pas.find((p) => p.id === "paR") || pas[1];
    if (!left || !right) return;
    fixture.mount = "uplight";
    fixture.count = 2;
    const places = [left, right].map((pa) => {
      const front = paFrontOffset(pa, 0.62);
      const spot = worldToSpot(front.x, front.z);
      return { x: spot.x, y: spot.y, rot: 0 };
    });
    fixture.x = places[0].x;
    fixture.y = places[0].y;
    fixture.spots = places;
  }

  function isParLed4(fixture) {
    return /^ss-parled-/i.test(fixture?.id || "") || /^Par led 4/i.test(fixture?.name || "");
  }

  function paForParLed(fixture) {
    const pas = state.venue?.pas || [];
    const right = /parled-2|Par led 4 - 2/i.test(`${fixture?.id || ""} ${fixture?.name || ""}`);
    if (right) return pas.find((p) => p.id === "paR") || pas[1] || null;
    return pas.find((p) => p.id === "paL") || pas[0] || null;
  }

  function syncParLedsAbovePas() {
    const pairs = [
      ["ss-parled-1", "paL"],
      ["ss-parled-2", "paR"]
    ];
    let changed = false;
    pairs.forEach(([fixId, paId], index) => {
      const pa = (state.venue.pas || []).find((p) => p.id === paId) || state.venue.pas?.[index];
      const fixture = state.patch.fixtures.find((f) => f.id === fixId);
      if (!pa || !fixture) return;
      const spot = worldToSpot(pa.x, pa.z);
      fixture.mount = "hang";
      fixture.x = spot.x;
      fixture.y = spot.y;
      const spots = fixtureSpots(fixture);
      if (spots[0]) {
        spots[0].x = spot.x;
        spots[0].y = spot.y;
      }
      changed = true;
    });
    return changed;
  }

  function fixtureHeight(fixture) {
    if (isUplight(fixture)) return 0.5 * FT;
    if (fixture.kind === "mh") return 6 * FT;
    if (fixture.kind === "bar") return 9.2 * FT;
    if (/electro/i.test(fixture.name || "") || isLaser(fixture)) return 9.5 * FT;
    // Par led 4 : juste au-dessus des HK Polar (~2.22 m)
    if (isParLed4(fixture)) return 2.42;
    if (fixture.kind === "par" || fixture.kind === "strobe") return 9.0 * FT;
    return 4 * FT;
  }

  function lightWorld(light) {
    const spot = light.spot || light.fixture;
    let x = ((spot.x ?? 0.5) - 0.5) * ROOM.w;
    let z = ((spot.y ?? 0.2) - 0.5) * ROOM.d;
    if (isParLed4(light.fixture)) {
      const pa = paForParLed(light.fixture);
      if (pa) {
        x = pa.x;
        z = pa.z;
      }
    }
    if (isLedWash2(light.fixture)) {
      const pas = state.venue?.pas || [];
      const pa = (light.spotIndex === 1
        ? pas.find((p) => p.id === "paR") || pas[1]
        : pas.find((p) => p.id === "paL") || pas[0]);
      if (pa) {
        const front = paFrontOffset(pa, 0.62);
        x = front.x;
        z = front.z;
      }
    }
    return {
      x,
      y: fixtureHeight(light.fixture),
      z
    };
  }

  function worldToSpot(wx, wz) {
    return {
      x: clampLayout((wx / ROOM.w) + 0.5),
      y: clampLayout((wz / ROOM.d) + 0.5)
    };
  }

  function vecLen(v) {
    return Math.hypot(v.x, v.y, v.z) || 1;
  }

  function vecNorm(v) {
    const len = vecLen(v);
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function vecCross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function makeView(w, h) {
    const cam = state.cam;
    const cp = Math.cos(cam.pitch);
    const eye = {
      x: cam.tx + cam.dist * Math.sin(cam.yaw) * cp,
      y: cam.ty + cam.dist * Math.sin(cam.pitch),
      z: cam.tz + cam.dist * Math.cos(cam.yaw) * cp
    };
    const forward = vecNorm({ x: cam.tx - eye.x, y: cam.ty - eye.y, z: cam.tz - eye.z });
    let right = vecCross(forward, { x: 0, y: 1, z: 0 });
    if (vecLen(right) < 0.002) {
      right = { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) };
    }
    right = vecNorm(right);
    const up = vecCross(right, forward);
    const fov = 1.05;
    const tan = Math.tan(fov / 2);
    const focal = h * 0.56;
    return { eye, forward, right, up, tan, focal, w, h };
  }

  function projectWorld(point, w, h) {
    const view = state.view || makeView(w, h);
    const dx = point.x - view.eye.x;
    const dy = point.y - view.eye.y;
    const dz = point.z - view.eye.z;
    const vx = dx * view.right.x + dy * view.right.y + dz * view.right.z;
    const vy = dx * view.up.x + dy * view.up.y + dz * view.up.z;
    const vz = dx * view.forward.x + dy * view.forward.y + dz * view.forward.z;
    if (vz < 0.25) return null;
    const scale = view.focal / (view.tan * vz);
    return {
      x: view.w / 2 + vx * scale,
      y: view.h / 2 - vy * scale,
      z: vz,
      s: scale
    };
  }

  function screenRay(sx, sy, w, h) {
    const view = state.view || makeView(w, h);
    const nx = ((sx - view.w / 2) * view.tan) / view.focal;
    const ny = ((view.h / 2 - sy) * view.tan) / view.focal;
    return {
      origin: view.eye,
      dir: vecNorm({
        x: view.forward.x + view.right.x * nx + view.up.x * ny,
        y: view.forward.y + view.right.y * nx + view.up.y * ny,
        z: view.forward.z + view.right.z * nx + view.up.z * ny
      })
    };
  }

  function intersectY(ray, y) {
    if (Math.abs(ray.dir.y) < 0.0008) return null;
    const t = (y - ray.origin.y) / ray.dir.y;
    if (t < 0.15) return null;
    return {
      x: ray.origin.x + ray.dir.x * t,
      y,
      z: ray.origin.z + ray.dir.z * t
    };
  }

  function viewDepth(point, view) {
    return (point.x - view.eye.x) * view.forward.x
      + (point.y - view.eye.y) * view.forward.y
      + (point.z - view.eye.z) * view.forward.z;
  }

  function clipPolyNear(points, view, near) {
    if (!points.length) return points;
    const out = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const za = viewDepth(a, view);
      const zb = viewDepth(b, view);
      const aIn = za >= near;
      const bIn = zb >= near;
      if (aIn && bIn) {
        out.push(b);
      } else if (aIn !== bIn) {
        const t = (near - za) / ((zb - za) || 1e-6);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t
        });
        if (bIn) out.push(b);
      }
    }
    return out;
  }

  function fillProjected(points, fill, stroke) {
    const view = state.view;
    if (!view) return;
    const clipped = clipPolyNear(points, view, 0.25);
    if (clipped.length < 2) return;
    const projected = clipped.map((point) => projectWorld(point, view.w, view.h));
    if (projected.some((point) => !point)) return;
    ctx.beginPath();
    projected.forEach((point, index) => {
      if (index) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  function drawImageQuad(img, bl, br, tl) {
    if (!img.complete || !img.naturalWidth || !state.view) return false;
    const p0 = projectWorld(bl, state.view.w, state.view.h);
    const p1 = projectWorld(br, state.view.w, state.view.h);
    const p3 = projectWorld(tl, state.view.w, state.view.h);
    if (!p0 || !p1 || !p3) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    ctx.save();
    ctx.setTransform(
      dpr * (p1.x - p0.x) / iw,
      dpr * (p1.y - p0.y) / iw,
      dpr * (p3.x - p0.x) / ih,
      dpr * (p3.y - p0.y) / ih,
      dpr * p0.x,
      dpr * p0.y
    );
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    return true;
  }

  function washRgb() {
    const wash = state.wash;
    if (!wash || wash.dim < 0.02) return null;
    return {
      r: Math.round(wash.r / wash.dim),
      g: Math.round(wash.g / wash.dim),
      b: Math.round(wash.b / wash.dim),
      dim: wash.dim
    };
  }

  function rgba(r, g, b, a) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
  }

  function danceFloorCenter() {
    const floor = state.venue?.danceFloor;
    return {
      x: floor?.x ?? 0,
      y: 0.05,
      z: floor?.z ?? -0.35
    };
  }

  function beamDir(light) {
    const yaw = fixtureRot(light.spot || light.fixture);
    if (light.fixture.kind === "mh") {
      const pan = mhPanRad(light);
      const tilt = mhTiltRad(light);
      return vecNorm({
        x: Math.sin(pan) * Math.sin(tilt),
        y: -Math.cos(tilt),
        z: Math.cos(pan) * Math.sin(tilt)
      });
    }
    if (isUplight(light.fixture)) {
      // LED WASH 2 : uniquement le devant des caisses HK Polar
      if (isLedWash2(light.fixture)) {
        const origin = lightWorld(light);
        const pas = state.venue?.pas || [];
        const pa = (light.spotIndex === 1
          ? pas.find((p) => p.id === "paR") || pas[1]
          : pas.find((p) => p.id === "paL") || pas[0]);
        if (pa) {
          const face = paFrontOffset(pa, 0.26);
          return vecNorm({
            x: face.x - origin.x,
            y: 0.34 - origin.y,
            z: face.z - origin.z
          });
        }
      }
      const origin = lightWorld(light);
      return vecNorm({
        x: Math.sin(yaw) * 0.22 - origin.x * 0.03,
        y: 1,
        z: Math.cos(yaw) * 0.22 - origin.z * 0.03
      });
    }
    // Par led 4 : vers le centre de la piste
    if (isParLed4(light.fixture)) {
      const origin = lightWorld(light);
      const target = danceFloorCenter();
      return vecNorm({
        x: target.x - origin.x,
        y: target.y - origin.y,
        z: target.z - origin.z
      });
    }
    return vecNorm({
      x: Math.sin(yaw) * 0.14,
      y: -1,
      z: Math.cos(yaw) * 0.14
    });
  }

  function ringPoints(center, side, up, radius, segments, spin) {
    const points = [];
    for (let k = 0; k < segments; k += 1) {
      const a = (k / segments) * Math.PI * 2 + (spin || 0);
      const c = Math.cos(a);
      const s = Math.sin(a);
      points.push({
        x: center.x + (side.x * c + up.x * s) * radius,
        y: center.y + (side.y * c + up.y * s) * radius,
        z: center.z + (side.z * c + up.z * s) * radius
      });
    }
    return points;
  }

  function beamLengthToRoom(origin, dir, maxLength, opts) {
    let len = Math.max(0.25, maxLength);
    const pad = opts?.fullThrow ? 0.02 : 0.05;
    const hw = ROOM.w * 0.5 - pad;
    const hd = ROOM.d * 0.5 - pad;
    const floorY = opts?.fullThrow ? 0.02 : 0.04;
    const ceilY = ROOM.h - (opts?.fullThrow ? 0.02 : 0.08);
    const skipSlab = opts?.wallThrow === true || opts?.skipFloor === true;

    if (!skipSlab && dir.y < -0.002) {
      const t = (floorY - origin.y) / dir.y;
      if (t > 0.05) len = Math.min(len, t);
    }
    if (!skipSlab && dir.y > 0.002) {
      const t = (ceilY - origin.y) / dir.y;
      if (t > 0.05) len = Math.min(len, t);
    }
    if (Math.abs(dir.x) > 0.002) {
      const wallX = dir.x > 0 ? hw : -hw;
      const t = (wallX - origin.x) / dir.x;
      if (t > 0.05) len = Math.min(len, t);
    }
    if (Math.abs(dir.z) > 0.002) {
      const wallZ = dir.z > 0 ? hd : -hd;
      const t = (wallZ - origin.z) / dir.z;
      if (t > 0.05) len = Math.min(len, t);
    }
    return Math.max(0.2, len);
  }

  function drawBeam3d(origin, dir, length, width, cell, light) {
    if (cell.dim < 0.03) return;
    const isMh = light?.fixture?.kind === "mh";
    const isParAim = isParLed4(light?.fixture);
    const from = isMh
      ? {
          x: origin.x + dir.x * 0.16,
          y: origin.y + dir.y * 0.16,
          z: origin.z + dir.z * 0.16
        }
      : origin;
    const clipped = isMh || isParAim || isUplight(light?.fixture)
      ? beamLengthToRoom(from, dir, length, isMh ? { fullThrow: true, wallThrow: true } : undefined)
      : length;
    let side = vecCross(dir, { x: 0, y: 1, z: 0 });
    if (vecLen(side) < 0.08) side = vecCross(dir, state.view.right);
    side = vecNorm(side);
    const up = vecNorm(vecCross(side, dir));

    // Moving heads: thin conical shaft — long throw to far wall / floor / ceiling
    if (isMh) {
      const tipLen = Math.max(0.5, clipped);
      const steps = Math.max(12, Math.min(22, Math.round(tipLen * 1.15)));
      const rNear = 0.014;
      const rFar = Math.min(0.2, 0.018 + tipLen * 0.012);
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const r0 = rNear + (rFar - rNear) * t0;
        const r1 = rNear + (rFar - rNear) * t1;
        const a = {
          x: from.x + dir.x * tipLen * t0,
          y: from.y + dir.y * tipLen * t0,
          z: from.z + dir.z * tipLen * t0
        };
        const b = {
          x: from.x + dir.x * tipLen * t1,
          y: from.y + dir.y * tipLen * t1,
          z: from.z + dir.z * tipLen * t1
        };
        const alpha = 0.52 * (1 - t0 * 0.28) * cell.dim;
        const ring0 = ringPoints(a, side, up, r0, 10);
        const ring1 = ringPoints(b, side, up, r1, 10);
        for (let k = 0; k < 10; k += 1) {
          const n = (k + 1) % 10;
          fillProjected([ring0[k], ring0[n], ring1[n], ring1[k]], color(cell, alpha));
        }
      }
      return;
    }

    const segments = 18;
    const steps = 6;
    const flare = 1.15;
    const coreW = width;
    for (let i = 0; i < steps; i += 1) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const r0 = coreW * (0.1 + t0 * flare);
      const r1 = coreW * (0.1 + t1 * flare);
      const a = {
        x: origin.x + dir.x * clipped * t0,
        y: origin.y + dir.y * clipped * t0,
        z: origin.z + dir.z * clipped * t0
      };
      const b = {
        x: origin.x + dir.x * clipped * t1,
        y: origin.y + dir.y * clipped * t1,
        z: origin.z + dir.z * clipped * t1
      };
      const ring0 = ringPoints(a, side, up, r0, segments);
      const ring1 = ringPoints(b, side, up, r1, segments);
      const alpha = 0.22 * (1 - t0 * 0.75) * cell.dim + 0.03;
      for (let k = 0; k < segments; k += 1) {
        const n = (k + 1) % segments;
        fillProjected([ring0[k], ring0[n], ring1[n], ring1[k]], color(cell, alpha));
      }
      if (i === steps - 1) {
        fillProjected(ring1, color(cell, 0.18 * cell.dim));
      }
    }
  }

  function cellWorlds(origin, light) {
    const cells = lightCells(light);
    const yaw = fixtureRot(light.spot || light.fixture);
    if (cells.length <= 1) return [{ point: origin, cell: cells[0] }];
    const gap = cells.length > 6 ? 0.14 : 0.2;
    return cells.map((cell, index) => {
      const offset = (index - (cells.length - 1) / 2) * gap;
      return {
        cell,
        point: {
          x: origin.x + Math.cos(yaw) * offset,
          y: origin.y,
          z: origin.z + Math.sin(yaw) * offset
        }
      };
    });
  }

  function drawGoboOnPlane(origin, dir, cell, light, planeY) {
    if (!light || light.dim < 0.05) return;
    if (Math.abs(dir.y) < 0.04) return;
    const t = (planeY - origin.y) / dir.y;
    if (t < 0.4 || t > 10) return;
    const hit = {
      x: origin.x + dir.x * t,
      y: planeY + (planeY > 1 ? -0.02 : 0.03),
      z: origin.z + dir.z * t
    };
    if (Math.abs(hit.x) > ROOM.w * 0.55 || Math.abs(hit.z) > ROOM.d * 0.55) return;

    let side = vecCross(dir, { x: 0, y: 1, z: 0 });
    if (vecLen(side) < 0.08) side = { x: 1, y: 0, z: 0 };
    side = vecNorm(side);
    const up = vecNorm(vecCross(side, dir));
    const radius = 0.28 + t * 0.1;
    const pattern = goboPattern(light.gobo);
    const shake = (light.goboShake || 0) > 20
      ? Math.sin(performance.now() * 0.04) * 0.08
      : 0;

    // Tight spot only — no soft floor halo around MH beams
    if (!pattern) {
      // Moving heads: beam only, no end circle on floor/ceiling
      if (light.fixture?.kind === "mh") return;
      fillProjected(ringPoints(hit, side, up, radius * 0.22, 12, shake), color(cell, 0.4 * cell.dim));
      return;
    }

    if (pattern === 1) {
      fillProjected(ringPoints(hit, side, up, radius * 0.55, 16, shake), "rgba(2, 4, 10, 0.72)");
    } else if (pattern === 2) {
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + shake;
        const px = hit.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * radius * 0.5;
        const py = hit.y;
        const pz = hit.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * radius * 0.5;
        fillProjected(ringPoints({ x: px, y: py, z: pz }, side, up, radius * 0.12, 8), "rgba(2, 4, 10, 0.78)");
      }
    } else if (pattern === 3) {
      fillProjected(ringPoints(hit, side, up, radius * 0.85, 5, shake - Math.PI / 2), "rgba(2, 4, 10, 0.7)");
    } else if (pattern === 4 || pattern === 7) {
      fillProjected(ringPoints(hit, side, up, radius * 0.9, 18, shake), "rgba(2, 4, 10, 0.55)");
      fillProjected(ringPoints(hit, side, up, radius * 0.4, 16, shake), color(cell, 0.28 * cell.dim));
    } else if (pattern === 5) {
      const arm = radius * 0.75;
      fillProjected([
        { x: hit.x - side.x * arm * 0.18, y: hit.y, z: hit.z - side.z * arm * 0.18 },
        { x: hit.x + side.x * arm * 0.18, y: hit.y, z: hit.z + side.z * arm * 0.18 },
        { x: hit.x + side.x * arm * 0.18 + up.x * arm, y: hit.y, z: hit.z + side.z * arm * 0.18 + up.z * arm },
        { x: hit.x - side.x * arm * 0.18 + up.x * arm, y: hit.y, z: hit.z - side.z * arm * 0.18 + up.z * arm }
      ], "rgba(2, 4, 10, 0.75)");
      fillProjected([
        { x: hit.x - up.x * arm * 0.18, y: hit.y, z: hit.z - up.z * arm * 0.18 },
        { x: hit.x + up.x * arm * 0.18, y: hit.y, z: hit.z + up.z * arm * 0.18 },
        { x: hit.x + up.x * arm * 0.18 + side.x * arm, y: hit.y, z: hit.z + up.z * arm * 0.18 + side.z * arm },
        { x: hit.x - up.x * arm * 0.18 + side.x * arm, y: hit.y, z: hit.z - up.z * arm * 0.18 + side.z * arm }
      ], "rgba(2, 4, 10, 0.75)");
    } else if (pattern === 6) {
      fillProjected(ringPoints(hit, side, up, radius * 0.8, 3, shake), "rgba(2, 4, 10, 0.72)");
    } else {
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2 + shake;
        fillProjected([
          hit,
          {
            x: hit.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * radius,
            y: hit.y,
            z: hit.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * radius
          },
          {
            x: hit.x + (side.x * Math.cos(a + 0.18) + up.x * Math.sin(a + 0.18)) * radius * 0.35,
            y: hit.y,
            z: hit.z + (side.z * Math.cos(a + 0.18) + up.z * Math.sin(a + 0.18)) * radius * 0.35
          }
        ], "rgba(2, 4, 10, 0.7)");
      }
    }
  }

  function drawFloorAndCeiling(hw, hd, hh) {
    const woods = ["#2a1c14", "#221610", "#1c140e", "#261810", "#1a120c", "#24180f"];
    const plankW = 0.38;
    const n = Math.ceil(ROOM.w / plankW);
    for (let i = 0; i < n; i += 1) {
      const x0 = -hw + i * plankW;
      const x1 = Math.min(hw, x0 + plankW - 0.012);
      fillProjected(
        [{ x: x0, y: 0, z: -hd }, { x: x1, y: 0, z: -hd }, { x: x1, y: 0, z: hd }, { x: x0, y: 0, z: hd }],
        woods[i % woods.length]
      );
    }
    ctx.lineWidth = 1;
    for (let i = 1; i < n; i += 1) {
      const x = -hw + i * plankW - 0.006;
      fillProjected([{ x, y: 0.008, z: -hd }, { x, y: 0.008, z: hd }], "", "rgba(20, 12, 8, 0.28)");
    }

    // Scène / podium
    fillProjected(
      [{ x: -3.5, y: 0.04, z: -4.7 }, { x: 3.5, y: 0.04, z: -4.7 }, { x: 3.5, y: 0.04, z: -2.28 }, { x: -3.5, y: 0.04, z: -2.28 }],
      "#1a120e"
    );
    fillProjected(
      [{ x: -3.5, y: 0.04, z: -2.28 }, { x: 3.5, y: 0.04, z: -2.28 }, { x: 3.5, y: 0, z: -2.28 }, { x: -3.5, y: 0, z: -2.28 }],
      "#100c0a"
    );
    fillProjected(
      [{ x: -3.35, y: 0.055, z: -4.55 }, { x: 3.35, y: 0.055, z: -4.55 }, { x: 3.35, y: 0.055, z: -2.4 }, { x: -3.35, y: 0.055, z: -2.4 }],
      "#221810"
    );

    const ceilingCenter = { x: 0, y: hh, z: 0 };
    const ceilingToCam = {
      x: state.view.eye.x - ceilingCenter.x,
      y: state.view.eye.y - ceilingCenter.y,
      z: state.view.eye.z - ceilingCenter.z
    };
    if (ceilingToCam.y < 0) {
      fillProjected(
        [{ x: -hw, y: hh, z: -hd }, { x: hw, y: hh, z: -hd }, { x: hw, y: hh, z: hd }, { x: -hw, y: hh, z: hd }],
        "#08070a"
      );
      for (let ix = -3; ix <= 3; ix += 1) {
        for (let iz = -2; iz <= 2; iz += 1) {
          const cx = ix * 1.7;
          const cz = iz * 1.7;
          fillProjected(
            ringPoints({ x: cx, y: hh - 0.04, z: cz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.11, 10),
            "#16120e"
          );
          fillProjected(
            ringPoints({ x: cx, y: hh - 0.06, z: cz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.055, 8),
            "rgba(255, 190, 120, 0.08)"
          );
        }
      }
      for (let i = -3; i <= 3; i += 1) {
        fillProjected(
          [
            { x: -hw + 0.5, y: hh - 0.12, z: i * 1.35 - 0.1 },
            { x: hw - 0.5, y: hh - 0.12, z: i * 1.35 - 0.1 },
            { x: hw - 0.5, y: hh - 0.12, z: i * 1.35 + 0.1 },
            { x: -hw + 0.5, y: hh - 0.12, z: i * 1.35 + 0.1 }
          ],
          "#1c1814"
        );
      }
    }
  }

  function drawArtDecoBackdrop(hw, hh, hd) {
    const z = -hd + 0.06;
    const y0 = 0.08;
    const y1 = Math.min(hh - 0.15, 3.4);
    const x0 = -hw + 0.35;
    const x1 = hw - 0.35;
    fillProjected(
      [{ x: x0 - 0.12, y: y0, z }, { x: x1 + 0.12, y: y0, z }, { x: x1 + 0.12, y: y1 + 0.12, z }, { x: x0 - 0.12, y: y1 + 0.12, z }],
      "#0a0a0c"
    );
    fillProjected(
      [{ x: x0 - 0.2, y: y0, z: z + 0.02 }, { x: x0, y: y0, z: z + 0.02 }, { x: x0, y: y1 + 0.05, z: z + 0.02 }, { x: x0 - 0.2, y: y1 + 0.05, z: z + 0.02 }],
      "#121014"
    );
    fillProjected(
      [{ x: x1, y: y0, z: z + 0.02 }, { x: x1 + 0.2, y: y0, z: z + 0.02 }, { x: x1 + 0.2, y: y1 + 0.05, z: z + 0.02 }, { x: x1, y: y1 + 0.05, z: z + 0.02 }],
      "#121014"
    );
    if (!backdropImg.complete || !backdropImg.naturalWidth || !state.view) {
      fillProjected(
        [{ x: x0, y: y0, z: z + 0.01 }, { x: x1, y: y0, z: z + 0.01 }, { x: x1, y: y1, z: z + 0.01 }, { x: x0, y: y1, z: z + 0.01 }],
        "#1a1528"
      );
      return;
    }
    drawImageQuad(
      backdropImg,
      { x: x0, y: y1, z: z + 0.01 },
      { x: x1, y: y1, z: z + 0.01 },
      { x: x0, y: y0, z: z + 0.01 }
    );
  }

  function drawHallDrapes(hw, hh, hd) {
    const folds = 11;
    const step = (hd * 2) / folds;
    [-1, 1].forEach((side) => {
      const x = side * (hw - 0.03);
      for (let i = 0; i < folds; i += 1) {
        const z0 = -hd + i * step;
        const z1 = z0 + step;
        fillProjected(
          [{ x, y: 0, z: z0 }, { x, y: 0, z: z1 }, { x, y: hh, z: z1 }, { x, y: hh, z: z0 }],
          i % 2 === 0 ? "#14080c" : "#1a0c10"
        );
      }
    });
  }

  function linenRgb(facing, wrinkle) {
    const t = Math.max(0, Math.min(1, 0.42 + facing * 0.38 + wrinkle * 0.08));
    return `rgb(${Math.round(206 + t * 44)}, ${Math.round(196 + t * 42)}, ${Math.round(180 + t * 34)})`;
  }

  function facingLight(cx, cz, nx, nz) {
    const eye = state.view?.eye || { x: 0, z: 8 };
    const dx = eye.x - cx;
    const dz = eye.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    return (nx * dx + nz * dz) / len;
  }

  function drawChair3d(cx, cz, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const seatY = 0.46;
    const wood = "#3a2a1e";
    const woodLo = "#241810";
    const woodHi = "#4a3828";
    function lp(lx, ly, lz) {
      return {
        x: cx + lx * cos - lz * sin,
        y: ly,
        z: cz + lx * sin + lz * cos
      };
    }
    [[-0.15, -0.14], [0.15, -0.14], [-0.15, 0.14], [0.15, 0.14]].forEach(([lx, lz]) => {
      fillProjected(
        [lp(lx - 0.018, 0.02, lz), lp(lx + 0.018, 0.02, lz), lp(lx + 0.016, seatY, lz), lp(lx - 0.016, seatY, lz)],
        woodLo
      );
    });
    fillProjected(
      [lp(-0.15, 0.2, -0.04), lp(0.15, 0.2, -0.04), lp(0.15, 0.22, 0.04), lp(-0.15, 0.22, 0.04)],
      wood
    );
    fillProjected(
      [lp(-0.2, seatY - 0.05, -0.17), lp(0.2, seatY - 0.05, -0.17), lp(0.2, seatY - 0.05, 0.16), lp(-0.2, seatY - 0.05, 0.16)],
      woodLo
    );
    fillProjected(
      [lp(-0.2, seatY - 0.05, -0.17), lp(0.2, seatY - 0.05, -0.17), lp(0.2, seatY, -0.17), lp(-0.2, seatY, -0.17)],
      wood
    );
    fillProjected(
      [lp(-0.19, seatY, -0.16), lp(0.19, seatY, -0.16), lp(0.19, seatY, 0.15), lp(-0.19, seatY, 0.15)],
      "#6a4a32"
    );
    fillProjected(
      [lp(-0.175, seatY + 0.035, -0.145), lp(0.175, seatY + 0.035, -0.145), lp(0.175, seatY + 0.035, 0.13), lp(-0.175, seatY + 0.035, 0.13)],
      "#f3eee4"
    );
    fillProjected(
      [lp(-0.175, seatY, -0.145), lp(0.175, seatY, -0.145), lp(0.175, seatY + 0.035, -0.145), lp(-0.175, seatY + 0.035, -0.145)],
      "#e4ddd0"
    );
    fillProjected(
      [lp(-0.2, seatY, 0.145), lp(-0.16, seatY, 0.145), lp(-0.16, seatY + 0.54, 0.145), lp(-0.2, seatY + 0.54, 0.145)],
      woodHi
    );
    fillProjected(
      [lp(0.16, seatY, 0.145), lp(0.2, seatY, 0.145), lp(0.2, seatY + 0.54, 0.145), lp(0.16, seatY + 0.54, 0.145)],
      wood
    );
    fillProjected(
      [lp(-0.2, seatY + 0.5, 0.145), lp(0.2, seatY + 0.5, 0.145), lp(0.2, seatY + 0.56, 0.145), lp(-0.2, seatY + 0.56, 0.145)],
      woodHi
    );
    fillProjected(
      [lp(-0.155, seatY + 0.08, 0.138), lp(0.155, seatY + 0.08, 0.138), lp(0.155, seatY + 0.5, 0.138), lp(-0.155, seatY + 0.5, 0.138)],
      "#efe8dc"
    );
    fillProjected(
      [lp(-0.155, seatY + 0.08, 0.138), lp(0.155, seatY + 0.08, 0.138), lp(0.155, seatY + 0.12, 0.138), lp(-0.155, seatY + 0.12, 0.138)],
      "#e0d8cc"
    );
  }

  function drawPlaceSetting(cx, cz, angle, topY) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    function p(lx, y, lz) {
      return {
        x: cx + lx * cos - lz * sin,
        y,
        z: cz + lx * sin + lz * cos
      };
    }
    const side = { x: 1, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };
    fillProjected(ringPoints(p(0, topY + 0.01, 0), side, up, 0.09, 14), "#c8c2b6");
    fillProjected(ringPoints(p(0, topY + 0.014, 0), side, up, 0.078, 14), "#f7f4ee");
    fillProjected(ringPoints(p(0, topY + 0.016, 0), side, up, 0.062, 12), "#fffdf8");
    fillProjected(ringPoints(p(0, topY + 0.018, 0), side, up, 0.028, 10), "#f2eee6");
    fillProjected([
      p(-0.03, topY + 0.02, -0.012),
      p(0.03, topY + 0.02, -0.012),
      p(0.022, topY + 0.028, 0.032),
      p(-0.022, topY + 0.028, 0.032)
    ], "#1a3568");
    fillProjected([
      p(0.1, topY + 0.014, -0.05),
      p(0.112, topY + 0.014, -0.05),
      p(0.112, topY + 0.014, 0.055),
      p(0.1, topY + 0.014, 0.055)
    ], "#d0d4d8");
    fillProjected([
      p(-0.112, topY + 0.014, -0.05),
      p(-0.1, topY + 0.014, -0.05),
      p(-0.1, topY + 0.014, 0.055),
      p(-0.112, topY + 0.014, 0.055)
    ], "#d0d4d8");
    const glass = p(0.055, topY + 0.016, 0.062);
    fillProjected(ringPoints(glass, side, up, 0.016, 8), "#d8e2ea");
    fillPoleSegment(glass.x, glass.z, topY + 0.018, topY + 0.09, 0.005, "#d4dee6", "#c0ccd4");
    fillProjected(
      ringPoints({ x: glass.x, y: topY + 0.12, z: glass.z }, side, up, 0.02, 8),
      "rgba(200, 220, 232, 0.5)"
    );
    fillProjected(
      ringPoints({ x: glass.x, y: topY + 0.1, z: glass.z }, side, up, 0.016, 8),
      "rgba(180, 205, 220, 0.28)"
    );
  }

  function drawRoundTable3d(cx, cz, radius, chairs) {
    const topY = 0.76;
    const side = { x: 1, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };
    const n = chairs || 6;
    const hem = 0.03;
    const rTop = radius + 0.03;
    const rHem = radius + 0.07;
    fillProjected(
      ringPoints({ x: cx, y: 0.015, z: cz }, side, up, rHem + 0.16, 20),
      "rgba(0, 0, 0, 0.38)"
    );
    fillProjected(
      ringPoints({ x: cx, y: 0.018, z: cz }, side, up, rHem + 0.05, 18),
      "rgba(0, 0, 0, 0.22)"
    );
    const pleats = 28;
    for (let i = 0; i < pleats; i += 1) {
      const a0 = (i / pleats) * Math.PI * 2;
      const a1 = ((i + 1) / pleats) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const nx = Math.cos(am);
      const nz = Math.sin(am);
      const face = facingLight(cx, cz, nx, nz);
      const wrinkle = (i % 2 === 0 ? 1 : -1);
      fillProjected(
        [
          { x: cx + Math.cos(a0) * rTop, y: topY, z: cz + Math.sin(a0) * rTop },
          { x: cx + Math.cos(a1) * rTop, y: topY, z: cz + Math.sin(a1) * rTop },
          { x: cx + Math.cos(a1) * rHem, y: hem, z: cz + Math.sin(a1) * rHem },
          { x: cx + Math.cos(a0) * rHem, y: hem, z: cz + Math.sin(a0) * rHem }
        ],
        linenRgb(face, wrinkle)
      );
    }
    fillProjected(
      ringPoints({ x: cx, y: hem + 0.01, z: cz }, side, up, rHem + 0.01, 24),
      "rgba(40, 28, 18, 0.18)"
    );
    const sectors = 26;
    for (let i = 0; i < sectors; i += 1) {
      const a0 = (i / sectors) * Math.PI * 2;
      const a1 = ((i + 1) / sectors) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const face = facingLight(cx, cz, Math.cos(am), Math.sin(am));
      fillProjected(
        [
          { x: cx, y: topY, z: cz },
          { x: cx + Math.cos(a0) * radius, y: topY, z: cz + Math.sin(a0) * radius },
          { x: cx + Math.cos(a1) * radius, y: topY, z: cz + Math.sin(a1) * radius }
        ],
        linenRgb(face * 0.55 + 0.2, (i % 3 - 1) * 0.4)
      );
    }
    fillProjected(ringPoints({ x: cx, y: topY + 0.004, z: cz }, side, up, radius * 0.97, 24), "rgba(255, 252, 246, 0.18)");
    fillProjected(ringPoints({ x: cx, y: topY + 0.002, z: cz }, side, up, radius * 0.34, 16), "rgba(232, 222, 206, 0.22)");
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      drawPlaceSetting(cx + Math.cos(a) * radius * 0.58, cz + Math.sin(a) * radius * 0.58, a, topY);
    }
    fillProjected(ringPoints({ x: cx, y: topY + 0.02, z: cz }, side, up, 0.16, 14), "#2e3a28");
    fillProjected(ringPoints({ x: cx, y: topY + 0.045, z: cz }, side, up, 0.13, 12), "#4a5a3e");
    fillProjected(ringPoints({ x: cx, y: topY + 0.07, z: cz }, side, up, 0.09, 10), "#c4a090");
    fillProjected(ringPoints({ x: cx, y: topY + 0.085, z: cz }, side, up, 0.055, 8), "#d8b8a4");
    [-0.05, 0, 0.05].forEach((ox, idx) => {
      const oz = idx === 1 ? 0.03 : -0.02;
      fillProjected(
        ringPoints({ x: cx + ox, y: topY + 0.09, z: cz + oz }, side, up, 0.018, 8),
        "#e8e0d4"
      );
      fillPoleSegment(cx + ox, cz + oz, topY + 0.09, topY + 0.16, 0.007, "#f4efe6", "#e6ddd0");
      fillProjected(
        ringPoints({ x: cx + ox, y: topY + 0.175, z: cz + oz }, side, up, 0.01, 8),
        "rgba(255, 210, 140, 0.55)"
      );
    });
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      drawChair3d(cx + Math.cos(a) * (radius + 0.5), cz + Math.sin(a) * (radius + 0.5), a + Math.PI);
    }
  }

  function drawDanceFloor3d(floor) {
    const hw = floor.w * 0.5;
    const hd = floor.d * 0.5;
    const x0 = floor.x - hw;
    const x1 = floor.x + hw;
    const z0 = floor.z - hd;
    const z1 = floor.z + hd;
    const y = 0.04;
    const oak = ["#8a5c34", "#7a4e2a", "#946640", "#6e4428", "#825430", "#7e542e"];
    const walnut = "#3a2418";
    const gap = 0.01;
    const yy = y + 0.01;

    fillProjected(
      [{ x: x0 - 0.1, y: y, z: z0 - 0.1 }, { x: x1 + 0.1, y: y, z: z0 - 0.1 }, { x: x1 + 0.1, y: y, z: z1 + 0.1 }, { x: x0 - 0.1, y: y, z: z1 + 0.1 }],
      "#1a100c"
    );
    fillProjected(
      [{ x: x0 - 0.05, y: y + 0.006, z: z0 - 0.05 }, { x: x1 + 0.05, y: y + 0.006, z: z0 - 0.05 }, { x: x1 + 0.05, y: y + 0.006, z: z1 + 0.05 }, { x: x0 - 0.05, y: y + 0.006, z: z1 + 0.05 }],
      walnut
    );

    const plankD = 0.13;
    const rows = Math.max(8, Math.round((z1 - z0) / plankD));
    const td = (z1 - z0) / rows;
    for (let iz = 0; iz < rows; iz += 1) {
      const az = z0 + iz * td;
      const segs = 4 + (iz % 2);
      let ax = x0;
      for (let ix = 0; ix < segs; ix += 1) {
        const remain = segs - ix;
        const tw = ix === segs - 1 ? x1 - ax : (x1 - x0) / segs + ((ix + iz) % 3 - 1) * 0.08;
        const bx = Math.min(x1, ax + tw);
        fillProjected(
          [
            { x: ax + gap, y: yy, z: az + gap },
            { x: bx - gap, y: yy, z: az + gap },
            { x: bx - gap, y: yy, z: az + td - gap },
            { x: ax + gap, y: yy, z: az + td - gap }
          ],
          oak[(ix + iz * 2) % oak.length]
        );
        ax = bx;
        void remain;
      }
    }

    const wash = washRgb();
    const rim = wash
      ? rgba(wash.r, wash.g, wash.b, Math.min(0.28, 0.08 + wash.dim * 0.04))
      : "rgba(90, 58, 32, 0.4)";
    fillProjected(
      [{ x: x0 - 0.06, y: y + 0.016, z: z0 - 0.06 }, { x: x1 + 0.06, y: y + 0.016, z: z0 - 0.06 }, { x: x1 + 0.06, y: y + 0.016, z: z0 }, { x: x0 - 0.06, y: y + 0.016, z: z0 }],
      rim
    );
    fillProjected(
      [{ x: x0 - 0.06, y: y + 0.016, z: z1 }, { x: x1 + 0.06, y: y + 0.016, z: z1 }, { x: x1 + 0.06, y: y + 0.016, z: z1 + 0.06 }, { x: x0 - 0.06, y: y + 0.016, z: z1 + 0.06 }],
      rim
    );
  }

  function orientedPoint(cx, cz, yaw, lx, y, lz) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      x: cx + lx * cos - lz * sin,
      y,
      z: cz + lx * sin + lz * cos
    };
  }

  function drawOrientedBox3d(cx, y0, cz, w, h, d, yaw, fills) {
    const hw = w / 2;
    const hd = d / 2;
    const y1 = y0 + h;
    const p = (lx, y, lz) => orientedPoint(cx, cz, yaw, lx, y, lz);
    fillProjected([p(-hw, y0, -hd), p(hw, y0, -hd), p(hw, y1, -hd), p(-hw, y1, -hd)], fills.back);
    fillProjected([p(-hw, y0, -hd), p(-hw, y0, hd), p(-hw, y1, hd), p(-hw, y1, -hd)], fills.left);
    fillProjected([p(hw, y0, hd), p(hw, y0, -hd), p(hw, y1, -hd), p(hw, y1, hd)], fills.right);
    fillProjected([p(-hw, y1, -hd), p(hw, y1, -hd), p(hw, y1, hd), p(-hw, y1, hd)], fills.top);
    fillProjected([p(-hw, y0, hd), p(hw, y0, hd), p(hw, y1, hd), p(-hw, y1, hd)], fills.front);
  }

  function drawPolarColumn3d(cx, cz, yaw) {
    const subW = 0.46;
    const subH = 0.62;
    const subD = 0.5;
    const colW = 0.14;
    const colD = 0.13;
    const midH = 0.78;
    const topH = 0.8;
    const white = {
      back: "#c8ccd2",
      left: "#d5d8de",
      right: "#bec2c8",
      top: "#f3f4f6",
      front: "#e8eaee"
    };

    fillProjected(
      ringPoints({ x: cx, y: 0.02, z: cz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.34, 14),
      "rgba(8, 10, 16, 0.4)"
    );
    drawOrientedBox3d(cx, 0.03, cz, subW, subH, subD, yaw, white);
    const cupY = 0.03 + subH;
    drawOrientedBox3d(cx, cupY, cz, colW, midH + topH, colD, yaw, white);
  }

  function drawDanceFloorPa3d() {
    (state.venue.pas || []).forEach((pa) => {
      drawPolarColumn3d(pa.x, pa.z, pa.yaw || 0);
    });
  }

  function boothFromPas(pas) {
    const list = pas || [];
    const left = list.find((p) => p.id === "paL") || list[0];
    const right = list.find((p) => p.id === "paR") || list[1];
    if (!left || !right) return { x: 0, z: -0.35, yaw: 0 };
    return {
      x: (left.x + right.x) / 2,
      z: (left.z + right.z) / 2,
      yaw: 0
    };
  }

  function syncBoothBetweenPas() {
    const pose = boothFromPas(state.venue.pas);
    state.venue.djBooth = { ...(state.venue.djBooth || {}), ...pose };
  }

  function placeFixtureAt(id, wx, wz) {
    const fixture = state.patch.fixtures.find((item) => item.id === id);
    if (!fixture) return;
    const spot = worldToSpot(wx, wz);
    fixture.x = spot.x;
    fixture.y = spot.y;
    if (!Array.isArray(fixture.spots) || !fixture.spots[0]) {
      fixture.spots = [{ x: spot.x, y: spot.y, rot: fixture.rot || 0 }];
    } else {
      fixture.spots[0].x = spot.x;
      fixture.spots[0].y = spot.y;
    }
  }

  function clampVenueXZ(x, z) {
    return {
      x: Math.min(ROOM.w * 0.45, Math.max(-ROOM.w * 0.45, x)),
      z: Math.min(ROOM.d * 0.45, Math.max(-ROOM.d * 0.45, z))
    };
  }

  function restoreDefaultFixtureLayout() {
    const byId = Object.fromEntries(DEFAULT_PATCH.fixtures.map((item) => [item.id, item]));
    state.patch.fixtures.forEach((fixture) => {
      const def = byId[fixture.id];
      if (!def) return;
      fixture.x = def.x;
      fixture.y = def.y;
      if (def.mount) fixture.mount = def.mount;
      if (def.count) fixture.count = def.count;
      if (Array.isArray(fixture.spots) && fixture.spots[0]) {
        fixture.spots[0].x = def.x;
        fixture.spots[0].y = def.y;
      } else {
        fixture.spots = [{ x: def.x, y: def.y, rot: fixture.rot || 0 }];
      }
    });
    syncParLedsAbovePas();
    syncWash2OnCaisses();
  }

  function syncPasToDanceFloor() {
    const floor = state.venue?.danceFloor || DEFAULT_VENUE.danceFloor;
    const cx = floor.x;
    const cz = floor.z;
    const hd = (floor.d || 3.4) * 0.5;
    const pas = state.venue.pas || [];
    const left = pas.find((p) => p.id === "paL") || pas[0];
    const right = pas.find((p) => p.id === "paR") || pas[1];
    if (left) {
      left.x = cx - 2.45;
      left.z = cz - hd - 0.48;
    }
    if (right) {
      right.x = cx + 2.45;
      right.z = cz - hd - 0.48;
    }
    syncBoothBetweenPas();
    syncParLedsAbovePas();
    syncWash2OnCaisses();
  }

  function drawDjBooth3d(cx, cz, yaw) {
    const pedW = 0.62;
    const pedH = 0.92;
    const pedD = 0.5;
    const topW = 1.12;
    const topD = 0.66;
    const topH = 0.055;
    const white = {
      back: "#e4e6ea",
      left: "#f2f3f6",
      right: "#d8dae0",
      top: "#f7f8fa",
      front: "#f4f5f7"
    };
    const walnut = {
      back: "#3a2418",
      left: "#4a3222",
      right: "#2e1c12",
      top: "#6a4a30",
      front: "#5a3c26"
    };

    fillProjected(
      ringPoints({ x: cx, y: 0.02, z: cz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.42, 14),
      "rgba(8, 10, 16, 0.4)"
    );
    drawOrientedBox3d(cx, 0.03, cz, pedW, pedH, pedD, yaw, white);

    const logo = orientedPoint(cx, cz, yaw, 0, 0.03 + pedH * 0.55, pedD / 2 + 0.012);
    const side = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
    const up = { x: 0, y: 1, z: 0 };
    fillProjected(ringPoints(logo, side, up, 0.175, 18), "#3a2818");
    fillProjected(ringPoints(logo, side, up, 0.155, 18), "#6b4a2e");
    const projected = projectWorld(logo, state.view.w, state.view.h);
    const bars = [0.04, 0.07, 0.1, 0.07, 0.04];
    bars.forEach((w, i) => {
      const lx = (i - 2) * 0.032;
      fillProjected([
        orientedPoint(cx, cz, yaw, lx - 0.008, logo.y + 0.055, pedD / 2 + 0.014),
        orientedPoint(cx, cz, yaw, lx + 0.008, logo.y + 0.055, pedD / 2 + 0.014),
        orientedPoint(cx, cz, yaw, lx + 0.008, logo.y + 0.055 + w, pedD / 2 + 0.014),
        orientedPoint(cx, cz, yaw, lx - 0.008, logo.y + 0.055 + w, pedD / 2 + 0.014)
      ], "#e8dcc8");
    });
    if (projected) {
      const s = Math.max(7, 0.155 * projected.s);
      ctx.save();
      ctx.fillStyle = "#e8dcc8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${Math.max(7, s * 0.38)}px Arial`;
      ctx.fillText("DJ", projected.x, projected.y + s * 0.02);
      ctx.fillText("CARL", projected.x, projected.y + s * 0.4);
      ctx.restore();
    }

    const ledY = 0.03 + pedH;
    fillProjected(
      ringPoints(orientedPoint(cx, cz, yaw, 0, ledY, 0), { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.3, 14),
      "rgba(120, 255, 170, 0.45)"
    );
    drawOrientedBox3d(cx, ledY, cz, topW, topH, topD, yaw, walnut);

    const deckY = ledY + topH + 0.004;
    drawOrientedBox3d(cx, deckY, cz, 0.78, 0.03, 0.34, yaw, white);
    [-0.22, 0.22].forEach((lx) => {
      const platter = orientedPoint(cx, cz, yaw, lx, deckY + 0.032, 0.02);
      fillProjected(ringPoints(platter, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.09, 14), "#d8dce2");
      fillProjected(ringPoints(platter, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.018, 10), "#9aa0a8");
    });

    [-0.46, 0.46].forEach((lx) => {
      const post = orientedPoint(cx, cz, yaw, lx, 0, 0.18);
      fillPoleSegment(post.x, post.z, deckY, deckY + 0.42, 0.022, "#f0f2f5", "#d0d4da");
      const armY = deckY + 0.4;
      const out = lx > 0 ? 0.28 : -0.28;
      fillProjected([
        orientedPoint(cx, cz, yaw, lx - 0.02, armY - 0.015, 0.18),
        orientedPoint(cx, cz, yaw, lx + out, armY - 0.015, 0.18),
        orientedPoint(cx, cz, yaw, lx + out, armY + 0.015, 0.18),
        orientedPoint(cx, cz, yaw, lx - 0.02, armY + 0.015, 0.18)
      ], "#eceef2");
      const tray = orientedPoint(cx, cz, yaw, lx + out, armY, 0.18);
      drawOrientedBox3d(tray.x, armY - 0.01, tray.z, 0.26, 0.02, 0.18, yaw, white);
    });
  }

  const VENUE_STORE = "djcarl-viz-venue-v2";
  const DEFAULT_VENUE = {
    danceFloor: { x: 0, z: -0.35, w: 6.4, d: 3.4 },
    pas: [
      { id: "paL", x: -2.45, z: -2.53, yaw: 0 },
      { id: "paR", x: 2.45, z: -2.53, yaw: 0 }
    ],
    djBooth: { x: 0, z: -2.53, yaw: 0 },
    tables: [
      { id: "t1", x: -5.1, z: -0.6, r: 0.55, n: 6 },
      { id: "t2", x: -5.1, z: 1.6, r: 0.55, n: 6 },
      { id: "t3", x: -4.6, z: 3.5, r: 0.5, n: 5 },
      { id: "t4", x: 5.1, z: -0.6, r: 0.55, n: 6 },
      { id: "t5", x: 5.1, z: 1.6, r: 0.55, n: 6 },
      { id: "t6", x: 4.6, z: 3.5, r: 0.5, n: 5 },
      { id: "t7", x: -2.2, z: 3.8, r: 0.52, n: 6 },
      { id: "t8", x: 2.2, z: 3.8, r: 0.52, n: 6 },
      { id: "t9", x: 0, z: 4.4, r: 0.55, n: 6 }
    ]
  };

  function readStoredVenue() {
    try {
      const raw = JSON.parse(localStorage.getItem(VENUE_STORE) || "");
      if (!raw || !raw.danceFloor || !Array.isArray(raw.tables)) return null;
      if (!Array.isArray(raw.pas)) raw.pas = structuredClone(DEFAULT_VENUE.pas);
      if (!raw.djBooth) raw.djBooth = boothFromPas(raw.pas);
      return raw;
    } catch {
      return null;
    }
  }

  function rememberVenue() {
    try {
      localStorage.setItem(VENUE_STORE, JSON.stringify(state.venue));
    } catch {
      // ignore
    }
  }

  state.venue = readStoredVenue() || structuredClone(DEFAULT_VENUE);
  state.venue.tables = structuredClone(DEFAULT_VENUE.tables);
  restoreDefaultFixtureLayout();
  syncPasToDanceFloor();
  rememberVenue();
  rememberPatch(state.patch);

  function drawVenueFurniture() {
    drawDanceFloor3d(state.venue.danceFloor);
    drawDanceFloorPa3d();
    const booth = state.venue.djBooth || boothFromPas(state.venue.pas);
    drawDjBooth3d(booth.x, booth.z, booth.yaw || 0);
    state.venue.tables.forEach((t) => drawRoundTable3d(t.x, t.z, t.r, t.n));
  }

  function findHoveredVenue(w, h) {
    if (state.mode !== "3d" || !state.pointer.overCanvas) return null;
    let best = null;
    let bestDist = 44;
    state.venue.tables.forEach((table) => {
      const point = projectWorld({ x: table.x, y: 0.74, z: table.z }, w, h);
      if (!point) return;
      const dist = Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: "table", id: table.id, point, label: "Table ronde" };
      }
    });
    (state.venue.pas || []).forEach((pa) => {
      const point = projectWorld({ x: pa.x, y: 1.1, z: pa.z }, w, h);
      if (!point) return;
      const dist = Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: "pa", id: pa.id, point, label: "HK Polar" };
      }
    });
    const booth = state.venue.djBooth;
    if (booth) {
      const point = projectWorld({ x: booth.x, y: 1.0, z: booth.z }, w, h);
      if (point) {
        const dist = Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y);
        if (dist < Math.max(bestDist, 48)) {
          bestDist = dist;
          best = { kind: "djBooth", id: "djBooth", point, label: "Console DJ Carl" };
        }
      }
    }
    const floor = state.venue.danceFloor;
    const floorPt = projectWorld({ x: floor.x, y: 0.05, z: floor.z }, w, h);
    if (floorPt) {
      const dist = Math.hypot(state.pointer.x - floorPt.x, state.pointer.y - floorPt.y);
      if (dist < 52 && dist < bestDist + 8) {
        best = { kind: "danceFloor", id: "danceFloor", point: floorPt, label: "Piste de danse" };
      }
    }
    return best;
  }

  function fillPoleSegment(cx, cz, y0, y1, r, fillA, fillB) {
    fillProjected([
      { x: cx - r, y: y0, z: cz - r * 0.35 },
      { x: cx + r, y: y0, z: cz - r * 0.35 },
      { x: cx + r, y: y1, z: cz - r * 0.35 },
      { x: cx - r, y: y1, z: cz - r * 0.35 }
    ], fillA);
    fillProjected([
      { x: cx - r, y: y0, z: cz + r * 0.35 },
      { x: cx + r, y: y0, z: cz + r * 0.35 },
      { x: cx + r, y: y1, z: cz + r * 0.35 },
      { x: cx - r, y: y1, z: cz + r * 0.35 }
    ], fillB);
  }

  function drawStandKnob3d(cx, cy, cz, side, fill) {
    const u = { x: 0, y: 1, z: 0 };
    const disk = ringPoints(
      { x: cx + side.x * 0.05, y: cy, z: cz + side.z * 0.05 },
      side,
      u,
      0.045,
      10
    );
    fillProjected(disk, fill);
    fillProjected(
      ringPoints(
        { x: cx + side.x * 0.055, y: cy, z: cz + side.z * 0.055 },
        side,
        u,
        0.016,
        8
      ),
      "#e8e8ea"
    );
  }

  function drawLb150Tripod3d(light) {
    const head = lightWorld(light);
    const pan = mhPanRad(light);
    const on = light.dim > 0.04;
    const cell = lightCells(light)[0] || light;
    const cx = head.x;
    const cz = head.z;
    const hubY = 0.95 * FT;
    const collarY = Math.max(hubY + 0.35, head.y - 1.15);
    const tipY = head.y - 0.14;
    const legR = 0.78;
    const black = "#16181c";
    const blackHi = "#22252c";
    const blackLo = "#0e1014";

    // Legs + braces + rubber feet (K&M layout)
    for (let i = 0; i < 3; i += 1) {
      const a = pan * 0.08 + (i / 3) * Math.PI * 2 + Math.PI / 6;
      const fx = cx + Math.cos(a) * legR;
      const fz = cz + Math.sin(a) * legR;
      const midX = cx + Math.cos(a) * legR * 0.52;
      const midZ = cz + Math.sin(a) * legR * 0.52;
      // Leg tube
      fillProjected([
        { x: cx - 0.025, y: hubY, z: cz },
        { x: cx + 0.025, y: hubY, z: cz },
        { x: fx + 0.02, y: 0.04, z: fz },
        { x: fx - 0.02, y: 0.04, z: fz }
      ], black);
      fillProjected([
        { x: cx, y: hubY, z: cz - 0.025 },
        { x: cx, y: hubY, z: cz + 0.025 },
        { x: fx, y: 0.04, z: fz + 0.02 },
        { x: fx, y: 0.04, z: fz - 0.02 }
      ], blackHi);
      // Brace from hub to mid-leg
      fillProjected([
        { x: cx - 0.015, y: hubY + 0.02, z: cz },
        { x: cx + 0.015, y: hubY + 0.02, z: cz },
        { x: midX + 0.012, y: hubY * 0.45, z: midZ },
        { x: midX - 0.012, y: hubY * 0.45, z: midZ }
      ], blackLo);
      // Rubber foot
      fillProjected(
        ringPoints({ x: fx, y: 0.035, z: fz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.055, 10),
        "#0a0b0d"
      );
      fillProjected(
        ringPoints({ x: fx, y: 0.06, z: fz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.04, 8),
        "#1a1c20"
      );
    }

    // Hub + leg lock knob
    fillProjected(
      ringPoints({ x: cx, y: hubY, z: cz }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.07, 12),
      blackHi
    );
    drawStandKnob3d(cx, hubY, cz, { x: 1, y: 0, z: 0 }, "#2a2e36");

    // Lower thick tube + upper thin telescopic tube
    fillPoleSegment(cx, cz, 0.06, collarY, 0.045, black, blackHi);
    fillPoleSegment(cx, cz, collarY - 0.02, tipY - 0.02, 0.03, blackHi, "#2a2e34");
    // Height collar
    fillPoleSegment(cx, cz, collarY - 0.04, collarY + 0.05, 0.055, blackLo, black);
    drawStandKnob3d(cx, collarY, cz, { x: 0, y: 0, z: 1 }, "#2a2e36");
    // Safety pin through extension
    fillProjected([
      { x: cx - 0.07, y: collarY + 0.08, z: cz - 0.01 },
      { x: cx + 0.07, y: collarY + 0.08, z: cz - 0.01 },
      { x: cx + 0.07, y: collarY + 0.1, z: cz + 0.01 },
      { x: cx - 0.07, y: collarY + 0.1, z: cz + 0.01 }
    ], "#a8adb8");
    // Silver tip
    fillPoleSegment(cx, cz, tipY - 0.06, tipY + 0.02, 0.028, "#b8bcc6", "#d0d4dc");

    // ——— Betopper LB150 moving head (pan around Y) ———
    const cos = Math.cos(pan);
    const sin = Math.sin(pan);
    const baseY = tipY + 0.02;
    function lp(lx, ly, lz) {
      return {
        x: cx + lx * cos - lz * sin,
        y: ly,
        z: cz + lx * sin + lz * cos
      };
    }
    function boxFace(corners, fill) {
      fillProjected(corners.map(([lx, ly, lz]) => lp(lx, ly, lz)), fill);
    }

    // Base box + mounting ears
    const bw = 0.18;
    const bd = 0.14;
    const bh = 0.11;
    boxFace([[-bw, baseY, -bd], [bw, baseY, -bd], [bw, baseY + bh, -bd], [-bw, baseY + bh, -bd]], "#12151a");
    boxFace([[-bw, baseY, bd], [bw, baseY, bd], [bw, baseY + bh, bd], [-bw, baseY + bh, bd]], "#0e1014");
    boxFace([[-bw, baseY + bh, -bd], [bw, baseY + bh, -bd], [bw, baseY + bh, bd], [-bw, baseY + bh, bd]], "#1a1e26");
    boxFace([[-bw, baseY, -bd], [-bw, baseY, bd], [-bw, baseY + bh, bd], [-bw, baseY + bh, -bd]], "#161920");
    boxFace([[bw, baseY, -bd], [bw, baseY, bd], [bw, baseY + bh, bd], [bw, baseY + bh, -bd]], "#161920");
    // Ears
    boxFace([[-0.24, baseY + 0.02, -0.04], [-0.18, baseY + 0.02, -0.04], [-0.18, baseY + 0.09, -0.04], [-0.24, baseY + 0.09, -0.04]], "#0a0c10");
    boxFace([[0.18, baseY + 0.02, -0.04], [0.24, baseY + 0.02, -0.04], [0.24, baseY + 0.09, -0.04], [0.18, baseY + 0.09, -0.04]], "#0a0c10");
    // LCD glow on front face
    if (on) {
      fillProjected(
        [lp(-0.1, baseY + 0.03, -bd - 0.002), lp(-0.02, baseY + 0.03, -bd - 0.002), lp(-0.02, baseY + 0.08, -bd - 0.002), lp(-0.1, baseY + 0.08, -bd - 0.002)],
        "rgba(30,220,255,0.35)"
      );
    }

    // Black U-yoke
    const yokeTop = baseY + bh + 0.32;
    const yokeW = 0.2;
    const armT = 0.035;
    boxFace([[-yokeW - armT, baseY + bh * 0.5, -armT], [-yokeW + armT, baseY + bh * 0.5, -armT], [-yokeW + armT, yokeTop, -armT], [-yokeW - armT, yokeTop, -armT]], "#1a1d24");
    boxFace([[-yokeW - armT, baseY + bh * 0.5, armT], [-yokeW + armT, baseY + bh * 0.5, armT], [-yokeW + armT, yokeTop, armT], [-yokeW - armT, yokeTop, armT]], "#12151a");
    boxFace([[yokeW - armT, baseY + bh * 0.5, -armT], [yokeW + armT, baseY + bh * 0.5, -armT], [yokeW + armT, yokeTop, -armT], [yokeW - armT, yokeTop, -armT]], "#1a1d24");
    boxFace([[yokeW - armT, baseY + bh * 0.5, armT], [yokeW + armT, baseY + bh * 0.5, armT], [yokeW + armT, yokeTop, armT], [yokeW - armT, yokeTop, armT]], "#12151a");
    boxFace([[-yokeW - armT, yokeTop - 0.04, -armT], [yokeW + armT, yokeTop - 0.04, -armT], [yokeW + armT, yokeTop + 0.02, -armT], [-yokeW - armT, yokeTop + 0.02, -armT]], "#22262e");
    boxFace([[-yokeW - armT, yokeTop - 0.04, armT], [yokeW + armT, yokeTop - 0.04, armT], [yokeW + armT, yokeTop + 0.02, armT], [-yokeW - armT, yokeTop + 0.02, armT]], "#161920");

    // Cylindrical head along beam direction (big front lens)
    const dir = beamDir(light);
    let side = vecCross(dir, { x: 0, y: 1, z: 0 });
    if (vecLen(side) < 0.08) side = { x: cos, y: 0, z: sin };
    side = vecNorm(side);
    const up = vecNorm(vecCross(side, dir));
    const pivot = {
      x: head.x,
      y: baseY + bh + 0.16,
      z: head.z
    };
    const hr = 0.1;
    const hLen = 0.22;
    // Barrel as stacked rings along dir
    for (let s = -1; s <= 1; s += 1) {
      const t = s * 0.55;
      const c = {
        x: pivot.x + dir.x * t * hLen,
        y: pivot.y + dir.y * t * hLen,
        z: pivot.z + dir.z * t * hLen
      };
      const r = hr * (s < 0 ? 0.72 : s === 0 ? 0.92 : 1);
      fillProjected(ringPoints(c, side, up, r, 12), s < 0 ? "#161a22" : "#0c0e12");
    }
    // Front lens bezel + glass
    const lensCenter = {
      x: pivot.x + dir.x * (hLen * 0.62),
      y: pivot.y + dir.y * (hLen * 0.62),
      z: pivot.z + dir.z * (hLen * 0.62)
    };
    fillProjected(ringPoints(lensCenter, side, up, 0.13, 16), "#050608");
    fillProjected(ringPoints(lensCenter, side, up, 0.115, 16), "#2a303a");
    fillProjected(
      ringPoints(lensCenter, side, up, 0.1, 16),
      on ? color(cell, 0.9) : "#1a2230"
    );
  }

  function drawFixtureBody3d(light) {
    const origin = lightWorld(light);
    const cell = lightCells(light)[0] || light;
    const on = (cell.dim || 0) > 0.04;
    const yaw = fixtureRot(light.spot || light.fixture);
    const black = {
      back: "#1a1c22",
      left: "#242830",
      right: "#14161c",
      top: "#2c3038",
      front: "#1e2228"
    };
    if (isUplight(light.fixture) || isLedWash2(light.fixture)) {
      fillProjected(
        ringPoints({ x: origin.x, y: 0.03, z: origin.z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.13, 12),
        "rgba(8, 8, 10, 0.4)"
      );
      fillPoleSegment(origin.x, origin.z, 0.04, 0.2, 0.085, "#2a2e36", "#1a1e26");
      fillProjected(
        ringPoints({ x: origin.x, y: 0.22, z: origin.z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.07, 12),
        on ? color(cell, 0.88) : "#3a4050"
      );
      return;
    }
    if (light.fixture.kind === "bar") {
      const cells = lightCells(light);
      const len = Math.max(0.7, cells.length * 0.15);
      drawOrientedBox3d(origin.x, origin.y - 0.05, origin.z, len, 0.08, 0.1, yaw, black);
      cells.forEach((item, index) => {
        const offset = (index - (cells.length - 1) / 2) * (len / Math.max(1, cells.length));
        const p = orientedPoint(origin.x, origin.z, yaw, offset, origin.y - 0.06, 0.06);
        fillProjected(
          ringPoints(p, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.03, 8),
          item.dim > 0.04 ? color(item, 0.9) : "#2a3038"
        );
      });
      return;
    }
    drawOrientedBox3d(origin.x, origin.y - 0.07, origin.z, 0.2, 0.14, 0.2, yaw, black);
    fillProjected(
      ringPoints({ x: origin.x, y: origin.y - 0.09, z: origin.z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.07, 12),
      on ? color(cell, 0.85) : "#2a3038"
    );
  }

  function draw3dRoom(w, h, lights, now) {
    state.view = makeView(w, h);
    state.wash = washColor(lights);
    ctx.fillStyle = "#050406";
    ctx.fillRect(0, 0, w, h);

    const hw = ROOM.w / 2;
    const hd = ROOM.d / 2;
    const hh = ROOM.h;
    const walls = [
      { n: { x: 0, y: 0, z: -1 }, pts: [{ x: -hw, y: 0, z: -hd }, { x: hw, y: 0, z: -hd }, { x: hw, y: hh, z: -hd }, { x: -hw, y: hh, z: -hd }], fill: "#0c0a0c" },
      { n: { x: 0, y: 0, z: 1 }, pts: [{ x: hw, y: 0, z: hd }, { x: -hw, y: 0, z: hd }, { x: -hw, y: hh, z: hd }, { x: hw, y: hh, z: hd }], fill: "#0a080a" },
      { n: { x: -1, y: 0, z: 0 }, pts: [{ x: -hw, y: 0, z: hd }, { x: -hw, y: 0, z: -hd }, { x: -hw, y: hh, z: -hd }, { x: -hw, y: hh, z: hd }], fill: "#0b090b" },
      { n: { x: 1, y: 0, z: 0 }, pts: [{ x: hw, y: 0, z: -hd }, { x: hw, y: 0, z: hd }, { x: hw, y: hh, z: hd }, { x: hw, y: hh, z: -hd }], fill: "#0b090b" }
    ];

    walls.forEach((wall) => {
      const center = {
        x: (wall.pts[0].x + wall.pts[2].x) / 2,
        y: hh * 0.5,
        z: (wall.pts[0].z + wall.pts[2].z) / 2
      };
      const toCam = {
        x: state.view.eye.x - center.x,
        y: state.view.eye.y - center.y,
        z: state.view.eye.z - center.z
      };
      if (toCam.x * wall.n.x + toCam.y * wall.n.y + toCam.z * wall.n.z > 0) return;
      fillProjected(wall.pts, wall.fill);
    });

    drawFloorAndCeiling(hw, hd, hh);
    drawHallDrapes(hw, hh, hd);
    drawArtDecoBackdrop(hw, hh, hd);
    drawVenueFurniture();

    const wash = state.wash;
    if (wash.dim > 0.01) {
      const tint = Math.min(0.05, 0.01 + wash.dim / lights.length * 0.04);
      ctx.fillStyle = `rgba(${Math.round(wash.r / wash.dim)}, ${Math.round(wash.g / wash.dim)}, ${Math.round(wash.b / wash.dim)}, ${tint})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.globalAlpha = 0.18;
    drawHaze(w, h, lights, now);
    ctx.restore();

    ctx.globalCompositeOperation = "lighter";
    lights.forEach((light) => {
      if (isLaser(light.fixture)) {
        drawLaserBeams3d(light);
        return;
      }
      const origin = lightWorld(light);
      const dir = beamDir(light);
      cellWorlds(origin, light).forEach(({ point, cell }) => {
        const wide = isLedWash2(light.fixture)
          ? 0.28
          : isUplight(light.fixture)
          ? 0.85
          : light.fixture.kind === "mh"
            ? 0.12
            : isParLed4(light.fixture)
              ? 0.7
            : light.fixture.kind === "bar"
              ? 0.48
              : 0.9;
        const length = isLedWash2(light.fixture)
          ? 0.95
          : isUplight(light.fixture)
          ? 4.9
          : light.fixture.kind === "mh"
            ? 20
            : isParLed4(light.fixture)
              ? 6.5
            : light.fixture.kind === "par"
              ? 5.5
              : 5.0;
        drawBeam3d(point, dir, length, wide, cell, light);
      });
    });
    ctx.globalCompositeOperation = "source-over";

    lights.forEach((light) => {
      if (light.fixture.kind === "mh" || !isUplight(light.fixture) || isLedWash2(light.fixture)) return;
      const origin = lightWorld(light);
      const dir = beamDir(light);
      const cell = lightCells(light)[0] || light;
      if (dir.y < -0.05) drawGoboOnPlane(origin, dir, cell, light, 0);
      if (dir.y > 0.05) drawGoboOnPlane(origin, dir, cell, light, hh);
    });

    lights.forEach((light) => {
      if (light.fixture.kind === "mh" || isLb150(light.fixture)) {
        drawLb150Tripod3d(light);
        return;
      }
      if (isLaser(light.fixture)) return;
      drawFixtureBody3d(light);
    });
  }

  function setStatus() {
    const live = Date.now() - (state.status.lastPacketAt || 0) < 2500;
    const ipEl = document.getElementById("localIp");
    if (ipEl && state.status.localIp) {
      ipEl.textContent = state.status.localIp;
    }
    statusEl.classList.remove("is-live", "is-demo", "is-wait");
    if (state.demo) {
      statusEl.textContent = "Démo (sans SoundSwitch)";
      statusEl.classList.add("is-demo");
      return;
    }
    if (state.status.error) {
      statusEl.textContent = state.status.error;
      statusEl.classList.add("is-wait");
      return;
    }
    if (live) {
      statusEl.textContent = `Art-Net en direct · ${state.status.packets} paquets`;
      statusEl.classList.add("is-live");
      return;
    }
    statusEl.textContent = state.status.listening
      ? "En attente d’Art-Net · lance une piste dans SoundSwitch"
      : "Récepteur Art-Net indisponible — utilise Démo";
    statusEl.classList.add("is-wait");
  }

  function frame(now) {
    if (state.demo || Date.now() - (state.status.lastPacketAt || 0) >= 2500) {
      fillDemoUniverses(now);
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const lights = expandLights(now);

    if (state.mode === "room") {
      drawRoom(w, h, lights);
    } else if (state.mode === "3d") {
      draw3dRoom(w, h, lights, now);
    } else {
      drawShow(w, h, lights, now);
    }

    drawFixtureLabels(lights, w, h);
    const lightHit = findHovered(lights, w, h);
    const venueHit = !lightHit ? findHoveredVenue(w, h) : null;
    drawHover(lightHit || (venueHit ? { venue: venueHit } : null), w, h);
    drawSelection(lights, w, h);
    requestAnimationFrame(frame);
  }

  function setMode(mode) {
    keepOpenPatch();
    state.mode = mode;
    modeRoomBtn.classList.toggle("is-active", mode === "room");
    modeShowBtn.classList.toggle("is-active", mode === "show");
    mode3dBtn.classList.toggle("is-active", mode === "3d");
    if (view3dHint) view3dHint.hidden = mode !== "3d";
  }

  function keepOpenPatch() {
    if (patchPanel.hidden || !fixtureList.querySelector(".fix-card")) return;
    state.patch = readPatchFromForm();
    rememberPatch(state.patch);
  }

  function applyIncomingPatch(patch, force) {
    if (!patch || !Array.isArray(patch.fixtures)) return;
    if (!force && isDefaultVenue(patch) && !isDefaultVenue(state.patch)) return;
    if (!force && !patchPanel.hidden && fixtureList.querySelector(".fix-card")) {
      keepOpenPatch();
      return;
    }
    state.patch = patch;
    if (state.venue) {
      restoreDefaultFixtureLayout();
      syncPasToDanceFloor();
    }
    rememberPatch(state.patch);
    setFixtureCount();
  }

  function setDemo(on) {
    state.demo = on;
    demoBtn.classList.toggle("is-on", on);
    demoBtn.textContent = on ? "Démo ON" : "Démo";
    setStatus();
  }

  function setConnectBusy(busy, label) {
    connectSsBtn.disabled = busy;
    connectSsBtn.classList.toggle("is-on", busy);
    connectSsBtn.textContent = label;
  }

  async function connectSoundSwitch() {
    if (state.demo) setDemo(false);
    setConnectBusy(true, "Connexion…");
    try {
      await fetch("/api/visualizer/connect", { method: "POST" });
    } catch {
      setConnectBusy(false, "Connecter SS");
      statusEl.textContent = "Impossible d’appeler le récepteur Art-Net";
      statusEl.classList.remove("is-live", "is-demo");
      statusEl.classList.add("is-wait");
      return;
    }

    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (Date.now() - (state.status.lastPacketAt || 0) < 2500) {
        setConnectBusy(false, "SS OK");
        setTimeout(() => {
          if (connectSsBtn.textContent === "SS OK") {
            connectSsBtn.textContent = "Connecter SS";
          }
        }, 1800);
        return;
      }
    }

    setConnectBusy(false, "Pas de signal");
    setTimeout(() => {
      if (connectSsBtn.textContent === "Pas de signal") {
        connectSsBtn.textContent = "Connecter SS";
      }
    }, 2200);
  }

  function renderPatchEditor() {
    patchName.value = state.patch.name || "";
    fixtureList.innerHTML = "";
    const profileOptions = Object.values(state.profiles).map((profile) => (
      `<option value="${profile.id}">${profile.label}</option>`
    )).join("");

    state.patch.fixtures.forEach((fixture, index) => {
      const card = document.createElement("article");
      card.className = `fix-card fix-card--${fixture.kind || "par"}`;
      card.draggable = true;
      card.dataset.index = String(index);
      card.dataset.id = fixture.id;
      const last = state.patch.fixtures.length - 1;
      card.innerHTML = `
        <div class="fix-toolbar">
          <button type="button" class="fix-grip" data-grip="${index}" title="Glisser pour réordonner" aria-label="Déplacer">⋮⋮</button>
          <div class="fix-order">
            <button type="button" class="hud-btn fix-move" data-move="-1" data-i="${index}" ${index === 0 ? "disabled" : ""} aria-label="Monter">▲</button>
            <button type="button" class="hud-btn fix-move" data-move="1" data-i="${index}" ${index === last ? "disabled" : ""} aria-label="Descendre">▼</button>
          </div>
        </div>
        <div class="fix-grid">
          <label>Nom
            <input data-k="name" data-i="${index}" value="${fixture.name}" />
          </label>
          <label>Type DMX
            <select data-k="type" data-i="${index}">${profileOptions}</select>
          </label>
        </div>
        <div class="fix-grid fix-grid--meta">
          <label>Genre
            <select data-k="kind" data-i="${index}">
              <option value="par">PAR</option>
              <option value="bar">Barre</option>
              <option value="mh">Lyre</option>
              <option value="strobe">Strobe</option>
              <option value="laser">Laser</option>
            </select>
          </label>
          <label>Univers
            <input data-k="universe" data-i="${index}" type="number" min="0" max="32767" value="${fixture.universe}" />
          </label>
          <label>Adresse départ
            <input data-k="address" data-i="${index}" type="number" min="1" max="512" value="${fixture.address}" />
          </label>
          <label>X / Y
            <input data-k="xy" data-i="${index}" value="${fixture.x.toFixed(2)}, ${fixture.y.toFixed(2)}" />
          </label>
          <label>Rotation
            <input data-k="rot" data-i="${index}" type="number" min="0" max="359" step="1" value="${Math.round(fixture.rot || 0)}" />
          </label>
          <label>Nb
            <input data-k="count" data-i="${index}" type="number" min="0" max="32" value="${fixtureCount(fixture)}" />
          </label>
          <label class="fix-check">Au sol
            <input data-k="mount" data-i="${index}" type="checkbox" ${isUplight(fixture) ? "checked" : ""} title="Coché = uplight au sol · décoché = accroché haut" />
          </label>
          <button type="button" class="hud-btn fix-del" data-del="${index}">✕</button>
        </div>
      `;
      card.querySelectorAll("input, select, textarea, button").forEach((el) => {
        el.draggable = false;
      });
      card.querySelector('[data-k="type"]').value = fixture.type;
      card.querySelector('[data-k="kind"]').value = fixture.kind;
      const chCount = state.profiles[fixture.type]?.channelCount || 0;
      if (chCount) {
        const note = document.createElement("p");
        note.className = "fix-span";
        note.textContent = `${chCount} canaux suivis · ${fixture.address}–${fixture.address + chCount - 1}`;
        card.appendChild(note);
      }
      fixtureList.appendChild(card);
    });
    setFixtureCount();
  }

  function moveFixture(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
    state.patch = readPatchFromForm();
    const list = state.patch.fixtures;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    rememberPatch(state.patch);
    renderPatchEditor();
    persistPatch("Ordre enregistré.");
  }

  function readPatchFromForm() {
    const byId = new Map(state.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    const fixtures = [...fixtureList.querySelectorAll(".fix-card")].map((card, index) => {
      const get = (key) => card.querySelector(`[data-k="${key}"]`);
      const xy = String(get("xy").value || "0.5, 0.2").split(",").map((part) => Number(part.trim()));
      const id = card.dataset.id || state.patch.fixtures[index]?.id || `fix-${index + 1}`;
      const previous = byId.get(id);
      return {
        id,
        name: get("name").value,
        type: get("type").value,
        kind: get("kind").value,
        universe: Number(get("universe").value) || 0,
        address: Number(get("address").value) || 1,
        x: Number.isFinite(xy[0]) ? xy[0] : previous?.x ?? 0.5,
        y: Number.isFinite(xy[1]) ? xy[1] : previous?.y ?? 0.2,
        rot: Number(get("rot")?.value) || previous?.rot || 0,
        count: (() => {
          const raw = parseInt(get("count")?.value, 10);
          return Number.isFinite(raw) ? Math.max(0, Math.min(32, raw)) : 1;
        })(),
        mount: get("mount")?.checked ? "uplight" : "hang",
        spots: previous?.spots || []
      };
    });
    fixtures.forEach((fixture) => fixtureSpots(fixture));
    return { name: patchName.value, fixtures };
  }

  async function persistPatch(message) {
    rememberPatch(state.patch);
    try {
      const response = await fetch("/api/visualizer/patch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.patch)
      });
      const payload = await response.json();
      if (!response.ok) {
        patchMsg.textContent = payload.error || "Enregistrement impossible.";
        return false;
      }
      state.patch = payload.patch;
      rememberPatch(state.patch);
      setFixtureCount();
      if (message) patchMsg.textContent = message;
      return true;
    } catch {
      patchMsg.textContent = "Enregistrement impossible.";
      return false;
    }
  }

  function openPatch() {
    patchPanel.hidden = false;
    renderPatchEditor();
  }

  function closePatch() {
    keepOpenPatch();
    patchPanel.hidden = true;
  }

  fixtureList.addEventListener("click", (event) => {
    const moveBtn = event.target.closest("[data-move]");
    if (moveBtn) {
      const from = Number(moveBtn.dataset.i);
      moveFixture(from, from + Number(moveBtn.dataset.move));
      return;
    }
    const button = event.target.closest("[data-del]");
    if (!button) return;
    state.patch = readPatchFromForm();
    state.patch.fixtures.splice(Number(button.dataset.del), 1);
    renderPatchEditor();
  });

  fixtureList.addEventListener("pointerdown", (event) => {
    if (event.target.closest("input, select, textarea")) {
      event.stopPropagation();
    }
  });

  fixtureList.addEventListener("change", (event) => {
    if (!event.target.closest("[data-k='count'], [data-k='rot'], [data-k='mount']")) return;
    state.patch = readPatchFromForm();
    setFixtureCount();
    persistPatch();
  });

  let dragFrom = null;
  fixtureList.addEventListener("dragstart", (event) => {
    if (event.target.closest("input, select, textarea, .fix-del")) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest(".fix-card");
    if (!card) {
      event.preventDefault();
      return;
    }
    dragFrom = Number(card.dataset.index);
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.id || String(dragFrom));
  });
  fixtureList.addEventListener("dragend", () => {
    fixtureList.querySelectorAll(".fix-card").forEach((card) => {
      card.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
    });
    dragFrom = null;
  });
  fixtureList.addEventListener("dragover", (event) => {
    event.preventDefault();
    const card = event.target.closest(".fix-card");
    fixtureList.querySelectorAll(".is-drop-before, .is-drop-after").forEach((el) => {
      el.classList.remove("is-drop-before", "is-drop-after");
    });
    if (!card) return;
    const mid = card.getBoundingClientRect().top + card.offsetHeight / 2;
    card.classList.add(event.clientY < mid ? "is-drop-before" : "is-drop-after");
  });
  fixtureList.addEventListener("drop", (event) => {
    event.preventDefault();
    const card = event.target.closest(".fix-card");
    if (!card || dragFrom == null) return;
    const to = Number(card.dataset.index);
    const mid = card.getBoundingClientRect().top + card.offsetHeight / 2;
    const insert = event.clientY < mid ? to : to + 1;
    const dest = dragFrom < insert ? insert - 1 : insert;
    moveFixture(dragFrom, dest);
  });

  addFixtureBtn.addEventListener("click", () => {
    state.patch = readPatchFromForm();
    const last = state.patch.fixtures[state.patch.fixtures.length - 1];
    const lastCount = state.profiles[last?.type]?.channelCount || 5;
    state.patch.fixtures.push({
      id: `fix-${Date.now()}`,
      name: `Fixture ${state.patch.fixtures.length + 1}`,
      type: "dim-rgbw",
      kind: "par",
      universe: last?.universe || 0,
      address: Math.min(512, (last?.address || 1) + lastCount),
      x: 0.5,
      y: 0.2,
      rot: 0,
      count: 1,
      spots: [{ x: 0.5, y: 0.2, rot: 0 }]
    });
    renderPatchEditor();
  });

  resetPatchBtn.addEventListener("click", () => {
    if (!window.confirm("Revenir au patch Carl full kit (adresses SoundSwitch) ?")) return;
    state.patch = structuredClone(DEFAULT_PATCH);
    restoreDefaultFixtureLayout();
    syncPasToDanceFloor();
    renderPatchEditor();
    persistPatch("Patch de base chargé.");
  });

  importSoundSwitchBtn.addEventListener("click", async () => {
    patchMsg.textContent = "Import SoundSwitch…";
    const response = await fetch("/api/visualizer/import-soundswitch", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      patchMsg.textContent = payload.error || "Import impossible.";
      return;
    }
    applyIncomingPatch(payload.patch, true);
    renderPatchEditor();
    patchMsg.textContent = `${payload.patch.fixtures.length} fixtures importées.`;
  });

  savePatchBtn.addEventListener("click", async () => {
    state.patch = readPatchFromForm();
    const ok = await persistPatch("Patch enregistré.");
    if (ok) renderPatchEditor();
  });

  modeRoomBtn.addEventListener("click", () => setMode("room"));
  modeShowBtn.addEventListener("click", () => setMode("show"));
  mode3dBtn.addEventListener("click", () => setMode("3d"));
  connectSsBtn.addEventListener("click", () => connectSoundSwitch());
  demoBtn.addEventListener("click", () => setDemo(!state.demo));
  patchBtn.addEventListener("click", () => (patchPanel.hidden ? openPatch() : closePatch()));
  patchClose.addEventListener("click", closePatch);
  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  canvas.addEventListener("wheel", (event) => {
    if (state.mode === "3d") {
      event.preventDefault();
      state.cam.dist *= event.deltaY > 0 ? 1.08 : 0.92;
      state.cam = clampCam(state.cam);
      rememberCam();
      return;
    }
    if (!state.selectedId) return;
    const fixture = state.patch.fixtures.find((item) => item.id === state.selectedId);
    if (!fixture) return;
    event.preventDefault();
    const spots = fixtureSpots(fixture);
    const spot = spots[state.selectedSpot] || spots[0];
    if (!spot) return;
    spot.rot = (((spot.rot || 0) + (event.deltaY > 0 ? 8 : -8)) % 360 + 360) % 360;
    if (state.selectedSpot === 0) fixture.rot = spot.rot;
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea")) return;
    if (event.key === "1") setMode("room");
    if (event.key === "2") setMode("show");
    if (event.key === "3") setMode("3d");
    if ((event.key === "r" || event.key === "R") && state.mode === "3d") resetCam();
    if (state.mode === "3d") {
      const step = event.shiftKey ? 0.7 : 0.28;
      if (event.key === "ArrowLeft") state.cam.yaw -= 0.08;
      if (event.key === "ArrowRight") state.cam.yaw += 0.08;
      if (event.key === "ArrowUp") state.cam.pitch = Math.min(1.45, state.cam.pitch + 0.06);
      if (event.key === "ArrowDown") state.cam.pitch = Math.max(-1.45, state.cam.pitch - 0.06);
      if (event.key === "w" || event.key === "W") {
        state.cam.tx += state.view ? state.view.forward.x * step : 0;
        state.cam.tz += state.view ? state.view.forward.z * step : 0;
      }
      if (event.key === "s" || event.key === "S") {
        state.cam.tx -= state.view ? state.view.forward.x * step : 0;
        state.cam.tz -= state.view ? state.view.forward.z * step : 0;
      }
      if (event.key === "a" || event.key === "A") {
        state.cam.tx -= state.view ? state.view.right.x * step : 0;
        state.cam.tz -= state.view ? state.view.right.z * step : 0;
      }
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        state.cam.tx += state.view ? state.view.right.x * step : 0;
        state.cam.tz += state.view ? state.view.right.z * step : 0;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "W", "a", "A", "s", "S", "d", "D"].includes(event.key)) {
        state.cam = clampCam(state.cam);
        rememberCam();
      }
    }
    if ((event.key === "d" || event.key === "D") && state.mode !== "3d") setDemo(!state.demo);
    if (event.key === "p" || event.key === "P") {
      patchPanel.hidden ? openPatch() : closePatch();
    }
    if (event.key === "f" || event.key === "F") fsBtn.click();
    if (event.key === "Escape") closePatch();
  });

  socket.on("connect", () => socket.emit("joinVisualizer"));
  socket.on("visualizerState", (payload) => {
    applyIncomingPatch(payload.patch);
    state.profiles = payload.profiles || {};
    state.status = payload.status || state.status;
    Object.entries(payload.universes || {}).forEach(([universe, data]) => {
      state.universes[universe] = toBytes(data);
    });
    if (!Object.keys(state.profiles).length) {
      state.profiles = {
        rgb: { id: "rgb", channels: ["r", "g", "b"], channelCount: 3 },
        rgbw: { id: "rgbw", channels: ["r", "g", "b", "w"], channelCount: 4 },
        "dim-rgb": { id: "dim-rgb", channels: ["dim", "r", "g", "b"], channelCount: 4 },
        "dim-rgbw": { id: "dim-rgbw", channels: ["dim", "r", "g", "b", "w"], channelCount: 5 },
        "dim-rgb-strobe": { id: "dim-rgb-strobe", channels: ["dim", "r", "g", "b", "strobe"], channelCount: 5 },
        "dim-rgbw-strobe": { id: "dim-rgbw-strobe", channels: ["dim", "r", "g", "b", "w", "strobe"], channelCount: 6 },
        rgbwa: { id: "rgbwa", channels: ["r", "g", "b", "w", "a"], channelCount: 5 },
        "rgbwa-plus": { id: "rgbwa-plus", channels: ["r", "g", "b", "w", "a", "dim", "strobe", "extra"], channelCount: 8 },
        rgbwauv: { id: "rgbwauv", channels: ["r", "g", "b", "w", "a", "uv"], channelCount: 6 },
        "rgbw-dim-strobe": { id: "rgbw-dim-strobe", channels: ["r", "g", "b", "w", "dim", "strobe"], channelCount: 6 },
        "rgbw-plus8": { id: "rgbw-plus8", channels: ["r", "g", "b", "w", "dim", "strobe", "a", "uv"], channelCount: 8 },
        "rgb-dim-strobe": { id: "rgb-dim-strobe", channels: ["r", "g", "b", "dim", "strobe"], channelCount: 5 },
        parled10: { id: "parled10", channels: ["strobe", "r", "g", "b", "w", "a", "uv", "extra", "extra2", "extra3"], channelCount: 10 },
        laser4: { id: "laser4", channels: ["color", "extra", "dim", "strobe"], channelCount: 4 },
        fs6: { id: "fs6", channels: ["dim", "strobe", "pan", "tilt", "gobo", "extra", "extra2", "color", "extra3", "extra4"], channelCount: 10 },
        wash10: { id: "wash10", channels: ["dim", "r", "g", "b", "w", "a", "uv", "strobe", "mode", "speed"], channelCount: 10 },
        "mh-dim-rgbw": { id: "mh-dim-rgbw", channels: ["pan", "tilt", "dim", "r", "g", "b", "w"], channelCount: 7 },
        "mh-beam9": { id: "mh-beam9", channels: ["dim", "strobe", "pan", "tilt", "color", "gobo", "prism", "speed", "function"], channelCount: 9 },
        "mh-beam12": { id: "mh-beam12", channels: ["pan", "panFine", "tilt", "tiltFine", "speed", "dim", "strobe", "color", "gobo", "goboShake", "prism", "function"], channelCount: 12 },
        strobe: { id: "strobe", channels: ["dim", "strobe"], channelCount: 2 },
        dimmer: { id: "dimmer", channels: ["dim"], channelCount: 1 },
        partybar32: { id: "partybar32", channels: ["dim", "strobe", "r", "g", "b", "w", "r2", "g2", "b2", "w2", "derbyStrobe", "r3", "g3", "b3", "w3", "a3", "uv3", "r4", "g4", "b4", "w4", "a4", "uv4", "motor", "laser", "laserMotor", "barStrobe", "barMode", "uvStrobe", "uvMode", "function", "speed"], channelCount: 32 },
        palette27: { id: "palette27", channels: ["r", "g", "b", "r2", "g2", "b2", "r3", "g3", "b3", "r4", "g4", "b4", "r5", "g5", "b5", "r6", "g6", "b6", "r7", "g7", "b7", "r8", "g8", "b8", "r9", "g9", "b9"], channelCount: 27 }
      };
    }
    if (!patchPanel.hidden && fixtureList.querySelector(".fix-card")) {
      keepOpenPatch();
    } else if (!patchPanel.hidden) {
      renderPatchEditor();
    }
    setStatus();
  });
  socket.on("artnetDmx", (payload) => {
    state.universes[payload.universe] = toBytes(payload.data);
    state.status.lastPacketAt = Date.now();
    state.status.packets += 1;
    if (state.demo) setDemo(false);
  });
  socket.on("artnetStatus", (status) => {
    state.status = status;
    setStatus();
  });
  socket.on("visualizerPatch", (patch) => {
    if (!patchPanel.hidden && fixtureList.querySelector(".fix-card")) {
      const current = readPatchFromForm();
      applyIncomingPatch({
        ...patch,
        fixtures: (patch.fixtures || []).map((fixture, index) => {
          const local = current.fixtures.find((item) => item.id === fixture.id) || current.fixtures[index];
          if (!local) return fixture;
          return { ...fixture, count: local.count, spots: local.spots, rot: local.rot, x: local.x, y: local.y, mount: local.mount || fixture.mount };
        })
      }, true);
      return;
    }
    applyIncomingPatch(patch, true);
  });

  fetch("/api/visualizer/patch")
    .then((response) => response.json())
    .then((payload) => {
      if (payload.profiles && Object.keys(payload.profiles).length) {
        state.profiles = payload.profiles;
      }
      applyIncomingPatch(payload.patch);
      if (!patchPanel.hidden) renderPatchEditor();
    })
    .catch(() => {});

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function clampLayout(value) {
    return Math.min(1, Math.max(0, value));
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
    const point = canvasPoint(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.overCanvas = true;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (state.mode === "3d") {
      state.view = makeView(w, h);
    }
    const lights = expandLights(performance.now());
    const selectedLight = lights.find((light) => (
      light.fixture.id === state.selectedId && light.spotIndex === state.selectedSpot
    ));
    if (event.button === 0 && selectedLight) {
      const handle = rotateHandle(lightAnchor(selectedLight, w, h), selectedLight.spot);
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= 16) {
        state.drag = { mode: "rotate", id: selectedLight.fixture.id, spot: selectedLight.spotIndex };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        return;
      }
    }
    const hit = event.button === 0 ? findHovered(lights, w, h) : null;
    const venueHit = event.button === 0 && !hit ? findHoveredVenue(w, h) : null;
    if (state.mode === "3d") {
      if (event.button === 2 || event.button === 1 || event.altKey) {
        state.drag = { mode: "pan", lx: point.x, ly: point.y };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        return;
      }
      if (event.button === 0 && hit) {
        state.selectedId = hit.light.fixture.id;
        state.selectedSpot = hit.light.spotIndex;
        state.drag = { mode: "move", id: hit.light.fixture.id, spot: hit.light.spotIndex };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        return;
      }
      if (event.button === 0 && venueHit) {
        state.selectedId = "";
        state.selectedSpot = 0;
        state.drag = { mode: "venue", kind: venueHit.kind, id: venueHit.id };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        return;
      }
      if (event.button === 0) {
        state.selectedId = "";
        state.selectedSpot = 0;
        state.drag = { mode: "orbit", lx: point.x, ly: point.y };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        return;
      }
    }
    if (!hit) {
      state.selectedId = "";
      state.selectedSpot = 0;
      return;
    }
    state.selectedId = hit.light.fixture.id;
    state.selectedSpot = hit.light.spotIndex;
    state.drag = {
      mode: event.shiftKey ? "rotate" : "move",
      id: hit.light.fixture.id,
      spot: hit.light.spotIndex
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    const point = canvasPoint(event);
    state.pointer.x = point.x;
    state.pointer.y = point.y;
    state.pointer.overCanvas = true;
    if (!state.drag) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (state.drag.mode === "orbit" || state.drag.mode === "pan") {
      const dx = point.x - state.drag.lx;
      const dy = point.y - state.drag.ly;
      state.drag.lx = point.x;
      state.drag.ly = point.y;
      if (state.drag.mode === "orbit") {
        state.cam.yaw -= dx * 0.01;
        state.cam.pitch += dy * 0.0075;
      } else {
        const view = state.view || makeView(w, h);
        const k = state.cam.dist * 0.0024;
        state.cam.tx -= view.right.x * dx * k - view.up.x * dy * k;
        state.cam.ty += view.up.y * dy * k;
        state.cam.tz -= view.right.z * dx * k - view.up.z * dy * k;
      }
      state.cam = clampCam(state.cam);
      rememberCam();
      return;
    }
    if (state.drag.mode === "venue") {
      state.view = makeView(w, h);
      const hit = intersectY(screenRay(point.x, point.y, w, h), 0.02);
      if (!hit) return;
      const next = clampVenueXZ(hit.x, hit.z);
      if (state.drag.kind === "danceFloor") {
        state.venue.danceFloor.x = next.x;
        state.venue.danceFloor.z = next.z;
        syncPasToDanceFloor();
      } else if (state.drag.kind === "table") {
        const table = state.venue.tables.find((item) => item.id === state.drag.id);
        if (table) {
          table.x = next.x;
          table.z = next.z;
        }
      } else if (state.drag.kind === "pa") {
        const pa = (state.venue.pas || []).find((item) => item.id === state.drag.id);
        if (pa) {
          pa.x = next.x;
          pa.z = next.z;
          syncBoothBetweenPas();
          syncParLedsAbovePas();
          syncWash2OnCaisses();
        }
      } else if (state.drag.kind === "djBooth" && state.venue.djBooth) {
        state.venue.djBooth.x = next.x;
        state.venue.djBooth.z = next.z;
      }
      return;
    }
    const fixture = state.patch.fixtures.find((item) => item.id === state.drag.id);
    if (!fixture) return;
    const spots = fixtureSpots(fixture);
    const spot = spots[state.drag.spot] || spots[0];
    if (!spot) return;
    if (state.drag.mode === "move") {
      if (state.mode === "3d") {
        state.view = makeView(w, h);
        const hit = intersectY(screenRay(point.x, point.y, w, h), fixtureHeight(fixture));
        if (hit) {
          const next = worldToSpot(hit.x, hit.z);
          spot.x = next.x;
          spot.y = next.y;
          if (isParLed4(fixture)) {
            const pa = paForParLed(fixture);
            if (pa) {
              pa.x = hit.x;
              pa.z = hit.z;
            }
          }
        }
      } else {
        const norm = normFromPoint(point.x, point.y, w, h);
        spot.x = clampLayout(norm.x);
        spot.y = clampLayout(norm.y);
        if (isParLed4(fixture)) {
          const pa = paForParLed(fixture);
          if (pa) {
            pa.x = (spot.x - 0.5) * ROOM.w;
            pa.z = (spot.y - 0.5) * ROOM.d;
          }
        }
      }
    } else {
      const origin = lightAnchor({ fixture, spot }, w, h);
      const deg = (Math.atan2(point.x - origin.x, point.y - origin.y) * 180) / Math.PI;
      spot.rot = ((deg % 360) + 360) % 360;
    }
    if (state.drag.spot === 0) {
      fixture.x = spot.x;
      fixture.y = spot.y;
      fixture.rot = spot.rot;
    }
  });

  function endLayoutDrag() {
    if (!state.drag) return;
    const layout = state.drag.mode === "move" || state.drag.mode === "rotate";
    const venue = state.drag.mode === "venue";
    const movedPa = venue && state.drag.kind === "pa";
    const movedFloor = venue && state.drag.kind === "danceFloor";
    const movedPar = layout && isParLed4(state.patch.fixtures.find((f) => f.id === state.drag.id));
    state.drag = null;
    if (venue) {
      syncParLedsAbovePas();
      syncWash2OnCaisses();
      rememberVenue();
      if (movedPa || movedFloor) {
        rememberPatch(state.patch);
        persistPatch();
        if (!patchPanel.hidden) renderPatchEditor();
      }
      return;
    }
    if (!layout) {
      rememberCam();
      return;
    }
    if (movedPar) rememberVenue();
    rememberPatch(state.patch);
    persistPatch();
    if (!patchPanel.hidden) renderPatchEditor();
    setFixtureCount();
  }

  canvas.addEventListener("pointerup", endLayoutDrag);
  canvas.addEventListener("pointercancel", endLayoutDrag);
  canvas.addEventListener("pointerleave", () => {
    if (state.drag) return;
    state.pointer.overCanvas = false;
    lightTip.hidden = true;
  });
  canvas.addEventListener("contextmenu", (event) => {
    if (state.mode === "3d") event.preventDefault();
  });
  canvas.addEventListener("dblclick", () => {
    if (state.mode === "3d") resetCam();
  });

  window.addEventListener("resize", resize);
  resize();
  setMode("show");
  setStatus();
  setFixtureCount();
  requestAnimationFrame(frame);
})();
