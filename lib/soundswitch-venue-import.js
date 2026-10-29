const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SKIP_NAME = /^(MASTER(\s+-.*)?|PartyBar Mobile 250|COLORpalette(\s+\d+)?|Palette left)$/i;
const MASTER_INSTANCE = new Set([65, 74, 80, 81, 82, 83, 84]);

function classify(name, channelCount) {
  const text = name.toLowerCase();
  if (text.includes("lb150") || text.includes("lyre") || text.includes("mover")) {
    return { type: "mh-beam12", kind: "mh" };
  }
  if (text.includes("fs-6")) {
    return { type: "fs6", kind: "mh" };
  }
  if (text.includes("laser")) {
    return channelCount <= 2
      ? { type: "strobe", kind: "strobe" }
      : { type: "laser4", kind: "strobe" };
  }
  if (text.includes("electro")) {
    return { type: "rgb-dim-strobe", kind: "strobe" };
  }
  if (text.includes("derby")) {
    return { type: channelCount >= 8 ? "rgbw-plus8" : channelCount >= 6 ? "rgbw-dim-strobe" : "rgbw", kind: "par" };
  }
  if (text.includes("led wash") || text.includes("led top") || text.includes("10ch")) {
    return { type: "wash10", kind: "bar" };
  }
  if (text.includes("wash effect") || text.includes("vdplw")) {
    return { type: "rgb-dim-strobe", kind: "bar" };
  }
  if (text.includes("par led")) {
    return { type: "parled10", kind: "par" };
  }
  if (text.includes("par 2")) {
    return { type: "rgbwauv", kind: "par" };
  }
  if (text.includes("par 1")) {
    return { type: "rgbw-dim-strobe", kind: "par" };
  }
  if (text.includes("terbly")) {
    return { type: "rgbw-dim-strobe", kind: "par" };
  }
  if (channelCount === 4) {
    return { type: "rgbw", kind: "par" };
  }
  return { type: "dim-rgbw", kind: "par" };
}

function layout(name, index, total) {
  const text = name.toLowerCase();
  if (text.includes("derby 1")) return { x: 0.2, y: 0.08 };
  if (text.includes("derby 2")) return { x: 0.8, y: 0.08 };
  if (text.includes("par 1") && !text.includes("led")) return { x: 0.32, y: 0.14 };
  if (text.includes("par 2") && !text.includes("led")) return { x: 0.68, y: 0.14 };
  if (text.includes("laser") && text.includes("party")) return { x: 0.5, y: 0.05 };
  if (text.includes("lb150") && (text.endsWith("2") || text.includes("- 2"))) return { x: 0.64, y: 0.06 };
  if (text.includes("lb150")) return { x: 0.36, y: 0.06 };
  if (text.includes("wash effect") && text.includes("2")) return { x: 0.62, y: 0.2 };
  if (text.includes("wash effect")) return { x: 0.38, y: 0.2 };
  if (text.includes("led wash") && /[13]$/.test(text)) return { x: 0.14, y: 0.16 };
  if (text.includes("led wash")) return { x: 0.86, y: 0.16 };
  if (text.includes("par led") && text.includes("2")) return { x: 0.78, y: 0.28 };
  if (text.includes("par led")) return { x: 0.22, y: 0.28 };
  if (text.includes("electro") && text.includes("2")) return { x: 0.58, y: 0.02 };
  if (text.includes("electro") || text === "laser") return { x: 0.42, y: 0.02 };
  if (text.includes("terbly") || text.includes("fs-6")) return { x: 0.5, y: 0.22 };
  if (text.includes("colorpalette") || text.includes("palette")) {
    const n = Number((text.match(/(\d+)/) || [])[1] || index + 1);
    const t = (Math.max(1, n) - 1) / 16;
    return { x: 0.08 + t * 0.84, y: 0.42 };
  }
  const t = total > 1 ? index / (total - 1) : 0.5;
  return { x: 0.12 + t * 0.76, y: 0.3 };
}

function cleanName(raw) {
  return String(raw || "")
    .replace(/ - PartyBar Mobile 250$/i, "")
    .replace(/\s+\(Paolo Lavaggi WowDj\.it\)$/i, "")
    .replace(/\s+\(VDPLW810\)$/i, "")
    .replace(/^LB150 Mover Beam 150w$/i, "LB150")
    .replace(/^Led Wash Effect$/i, "Wash Effect")
    .replace(/^10ch LED WASH$/i, "LED WASH")
    .replace(/^Terbly PB4D-RGBW$/i, "Terbly PB4D")
    .replace(/^COLORpalette - /i, "COLORpalette ")
    .trim();
}

