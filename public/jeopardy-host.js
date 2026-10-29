(function initJeopardyHost() {
  const panel = document.getElementById("panel");
  const stage = document.getElementById("stage");
  const socket = io();
  let game = null;
  let seen = 0;
  let flashTeam = null;
  let soundMine = false;
  let themeAudio = null;
  let themeWas = false;
  let remoteSound = true;
  let showLevel = 1;

  function syncTheme(on) {
    const next = !!on && remoteSound && showLevel > 0;
    if (!themeAudio) {
      themeAudio = new Audio("/jeopardy-theme.mp3");
      themeAudio.loop = true;
    }
    try { themeAudio.volume = showLevel; } catch (error) { /* pas encore prêt */ }
    if (!next) {
      themeWas = false;
      themeAudio.pause();
      try { themeAudio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
      return;
    }
    if (themeWas && !themeAudio.paused) return;
    try { themeAudio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
    const pending = themeAudio.play();
    themeWas = true;
    if (pending && pending.then) {
      pending.then(() => { themeWas = true; }).catch(() => { themeWas = false; });
    }
  }

  function send(event, payload) {
    soundMine = true;
    socket.emit(event, payload || {}, (res) => {
      if (!res || !res.ok) {
        soundMine = false;
        const line = document.getElementById("jep-error");
        if (line) line.textContent = (res && res.error) || "Action refusée.";
        return;
      }
      apply(res.state);
    });
  }

  function play(state) {
    const event = state && state.event;
    const mine = soundMine;
    if (!event || event.n === seen) {
      if (mine) soundMine = false;
      return;
    }
    seen = event.n;
    soundMine = false;
    flashTeam = event.team != null ? event.team : null;
    if (!remoteSound || !window.FeudSounds) return;
    if (event.type === "buzz" || event.type === "wrong") FeudSounds.play("strike");
    else if (event.type === "correct" || event.type === "reveal") FeudSounds.play("reveal");
    else if (event.type === "wrong") FeudSounds.play("strike");
    else if (event.type === "daily") FeudSounds.play("award");
    else if (event.type === "winner") FeudSounds.play("done");
  }

  function apply(state) {
    game = state;
    syncTheme(state && state.themeOn);
    play(state);
    render();
  }

  function field(className, value, onCommit) {
    const input = document.createElement("input");
    input.className = className;
    input.value = value;
    input.maxLength = 28;
    input.addEventListener("change", () => onCommit(input.value));
    input.addEventListener("keydown", (event) => event.stopPropagation());
    return input;
  }

  function button(label, className, onClick, disabled) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = label;
    node.disabled = Boolean(disabled);
    node.addEventListener("click", onClick);
    return node;
  }

  function teamCards() {
    const wrap = document.createElement("div");
    wrap.className = "team-row";
    game.teams.forEach((team, index) => {
      const card = document.createElement("div");
      card.className = "team-card team-" + index + (team.control ? " is-control" : "");
      card.appendChild(field("team-name", team.name, (name) => send("jeopardySetTeamName", { index, name })));
      const score = document.createElement("div");
      score.className = "score-line";
      score.appendChild(button("−100", "mini", () => send("jeopardyAddScore", { index, delta: -100 })));
      const strong = document.createElement("strong");
      strong.textContent = JeopardyBoard.points(team.score);
      score.appendChild(strong);
      score.appendChild(button("+100", "mini", () => send("jeopardyAddScore", { index, delta: 100 })));
      card.appendChild(score);
      if (game.phase === "board" || game.phase === "title") {
        card.appendChild(button(team.control ? "À la main" : "Donner la main", "mini wide", () => {
          send("jeopardySetControl", { index });
        }, team.control && game.phase === "board"));
      }
      wrap.appendChild(card);
    });
    return wrap;
  }

  function answerPanel() {
    const wrap = document.createElement("div");
    wrap.className = "judge-list";
    const resolved = game.clue && game.clue.resolved;
    const daily = game.clue && game.clue.daily;
    const respondent = game.respondent;
    if (respondent != null && game.teams[respondent]) {
      const row = document.createElement("div");
      row.className = "judge-row";
      const name = document.createElement("span");
      name.textContent = game.teams[respondent].name + " répond";
      row.appendChild(name);
      row.appendChild(button("Bonne", "ok", () => send("jeopardyCorrect", { index: respondent }), resolved));
      row.appendChild(button("Mauvaise", "bad", () => send("jeopardyWrong", { index: respondent }), resolved));
      wrap.appendChild(row);
      return wrap;
    }
    if (resolved || daily) return wrap;
    const hint = document.createElement("p");
    hint.className = "status";
    hint.textContent = "Qui a buzzé ?";
    wrap.appendChild(hint);
    game.teams.forEach((team, index) => {
      if (game.attempts && game.attempts[index]) return;
      wrap.appendChild(button(team.name, "primary", () => send("jeopardyBuzz", { index })));
    });
    return wrap;
  }

  function finaleJudges() {
    const wrap = document.createElement("div");
    wrap.className = "judge-list";
    const finale = game.finale || {};
    game.teams.forEach((team, index) => {
      const judged = finale.judged ? finale.judged[index] : null;
      const row = document.createElement("div");
      row.className = "judge-row";
      const name = document.createElement("span");
      const wager = finale.wagers && finale.wagers[index] != null ? " · mise " + JeopardyBoard.points(finale.wagers[index]) : "";
      name.textContent = team.name + wager;
      row.appendChild(name);
      row.appendChild(button(judged === true ? "Bonne ✓" : "Bonne", "ok", () => {
        send("jeopardyFinaleJudge", { index, correct: true });
      }, game.phase !== "finale-reveal"));
      row.appendChild(button(judged === false ? "Mauvaise ✓" : "Mauvaise", "bad", () => {
        send("jeopardyFinaleJudge", { index, correct: false });
      }, game.phase !== "finale-reveal"));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function wagerBox(max, onOk) {
    const box = document.createElement("div");
    box.className = "wager-box";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(max);
    input.value = String(Math.max(0, Math.min(max, 500)));
    input.addEventListener("keydown", (event) => event.stopPropagation());
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Mise de 0 à " + JeopardyBoard.points(max) + ".";
    box.appendChild(hint);
    box.appendChild(input);
    box.appendChild(button("Confirmer la mise", "primary", () => onOk(input.value)));
    return box;
  }

  function render() {
    if (!game) return;
    panel.replaceChildren();

    const top = document.createElement("div");
    top.className = "host-top";
    const titles = document.createElement("div");
    const h1 = document.createElement("h1");
    h1.textContent = "Jeopardy";
    const sub = document.createElement("p");
    sub.textContent = "Console animateur. L’écran géant est le projecteur.";
    titles.appendChild(h1);
    titles.appendChild(sub);
    top.appendChild(titles);
    const nav = document.createElement("div");
    nav.className = "host-nav";
    const qr = document.createElement("button");
    qr.type = "button";
    qr.textContent = game.showQr ? "Cacher le QR" : "QR";
    qr.addEventListener("click", () => send("jeopardyShowQr", { visible: !game.showQr }));
    nav.appendChild(qr);
    const screen = document.createElement("a");
    screen.href = "/jeopardy/viewer";
    screen.target = "_blank";
    screen.rel = "noopener";
    screen.textContent = "Écran";
    const home = document.createElement("a");
    home.href = "/";
    home.textContent = "Accueil";
    nav.appendChild(screen);
    nav.appendChild(home);
    top.appendChild(nav);
    panel.appendChild(top);

    const error = document.createElement("p");
    error.id = "jep-error";
    error.className = "msg";
    panel.appendChild(error);

    if (game.phase === "title") {
      const count = document.createElement("div");
      count.className = "count-row";
      [2, 3, 4].forEach((countValue) => {
        count.appendChild(button(countValue + " concurrents", "mini" + (game.teamCount === countValue ? " is-on" : ""), () => {
          send("jeopardySetTeamCount", { count: countValue });
        }));
      });
      panel.appendChild(count);
    }

    panel.appendChild(teamCards());

    const status = document.createElement("p");
    status.className = "status";
    status.textContent = statusText();
    panel.appendChild(status);

    if (game.phase === "wager" && game.clue) {
      let top = 0;
      game.categories.forEach((category) => {
        category.cells.forEach((cell) => {
          if (cell.value > top) top = cell.value;
        });
      });
      const max = Math.max(game.teams[game.control].score, top, 0);
      panel.appendChild(wagerBox(max, (amount) => send("jeopardySetWager", { amount })));
      panel.appendChild(button("Annuler la case", "ghost", () => send("jeopardyCancel")));
    }

    if (game.phase === "clue" && game.clue) {
      panel.appendChild(secretCard(game.clue.category, game.clue.text, game.clue.answer));
      panel.appendChild(answerPanel());
      const actions = document.createElement("div");
      actions.className = "action-row";
      actions.appendChild(button("Montrer la réponse", "primary", () => send("jeopardyReveal"), game.clue.resolved));
      actions.appendChild(button(game.rankingOn ? "Fermer" : "Classement", "primary", () => {
        send("jeopardyShowRanking", { on: !game.rankingOn });
      }));
      actions.appendChild(button("Tableau", "primary", () => send("jeopardyCloseClue"), !game.clue.resolved));
      if (!game.clue.resolved && !(game.attempts || []).some(Boolean)) {
        actions.appendChild(button("Annuler", "ghost", () => send("jeopardyCancel")));
      }
      panel.appendChild(actions);
    }

    if (game.phase === "finale-wager" || game.phase === "finale-clue" || game.phase === "finale-reveal") {
      const finale = game.finale;
      panel.appendChild(secretCard(finale.category, finale.clue, finale.answer));
      if (game.phase === "finale-wager" && !finale.locked) {
        const form = document.createElement("div");
        form.className = "finale-wagers";
        const inputs = [];
        game.teams.forEach((team) => {
          const label = document.createElement("label");
          label.textContent = team.name + " (max " + JeopardyBoard.points(Math.max(0, team.score)) + ")";
          const input = document.createElement("input");
          input.type = "number";
          input.min = "0";
          input.max = String(Math.max(0, team.score));
          input.value = "0";
          input.addEventListener("keydown", (event) => event.stopPropagation());
          label.appendChild(input);
          inputs.push(input);
          form.appendChild(label);
        });
        panel.appendChild(form);
        panel.appendChild(button("Verrouiller les mises", "primary", () => {
          send("jeopardyLockFinaleWagers", { wagers: inputs.map((input) => input.value) });
        }));
      }
      if (game.phase === "finale-wager" && finale.locked) {
        panel.appendChild(button("Afficher l’indice", "primary", () => send("jeopardyShowFinaleClue")));
      }
      if (game.phase === "finale-clue" || game.phase === "finale-reveal") {
        panel.appendChild(button("Montrer la réponse", "primary", () => send("jeopardyReveal"), game.phase === "finale-reveal"));
        panel.appendChild(finaleJudges());
        panel.appendChild(button("Afficher le gagnant", "primary", () => send("jeopardyShowWinner"), game.phase !== "finale-reveal"));
      }
    }

    if (game.phase === "board") {
      const actions = document.createElement("div");
      actions.className = "action-row";
      if (!game.boardDone) {
        actions.appendChild(button(game.rankingOn ? "Fermer" : "Classement", "primary", () => {
          send("jeopardyShowRanking", { on: !game.rankingOn });
        }));
        actions.appendChild(button("Fin de manche", "primary", () => {
          if (window.confirm("Terminer la manche et afficher le classement ?")) send("jeopardyEndRound");
        }));
      } else {
        const nextLabel = game.roundIndex === 0 ? "Manche 2" : "Finale";
        actions.appendChild(button(nextLabel, "primary", () => send("jeopardyNextRound")));
        actions.appendChild(button("Points à zéro", "ghost", () => {
          if (window.confirm("Remettre les points à zéro ?")) send("jeopardyClearScores");
        }));
        [2, 3, 4].forEach((countValue) => {
          actions.appendChild(button(countValue + " concurrents", "mini" + (game.teamCount === countValue ? " is-on" : ""), () => {
            send("jeopardySetTeamCount", { count: countValue });
          }));
        });
      }
      actions.appendChild(button(game.themeOn ? "Couper le thème" : "Thème", "primary", () => {
        send("jeopardyToggleTheme", { on: !game.themeOn });
      }));
      panel.appendChild(actions);
    }

    if (game.phase === "title") {
      panel.appendChild(button("Commencer", "primary", () => send("jeopardyStart")));
    }

    if (game.phase === "winner") {
      panel.appendChild(button("Couper l’ovation", "ghost", () => {
        if (window.FeudSounds) FeudSounds.play("silence");
      }));
    }

    if (game.phase !== "title") {
      panel.appendChild(button("Recommencer", "ghost", () => {
        if (window.confirm("Remettre les pointages à zéro et revenir au tableau 1 ?")) send("jeopardyReset");
      }));
    }

    JeopardyBoard.render(stage, game, {
      embed: true,
      maskSecrets: true,
      interactive: game.phase === "board",
      showDaily: true,
      flashTeam,
      onPick: (col, row) => send("jeopardyPick", { col, row })
    });
  }

  function secretCard(category, clue, answer) {
    const card = document.createElement("div");
    card.className = "secret";
    const kicker = document.createElement("p");
    kicker.className = "hint";
    kicker.textContent = category || "";
    const text = document.createElement("p");
    text.className = "secret-clue";
    text.textContent = clue || "";
    const reply = document.createElement("p");
    reply.className = "secret-answer";
    reply.textContent = "Réponse : " + (answer || "");
    card.appendChild(kicker);
    card.appendChild(text);
    card.appendChild(reply);
    return card;
  }

  function statusText() {
    const team = game.teams[game.control];
    const who = team ? team.name : "";
    const answering = game.respondent != null ? game.teams[game.respondent] : null;
    if (game.phase === "title") return "Nomme les concurrents, puis commence.";
    if (game.phase === "board") {
      return game.boardDone
        ? "Tableau terminé. " + who + " choisit."
        : who + " choisit une case.";
    }
    if (game.phase === "wager") return "Double quotidien. " + who + " annonce sa mise.";
    if (game.phase === "clue") {
      return answering
        ? answering.name + " répond. Bonne : les points. Mauvaise : on retire, un autre peut buzzer."
        : "Choisis le concurrent qui a buzzé.";
    }
    if (game.phase === "finale-wager") return "Finale. Chaque concurrent mise jusqu’à son pointage.";
    if (game.phase === "finale-clue") return "Lis l’indice aux concurrents, puis montre la réponse.";
    if (game.phase === "finale-reveal") return "Bonne réponse : on ajoute la mise. Mauvaise : on la retire.";
    if (game.phase === "winner") return "Le gagnant est à l’écran.";
    return "";
  }

  let themePrimed = false;
  document.addEventListener("pointerdown", () => {
    if (window.FeudSounds) FeudSounds.unlock();
    if (!themeAudio) {
      themeAudio = new Audio("/jeopardy-theme.mp3");
      themeAudio.loop = true;
    }
    const want = game && game.themeOn && remoteSound && showLevel > 0;
    if (themePrimed && !(want && themeAudio.paused)) return;
    themePrimed = true;
    try { themeAudio.volume = showLevel; } catch (error) { /* pas encore prêt */ }
    const pending = themeAudio.play();
    const settle = () => {
      if (want) {
        themeWas = true;
        return;
      }
      themeAudio.pause();
      try { themeAudio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
      themeWas = false;
    };
    if (pending && pending.then) pending.then(settle).catch(() => { themeWas = false; });
    else settle();
  });

  socket.on("showSound", (payload) => {
    remoteSound = !payload || payload.on !== false;
    if (!remoteSound) {
      themeWas = false;
      if (themeAudio) {
        themeAudio.pause();
        try { themeAudio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
      }
      if (window.FeudSounds) FeudSounds.stop();
      return;
    }
    if (game && game.themeOn) syncTheme(true);
  });
  socket.on("showVolume", (payload) => {
    const level = Number(payload && payload.level);
    if (!Number.isFinite(level)) return;
    showLevel = Math.min(1, Math.max(0, level));
    if (window.FeudSounds && FeudSounds.setVolume) FeudSounds.setVolume(showLevel);
    if (themeAudio) {
      try { themeAudio.volume = showLevel; } catch (error) { /* pas encore prêt */ }
    }
    if (showLevel <= 0) {
      themeWas = false;
      if (themeAudio) {
        themeAudio.pause();
        try { themeAudio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
      }
      if (window.FeudSounds) FeudSounds.stop();
      return;
    }
    if (game && game.themeOn) syncTheme(true);
  });
  socket.on("jeopardyHostState", apply);
  socket.emit("joinJeopardyHost", apply);
})();
