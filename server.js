const express = require("express");
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const QRCode = require("qrcode");
const {
  buildQuizTemplateBuffer,
  parseQuizWorkbook
} = require("./lib/quiz-import");
const {
  buildMusicQuizImport,
  listMusicQuizCategories,
  loadMusicQuizBank
} = require("./lib/music-quiz-import");
const {
  buildWheelTemplateBuffer,
  getWheelTemplateContentType,
  getWheelTemplateFilename,
  parseWheelWorkbook
} = require("./lib/wheel-import");
const {
  getPublicWheelState,
  setWheelSegments,
  buildSpinPayload,
  publishWheelSpin,
  markWheelSpinning,
  completeWheelSpin,
  clearWheelWinners,
  closeWheelWinnerSeries,
  getWheelWinners,
  restoreWheelPlayer,
  restoreAllWheelPlayers,
  setWheelPrize,
  setWheelMusicEnabled,
  setWheelPrizeQueue
} = require("./lib/wheel-state");
const {
  getHostFeudState,
  getPublicFeudState,
  feudStart,
  feudStartNextPack,
  feudFaceoffTurn,
  feudFaceoffPick,
  feudFaceoffMiss,
  feudGiveControl,
  feudSwapControl,
  feudReveal,
  feudHideAnswer,
  feudStrike,
  feudUndoStrike,
  feudStealMiss,
  feudBank,
  feudNext,
  feudGoTo,
  feudReplayRound,
  feudSetTeamName,
  feudAddScore,
  feudAddQuestion,
  feudSetQuestionLimit,
  feudSilence,
  feudResetScores,
  feudResetGame
} = require("./lib/feud-state");
const {
  getHostJeopardyState,
  getPublicJeopardyState,
  jeopardySetTeamCount,
  jeopardySetTeamName,
  jeopardyAddScore,
  jeopardySetControl,
  jeopardyStart,
  jeopardyPick,
  jeopardySetWager,
  jeopardyCorrect,
  jeopardyWrong,
  jeopardyBuzz,
  jeopardyReveal,
  jeopardyCloseClue,
  jeopardyCancel,
  jeopardyEndRound,
  jeopardyShowRanking,
  jeopardyClearScores,
  jeopardyNextRound,
  jeopardyLockFinaleWagers,
  jeopardyShowFinaleClue,
  jeopardyFinaleJudge,
  jeopardyShowWinner,
  jeopardyShowQr,
  jeopardyToggleTheme,
  jeopardyReset
} = require("./lib/jeopardy-state");
const { createChronoState } = require("./lib/chrono-state");
const { startArtNetReceiver } = require("./lib/artnet-receiver");
const { startGlobalRemote, updateRemoteKeys } = require("./lib/global-remote");
const {
  getProfiles,
  loadPatch,
  savePatch
} = require("./lib/soundswitch-patch");
const { importSoundSwitchVenue } = require("./lib/soundswitch-venue-import");
const {
  registerPhotoPeopleRoutes,
  registerPhotoPeopleSockets,
  getStartupInfo: getPhotoPeopleStartupInfo
} = require("./photo-people");
const {
  registerQuizLaTaChansonRoutes,
  getStartupInfo: getQuizLaTaChansonStartupInfo
} = require("./quiz-la-ta-chanson");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);

const PORT = 3000;
const chrono = createChronoState();
const QR_SCAN_OPTIONS = {
  errorCorrectionLevel: "L",
  margin: 2,
  width: 1200,
  color: {
    dark: "#000000",
    light: "#FFFFFF"
  }
};
const db = new Database("quiz.db");

app.use(express.json());
app.use("/audio", express.static(path.join(__dirname, "Audio")));

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

db.prepare(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS quiz_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const quizColumns = db.prepare("PRAGMA table_info(quizzes)").all();
if (!quizColumns.some((col) => col.name === "group_id")) {
  db.prepare("ALTER TABLE quizzes ADD COLUMN group_id INTEGER").run();
}
if (!quizColumns.some((col) => col.name === "sort_order")) {
  db.prepare("ALTER TABLE quizzes ADD COLUMN sort_order INTEGER DEFAULT 0").run();
}

function resetActiveQuizState() {
  stopTimer();
  currentQuiz = null;
  currentQuizId = null;
  currentQuestionIndex = -1;
  quizStarted = false;
  timerDuration = 30;
  timerRemaining = 30;
  answersLocked = false;
  preferredTimerDuration = null;

  players = players.map((player) => ({
    ...player,
    answered: false
  }));

  io.emit("quizWaiting");
  emitTimerUpdate();
  sendLeaderboard();
}

function clearActiveQuizIfInGroup(groupId) {
  if (!currentQuizId) return;

  const quiz = db.prepare(`
    SELECT group_id
    FROM quizzes
    WHERE id = ?
  `).get(currentQuizId);

  if (quiz?.group_id === groupId) {
    resetActiveQuizState();
  }
}

let players = [];

function resetAllPlayerScores() {
  players = players.map((player) => ({
    ...player,
    score: 0,
    answered: false
  }));
}
let currentQuiz = null;
let currentQuizId = null;
let currentQuestionIndex = -1;
let quizStarted = false;

let timerDuration = 30;
let timerRemaining = 30;
let timerRunning = false;
let timerTimeout = null;
let timerNextTickAt = 0;
let answersLocked = false;
let skipNextCountdown = false;
let correctAnswerRank = 0;
let questionWinner = null;
let answerRevealed = false;
let preferredTimerDuration = null;
let accumulateScoresAcrossGames = true;

function applyScorePolicyOnNewGame() {
  if (!accumulateScoresAcrossGames) {
    resetAllPlayerScores();
  }
}

function getSpeedPointsForRank(rank) {
  if (rank >= 10) return 0;
  return 10 - rank;
}

function resetCorrectAnswerRank() {
  correctAnswerRank = 0;
  questionWinner = null;
  answerRevealed = false;
}

function questionCorrectIndexes(question) {
  const source = Array.isArray(question?.correctAnswers) && question.correctAnswers.length
    ? question.correctAnswers
    : [question?.correctAnswer];
  const unique = [];

  source.forEach((value) => {
    const index = Number(value);
    if (Number.isInteger(index) && index >= 0 && index <= 3 && !unique.includes(index)) {
      unique.push(index);
    }
  });

  return unique;
}

function revealCurrentAnswer() {
  if (!currentQuiz || currentQuestionIndex < 0 || answerRevealed) return;

  const question = currentQuiz.questions[currentQuestionIndex];
  const correctIndexes = questionCorrectIndexes(question);
  const labels = ["A", "B", "C", "D"];

  answerRevealed = true;
  sendLeaderboard();

  io.emit("answerRevealed", {
    correctIndex: correctIndexes[0],
    correctIndexes,
    correctLabel: correctIndexes.map((index) => labels[index]).join(" et "),
    correctText: correctIndexes.map((index) => question.answers[index]).join(" · "),
    winnerName: questionWinner?.name || null,
    winnerPoints: questionWinner?.points ?? null
  });
}

function finishCurrentQuestion() {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0 || answerRevealed) return;

  cancelCountdownWithHide();
  stopTimer();
  answersLocked = true;
  timerRemaining = Math.max(0, timerRemaining);
  emitTimerUpdate();

  io.emit("timerFinished", {
    duration: timerDuration,
    remaining: timerRemaining,
    locked: answersLocked
  });

  revealCurrentAnswer();
}

function getGroupById(groupId) {
  return db.prepare(`
    SELECT id, name
    FROM quiz_groups
    WHERE id = ?
  `).get(groupId);
}