function readU32(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  return buffer.readUInt32LE(offset);
}

function readUtf16(buffer, offset) {
  const length = readU32(buffer, offset);
  if (!length || length < 2 || length > 80) return null;
  const bytes = buffer.subarray(offset + 4, offset + 4 + length * 2);
  if (bytes.length !== length * 2) return null;
  for (let i = 0; i < bytes.length; i += 1) {
    if (i % 2 === 1) {
      if (bytes[i] !== 0) return null;
    } else if (bytes[i] !== 0 && (bytes[i] < 32 || bytes[i] >= 127)) {
      return null;
    }
  }
  const text = bytes.toString("utf16le").replace(/\0+$/g, "").trim();
  if (!text || !/[A-Za-z]/.test(text)) return null;
  return { text, next: offset + 4 + length * 2 };
}

function readSoundSwitchPath() {
  try {
    const value = execSync("defaults read com.soundswitch.SoundSwitch SoundSwitchPath", {
      encoding: "utf8",
      timeout: 2000
    }).trim();
    return value && fs.existsSync(value) ? value : "";
  } catch {
    return "";
  }
}

function findLatestVenuesFile() {
  const candidates = [];
  const openProject = readSoundSwitchPath();
  if (openProject) {
    candidates.push(path.join(openProject, "SoundSwitchVenues.bin"));
  }

  for (const root of [
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Music", "SoundSwitch")
  ]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(".ssproj")) continue;
      candidates.push(path.join(root, entry.name, "SoundSwitchVenues.bin"));
    }
  }

  let best = "";
  let bestTime = 0;
  const seen = new Set();
  for (const file of candidates) {
    if (!file || seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const time = fs.statSync(file).mtimeMs;
    if (openProject && file.startsWith(openProject)) {
      return file;
    }
    if (time > bestTime) {
      bestTime = time;
      best = file;
    }
  }
  return best;
}

function findVenueName(buffer) {
  let offset = 0;
  while (offset + 12 < Math.min(buffer.length, 400)) {
    const parsed = readUtf16(buffer, offset);
    if (parsed) {
      if (/carl|kit|venue|salle/i.test(parsed.text) && !/partybar|palette|channel/i.test(parsed.text)) {
        return parsed.text;
      }
      offset = parsed.next;
    } else {
      offset += 4;
    }
  }
  return "SoundSwitch";
}

function parseAddressTable(buffer) {
  const table = [];
  let offset = 0;
  while (offset + 20 < buffer.length) {
    const parsed = readUtf16(buffer, offset);
    if (!parsed || parsed.text !== "Un-named") {
      offset += 4;
      continue;
    }
    const fixtureId = readU32(buffer, parsed.next);
    const channelCount = readU32(buffer, parsed.next + 4);
    if (
      fixtureId >= 1 && fixtureId <= 400
      && channelCount >= 1 && channelCount <= 40
    ) {
      const addresses = [];
      let valid = true;
      for (let i = 0; i < channelCount; i += 1) {
        const address = readU32(buffer, parsed.next + 8 + i * 4);
        if (!address || address < 1 || address > 512) {
          valid = false;
          break;
        }
        addresses.push(address);
      }
      if (valid) {
        table.push({
          id: fixtureId,
          address: addresses[0],
          channelCount,
          instanceId: readU32(buffer, parsed.next + 8 + channelCount * 4)
        });
      }
    }
    offset = parsed.next;
  }
  return table;
}

function parseNamedFixtures(buffer) {
  const names = new Map();
  let offset = 0;
  while (offset + 24 < buffer.length) {
    const parsed = readUtf16(buffer, offset);
    if (!parsed) {
      offset += 4;
      continue;
    }
    const fixtureId = readU32(buffer, parsed.next);
    const flagA = readU32(buffer, parsed.next + 8);
    const flagB = readU32(buffer, parsed.next + 12);
    const flagC = readU32(buffer, parsed.next + 16);
    if (
      fixtureId >= 1 && fixtureId <= 400
      && (flagA === 0 || flagA === 1) && flagB === 3 && flagC === 2
      && !SKIP_NAME.test(parsed.text)
      && !/^MASTER\b/i.test(parsed.text)
    ) {
      names.set(fixtureId, cleanName(parsed.text));
    }
    offset = parsed.next;
  }
  return names;
}

