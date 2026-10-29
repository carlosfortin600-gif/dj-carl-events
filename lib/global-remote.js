const fs = require("fs");
const path = require("path");
const { GlobalKeyboardListener } = require("node-global-key-listener");

const REMOTE_KEYS_PATH = path.join(__dirname, "..", "data", "host-remote-keys.json");
const DEFAULT_PLAY_KEY = { code: "F5", key: "F5", keyCode: 116, label: "F5" };
const PLAY_HOLD_MS = 3000;
const NAV_NEXT_KEYS = new Set(["RIGHT ARROW", "PAGE DOWN"]);
const NAV_PREV_KEYS = new Set(["LEFT ARROW", "PAGE UP"]);
const NAV_DEBOUNCE_MS = 320;
const STOP_DEBOUNCE_MS = 320;

const CODE_TO_GLOBAL = {
  F5: "F5",
  Space: "SPACE",
  ArrowLeft: "LEFT ARROW",
  ArrowRight: "RIGHT ARROW",
  PageUp: "PAGE UP",
  PageDown: "PAGE DOWN"
};

const KEYCODE_TO_GLOBAL = {
  116: "F5",
  32: "SPACE",
  37: "LEFT ARROW",
  39: "RIGHT ARROW",
  33: "PAGE UP",
  34: "PAGE DOWN"
};

let playHoldTimer = null;
let playHoldTriggered = false;
let playKeyDown = false;
let playKeyDownAt = 0;
let lastNextAt = 0;
let lastPrevAt = 0;
let lastStopAt = 0;
let stopBindings = [];
let playBindings = [DEFAULT_PLAY_KEY];

function ensureMacKeyServerExecutable() {
  if (process.platform !== "darwin") return;

  const binaryPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "node-global-key-listener",
    "bin",
    "MacKeyServer"
  );

  try {
    fs.chmodSync(binaryPath, 0o755);
  } catch (error) {
    // Ignore — listener startup will report failure if needed.
  }
}

function getGlobalNamesForBinding(binding) {
  const names = new Set();
  if (!binding) return names;

  if (binding.code && CODE_TO_GLOBAL[binding.code]) {
    names.add(CODE_TO_GLOBAL[binding.code]);
  }

  const codeKeyMatch = String(binding.code || "").match(/^Key([A-Z])$/);
  if (codeKeyMatch) {
    names.add(codeKeyMatch[1]);
  }

  const codeDigitMatch = String(binding.code || "").match(/^Digit([0-9])$/);
  if (codeDigitMatch) {
    names.add(codeDigitMatch[1]);
  }

  const labelKeyMatch = String(binding.label || "").match(/^Key([A-Z])$/);
  if (labelKeyMatch) {
    names.add(labelKeyMatch[1]);
  }

  if (binding.key === "F5" || binding.keyCode === 116) {
    names.add("F5");
  }

  if (binding.key === " " || binding.code === "Space" || binding.keyCode === 32) {
    names.add("SPACE");
  }

  if (binding.key && binding.key.length === 1) {
    names.add(binding.key.toUpperCase());
  }

  if (binding.keyCode >= 65 && binding.keyCode <= 90) {
    names.add(String.fromCharCode(binding.keyCode));
  }

  if (binding.keyCode >= 48 && binding.keyCode <= 57) {
    names.add(String.fromCharCode(binding.keyCode));
  }

  if (binding.keyCode && KEYCODE_TO_GLOBAL[binding.keyCode]) {
    names.add(KEYCODE_TO_GLOBAL[binding.keyCode]);
  }

  if (binding.label && binding.label.length === 1) {
    names.add(binding.label.toUpperCase());
  }

  return names;
}

function bindingMatchesEvent(event, binding) {
  if (!binding || !event?.name) return false;

  const names = getGlobalNamesForBinding(binding);
  if (names.has(event.name)) return true;

  const rawStandard = event.rawKey?.standardName;
  if (rawStandard && names.has(rawStandard)) return true;

  const rawName = event.rawKey?.name;
  if (rawName && names.has(rawName.toUpperCase())) return true;

  return false;
}

function isStopEvent(event) {
  return stopBindings.some((binding) => bindingMatchesEvent(event, binding));
}

function isPlayEvent(event) {
  return playBindings.some((binding) => bindingMatchesEvent(event, binding));
}