function createQuizInGroup(groupId, title, questions) {
  const cleanTitle = String(title || "Nouveau quiz").trim() || "Nouveau quiz";

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Aucune question reçue.");
  }

  const group = getGroupById(groupId);
  if (!group) {
    throw new Error("Dossier introuvable");
  }

  const quizData = {
    title: cleanTitle,
    questions
  };

  const nextOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM quizzes
    WHERE group_id = ?
  `).get(groupId).value;

  const result = db.prepare(`
    INSERT INTO quizzes (title, data, group_id, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(
    cleanTitle,
    JSON.stringify(quizData),
    groupId,
    nextOrder
  );

  return {
    id: result.lastInsertRowid,
    title: cleanTitle,
    questionCount: questions.length
  };
}

function normalizeQuizQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Aucune question reçue.");
  }

  return questions.map((raw, index) => {
    const question = String(raw?.question || "").trim();
    const answers = Array.isArray(raw?.answers)
      ? raw.answers.slice(0, 4).map((answer) => String(answer ?? "").trim())
      : [];

    while (answers.length < 4) answers.push("");

    const correctAnswers = questionCorrectIndexes(raw);
    const timer = Number(raw?.timer ?? raw?.duration ?? raw?.timeLimit) || 30;

    if (!question || answers.some((answer) => !answer) || correctAnswers.length < 1 || correctAnswers.length > 2) {
      throw new Error(`Question ${index + 1} incomplète.`);
    }

    const next = {
      ...(raw && typeof raw === "object" ? raw : {}),
      question,
      answers,
      correctAnswer: correctAnswers[0],
      correctAnswers,
      timer,
      temps: timer
    };

    const audio = String(raw?.audio || "").trim();
    if (audio) next.audio = audio;
    else delete next.audio;

    return next;
  });
}

function updateQuizById(quizId, title, questions) {
  const cleanTitle = String(title || "Nouveau quiz").trim() || "Nouveau quiz";
  const normalized = normalizeQuizQuestions(questions);

  const existing = db.prepare(`
    SELECT id
    FROM quizzes
    WHERE id = ?
  `).get(quizId);

  if (!existing) {
    throw new Error("Quiz introuvable");
  }

  const quizData = {
    title: cleanTitle,
    questions: normalized
  };

  db.prepare(`
    UPDATE quizzes
    SET title = ?, data = ?
    WHERE id = ?
  `).run(cleanTitle, JSON.stringify(quizData), quizId);

  const appliedLive = Number(currentQuizId) === Number(quizId) && !quizStarted;

  if (appliedLive) {
    currentQuiz = quizData;
    io.emit("quizLoaded", currentQuiz);
  }

  return {
    id: quizId,
    title: cleanTitle,
    questionCount: normalized.length,
    appliedLive
  };
}

const PRIVATE_IP_PATTERN = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

const INTERFACE_PRIORITY = [
  /^en0$/i,
  /^Wi-?Fi$/i,
  /^WLAN/i,
  /^en\d+$/i,
  /^Ethernet$/i,
  /^Ethernet\s+\d+$/i,
  /^wlan/i,
  /^wi-?fi/i,
  /ethernet/i
];

const VIRTUAL_INTERFACE_PATTERN =
  /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Npcap|Loopback|Bluetooth|TAP-|TUN|Teredo|isatap|ZeroTier|Hamachi/i;

function isIpv4Address(net) {
  return net.family === "IPv4" || net.family === 4;
}

function getNetworkCandidates() {
  let interfaces;

  try {
    interfaces = os.networkInterfaces();
  } catch {
    return [];
  }

  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const net of addrs) {
      if (!isIpv4Address(net) || net.internal) continue;

      const address = net.address;
      if (address.startsWith("169.254.")) continue;

      candidates.push({ name, address });
    }
  }

  return candidates;
}

function scoreNetworkCandidate(name, address) {
  let score = 0;

  if (PRIVATE_IP_PATTERN.test(address)) {
    score += 100;
  }

  if (/^192\.168\./.test(address)) {
    score += 30;
  }

  if (/^172\.20\.10\./.test(address)) {
    score += 45;
  }

  if (VIRTUAL_INTERFACE_PATTERN.test(name)) {
    score -= 400;
  }

  for (let index = 0; index < INTERFACE_PRIORITY.length; index += 1) {
    if (INTERFACE_PRIORITY[index].test(name)) {
      score += 60 - index;
      break;
    }
  }

  return score;
}

function getLocalIp() {
  const override = String(process.env.DJ_CARL_HOST_IP || "").trim();
  if (override) {
    return override;
  }

  const candidates = getNetworkCandidates();
  if (!candidates.length) {
    return "localhost";
  }

  candidates.sort((a, b) => {
    return scoreNetworkCandidate(b.name, b.address) - scoreNetworkCandidate(a.name, a.address);
  });

  return candidates[0].address;
}

function getAllLocalIps() {
  return getNetworkCandidates().map((entry) => entry.address);
}

function getBaseUrl() {
  return `http://${getLocalIp()}:${PORT}`;
}

function getPlayerUrl() {
  return `${getBaseUrl()}/player`;
}

function getJoinUrl() {
  return `${getBaseUrl()}/join`;
}

function getViewerUrl() {
  return `${getBaseUrl()}/viewer`;
}

function getQuestionTimerDuration(question) {
  const value =
    question?.timer ||
    question?.duration ||
    question?.timeLimit ||
    question?.temps ||
    timerDuration ||
    30;

  const duration = Number(value);

  if (!Number.isFinite(duration) || duration <= 0) {
    return 30;
  }

  return Math.round(duration);
}

function stopTimer() {
  if (timerTimeout) {
    clearTimeout(timerTimeout);
    timerTimeout = null;
  }

  timerRunning = false;
  timerNextTickAt = 0;
}

function scheduleTimerTick() {
  if (!timerRunning) return;

  const delay = Math.max(0, timerNextTickAt - Date.now());

  timerTimeout = setTimeout(() => {
    timerTimeout = null;

    if (!timerRunning) return;

    timerRemaining -= 1;

    if (timerRemaining <= 0) {
      timerRemaining = 0;
      stopTimer();
      finishCurrentQuestion();
      return;
    }

    timerNextTickAt += 1000;
    emitTimerUpdate();
    emitTimerTick();
    scheduleTimerTick();
  }, delay);
}

function emitTimerUpdate() {
  io.emit("timerUpdate", {
    duration: timerDuration,
    remaining: timerRemaining,
    running: timerRunning,
    locked: answersLocked
  });
}

function emitTimerTick() {
  io.emit("timerTick", {
    remaining: timerRemaining,
    duration: timerDuration
  });
}

function resetTimerForCurrentQuestion(clearPreferred = false) {
  stopTimer();

  if (clearPreferred) {
    preferredTimerDuration = null;
  }

  if (currentQuiz && currentQuestionIndex >= 0) {
    const question = currentQuiz.questions[currentQuestionIndex];
    timerDuration =
      preferredTimerDuration !== null
        ? preferredTimerDuration
        : getQuestionTimerDuration(question);

    if (question) {
      question.timer = timerDuration;
    }
  }

  timerRemaining = timerDuration;
  answersLocked = false;
  resetCorrectAnswerRank();

  emitTimerUpdate();
}

function startTimer() {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return;
  if (timerRunning) return;
  if (timerRemaining <= 0) return;

  timerRunning = true;
  answersLocked = false;
  timerNextTickAt = Date.now() + 1000;
  emitTimerUpdate();
  emitTimerTick();
  scheduleTimerTick();
}

let countdownTimeout = null;
let countdownActive = false;

function cancelCountdown() {
  if (countdownTimeout) {
    clearTimeout(countdownTimeout);
    countdownTimeout = null;
  }
  countdownActive = false;
}

