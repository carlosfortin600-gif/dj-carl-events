(function initFeudBoard(global) {
  function shell(slotMarkup, preview) {
    return `
      <div class="feud-stage${preview ? " is-preview" : ""}" data-phase="title">
        <header class="feud-top">
          <div class="team team-a" data-team="a">
            <div class="team-strobe"></div>
            <div class="team-tag" data-tag="a"></div>
            <div class="team-name" data-team-name="a"></div>
            <div class="team-score" data-team-score="a">0</div>
          </div>
          <div class="feud-center">
            <div class="feud-brand">
              <div class="feud-logo">FAMILLE EN OR</div>
              <p class="feud-tagline">Le grand sondage</p>
            </div>
            <p class="feud-now" data-now hidden></p>
          </div>
          <div class="team team-b" data-team="b">
            <div class="team-strobe"></div>
            <div class="team-tag" data-tag="b"></div>
            <div class="team-name" data-team-name="b"></div>
            <div class="team-score" data-team-score="b">0</div>
          </div>
        </header>
        <p class="feud-question"></p>
        <p class="feud-multiplier" data-factor="1"></p>
        <p class="feud-status"></p>
        <div class="feud-board">${slotMarkup}</div>
        <div class="feud-final">
          <p class="final-kicker"></p>
          <p class="final-name"></p>
          <div class="final-scores">
            <p data-final="a"><span class="final-team"></span><strong class="final-points">0</strong></p>
            <p data-final="b"><span class="final-team"></span><strong class="final-points">0</strong></p>
          </div>
        </div>
        <footer class="feud-foot">
          <div class="round-pot"><span>Manche</span><strong data-pot>0</strong></div>
          <div class="strike-pips"><i></i><i></i><i></i></div>
          <div class="q-count" data-qcount></div>
        </footer>
        <div class="feud-burst" aria-hidden="true"></div>
      </div>
    `;
  }

  function slotsMarkup(count) {
    return Array.from({ length: count }, (_, index) => `
      <div class="slot" data-index="${index}">
        <div class="slot-inner">
          <div class="face face-back"><span class="num">${index + 1}</span></div>
          <div class="face face-front">
            <span class="num">${index + 1}</span>
            <span class="label"></span>
            <span class="pts"></span>
          </div>
        </div>
      </div>
    `).join("");
  }

  function buildKey(state) {
    if (state.phase === "title") return "title";
    if (state.phase === "done") return "done";
    const count = state.question?.answers?.length || 0;
    return `board:${state.question?.id || "x"}:${count}:${state.roundId}`;
  }

  function otherId(teamId) {
    return teamId === "a" ? "b" : "a";
  }

  function statusText(state) {
    if (state.phase === "faceoff") {
      const turn = state.faceoff?.turn;
      if (!turn) return "";
      const other = otherId(turn);
      const reply = state.faceoff[turn] == null && state.faceoff[other] != null;
      return reply
        ? `Droit de réplique — ${state.teams[turn].name}`
        : state.teams[turn].name;
    }
    if (state.phase === "play" && state.control) return `${state.teams[state.control].name} joue`;
    if (state.phase === "steal" && state.control) return "VOL";
    if (state.phase === "result" && state.roundWinner) {
      return `${state.teams[state.roundWinner].name} +${state.roundPoints}`;
    }
    return "";
  }

  function playingNow(state) {
    if (state.phase === "play" && state.control) return state.control;
    if (state.phase === "faceoff" && state.faceoff?.turn) return state.faceoff.turn;
    if (state.phase === "steal" && state.control) return otherId(state.control);
    if (state.phase === "result" && state.roundWinner) return state.roundWinner;
    return "";
  }

  function tagFor(state, teamId) {
    if (state.phase === "faceoff" && state.faceoff?.turn === teamId) {
      const other = teamId === "a" ? "b" : "a";
      if (state.faceoff[teamId] == null && state.faceoff[other] != null) return "RÉPLIQUE";
      if (state.faceoff[teamId] == null) return "RÉPOND";
    }
    if (state.phase === "play" && state.control === teamId) return "JOUE";
    if (state.phase === "steal" && state.control && state.control !== teamId) return "VOL";
    if (state.phase === "result" && state.roundWinner === teamId) return "GAGNE";
    if (state.phase === "done" && state.leader === teamId) return "GAGNE";
    return "";
  }

  function sync(root, state) {
    const stage = root.querySelector(".feud-stage");
    stage.dataset.phase = state.phase;

    ["a", "b"].forEach((teamId) => {
      const team = state.teams[teamId];
      const card = stage.querySelector(`.team-${teamId}`);
      card.classList.toggle("is-control", (state.phase === "play" && state.control === teamId) || (state.phase === "faceoff" && state.faceoff?.turn === teamId));
      card.classList.toggle("is-steal", state.phase === "steal" && state.control && state.control !== teamId);
      card.classList.toggle("is-winner", (state.phase === "result" && state.roundWinner === teamId) || (state.phase === "done" && state.leader === teamId));
      stage.querySelector(`[data-team-name="${teamId}"]`).textContent = team.name;
      stage.querySelector(`[data-team-score="${teamId}"]`).textContent = String(team.score);
      stage.querySelector(`[data-tag="${teamId}"]`).textContent = tagFor(state, teamId);
    });

    const nowId = playingNow(state);
    const now = stage.querySelector("[data-now]");
    if (now) {
      now.hidden = !nowId;
      now.dataset.side = nowId || "";
      now.textContent = nowId ? state.teams[nowId].name : "";
    }

    const question = stage.querySelector(".feud-question");
    question.textContent = state.question?.text || "";
    const factor = state.pointFactor || 1;
    const pointsName = factor === 3 ? "Points triples" : factor === 2 ? "Points doubles" : "Points simples";
    const multiplier = stage.querySelector(".feud-multiplier");
    if (multiplier) {
      multiplier.dataset.factor = String(factor);
      multiplier.textContent = state.phase === "title" || state.phase === "done" ? "" : pointsName;
    }
    stage.querySelector(".feud-status").textContent = statusText(state);

    const answers = state.question?.answers || [];
    stage.querySelectorAll(".slot").forEach((slot) => {
      const answer = answers[Number(slot.dataset.index)];
      if (!answer) return;
      slot.querySelector(".label").textContent = answer.revealed ? answer.text : "";
      slot.querySelector(".pts").textContent = answer.revealed && answer.points != null ? String(answer.points) : "";
      slot.classList.toggle("is-open", Boolean(answer.revealed));
    });

    stage.querySelectorAll(".strike-pips i").forEach((pip, index) => {
      pip.classList.toggle("on", index < state.strikes);
    });

    const pot = stage.querySelector("[data-pot]");
    if (pot) pot.textContent = String(state.roundPoints || 0);
    const count = stage.querySelector("[data-qcount]");
    if (count) {
      const packName = state.pack && state.pack.name ? `${state.pack.name} · ` : "";
      count.textContent = state.phase === "title" || state.phase === "done"
        ? ""
        : `${packName}Question ${state.questionIndex + 1} / ${state.questionCount}`;
    }

    if (state.phase === "done") {
      const tied = !state.leader;
      stage.querySelector(".final-kicker").textContent = tied ? "Égalité" : "Gagnant";
      stage.querySelector(".final-name").textContent = tied
        ? "Les deux familles"
        : state.teams[state.leader].name;
      ["a", "b"].forEach((teamId) => {
        const row = stage.querySelector(`[data-final="${teamId}"]`);
        row.querySelector(".final-team").textContent = state.teams[teamId].name;
        row.querySelector(".final-points").textContent = String(state.teams[teamId].score);
        row.classList.toggle("is-leader", Boolean(state.leader) && state.leader === teamId);
      });
    }
  }

  function burst(stage, event) {
    let text = "";
    let kind = "";
    let hold = false;
    if (event.type === "faceoff-win" || (event.type === "control" && event.team)) {
      flashTeam(stage, event.team);
    }
    if (event.type === "strike" || event.type === "steal-start") {
      text = "X";
      kind = "bad";
    } else if (event.type === "faceoff-win") {
      text = String(event.points || 0);
      kind = "good";
      hold = true;
    } else if (event.type === "award" || event.type === "steal-win" || event.type === "steal-miss") {
      text = `+${event.points || 0}`;
      kind = "good";
      hold = true;
    } else {
      return;
    }

    const el = stage.querySelector(".feud-burst");
    el.className = "feud-burst";
    el.dataset.kind = kind;
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add(hold ? "show-long" : "show");

    if (kind === "bad") {
      stage.classList.remove("shake");
      void stage.offsetWidth;
      stage.classList.add("shake");
    }

    if (event.index != null && (event.type === "reveal" || event.type === "steal-win" || event.type === "award")) {
      const slot = stage.querySelector(`.slot[data-index="${event.index}"]`);
      if (slot) slot.classList.add("just-revealed");
    }
  }

  function flashTeam(stage, teamId) {
    const card = stage.querySelector(`.team-${teamId}`);
    const phase = stage.dataset.phase;
    if (!card || (phase !== "play" && phase !== "faceoff")) return;
    const strobe = card.querySelector(".team-strobe");
    if (strobe) {
      strobe.classList.remove("is-on");
      void strobe.offsetWidth;
      strobe.classList.add("is-on");
    }
    card.classList.remove("is-flash");
    void card.offsetWidth;
    card.classList.add("is-flash");
  }

  function mount(root, options) {
    const preview = Boolean(options && options.preview);
    const onEvent = (options && options.onEvent) || function () {};
    let ready = false;
    let lastSeq = 0;
    let key = "";
    let endTimer = 0;

    function presentEnding(stage, state, fresh) {
      if (state.phase !== "done") {
        clearTimeout(endTimer);
        stage.dataset.end = "";
        return;
      }
      if (fresh) {
        stage.dataset.end = "points";
        clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          stage.dataset.end = "winner";
        }, 3000);
        return;
      }
      if (!stage.dataset.end) stage.dataset.end = "winner";
    }

    function update(state) {
      if (!state) return;
      const nextKey = buildKey(state);
      if (nextKey !== key) {
        const count = nextKey.startsWith("board:") ? (state.question?.answers?.length || 0) : 0;
        root.innerHTML = shell(count ? slotsMarkup(count) : "", preview);
        key = nextKey;
      }
      sync(root, state);

      const stage = root.querySelector(".feud-stage");
      const seq = state.event?.seq || 0;
      const freshDone = ready && seq && seq !== lastSeq && state.event?.type === "done";
      presentEnding(stage, state, freshDone);

      if (!ready) {
        ready = true;
        lastSeq = seq;
        return;
      }
      if (!seq || seq === lastSeq) return;
      lastSeq = seq;
      onEvent(state.event);
      burst(stage, state.event);
    }

    return { update };
  }

  global.FeudBoard = { mount };
})(window);
