const socket = io();
const rootEl = document.querySelector(".photo-people-upload");
const previewEl = document.getElementById("preview");
const photoInputEl = document.getElementById("photoInput");
const uploaderNameEl = document.getElementById("uploaderName");
const captionEl = document.getElementById("caption");
const sendBtn = document.getElementById("sendBtn");
const statusEl = document.getElementById("status");
const uploadLeadEl = document.getElementById("uploadLead");

let selectedFile = null;
let kicked = false;
let blocked = false;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `photo-people-upload__status${type ? ` ${type}` : ""}`;
}

function setLocked(locked, message, type) {
  rootEl.classList.toggle("is-locked", locked);
  previewEl.disabled = locked;
  uploaderNameEl.disabled = locked;
  captionEl.disabled = locked;
  sendBtn.disabled = locked || !selectedFile;

  uploadLeadEl.classList.toggle("is-blocked", type === "blocked");
  uploadLeadEl.classList.toggle("is-kicked", type === "kicked");
  uploadLeadEl.textContent = message;
}

function applyAccess({ isBlocked = false, isKicked = false } = {}) {
  blocked = isBlocked;
  kicked = isKicked;

  if (isKicked) {
    setLocked(true, "Déconnecté par l'animateur. Recharge pour te reconnecter.", "kicked");
    setStatus("");
    return;
  }

  if (isBlocked) {
    setLocked(true, "Les envois sont bloqués par l'animateur.", "blocked");
    setStatus("");
    return;
  }

  setLocked(false, "Touche le carré, puis envoie ta photo sur l'écran.");
}

function openCamera() {
  if (kicked || blocked) return;
  photoInputEl.click();
}

function renderPreview(file) {
  if (!file) {
    previewEl.innerHTML = "<span>Touche pour ouvrir la caméra</span>";
    sendBtn.disabled = true;
    return;
  }

  const url = URL.createObjectURL(file);
  previewEl.innerHTML = `<img src="${url}" alt="Aperçu">`;
  sendBtn.disabled = kicked || blocked;
}

socket.on("connect", () => {
  if (kicked) return;

  socket.emit("joinPhotoPeopleUpload", (response) => {
    applyAccess({ isBlocked: Boolean(response?.blocked) });
  });
});

socket.on("photoPeopleAccess", (data) => {
  if (kicked) return;
  applyAccess({ isBlocked: Boolean(data?.blocked) });
});

socket.on("photoPeopleKicked", () => {
  applyAccess({ isKicked: true });
});

previewEl.addEventListener("click", openCamera);

photoInputEl.addEventListener("change", () => {
  selectedFile = photoInputEl.files?.[0] || null;
  renderPreview(selectedFile);
  setStatus("");
});

sendBtn.addEventListener("click", async () => {
  if (kicked || blocked) {
    setStatus("Les envois sont bloqués par l'animateur.", "error");
    return;
  }

  if (!selectedFile) {
    setStatus("Choisis d'abord une photo.", "error");
    return;
  }

  sendBtn.disabled = true;
  setStatus("Envoi en cours…");

  const formData = new FormData();
  formData.append("photo", selectedFile);
  formData.append("uploaderName", uploaderNameEl.value.trim());
  formData.append("caption", captionEl.value.trim());

  try {
    const res = await fetch("/api/photo-people/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de l'envoi.");
    }

    setStatus("Photo envoyée ! Elle apparaît sur l'écran.", "ok");
    selectedFile = null;
    photoInputEl.value = "";
    uploaderNameEl.value = "";
    captionEl.value = "";
    renderPreview(null);
  } catch (error) {
    setStatus(error.message || "Erreur lors de l'envoi.", "error");
    sendBtn.disabled = Boolean(selectedFile) && !kicked && !blocked;
  }
});
