const socket = io();
const uploadQrEl = document.getElementById("uploadQr");
const uploadUrlEl = document.getElementById("uploadUrl");
const qrStatusEl = document.getElementById("qrStatus");
const reloadQrBtn = document.getElementById("reloadQrBtn");
const photoCountEl = document.getElementById("photoCount");
const connectionCountEl = document.getElementById("connectionCount");
const connectionLabelEl = document.getElementById("connectionLabel");
const thumbsEl = document.getElementById("thumbs");
const photosDirInput = document.getElementById("photosDirInput");
const pickFolderBtn = document.getElementById("pickFolderBtn");
const applyFolderBtn = document.getElementById("applyFolderBtn");
const folderStatusEl = document.getElementById("folderStatus");
const openViewerBtn = document.getElementById("openViewerBtn");
const openViewerEmbedBtn = document.getElementById("openViewerEmbedBtn");
const clearBtn = document.getElementById("clearBtn");
const viewerOverlay = document.getElementById("viewerOverlay");
const viewerFrame = document.getElementById("viewerFrame");
const closeViewerBtn = document.getElementById("closeViewerBtn");
const resetConnectionsBtn = document.getElementById("resetConnectionsBtn");
const blockBtn = document.getElementById("blockBtn");
const blockStatusEl = document.getElementById("blockStatus");
const loopBtn = document.getElementById("loopBtn");
const displaySecondsInput = document.getElementById("displaySecondsInput");

let photos = [];
let uploadsBlocked = false;
let looping = false;
let displayMs = 6000;

function formatCount(count) {
  return count === 1 ? "1 photo reçue" : `${count} photos reçues`;
}

function renderConnectionCount(count) {
  const total = Number(count) || 0;
  connectionCountEl.textContent = String(total);
  connectionLabelEl.textContent = total <= 1 ? "connexion" : "connexions";
}

function renderBlocked(blocked) {
  uploadsBlocked = Boolean(blocked);
  blockStatusEl.hidden = !uploadsBlocked;
  blockBtn.textContent = uploadsBlocked ? "Débloquer" : "Bloquer";
  blockBtn.classList.toggle("is-blocked", uploadsBlocked);
}

function setFolderStatus(message, type = "") {
  folderStatusEl.textContent = message;
  folderStatusEl.className = `photo-people-url${type ? ` photo-people-status-${type}` : ""}`;
}

function setQrStatus(message, type = "") {
  qrStatusEl.textContent = message;
  qrStatusEl.className = `photo-people-url${type ? ` photo-people-status-${type}` : ""}`;
}

function renderLooping(nextLooping) {
  looping = Boolean(nextLooping);
  loopBtn.textContent = looping ? "Arrêter la boucle" : "Jouer les photos en boucle";
  loopBtn.classList.toggle("primary", looping);
  loopBtn.classList.toggle("secondary", !looping);
}

function renderDisplayMs(nextDisplayMs) {
  const ms = Number(nextDisplayMs) || 6000;
  displayMs = ms;
  if (document.activeElement === displaySecondsInput) return;
  displaySecondsInput.value = String(Math.round(ms / 1000));
}

function renderPhotos(state) {
  photos = Array.isArray(state?.photos) ? state.photos : [];
  photoCountEl.textContent = formatCount(photos.length);
  thumbsEl.innerHTML = photos.slice(0, 18).map((photo) => (
    `<img src="${photo.url}" alt="">`
  )).join("");
  if (typeof state?.looping === "boolean") {
    renderLooping(state.looping);
  }
  if (state?.displayMs) {
    renderDisplayMs(state.displayMs);
  }
}

async function loadNetworkInfo() {
  const previousUrl = uploadUrlEl.textContent.trim();
  if (!uploadQrEl.getAttribute("src")) {
    uploadQrEl.classList.add("is-loading");
    setQrStatus("Chargement du QR…");
  }

  try {
    const networkRes = await fetch("/api/network");
    const data = await networkRes.json();

    if (!networkRes.ok || !data.joinQr) {
      throw new Error(data.error || "QR indisponible");
    }

    if (data.joinUrl !== previousUrl || !uploadQrEl.getAttribute("src")) {
      uploadQrEl.src = data.joinQr;
    }
    uploadQrEl.classList.remove("is-loading");
    uploadUrlEl.textContent = data.joinUrl;
    setQrStatus("QR prêt", "ok");
  } catch (error) {
    uploadQrEl.classList.remove("is-loading");
    uploadUrlEl.textContent = "";
    setQrStatus(error.message || "Impossible de charger le QR.", "error");
  }
}

async function loadFolderInfo() {
  try {
    const res = await fetch("/api/photo-people/info");
    const info = await res.json();

    if (!res.ok) {
      throw new Error(info.error || "Impossible de lire le dossier.");
    }

    photosDirInput.value = info.photosDir || "";
    pickFolderBtn.hidden = !info.canPickFolder;
    setFolderStatus(`Dossier actif : ${info.photosDir}`, "ok");
  } catch (error) {
    setFolderStatus(error.message || "Impossible de lire le dossier.", "error");
  }
}

async function applyFolder() {
  const photosDir = photosDirInput.value.trim();
  if (!photosDir) {
    setFolderStatus("Entre un chemin de dossier.", "error");
    return;
  }

  setFolderStatus("Application du dossier…");

  try {
    const res = await fetch("/api/photo-people/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photosDir })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Impossible d'appliquer ce dossier.");
    }

    photosDirInput.value = data.photosDir;
    setFolderStatus(`Dossier actif : ${data.photosDir}`, "ok");
    renderPhotos({ photos: [] });
  } catch (error) {
    setFolderStatus(error.message || "Impossible d'appliquer ce dossier.", "error");
  }
}