function loadPersistedRemoteKeys() {
  try {
    const raw = fs.readFileSync(REMOTE_KEYS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return { stopKey: null, playKey: null };
  }
}

function savePersistedRemoteKeys(keys) {
  try {
    fs.mkdirSync(path.dirname(REMOTE_KEYS_PATH), { recursive: true });
    fs.writeFileSync(REMOTE_KEYS_PATH, JSON.stringify(keys, null, 2));
  } catch (error) {
    console.warn("Impossible d'enregistrer les touches manette :", error.message);
  }
}

function applyRemoteKeys({ stopKey = null, playKey = null } = {}) {
  stopBindings = stopKey ? [stopKey] : [];
  playBindings = playKey ? [playKey] : [DEFAULT_PLAY_KEY];
  savePersistedRemoteKeys({ stopKey, playKey });
}

function updateRemoteKeys(payload = {}) {
  const current = loadPersistedRemoteKeys();
  applyRemoteKeys({
    stopKey: payload.stopKey !== undefined ? payload.stopKey : current.stopKey,
    playKey: payload.playKey !== undefined ? payload.playKey : current.playKey
  });
}

function canFireNav(action) {
  const now = Date.now();

  if (action === "next") {
    if (now - lastNextAt < NAV_DEBOUNCE_MS) return false;
    lastNextAt = now;
    return true;
  }

  if (now - lastPrevAt < NAV_DEBOUNCE_MS) return false;
  lastPrevAt = now;
  return true;
}

function canFireStop() {
  const now = Date.now();
  if (now - lastStopAt < STOP_DEBOUNCE_MS) return false;
  lastStopAt = now;
  return true;
}

function cancelPlayHold() {
  if (playHoldTimer) {
    clearTimeout(playHoldTimer);
    playHoldTimer = null;
  }
}

function resetPlayKeyState() {
  playKeyDown = false;
  playKeyDownAt = 0;
  playHoldTriggered = false;
  cancelPlayHold();
}

function beginPlayHold(hostControls) {
  cancelPlayHold();
  playHoldTriggered = false;

  playHoldTimer = setTimeout(() => {
    playHoldTriggered = true;
    playHoldTimer = null;
    hostControls.timerStop();
  }, PLAY_HOLD_MS);
}

function endPlayHold(hostControls) {
  const wasLong = playHoldTriggered;
  resetPlayKeyState();

  if (!wasLong) {
    hostControls.playToggle();
  }
}

function startGlobalRemote(hostControls) {
  if (process.env.DJ_CARL_GLOBAL_REMOTE === "0") {
    console.log("Manette globale : désactivée (DJ_CARL_GLOBAL_REMOTE=0)");
    return null;
  }

  const nodeMajor = Number.parseInt(process.versions.node, 10);
  if (process.platform === "darwin" && nodeMajor >= 24) {
    console.log("Manette globale : désactivée (Node 24 — sudo-prompt incompatible)");
    return null;
  }

  applyRemoteKeys(loadPersistedRemoteKeys());

  try {
    ensureMacKeyServerExecutable();
    const listener = new GlobalKeyboardListener();

    listener.addListener((event) => {
      if (!event?.name) {
        return false;
      }

      if (isStopEvent(event)) {
        if (event.state === "DOWN") {
          resetPlayKeyState();
          if (canFireStop()) {
            hostControls.timerStop();
          }
        }
        return false;
      }

      if (isPlayEvent(event)) {
        if (event.state === "DOWN") {
          if (playKeyDown) {
            if (Date.now() - playKeyDownAt < PLAY_HOLD_MS + 800) {
              return false;
            }
            resetPlayKeyState();
          }

          playKeyDown = true;
          playKeyDownAt = Date.now();
          beginPlayHold(hostControls);
          return false;
        }

        if (event.state === "UP") {
          if (playKeyDown) {
            endPlayHold(hostControls);
          }
          return false;
        }

        return false;
      }

      if (event.state !== "DOWN") return false;

      if (NAV_NEXT_KEYS.has(event.name)) {
        if (canFireNav("next")) hostControls.nextQuestion();
        return false;
      }

      if (NAV_PREV_KEYS.has(event.name)) {
        if (canFireNav("prev")) hostControls.previousQuestion();
        return false;
      }

      return false;
    });

    const stopLabel = stopBindings[0]?.label || stopBindings[0]?.code || "non assigné";
    console.log(`Manette globale : Play/Stop (Stop=${stopLabel}), flèches, Page Up/Down — toute page / app`);
    if (process.platform === "darwin") {
      console.log("macOS : autorise Terminal ou node dans Réglages → Confidentialité → Accessibilité");
    }

    return listener;
  } catch (error) {
    console.warn("Manette globale indisponible :", error.message);
    return null;
  }
}

module.exports = { startGlobalRemote, updateRemoteKeys };
