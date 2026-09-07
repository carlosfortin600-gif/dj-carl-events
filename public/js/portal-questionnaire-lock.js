(function () {
  function lockElement(el) {
    if (!el || el.dataset.djLockedApplied === "1") return;
    el.dataset.djLockedApplied = "1";
    el.disabled = true;
    el.classList.add("portal-dj-locked");
    if (el.type === "hidden") return;
    const label = el.id
      ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      : el.closest(".form-check")?.querySelector(".form-check-label");
    if (label && !label.querySelector(".portal-dj-lock-badge")) {
      const badge = document.createElement("span");
      badge.className = "portal-dj-lock-badge badge bg-secondary ms-1";
      badge.textContent = "DJ Carl";
      label.appendChild(badge);
    }
  }

  function applyPortalQuestionnaireLocks(form) {
    if (!form) return;
    let lockedFields = [];
    try {
      const raw = form.dataset.djLockedFields || "[]";
      lockedFields = JSON.parse(decodeURIComponent(raw));
    } catch {
      lockedFields = [];
    }
    if (!lockedFields.length) return;

    for (const key of lockedFields) {
      if (key.includes(":")) {
        const [name, value] = key.split(":");
        form.querySelectorAll(`[name="${name}"][value="${CSS.escape(value)}"]`).forEach(lockElement);
        continue;
      }

      form.querySelectorAll(`[name="${key}"]`).forEach((el) => {
        lockElement(el);
        if (el.type === "radio" || el.type === "checkbox") {
          const group = el.closest(".btn-group, .d-flex, .form-check, .row");
          group?.querySelectorAll(`[name="${key}"]`).forEach(lockElement);
        }
      });
    }
  }

  document.querySelectorAll("[data-dj-locked-fields]").forEach(applyPortalQuestionnaireLocks);
})();
