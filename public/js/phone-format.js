(function () {
  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (!digits) return "";
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function bindPhoneInput(input) {
    if (!input || input.dataset.phoneBound === "1") return;
    input.dataset.phoneBound = "1";
    input.setAttribute("inputmode", "tel");
    input.setAttribute("autocomplete", input.getAttribute("autocomplete") || "tel");

    input.addEventListener("input", () => {
      const start = input.selectionStart;
      const before = input.value;
      input.value = formatPhone(before);
      if (typeof start === "number") {
        const delta = input.value.length - before.length;
        input.setSelectionRange(start + delta, start + delta);
      }
    });

    if (input.value) {
      input.value = formatPhone(input.value);
    }
  }

  document.querySelectorAll(".phone-input").forEach(bindPhoneInput);
})();
