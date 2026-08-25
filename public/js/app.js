document.querySelectorAll("[data-copy-target]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const input = document.getElementById(btn.dataset.copyTarget);
    if (!input) return;

    const text = input.value;
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = "Copié !";
      btn.classList.add("btn-success");
      btn.classList.remove("btn-outline-primary", "btn-outline-secondary");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("btn-success");
        if (original === "Copier") {
          btn.classList.add(
            btn.closest(".input-group")?.querySelector("#portalLinkLan")
              ? "btn-outline-secondary"
              : "btn-outline-primary"
          );
        }
      }, 2000);
    } catch {
      input.select();
      document.execCommand("copy");
    }
  });
});

document.querySelectorAll(".event-delete-form").forEach((form) => {
  form.addEventListener("submit", (e) => {
    const name = form.dataset.confirmName || "ce client";
    const date = form.dataset.confirmDate || "";
    const msg = `Voulez-vous vraiment supprimer l'événement de ${name}${date ? ` — ${date}` : ""} ?\n\nIl sera déplacé dans la corbeille. Vous pourrez le restaurer plus tard.`;
    if (!confirm(msg)) e.preventDefault();
  });
});

document.querySelectorAll(".event-destroy-form").forEach((form) => {
  form.addEventListener("submit", (e) => {
    const name = form.dataset.confirmName || "ce client";
    const date = form.dataset.confirmDate || "";
    const msg = `SUPPRIMER DÉFINITIVEMENT l'événement de ${name}${date ? ` — ${date}` : ""} ?\n\nCette action est irréversible. Questionnaire, musique, plan de soirée et toutes les données seront effacés.`;
    if (!confirm(msg)) e.preventDefault();
  });
});

document.querySelectorAll("[data-event-toggle]").forEach((header) => {
  const id = header.dataset.eventToggle;
  const panel = document.getElementById(`eventChecklist${id}`);
  const row = header.closest(".event-row-expandable");
  if (!panel) return;

  function toggle() {
    const isOpen = panel.classList.contains("show");
    if (isOpen) {
      panel.classList.remove("show");
      header.setAttribute("aria-expanded", "false");
      row?.classList.remove("is-open");
    } else {
      panel.classList.add("show");
      header.setAttribute("aria-expanded", "true");
      row?.classList.add("is-open");
    }
  }

  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
});

function updateClientNameLabels() {
  const eventType = document.getElementById("event_type");
  const label1 = document.getElementById("label_first_name_1");
  const label2 = document.getElementById("label_first_name_2");
  const row = document.getElementById("clientNamesRow");
  if (!eventType || !label1 || !label2) return;

  const wedding = eventType.value === "Mariage";
  label1.textContent = wedding ? "Prénom du mari *" : "Personne contact *";
  label2.textContent = wedding ? "Prénom de la mariée" : "Personne contact 2";

  const lastNameLabel = document.getElementById("label_last_name");
  const lastNameField = document.getElementById("lastNameField");
  const lastNameInput = document.getElementById("last_name");
  const lastNameHidden = document.getElementById("last_name_wedding");
  if (lastNameLabel) {
    lastNameLabel.textContent = wedding ? "" : "Nom de l'entreprise *";
  }
  if (lastNameField) {
    lastNameField.style.display = wedding ? "none" : "";
  }
  if (lastNameInput) {
    lastNameInput.required = !wedding;
  }
  if (lastNameHidden) {
    lastNameHidden.disabled = !wedding;
  }

  if (row) {
    const field1 = row.querySelector('[data-client-field="1"]');
    const field2 = row.querySelector('[data-client-field="2"]');
    if (field1 && field2) {
      if (wedding) {
        row.appendChild(field2);
        row.appendChild(field1);
      } else {
        row.appendChild(field1);
        row.appendChild(field2);
      }
    }
  }
}

const eventTypeSelect = document.getElementById("event_type");
if (eventTypeSelect) {
  updateClientNameLabels();
  eventTypeSelect.addEventListener("change", updateClientNameLabels);
}

document.querySelectorAll('form[method="post"]').forEach((form) => {
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const target = e.target;
    if (target.tagName === "TEXTAREA") return;
    if (target.type === "submit") return;
    if (target.tagName === "BUTTON" && target.type === "submit") return;
    e.preventDefault();
  });
});

let allowNavigation = false;
let unsavedModalChoice = "cancel";
let unsavedModalResolver = null;

