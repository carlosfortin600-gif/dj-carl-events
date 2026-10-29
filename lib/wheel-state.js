const WHEEL_POINTER_ANGLE = 0;

const WHEEL_PALETTE = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#7c3aed",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#b91c1c",
  "#1d4ed8",
  "#15803d",
  "#a16207"
];

const DEFAULT_LABELS = [
  "Joueur 1",
  "Joueur 2",
  "Joueur 3",
  "Joueur 4",
  "Joueur 5",
  "Joueur 6"
];

function normalizeSegments(rawSegments) {
  if (!Array.isArray(rawSegments)) {
    return [];
  }

  return rawSegments
    .map((segment, index) => {
      if (typeof segment === "string") {
        const label = segment.trim();
        if (!label) return null;

        return {
          label,
          prize: null,
          color: WHEEL_PALETTE[index % WHEEL_PALETTE.length]
        };
      }

      const label = String(segment?.label ?? segment?.name ?? "").trim();
      if (!label) return null;

      return {
        label,
        prize: String(segment?.prize ?? "").trim() || null,
        color: segment?.color || WHEEL_PALETTE[index % WHEEL_PALETTE.length]
      };
    })
    .filter(Boolean);
}

function normalizePrizeQueue(rawQueue) {
  if (!Array.isArray(rawQueue)) {
    return [];
  }

  return rawQueue
    .map((item) => {
      const prize = String(item?.prize ?? "").trim();
      const total = Number.parseInt(item?.total ?? item?.remaining ?? item?.count ?? item?.nom, 10);

      if (!prize || !Number.isFinite(total) || total < 1) {
        return null;
      }

      const remaining = Number.parseInt(item?.remaining, 10);
      const safeRemaining = Number.isFinite(remaining) && remaining >= 0
        ? Math.min(remaining, total)
        : total;

      return {
        prize,
        total,
        remaining: safeRemaining
      };
    })
    .filter(Boolean);
}

function createDefaultWheelState() {
  return {
    segments: normalizeSegments(DEFAULT_LABELS),
    rotation: 0,
    spinning: false,
    result: null
  };
}

let wheelState = createDefaultWheelState();
let wheelStateVersion = 1;
let activeWheelSpin = null;
let wheelSpinCounter = 0;
let wheelWinners = [];
let wheelWinnerGroups = [];
let wheelWinnerGroupIdCounter = 0;
let wheelRemovedPlayers = [];
let wheelCurrentPrize = "";
let wheelPrizeQueue = [];
let wheelPrizeIndex = 0;
let wheelMusicEnabled = true;
const MAX_WHEEL_WINNERS = 200;

function currentSeriesPrizeName() {
  const prizes = wheelWinners
    .map((winner) => String(winner?.prize || "").trim())
    .filter(Boolean);

  if (prizes.length && prizes.every((prize) => prize === prizes[0])) {
    return prizes[0];
  }

  return String(wheelCurrentPrize || "").trim();
}

function getNextSeriesName() {
  return currentSeriesPrizeName() || `Série ${wheelWinnerGroups.length + 1}`;
}

function cloneWinner(winner) {
  return { ...winner };
}

function cloneWinnerGroup(group) {
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    winners: group.winners.map(cloneWinner)
  };
}

function getWheelWinnersBoard() {
  return {
    current: wheelWinners.map(cloneWinner),
    groups: wheelWinnerGroups.map(cloneWinnerGroup),
    nextSeriesName: getNextSeriesName(),
    currentPrize: wheelCurrentPrize || null
  };
}

function bumpWheelStateVersion() {
  wheelStateVersion += 1;
  return wheelStateVersion;
}

function syncCurrentPrizeFromQueue() {
  while (wheelPrizeIndex < wheelPrizeQueue.length && wheelPrizeQueue[wheelPrizeIndex].remaining <= 0) {
    wheelPrizeIndex += 1;
  }

  if (wheelPrizeIndex < wheelPrizeQueue.length) {
    wheelCurrentPrize = wheelPrizeQueue[wheelPrizeIndex].prize;
    return;
  }

  wheelCurrentPrize = "";
}

