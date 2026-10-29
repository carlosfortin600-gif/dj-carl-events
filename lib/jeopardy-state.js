const TEAM_DEFAULTS = ["Concurrent 1", "Concurrent 2", "Concurrent 3", "Concurrent 4"];

function pair(clue, answer) {
  return { clue, answer };
}

function defaultRounds() {
  return [
    {
      name: "Manche 1",
      values: [100, 200, 300, 400, 500],
      categories: [
        {
          name: "Hits de party",
          clues: [
            pair("Ces quatre lettres se crient les bras en l’air.", "YMCA"),
            pair("Earth, Wind & Fire rappelle ce neuvième mois de l’année.", "September"),
            pair("Nile Rodgers et Bernard Edwards formaient ce groupe disco.", "Chic"),
            pair("Ce club new-yorkais ouvre en 1977 au 254 West 54th Street.", "Studio 54"),
            pair("En 1978, « I Will Survive » est d’abord la face B de ce single.", "Substitute")
          ]
        },
        {
          name: "Québec",
          clues: [
            pair("Frites, fromage en grains et sauce : le classique du vendredi.", "La poutine"),
            pair("Ce fleuve baigne Montréal et Québec.", "Le Saint-Laurent"),
            pair("Slogan de Jean Lesage à l’élection de 1962.", "Maîtres chez nous"),
            pair("Ce traité de 1701 réunit une quarantaine de nations à Montréal.", "La Grande Paix de Montréal"),
            pair("Cet accord de 1987, jamais ratifié, parlait d’une société distincte.", "L’accord du lac Meech")
          ]
        },
        {
          name: "Mariage",
          dailyRow: 3,
          clues: [
            pair("La mariée le lance, les célibataires essaient de l’attraper.", "Le bouquet"),
            pair("Les invités tapent sur leur verre pour provoquer ça.", "Un baiser"),
            pair("La mariée tourne le dos et la lance après le bouquet.", "La jarretière"),
            pair("Au Québec, ce document notarié fixe les biens des époux.", "Le contrat de mariage"),
            pair("Sans contrat, c’est le régime matrimonial par défaut au Québec.", "La société d’acquêts")
          ]
        },
        {
          name: "Années 80",
          clues: [
            pair("Une DeLorean ramène ce héros en 1955.", "Retour vers le futur"),
            pair("Cet artiste de Minneapolis signe « Purple Rain » en 1984.", "Prince"),
            pair("Le 13 juillet 1985, ce concert se tient à Londres et à Philadelphie.", "Live Aid"),
            pair("L’équipe de Luc Montagnier identifie ce virus en 1983.", "Le VIH"),
            pair("À la naissance, George Michael porte ce nom complet.", "Georgios Kyriacos Panayiotou")
          ]
        },
        {
          name: "À table",
          clues: [
            pair("Ce sirop doré coule sur les crêpes, au Québec.", "Le sirop d’érable"),
            pair("Cette tourte de viande est le classique du réveillon.", "La tourtière"),
            pair("Ce champignon se chasse au chien ou au cochon, en Périgord.", "La truffe"),
            pair("Émulsion de jaunes d’œufs et de beurre clarifié.", "La hollandaise"),
            pair("Cette réaction chimique fait brunir la viande à la cuisson.", "La réaction de Maillard")
          ]
        }
      ]
    },
    {
      name: "Manche 2",
      values: [200, 400, 600, 800, 1000],
      categories: [
        {
          name: "Années 2000",
          dailyRow: 4,
          clues: [
            pair("Cette encyclopédie en ligne est lancée le 15 janvier 2001.", "Wikipédia"),
            pair("Cette banque américaine fait faillite le 15 septembre 2008.", "Lehman Brothers"),
            pair("En avril 2003, on annonce la séquence complète de ceci.", "Le génome humain"),
            pair("Bram Cohen crée ce protocole de partage de fichiers en 2001.", "BitTorrent"),
            pair("Ce mathématicien russe refuse la médaille Fields en 2006.", "Grigori Perelman")
          ]
        },
        {
          name: "Célébrités",
          clues: [
            pair("Deux Nobel : physique en 1903, chimie en 1911.", "Marie Curie"),
            pair("Nobel 1982. Il a écrit « Cent ans de solitude ».", "Gabriel García Márquez"),
            pair("Elle publie « Le Deuxième Sexe » en 1949.", "Simone de Beauvoir"),
            pair("Sa pièce « En attendant Godot » est créée à Paris en 1953.", "Samuel Beckett"),
            pair("Cet Anglais aveugle dicte « Le Paradis perdu ».", "John Milton")
          ]
        },
        {
          name: "Cinéma",
          clues: [
            pair("Premier film en langue étrangère à gagner l’Oscar du meilleur film.", "Parasite"),
            pair("« Citizen Kane », en 1941, est son premier film.", "Orson Welles"),
            pair("Il réalise « Les Sept Samouraïs » en 1954.", "Akira Kurosawa"),
            pair("Monteuse attitrée de Martin Scorsese.", "Thelma Schoonmaker"),
            pair("Il théorise le montage des attractions au cinéma.", "Sergueï Eisenstein")
          ]
        },
        {
          name: "Sport",
          dailyRow: 3,
          clues: [
            pair("Quatre ors au sprint à Berlin, en 1936.", "Jesse Owens"),
            pair("Sept ors à la natation, à Munich, en 1972.", "Mark Spitz"),
            pair("Il gagne le Tour de France cinq fois de suite, de 1991 à 1995.", "Miguel Indurain"),
            pair("Elle réalise le Grand Chelem et l’or olympique en 1988.", "Steffi Graf"),
            pair("Cette ville remplace Denver pour les Jeux d’hiver de 1976.", "Innsbruck")
          ]
        },
        {
          name: "Expressions",
          clues: [
            pair("Complète : c’est du ___, quand c’est trop facile.", "Gâteau"),
            pair("Tomber dans les pommes, ça veut dire ça.", "S’évanouir"),
            pair("« Courir sur le haricot », ça veut dire ça.", "Taper sur les nerfs"),
            pair("« Pas de quoi fouetter un chat », ça veut dire ça.", "Ce n’est pas grave"),
            pair("« Prendre des vessies pour des lanternes », ça veut dire ça.", "Se tromper complètement")
          ]
        }
      ]
    }
  ];
}