function serializeForm(form) {
  const parts = [];
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name || el.disabled) return;
    if (el.type === "checkbox") {
      parts.push(`${el.name}=${el.value}=${el.checked ? "1" : "0"}`);
    } else if (el.type === "radio") {
      if (el.checked) parts.push(`${el.name}=${el.value}`);
    } else if (el.type === "file") {
      parts.push(`${el.name}=${el.files?.length ? el.files[0].name : ""}`);
    } else {
      parts.push(`${el.name}=${el.value}`);
    }
  });
  return parts.sort().join("\n");
}

function isFormDirty(form) {
  return form.dataset.unsavedDirty === "true";
}

function getDirtyGuardedForms() {
  return [...document.querySelectorAll("form[data-unsaved-guard]")].filter(isFormDirty);
}

function markFormClean(form) {
  form.dataset.unsavedInitial = serializeForm(form);
  form.dataset.unsavedDirty = "false";
}

function syncFormDirty(form) {
  if (!form?.matches?.("[data-unsaved-guard]")) return;
  form.dataset.unsavedDirty =
    serializeForm(form) !== form.dataset.unsavedInitial ? "true" : "false";
  updateUnsavedBanner();
}

function updateUnsavedBanner() {
  const dirtyCount = getDirtyGuardedForms().length;
  let banner = document.getElementById("unsavedChangesBanner");

  if (dirtyCount === 0) {
    banner?.remove();
    return;
  }

  if (!banner) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="unsavedChangesBanner" class="alert alert-warning border-0 rounded-0 mb-0 text-center py-2 shadow-sm" role="status">
        <strong>Modifications non enregistrées</strong> — enregistrez avant de quitter cette page.
      </div>`
    );
  }
}

function resolveNavigationLink(target) {
  if (!(target instanceof Element)) return null;

  const direct = target.closest("a[href]");
  if (direct) return direct;

  const navItem = target.closest(".nav-item");
  if (navItem) {
    const nested = navItem.querySelector("a[href]");
    if (nested) return nested;
  }

  return null;
}

function navigationTarget(url) {
  const dest = new URL(url, window.location.href);
  return dest.pathname + dest.search;
}

function isSamePage(url) {
  return navigationTarget(url) === navigationTarget(window.location.href);
}

async function saveFormViaFetch(form) {
  const body = new URLSearchParams();
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name || el.disabled) return;
    if (el.type === "checkbox") {
      if (el.checked) body.append(el.name, el.value);
    } else if (el.type === "radio") {
      if (el.checked) body.append(el.name, el.value);
    } else if (el.type === "file") {
      return;
    } else {
      body.append(el.name, el.value);
    }
  });

  const response = await fetch(form.action, {
    method: (form.method || "POST").toUpperCase(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "text/html,application/json"
    },
    body,
    credentials: "same-origin",
    redirect: "manual"
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location") || "";
    return /Saved=1/.test(location);
  }

  return response.ok;
}

function ensureUnsavedModal() {
  if (document.getElementById("unsavedChangesModal")) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modal fade" id="unsavedChangesModal" tabindex="-1" aria-labelledby="unsavedChangesModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-warning">
          <div class="modal-header bg-warning-subtle">
            <h5 class="modal-title" id="unsavedChangesModalLabel">Modifications non enregistrées</h5>
          </div>
          <div class="modal-body">
            <p class="mb-0">Vous avez des modifications non enregistrées sur cette page. Que voulez-vous faire avant de continuer ?</p>
          </div>
          <div class="modal-footer flex-wrap gap-2 justify-content-start">
            <button type="button" class="btn btn-primary" id="unsavedModalSave">Enregistrer et continuer</button>
            <button type="button" class="btn btn-outline-danger" id="unsavedModalLeave">Quitter sans enregistrer</button>
            <button type="button" class="btn btn-outline-secondary ms-auto" id="unsavedModalCancel">Rester sur la page</button>
          </div>
        </div>
      </div>
    </div>`
  );

  const modalEl = document.getElementById("unsavedChangesModal");
  document.getElementById("unsavedModalSave").addEventListener("click", () => {
    unsavedModalChoice = "save";
    bootstrap.Modal.getInstance(modalEl)?.hide();
  });
  document.getElementById("unsavedModalLeave").addEventListener("click", () => {
    unsavedModalChoice = "leave";
    bootstrap.Modal.getInstance(modalEl)?.hide();
  });
  document.getElementById("unsavedModalCancel").addEventListener("click", () => {
    unsavedModalChoice = "cancel";
    bootstrap.Modal.getInstance(modalEl)?.hide();
  });
  modalEl.addEventListener("hidden.bs.modal", () => {
    if (unsavedModalResolver) {
      unsavedModalResolver(unsavedModalChoice);
      unsavedModalResolver = null;
    }
  });
}

