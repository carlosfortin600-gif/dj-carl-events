(function initWheelSocket(global) {
  function createWheelSocket(options) {
    const socket = io();
    const wheel = options.wheel;
    const onResult = options.onResult || (() => {});
    const onSegmentsApplied = options.onSegmentsApplied || (() => {});
    const onStatus = options.onStatus || (() => {});
    const onSpinStateChange = options.onSpinStateChange || (() => {});
    const onWinnersUpdate = options.onWinnersUpdate || (() => {});
    const onPrizeDrawUpdate = options.onPrizeDrawUpdate || (() => {});
    const onWinnerReveal = options.onWinnerReveal || (() => {});
    const onRemovedPlayersUpdate = options.onRemovedPlayersUpdate || (() => {});
    const syncTextarea = Boolean(options.syncTextarea);

    let lastStateVersion = 0;
    let activeSpinId = 0;
    let activeSpinPayload = null;

    function stateVersion(state) {
      return Number(state?.version) || 0;
    }

    function isStaleState(state) {
      return stateVersion(state) < lastStateVersion;
    }

    function rememberStateVersion(state) {
      lastStateVersion = Math.max(lastStateVersion, stateVersion(state));
    }

    function showResult(label, animate) {
      onResult(label, animate);
    }

    function setSpinning(isSpinning) {
      onSpinStateChange(isSpinning);
    }

    function applyVisualState(state, allowRotationUpdate) {
      if (!state) return;

      wheel.setSegments(state.segments);

      if (allowRotationUpdate && !wheel.isSpinning()) {
        wheel.setRotation(state.rotation);
      }

      if (state.spinning) {
        showResult("…", false);
        setSpinning(true);
      } else if (state.result) {
        showResult(state.result, false);
        setSpinning(false);
      } else {
        showResult(options.emptyResultLabel || "—", false);
        setSpinning(false);
      }
    }

    function applySegmentsToTextarea(state) {
      if (!syncTextarea || !state?.segments) return;
      onSegmentsApplied(state.segments);
      onRemovedPlayersUpdate(state.removedPlayers || []);
    }

    function applyPrizeDraw(state) {
      if (!state) return;
      onPrizeDrawUpdate({
        currentPrize: state.currentPrize || "",
        prizeRemaining: Number(state.prizeRemaining) || 0,
        prizeTotal: Number(state.prizeTotal) || 0,
        prizeIndex: Number(state.prizeIndex) || 0,
        prizeQueue: Array.isArray(state.prizeQueue) ? state.prizeQueue : [],
        hasPrizeQueue: Boolean(state.hasPrizeQueue),
        allPrizesDone: Boolean(state.allPrizesDone)
      });
    }

    function normalizeWinnersBoard(stateOrBoard) {
      if (!stateOrBoard) {
        return { current: [], groups: [], nextSeriesName: "Série 1", currentPrize: "" };
      }

      if (Array.isArray(stateOrBoard)) {
        return global.WheelWinners.normalizeBoard(stateOrBoard);
      }

      if (Array.isArray(stateOrBoard.current) || Array.isArray(stateOrBoard.groups)) {
        return global.WheelWinners.normalizeBoard({
          ...stateOrBoard,
          currentPrize: stateOrBoard.currentPrize
        });
      }

      return global.WheelWinners.normalizeBoard({
        current: stateOrBoard.winners || [],
        groups: stateOrBoard.winnerGroups || [],
        nextSeriesName: stateOrBoard.nextSeriesName,
        currentPrize: stateOrBoard.currentPrize
      });
    }

    function applyWinners(stateOrBoard) {
      if (!stateOrBoard) return;
      const board = normalizeWinnersBoard(stateOrBoard);
      onWinnersUpdate(board);

      if (!Array.isArray(stateOrBoard) && stateOrBoard.segments) {
        applyPrizeDraw(stateOrBoard);
      }
    }

    function applyWinnersList(board) {
      if (!board) return;
      onWinnersUpdate(normalizeWinnersBoard(board));
    }

    function requestWinnersRefresh() {
      socket.emit("wheelGetWinners", (winners) => {
        applyWinnersList(winners);
      });
    }

    function handleWheelState(state, updateTextarea) {
      if (!state || isStaleState(state)) return;

      rememberStateVersion(state);
      if (typeof state.musicEnabled === "boolean") {
        options.onMusicChange?.(state.musicEnabled);
      }
      applyWinners(state);

      if (wheel.isSpinning()) {
        return;
      }

      applyVisualState(state, true);

      if (updateTextarea) {
        applySegmentsToTextarea(state);
      }
    }

    function prepareSpinPayload(payload) {
      if (Array.isArray(payload?.segments) && payload.segments.length >= 2) {
        wheel.setSegments(payload.segments);
      }
      wheel.setRotation(payload.startRotation);
    }

    function startSpinAnimation(payload) {
      const spinId = Number(payload?.spinId) || Date.now();
      if (spinId <= activeSpinId && wheel.isSpinning()) {
        return;
      }

      activeSpinId = spinId;
      activeSpinPayload = payload;
      prepareSpinPayload(payload);
      setSpinning(true);
      showResult("…", false);
      global.WheelSounds?.stopWinTune?.();

      if (typeof options.onSegmentTick === "function") {
        global.WheelSounds?.unlock?.();
      }

      wheel.animateSpin(payload, {
        onSegmentTick: options.onSegmentTick,
        onComplete: (result) => {
          if (spinId !== activeSpinId) return;
          showResult(result.winnerLabel, true);
          setSpinning(false);
          onWinnerReveal({
            label: result.winnerLabel,
            prize: activeSpinPayload?.winnerPrize || ""
          });
          global.WheelSounds?.playWinTune?.();
          requestWinnersRefresh();
        }
      });
    }

    function resumeActiveSpin(state) {
      if (!state?.activeSpin || !state.spinning) return;

      const elapsed = Date.now() - Number(state.activeSpin.startedAt);
      if (elapsed >= Number(state.activeSpin.duration)) return;

      startSpinAnimation(state.activeSpin);
    }

    function joinRoom() {
      lastStateVersion = 0;
      socket.emit(options.joinEvent, (state) => {
        handleWheelState(state, syncTextarea);
        resumeActiveSpin(state);
      });
    }

    socket.on("connect", () => {
      joinRoom();
    });

    socket.on("wheelState", (state) => {
      handleWheelState(state, syncTextarea);
    });

    socket.on("wheelWinners", (winners) => {
      applyWinnersList(winners);
    });

    socket.on("wheelSpinStart", (payload) => {
      startSpinAnimation(payload);
    });

    socket.on("wheelMusic", (payload) => {
      if (typeof payload?.musicEnabled === "boolean") {
        options.onMusicChange?.(payload.musicEnabled);
      }
    });

    socket.on("wheelWinTuneClaim", (payload) => {
      global.WheelSounds?.noteWinClaim?.(payload?.at);
    });

    if (socket.connected) {
      joinRoom();
    }

    return {
      socket,
      applySegments(labels) {
        return new Promise((resolve) => {
          socket.emit("wheelSetSegments", labels, (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Erreur.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, true);
            onStatus("Roue mise à jour sur l'écran public.", false);
            resolve(true);
          });
        });
      },
      spin(prize) {
        if (wheel.isSpinning()) return;

        const payload = prize !== undefined ? { prize } : {};
        socket.emit("wheelSpin", payload, (response) => {
          if (!response?.ok) {
            onStatus(response?.error || "Impossible de tourner.", true);
          }
        });
      },
      setPrize(prize) {
        socket.emit("wheelSetPrize", prize);
      },
      setPrizeQueue(queue) {
        return new Promise((resolve) => {
          socket.emit("wheelSetPrizeQueue", queue, (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Impossible de charger les prix.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, false);
            resolve(true);
          });
        });
      },
      clearWinners() {
        return new Promise((resolve) => {
          socket.emit("wheelClearWinners", (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Impossible de vider la liste.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, false);
            resolve(true);
          });
        });
      },
      closeWinnerSeries(name) {
        return new Promise((resolve) => {
          socket.emit("wheelCloseWinnerSeries", { name }, (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Impossible de clôturer la série.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, false);
            resolve(true);
          });
        });
      },
      setMusicEnabled(enabled) {
        socket.emit("wheelSetMusic", Boolean(enabled));
      },
      claimWinTune() {
        socket.emit("wheelClaimWinTune");
      },
      restoreAllPlayers() {
        return new Promise((resolve) => {
          socket.emit("wheelRestoreAllPlayers", (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Impossible de remettre les joueurs.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, syncTextarea);
            resolve(true);
          });
        });
      },
      restorePlayer(label) {
        return new Promise((resolve) => {
          socket.emit("wheelRestorePlayer", { label }, (response) => {
            if (!response?.ok) {
              onStatus(response?.error || "Impossible de remettre ce joueur.", true);
              resolve(false);
              return;
            }

            handleWheelState(response.state, syncTextarea);
            resolve(true);
          });
        });
      },
      getSocket() {
        return socket;
      }
    };
  }

  global.WheelSocket = { createWheelSocket };
})(window);