const FINALE = {
  category: "Sciences",
  clue: "Son symbole est W. En suédois, son nom veut dire « pierre lourde ».",
  answer: "Le tungstène"
};

function createState() {
  return {
    phase: "title",
    teamCount: 4,
    teams: TEAM_DEFAULTS.map((name) => ({ name, score: 0 })),
    control: 0,
    respondent: null,
    roundIndex: 0,
    rounds: materialize(defaultRounds()),
    active: null,
    attempts: [],
    wager: null,
    resolved: false,
    answerVisible: false,
    finale: Object.assign({}, FINALE),
    finaleWagers: [null, null, null, null],
    finaleLocked: false,
    finaleJudged: [null, null, null, null],
    showQr: false,
    themeOn: false,
    rankingOn: false,
    eventSerial: 0,
    event: null
  };
}

let state = createState();

function materialize(rounds) {
  return rounds.map((round) => ({
    name: round.name,
    values: round.values.slice(),
    categories: round.categories.map((category) => ({
      name: category.name,
      cells: category.clues.map((item, row) => ({
        value: round.values[row],
        clue: item.clue,
        answer: item.answer,
        daily: category.dailyRow === row,
        used: false
      }))
    }))
  }));
}

function bump(type, extra) {
  state.eventSerial += 1;
  state.event = Object.assign({ n: state.eventSerial, type }, extra || {});
}

function activeTeams() {
  return state.teams.slice(0, state.teamCount);
}

function assertTeam(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0 || n >= state.teamCount) {
    throw new Error("Concurrent inconnu.");
  }
  return n;
}

function currentRound() {
  return state.rounds[state.roundIndex] || null;
}

function cellAt(col, row) {
  const round = currentRound();
  if (!round || !round.categories[col] || !round.categories[col].cells[row]) {
    throw new Error("Case inconnue.");
  }
  return round.categories[col].cells[row];
}

function topValue(round) {
  return Math.max.apply(null, round.values);
}

function maxDailyWager(teamIndex) {
  const round = currentRound();
  const score = state.teams[teamIndex].score;
  return Math.max(score, topValue(round), 0);
}

function maxFinaleWager(teamIndex) {
  return Math.max(0, state.teams[teamIndex].score);
}

function parseWager(value, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("La mise doit être un nombre positif.");
  }
  if (n > max) {
    throw new Error(`La mise maximale est ${max}.`);
  }
  return n;
}

function leaders() {
  const teams = activeTeams();
  const best = Math.max.apply(null, teams.map((team) => team.score));
  return teams
    .map((team, index) => ({ index, name: team.name, score: team.score }))
    .filter((team) => team.score === best);
}

function giveControlToLeader() {
  const group = leaders();
  if (group.some((team) => team.index === state.control)) return;
  state.control = group[0].index;
}