function cancelCountdownWithHide() {
  cancelCountdown();
  io.emit("countdown", { value: -1 });
}

function sendLeaderboard() {
  const sortedPlayers = [...players].sort((a, b) => {
    return (b.score || 0) - (a.score || 0);
  });

  io.emit("leaderboardUpdate", sortedPlayers);
  io.emit("playersUpdate", sortedPlayers);
}

function runCountdownThen(callback) {
  cancelCountdownWithHide();

  countdownActive = true;
  const steps = [3, 2, 1];
  let index = 0;

  const emitStep = () => {
    if (index < steps.length) {
      io.emit("countdown", { value: steps[index] });
      index += 1;
      countdownTimeout = setTimeout(emitStep, 1000);
      return;
    }

    io.emit("countdown", { value: 0 });
    countdownTimeout = setTimeout(() => {
      io.emit("countdown", { value: -1 });
      countdownTimeout = null;
      countdownActive = false;
      callback();
    }, 700);
  };

  emitStep();
}

function getCurrentQuestionPayload() {
  const question = currentQuiz.questions[currentQuestionIndex];

  return {
    questionNumber: currentQuestionIndex + 1,
    totalQuestions: currentQuiz.questions.length,
    question: question.question,
    answers: question.answers,
    audio: question.audio || "",
    audioStart: Number(question.audioStart) || 0,
    audioDuration: Number(question.audioDuration) || 0,
    timerDuration
  };
}

function emitTimerState(socketTarget = io) {
  socketTarget.emit("timerUpdate", {
    duration: timerDuration,
    remaining: timerRemaining,
    running: timerRunning,
    locked: answersLocked
  });
}

function sendPublicRoundWaiting(socketTarget = io) {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) {
    socketTarget.emit("quizWaiting");
    emitTimerState(socketTarget);
    return;
  }

  socketTarget.emit("quizRoundWaiting", {
    questionNumber: currentQuestionIndex + 1,
    totalQuestions: currentQuiz.questions.length
  });
  emitTimerState(socketTarget);
}

function isPlayerSocketConnected(playerId) {
  return Boolean(io.sockets.sockets.get(playerId));
}

function registerPlayerSession(playerId, name) {
  const cleanName = String(name || "Joueur").trim() || "Joueur";
  let player = players.find((entry) => entry.id === playerId);

  if (!player) {
    const reclaimed = players.find(
      (entry) =>
        entry.name === cleanName && !isPlayerSocketConnected(entry.id)
    );
    if (reclaimed) {
      reclaimed.id = playerId;
      player = reclaimed;
    } else {
      player = {
        id: playerId,
        name: cleanName,
        score: 0,
        answered: false
      };
      players.push(player);
    }
  } else if (cleanName && player.name !== cleanName) {
    player.name = cleanName;
  }

  return player;
}

function processPlayerAnswer(playerId, answerIndex, emitTarget = null) {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return null;
  if (!timerRunning || countdownActive || answersLocked || timerRemaining <= 0) return null;

  const player = players.find((entry) => entry.id === playerId);
  if (!player || player.answered) return null;

  const question = currentQuiz.questions[currentQuestionIndex];
  const correctIndexes = questionCorrectIndexes(question);
  const selectedAnswer = Number(answerIndex);

  player.answered = true;

  let result;

  if (correctIndexes.includes(selectedAnswer)) {
    const rank = correctAnswerRank;
    const points = getSpeedPointsForRank(rank);
    correctAnswerRank += 1;
    player.score += points;

    if (rank === 0) {
      questionWinner = {
        name: player.name,
        points
      };
    }

    result = {
      correct: true,
      points,
      rank: rank + 1,
      message: points > 0
        ? `Bonne réponse ! +${points} points (${rank + 1}e)`
        : "Bonne réponse, mais trop tard : 0 point"
    };
  } else {
    result = {
      correct: false,
      points: 0,
      message: "Mauvaise réponse"
    };
  }

  if (emitTarget?.emit) {
    emitTarget.emit("answerResult", result);
  }

  sendLeaderboard();
  return result;
}

function revealQuestionToAll() {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return;

  io.emit("showQuestion", getCurrentQuestionPayload());
  emitTimerState();
}

function sendHostQuestion(socketTarget = io) {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return;

  socketTarget.emit("showQuestion", getCurrentQuestionPayload());
  emitTimerState(socketTarget);
}

function previewQuestion(nextIndex) {
  if (!currentQuiz || !Array.isArray(currentQuiz.questions) || !currentQuiz.questions.length) {
    return;
  }

  const clampedIndex = Math.max(0, Math.min(nextIndex, currentQuiz.questions.length - 1));
  if (clampedIndex === currentQuestionIndex) return;

  stopTimer();
  cancelCountdownWithHide();
  io.emit("answerHidden");
  currentQuestionIndex = clampedIndex;
  resetTimerForCurrentQuestion(true);
  sendHostQuestion();
  revealQuestionToAll();
  emitTimerState();
}

function goToQuestion(nextIndex) {
  if (!currentQuiz || !quizStarted) return;

  stopTimer();
  io.emit("answerHidden");

  currentQuestionIndex = nextIndex;

  if (currentQuestionIndex >= currentQuiz.questions.length) {
    quizStarted = false;
    answersLocked = true;

    io.emit("quizEnded", [...players].sort((a, b) => {
      return (b.score || 0) - (a.score || 0);
    }));

    emitTimerUpdate();
    return;
  }

  players = players.map((player) => ({
    ...player,
    answered: false
  }));

  cancelCountdownWithHide();
  resetTimerForCurrentQuestion(true);
  skipNextCountdown = true;
  sendHostQuestion();
  revealQuestionToAll();
  startTimer();
  sendLeaderboard();
}

function startQuizSession() {
  if (!currentQuiz || !Array.isArray(currentQuiz.questions)) {
    return false;
  }

  quizStarted = true;
  currentQuestionIndex = 0;

  applyScorePolicyOnNewGame();

  players = players.map((player) => ({
    ...player,
    answered: false
  }));

  cancelCountdownWithHide();
  resetTimerForCurrentQuestion(true);
  skipNextCountdown = false;
  sendHostQuestion();
  io.emit("quizRoundWaiting", {
    questionNumber: 1,
    totalQuestions: currentQuiz.questions.length
  });
  emitTimerState();
  sendLeaderboard();
  return true;
}

function hostTimerStart() {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return;
  if (timerRunning || countdownActive) return;
  if (timerRemaining <= 0) return;

  revealQuestionToAll();

  if (skipNextCountdown) {
    skipNextCountdown = false;
    startTimer();
    return;
  }

  runCountdownThen(() => {
    startTimer();
  });
}

function hostTimerPause() {
  stopTimer();
  emitTimerUpdate();
}

function hostTimerResume() {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) return;
  if (countdownActive || answerRevealed) return;
  if (timerRunning || timerRemaining <= 0 || answersLocked) return;

  startTimer();
}

let lastHostPlayToggleAt = 0;
const HOST_PLAY_TOGGLE_DEBOUNCE_MS = 400;

function hostPlayToggle() {
  const now = Date.now();
  if (now - lastHostPlayToggleAt < HOST_PLAY_TOGGLE_DEBOUNCE_MS) return;
  lastHostPlayToggleAt = now;

  if (currentQuiz && !quizStarted) {
    startQuizSession();
    return;
  }

  if (!quizStarted) return;
  if (answersLocked || timerRemaining <= 0) return;

  if (timerRunning) {
    hostTimerPause();
    return;
  }

  if (timerRemaining < timerDuration) {
    hostTimerResume();
    return;
  }

  hostTimerStart();
}

function hostNextQuestion() {
  if (!currentQuiz) return;

  if (!quizStarted) {
    previewQuestion(currentQuestionIndex + 1);
    return;
  }

  goToQuestion(currentQuestionIndex + 1);
}

