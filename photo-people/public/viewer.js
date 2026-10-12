const DISPLAY_MS = 6000;
const FADE_MS = 1000;

const socket = io();
const emptyStateEl = document.getElementById("emptyState");
const stageEl = document.getElementById("stage");
const metaEl = document.getElementById("meta");
const heroNameEl = document.getElementById("heroName");
const heroCaptionEl = document.getElementById("heroCaption");
const slides = [
  { el: document.getElementById("slideA"), img: document.getElementById("imageA") },
  { el: document.getElementById("slideB"), img: document.getElementById("imageB") }
];

const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
let photos = [];
let currentIndex = 0;
let displayTimer = null;
let activeSlide = -1;
let hasShownPhoto = false;
let looping = false;

if (isEmbed) {
  document.body.classList.add("photo-people-embed");
}

function clearDisplayTimer() {
  if (displayTimer) {
    clearTimeout(displayTimer);
    displayTimer = null;
  }
}

function resetSlides() {
  slides.forEach((slide) => {
    slide.el.classList.remove("is-active", "is-beneath");
  });
  activeSlide = -1;
  hasShownPhoto = false;
}

function updateMeta(photo) {
  heroNameEl.textContent = photo.uploaderName || "Nouvelle photo";
  heroCaptionEl.textContent = photo.caption || "";
  heroCaptionEl.hidden = !photo.caption;
}

function fadeMetaIn() {
  metaEl.classList.remove("is-fading");
}

function fadeMetaOut() {
  metaEl.classList.add("is-fading");
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

function showHoldImage() {
  clearDisplayTimer();
  emptyStateEl.hidden = false;
  stageEl.hidden = true;
  resetSlides();
}

async function crossfadeToPhoto(photo) {
  if (!photo) return;

  emptyStateEl.hidden = true;
  stageEl.hidden = false;

  const nextSlideIndex = activeSlide === 0 ? 1 : 0;
  const currentSlide = activeSlide >= 0 ? slides[activeSlide] : null;
  const nextSlide = slides[nextSlideIndex];

  try {
    await preloadImage(photo.url);
  } catch (error) {
    console.warn("Photo non chargée:", error);
  }

  nextSlide.img.src = photo.url;

  if (!hasShownPhoto) {
    resetSlides();
    nextSlide.el.classList.add("is-active");
    activeSlide = nextSlideIndex;
    hasShownPhoto = true;
    updateMeta(photo);
    fadeMetaIn();
    return;
  }

  fadeMetaOut();
  window.setTimeout(() => {
    updateMeta(photo);
    fadeMetaIn();
  }, FADE_MS * 0.45);

  if (currentSlide) {
    currentSlide.el.classList.remove("is-active");
    currentSlide.el.classList.add("is-beneath");
  }

  nextSlide.el.classList.remove("is-beneath");
  nextSlide.el.classList.add("is-active");
  activeSlide = nextSlideIndex;

  window.setTimeout(() => {
    slides.forEach((slide, index) => {
      if (index !== activeSlide) {
        slide.el.classList.remove("is-active", "is-beneath");
      }
    });
  }, FADE_MS + 80);
}

function queueNextDisplay() {
  clearDisplayTimer();
  displayTimer = setTimeout(advanceSlideshow, DISPLAY_MS);
}

function startLoopFrom(index) {
  if (!photos.length) {
    showHoldImage();
    return;
  }

  currentIndex = ((Number(index) || 0) + photos.length) % photos.length;
  crossfadeToPhoto(photos[currentIndex]);
  queueNextDisplay();
}

function advanceSlideshow() {
  if (!photos.length || !looping) {
    showHoldImage();
    return;
  }

  currentIndex = (currentIndex + 1) % photos.length;
  crossfadeToPhoto(photos[currentIndex]);
  queueNextDisplay();
}

function presentPhoto(photo) {
  clearDisplayTimer();

  currentIndex = photos.findIndex((item) => item.id === photo.id);
  if (currentIndex < 0) currentIndex = 0;

  crossfadeToPhoto(photo);
  queueNextDisplay();
}

function applyState(state) {
  photos = Array.isArray(state?.photos) ? state.photos : [];
  const nextLooping = Boolean(state?.looping);
  const loopChanged = nextLooping !== looping;
  looping = nextLooping;

  if (!photos.length) {
    showHoldImage();
    return;
  }

  if (looping && (loopChanged || !hasShownPhoto)) {
    startLoopFrom(currentIndex);
    return;
  }

  if (!looping && loopChanged) {
    showHoldImage();
  }
}

socket.on("connect", () => {
  socket.emit("joinPhotoPeopleViewer", (state) => {
    applyState(state);
  });
});

socket.on("photoPeopleState", applyState);
socket.on("photoPeopleAdd", (photo) => {
  photos = [photo, ...photos.filter((item) => item.id !== photo.id)];
  presentPhoto(photo);
});
socket.on("photoPeopleClear", () => {
  applyState({ photos: [], looping });
});

if (isEmbed) {
  document.documentElement.requestFullscreen?.().catch(() => {});
}
