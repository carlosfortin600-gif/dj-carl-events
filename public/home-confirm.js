(function initHomeConfirm() {
  const DEFAULT_MESSAGE =
    "Retourner à l'accueil ?\n\nVous quittez cette application. L'écran public n'est pas remis à zéro automatiquement.";

  function bindHomeLinks() {
    document.querySelectorAll("[data-home-confirm]").forEach((link) => {
      if (link.dataset.homeConfirmBound === "1") return;
      link.dataset.homeConfirmBound = "1";

      link.addEventListener("click", (event) => {
        event.preventDefault();
        const message = link.getAttribute("data-home-confirm-message") || DEFAULT_MESSAGE;
        if (window.confirm(message)) {
          window.location.href = link.getAttribute("href") || "/";
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHomeLinks);
  } else {
    bindHomeLinks();
  }
})();
