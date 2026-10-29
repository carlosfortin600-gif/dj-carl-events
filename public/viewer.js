const socket = io();

const statusEl = document.getElementById("status");
const questionNumberEl = document.getElementById("questionNumber");
const questionTextEl = document.getElementById("questionText");
const questionAudioBadgeEl = document.getElementById("questionAudioBadge");
const answersEl = document.getElementById("answers");
const leaderboardEl = document.getElementById("leaderboard");
const leaderboardTitleEl = document.getElementById("leaderboardTitle");
const joinFeedEl = document.getElementById("joinFeed");
const joinFeedCountNumberEl = document.getElementById("joinFeedCountNumber");
const joinFeedCountLabelEl = document.getElementById("joinFeedCountLabel");
const podiumOverlayEl = document.getElementById("podiumOverlay");
const podiumContentEl = document.getElementById("podiumContent");
const questionResultOverlayEl = document.getElementById("questionResultOverlay");
const questionResultAnswerEl = document.getElementById("questionResultAnswer");
const questionResultWinnerEl = document.getElementById("questionResultWinner");
const questionPanelEl = document.getElementById("questionPanel");
const viewerFooterEl = document.getElementById("viewerFooter");

const timerCircleEl = document.getElementById("timerCircle");
const timerTextEl = document.getElementById("timerText");
const timerLabelEl = document.getElementById("timerLabel");
const progressBarEl = document.getElementById("progressBar");

const MAX_JOIN_TILES = 24;

let lastScores = {};
let knownPlayerIds = new Set();
let isFirstPlayerSync = true;
let isPodiumVisible = false;
let leaderboardCleared = false;
let quizSessionLive = false;
let leaderboardFrozen = false;
let latestLeaderboardPlayers = [];
let questionResultTimer = null;
const VIEWER_ANSWER_DISPLAY_MS = 3000;

socket.on("connect", () => {
  socket.emit("joinViewer");
});

async function loadViewerQr() {
  const img = document.getElementById("viewerQrImage");
  if (!img) return;

  try {
    const res = await fetch("/api/network");
    const data = await res.json();

    if (res.ok && data.playerQr) {
      img.src = data.playerQr;
    }
  } catch (error) {
    console.warn("QR viewer indisponible:", error);
  }
}

loadViewerQr();

function applyQuestionTextStyle(text) {
  const clean = String(text || "").trim();
  questionTextEl.classList.remove("short", "long");
  questionTextEl.classList.add(clean.length > 70 ? "long" : "short");
  questionTextEl.textContent = clean || "Question";
}

function updateQuestionAudioBadge(hasAudio) {
  if (!questionAudioBadgeEl) return;
  questionAudioBadgeEl.hidden = !hasAudio;
  questionAudioBadgeEl.setAttribute("aria-hidden", hasAudio ? "false" : "true");
}

function stopQuestionAudioPlayback() {
  QuizAudio?.stopQuestionAudio?.();
  updateQuestionAudioBadge(false);
}

function playQuestionAudioClip(filename, options = {}) {
  stopQuestionAudioPlayback();
  const playing = QuizAudio?.playQuestionAudio?.(filename, options);
  updateQuestionAudioBadge(Boolean(playing));
}

socket.on("quizWaiting", () => {
  quizSessionLive = false;
  hideQuestionResult();
  hidePodium();
  isPodiumVisible = false;
  statusEl.textContent = "En attente du démarrage du quiz";
  questionNumberEl.textContent = "";
  applyQuestionTextStyle("Le quiz va commencer bientôt...");
  stopQuestionAudioPlayback();
  answersEl.innerHTML = "";
  clearAnswerHighlight();
});

socket.on("quizRoundWaiting", (data) => {
  quizSessionLive = true;
  hideQuestionResult();
  hidePodium();
  isPodiumVisible = false;
  statusEl.textContent = "En attente du timer";
  questionNumberEl.textContent = data?.questionNumber
    ? `Question ${data.questionNumber}`
    : "";
  applyQuestionTextStyle("La question s'affichera au départ du timer...");
  stopQuestionAudioPlayback();
  answersEl.innerHTML = "";
  clearAnswerHighlight();
});

