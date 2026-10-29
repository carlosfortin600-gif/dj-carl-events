const { PACKS } = require("./feud-packs");

const MAX_ANSWERS = 8;
const MIN_ANSWERS = 3;

function cloneQuestions(list) {
  return list.map((item) => ({
    id: item.id,
    text: item.text,
    answers: item.answers.map((answer) => ({ text: answer.text, points: answer.points }))
  }));
}

function packAt(index) {
  return PACKS[((index % PACKS.length) + PACKS.length) % PACKS.length];
}

function createState() {
  const pack = packAt(0);
  return {
    teams: {
      a: { name: "Famille bleue", score: 0 },
      b: { name: "Famille rouge", score: 0 }
    },
    packIndex: 0,
    questions: cloneQuestions(pack.questions),
    questionLimit: pack.questions.length,
    questionIndex: 0,
    roundId: 0,
    revealed: [],
    strikes: 0,
    roundPoints: 0,
    phase: "title",
    control: null,
    roundWinner: null,
    faceoff: { a: null, b: null, turn: null, lockUntil: 0 },
    event: null
  };
}

let state = createState();
let eventSeq = 0;
let customSeq = 0;

function bump(type, extra) {
  eventSeq += 1;
  state.event = Object.assign({ seq: eventSeq, type }, extra || {});
}

function otherTeam(teamId) {
  return teamId === "a" ? "b" : "a";
}

function assertTeam(teamId) {
  if (teamId !== "a" && teamId !== "b") {
    throw new Error("Famille inconnue.");
  }
  return teamId;
}

function currentQuestion() {
  return state.questions[state.questionIndex] || null;
}

function cleanName(value, fallback) {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 24);
  return name || fallback;
}

function leaderOf() {
  if (state.teams.a.score === state.teams.b.score) return null;
  return state.teams.a.score > state.teams.b.score ? "a" : "b";
}

function pointFactor() {
  const number = state.questionIndex + 1;
  if (number <= 3) return 1;
  if (number <= 9) return 2;
  return 3;
}

function scored(points) {
  return points * pointFactor();
}

function beginRound() {
  const question = currentQuestion();
  if (!question) throw new Error("Aucune question.");
  state.roundId += 1;
  state.revealed = question.answers.map(() => false);
  state.strikes = 0;
  state.roundPoints = 0;
  state.control = null;
  state.roundWinner = null;
  state.faceoff = { a: null, b: null, turn: null, lockUntil: 0 };
  state.phase = "faceoff";
}

function faceoffPoints(pick, question) {
  if (typeof pick === "number") return question.answers[pick].points;
  if (pick === "miss") return 0;
  return null;
}

function clearFaceoffPick(team) {
  const previous = state.faceoff[team];
  if (typeof previous !== "number") return;
  const question = currentQuestion();
  if (question && state.revealed[previous]) {
    state.revealed[previous] = false;
    state.roundPoints = Math.max(0, state.roundPoints - scored(question.answers[previous].points));
  }
}

function settleFaceoff(index, points) {
  const question = currentQuestion();
  const blue = faceoffPoints(state.faceoff.a, question);
  const red = faceoffPoints(state.faceoff.b, question);
  if (blue == null || red == null || blue === red) {
    bump("reveal", { index, points, tie: blue != null && blue === red });
    return;
  }
  const winner = blue > red ? "a" : "b";
  state.control = winner;
  state.phase = "play";
  state.faceoff.turn = null;
  bump("faceoff-win", { index, points: scored(Math.max(blue, red)), team: winner });
}

function presentQuestion(question, maskAnswers) {
  if (!question || state.phase === "title" || state.phase === "done") return null;
  return {
    id: question.id,
    text: question.text,
    answers: question.answers.map((answer, index) => {
      const revealed = Boolean(state.revealed[index]);
      if (maskAnswers && !revealed) {
        return { revealed: false, text: "", points: null };
      }
      return {
        revealed,
        text: answer.text,
        points: scored(answer.points)
      };
    })
  };
}

