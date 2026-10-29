(function (root) {
  const MIN_TARGET_MS = 100;
  const MAX_TARGET_MS = 180000;

  function roundToCentisecond(ms) {
    return Math.round(Number(ms) / 10) * 10;
  }

  function formatClock(ms) {
    const centiseconds = Math.max(0, Math.round(Number(ms) / 10));
    const seconds = Math.floor(centiseconds / 100);
    const hundredths = centiseconds % 100;
    return seconds + "," + String(hundredths).padStart(2, "0");
  }

  function formatDelta(deltaMs) {
    const centiseconds = Math.round(Number(deltaMs) / 10);
    if (centiseconds === 0) return "PILE";
    const sign = centiseconds > 0 ? "+" : "−";
    const abs = Math.abs(centiseconds);
    return sign + Math.floor(abs / 100) + "," + String(abs % 100).padStart(2, "0");
  }

  function accuracy(deltaMs) {
    const abs = Math.abs(Math.round(Number(deltaMs) / 10));
    if (abs === 0) return "pile";
    if (abs <= 5) return "close";
    if (abs <= 20) return "near";
    return "far";
  }

  function judge(deltaMs) {
    const centiseconds = Math.round(Number(deltaMs) / 10);
    if (centiseconds === 0) return "PILE";
    if (centiseconds < 0) return "Trop tôt";
    return "Trop tard";
  }

  function parseTargetMs(value) {
    let ms;
    if (typeof value === "number" && Number.isFinite(value)) {
      ms = value;
    } else {
      const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
      if (!/^\d+(\.\d+)?$/.test(text)) return null;
      ms = Number(text) * 1000;
    }
    if (!Number.isFinite(ms)) return null;
    ms = roundToCentisecond(Math.round(ms));
    if (ms < MIN_TARGET_MS || ms > MAX_TARGET_MS) return null;
    return ms;
  }

  function clampTarget(ms) {
    const rounded = roundToCentisecond(ms);
    return Math.min(MAX_TARGET_MS, Math.max(MIN_TARGET_MS, rounded));
  }

  function stoppedResult(game) {
    if (!game || game.phase !== "stopped") return null;
    let match = null;
    (game.results || []).forEach((row) => {
      if (row.elapsedMs !== game.elapsedMs || row.name !== game.attemptName) return;
      if (!match || row.id > match.id) match = row;
    });
    return match;
  }

  function renderRanks(listEl, results, onRemove) {
    listEl.replaceChildren();
    if (!results || !results.length) {
      const empty = document.createElement("li");
      empty.className = "chrono-empty";
      empty.textContent = "Aucun essai";
      listEl.appendChild(empty);
      return;
    }

    results.forEach((row) => {
      const item = document.createElement("li");
      item.className = "chrono-rank is-" + accuracy(row.deltaMs);
      if (onRemove) item.classList.add("has-remove");

      const num = document.createElement("span");
      num.className = "chrono-rank-num";
      num.textContent = String(row.rank);

      const name = document.createElement("span");
      name.className = "chrono-rank-name";
      name.textContent = row.name;

      const time = document.createElement("span");
      time.className = "chrono-rank-time";
      time.textContent = formatClock(row.elapsedMs);

      const delta = document.createElement("span");
      delta.className = "chrono-rank-delta";
      delta.textContent = formatDelta(row.deltaMs);

      item.append(num, name, time, delta);

      if (onRemove) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "chrono-rank-remove";
        remove.textContent = "Retirer";
        remove.addEventListener("click", () => onRemove(row.id));
        item.appendChild(remove);
      }

      listEl.appendChild(item);
    });
  }

  function createClockSync(socket) {
    let offset = 0;
    let ready = false;

    function sample() {
      if (ready || !socket.connected) return;
      const sent = Date.now();
      socket.emit("chronoPing", (serverNow) => {
        if (ready || typeof serverNow !== "number") return;
        const now = Date.now();
        const rtt = now - sent;
        if (rtt < 0 || rtt > 250) return;
        offset = serverNow + rtt / 2 - now;
        ready = true;
      });
    }

    return {
      sample,
      serverNow() {
        return Date.now() + offset;
      },
      isReady() {
        return ready;
      }
    };
  }

  root.ChronoUI = {
    formatClock,
    formatDelta,
    accuracy,
    judge,
    parseTargetMs,
    clampTarget,
    stoppedResult,
    renderRanks,
    createClockSync
  };
})(window);