function getPrizeDrawInfo() {
  const current = wheelPrizeQueue[wheelPrizeIndex] || null;

  return {
    currentPrize: wheelCurrentPrize || null,
    prizeRemaining: current?.remaining ?? 0,
    prizeTotal: current?.total ?? 0,
    prizeIndex: wheelPrizeIndex,
    prizeQueue: wheelPrizeQueue.map((item) => ({ ...item })),
    hasPrizeQueue: wheelPrizeQueue.length > 0,
    allPrizesDone: wheelPrizeQueue.length > 0 && wheelPrizeIndex >= wheelPrizeQueue.length
  };
}

function getWheelState() {
  return wheelState;
}

function getPublicWheelState() {
  return {
    version: wheelStateVersion,
    segments: wheelState.segments,
    rotation: wheelState.rotation,
    spinning: wheelState.spinning,
    result: wheelState.result,
    activeSpin: activeWheelSpin,
    winners: wheelWinners.map(cloneWinner),
    winnerGroups: wheelWinnerGroups.map(cloneWinnerGroup),
    nextSeriesName: getNextSeriesName(),
    removedPlayers: [...wheelRemovedPlayers],
    currentPrize: wheelCurrentPrize,
    musicEnabled: wheelMusicEnabled,
    maxWinners: MAX_WHEEL_WINNERS,
    ...getPrizeDrawInfo()
  };
}

function getWheelWinners() {
  return getWheelWinnersBoard();
}

function clearWheelWinners() {
  wheelWinners = [];
  bumpWheelStateVersion();
  return getPublicWheelState();
}

function clearAllWheelWinnerGroups() {
  wheelWinnerGroups = [];
  bumpWheelStateVersion();
  return getPublicWheelState();
}

function closeWheelWinnerSeries(rawName) {
  if (!wheelWinners.length) {
    throw new Error("Aucun gagnant dans la série en cours.");
  }

  const name = String(rawName || "").trim() || getNextSeriesName();
  wheelWinnerGroupIdCounter += 1;

  wheelWinnerGroups.push({
    id: wheelWinnerGroupIdCounter,
    name,
    createdAt: Date.now(),
    winners: wheelWinners.map(cloneWinner)
  });

  wheelWinners = [];
  bumpWheelStateVersion();
  return getPublicWheelState();
}

function addWheelWinner(label, spinId, prize) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) return;

  const cleanPrize = String(prize || "").trim();

  wheelWinners.push({
    spin: 0,
    spinId: Number(spinId) || 0,
    label: cleanLabel,
    prize: cleanPrize || null,
    at: Date.now()
  });

  while (wheelWinners.length > MAX_WHEEL_WINNERS) {
    wheelWinners.shift();
  }

  renumberWinners(wheelWinners);
}

function renumberWinners(list) {
  list.forEach((winner, index) => {
    winner.spin = index + 1;
  });
}

function restorePrizeDraw(prizeName) {
  if (!wheelPrizeQueue.length) return;

  const prize = String(prizeName || "").trim();
  if (!prize) return;

  const index = wheelPrizeQueue.findIndex((item) => item.prize === prize);
  if (index < 0) return;

  const item = wheelPrizeQueue[index];
  if (item.remaining < item.total) {
    item.remaining += 1;
  }

  if (index <= wheelPrizeIndex) {
    wheelPrizeIndex = index;
  }

  syncCurrentPrizeFromQueue();
}

function takeWinnersByLabel(list, label) {
  const kept = [];
  const removed = [];

  (list || []).forEach((winner) => {
    if (winner.label === label) {
      removed.push(winner);
    } else {
      kept.push(winner);
    }
  });

  renumberWinners(kept);
  return { kept, removed };
}

function removePlayerFromWinners(label) {
  const current = takeWinnersByLabel(wheelWinners, label);
  wheelWinners = current.kept;

  const removed = [...current.removed];
  wheelWinnerGroups = wheelWinnerGroups
    .map((group) => {
      const result = takeWinnersByLabel(group.winners, label);
      removed.push(...result.removed);
      return {
        ...group,
        winners: result.kept
      };
    })
    .filter((group) => group.winners.length > 0);

  removed.forEach((winner) => restorePrizeDraw(winner.prize));
  return removed.length;
}