function hostPreviousQuestion() {
  if (!currentQuiz) return;

  if (!quizStarted) {
    previewQuestion(currentQuestionIndex - 1);
    return;
  }

  if (currentQuestionIndex <= 0) return;
  goToQuestion(currentQuestionIndex - 1);
}

function hostHideAnswer() {
  io.emit("answerHidden");
}

function sendCurrentQuestion(socketTarget = io) {
  if (!quizStarted || !currentQuiz || currentQuestionIndex < 0) {
    sendPublicRoundWaiting(socketTarget);
    return;
  }

  if (timerRunning || countdownActive) {
    socketTarget.emit("showQuestion", getCurrentQuestionPayload());
  } else {
    sendPublicRoundWaiting(socketTarget);
  }

  emitTimerState(socketTarget);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/wheel", (req, res) => {
  res.redirect("/wheel/host");
});

app.get("/wheel/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wheel-host.html"));
});

app.get("/wheel/viewer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "wheel-viewer.html"));
});

app.get("/wheel-host", (req, res) => {
  res.redirect("/wheel/host");
});

app.get("/wheel-viewer", (req, res) => {
  res.redirect("/wheel/viewer");
});

app.get("/api/wheel/template", (req, res) => {
  res.setHeader("Content-Type", getWheelTemplateContentType());
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${getWheelTemplateFilename()}"`
  );
  res.send(buildWheelTemplateBuffer());
});

app.post("/api/wheel/import", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Fichier requis." });
  }

  const fileName = String(req.file.originalname || "").toLowerCase();
  if (
    !fileName.endsWith(".xlsx")
    && !fileName.endsWith(".xls")
    && !fileName.endsWith(".numbers")
  ) {
    return res.status(400).json({
      error: "Format non supporté. Utilise un fichier Excel (.xlsx) ou Numbers (.numbers)."
    });
  }

  try {
    const parsed = parseWheelWorkbook(req.file.buffer);
    res.json({
      ok: true,
      entries: parsed.entries,
      prizeQueue: parsed.prizeQueue
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible d'importer ce fichier."
    });
  }
});

const BINGO_MUSICAL_DIR = path.resolve(__dirname, "..", "Bingo musical");

function bingoStyleLabel(folderName) {
  return String(folderName || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^bingo\s+/i, "")
    .replace(/^musical\s+/i, "")
    .replace(/\s*\(\s*100\s+cartes\s*\)\s*/i, "")
    .replace(/^[''"]+|[''"]+$/g, "")
    .trim() || folderName;
}

function isInsideDir(root, target) {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function listBingoStyles() {
  if (!fs.existsSync(BINGO_MUSICAL_DIR)) return [];
  const found = [];

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }

    entries.forEach((entry) => {
      if (entry.name.startsWith(".")) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        return;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) return;

      try {
        const raw = JSON.parse(fs.readFileSync(full, "utf8"));
        const calls = Array.isArray(raw.calls) ? raw.calls.length : Math.max(0, (raw.call_order || []).length - 1);
        const cards = Array.isArray(raw.cards) ? raw.cards.length : Object.keys(raw.boards || {}).length;
        const recognized = (raw.call_order && raw.boards) || (Array.isArray(raw.calls) && Array.isArray(raw.cards));
        if (!recognized || !cards) return;

        const rel = path.relative(BINGO_MUSICAL_DIR, full);
        const folder = path.basename(path.dirname(full));
        found.push({
          id: Buffer.from(rel).toString("base64url"),
          name: bingoStyleLabel(folder),
          folder,
          songs: calls,
          cards
        });
      } catch (error) {
        // Ignore les JSON qui ne sont pas des packs de cartes.
      }
    });
  }

  walk(BINGO_MUSICAL_DIR);
  found.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return found;
}

function bingoPackPathFromId(id) {
  let rel = "";
  try {
    rel = Buffer.from(String(id || ""), "base64url").toString("utf8");
  } catch (error) {
    return null;
  }
  if (!rel || rel.includes("\0")) return null;
  const full = path.resolve(BINGO_MUSICAL_DIR, rel);
  if (!isInsideDir(BINGO_MUSICAL_DIR, full)) return null;
  if (!full.toLowerCase().endsWith(".json") || !fs.existsSync(full)) return null;
  return full;
}

app.get("/feud", (req, res) => {
  res.redirect("/feud/host");
});

app.get("/feud/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feud-host.html"));
});

app.get("/feud/viewer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "feud-viewer.html"));
});

app.get("/jeopardy", (req, res) => {
  res.redirect("/jeopardy/host");
});

app.get("/jeopardy/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "jeopardy-host.html"));
});

app.get("/jeopardy/viewer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "jeopardy-viewer.html"));
});

app.get("/chrono", (req, res) => {
  res.redirect("/chrono/host");
});

app.get("/chrono/host", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "chrono-host.html"));
});

app.get("/chrono/viewer", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "chrono-viewer.html"));
});

app.get("/ipad", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "ipad.html"));
});

app.get("/ipad/qr", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "ipad-qr.html"));
});

app.get("/bingo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bingo.html"));
});

app.get("/bingo/verificateur", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bingo-verificateur.html"));
});

app.get("/bingo/viewer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bingo-verificateur.html"));
});

app.get("/api/bingo/styles", (req, res) => {
  res.json(listBingoStyles());
});

app.get("/api/bingo/styles/:id", (req, res) => {
  const full = bingoPackPathFromId(req.params.id);
  if (!full) {
    res.status(404).json({ error: "Style introuvable." });
    return;
  }
  res.type("json").send(fs.readFileSync(full));
});

registerPhotoPeopleRoutes(app, {
  io,
  getBaseUrl,
  getLocalIp,
  port: PORT,
  QRCode,
  qrScanOptions: QR_SCAN_OPTIONS
});

registerQuizLaTaChansonRoutes(app);

app.get("/visualizer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "visualizer.html"));
});

app.get("/api/visualizer/status", (req, res) => {
  res.json(artnet.getStatus());
});

app.post("/api/visualizer/connect", (req, res) => {
  const result = artnet.connectSoundSwitch();
  io.to("visualizer").emit("artnetStatus", artnet.getStatus());
  res.json({ ok: true, ...result });
});

app.get("/api/visualizer/dmx", (req, res) => {
  const universes = artnet.getUniverses();
  const active = {};
  for (const [universe, data] of Object.entries(universes)) {
    const channels = [];
    for (let i = 0; i < data.length; i += 1) {
      if (data[i]) channels.push({ ch: i + 1, v: data[i] });
    }
    active[universe] = channels;
  }
  res.json({ status: artnet.getStatus(), active });
});

app.get("/api/visualizer/patch", (req, res) => {
  res.json({
    patch: loadPatch(),
    profiles: getProfiles()
  });
});

app.put("/api/visualizer/patch", (req, res) => {
  try {
    const patch = savePatch(req.body || {});
    io.to("visualizer").emit("visualizerPatch", patch);
    res.json({ ok: true, patch });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible d'enregistrer le patch."
    });
  }
});

app.post("/api/visualizer/import-soundswitch", (req, res) => {
  try {
    const imported = importSoundSwitchVenue();
    const patch = savePatch(imported);
    io.to("visualizer").emit("visualizerPatch", patch);
    res.json({ ok: true, patch, source: imported.source });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Import SoundSwitch impossible."
    });
  }
});

app.get("/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

app.get("/host/qr", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "host-qr.html"));
});

app.get("/join", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "join.html"));
});

app.get("/player", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "player.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/viewer", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "viewer.html"));
});

