(function () {
  function syncThematicEvening(form) {
    const isYes = form.querySelector('input[name="thematic_evening"][value="yes"]:checked');
    const block = form.querySelector(".js-thematic-evening-choices");
    if (!block) return;

    block.hidden = !isYes;
    if (!isYes) {
      block.querySelectorAll('input[name="evening_themes"]').forEach((input) => {
        input.checked = false;
      });
      const otherInput = form.querySelector('input[name="evening_theme_other"]');
      if (otherInput) {
        otherInput.value = "";
        otherInput.disabled = true;
      }
    } else {
      syncAutreTheme(form);
    }
  }

  function syncAutreTheme(form) {
    const hasAutre = form.querySelector('input[name="evening_themes"][value="Autre"]:checked');
    const otherInput = form.querySelector(".js-thematic-autre-input");
    if (!otherInput) return;
    otherInput.disabled = !hasAutre;
    if (!hasAutre) otherInput.value = "";
  }

  function initPartyQuestionnaireForm() {
    const form = document.getElementById("questionnaireForm");
    if (!form || !form.querySelector('input[name="thematic_evening"]')) return;

    syncThematicEvening(form);

    form.querySelectorAll('input[name="thematic_evening"]').forEach((input) => {
      input.addEventListener("change", () => syncThematicEvening(form));
    });
    form.querySelectorAll('input[name="evening_themes"]').forEach((input) => {
      input.addEventListener("change", () => syncAutreTheme(form));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPartyQuestionnaireForm);
  } else {
    initPartyQuestionnaireForm();
  }
})();