function setWheelPrize(prize) {
  wheelCurrentPrize = String(prize || "").trim();
  return wheelCurrentPrize;
}

function getWheelPrize() {
  return wheelCurrentPrize;
}

function setWheelPrizeQueue(rawQueue) {
  wheelPrizeQueue = normalizePrizeQueue(rawQueue);
  wheelPrizeIndex = 0;
  syncCurrentPrizeFromQueue();
  bumpWheelStateVersion();
  return getPrizeDrawInfo();
}

function clearWheelPrizeQueue() {
  wheelPrizeQueue = [];
  wheelPrizeIndex = 0;
  wheelCurrentPrize = "";
  bumpWheelStateVersion();
  return getPrizeDrawInfo();
}

function consumePrizeDraw() {
  if (!wheelPrizeQueue.length) return;

  const current = wheelPrizeQueue[wheelPrizeIndex];
  if (!current || current.remaining <= 0) return;

  current.remaining -= 1;

  if (current.remaining <= 0) {
    wheelPrizeIndex += 1;
  }

  syncCurrentPrizeFromQueue();
}

function assertCanSpin() {
  if (!wheelPrizeQueue.length) return;

  syncCurrentPrizeFromQueue();

  if (wheelPrizeIndex >= wheelPrizeQueue.length) {
    throw new Error("Tous les prix ont été tirés.");
  }

  const current = wheelPrizeQueue[wheelPrizeIndex];
  if (!current || current.remaining <= 0) {
    throw new Error("Plus de tirages disponibles pour ce prix.");
  }
}

function setWheelSegments(rawSegments) {
  if (wheelState.spinning) {
    throw new Error("Attends la fin du tirage avant de modifier les segments.");
  }

  const segments = normalizeSegments(rawSegments);

  if (segments.length < 2) {
    throw new Error("Ajoute au moins 2 segments.");
  }

  if (segments.length > 24) {
    throw new Error("Maximum 24 segments.");
  }

  wheelState.segments = segments.map((segment, index) => ({
    label: segment.label,
    prize: segment.prize || null,
    color: WHEEL_PALETTE[index % WHEEL_PALETTE.length]
  }));
  wheelState.result = null;
  wheelRemovedPlayers = [];
  bumpWheelStateVersion();

  return getPublicWheelState();
}

function removeWinnerFromWheel(label) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) return;

  const index = wheelState.segments.findIndex((segment) => segment.label === cleanLabel);
  if (index < 0) return;

  wheelState.segments.splice(index, 1);
  wheelState.segments = wheelState.segments.map((segment, segmentIndex) => ({
    ...segment,
    color: WHEEL_PALETTE[segmentIndex % WHEEL_PALETTE.length]
  }));

  if (!wheelRemovedPlayers.includes(cleanLabel)) {
    wheelRemovedPlayers.push(cleanLabel);
  }
}

function getRemovedPlayers() {
  return [...wheelRemovedPlayers];
}

function restoreWheelPlayer(rawLabel) {
  if (wheelState.spinning) {
    throw new Error("Attends la fin du tirage avant de remettre un joueur.");
  }

  const label = String(rawLabel || "").trim();
  if (!label) {
    throw new Error("Choisis un joueur à remettre.");
  }

  const removedIndex = wheelRemovedPlayers.indexOf(label);
  if (removedIndex < 0) {
    throw new Error("Ce joueur n'est pas dans la liste des retirés.");
  }

  if (wheelState.segments.some((segment) => segment.label === label)) {
    throw new Error("Ce joueur est déjà sur la roue.");
  }

  if (wheelState.segments.length >= 24) {
    throw new Error("Maximum 24 segments sur la roue.");
  }

  wheelRemovedPlayers.splice(removedIndex, 1);
  removePlayerFromWinners(label);
  wheelState.segments.push({
    label,
    prize: null,
    color: WHEEL_PALETTE[wheelState.segments.length % WHEEL_PALETTE.length]
  });
  bumpWheelStateVersion();

  return getPublicWheelState();
}