socket.on("viewerReset", () => {
  quizSessionLive = false;
  leaderboardCleared = true;
  lastScores = {};
  resetViewerDisplay();
});

socket.on("countdown", handleCountdown);

socket.on("showQuestion", (data) => {
  quizSessionLive = true;
  leaderboardFrozen = true;
  hideQuestionResult();
  hidePodium();
  isPodiumVisible = false;
  leaderboardCleared = false;
  TimerSounds.resetTimerTickSound();
  statusEl.textContent = "Question en cours";

  questionNumberEl.textContent = data.questionNumber
    ? `Question ${data.questionNumber}`
    : "";

  applyQuestionTextStyle(data.question);
  playQuestionAudioClip(data.audio, {
    start: data.audioStart,
    duration: data.audioDuration
  });

  answersEl.innerHTML = "";

  if (Array.isArray(data.answers)) {
    const letters = ["A", "B", "C", "D"];
    const colorClasses = ["answer-a", "answer-b", "answer-c", "answer-d"];

    data.answers.forEach((answer, index) => {
      const div = document.createElement("div");
      div.className = `answer ${colorClasses[index] || ""}`;
      div.dataset.index = String(index);
      div.innerHTML = `
        <span class="answer-letter">${letters[index]}</span>
        <span class="answer-text">${escapeHtml(answer)}</span>
      `;
      answersEl.appendChild(div);
    });
  }
});

socket.on("timerUpdate", (data) => {
  renderTimer(data);
});

socket.on("timerTick", () => {
  TimerSounds.handleTimerTick();
});

socket.on("timerFinished", (data) => {
  TimerSounds.handleTimerFinished(data);
  if (!isPodiumVisible) {
    statusEl.textContent = "Temps terminé";
  }
});

socket.on("answerRevealed", (data) => {
  showQuestionResult(data);
});

socket.on("answerHidden", () => {
  hideQuestionResult();
  statusEl.textContent = "Question en cours";
  clearAnswerHighlight();
  unfreezeLeaderboard();
});

socket.on("leaderboardUpdate", (players) => {
  handlePlayersUpdate(players || []);
});

socket.on("playersUpdate", (players) => {
  handlePlayersUpdate(players || []);
});

socket.on("quizEnded", (players) => {
  hideQuestionResult();
  handlePlayersUpdate(players || []);
  renderPodium(players || []);
});

function applyLeaderboardDisplay() {
  if (leaderboardCleared || isPodiumVisible || !quizSessionLive) {
    renderEmptyLeaderboard();
    return;
  }

  renderLeaderboard(latestLeaderboardPlayers);
}

function unfreezeLeaderboard() {
  leaderboardFrozen = false;
  applyLeaderboardDisplay();
}

function handlePlayersUpdate(players) {
  syncJoinFeed(players);
  latestLeaderboardPlayers = players || [];

  if (leaderboardCleared || isPodiumVisible || !quizSessionLive) {
    renderEmptyLeaderboard();
    return;
  }

  if (leaderboardFrozen) {
    return;
  }

  applyLeaderboardDisplay();
}

function syncJoinFeed(players) {
  const currentIds = new Set(players.map((player) => player.id));

  joinFeedEl.querySelectorAll(".join-tile").forEach((tile) => {
    const playerId = tile.dataset.playerId;
    if (playerId && !currentIds.has(playerId)) {
      tile.remove();
      knownPlayerIds.delete(playerId);
    }
  });

  trackNewJoiners(players);
  updateJoinFeedCount(players.length);
}

function trackNewJoiners(players) {
  players.forEach((player) => {
    if (knownPlayerIds.has(player.id)) {
      return;
    }

    knownPlayerIds.add(player.id);
    addJoinTile(player, isFirstPlayerSync);
  });

  isFirstPlayerSync = false;
}

