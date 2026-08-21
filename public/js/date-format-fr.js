(function (global) {
  const WEEKDAYS_FR = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi"
  ];

  const MONTHS_FR = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
  ];

  function parseIsoDate(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  function capitalizeFr(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function formatDateFr(iso) {
    const parts = parseIsoDate(iso);
    if (!parts) return "";
    const date = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
    const weekday = WEEKDAYS_FR[date.getDay()];
    const month = MONTHS_FR[parts.month - 1];
    return capitalizeFr(`${weekday} le ${parts.day} ${month} ${parts.year}`);
  }

  function formatTime(timeStr) {
    if (!timeStr) return "";
    const match = String(timeStr).trim().match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "";
  }

  function formatDateTimeFr(isoDate, timeStr) {
    const datePart = isoDate ? formatDateFr(isoDate) : "";
    const timePart = formatTime(timeStr);
    if (datePart && timePart) return `${datePart} à ${timePart}`;
    return datePart || timePart;
  }

  function formatDateTimeLocal(value) {
    if (!value) return "";
    const [date, time] = String(value).split("T");
    return formatDateTimeFr(date, time);
  }

  function formatDateRangeFr(start, end) {
    const from = formatDateFr(start);
    const to = formatDateFr(end);
    if (!from && !to) return "";
    if (from && to) return `${from} au ${to}`;
    if (from) return `À partir du ${from}`;
    return `Jusqu'au ${to}`;
  }

  function openNativePicker(native) {
    if (!native || native.disabled) return;
    try {
      if (typeof native.showPicker === "function") {
        native.showPicker();
        return;
      }
    } catch (_) {
      // Safari may throw if not in direct gesture — fall through
    }
    native.focus({ preventScroll: true });
    native.click();
  }

  function bindPicker(wrap, syncDisplay) {
    const native = wrap.querySelector(".date-fr-native, .datetime-fr-native");
    const display = wrap.querySelector(".date-fr-display, .datetime-fr-display");
    if (!native || !display) return;

    function sync() {
      syncDisplay(native, display);
    }

    function open() {
      openNativePicker(native);
    }

    native.addEventListener("change", sync);
    native.addEventListener("input", sync);
    display.addEventListener("click", open);
    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    if (native.id) {
      const label = document.querySelector(`label[for="${native.id}"]`);
      if (label) {
        label.addEventListener("click", (event) => {
          event.preventDefault();
          open();
        });
      }
    }

    sync();
  }

  function initPickers() {
    document.querySelectorAll(".date-fr-picker").forEach((wrap) => {
      bindPicker(wrap, (native, display) => {
        display.value = native.value ? formatDateFr(native.value) : "";
      });
    });

    document.querySelectorAll(".datetime-fr-picker").forEach((wrap) => {
      bindPicker(wrap, (native, display) => {
        display.value = native.value ? formatDateTimeLocal(native.value) : "";
      });
    });
  }

  global.DateFormatFr = {
    formatDateFr,
    formatDateTimeFr,
    formatDateTimeLocal,
    formatDateRangeFr,
    initPickers
  };
})(window);
