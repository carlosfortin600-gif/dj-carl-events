(function initWheelWinners(global) {
  function sharedPrizeName(winners, fallbackPrize) {
    const prizes = (winners || [])
      .map((winner) => String(winner?.prize || "").trim())
      .filter(Boolean);

    if (prizes.length && prizes.every((prize) => prize === prizes[0])) {
      return prizes[0];
    }

    return String(fallbackPrize || "").trim();
  }

  function currentSeriesTitle(prizeName) {
    return prizeName ? `Série en cours — ${prizeName}` : "Série en cours";
  }

  function normalizeBoard(input) {
    if (Array.isArray(input)) {
      return {
        current: input,
        groups: [],
        nextSeriesName: "Série 1",
        currentPrize: ""
      };
    }

    return {
      current: Array.isArray(input?.current) ? input.current : (input?.winners || []),
      groups: Array.isArray(input?.groups) ? input.groups : (input?.winnerGroups || []),
      nextSeriesName: input?.nextSeriesName || "Série 1",
      currentPrize: String(input?.currentPrize || "").trim()
    };
  }

  function renderWinnerItems(winners) {
    const list = document.createElement("ol");
    list.className = "wheel-winners-list";

    winners.forEach((winner) => {
      const item = document.createElement("li");
      item.className = "wheel-winners-item";

      const rank = document.createElement("span");
      rank.className = "wheel-winners-rank";
      rank.textContent = String(winner.spin || 0);

      const label = document.createElement("span");
      label.className = "wheel-winners-label";
      label.textContent = winner.label;

      item.appendChild(rank);
      item.appendChild(label);

      if (winner.prize) {
        const prize = document.createElement("span");
        prize.className = "wheel-winners-prize";
        prize.textContent = winner.prize;
        item.appendChild(prize);
      }

      list.appendChild(item);
    });

    return list;
  }

  function renderWinnersList(container, boardInput) {
    if (!container) return null;

    const board = normalizeBoard(boardInput);
    container.innerHTML = "";

    const hasGroups = board.groups.length > 0;
    const hasCurrent = board.current.length > 0;

    if (!hasGroups && !hasCurrent) {
      const empty = document.createElement("p");
      empty.className = "wheel-winners-empty";
      empty.textContent = "Aucun gagnant pour l'instant";
      container.appendChild(empty);
      return board;
    }

    board.groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "wheel-winners-group";

      const title = document.createElement("h4");
      title.className = "wheel-winners-group-title";
      title.textContent = group.name || "Série";
      section.appendChild(title);

      section.appendChild(renderWinnerItems(group.winners || []));
      container.appendChild(section);
    });

    if (hasCurrent) {
      const section = document.createElement("section");
      section.className = "wheel-winners-group wheel-winners-group-current";

      const title = document.createElement("h4");
      title.className = "wheel-winners-group-title";
      title.textContent = currentSeriesTitle(sharedPrizeName(board.current, board.currentPrize));
      section.appendChild(title);
      section.appendChild(renderWinnerItems(board.current));
      container.appendChild(section);
    }

    container.scrollTop = container.scrollHeight;
    return board;
  }

  function formatWinnerLine(winner, index) {
    const num = winner.spin || index + 1;
    const prizePart = winner.prize ? ` — ${winner.prize}` : "";
    return `${num}. ${winner.label}${prizePart}`;
  }

  function exportWinnersTxt(boardInput, filename) {
    const board = normalizeBoard(boardInput);
    const sections = [];

    board.groups.forEach((group) => {
      const rows = (group.winners || []).map((winner, index) => formatWinnerLine(winner, index));
      sections.push(`=== ${group.name || "Série"} ===`, ...rows, "");
    });

    if (board.current.length) {
      const rows = board.current.map((winner, index) => formatWinnerLine(winner, index));
      sections.push(`=== ${currentSeriesTitle(sharedPrizeName(board.current, board.currentPrize))} ===`, ...rows);
    }

    const content = [
      "DJ Carl — Liste des gagnants (roue)",
      `Exporté le ${new Date().toLocaleString("fr-CA")}`,
      "",
      ...sections
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `gagnants-roue-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  global.WheelWinners = {
    normalizeBoard,
    renderWinnersList,
    exportWinnersTxt
  };
})(window);