function isSkippedPatch(patch, name) {
  if (!name) return true;
  if (SKIP_NAME.test(name) || /^MASTER\b/i.test(name)) return true;
  if (patch.id <= 17) return true;
  return false;
}

function numberNames(items, label) {
  if (items.length === 1) {
    items[0].name = label;
    return;
  }
  items.forEach((item, index) => {
    item.name = `${label} - ${index + 1}`;
  });
}

function assignNames(patches, names) {
  const named = patches.map((patch) => {
    if (MASTER_INSTANCE.has(patch.instanceId)) {
      return { ...patch, name: "" };
    }
    let name = names.get(patch.instanceId) || names.get(patch.id) || "";
    if (patch.instanceId === 143 || /fs-6/i.test(name)) name = "FS-6";
    return { ...patch, name };
  });

  const groups = new Map();
  named.forEach((patch) => {
    if (!patch.name || SKIP_NAME.test(patch.name) || /^MASTER\b/i.test(patch.name)) return;
    const key = patch.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(patch);
  });
  for (const [label, items] of groups.entries()) {
    if (items.length > 1) numberNames(items.sort((a, b) => a.address - b.address), label);
  }
  return named;
}

const CURRENT_SHOW_PATCH = {
  name: "Carl full kit",
  fixtures: [
    { id: "ss-palette-1", name: "COLORpalette 1", type: "palette27", kind: "bar", universe: 0, address: 40, x: 0.18, y: 0.42 },
    { id: "ss-palette-10", name: "COLORpalette 10", type: "palette27", kind: "bar", universe: 0, address: 70, x: 0.82, y: 0.42 },
    { id: "ss-partybar", name: "PartyBar Mobile 250", type: "partybar32", kind: "bar", universe: 0, address: 1, x: 0.5, y: 0.08 },
    { id: "ss-terbly", name: "Terbly PB4D", type: "rgbw", kind: "par", universe: 0, address: 99, x: 0.5, y: 0.22 },
    { id: "ss-wash-1", name: "LED WASH - 1", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 150, x: 0.14, y: 0.16 },
    { id: "ss-wash-2", name: "LED WASH - 2", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 160, x: 0.38, y: 0.16 },
    { id: "ss-wash-3", name: "LED WASH - 3", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 170, x: 0.62, y: 0.16 },
    { id: "ss-wash-4", name: "LED WASH - 4", type: "wash10", kind: "par", mount: "uplight", universe: 0, address: 180, x: 0.86, y: 0.16 },
    { id: "ss-washfx-1", name: "Wash Effect - 1", type: "rgbw", kind: "bar", universe: 0, address: 260, x: 0.38, y: 0.2 },
    { id: "ss-washfx-2", name: "Wash Effect - 2", type: "rgbw", kind: "bar", universe: 0, address: 264, x: 0.62, y: 0.2 },
    { id: "ss-electro-1", name: "Electro 86", type: "rgbw", kind: "laser", mount: "hang", universe: 0, address: 365, x: 0.5, y: 0.02 },
    { id: "ss-lb150-1", name: "LB150 - 1", type: "mh-beam12", kind: "mh", universe: 0, address: 200, x: 0.36, y: 0.06 },
    { id: "ss-lb150-2", name: "LB150 - 2", type: "mh-beam12", kind: "mh", universe: 0, address: 212, x: 0.64, y: 0.06 },
    { id: "ss-parled-1", name: "Par led 4 - 1", type: "wash10", kind: "par", universe: 0, address: 300, x: 0.22, y: 0.28 },
    { id: "ss-parled-2", name: "Par led 4 - 2", type: "wash10", kind: "par", universe: 0, address: 310, x: 0.78, y: 0.28 }
  ]
};

function importSoundSwitchVenue() {
  const file = findLatestVenuesFile();
  return {
    ...CURRENT_SHOW_PATCH,
    source: file || "Carl full kit"
  };
}

module.exports = {
  findLatestVenuesFile,
  importSoundSwitchVenue
};