app.get("/api/network", async (req, res) => {
  try {
    const joinUrl = getJoinUrl();
    const playerUrl = getPlayerUrl();
    const viewerUrl = getViewerUrl();

    const joinQr = await QRCode.toDataURL(joinUrl, QR_SCAN_OPTIONS);
    const viewerQr = await QRCode.toDataURL(viewerUrl, QR_SCAN_OPTIONS);

    res.json({
      ip: getLocalIp(),
      allIps: getAllLocalIps(),
      port: PORT,
      baseUrl: getBaseUrl(),
      joinUrl,
      joinQr,
      playerUrl,
      playerQr: joinQr,
      viewerUrl,
      viewerQr
    });
  } catch (error) {
    res.status(500).json({ error: "Erreur QR Code" });
  }
});

app.get("/api/ipad", async (req, res) => {
  try {
    const url = `${getBaseUrl()}/ipad`;
    const qr = await QRCode.toDataURL(url, QR_SCAN_OPTIONS);
    res.json({ url, qr, ip: getLocalIp() });
  } catch (error) {
    res.status(500).json({ error: "Erreur QR Code" });
  }
});

app.get("/api/library", (req, res) => {
  const groups = db.prepare(`
    SELECT id, name, created_at
    FROM quiz_groups
    ORDER BY sort_order, id
  `).all();

  const groupsWithQuizzes = groups.map((group) => ({
    ...group,
    quizzes: db.prepare(`
      SELECT id, title, sort_order, created_at
      FROM quizzes
      WHERE group_id = ?
      ORDER BY sort_order, id
    `).all(group.id)
  }));

  res.json({
    groups: groupsWithQuizzes
  });
});

app.get("/api/groups", (req, res) => {
  const groups = db.prepare(`
    SELECT
      g.id,
      g.name,
      g.created_at,
      COUNT(q.id) AS quiz_count
    FROM quiz_groups g
    LEFT JOIN quizzes q ON q.group_id = g.id
    GROUP BY g.id
    ORDER BY g.sort_order, g.id
  `).all();

  res.json(groups);
});

app.get("/api/groups/:id", (req, res) => {
  const groupId = Number(req.params.id);

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  const group = db.prepare(`
    SELECT id, name, created_at
    FROM quiz_groups
    WHERE id = ?
  `).get(groupId);

  if (!group) {
    return res.status(404).json({ error: "Dossier introuvable" });
  }

  const quizzes = db.prepare(`
    SELECT id, title, sort_order, created_at
    FROM quizzes
    WHERE group_id = ?
    ORDER BY sort_order, id
  `).all(groupId);

  res.json({
    ...group,
    quizzes
  });
});

