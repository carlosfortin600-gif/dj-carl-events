(function initTechDepartureAuto() {
  const block = document.getElementById("tech-travel-schedule");
  if (!block) return;

  const origin = block.getAttribute("data-route-origin")?.trim() || "";
  const destination = block.getAttribute("data-route-destination")?.trim() || "";
  const arrivalWrap = document.getElementById("tech_arrival_datetime")?.closest(".datetime-fr-picker");
  const departureHidden = document.getElementById("tech_departure_datetime");
  const departureDisplay = document.getElementById("tech_departure_auto_display");
  const hint = document.getElementById("tech_travel_duration_hint");

  if (!arrivalWrap || !departureHidden || !departureDisplay) return;

  const dateNative = arrivalWrap.querySelector(".datetime-date-native");
  const timeInput = arrivalWrap.querySelector(".datetime-fr-time");
  const arrivalCombined = arrivalWrap.querySelector(".datetime-fr-combined");

  let timer = null;
  let requestId = 0;

  const formatFr =
    window.DateFormatFr && window.DateFormatFr.formatDateTimeFr
      ? window.DateFormatFr.formatDateTimeFr
      : (date, time) => [date, time].filter(Boolean).join(" ");

  function readArrival() {
    if (window.DateFormatFr?.syncAllDatetimePickers) {
      window.DateFormatFr.syncAllDatetimePickers(arrivalWrap);
    }
    const combined = arrivalCombined?.value?.trim();
    if (!combined) return null;
    const [date, timePart] = combined.split("T");
    const time = timePart ? timePart.slice(0, 5) : "";
    if (!date || !time) return null;
    return { date, time, combined };
  }

  function subtractSecondsFromArrival(arrivalDate, arrivalTime, durationSeconds) {
    const [y, m, d] = arrivalDate.split("-").map(Number);
    const match = arrivalTime.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const arrivalMs = new Date(y, m - 1, d, hours, minutes, 0).getTime();
    const departureMs = arrivalMs - Math.max(0, durationSeconds) * 1000;
    const dt = new Date(departureMs);
    const pad = (n) => String(n).padStart(2, "0");
    return {
      date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
      time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    };
  }

  function renderDeparture(dep, durationLabel) {
    if (!dep) {
      departureHidden.value = "";
      departureDisplay.innerHTML = '<span class="text-muted">—</span>';
      if (hint) hint.textContent = "";
      return;
    }
    const combined = `${dep.date}T${dep.time}`;
    departureHidden.value = combined;
    const when = formatFr(dep.date, dep.time);
    const originLine = origin ? `<div class="small text-muted mt-1">de ${escapeHtml(origin)}</div>` : "";
    departureDisplay.innerHTML = `<div class="fw-semibold text-primary">${escapeHtml(when)}</div>${originLine}`;
    if (hint) {
      hint.textContent = durationLabel
        ? `Temps de route estimé : ${durationLabel} (soustrait de l’heure d’arrivée).`
        : "";
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scheduleRecalc() {
    clearTimeout(timer);
    timer = setTimeout(recalc, 400);
  }

  async function recalc() {
    const arrival = readArrival();
    if (!arrival) {
      renderDeparture(null);
      return;
    }

    if (!origin || !destination) {
      if (hint) {
        hint.textContent = !origin
          ? "Renseignez l’adresse de départ dans Résumé pour calculer le départ."
          : "Renseignez l’adresse de l’événement dans Résumé pour calculer le départ.";
      }
      return;
    }

    const currentRequest = ++requestId;
    if (hint) hint.textContent = "Calcul du temps de route…";

    try {
      const params = new URLSearchParams({ origin, destination });
      const response = await fetch(`/api/route-time?${params.toString()}`);
      const data = await response.json();
      if (currentRequest !== requestId) return;

      if (!response.ok || !data.durationSeconds) {
        if (hint) {
          hint.textContent = data.error || "Impossible de calculer le temps de route.";
        }
        return;
      }

      const dep = subtractSecondsFromArrival(
        arrival.date,
        arrival.time,
        data.durationSeconds
      );
      if (!dep) return;
      renderDeparture(dep, data.durationLabel);
    } catch {
      if (currentRequest !== requestId) return;
      if (hint) hint.textContent = "Impossible de calculer le temps de route.";
    }
  }

  dateNative?.addEventListener("change", scheduleRecalc);
  dateNative?.addEventListener("input", scheduleRecalc);
  timeInput?.addEventListener("change", scheduleRecalc);
  timeInput?.addEventListener("input", scheduleRecalc);

  if (readArrival()) scheduleRecalc();
})();