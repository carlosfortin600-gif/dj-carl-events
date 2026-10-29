(function initJeopardyBoard(global) {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function points(value) {
    const n = Number(value) || 0;
    const sign = n < 0 ? "−" : "";
    return sign + Math.abs(n).toLocaleString("fr-CA");
  }

  function scores(state, options) {
    const flashTeam = options.flashTeam;
    const row = el("div", "jep-scores");
    row.style.setProperty("--teams", String(state.teams.length));
    const onClock = state.phase === "clue" || state.phase === "wager";
    state.teams.forEach((team, index) => {
      const lit = onClock ? team.answering : team.control;
      const card = el(options.onSelect ? "button" : "div", "jep-podium team-" + index + (lit ? " is-control" : ""));
      if (options.onSelect) {
        card.type = "button";
        card.addEventListener("click", () => options.onSelect(index));
      }
      if (flashTeam === index) card.classList.add("is-flash");
      const name = el("span");
      name.appendChild(document.createTextNode(team.name));
      if (team.control && state.phase === "board") {
        name.appendChild(el("small", "", "Choisit"));
      }
      if (team.answering && onClock) {
        name.appendChild(el("small", "", "Répond"));
      }
      card.appendChild(name);
      card.appendChild(el("strong", "", points(team.score)));
      row.appendChild(card);
    });
    return row;
  }

  function board(state, options) {
    const wrap = el("div", "jep-stage" + (options.embed ? " jep-stage--fit" : ""));
    wrap.appendChild(el("p", "jep-round-label", state.roundName || "Jeopardy"));
    const grid = el("div", "jep-grid");
    state.categories.forEach((category, col) => {
      const title = el("div", "jep-cat", category.name);
      title.style.gridColumn = String(col + 1);
      title.style.gridRow = "1";
      grid.appendChild(title);
      category.cells.forEach((cell, row) => {
        const clickable = options.interactive && !cell.used;
        const node = el(clickable ? "button" : "div", "jep-cell" + (cell.used ? " is-used" : ""));
        node.style.gridColumn = String(col + 1);
        node.style.gridRow = String(row + 2);
        if (options.showDaily && cell.daily && !cell.used) node.classList.add("is-daily");
        if (clickable) {
          node.type = "button";
          node.addEventListener("click", () => options.onPick(col, row));
        }
        node.appendChild(document.createTextNode(cell.used ? "" : points(cell.value)));
        grid.appendChild(node);
      });
    });
    wrap.appendChild(grid);
    wrap.appendChild(scores(state, options));
    return wrap;
  }

  function podium(state, options) {
    const wrap = el("div", "jep-stage" + (options.embed ? " jep-stage--fit" : ""));
    wrap.appendChild(el("p", "jep-round-label", state.rankingOn && !state.boardDone ? "Classement" : "Podium · " + (state.roundName || "Manche")));
    const ranked = state.teams.map((team, index) => ({
      name: team.name,
      score: team.score,
      color: index
    })).sort((a, b) => b.score - a.score || a.color - b.color);
    const row = el("div", "jep-places");
    ranked.forEach((team, rank) => {
      const place = rank + 1;
      const card = el("div", "jep-place jep-place-" + place + " team-" + team.color);
      card.appendChild(el("b", "", String(place)));
      const foot = el("div", "jep-place-foot");
      foot.appendChild(el("span", "", team.name));
      foot.appendChild(el("strong", "", points(team.score)));
      card.appendChild(foot);
      row.appendChild(card);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function feature(state, body, options) {
    const wrap = el("div", "jep-stage" + (options.embed ? " jep-stage--fit" : ""));
    const featureBox = el("div", "jep-feature");
    body(featureBox);
    wrap.appendChild(featureBox);
    wrap.appendChild(scores(state, options));
    return wrap;
  }

  function forAudience(state) {
    const next = Object.assign({}, state);
    if (next.clue && !next.clue.resolved) {
      next.clue = Object.assign({}, next.clue, { answer: null });
    }
    if (next.finale && next.phase !== "finale-reveal" && next.phase !== "winner") {
      next.finale = Object.assign({}, next.finale, {
        answer: null,
        clue: next.phase === "finale-wager" ? null : next.finale.clue,
        wagers: null
      });
    }
    return next;
  }

  function render(root, state, options) {
    const opts = options || {};
    root.replaceChildren();
    if (!state) return;
    if (opts.maskSecrets) state = forAudience(state);

    if (state.showQr) {
      root.appendChild(qrStage(opts));
      return;
    }

    if (state.phase === "title") {
      root.appendChild(feature(state, (box) => {
        box.appendChild(el("h1", "jep-logo", "JEOPARDY"));
        box.appendChild(el("p", "jep-tag", "Quatre concurrents. Une case à la fois."));
      }, opts));
      return;
    }

    const liveRanking = state.rankingOn && !state.boardDone
      && state.phase !== "title"
      && state.phase !== "winner"
      && !String(state.phase || "").startsWith("finale");
    if ((state.phase === "board" && state.boardDone) || liveRanking) {
      root.appendChild(podium(state, opts));
      return;
    }

    if (state.phase === "board") {
      root.appendChild(board(state, opts));
      return;
    }

    if (state.phase === "wager") {
      const team = state.teams[state.control];
      root.appendChild(feature(state, (box) => {
        box.appendChild(el("p", "jep-kicker", state.clue ? state.clue.category : ""));
        box.appendChild(el("h2", "", "DOUBLE QUOTIDIEN"));
        box.appendChild(el("p", "jep-wager-line", team ? team.name : ""));
        if (!opts.maskWager && state.clue && state.clue.wager != null) {
          box.appendChild(el("p", "jep-wager-line", "Mise : " + points(state.clue.wager)));
        }
      }, opts));
      return;
    }

    if (state.phase === "clue") {
      root.appendChild(feature(state, (box) => {
        const clue = state.clue || {};
        const player = state.respondent != null ? state.teams[state.respondent] : null;
        box.appendChild(el("p", "jep-kicker", (clue.category || "") + (clue.daily ? "  ·  Double" : "")));
        if (player) box.appendChild(el("p", "jep-wager-line", player.name + " répond"));
        box.appendChild(el("p", "jep-wager-line", points(clue.daily ? clue.wager : clue.value)));
        box.appendChild(el("p", "jep-clue-text", clue.text || ""));
        if (clue.answer) box.appendChild(el("p", "jep-answer", clue.answer));
        if (opts.banner) box.appendChild(el("p", "jep-banner " + (opts.bannerGood ? "is-good" : "is-bad"), opts.banner));
      }, opts));
      return;
    }

    if (state.phase === "finale-wager" || state.phase === "finale-clue" || state.phase === "finale-reveal") {
      const finale = state.finale || {};
      root.appendChild(feature(state, (box) => {
        box.appendChild(el("p", "jep-kicker", "Finale"));
        box.appendChild(el("h2", "", finale.category || ""));
        if (state.phase === "finale-wager") {
          box.appendChild(el("p", "jep-clue-text", finale.locked ? "Les mises sont faites." : "Chaque concurrent annonce sa mise."));
        } else {
          box.appendChild(el("p", "jep-clue-text", finale.clue || ""));
          if (finale.answer) box.appendChild(el("p", "jep-answer", finale.answer));
        }
      }, opts));
      return;
    }

    if (state.phase === "winner") {
      const names = (state.winners || []).map((team) => team.name).join("  ·  ");
      const score = state.winners && state.winners[0] ? points(state.winners[0].score) : "";
      root.appendChild(feature(state, (box) => {
        box.appendChild(el("p", "jep-kicker", "Gagnant"));
        box.appendChild(el("h2", "", names || "Égalité"));
        box.appendChild(el("p", "jep-wager-line", score));
      }, opts));
    }
  }

  let qrCache = null;

  function qrStage(options) {
    const wrap = el("div", "jep-stage" + (options.embed ? " jep-stage--fit" : ""));
    const box = el("div", "jep-feature jep-qr");
    box.appendChild(el("p", "jep-kicker", "Manette"));
    box.appendChild(el("h2", "", "Scanne le code"));
    const img = document.createElement("img");
    img.alt = "Code QR de la manette";
    box.appendChild(img);
    const url = el("p", "jep-tag", "");
    box.appendChild(url);
    wrap.appendChild(box);
    const apply = (data) => {
      if (!data) return;
      img.src = data.qr || "";
      url.textContent = data.url || "";
    };
    if (qrCache) apply(qrCache);
    else {
      fetch("/api/ipad").then((res) => res.json()).then((data) => {
        qrCache = data;
        apply(data);
      }).catch(() => {
        url.textContent = "QR indisponible.";
      });
    }
    return wrap;
  }

  global.JeopardyBoard = { render, points };
})(window);
