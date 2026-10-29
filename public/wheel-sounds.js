(function initWheelSounds(global) {
  const CLICK_SRC = "/audio/sound-effect---bleep-blooper-tv-peep.wav";
  const WIN_SRC = "/audio/price-is-right.mp3";
  const WIN_DELAY_MS = 2000;
  const MUSIC_KEY = "djcarlWheelMusicEnabled";
  const WIN_CLAIM_KEY = "djcarlWheelWinClaim";
  const MIN_TICK_GAP_MS = 68;
  const HOST_LIVE_KEY = "djcarlWheelHostSoundAt";
  const HOST_LIVE_MS = 2500;

  let audioContext = null;
  let unlocked = false;
  let lastTickAt = 0;
  let clickAudio = null;
  let winAudio = null;
  let winTimer = null;
  let winToken = 0;
  let winGestureToken = 0;
  let musicEnabled = true;
  let pendingWin = false;
  let winDueAt = 0;
  let viewerWinClaimAt = 0;
  let winClaimHandler = null;
  let outputRole = "viewer";
  let hostLiveAt = 0;
  let hostHeartbeat = null;
  let channel = null;

  function getContext() {
    if (!audioContext) {
      audioContext = new (global.AudioContext || global.webkitAudioContext)();
    }
    return audioContext;
  }

  function getClickAudio() {
    if (!clickAudio) {
      clickAudio = new Audio(CLICK_SRC);
      clickAudio.preload = "auto";
    }
    return clickAudio;
  }

  function getWinAudio() {
    if (!winAudio) {
      winAudio = new Audio(WIN_SRC);
      winAudio.preload = "auto";
      winAudio.volume = 1;
    }
    return winAudio;
  }

  function ensureChannel() {
    if (channel || typeof global.BroadcastChannel !== "function") return;
    channel = new BroadcastChannel("djcarl-wheel-audio");
    channel.onmessage = (event) => {
      if (event.data?.type === "host-live") {
        hostLiveAt = Number(event.data.at) || Date.now();
      }
      if (event.data?.type === "music") {
        setMusicEnabled(event.data.enabled);
      }
      if (event.data?.type === "win-claim") {
        noteWinClaim(event.data.at);
      }
    };
  }

  function readHostLiveAt() {
    let stored = 0;
    try {
      stored = Number(global.localStorage.getItem(HOST_LIVE_KEY)) || 0;
    } catch {
      stored = 0;
    }
    return Math.max(hostLiveAt, stored);
  }

  function hostIsLive() {
    return Date.now() - readHostLiveAt() < HOST_LIVE_MS;
  }

  function announceHost() {
    const at = Date.now();
    hostLiveAt = at;
    try {
      global.localStorage.setItem(HOST_LIVE_KEY, String(at));
    } catch {
      // Private browsing can block storage; the channel still covers this browser.
    }
    ensureChannel();
    channel?.postMessage({ type: "host-live", at });
  }

  function startHostHeartbeat() {
    if (outputRole !== "host" || hostHeartbeat) return;
    announceHost();
    hostHeartbeat = global.setInterval(announceHost, 1000);
  }

  function playWebAudioTick() {
    const ctx = getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.02);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "triangle";
    click.frequency.setValueAtTime(280, now + 0.012);
    clickGain.gain.setValueAtTime(0.0001, now + 0.012);
    clickGain.gain.linearRampToValueAtTime(0.14, now + 0.016);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(now + 0.012);
    click.stop(now + 0.055);
  }

  function playSampleTick() {
    const audio = getClickAudio();
    const clone = audio.cloneNode();
    clone.volume = 0.45;
    clone.playbackRate = 2.8;
    clone.currentTime = 0;
    clone.play().catch(() => {});
  }

  function primeOutput() {
    const ctx = getContext();
    let resumePromise = Promise.resolve();

    try {
      resumePromise = ctx.resume();
    } catch {
      resumePromise = Promise.resolve();
    }

    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // The sample below is the fallback if the context cannot start yet.
    }

    primeWinGesture();

    const audio = getClickAudio();
    audio.volume = 0.001;
    const playPromise = audio.play();
    const sampleSettled = playPromise
      ? playPromise.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 0.45;
          return true;
        }).catch(() => false)
      : Promise.resolve(false);

    return Promise.all([
      Promise.resolve(resumePromise).catch(() => {}),
      sampleSettled
    ]).then(([, sampleOk]) => ctx.state === "running" || Boolean(sampleOk));
  }

  function unlock() {
    if (unlocked) return Promise.resolve(true);

    return primeOutput().then((ok) => {
      if (!ok) return false;
      unlocked = true;
      if (outputRole === "host") startHostHeartbeat();
      try {
        playWebAudioTick();
      } catch {
        playSampleTick();
      }
      if (pendingWin && musicEnabled && outputRole === "viewer" && Date.now() - winDueAt < 3000) {
        pendingWin = false;
        announceWinClaim();
        startWinAudio();
      } else {
        pendingWin = false;
      }
      return true;
    });
  }

  function playTick() {
    if (outputRole === "viewer" && hostIsLive()) return;

    const nowMs = Date.now();
    if (nowMs - lastTickAt < MIN_TICK_GAP_MS) return;

    try {
      const ctx = getContext();
      if (ctx.state === "running") {
        unlocked = true;
        if (outputRole === "host") startHostHeartbeat();
        lastTickAt = nowMs;
        playWebAudioTick();
        return;
      }
    } catch {
      // Fall through to the recorded click.
    }

    if (!unlocked) return;

    lastTickAt = nowMs;
    playSampleTick();
  }

  function primeWinGesture() {
    const audio = getWinAudio();
    const token = ++winGestureToken;
    audio.volume = 0.001;
    const pending = audio.play();
    if (!pending) return;
    pending.then(() => {
      if (token !== winGestureToken) return;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }).catch(() => {
      if (token === winGestureToken) audio.volume = 1;
    });
  }

  function readMusicEnabled() {
    try {
      const value = global.localStorage.getItem(MUSIC_KEY);
      if (value === "0") return false;
      if (value === "1") return true;
    } catch {
      return true;
    }
    return true;
  }

  function noteWinClaim(at) {
    viewerWinClaimAt = Number(at) || Date.now();
  }

  function viewerClaimedWin() {
    let stored = 0;
    try {
      stored = Number(global.localStorage.getItem(WIN_CLAIM_KEY)) || 0;
    } catch {
      stored = 0;
    }
    const at = Math.max(viewerWinClaimAt, stored);
    return Date.now() - at < 5000;
  }

  function announceWinClaim() {
    const at = Date.now();
    noteWinClaim(at);
    try {
      global.localStorage.setItem(WIN_CLAIM_KEY, String(at));
    } catch {
      // The socket claim still reaches the other screen.
    }
    ensureChannel();
    channel?.postMessage({ type: "win-claim", at });
    if (typeof winClaimHandler === "function") {
      winClaimHandler(at);
    }
  }

  function setWinClaimHandler(handler) {
    winClaimHandler = typeof handler === "function" ? handler : null;
  }

  function startWinAudio() {
    const audio = getWinAudio();
    audio.volume = 1;
    try {
      audio.currentTime = 0;
    } catch {
      // The file may still be loading.
    }
    audio.play().catch(() => {});
  }

  function setMusicEnabled(enabled, announce) {
    musicEnabled = Boolean(enabled);
    if (!musicEnabled) {
      pendingWin = false;
      stopWinTune();
    }
    if (!announce) return musicEnabled;

    try {
      global.localStorage.setItem(MUSIC_KEY, musicEnabled ? "1" : "0");
    } catch {
      // The viewer on this computer still hears the channel message.
    }
    ensureChannel();
    channel?.postMessage({ type: "music", enabled: musicEnabled });
    return musicEnabled;
  }

  function stopWinTune() {
    winToken += 1;
    pendingWin = false;
    if (winTimer) {
      clearTimeout(winTimer);
      winTimer = null;
    }
    if (!winAudio) return;
    winAudio.pause();
    try {
      winAudio.currentTime = 0;
    } catch {
      // The file may still be loading.
    }
  }

  function playWinTune() {
    stopWinTune();
    winGestureToken += 1;
    if (!musicEnabled) return;

    winDueAt = Date.now() + WIN_DELAY_MS;
    if (outputRole === "viewer" && unlocked) {
      announceWinClaim();
    }

    const token = winToken;
    winTimer = global.setTimeout(() => {
      winTimer = null;
      if (token !== winToken || !musicEnabled) return;

      if (outputRole === "viewer" && !unlocked) {
        pendingWin = true;
        return;
      }

      if (outputRole === "host" && viewerClaimedWin()) return;

      if (outputRole === "viewer") announceWinClaim();
      startWinAudio();
    }, WIN_DELAY_MS);
  }

  function mountUnlockButton(options) {
    const root = options?.root || document.body;
    const existing = document.getElementById("wheelSoundUnlock");
    if (existing) return existing;

    const button = document.createElement("button");
    button.id = "wheelSoundUnlock";
    button.type = "button";
    button.textContent = options?.label || "Activer le son";
    button.className = options?.className || "wheel-sound-unlock";

    button.addEventListener("click", async () => {
      const ok = await unlock();
      if (ok) {
        button.remove();
        if (typeof options?.onUnlocked === "function") {
          options.onUnlocked();
        }
      }
    });

    root.appendChild(button);
    return button;
  }

  function setOutputRole(role) {
    outputRole = role === "host" ? "host" : "viewer";
    ensureChannel();
  }

  musicEnabled = readMusicEnabled();
  getWinAudio();

  global.WheelSounds = {
    playTick,
    playWinTune,
    stopWinTune,
    unlock,
    mountUnlockButton,
    setOutputRole,
    setMusicEnabled,
    noteWinClaim,
    setWinClaimHandler,
    isMusicEnabled: () => musicEnabled,
    isUnlocked: () => unlocked
  };
})(window);