function presentCategories(mask) {
  const round = currentRound();
  if (!round) return [];
  return round.categories.map((category) => ({
    name: category.name,
    cells: category.cells.map((cell) => {
      const base = { value: cell.value, used: cell.used };
      if (!mask) {
        base.clue = cell.clue;
        base.answer = cell.answer;
        base.daily = cell.daily;
      }
      return base;
    })
  }));
}

function presentClue(mask) {
  if (!state.active) return null;
  const cell = cellAt(state.active.col, state.active.row);
  const category = currentRound().categories[state.active.col];
  const payload = {
    category: category.name,
    value: cell.value,
    text: cell.clue,
    daily: cell.daily,
    wager: state.wager,
    resolved: state.resolved
  };
  if (!mask || state.answerVisible) payload.answer = cell.answer;
  return payload;
}

function presentFinale(mask) {
  const clueOnAir = state.phase === "finale-clue" || state.phase === "finale-reveal" || state.phase === "winner";
  const answerOnAir = state.answerVisible && (state.phase === "finale-reveal" || state.phase === "winner");
  return {
    category: state.finale.category,
    clue: !mask || clueOnAir ? state.finale.clue : null,
    answer: !mask || answerOnAir ? state.finale.answer : null,
    locked: state.finaleLocked,
    wagers: !mask || answerOnAir ? state.finaleWagers.slice(0, state.teamCount) : null,
    judged: !mask || answerOnAir
      ? state.finaleJudged.slice(0, state.teamCount)
      : state.finaleJudged.slice(0, state.teamCount).map(() => null)
  };
}

function snapshot(mask) {
  const round = currentRound();
  return {
    phase: state.phase,
    teamCount: state.teamCount,
    teams: activeTeams().map((team, index) => ({
      name: team.name,
      score: team.score,
      control: index === state.control,
      answering: index === state.respondent
    })),
    control: state.control,
    respondent: state.respondent,
    roundIndex: state.roundIndex,
    roundName: round ? round.name : "",
    categories: presentCategories(mask),
    clue: state.phase === "wager" || state.phase === "clue" ? presentClue(mask) : null,
    attempts: state.attempts.slice(0, state.teamCount),
    finale: presentFinale(mask),
    boardDone: boardClear(),
    showQr: state.showQr,
    themeOn: state.themeOn,
    rankingOn: state.rankingOn,
    winners: state.phase === "winner" ? leaders() : [],
    event: state.event ? Object.assign({}, state.event) : null
  };
}

function getHostJeopardyState() {
  return snapshot(false);
}

function getPublicJeopardyState() {
  return snapshot(true);
}

function jeopardySetTeamCount(count) {
  const ended = state.phase === "board" && boardClear();
  if (state.phase !== "title" && !ended) {
    throw new Error("Le nombre de concurrents se choisit au début ou à la fin d’une manche.");
  }
  const n = Number.parseInt(count, 10);
  if (n < 2 || n > 4) throw new Error("Choisis de 2 à 4 concurrents.");
  state.teamCount = n;
  if (state.control >= n) state.control = 0;
  bump("teams");
}

function jeopardySetTeamName(index, name) {
  const team = assertTeam(index);
  const clean = String(name || "").trim().slice(0, 28);
  if (!clean) throw new Error("Le nom est vide.");
  state.teams[team].name = clean;
  bump("teams");
}

function jeopardyAddScore(index, delta) {
  const team = assertTeam(index);
  const n = Number.parseInt(delta, 10);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 5000) {
    throw new Error("Ajuste le pointage de 100 à 5000.");
  }
  state.teams[team].score += n;
  bump("score", { team, delta: n });
}

function jeopardySetControl(index) {
  if (state.phase !== "board" && state.phase !== "title") {
    throw new Error("La main se donne sur le tableau.");
  }
  state.control = assertTeam(index);
  bump("control", { team: state.control });
}

function jeopardyStart() {
  state.teams.forEach((team) => {
    team.score = 0;
  });
  state.roundIndex = 0;
  state.rounds = materialize(defaultRounds());
  state.control = 0;
  clearActive();
  state.finaleWagers = state.teams.map(() => null);
  state.finaleLocked = false;
  state.finaleJudged = state.teams.map(() => null);
  state.phase = "board";
  bump("start");
}

function clearActive() {
  state.active = null;
  state.attempts = [];
  state.wager = null;
  state.resolved = false;
  state.answerVisible = false;
  state.respondent = null;
}

