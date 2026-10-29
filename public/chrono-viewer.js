(function () {
  const socket = io();
  const sync = ChronoUI.createClockSync(socket);
  const targetEl = document.getElementById("target");
  const playerEl = document.getElementById("player");
  const clockEl = document.getElementById("clock");
  const deltaEl = document.getElementById("delta");
  const judgeEl = document.getElementById("judge");
  const ranksEl = document.getElementById("ranks");
  const fullscreenBtn = document.getElementById("fullscreen");

  let state = null;
  let audioCtx = null;

  function audio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(ctx, freq, at, duration, gainValue) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainValue, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  function play(kind) {
    try {
      const ctx = audio();
      if (!ctx) return;
      const now = ctx.currentTime;
      if (kind === "start") {
        tone(ctx, 880, now, 0.09, 0.12);
        return;
      }
      if (kind === "pile") {
        tone(ctx, 523, now, 0.12, 0.14);
        tone(ctx, 659, now + 0.1, 0.12, 0.14);
        tone(ctx, 784, now + 0.2, 0.22, 0.16);
        return;
      }
      if (kind === "close") {
        tone(ctx, 660, now, 0.1, 0.12);
        tone(ctx, 880, now + 0.1, 0.16, 0.12);
        return;
      }
      tone(ctx, 196, now, 0.18, 0.1);
    } catch (error) {
      /* le son est optionnel si le navigateur le bloque */
    }
  }

  function setClock(ms) {
    clockEl.textContent = ChronoUI.formatClock(ms);
  }

  function applyState(next) {
    const previous = state;
    state = next;
    document.body.className = "chrono-viewer is-" + next.phase;
    targetEl.textContent = ChronoUI.formatClock(next.targetMs);
    playerEl.textContent = next.label || "";
    ChronoUI.renderRanks(ranksEl, next.results);

    const row = ChronoUI.stoppedResult(next);
    if (row) {
      const kind = ChronoUI.accuracy(row.deltaMs);
      document.body.classList.add("is-" + kind);
      deltaEl.textContent = ChronoUI.formatDelta(row.deltaMs);
      judgeEl.textContent = kind === "pile" ? "" : ChronoUI.judge(row.deltaMs);
      setClock(row.elapsedMs);
    } else if (next.phase === "running") {
      deltaEl.textContent = "";
      judgeEl.textContent = "";
    } else if (next.phase === "stopped") {
      deltaEl.textContent = "";
      judgeEl.textContent = "";
      setClock(next.elapsedMs);
    } else {
      deltaEl.textContent = "";
      judgeEl.textContent = "Prêt";
      setClock(0);
    }

    if (!previous || previous.phase === next.phase) return;
    if (next.phase === "running") play("start");
    if (next.phase === "stopped" && row) play(ChronoUI.accuracy(row.deltaMs));
  }

  function frame() {
    if (state && state.phase === "running" && state.startedAt && sync.isReady()) {
      setClock(Math.max(0, sync.serverNow() - state.startedAt));
    }
    requestAnimationFrame(frame);
  }

  socket.on("connect", () => {
    sync.sample();
    socket.emit("joinChrono", { role: "viewer" }, (incoming) => {
      if (incoming && incoming.phase) applyState(incoming);
    });
  });

  socket.on("chronoState", applyState);

  window.setInterval(() => {
    if (!sync.isReady()) sync.sample();
  }, 400);

  document.addEventListener("pointerdown", () => {
    playUnlock();
  });

  function playUnlock() {
    try { audio(); } catch (error) { /* ignore */ }
  }

  fullscreenBtn.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {});
  });

  document.addEventListener("fullscreenchange", () => {
    fullscreenBtn.hidden = !!document.fullscreenElement;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "f") return;
    fullscreenBtn.click();
  });

  requestAnimationFrame(frame);
})();