function snapshot(maskAnswers) {
  const question = currentQuestion();
  return {
    phase: state.phase,
    teams: {
      a: { name: state.teams.a.name, score: state.teams.a.score },
      b: { name: state.teams.b.name, score: state.teams.b.score }
    },
    control: state.control,
    strikes: state.strikes,
    roundPoints: state.roundPoints,
    roundWinner: state.roundWinner,
    questionIndex: state.questionIndex,
    questionCount: questionLimit(),
    pack: {
      index: state.packIndex || 0,
      count: PACKS.length,
      name: packAt(state.packIndex || 0).name,
      nextName: packAt((state.packIndex || 0) + 1).name
    },
    pointFactor: pointFactor(),
    roundId: state.roundId,
    leader: leaderOf(),
    faceoff: {
      a: state.faceoff.a,
      b: state.faceoff.b,
      turn: state.faceoff.turn,
      lockUntil: state.faceoff.lockUntil || 0
    },
    question: presentQuestion(question, maskAnswers),
    questions: maskAnswers
      ? undefined
      : state.questions.map((item) => ({
        id: item.id,
        text: item.text,
        count: item.answers.length
      })),
    event: state.event ? Object.assign({}, state.event) : null
  };
}

function getHostFeudState() {
  return snapshot(false);
}

function getPublicFeudState() {
  return snapshot(true);
}

function questionLimit() {
  const total = state.questions.length;
  const limit = Number(state.questionLimit);
  if (!Number.isInteger(limit) || limit < 1) return total;
  return Math.min(limit, total);
}

function feudSetQuestionLimit(count) {
  const total = state.questions.length;
  const n = Number.parseInt(count, 10);
  if (!Number.isInteger(n) || n < 1 || n > total) {
    throw new Error(`Choisis de 1 à ${total} questions.`);
  }
  if (state.phase !== "title" && state.phase !== "done" && n < state.questionIndex + 1) {
    throw new Error("La partie a déjà dépassé ce nombre.");
  }
  state.questionLimit = n;
  bump("questions");
}

function feudStart() {
  state.teams.a.score = 0;
  state.teams.b.score = 0;
  state.questionIndex = 0;
  beginRound();
  bump("question");
}

function feudStartNextPack() {
  if (state.phase !== "done" && state.phase !== "title") {
    throw new Error("Termine la partie avant d'en changer.");
  }
  const names = {
    a: state.teams.a.name,
    b: state.teams.b.name
  };
  const next = ((state.packIndex || 0) + 1) % PACKS.length;
  const pack = packAt(next);
  state.packIndex = next;
  state.questions = cloneQuestions(pack.questions);
  state.questionLimit = pack.questions.length;
  state.teams.a.name = names.a;
  state.teams.b.name = names.b;
  state.teams.a.score = 0;
  state.teams.b.score = 0;
  state.questionIndex = 0;
  if (state.phase === "title") {
    state.revealed = [];
    state.strikes = 0;
    state.roundPoints = 0;
    state.control = null;
    state.roundWinner = null;
    state.faceoff = { a: null, b: null, turn: null, lockUntil: 0 };
    bump("questions");
    return;
  }
  beginRound();
  bump("question");
}

function feudFaceoffTurn(teamId) {
  const team = assertTeam(teamId);
  const question = currentQuestion();
  if (state.phase !== "faceoff") {
    throw new Error("La mise en jeu est terminée.");
  }
  const blue = faceoffPoints(state.faceoff.a, question);
  const red = faceoffPoints(state.faceoff.b, question);
  if (blue != null || red != null) {
    throw new Error("Le droit de réplique est déjà à l'autre famille.");
  }
  if (state.faceoff.turn && state.faceoff.turn !== team) return;
  state.faceoff.turn = team;
  state.faceoff.lockUntil = 0;
  bump("control", { team });
}

function passFaceoffTurn(team) {
  const question = currentQuestion();
  const other = otherTeam(team);
  if (faceoffPoints(state.faceoff[other], question) == null) {
    state.faceoff.turn = other;
  }
}

function feudFaceoffPick(teamId, index) {
  const team = assertTeam(teamId);
  const i = Number(index);
  const question = currentQuestion();
  if (state.phase !== "faceoff") {
    throw new Error("La mise en jeu est terminée.");
  }
  if (!question || !Number.isInteger(i) || !question.answers[i]) {
    throw new Error("Réponse invalide.");
  }
  if (state.faceoff.turn !== team) {
    throw new Error(`Appuie sur 1 pour ${state.teams.a.name}, ou 2 pour ${state.teams.b.name}.`);
  }
  if (state.faceoff[otherTeam(team)] === i) {
    throw new Error("L'autre famille a déjà cette réponse.");
  }
  if (state.faceoff[team] === i) return;

  clearFaceoffPick(team);
  state.revealed[i] = true;
  state.roundPoints += scored(question.answers[i].points);
  state.faceoff[team] = i;
  passFaceoffTurn(team);
  settleFaceoff(i, question.answers[i].points);
}