function jeopardyPick(col, row) {
  if (state.phase !== "board") throw new Error("Reviens au tableau pour choisir une case.");
  const c = Number(col);
  const r = Number(row);
  const cell = cellAt(c, r);
  if (cell.used) throw new Error("Cette case est déjà jouée.");
  state.active = { col: c, row: r };
  state.attempts = activeTeams().map(() => false);
  state.wager = null;
  state.resolved = false;
  state.answerVisible = false;
  state.respondent = state.control;
  if (cell.daily) {
    state.phase = "wager";
    bump("daily", { team: state.control });
    return;
  }
  state.phase = "clue";
  bump("clue");
}

function jeopardySetWager(amount) {
  if (state.phase !== "wager" || !state.active) {
    throw new Error("Aucune mise de double quotidien en cours.");
  }
  state.wager = parseWager(amount, maxDailyWager(state.control));
  state.phase = "clue";
  bump("wager", { team: state.control, delta: state.wager });
}

function stakeAmount() {
  if (state.active && cellAt(state.active.col, state.active.row).daily) {
    if (state.wager == null) throw new Error("La mise n’est pas confirmée.");
    return state.wager;
  }
  return cellAt(state.active.col, state.active.row).value;
}

function finishClue() {
  const cell = cellAt(state.active.col, state.active.row);
  cell.used = true;
  state.resolved = true;
  state.answerVisible = true;
}

function jeopardyCorrect(index) {
  const team = assertTeam(index);
  if (state.phase !== "clue" || !state.active) throw new Error("Aucun indice en cours.");
  if (state.resolved) throw new Error("L’indice est déjà réglé.");
  if (state.attempts[team]) throw new Error("Ce concurrent a déjà répondu.");
  if (team !== state.respondent) throw new Error("Ce n’est pas son tour.");
  if (cellAt(state.active.col, state.active.row).daily && team !== state.control) {
    throw new Error("Seul le concurrent du double peut répondre.");
  }
  const delta = stakeAmount();
  state.teams[team].score += delta;
  state.control = team;
  finishClue();
  bump("correct", { team, delta });
}

function jeopardyWrong(index) {
  const team = assertTeam(index);
  if (state.phase !== "clue" || !state.active) throw new Error("Aucun indice en cours.");
  if (state.resolved) throw new Error("L’indice est déjà réglé.");
  if (state.attempts[team]) throw new Error("Ce concurrent a déjà répondu.");
  if (team !== state.respondent) throw new Error("Ce n’est pas son tour.");
  const daily = cellAt(state.active.col, state.active.row).daily;
  if (daily && team !== state.control) {
    throw new Error("Seul le concurrent du double peut répondre.");
  }
  const delta = stakeAmount();
  state.teams[team].score -= delta;
  state.attempts[team] = true;
  const everyoneMissed = state.attempts.slice(0, state.teamCount).every(Boolean);
  if (daily || everyoneMissed) finishClue();
  else state.respondent = null;
  bump("wrong", { team, delta: -delta });
}

function jeopardyBuzz(index) {
  const team = assertTeam(index);
  if (state.phase !== "clue" || !state.active) throw new Error("Aucun indice en cours.");
  if (state.resolved) throw new Error("L’indice est déjà réglé.");
  if (state.respondent != null) throw new Error("Un concurrent est déjà en train de répondre.");
  if (state.attempts[team]) throw new Error("Ce concurrent a déjà répondu.");
  if (cellAt(state.active.col, state.active.row).daily) {
    throw new Error("Seul le concurrent du double peut répondre.");
  }
  state.respondent = team;
  bump("buzz", { team });
}

function jeopardyReveal() {
  if (state.phase === "clue" && state.active) {
    finishClue();
    bump("reveal");
    return;
  }
  if (state.phase === "finale-clue") {
    state.answerVisible = true;
    state.phase = "finale-reveal";
    bump("reveal");
    return;
  }
  throw new Error("Rien à révéler.");
}

function jeopardyCloseClue() {
  if (state.phase === "board") return;
  if (state.phase !== "clue" || !state.resolved) {
    throw new Error("Règle l’indice avant de revenir au tableau.");
  }
  clearActive();
  state.phase = "board";
  bump("board");
}

function jeopardyCancel() {
  if (state.phase !== "clue" && state.phase !== "wager") {
    throw new Error("Aucune case à annuler.");
  }
  if (state.attempts.some(Boolean) || state.resolved) {
    throw new Error("Un concurrent a déjà répondu.");
  }
  clearActive();
  state.phase = "board";
  bump("board");
}