function addJoinTile(player, silent = false) {
  const name = player.name || "Joueur";
  const initial = name.trim().charAt(0).toUpperCase() || "J";

  const tile = document.createElement("div");
  tile.className = "join-tile";
  tile.dataset.playerId = player.id;

  if (!silent) {
    tile.classList.add("join-tile-new");
    setTimeout(() => tile.classList.remove("join-tile-new"), 600);
  }

  tile.innerHTML = `
    <span class="join-avatar">${escapeHtml(initial)}</span>
    <span class="join-name">${escapeHtml(name)}</span>
  `;

  joinFeedEl.prepend(tile);

  while (joinFeedEl.children.length > MAX_JOIN_TILES) {
    joinFeedEl.removeChild(joinFeedEl.lastChild);
  }
}

function updateJoinFeedCount(total) {
  if (!joinFeedCountNumberEl || !joinFeedCountLabelEl) return;

  joinFeedCountNumberEl.textContent = String(total);

  if (total <= 1) {
    joinFeedCountLabelEl.textContent = "joueur connecté";
    return;
  }

  joinFeedCountLabelEl.textContent = "joueurs connectés";
}

function renderPodium(players) {
  isPodiumVisible = true;
  statusEl.textContent = "Quiz terminé";
  questionNumberEl.textContent = "";
  applyQuestionTextStyle("Merci d'avoir joué!");
  answersEl.innerHTML = "";
  clearAnswerHighlight();

  const sortedPlayers = [...players].sort((a, b) => {
    return (b.score || 0) - (a.score || 0);
  });

  podiumContentEl.innerHTML = "";

  if (sortedPlayers.length === 0) {
    podiumContentEl.innerHTML = `<div class="podium-empty">Aucun joueur n'a participé</div>`;
    showPodium();
    return;
  }

  const podium = document.createElement("div");
  podium.className = "podium";

  const slots = [
    { player: sortedPlayers[1], rank: 2, medal: "🥈" },
    { player: sortedPlayers[0], rank: 1, medal: "🥇" },
    { player: sortedPlayers[2], rank: 3, medal: "🥉" }
  ];

  slots.forEach((slot) => {
    if (!slot.player) {
      return;
    }

    const name = slot.player.name || "Joueur";
    const score = slot.player.score || 0;

    const el = document.createElement("div");
    el.className = `podium-slot rank-${slot.rank}`;
    el.innerHTML = `
      <div class="podium-player">
        <div class="podium-medal">${slot.medal}</div>
        <div class="podium-name">${escapeHtml(name)}</div>
        <div class="podium-score">${score} pt</div>
      </div>
      <div class="podium-block">${slot.rank}</div>
    `;

    podium.appendChild(el);
  });

  podiumContentEl.appendChild(podium);
  showPodium();
}

function showPodium() {
  podiumOverlayEl.classList.add("visible");
  podiumOverlayEl.setAttribute("aria-hidden", "false");
}

function hidePodium() {
  podiumOverlayEl.classList.remove("visible");
  podiumOverlayEl.setAttribute("aria-hidden", "true");
  podiumContentEl.innerHTML = "";
}

function clearQuestionResultTimer() {
  if (questionResultTimer) {
    clearTimeout(questionResultTimer);
    questionResultTimer = null;
  }
}

function hideQuestionResultOverlay() {
  if (!questionResultOverlayEl) return;

  questionResultOverlayEl.classList.remove("visible");
  questionResultOverlayEl.setAttribute("aria-hidden", "true");
  if (questionResultAnswerEl) questionResultAnswerEl.textContent = "";
  if (questionResultWinnerEl) questionResultWinnerEl.innerHTML = "";
}