function askUnsavedAction() {
  ensureUnsavedModal();
  unsavedModalChoice = "cancel";
  return new Promise((resolve) => {
    unsavedModalResolver = resolve;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("unsavedChangesModal")).show();
  });
}

async function handleNavigationAttempt(url) {
  const dirtyForms = getDirtyGuardedForms();
  if (dirtyForms.length === 0) {
    allowNavigation = true;
    window.location.href = url;
    return;
  }

  const choice = await askUnsavedAction();

  if (choice === "save") {
    for (const form of dirtyForms) {
      const saved = await saveFormViaFetch(form);
      if (!saved) {
        alert("Impossible d'enregistrer. Vérifiez les champs obligatoires.");
        return;
      }
      markFormClean(form);
    }
    updateUnsavedBanner();
    allowNavigation = true;
    window.location.href = url;
    return;
  }

  if (choice === "leave") {
    dirtyForms.forEach(markFormClean);
    updateUnsavedBanner();
    allowNavigation = true;
    window.location.href = url;
  }
}

function shouldInterceptNavigation(link) {
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
  if (getDirtyGuardedForms().length === 0) return false;

  try {
    if (isSamePage(href)) return false;
  } catch {
    return false;
  }

  return true;
}

function interceptNavigationClick(event) {
  if (allowNavigation) return;

  const link = resolveNavigationLink(event.target);
  if (!shouldInterceptNavigation(link)) return;

  event.preventDefault();
  event.stopPropagation();
  handleNavigationAttempt(link.href);
}

function setupGuardedForm(form) {
  markFormClean(form);

  form.addEventListener("submit", () => {
    allowNavigation = true;
    markFormClean(form);
    updateUnsavedBanner();
  });
}

function initUnsavedGuard() {
  allowNavigation = false;

  document.querySelectorAll("form[data-unsaved-guard]").forEach(setupGuardedForm);

  document.addEventListener(
    "input",
    (event) => {
      const form = event.target.closest?.("form[data-unsaved-guard]");
      if (form) syncFormDirty(form);
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      const form = event.target.closest?.("form[data-unsaved-guard]");
      if (form) syncFormDirty(form);
    },
    true
  );

  document.addEventListener("click", interceptNavigationClick, true);

  window.addEventListener("beforeunload", (event) => {
    if (allowNavigation || getDirtyGuardedForms().length === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      allowNavigation = false;
      document.querySelectorAll("form[data-unsaved-guard]").forEach((form) => {
        if (!isFormDirty(form)) markFormClean(form);
      });
      updateUnsavedBanner();
    }
  });

  requestAnimationFrame(() => {
    document.querySelectorAll("form[data-unsaved-guard]").forEach((form) => {
      if (!isFormDirty(form)) markFormClean(form);
    });
  });
}

initUnsavedGuard();