function boardClear() {
  const round = currentRound();
  if (!round) return true;
  return round.categories.every((category) => category.cells.every((cell) => cell.used));
}

function jeopardyToggleTheme(on) {
  state.themeOn = on == null ? !state.themeOn : Boolean(on);
  bump(state.themeOn ? "theme" : "theme-stop");
}

function jeopardyShowRanking(on) {
  if (state.phase === "title" || state.phase === "winner" || String(state.phase).startsWith("finale")) {
    throw new Error("Le classement s’affiche pendant la manche.");
  }
  if (state.phase === "board" && boardClear()) {
    state.rankingOn = false;
    bump("board");
    return;
  }
  state.rankingOn = on == null ? !state.rankingOn : Boolean(on);
  bump(state.rankingOn ? "ranking" : "board");
}

function jeopardyEndRound() {
  if (state.phase === "title" || state.phase === "winner" || String(state.phase).startsWith("finale")) {
    throw new Error("Aucune manche à terminer.");
  }
  const round = currentRound();
  if (!round) throw new Error("Aucune manche en cours.");
  round.categories.forEach((category) => {
    category.cells.forEach((cell) => {
      cell.used = true;
    });
  });
  clearActive();
  state.rankingOn = false;
  state.phase = "board";
  bump("round-end");
}

function jeopardyClearScores() {
  if (state.phase !== "board" || !boardClear()) {
    throw new Error("Les points se remettent à zéro à la fin de la manche.");
  }
  activeTeams().forEach((team) => {
    team.score = 0;
  });
  bump("score");
}

function jeopardyNextRound() {
  if (state.phase !== "board") throw new Error("Reviens au tableau d’abord.");
  if (!boardClear()) throw new Error("Termine la manche d’abord.");
  state.themeOn = false;
  state.rankingOn = false;
  if (state.roundIndex === 0) {
    state.roundIndex = 1;
    clearActive();
    giveControlToLeader();
    state.phase = "board";
    bump("round");
    return;
  }
  if (state.roundIndex === 1) {
    clearActive();
    state.finaleWagers = activeTeams().map(() => null);
    state.finaleLocked = false;
    state.finaleJudged = activeTeams().map(() => null);
    state.answerVisible = false;
    state.phase = "finale-wager";
    bump("finale");
    return;
  }
  throw new Error("La finale est déjà commencée.");
}

function jeopardyLockFinaleWagers(wagers) {
  if (state.phase !== "finale-wager") throw new Error("Les mises de la finale sont fermées.");
  if (state.finaleLocked) throw new Error("Les mises sont déjà verrouillées.");
  const list = Array.isArray(wagers) ? wagers : [];
  state.finaleWagers = activeTeams().map((_, index) => parseWager(list[index], maxFinaleWager(index)));
  state.finaleLocked = true;
  bump("wager");
}

function jeopardyShowFinaleClue() {
  if (state.phase !== "finale-wager" || !state.finaleLocked) {
    throw new Error("Verrouille d’abord les mises.");
  }
  state.answerVisible = false;
  state.phase = "finale-clue";
  bump("clue");
}

function jeopardyFinaleJudge(index, correct) {
  if (state.phase !== "finale-reveal") {
    throw new Error("Montre d’abord la réponse.");
  }
  const team = assertTeam(index);
  const wager = state.finaleWagers[team];
  if (!Number.isInteger(wager)) throw new Error("Mise manquante.");
  const next = Boolean(correct);
  const prev = state.finaleJudged[team];
  if (prev === true) state.teams[team].score -= wager;
  if (prev === false) state.teams[team].score += wager;
  if (next) state.teams[team].score += wager;
  else state.teams[team].score -= wager;
  state.finaleJudged[team] = next;
  bump(next ? "correct" : "wrong", { team, delta: next ? wager : -wager });
}

function jeopardyShowQr(visible) {
  state.showQr = Boolean(visible);
  bump("qr");
}

function jeopardyShowWinner() {
  if (state.phase !== "finale-reveal") throw new Error("La finale n’est pas terminée.");
  if (state.finaleJudged.slice(0, state.teamCount).some((value) => value == null)) {
    throw new Error("Juge chaque concurrent avant d’afficher le gagnant.");
  }
  state.phase = "winner";
  bump("winner");
}

function jeopardyReset() {
  const count = state.teamCount;
  const names = state.teams.map((team) => team.name);
  state = createState();
  state.teamCount = count;
  names.forEach((name, index) => {
    if (state.teams[index] && name) state.teams[index].name = name;
  });
  bump("reset");
}

module.exports = {
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
  jeopardyReset,
  boardClear
};