function feudFaceoffMiss(teamId) {
  const team = assertTeam(teamId);
  if (state.phase !== "faceoff") {
    throw new Error("La mise en jeu est terminée.");
  }
  if (state.faceoff.turn !== team) {
    throw new Error("Ce n'est pas le tour de cette famille.");
  }
  clearFaceoffPick(team);
  state.faceoff[team] = "miss";
  passFaceoffTurn(team);
  settleFaceoff(null, 0);
  if (state.event && state.event.type === "reveal") state.event.type = "strike";
}

function feudGiveControl(teamId) {
  const team = assertTeam(teamId);
  const question = currentQuestion();
  if (state.phase !== "faceoff") {
    throw new Error("La mise en jeu est déjà partie.");
  }
  const blue = faceoffPoints(state.faceoff.a, question);
  const red = faceoffPoints(state.faceoff.b, question);
  if (blue == null || red == null || blue !== red) {
    throw new Error("Chaque famille donne une réponse. La plus haute gagne.");
  }
  state.control = team;
  const cleared = state.revealed.length > 0 && state.revealed.every(Boolean);
  if (cleared) {
    state.teams[team].score += state.roundPoints;
    state.roundWinner = team;
    state.phase = "result";
    bump("award", { team, points: state.roundPoints });
    return;
  }
  state.phase = "play";
  bump("control", { team });
}

function feudSwapControl() {
  if (state.phase !== "play" || !state.control) {
    throw new Error("Impossible de changer de famille maintenant.");
  }
  state.control = otherTeam(state.control);
  bump("control", { team: state.control });
}

function feudReveal(index) {
  const i = Number(index);
  const question = currentQuestion();
  if (!question || !Number.isInteger(i) || !question.answers[i]) {
    throw new Error("Réponse invalide.");
  }
  if (state.phase !== "play" && state.phase !== "steal") {
    throw new Error("Pendant la mise en jeu, associe la réponse à une famille.");
  }
  if (state.revealed[i]) {
    throw new Error("Cette réponse est déjà au tableau.");
  }

  state.revealed[i] = true;
  state.roundPoints += scored(question.answers[i].points);

  if (state.phase === "steal") {
    const thief = otherTeam(state.control);
    state.teams[thief].score += state.roundPoints;
    state.roundWinner = thief;
    state.phase = "result";
    bump("steal-win", { team: thief, points: state.roundPoints, index: i });
    return;
  }

  const cleared = state.revealed.every(Boolean);
  if (cleared) {
    state.teams[state.control].score += state.roundPoints;
    state.roundWinner = state.control;
    state.phase = "result";
    bump("award", { team: state.control, points: state.roundPoints, index: i });
    return;
  }

  bump("reveal", { index: i, points: scored(question.answers[i].points) });
}

function feudHideAnswer(index) {
  const i = Number(index);
  const question = currentQuestion();
  if (state.phase !== "play" && state.phase !== "faceoff") {
    throw new Error("On retire une réponse seulement pendant la mise en jeu ou le jeu.");
  }
  if (!question || !Number.isInteger(i) || !state.revealed[i]) {
    throw new Error("Cette réponse n'est pas au tableau.");
  }
  state.revealed[i] = false;
  state.roundPoints = Math.max(0, state.roundPoints - scored(question.answers[i].points));
  if (state.faceoff.a === i) {
    state.faceoff.a = null;
    if (state.phase === "faceoff") state.faceoff.turn = "a";
  }
  if (state.faceoff.b === i) {
    state.faceoff.b = null;
    if (state.phase === "faceoff") state.faceoff.turn = "b";
  }
  bump("hide", { index: i });
}

function feudStrike() {
  if (state.phase !== "play") {
    throw new Error("Les erreurs comptent quand une famille joue.");
  }
  if (state.strikes >= 3) {
    throw new Error("Il y a déjà 3 erreurs.");
  }
  state.strikes += 1;
  if (state.strikes >= 3) {
    state.phase = "steal";
    bump("steal-start", { strikes: state.strikes });
    return;
  }
  bump("strike", { strikes: state.strikes });
}

function feudUndoStrike() {
  if (state.strikes <= 0) {
    throw new Error("Aucune erreur à retirer.");
  }
  if (state.phase !== "play" && state.phase !== "steal") {
    throw new Error("La manche est déjà donnée.");
  }
  state.strikes -= 1;
  if (state.phase === "steal") state.phase = "play";
  bump("undo-strike", { strikes: state.strikes });
}

