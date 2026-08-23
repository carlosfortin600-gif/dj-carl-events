document.querySelectorAll("[data-copy-target]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const input = document.getElementById(btn.dataset.copyTarget);
    if (!input) return;

    const text = input.value;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    btn.textContent = "Copié !";
    btn.classList.add("btn-success");
    btn.classList.remove("btn-outline-primary");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("btn-success");
      btn.classList.add("btn-outline-primary");
    }, 2000);
  });
});