function getQuestionnaireRadioValue(form, name) {
  const checked = form.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`);
  return checked ? checked.value : "";
}

function shouldSkipQuestionnaireField(form, name) {
  if (!name || name === "_completed") return true;
  if (name.endsWith("_confirmed") || name.endsWith("_spotify")) return true;
  if (/^moment_.+_(time|song|notes)$/.test(name)) return true;
  if (name.endsWith("_notes")) return true;

  if (name.startsWith("first_dance_") && !["first_dance_enabled", "first_dance_approx_time"].includes(name)) {
    if (getQuestionnaireRadioValue(form, "first_dance_enabled") === "no") return true;
  }
  if (name === "first_dance_dj_announces" && getQuestionnaireRadioValue(form, "first_dance_enabled") === "no") {
    return true;
  }
  if (name.startsWith("father_daughter_") && name !== "father_daughter_enabled") {
    if (getQuestionnaireRadioValue(form, "father_daughter_enabled") === "no") return true;
  }
  if (name.startsWith("mother_son_") && name !== "mother_son_enabled") {
    if (getQuestionnaireRadioValue(form, "mother_son_enabled") === "no") return true;
  }
  if (["cocktail_location", "cocktail_place", "cocktail_dj_distance"].includes(name)) {
    const hasCocktail = getQuestionnaireRadioValue(form, "has_cocktail");
    if (hasCocktail === "no") return true;
  }
  if (name === "evening_theme_other") {
    const hasOther = form.querySelector('input[name="evening_themes"][value="Autre"]:checked');
    if (!hasOther) return true;
  }

  return false;
}

function questionnaireFieldWrapper(el) {
  return (
    el.closest("tr") ||
    el.closest(".border.rounded.p-3") ||
    el.closest(".mb-3") ||
    el.closest('[class*="col-"]')
  );
}

function markQuestionnaireLabelMissing(el) {
  const label =
    (el.id && el.form?.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
    (el.previousElementSibling?.matches?.(".form-label, label.form-label")
      ? el.previousElementSibling
      : null);
  label?.classList.add("q-label-missing");
}

function isQuestionnaireFieldEmpty(el) {
  if (el.type === "checkbox" || el.type === "radio") return !el.checked;
  return !String(el.value || "").trim();
}

function updateQuestionnaireMissingHighlight(form) {
  form.querySelectorAll(".q-field-missing").forEach((el) => el.classList.remove("q-field-missing"));
  form.querySelectorAll(".q-label-missing").forEach((el) => el.classList.remove("q-label-missing"));
  form.querySelectorAll(".q-section-has-missing").forEach((el) => el.classList.remove("q-section-has-missing"));

  const radioNames = new Set(
    [...form.querySelectorAll('input[type="radio"][name]')].map((el) => el.name)
  );
  radioNames.forEach((name) => {
    if (shouldSkipQuestionnaireField(form, name)) return;
    if (form.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`)) return;
    const radios = form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
    const wrapper = questionnaireFieldWrapper(radios[0]);
    wrapper?.classList.add("q-field-missing");
  });

  const checkboxCounts = {};
  form.querySelectorAll('input[type="checkbox"][name]').forEach((el) => {
    checkboxCounts[el.name] = (checkboxCounts[el.name] || 0) + 1;
  });
  Object.entries(checkboxCounts).forEach(([name, count]) => {
    if (count <= 1) return;
    if (shouldSkipQuestionnaireField(form, name)) return;
    const boxes = form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
    if ([...boxes].some((box) => box.checked)) return;
    boxes[0].closest(".row")?.classList.add("q-field-missing");
  });

  form.querySelectorAll(".border.rounded.p-3").forEach((block) => {
    const songInput = block.querySelector('input[name$="_song"]');
    if (!songInput || shouldSkipQuestionnaireField(form, songInput.name)) return;
    if (isQuestionnaireFieldEmpty(songInput)) block.classList.add("q-field-missing");
  });

  form.querySelectorAll('select[name^="moment_"][name$="_active"]').forEach((select) => {
    if (shouldSkipQuestionnaireField(form, select.name)) return;
    if (!isQuestionnaireFieldEmpty(select)) return;
    select.closest("tr")?.classList.add("q-field-missing");
  });

  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name || el.type === "hidden" || el.type === "submit" || el.type === "button") return;
    if (el.type === "radio") return;
    if (el.type === "checkbox" && checkboxCounts[el.name] > 1) return;
    if (shouldSkipQuestionnaireField(form, el.name)) return;
    if (!isQuestionnaireFieldEmpty(el)) return;
    const wrapper = questionnaireFieldWrapper(el);
    if (wrapper) {
      wrapper.classList.add("q-field-missing");
    } else {
      markQuestionnaireLabelMissing(el);
    }
  });

  form.querySelectorAll(".q-section").forEach((section) => {
    if (section.querySelector(".q-field-missing, .q-label-missing")) {
      section.classList.add("q-section-has-missing");
    }
  });
}

