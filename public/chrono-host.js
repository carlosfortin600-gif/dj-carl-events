(function () {
  if (new URLSearchParams(location.search).get("embed") === "1") {
    document.body.classList.add("is-embed");
  }

  const MIN_BUZZ_MS = 100;
  const socket = io();
  const sync = ChronoUI.createClockSync(socket);
  const go = document.getElementById("go");
  const goTarget = document.getElementById("goTarget");
  const goWord = document.getElementById("goWord");
  const goTime = document.getElementById("goTime");
  const goDelta = document.getElementById("goDelta");
  const targetInput = document.getElementById("target");
  const nameInput = document.getElementById("name");
  const ranks = document.getElementById("ranks");
  const errorEl = document.getElementById("error");
  const linkEl = document.getElementById("link");
  const clearBtn = document.getElementById("clear");

  let state = null;
  let starting = false;
  let stopping = false;
  let queuedBuzzAt = null;
  let displayFreeze = null;
  let sawReady = false;
  let nameTimer = 0;

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function currentTargetMs() {
    return ChronoUI.parseTargetMs(targetInput.value) || (state ? state.targetMs : 3320);
  }

  function paintButton() {
    const ready = sync.isReady() && socket.connected && state;
    const runningLook = starting || !!(state && state.phase === "running");
    go.disabled = !ready;
    goTarget.textContent = ChronoUI.formatClock(state ? state.targetMs : currentTargetMs());
    document.body.classList.toggle("is-waiting", !ready);
    document.body.classList.toggle("is-running", runningLook);
    document.body.classList.toggle("is-stopped", !!(state && state.phase === "stopped") && !runningLook);

    if (!ready) {
      goWord.textContent = socket.connected ? "CONNEXION" : "HORS LIGNE";
      goTime.textContent = "0,00";
      goDelta.textContent = "";
      return;
    }

    if (runningLook) {
      goWord.textContent = "BUZZ";
      goDelta.textContent = "";
      if (displayFreeze != null) {
        goTime.textContent = ChronoUI.formatClock(displayFreeze);
      }
      return;
    }

    if (state.phase === "stopped") {
      goWord.textContent = "REMETTRE À ZÉRO";
      goTime.textContent = ChronoUI.formatClock(state.elapsedMs);
      const row = ChronoUI.stoppedResult(state);
      goDelta.textContent = row ? ChronoUI.formatDelta(row.deltaMs) : "";
      displayFreeze = null;
      return;
    }

    goWord.textContent = "DÉPART";
    goTime.textContent = "0,00";
    goDelta.textContent = "";
    displayFreeze = null;
  }

  function applyState(next) {
    const previous = state;
    state = next;
    const locked = next.phase === "running" || starting;
    targetInput.disabled = locked;
    nameInput.disabled = locked;
    document.querySelectorAll("[data-nudge]").forEach((button) => {
      button.disabled = locked;
    });
    clearBtn.disabled = !next.results.length;

    if (document.activeElement !== targetInput && next.phase !== "running") {
      targetInput.value = ChronoUI.formatClock(next.targetMs);
    }
    nameInput.placeholder = "Concurrent " + next.nextNumber;

    if (previous && previous.phase === "running" && next.phase === "stopped") {
      const typed = nameInput.value.trim();
      if (!typed || typed === next.attemptName) nameInput.value = "";
    }

    ChronoUI.renderRanks(ranks, next.results, (id) => {
      socket.emit("chronoRemove", { id }, (res) => {
        if (!res || !res.ok) showError(res && res.error ? res.error : "Impossible de retirer.");
      });
    });
    paintButton();
  }

  function fail(res, fallback) {
    showError(res && res.error ? res.error : fallback);
    paintButton();
  }

  function doStop(buzzServerNow) {
    if (stopping || !state || state.phase !== "running" || !state.startedAt) return;
    const elapsedMs = buzzServerNow - state.startedAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_BUZZ_MS) return;
    stopping = true;
    displayFreeze = elapsedMs;
    paintButton();
    socket.emit("chronoStop", { runId: state.runId, elapsedMs }, (res) => {
      stopping = false;
      if (!res || !res.ok) {
        displayFreeze = null;
        fail(res, "Buzz refusé.");
        return;
      }
      showError("");
      applyState(res.state);
    });
  }

  function beginStart() {
    if (starting) return;
    starting = true;
    queuedBuzzAt = null;
    displayFreeze = null;
    showError("");
    paintButton();
    socket.emit("chronoStart", {
      name: nameInput.value,
      targetMs: currentTargetMs()
    }, (res) => {
      starting = false;
      if (!res || !res.ok) {
        queuedBuzzAt = null;
        fail(res, "Impossible de démarrer.");
        return;
      }
      applyState(res.state);
      if (queuedBuzzAt != null) {
        const buzzAt = queuedBuzzAt;
        queuedBuzzAt = null;
        doStop(buzzAt);
      }
    });
  }

  function onPress() {
    if (!state || !socket.connected || !sync.isReady() || stopping) return;
    if (state.phase === "stopped") {
      socket.emit("chronoReset", (res) => {
        if (!res || !res.ok) fail(res, "Remise à zéro refusée.");
        else showError("");
      });
      return;
    }
    if (state.phase === "running") {
      doStop(sync.serverNow());
      return;
    }
    if (starting) {
      queuedBuzzAt = sync.serverNow();
      return;
    }
    beginStart();
  }

  go.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onPress();
  }, { passive: false });
  go.addEventListener("contextmenu", (event) => event.preventDefault());

  document.querySelectorAll("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = ChronoUI.clampTarget(currentTargetMs() + Number(button.dataset.nudge));
      targetInput.value = ChronoUI.formatClock(next);
      socket.emit("chronoSetTarget", { targetMs: next }, (res) => {
        if (!res || !res.ok) showError(res && res.error ? res.error : "Cible refusée.");
      });
    });
  });

  targetInput.addEventListener("change", () => {
    const parsed = ChronoUI.parseTargetMs(targetInput.value);
    if (parsed == null) {
      if (state) targetInput.value = ChronoUI.formatClock(state.targetMs);
      showError("Choisis une cible entre 0,10 s et 3 min.");
      return;
    }
    showError("");
    socket.emit("chronoSetTarget", { targetMs: parsed }, (res) => {
      if (!res || !res.ok) {
        if (state) targetInput.value = ChronoUI.formatClock(state.targetMs);
        showError(res && res.error ? res.error : "Cible refusée.");
      }
    });
  });

  const nameField = nameInput.closest(".chrono-field-name");
  nameField.addEventListener("pointerdown", () => {
    if (nameInput.disabled) return;
    if (document.activeElement === nameInput) return;
    if (!nameInput.value) return;
    nameInput.value = "";
    window.clearTimeout(nameTimer);
    socket.emit("chronoSetName", { name: "" });
  });
  nameField.addEventListener("pointerup", () => {
    if (nameInput.disabled) return;
    nameInput.focus({ preventScroll: true });
  });

  function closeKeyboard(input) {
    input.blur();
  }

  nameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    window.clearTimeout(nameTimer);
    const typed = nameInput.value;
    closeKeyboard(nameInput);
    if (!state || state.phase === "running") return;
    const armStart = state.phase === "stopped";
    socket.emit("chronoSetName", { name: typed }, (res) => {
      if (!res || !res.ok) {
        showError(res && res.error ? res.error : "Nom refusé.");
        return;
      }
      if (!armStart) return;
      socket.emit("chronoReset", (resetRes) => {
        if (!resetRes || !resetRes.ok) fail(resetRes, "Remise à zéro refusée.");
        else showError("");
      });
    });
  });

  targetInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    closeKeyboard(targetInput);
  });

  nameInput.addEventListener("input", () => {
    window.clearTimeout(nameTimer);
    nameTimer = window.setTimeout(() => {
      if (state && state.phase !== "running") return;
      socket.emit("chronoSetName", { name: nameInput.value });
    }, 160);
  });

  clearBtn.addEventListener("click", () => {
    if (!state || !state.results.length) return;
    if (!window.confirm("Effacer tout le classement ?")) return;
    nameInput.value = "";
    socket.emit("chronoClear", (res) => {
      if (!res || !res.ok) showError(res && res.error ? res.error : "Effacement refusé.");
      else showError("");
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.code !== "Space" && event.code !== "Enter") return;
    event.preventDefault();
    onPress();
  });

  socket.on("connect", () => {
    linkEl.textContent = "Relié";
    linkEl.classList.add("is-on");
    sync.sample();
    socket.emit("joinChrono", { role: "host" }, (incoming) => {
      if (incoming && incoming.phase) applyState(incoming);
    });
  });

  socket.on("disconnect", () => {
    linkEl.textContent = "Hors ligne";
    linkEl.classList.remove("is-on");
    paintButton();
  });

  socket.on("chronoState", (incoming) => {
    const typedName = document.activeElement === nameInput ? nameInput.value : null;
    applyState(incoming);
    if (typedName != null) nameInput.value = typedName;
  });

  window.setInterval(() => {
    if (!sync.isReady()) sync.sample();
  }, 400);

  function frame() {
    if (!sawReady && sync.isReady() && state) {
      sawReady = true;
      paintButton();
    }
    if (socket.connected && state && state.phase === "running" && state.startedAt && displayFreeze == null && !stopping) {
      goTime.textContent = ChronoUI.formatClock(Math.max(0, sync.serverNow() - state.startedAt));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !sync.isReady()) sync.sample();
  });

  function askWakeLock() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").catch(() => {});
  }
  document.addEventListener("pointerdown", askWakeLock, { once: true });
})();