function showQuestionResult(data) {
  clearQuestionResultTimer();

  if (!questionResultOverlayEl || !questionResultAnswerEl || !questionResultWinnerEl) {
    highlightCorrectAnswer(correctIndexesFromReveal(data));
    statusEl.textContent = "Question terminée";
    return;
  }

  const label = String(data.correctLabel || "").trim();
  const text = String(data.correctText || "").trim();
  questionResultAnswerEl.textContent = label ? `${label}. ${text}` : text;
  highlightCorrectAnswer(correctIndexesFromReveal(data));
  statusEl.textContent = "Question terminée";

  if (data.winnerName) {
    const pointsLine = Number(data.winnerPoints) > 0
      ? `<div class="question-result-winner-points">+${Number(data.winnerPoints)} pts</div>`
      : "";

    questionResultWinnerEl.innerHTML = `
      <div class="question-result-winner-label">Plus rapide</div>
      <div class="question-result-winner-name">${escapeHtml(data.winnerName)}</div>
      ${pointsLine}
    `;
  } else {
    questionResultWinnerEl.innerHTML =
      `<div class="question-result-no-winner">Personne n'a trouvé la bonne réponse</div>`;
  }

  questionResultOverlayEl.classList.add("visible");
  questionResultOverlayEl.setAttribute("aria-hidden", "false");

  questionResultTimer = setTimeout(() => {
    hideQuestionResultOverlay();
    statusEl.textContent = "Question terminée";
    unfreezeLeaderboard();
    questionResultTimer = null;
  }, VIEWER_ANSWER_DISPLAY_MS);
}

function hideQuestionResult() {
  clearQuestionResultTimer();
  hideQuestionResultOverlay();
  clearAnswerHighlight();
}

function renderEmptyLeaderboard() {
  leaderboardEl.innerHTML = '<div class="empty">0 point — en attente</div>';
}

function resetViewerDisplay() {
  quizSessionLive = false;
  leaderboardFrozen = false;
  latestLeaderboardPlayers = [];
  TimerSounds.resetTimerTickSound();
  stopQuestionAudioPlayback();
  hideQuestionResult();
  hidePodium();
  isPodiumVisible = false;

  statusEl.textContent = "En attente du démarrage du quiz";
  questionNumberEl.textContent = "";
  applyQuestionTextStyle("Le quiz va commencer bientôt...");
  answersEl.innerHTML = "";
  clearAnswerHighlight();
  renderEmptyLeaderboard();

  timerTextEl.textContent = "30";
  progressBarEl.style.width = "100%";
  timerCircleEl.style.background = "conic-gradient(#00d4ff 100%, #333 0%)";
  timerCircleEl.classList.remove("timer-urgent");
  progressBarEl.classList.remove("timer-urgent");
  timerLabelEl.textContent = "Chrono en attente";
  timerLabelEl.classList.remove("timer-finished", "timer-urgent");
}

function renderTimer(data) {
  const duration = Number(data?.duration) || 30;
  const remaining = Math.max(0, Number(data?.remaining) || 0);
  const running = Boolean(data?.running);
  const locked = Boolean(data?.locked);
  const isUrgent = running && remaining > 0 && remaining <= 5 && !locked;
  const color = isUrgent ? "#ff4d4d" : "#00d4ff";

  const percent = duration > 0 ? (remaining / duration) * 100 : 0;

  timerTextEl.textContent = remaining;
  progressBarEl.style.width = `${percent}%`;
  timerCircleEl.style.background =
    `conic-gradient(${color} ${percent}%, #333 ${percent}%)`;

  timerCircleEl.classList.toggle("timer-urgent", isUrgent);
  progressBarEl.classList.toggle("timer-urgent", isUrgent);
  timerLabelEl.classList.remove("timer-finished", "timer-urgent");

  if (locked || remaining <= 0) {
    timerLabelEl.textContent = "Temps terminé";
    timerLabelEl.classList.add("timer-finished");
  } else if (isUrgent) {
    timerLabelEl.textContent = "Dépêchez-vous !";
    timerLabelEl.classList.add("timer-urgent");
  } else if (running) {
    timerLabelEl.textContent = "Répondez maintenant!";
  } else if (remaining < duration) {
    timerLabelEl.textContent = "Chrono en pause";
  } else {
    timerLabelEl.textContent = "Chrono prêt";
  }
}

function correctIndexesFromReveal(data) {
  const list = Array.isArray(data?.correctIndexes) ? data.correctIndexes.map(Number) : [];
  const clean = list.filter((index) => Number.isInteger(index) && index >= 0 && index <= 3);
  if (clean.length) return clean;
  const one = Number(data?.correctIndex);
  return Number.isInteger(one) ? [one] : [];
}