function initQuestionnaireMissingHighlight() {
  const form = document.getElementById("questionnaireForm");
  if (!form) return;

  const refresh = () => updateQuestionnaireMissingHighlight(form);
  refresh();

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);

  const params = new URLSearchParams(window.location.search);
  const focus = params.get("focus");
  if (!focus) return;

  requestAnimationFrame(() => {
    const target = form.querySelector(`[name="${CSS.escape(focus)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const wrapper =
      target.closest("tr") ||
      target.closest(".border.rounded.p-3") ||
      target.closest(".mb-3") ||
      target.closest('[class*="col-"]') ||
      target;
    wrapper.classList.add("q-field-missing", "q-field-focus-flash");
    if (target.focus) target.focus({ preventScroll: true });
  });
}

initQuestionnaireMissingHighlight();

(function initAddressMapLink() {
  const addressInput = document.getElementById("address");
  const mapLink = document.getElementById("address-map-link");
  if (!addressInput || !mapLink) return;

  const update = () => {
    const query = addressInput.value.trim();
    if (!query) {
      mapLink.classList.add("d-none");
      mapLink.href = "#";
      return;
    }
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    mapLink.classList.remove("d-none");
  };

  addressInput.addEventListener("input", update);
  update();
})();

(function initDateFrPickers() {
  window.DateFormatFr?.initPickers?.();
})();

(function initTechOptionalSections() {
  function bindToggle(yesId, noId, fieldsId) {
    const yes = document.getElementById(yesId);
    const no = document.getElementById(noId);
    const fields = document.getElementById(fieldsId);
    if (!yes || !no || !fields) return;

    function update() {
      const active = yes.checked;
      fields.hidden = !active;
      fields.querySelectorAll("input, textarea, select").forEach((el) => {
        el.disabled = !active;
      });
    }

    yes.addEventListener("change", update);
    no.addEventListener("change", update);
    update();
  }

  bindToggle("tech_trailer_yes", "tech_trailer_no", "tech_trailer_fields");
  bindToggle("tech_room_yes", "tech_room_no", "tech_room_fields");
})();

(function initCustomServiceInputs() {
  document.querySelectorAll("[data-custom-service-input]").forEach((input) => {
    const slot = input.dataset.customServiceInput;
    const checkbox = document.getElementById(`custom_svc_${slot}`);
    if (!checkbox) return;

    const syncCheckbox = () => {
      checkbox.checked = Boolean(input.value.trim());
    };

    input.addEventListener("input", syncCheckbox);
    syncCheckbox();
  });
})();

(function initClientPlanSteps() {
  const container = document.getElementById("clientPlanSteps");
  const template = document.getElementById("clientPlanStepTemplate");
  const addBtn = document.getElementById("addClientPlanStep");
  if (!container || !template || !addBtn) return;

  function reindexClientPlanRows() {
    container.querySelectorAll(".client-plan-row").forEach((row, index) => {
      row.querySelector(".client-plan-time")?.setAttribute("name", `client_plan_time_${index}`);
      row.querySelector(".client-plan-title")?.setAttribute("name", `client_plan_title_${index}`);
      row.querySelector(".client-plan-desc")?.setAttribute("name", `client_plan_desc_${index}`);
    });
  }

  function bindRemoveButton(row) {
    row.querySelector(".client-plan-remove")?.addEventListener("click", () => {
      row.remove();
      reindexClientPlanRows();
    });
  }

  container.querySelectorAll(".client-plan-row").forEach(bindRemoveButton);

  addBtn.addEventListener("click", () => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".client-plan-row");
    container.appendChild(fragment);
    bindRemoveButton(row);
    reindexClientPlanRows();
    row.querySelector(".client-plan-title")?.focus();
  });

  reindexClientPlanRows();
})();

(function initSpecialAnimationCards() {
  const grid = document.getElementById("specialAnimationGrid");
  const template = document.getElementById("specialAnimCardTemplate");
  const addBtn = document.getElementById("addSpecialAnimCard");
  if (!grid || !template || !addBtn) return;

  function reindexSpecialAnimationCards() {
    grid.querySelectorAll(".special-animation-card").forEach((card, index) => {
      card.querySelector(".special-anim-label")?.setAttribute("name", `special_anim_label_${index}`);
      card.querySelector(".special-anim-song")?.setAttribute("name", `special_anim_song_${index}`);
    });
  }

  addBtn.addEventListener("click", () => {
    const fragment = template.content.cloneNode(true);
    const col = fragment.querySelector(".col-6");
    grid.appendChild(fragment);
    reindexSpecialAnimationCards();
    col?.querySelector(".special-anim-label")?.focus();
  });

  reindexSpecialAnimationCards();
})();

(function initPortalHashScroll() {
  if (!location.hash) return;
  const target = document.querySelector(location.hash);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
