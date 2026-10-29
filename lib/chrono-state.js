const MIN_TARGET_MS = 100;
const MAX_TARGET_MS = 180000;
const MAX_ELAPSED_MS = 30 * 60 * 1000;
const MAX_RESULTS = 50;
const MAX_NAME = 40;

function cleanName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function roundToCentisecond(ms) {
  return Math.round(Number(ms) / 10) * 10;
}

function parseTargetMs(value) {
  let ms;
  if (typeof value === "number") {
    ms = value;
  } else {
    const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(text)) {
      throw new Error("Temps cible invalide.");
    }
    ms = Number(text) * 1000;
  }

  if (!Number.isFinite(ms)) {
    throw new Error("Temps cible invalide.");
  }

  ms = roundToCentisecond(Math.round(ms));
  if (ms < MIN_TARGET_MS || ms > MAX_TARGET_MS) {
    throw new Error("Choisis une cible entre 0,10 s et 3 min.");
  }
  return ms;
}

function createChronoState() {
  const state = {
    phase: "idle",
    targetMs: 3320,
    name: "",
    attemptName: "",
    nextNumber: 1,
    runId: 0,
    startedAt: 0,
    elapsedMs: 0,
    results: [],
    seq: 1
  };

  function label() {
    if (state.phase === "running" || state.phase === "stopped") {
      return state.attemptName;
    }
    return state.name || "Concurrent " + state.nextNumber;
  }

  function ranked() {
    return state.results
      .slice()
      .sort((a, b) => {
        const byDelta = Math.abs(a.deltaMs) - Math.abs(b.deltaMs);
        if (byDelta !== 0) return byDelta;
        return a.at - b.at || a.id - b.id;
      })
      .map((row, index) => ({
        id: row.id,
        name: row.name,
        elapsedMs: row.elapsedMs,
        deltaMs: row.deltaMs,
        targetMs: row.targetMs,
        rank: index + 1
      }));
  }

  function snapshot() {
    return {
      phase: state.phase,
      targetMs: state.targetMs,
      name: state.name,
      attemptName: state.attemptName,
      label: label(),
      nextNumber: state.nextNumber,
      runId: state.runId,
      startedAt: state.phase === "running" ? state.startedAt : 0,
      elapsedMs: state.elapsedMs,
      serverNow: Date.now(),
      results: ranked()
    };
  }

  function setTarget(value) {
    if (state.phase === "running") return snapshot();
    state.targetMs = parseTargetMs(value);
    return snapshot();
  }

  function setName(value) {
    if (state.phase === "running") return snapshot();
    state.name = cleanName(value);
    return snapshot();
  }

  function start(payload = {}, now = Date.now()) {
    if (state.phase === "running") return snapshot();
    if (payload.targetMs != null && payload.targetMs !== "") {
      state.targetMs = parseTargetMs(payload.targetMs);
    } else if (payload.target != null && payload.target !== "") {
      state.targetMs = parseTargetMs(payload.target);
    }

    const typed = cleanName(payload.name);
    state.attemptName = typed || state.name || "Concurrent " + state.nextNumber;
    state.name = "";
    state.phase = "running";
    state.runId += 1;
    state.startedAt = now;
    state.elapsedMs = 0;
    return snapshot();
  }

  function stop(payload = {}, now = Date.now()) {
    if (state.phase !== "running") return snapshot();
    if (payload.runId != null && Number(payload.runId) !== state.runId) {
      return snapshot();
    }

    const serverElapsed = Math.max(0, now - state.startedAt);
    let elapsedMs = Number(payload.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
      elapsedMs = serverElapsed;
    } else if (Math.abs(elapsedMs - serverElapsed) > 1500) {
      elapsedMs = serverElapsed;
    }

    elapsedMs = roundToCentisecond(elapsedMs);
    const targetMs = roundToCentisecond(state.targetMs);
    state.results.push({
      id: state.seq++,
      name: state.attemptName,
      elapsedMs,
      deltaMs: elapsedMs - targetMs,
      targetMs: state.targetMs,
      at: now
    });
    if (state.results.length > MAX_RESULTS) {
      state.results.splice(0, state.results.length - MAX_RESULTS);
    }

    state.phase = "stopped";
    state.elapsedMs = elapsedMs;
    state.startedAt = 0;
    state.nextNumber += 1;
    return snapshot();
  }

  function reset() {
    state.phase = "idle";
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.attemptName = "";
    state.runId += 1;
    return snapshot();
  }

  function clearResults() {
    state.results = [];
    state.nextNumber = 1;
    state.name = "";
    state.attemptName = "";
    state.phase = "idle";
    state.elapsedMs = 0;
    state.startedAt = 0;
    state.runId += 1;
    return snapshot();
  }

  function removeResult(id) {
    const numeric = Number(id);
    const next = state.results.filter((row) => row.id !== numeric);
    if (next.length === state.results.length) {
      throw new Error("Résultat introuvable.");
    }
    state.results = next;
    return snapshot();
  }

  return {
    getState: snapshot,
    setTarget,
    setName,
    start,
    stop,
    reset,
    clearResults,
    removeResult
  };
}

module.exports = {
  createChronoState,
  parseTargetMs
};
