(function initTechDepartureAuto() {
  const block = document.getElementById("tech-travel-schedule");
  if (!block) return;

  const origin = block.getAttribute("data-route-origin")?.trim() || "";
  const arrivalWrap = document.getElementById("tech_arrival_datetime")?.closest(".datetime-fr-picker");
  const hoursInput = document.getElementById("tech_travel_duration_hours");
  const minsInput = document.getElementById("tech_travel_duration_mins");
  const departureHidden = document.getElementById("tech_departure_datetime");
  const departureDisplay = document.getElementById("tech_departure_auto_display");
  const hint = document.getElementById("tech_travel_duration_hint");

  if (!arrivalWrap || !hoursInput || !minsInput || !departureHidden || !departureDisplay) return;

  const dateNative = arrivalWrap.querySelector(".datetime-date-native");
  const timeInput = arrivalWrap.querySelector(".datetime-fr-time");
  const arrivalCombined = arrivalWrap.querySelector(".datetime-fr-combined");

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
    return { date, time };
  }

  function readDurationMinutes() {
    const h = parseInt(String(hoursInput.value || "0"), 10);
    const m = parseInt(String(minsInput.value || "0"), 10);
    const hours = Number.isFinite(h) && h >= 0 ? h : 0;
    const mins = Number.isFinite(m) && m >= 0 ? m : 0;
    const total = hours * 60 + mins;
    return total > 0 ? total : null;
  }

  function subtractSecondsFromArrival(arrivalDate, arrivalTime, durationSeconds) {
    const [y, month, d] = arrivalDate.split("-").map(Number);
    const match = arrivalTime.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const arrivalMs = new Date(y, month - 1, d, hours, minutes, 0).getTime();
    const departureMs = arrivalMs - Math.max(0, durationSeconds) * 1000;
    const dt = new Date(departureMs);
    const pad = (n) => String(n).padStart(2, "0");
    return {
      date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
      time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
    };
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDurationLabel(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  }

  function recalc() {
    const arrival = readArrival();
    const durationMinutes = readDurationMinutes();

    if (!arrival) {
      departureHidden.value = "";
      departureDisplay.innerHTML = '<span class="text-muted">—</span>';
      if (hint) hint.textContent = "";
      return;
    }

    if (!durationMinutes) {
      departureHidden.value = "";
      departureDisplay.innerHTML =
        '<span class="text-muted">Indiquez le temps de route</span>';
      if (hint) {
        hint.textContent =
          "Saisissez l’arrivée et le temps de route (manuel). Départ = arrivée − ce temps.";
      }
      return;
    }

    const dep = subtractSecondsFromArrival(arrival.date, arrival.time, durationMinutes * 60);
    if (!dep) return;

    departureHidden.value = `${dep.date}T${dep.time}`;
    const when = formatFr(dep.date, dep.time);
    const originLine = origin
      ? `<div class="small text-muted mt-1">de ${escapeHtml(origin)}</div>`
      : "";
    departureDisplay.innerHTML = `<div class="fw-semibold text-primary">${escapeHtml(when)}</div>${originLine}`;
    if (hint) {
      hint.textContent = `Temps de route : ${formatDurationLabel(durationMinutes)} — départ = arrivée − ce temps.`;
    }
  }

  function scheduleRecalc() {
    recalc();
  }

  dateNative?.addEventListener("change", scheduleRecalc);
  dateNative?.addEventListener("input", scheduleRecalc);
  timeInput?.addEventListener("change", scheduleRecalc);
  timeInput?.addEventListener("input", scheduleRecalc);
  hoursInput.addEventListener("change", scheduleRecalc);
  hoursInput.addEventListener("input", scheduleRecalc);
  minsInput.addEventListener("change", scheduleRecalc);
  minsInput.addEventListener("input", scheduleRecalc);

  recalc();
})();