function restoreAllWheelPlayers() {
  if (wheelState.spinning) {
    throw new Error("Attends la fin du tirage avant de remettre les joueurs.");
  }

  const labels = wheelRemovedPlayers.filter((label) => {
    return label && !wheelState.segments.some((segment) => segment.label === label);
  });

  if (!labels.length) {
    throw new Error("Aucun joueur à remettre.");
  }

  if (wheelState.segments.length + labels.length > 24) {
    throw new Error("Maximum 24 joueurs sur la roue.");
  }

  labels.forEach((label) => {
    removePlayerFromWinners(label);
    wheelState.segments.push({
      label,
      prize: null,
      color: WHEEL_PALETTE[wheelState.segments.length % WHEEL_PALETTE.length]
    });
  });

  wheelRemovedPlayers = wheelRemovedPlayers.filter((label) => !labels.includes(label));
  bumpWheelStateVersion();

  return getPublicWheelState();
}

function buildSpinPayload() {
  if (wheelState.spinning) {
    throw new Error("La roue est déjà en train de tourner.");
  }

  assertCanSpin();

  const count = wheelState.segments.length;
  if (count < 2) {
    throw new Error("Ajoute au moins 2 joueurs sur la roue.");
  }

  const slice = 360 / count;
  const targetIndex = Math.floor(Math.random() * count);
  const segmentCenter = targetIndex * slice + slice / 2;
  const targetRotation = WHEEL_POINTER_ANGLE + 90 - segmentCenter;
  const current = ((wheelState.rotation % 360) + 360) % 360;
  let delta = targetRotation - current;

  if (delta < 0) delta += 360;

  const extraTurns = 7 + Math.floor(Math.random() * 3);
  const endRotation = wheelState.rotation + delta + extraTurns * 360;
  const duration = 11000 + Math.random() * 3500;
  const activePrize = wheelCurrentPrize || null;

  return {
    segments: wheelState.segments.map((segment) => ({ ...segment })),
    startRotation: wheelState.rotation,
    endRotation,
    duration: Math.round(duration),
    targetIndex,
    winnerLabel: wheelState.segments[targetIndex].label,
    winnerPrize: activePrize
  };
}

function publishWheelSpin(payload) {
  wheelSpinCounter += 1;
  activeWheelSpin = {
    ...payload,
    spinId: wheelSpinCounter,
    startedAt: Date.now()
  };
  return activeWheelSpin;
}

function getActiveWheelSpin() {
  return activeWheelSpin;
}

function markWheelSpinning(payload) {
  wheelState.spinning = true;
  wheelState.result = null;
  return payload;
}

function completeWheelSpin(payload) {
  const spinId = activeWheelSpin?.spinId || wheelSpinCounter;
  wheelState.rotation = payload.endRotation;
  wheelState.spinning = false;
  wheelState.result = payload.winnerLabel;
  addWheelWinner(
    payload.winnerLabel,
    spinId,
    payload.winnerPrize || wheelCurrentPrize
  );
  removeWinnerFromWheel(payload.winnerLabel);
  consumePrizeDraw();
  bumpWheelStateVersion();
  activeWheelSpin = null;
  return getPublicWheelState();
}

function setWheelMusicEnabled(enabled) {
  wheelMusicEnabled = Boolean(enabled);
  bumpWheelStateVersion();
  return wheelMusicEnabled;
}

function resetWheelResult() {
  wheelState.result = null;
  return getPublicWheelState();
}

module.exports = {
  WHEEL_PALETTE,
  getWheelState,
  getPublicWheelState,
  setWheelSegments,
  setWheelPrizeQueue,
  clearWheelPrizeQueue,
  buildSpinPayload,
  publishWheelSpin,
  getActiveWheelSpin,
  markWheelSpinning,
  completeWheelSpin,
  resetWheelResult,
  clearWheelWinners,
  clearAllWheelWinnerGroups,
  closeWheelWinnerSeries,
  getWheelWinners,
  getWheelWinnersBoard,
  setWheelPrize,
  setWheelMusicEnabled,
  getWheelPrize,
  getPrizeDrawInfo,
  getRemovedPlayers,
  restoreWheelPlayer,
  restoreAllWheelPlayers,
  MAX_WHEEL_WINNERS
};