async function pickFolder() {
  setFolderStatus("Ouvre le sélecteur de dossier…");

  try {
    const res = await fetch("/api/photo-people/pick-folder", { method: "POST" });
    const data = await res.json();

    if (data.cancelled) {
      setFolderStatus("Sélection annulée.");
      return;
    }

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Impossible de choisir ce dossier.");
    }

    photosDirInput.value = data.photosDir;
    setFolderStatus(`Dossier actif : ${data.photosDir}`, "ok");
    renderPhotos({ photos: [] });
  } catch (error) {
    setFolderStatus(error.message || "Impossible de choisir ce dossier.", "error");
  }
}

function openViewerOverlay() {
  viewerFrame.src = "/photo-people/viewer?embed=1";
  viewerOverlay.hidden = false;
  viewerOverlay.setAttribute("aria-hidden", "false");
  viewerOverlay.requestFullscreen?.().catch(() => {});
}

function closeViewerOverlay() {
  viewerOverlay.hidden = true;
  viewerOverlay.setAttribute("aria-hidden", "true");
  viewerFrame.src = "";
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

reloadQrBtn.addEventListener("click", loadNetworkInfo);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadNetworkInfo();
  }
});
window.setInterval(loadNetworkInfo, 20000);
applyFolderBtn.addEventListener("click", applyFolder);
pickFolderBtn.addEventListener("click", pickFolder);
openViewerBtn.addEventListener("click", () => {
  window.open("/photo-people/viewer", "photoPeopleViewer", "noopener,noreferrer");
});
openViewerEmbedBtn.addEventListener("click", openViewerOverlay);
closeViewerBtn.addEventListener("click", closeViewerOverlay);

function saveDisplaySeconds() {
  const seconds = Number.parseInt(displaySecondsInput.value, 10);
  socket.emit("photoPeopleSetDisplayMs", seconds, (response) => {
    if (!response?.ok) {
      alert(response?.error || "Impossible d'enregistrer le temps d'affichage.");
      return;
    }

    renderDisplayMs(response.state?.displayMs);
  });
}

displaySecondsInput.addEventListener("change", saveDisplaySeconds);
displaySecondsInput.addEventListener("blur", saveDisplaySeconds);

loopBtn.addEventListener("click", () => {
  if (!looping && !photos.length) {
    alert("Aucune photo à jouer pour l'instant.");
    return;
  }

  socket.emit("photoPeopleSetLoop", !looping, (response) => {
    if (!response?.ok) {
      alert(response?.error || "Impossible de changer la boucle.");
      return;
    }

    renderLooping(response.state?.looping);
  });
});

resetConnectionsBtn.addEventListener("click", () => {
  const ok = window.confirm(
    "Réinitialiser les connexions ?\n\nTous les téléphones seront déconnectés. Le compteur repasse à 0."
  );
  if (!ok) return;

  socket.emit("photoPeopleResetConnections", (response) => {
    if (!response?.ok) {
      alert(response?.error || "Impossible de réinitialiser les connexions.");
      return;
    }

    renderConnectionCount(response.count);
    renderBlocked(response.blocked);
  });
});

blockBtn.addEventListener("click", () => {
  const nextBlocked = !uploadsBlocked;
  const ok = window.confirm(
    nextBlocked
      ? "Bloquer les envois ?\n\nPersonne ne pourra envoyer de photo ni se connecter."
      : "Débloquer Photo en direct ?\n\nLes invités pourront de nouveau envoyer des photos."
  );
  if (!ok) return;

  socket.emit("photoPeopleSetBlocked", nextBlocked, (response) => {
    if (!response?.ok) {
      alert(response?.error || "Impossible de changer le blocage.");
      return;
    }

    renderConnectionCount(response.count);
    renderBlocked(response.blocked);
  });
});

clearBtn.addEventListener("click", () => {
  if (!photos.length) return;

  const ok = window.confirm(
    "Vider l'écran ?\n\nLes photos disparaîtront de l'affichage, mais resteront enregistrées dans le dossier."
  );
  if (!ok) return;

  socket.emit("photoPeopleClear", (response) => {
    if (!response?.ok) {
      alert(response?.error || "Impossible de vider l'écran.");
    }
  });
});

socket.on("connect", () => {
  socket.emit("joinPhotoPeopleHost", (state) => {
    renderPhotos(state);
    renderLooping(state?.looping);
    renderDisplayMs(state?.displayMs);
    renderConnectionCount(state?.connectionCount);
    renderBlocked(state?.blocked);
    if (state?.photosDir) {
      photosDirInput.value = state.photosDir;
    }
  });
});

socket.on("photoPeopleConnections", (data) => {
  renderConnectionCount(data?.count);
  if (typeof data?.blocked === "boolean") {
    renderBlocked(data.blocked);
  }
});

socket.on("photoPeopleState", (state) => {
  renderPhotos(state);
  if (state?.photosDir) {
    photosDirInput.value = state.photosDir;
    setFolderStatus(`Dossier actif : ${state.photosDir}`, "ok");
  }
});

socket.on("photoPeopleAdd", (photo) => {
  photos = [photo, ...photos.filter((item) => item.id !== photo.id)];
  renderPhotos({ photos });
});

socket.on("photoPeopleClear", () => {
  renderPhotos({ photos: [] });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !viewerOverlay.hidden) {
    closeViewerOverlay();
  }
});

loadNetworkInfo();
loadFolderInfo();