app.post("/api/groups", (req, res) => {
  const name = String(req.body?.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Nom du dossier requis" });
  }

  const nextOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS value
    FROM quiz_groups
  `).get().value;

  const result = db.prepare(`
    INSERT INTO quiz_groups (name, sort_order)
    VALUES (?, ?)
  `).run(name, nextOrder);

  res.json({
    success: true,
    id: result.lastInsertRowid,
    name
  });
});

app.delete("/api/groups/:id", (req, res) => {
  const groupId = Number(req.params.id);

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  const group = db.prepare(`
    SELECT id
    FROM quiz_groups
    WHERE id = ?
  `).get(groupId);

  if (!group) {
    return res.status(404).json({ error: "Dossier introuvable" });
  }

  clearActiveQuizIfInGroup(groupId);

  db.prepare(`
    DELETE FROM quizzes
    WHERE group_id = ?
  `).run(groupId);

  db.prepare(`
    DELETE FROM quiz_groups
    WHERE id = ?
  `).run(groupId);

  res.json({ success: true });
});

app.get("/api/groups/:id/quiz-template", (req, res) => {
  const groupId = Number(req.params.id);

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  const group = getGroupById(groupId);
  if (!group) {
    return res.status(404).json({ error: "Dossier introuvable" });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="DJ_Carl_Quiz_Modele_Client_Deluxe.xlsx"'
  );
  res.send(buildQuizTemplateBuffer());
});

function listAudioFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return [];

  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listAudioFiles(fullPath, relativePath));
      continue;
    }

    if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(relativePath.split(path.sep).join("/"));
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "fr"));
}

app.get("/api/audio-files", (req, res) => {
  res.json({
    files: listAudioFiles(path.join(__dirname, "Audio"))
  });
});

app.post("/api/audio-files", (req, res) => {
  audioUpload.single("file")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        error: "Le fichier audio est trop volumineux (maximum 25 Mo)."
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Choisis un fichier audio." });
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase();

    if (!AUDIO_EXTENSIONS.has(extension)) {
      return res.status(400).json({
        error: "Choisis un fichier mp3, wav, m4a, aac, ogg ou flac."
      });
    }

    const rawBase = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const safeBase = rawBase
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "extrait";
    const audioDir = path.join(__dirname, "Audio");
    fs.mkdirSync(audioDir, { recursive: true });

    let filename = `${safeBase}${extension}`;
    let destination = path.join(audioDir, filename);
    let copyIndex = 2;

    while (fs.existsSync(destination)) {
      filename = `${safeBase}-${copyIndex}${extension}`;
      destination = path.join(audioDir, filename);
      copyIndex += 1;
    }

    fs.writeFileSync(destination, req.file.buffer);
    res.json({ file: filename });
  });
});

app.post("/api/groups/:id/import-quiz", upload.single("file"), (req, res) => {
  const groupId = Number(req.params.id);

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Fichier Excel requis." });
  }

  const fileName = String(req.file.originalname || "").toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
    return res.status(400).json({ error: "Format non supporté. Utilise un fichier Excel (.xlsx)." });
  }

  try {
    const parsed = parseQuizWorkbook(req.file.buffer, {
      title: req.body?.title,
      fallbackTitle: String(req.file.originalname || "Quiz importé").replace(/\.[^.]+$/i, "")
    });

    const created = createQuizInGroup(groupId, parsed.title, parsed.questions);

    res.json({
      success: true,
      ...created
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible d'importer ce fichier."
    });
  }
});

app.get("/api/music-quiz/categories", (req, res) => {
  try {
    const categories = listMusicQuizCategories();
    res.json({ categories });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Impossible de charger la banque quiz musical."
    });
  }
});

app.get("/api/music-quiz/bank", (req, res) => {
  try {
    res.json(loadMusicQuizBank());
  } catch (error) {
    res.status(500).json({
      error: error.message || "Impossible de charger la banque quiz musical."
    });
  }
});

app.post("/api/groups/:id/import-music-quiz", (req, res) => {
  const groupId = Number(req.params.id);
  const category = String(req.body?.category || "").trim();
  const title = String(req.body?.title || "").trim();

  if (!Number.isFinite(groupId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  if (!category) {
    return res.status(400).json({ error: "Catégorie requise." });
  }

  try {
    const parsed = buildMusicQuizImport(category, { title: title || undefined });
    const created = createQuizInGroup(groupId, parsed.title, parsed.questions);

    res.json({
      success: true,
      category,
      ...created
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible d'importer cette catégorie."
    });
  }
});

app.get("/api/quizzes", (req, res) => {
  const quizzes = db.prepare(`
    SELECT
      q.id,
      q.title,
      q.group_id,
      q.sort_order,
      q.created_at,
      g.name AS group_name
    FROM quizzes q
    LEFT JOIN quiz_groups g ON g.id = q.group_id
    ORDER BY g.sort_order, g.id, q.sort_order, q.id
  `).all();

  res.json(quizzes);
});

app.get("/api/quizzes/:id", (req, res) => {
  const quiz = db.prepare(`
    SELECT *
    FROM quizzes
    WHERE id = ?
  `).get(req.params.id);

  if (!quiz) {
    return res.status(404).json({ error: "Quiz introuvable" });
  }

  res.json({
    id: quiz.id,
    title: quiz.title,
    data: JSON.parse(quiz.data),
    created_at: quiz.created_at
  });
});

app.post("/api/quizzes", (req, res) => {
  const body = req.body;

  const title =
    body.title ||
    body.quizTitle ||
    body.name ||
    body.nom ||
    "Nouveau quiz";

  const questions =
    body.questions ||
    body.quiz?.questions ||
    body.data?.questions ||
    [];

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({
      error: "Quiz invalide",
      details: "Aucune question reçue par le serveur.",
      received: body
    });
  }

  const groupId = Number(body.groupId ?? body.group_id);

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return res.status(400).json({ error: "Un dossier est requis pour créer un quiz" });
  }

  try {
    const created = createQuizInGroup(groupId, title, questions);
    res.json({
      success: true,
      id: created.id,
      title: created.title
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Erreur lors de la création." });
  }
});

app.put("/api/quizzes/:id", (req, res) => {
  const quizId = Number(req.params.id);

  if (!Number.isFinite(quizId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  try {
    const updated = updateQuizById(quizId, req.body?.title, req.body?.questions);
    res.json({
      success: true,
      ...updated
    });
  } catch (error) {
    const status = error.message === "Quiz introuvable" ? 404 : 400;
    res.status(status).json({
      error: error.message || "Erreur lors de la mise à jour."
    });
  }
});

app.delete("/api/quizzes/:id", (req, res) => {
  const quizId = Number(req.params.id);

  if (!Number.isFinite(quizId)) {
    return res.status(400).json({ error: "Identifiant invalide" });
  }

  const quiz = db.prepare(`
    SELECT id
    FROM quizzes
    WHERE id = ?
  `).get(quizId);

  if (!quiz) {
    return res.status(404).json({ error: "Quiz introuvable" });
  }

  db.prepare(`
    DELETE FROM quizzes
    WHERE id = ?
  `).run(quizId);

  if (currentQuizId === quizId) {
    resetActiveQuizState();
  }

  res.json({ success: true });
});

const artnet = startArtNetReceiver({
  getBindIp: getLocalIp,
  onDmx(universe, data) {
    io.to("visualizer").volatile.emit("artnetDmx", {
      universe,
      data: Buffer.from(data)
    });
  }
});

setInterval(() => {
  const room = io.sockets.adapter.rooms.get("visualizer");
  if (room && room.size) {
    io.to("visualizer").emit("artnetStatus", artnet.getStatus());
  }
}, 1000);

let jeopardyBoardTimer = null;

function emitJeopardyAll() {
  io.to("jeopardy").emit("jeopardyState", getPublicJeopardyState());
  io.to("jeopardy-host").emit("jeopardyHostState", getHostJeopardyState());
}

function cancelJeopardyBoardReturn() {
  if (!jeopardyBoardTimer) return;
  clearTimeout(jeopardyBoardTimer);
  jeopardyBoardTimer = null;
}

function armJeopardyBoardReturn() {
  cancelJeopardyBoardReturn();
  jeopardyBoardTimer = setTimeout(() => {
    jeopardyBoardTimer = null;
    try {
      jeopardyCloseClue();
    } catch (error) {
      return;
    }
    emitJeopardyAll();
  }, 3000);
}

let showSoundOn = true;
let showVolume = 1;

function emitShowMix(target) {
  const payloadSound = { on: showSoundOn };
  const payloadVolume = { level: showVolume };
  if (target) {
    target.emit("showSound", payloadSound);
    target.emit("showVolume", payloadVolume);
    return;
  }
  io.emit("showSound", payloadSound);
  io.emit("showVolume", payloadVolume);
}

io.on("connection", (socket) => {
  console.log("Connecté :", socket.id);
  sendLeaderboard();
  socket.emit("accumulateScoresUpdated", {
    enabled: accumulateScoresAcrossGames
  });

  socket.on("joinVisualizer", () => {
    socket.join("visualizer");
    socket.emit("visualizerState", {
      patch: loadPatch(),
      profiles: getProfiles(),
      status: artnet.getStatus(),
      universes: artnet.getUniverses()
    });
  });

  socket.on("connectSoundSwitch", () => {
    const result = artnet.connectSoundSwitch();
    socket.emit("artnetHello", result);
    io.to("visualizer").emit("artnetStatus", artnet.getStatus());
  });

  socket.on("joinViewer", () => {
    sendCurrentQuestion(socket);
    sendLeaderboard();
  });

  socket.on("setRemoteKeys", (payload) => {
    updateRemoteKeys({
      stopKey: payload?.stopKey ?? null,
      playKey: payload?.playKey ?? null
    });
  });

  socket.on("joinGame", (name) => {
    const player = registerPlayerSession(socket.id, name);

    socket.emit("joinedGame", {
      id: player.id,
      name: player.name
    });

    sendCurrentQuestion(socket);
    sendLeaderboard();
  });

  socket.on("loadQuiz", (quizId) => {
    const quiz = db.prepare(`
      SELECT *
      FROM quizzes
      WHERE id = ?
    `).get(quizId);

    if (!quiz) {
      socket.emit("adminMessage", "Quiz introuvable");
      return;
    }

    stopTimer();

    currentQuiz = JSON.parse(quiz.data);
    currentQuizId = quizId;
    currentQuestionIndex = -1;
    quizStarted = false;

    timerDuration = 30;
    timerRemaining = 30;
    answersLocked = false;
    preferredTimerDuration = null;

    applyScorePolicyOnNewGame();

    players = players.map((player) => ({
      ...player,
      answered: false
    }));

    io.emit("quizWaiting");
    emitTimerUpdate();
    sendLeaderboard();

    socket.emit("quizLoaded", currentQuiz);
  });

  socket.on("startQuiz", () => {
    if (!startQuizSession()) {
      socket.emit("adminMessage", "Aucun quiz chargé");
    }
  });

  socket.on("setQuestionDuration", (duration) => {
    const cleanDuration = Number(duration);

    if (!Number.isFinite(cleanDuration) || cleanDuration <= 0) {
      socket.emit("adminMessage", "Durée invalide");
      return;
    }

    preferredTimerDuration = Math.round(cleanDuration);
    timerDuration = preferredTimerDuration;
    timerRemaining = timerDuration;
    answersLocked = false;

    if (currentQuiz && currentQuestionIndex >= 0) {
      currentQuiz.questions[currentQuestionIndex].timer = timerDuration;
    }

    stopTimer();
    emitTimerUpdate();
    sendHostQuestion(socket);
  });

  socket.on("timerStart", () => {
    hostTimerStart();
  });

  socket.on("timerPause", () => {
    hostTimerPause();
  });

  socket.on("timerResume", () => {
    hostTimerResume();
  });

  socket.on("timerReset", () => {
    if (!currentQuiz || currentQuestionIndex < 0) return;

    cancelCountdownWithHide();
    resetTimerForCurrentQuestion();
    sendHostQuestion(socket);
    socket.broadcast.emit("quizRoundWaiting", {
      questionNumber: currentQuestionIndex + 1,
      totalQuestions: currentQuiz.questions.length
    });
    emitTimerState();
  });

  socket.on("showAnswer", () => {
    finishCurrentQuestion();
  });

  socket.on("timerStop", () => {
    finishCurrentQuestion();
  });

  socket.on("hideAnswer", () => {
    hostHideAnswer();
  });

  socket.on("nextQuestion", () => {
    hostNextQuestion();
  });

  socket.on("previousQuestion", () => {
    hostPreviousQuestion();
  });

  socket.on("submitAnswer", (answerIndex) => {
    processPlayerAnswer(socket.id, answerIndex, socket);
  });

  socket.on("resetPlayers", () => {
    players = [];
    sendLeaderboard();
  });

  socket.on("resetScores", () => {
    resetAllPlayerScores();
    sendLeaderboard();
  });

  socket.on("setAccumulateScores", (enabled) => {
    accumulateScoresAcrossGames = Boolean(enabled);
    io.emit("accumulateScoresUpdated", {
      enabled: accumulateScoresAcrossGames
    });
  });

  socket.on("resetViewer", () => {
    cancelCountdownWithHide();
    stopTimer();
    answersLocked = false;
    io.emit("viewerReset");
    io.emit("quizWaiting");
    emitTimerUpdate();
    sendLeaderboard();
  });

  function emitWheelState(target = io) {
    target.emit("wheelState", getPublicWheelState());
  }

  function emitWheelWinners(target = io) {
    target.emit("wheelWinners", getWheelWinners());
  }

  socket.on("joinWheelHost", (callback) => {
    socket.join("wheel");
    const state = getPublicWheelState();
    if (typeof callback === "function") {
      callback(state);
      return;
    }
    emitWheelState(socket);
  });

  socket.on("joinWheelViewer", (callback) => {
    socket.join("wheel");
    const state = getPublicWheelState();
    if (typeof callback === "function") {
      callback(state);
      return;
    }
    emitWheelState(socket);
  });

  socket.on("wheelSetSegments", (labels, callback) => {
    try {
      const state = setWheelSegments(labels);
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelSetPrizeQueue", (queue, callback) => {
    try {
      const info = setWheelPrizeQueue(queue);
      const state = getPublicWheelState();
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, info, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelSetPrize", (prize, callback) => {
    try {
      setWheelPrize(prize);
      if (typeof callback === "function") {
        callback({ ok: true, prize: getWheelPrize() });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelSpin", (data, callback) => {
    if (typeof data === "function") {
      callback = data;
      data = null;
    }

    try {
      if (data && typeof data === "object" && data.prize !== undefined) {
        setWheelPrize(data.prize);
      }

      const spin = markWheelSpinning(buildSpinPayload());
      const payload = publishWheelSpin(spin);
      io.to("wheel").emit("wheelSpinStart", payload);

      setTimeout(() => {
        const state = completeWheelSpin(spin);
        io.to("wheel").emit("wheelWinners", getWheelWinners());
        io.to("wheel").emit("wheelState", state);
      }, payload.duration + 80);

      if (typeof callback === "function") {
        callback({ ok: true, spin: payload });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelRestoreAllPlayers", (callback) => {
    try {
      const state = restoreAllWheelPlayers();
      io.to("wheel").emit("wheelWinners", getWheelWinners());
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelClaimWinTune", () => {
    io.to("wheel").emit("wheelWinTuneClaim", { at: Date.now() });
  });

  socket.on("wheelRestorePlayer", (data, callback) => {
    if (typeof data === "function") {
      callback = data;
      data = null;
    }

    try {
      const label = data && typeof data === "object" ? data.label : data;
      const state = restoreWheelPlayer(label);
      io.to("wheel").emit("wheelWinners", getWheelWinners());
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelCloseWinnerSeries", (data, callback) => {
    if (typeof data === "function") {
      callback = data;
      data = null;
    }

    try {
      const name = data && typeof data === "object" ? data.name : data;
      const state = closeWheelWinnerSeries(name);
      io.to("wheel").emit("wheelWinners", getWheelWinners());
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelClearWinners", (callback) => {
    try {
      const state = clearWheelWinners();
      io.to("wheel").emit("wheelWinners", getWheelWinners());
      io.to("wheel").emit("wheelState", state);
      if (typeof callback === "function") {
        callback({ ok: true, state });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ ok: false, error: error.message });
      }
    }
  });

  socket.on("wheelGetWinners", (callback) => {
    if (typeof callback === "function") {
      callback(getWheelWinners());
    }
  });

  socket.on("wheelSetMusic", (enabled, callback) => {
    if (typeof enabled === "function") {
      callback = enabled;
      enabled = true;
    }

    const musicEnabled = setWheelMusicEnabled(enabled);
    io.to("wheel").emit("wheelMusic", { musicEnabled });
    if (typeof callback === "function") {
      callback({ ok: true, musicEnabled });
    }
  });

  function emitFeud() {
    io.to("feud").emit("feudState", getPublicFeudState());
    io.to("feud-host").emit("feudHostState", getHostFeudState());
  }

  function onFeud(eventName, handler) {
    socket.on(eventName, (payload, callback) => {
      if (typeof payload === "function") {
        callback = payload;
        payload = {};
      }
      try {
        handler(payload || {});
        emitFeud();
        if (typeof callback === "function") {
          callback({ ok: true, state: getHostFeudState() });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({ ok: false, error: error.message });
        }
      }
    });
  }

  socket.on("joinChansonHost", (callback) => {
    socket.join("chanson-host");
    socket.emit("showVolume", { level: showVolume });
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("joinChansonRemote", (callback) => {
    socket.join("chanson-remote");
    io.to("chanson-host").emit("chansonRemoteRequestState");
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("chansonStatePush", (state) => {
    io.to("chanson-remote").emit("chansonState", state || {});
  });

  socket.on("chansonRemote", (payload, callback) => {
    if (typeof payload === "function") {
      callback = payload;
      payload = {};
    }
    io.to("chanson-host").emit("chansonRemote", payload || {});
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("chansonBuzz", (payload, callback) => {
    if (typeof payload === "function") {
      callback = payload;
      payload = {};
    }
    const side = payload && payload.side === "blue" ? "blue" : "red";
    io.to("chanson-host").emit("chansonRemote", { action: "buzz", side });
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("joinFeudHost", (callback) => {
    socket.join("feud-host");
    emitShowMix(socket);
    if (typeof callback === "function") callback(getHostFeudState());
  });

  socket.on("setShowSound", (payload, callback) => {
    showSoundOn = !payload || payload.on !== false;
    emitShowMix();
    if (typeof callback === "function") callback({ ok: true, on: showSoundOn });
  });

  socket.on("setShowVolume", (payload, callback) => {
    const level = Number(payload && payload.level);
    showVolume = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 1;
    showSoundOn = showVolume > 0;
    emitShowMix();
    if (typeof callback === "function") callback({ ok: true, level: showVolume });
  });

  socket.on("joinFeudViewer", (callback) => {
    socket.join("feud");
    emitShowMix(socket);
    if (typeof callback === "function") callback(getPublicFeudState());
  });

  onFeud("feudStart", () => feudStart());
  onFeud("feudStartNextPack", () => feudStartNextPack());
  onFeud("feudFaceoffTurn", (payload) => feudFaceoffTurn(payload.team));
  onFeud("feudFaceoffPick", (payload) => feudFaceoffPick(payload.team, payload.index));
  onFeud("feudFaceoffMiss", (payload) => feudFaceoffMiss(payload.team));
  onFeud("feudGiveControl", (payload) => feudGiveControl(payload.team));
  onFeud("feudSwapControl", () => feudSwapControl());
  onFeud("feudReveal", (payload) => feudReveal(payload.index));
  onFeud("feudHideAnswer", (payload) => feudHideAnswer(payload.index));
  onFeud("feudStrike", () => feudStrike());
  onFeud("feudUndoStrike", () => feudUndoStrike());
  onFeud("feudStealMiss", () => feudStealMiss());
  onFeud("feudBank", () => feudBank());
  onFeud("feudNext", () => feudNext());
  onFeud("feudGoTo", (payload) => feudGoTo(payload.index));
  onFeud("feudReplayRound", () => feudReplayRound());
  onFeud("feudSetTeamName", (payload) => feudSetTeamName(payload.team, payload.name));
  onFeud("feudAddScore", (payload) => feudAddScore(payload.team, payload.delta));
  onFeud("feudAddQuestion", (payload) => feudAddQuestion(payload));
  onFeud("feudSetQuestionLimit", (payload) => feudSetQuestionLimit(payload.count));
  onFeud("feudSilence", () => feudSilence());
  onFeud("feudResetScores", () => feudResetScores());
  onFeud("feudResetGame", () => feudResetGame());

  function emitJeopardy() {
    emitJeopardyAll();
  }

  function onJeopardy(eventName, handler) {
    socket.on(eventName, (payload, callback) => {
      if (typeof payload === "function") {
        callback = payload;
        payload = {};
      }
      try {
        handler(payload || {});
        emitJeopardy();
        if (typeof callback === "function") {
          callback({ ok: true, state: getHostJeopardyState() });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({ ok: false, error: error.message });
        }
      }
    });
  }

  socket.on("joinJeopardyHost", (callback) => {
    socket.join("jeopardy-host");
    emitShowMix(socket);
    if (typeof callback === "function") callback(getHostJeopardyState());
  });

  socket.on("joinJeopardyViewer", (callback) => {
    socket.join("jeopardy");
    emitShowMix(socket);
    if (typeof callback === "function") callback(getPublicJeopardyState());
  });

  onJeopardy("jeopardySetTeamCount", (payload) => jeopardySetTeamCount(payload.count));
  onJeopardy("jeopardySetTeamName", (payload) => jeopardySetTeamName(payload.index, payload.name));
  onJeopardy("jeopardyAddScore", (payload) => jeopardyAddScore(payload.index, payload.delta));
  onJeopardy("jeopardySetControl", (payload) => jeopardySetControl(payload.index));
  onJeopardy("jeopardyStart", () => jeopardyStart());
  onJeopardy("jeopardyPick", (payload) => jeopardyPick(payload.col, payload.row));
  onJeopardy("jeopardySetWager", (payload) => jeopardySetWager(payload.amount));
  onJeopardy("jeopardyCorrect", (payload) => {
    jeopardyCorrect(payload.index);
    armJeopardyBoardReturn();
  });
  onJeopardy("jeopardyWrong", (payload) => jeopardyWrong(payload.index));
  onJeopardy("jeopardyBuzz", (payload) => jeopardyBuzz(payload.index));
  onJeopardy("jeopardyReveal", () => jeopardyReveal());
  onJeopardy("jeopardyCloseClue", () => {
    cancelJeopardyBoardReturn();
    jeopardyCloseClue();
  });
  onJeopardy("jeopardyCancel", () => {
    cancelJeopardyBoardReturn();
    jeopardyCancel();
  });
  onJeopardy("jeopardyEndRound", () => {
    cancelJeopardyBoardReturn();
    jeopardyEndRound();
  });
  onJeopardy("jeopardyShowRanking", (payload) => jeopardyShowRanking(payload.on));
  onJeopardy("jeopardyClearScores", () => jeopardyClearScores());
  onJeopardy("jeopardyNextRound", () => jeopardyNextRound());
  onJeopardy("jeopardyLockFinaleWagers", (payload) => jeopardyLockFinaleWagers(payload.wagers));
  onJeopardy("jeopardyShowFinaleClue", () => jeopardyShowFinaleClue());
  onJeopardy("jeopardyFinaleJudge", (payload) => jeopardyFinaleJudge(payload.index, payload.correct));
  onJeopardy("jeopardyShowWinner", () => jeopardyShowWinner());
  onJeopardy("jeopardyShowQr", (payload) => jeopardyShowQr(payload.visible));
  onJeopardy("jeopardyToggleTheme", (payload) => jeopardyToggleTheme(payload.on));
  onJeopardy("jeopardyReset", () => {
    cancelJeopardyBoardReturn();
    jeopardyReset();
  });

  socket.on("joinChrono", (payload, callback) => {
    if (typeof payload === "function") {
      callback = payload;
      payload = {};
    }
    socket.join("chrono");
    const state = chrono.getState();
    if (typeof callback === "function") callback(state);
    else socket.emit("chronoState", state);
  });

  socket.on("chronoPing", (callback) => {
    if (typeof callback === "function") callback(Date.now());
  });

  function onChrono(eventName, handler) {
    socket.on(eventName, (payload, callback) => {
      if (typeof payload === "function") {
        callback = payload;
        payload = {};
      }
      try {
        const state = handler(payload || {});
        io.to("chrono").emit("chronoState", state);
        if (typeof callback === "function") callback({ ok: true, state });
      } catch (error) {
        if (typeof callback === "function") callback({ ok: false, error: error.message });
      }
    });
  }

  onChrono("chronoSetTarget", (payload) => {
    return chrono.setTarget(payload.targetMs != null ? payload.targetMs : payload.target);
  });
  onChrono("chronoSetName", (payload) => chrono.setName(payload.name));
  onChrono("chronoStart", (payload) => chrono.start(payload));
  onChrono("chronoStop", (payload) => chrono.stop(payload));
  onChrono("chronoReset", () => chrono.reset());
  onChrono("chronoClear", () => chrono.clearResults());
  onChrono("chronoRemove", (payload) => chrono.removeResult(payload.id));

  registerPhotoPeopleSockets(io, socket);

  socket.on("disconnect", () => {
    sendLeaderboard();
  });
});

startGlobalRemote({
  playToggle: hostPlayToggle,
  timerStop: finishCurrentQuestion,
  nextQuestion: hostNextQuestion,
  previousQuestion: hostPreviousQuestion,
  hideAnswer: hostHideAnswer
});

server.listen(PORT, "0.0.0.0", () => {
  const allIps = getAllLocalIps();
  console.log("-----------------------------------");
  console.log("DJ Carl Quiz démarré");
  console.log(`Accueil : ${getBaseUrl()}/`);
  if (allIps.length > 1) {
    console.log(`IP réseau détectées : ${allIps.join(", ")} (QR utilise ${getLocalIp()})`);
  }
  console.log(`QR joueurs : ${getJoinUrl()}`);
  console.log(`Host   : ${getBaseUrl()}/host`);
  console.log(`Roue   : ${getBaseUrl()}/wheel/host (écran : /wheel/viewer)`);
  console.log(`Famille en or : ${getBaseUrl()}/feud/host (écran : /feud/viewer)`);
  console.log(`Jeopardy : ${getBaseUrl()}/jeopardy/host (écran : /jeopardy/viewer)`);
  console.log(`Chrono   : ${getBaseUrl()}/chrono/host (écran : /chrono/viewer)`);
  console.log(`Manette iPad : ${getBaseUrl()}/ipad/qr`);
  const photoPeople = getPhotoPeopleStartupInfo(getBaseUrl);
  console.log(`Photo en direct : ${photoPeople.hostUrl} (écran : ${photoPeople.viewerUrl})`);
  console.log(`Module Photo en direct : ${photoPeople.moduleDir}`);
  console.log(`Dossier photos : ${photoPeople.photosDir}`);
  const quizChanson = getQuizLaTaChansonStartupInfo(getBaseUrl);
  console.log(`Quiz la ta chanson : ${quizChanson.hostUrl} (écran : ${quizChanson.viewerUrl})`);
  console.log(`Bingo  : ${getBaseUrl()}/bingo (vérificateur : /bingo/verificateur)`);
  console.log(`Viz    : ${getBaseUrl()}/visualizer`);
  console.log(`Admin  : ${getBaseUrl()}/admin`);
  console.log(`Player : ${getBaseUrl()}/player`);
  console.log(`Viewer : ${getBaseUrl()}/viewer`);
  console.log("-----------------------------------");
});