function highlightCorrectAnswer(correctIndexes) {
  const accepted = Array.isArray(correctIndexes) ? correctIndexes : [Number(correctIndexes)];
  answersEl.querySelectorAll(".answer").forEach((el) => {
    const index = Number(el.dataset.index);
    el.classList.remove("answer-correct", "answer-dim");

    if (accepted.includes(index)) {
      el.classList.add("answer-correct");
    } else {
      el.classList.add("answer-dim");
    }
  });
}

function clearAnswerHighlight() {
  answersEl.querySelectorAll(".answer").forEach((el) => {
    el.classList.remove("answer-correct", "answer-dim");
  });
}

function renderLeaderboard(players) {
  leaderboardEl.innerHTML = "";

  const sortedPlayers = [...players].sort((a, b) => {
    return (b.score || 0) - (a.score || 0);
  });

  if (sortedPlayers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Aucun joueur connecté";
    leaderboardEl.appendChild(empty);
    return;
  }

  sortedPlayers.forEach((player, index) => {
    const row = document.createElement("div");
    const rankClass = index < 3 ? ` rank-${index + 1}` : "";
    row.className = `player-row${rankClass}`;

    const previousScore = lastScores[player.id];
    const currentScore = player.score || 0;

    if (previousScore !== undefined && previousScore !== currentScore) {
      row.classList.add("updated");

      setTimeout(() => {
        row.classList.remove("updated");
      }, 800);
    }

    row.innerHTML = `
      <div class="rank">#${index + 1}</div>
      <div class="name">${escapeHtml(player.name || "Joueur")}</div>
      <div class="score">${currentScore}</div>
    `;

    leaderboardEl.appendChild(row);
    lastScores[player.id] = currentScore;
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handleCountdown(data) {
  TimerSounds.handleCountdownSound(data);

  const overlay = document.getElementById("countdownOverlay");
  const num = document.getElementById("countdownNumber");
  const value = Number(data?.value);

  if (value === -1) {
    overlay.classList.add("hidden");
    num.classList.remove("go");
    return;
  }

  overlay.classList.remove("hidden");

  if (value === 0) {
    num.textContent = "GO!";
    num.classList.add("go");
    return;
  }

  num.classList.remove("go");
  num.textContent = String(value);
}

const wantAutoFullscreen = new URLSearchParams(window.location.search).get("fullscreen") === "1";
const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";

if (isEmbed) {
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  if (fullscreenBtn) {
    fullscreenBtn.style.display = "none";
  }

  const footer = document.querySelector(".footer");
  if (footer) {
    footer.style.display = "none";
  }
}

if (wantAutoFullscreen && !isEmbed) {
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (!isFullscreen()) {
        toggleFullscreen();
      }
    }, 200);
  });
}

if (wantAutoFullscreen && !isEmbed) {
  document.addEventListener("click", () => {
    TimerSounds.unlockAudio();
    QuizAudio?.unlockAudio?.();
    if (!isFullscreen()) {
      toggleFullscreen();
    }
  }, { once: true });
  document.addEventListener("touchstart", () => {
    TimerSounds.unlockAudio();
    QuizAudio?.unlockAudio?.();
    if (!isFullscreen()) {
      toggleFullscreen();
    }
  }, { once: true });
} else {
  document.addEventListener("click", () => {
    TimerSounds.unlockAudio();
    QuizAudio?.unlockAudio?.();
  }, { once: true });
  document.addEventListener("touchstart", () => {
    TimerSounds.unlockAudio();
    QuizAudio?.unlockAudio?.();
  }, { once: true });
}

const fullscreenBtn = document.getElementById("fullscreenBtn");

function isFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement
  );
}

function setFullscreenButtonLabel() {
  if (!fullscreenBtn) return;
  fullscreenBtn.textContent = isFullscreen() ? "Quitter" : "Plein écran";
}

async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return;
    }

    const target = document.documentElement;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } catch (error) {
    console.warn("Plein écran non disponible:", error);
  }
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFullscreen();
  });
}

document.addEventListener("fullscreenchange", setFullscreenButtonLabel);
document.addEventListener("webkitfullscreenchange", setFullscreenButtonLabel);
setFullscreenButtonLabel();