function feudStealMiss() {
  if (state.phase !== "steal") {
    throw new Error("Ce n'est pas le moment du vol.");
  }
  if (!state.control) throw new Error("Aucune famille en jeu.");
  state.teams[state.control].score += state.roundPoints;
  state.roundWinner = state.control;
  state.phase = "result";
  bump("steal-miss", { team: state.control, points: state.roundPoints });
}

function feudBank() {
  if (state.phase !== "play" || !state.control) {
    throw new Error("Termine d'abord le vol, ou lance la manche.");
  }
  if (state.roundPoints <= 0) {
    throw new Error("Aucun point à donner pour l'instant.");
  }
  state.teams[state.control].score += state.roundPoints;
  state.roundWinner = state.control;
  state.phase = "result";
  bump("award", { team: state.control, points: state.roundPoints });
}

function feudNext() {
  if (state.phase === "title") {
    throw new Error("Lance la partie d'abord.");
  }
  if (state.questionIndex >= questionLimit() - 1) {
    state.phase = "done";
    state.control = null;
    const winner = leaderOf();
    bump("done", {
      team: winner,
      points: winner ? state.teams[winner].score : state.teams.a.score
    });
    return;
  }
  state.questionIndex += 1;
  beginRound();
  bump("question");
}

function feudGoTo(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || !state.questions[i]) {
    throw new Error("Question introuvable.");
  }
  state.questionIndex = i;
  beginRound();
  bump("question");
}

function feudReplayRound() {
  if (state.phase === "title" || state.phase === "done") {
    throw new Error("Lance une question d'abord.");
  }
  if (state.phase === "result" && state.roundWinner) {
    state.teams[state.roundWinner].score = Math.max(
      0,
      state.teams[state.roundWinner].score - state.roundPoints
    );
  }
  beginRound();
  bump("question");
}

function feudSetTeamName(teamId, name) {
  const team = assertTeam(teamId);
  state.teams[team].name = cleanName(name, team === "a" ? "Famille bleue" : "Famille rouge");
  bump("score");
}

function feudAddScore(teamId, delta) {
  const team = assertTeam(teamId);
  const amount = Number(delta);
  if (!Number.isFinite(amount) || Math.abs(amount) > 500) {
    throw new Error("Ajustement invalide.");
  }
  state.teams[team].score = Math.max(0, Math.round(state.teams[team].score + amount));
  bump("score");
}

function cleanAnswerText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 42);
}

function normalizeQuestion(text, rawAnswers) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (cleanText.length < 8) {
    throw new Error("Écris une question plus complète.");
  }
  if (!Array.isArray(rawAnswers)) {
    throw new Error("Ajoute des réponses.");
  }

  const answers = rawAnswers
    .map((answer, index) => {
      const label = cleanAnswerText(answer?.text);
      if (!label) return null;
      const points = Number.parseInt(answer?.points, 10);
      if (!Number.isInteger(points) || points < 1 || points > 100) {
        throw new Error(`Points invalides pour « ${label} » (1 à 100).`);
      }
      return { text: label, points, index };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .map(({ text: label, points }) => ({ text: label, points }));

  if (answers.length < MIN_ANSWERS) {
    throw new Error(`Il faut au moins ${MIN_ANSWERS} réponses.`);
  }
  if (answers.length > MAX_ANSWERS) {
    throw new Error(`Maximum ${MAX_ANSWERS} réponses.`);
  }

  customSeq += 1;
  return {
    id: `custom-${customSeq}`,
    text: cleanText,
    answers
  };
}

function feudAddQuestion(payload) {
  const question = normalizeQuestion(payload?.text, payload?.answers);
  const wasAll = state.questionLimit >= state.questions.length;
  state.questions.push(question);
  if (wasAll) state.questionLimit = state.questions.length;
  if (payload?.play) {
    state.questionIndex = state.questions.length - 1;
    beginRound();
    bump("question");
    return;
  }
  bump("questions");
}

function feudSilence() {
  bump("silence");
}

function feudResetScores() {
  state.teams.a.score = 0;
  state.teams.b.score = 0;
  bump("score");
}

function feudResetGame() {
  const names = {
    a: state.teams.a.name,
    b: state.teams.b.name
  };
  const questions = state.questions;
  const limit = state.questionLimit;
  const packIndex = state.packIndex || 0;
  state = createState();
  state.packIndex = packIndex;
  state.questions = questions;
  state.questionLimit = Math.min(limit, questions.length);
  state.teams.a.name = names.a;
  state.teams.b.name = names.b;
  bump("reset");
}

module.exports = {
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
};
