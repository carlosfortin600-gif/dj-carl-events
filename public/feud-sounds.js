(function initFeudSounds(global) {
  const files = {
    ding: "/feud-ding.mp3",
    buzz: "/feud-buzz.mp3",
    applause: "/feud-applause.mp3"
  };
  const raws = {};
  const loads = {};
  const buffers = {};
  let audioContext = null;
  let masterGain = null;
  let applauseSource = null;
  let applauseToken = 0;
  let playToken = 0;
  let cueSource = null;

  function context() {
    if (!audioContext) {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    return audioContext;
  }

  function rawFor(name) {
    if (!raws[name]) {
      raws[name] = fetch(files[name]).then((res) => {
        if (!res.ok) throw new Error("son");
        return res.arrayBuffer();
      });
    }
    return raws[name];
  }

  function bufferFor(name) {
    if (!loads[name]) {
      loads[name] = rawFor(name).then((raw) => context().decodeAudioData(raw.slice(0))).then((buffer) => {
        buffers[name] = buffer;
        return buffer;
      });
    }
    return loads[name];
  }

  rawFor("ding");
  rawFor("buzz");
  rawFor("applause");

  let master = 1;
  let clipToken = 0;
  let primeToken = 0;
  let armed = false;
  const clips = {};

  function output(ctx) {
    if (!masterGain || masterGain.context !== ctx) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    masterGain.gain.value = master;
    return masterGain;
  }
  function setVolume(level) {
    const n = Number(level);
    master = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
    if (masterGain) masterGain.gain.value = master;
    Object.keys(clips).forEach((name) => {
      try { clips[name].volume = master; } catch (error) { /* pas encore prêt */ }
    });
  }
  function clip(name) {
    if (!clips[name]) {
      const audio = new Audio(files[name]);
      audio.preload = "auto";
      clips[name] = audio;
    }
    return clips[name];
  }
  clip("ding");
  clip("buzz");
  clip("applause");

  function playClip(name) {
    if (master <= 0) return;
    primeToken += 1;
    const token = clipToken;
    const audio = clip(name);
    audio.muted = false;
    try { audio.volume = master; } catch (error) { /* pas encore prêt */ }
    audio.pause();
    try { audio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
    const pending = audio.play();
    if (pending) {
      pending.then(() => {
        if (token !== clipToken) {
          audio.pause();
          try { audio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
        }
      }).catch(() => {});
    }
  }

  function armClip(audio) {
    const token = primeToken;
    audio.muted = true;
    const pending = audio.play();
    const finish = () => {
      if (token !== primeToken) return true;
      audio.pause();
      try { audio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
      audio.muted = false;
      try { audio.volume = master; } catch (error) { /* pas encore prêt */ }
      return true;
    };
    if (pending && pending.then) return pending.then(finish).catch(() => false);
    return Promise.resolve(finish());
  }

  function unlock() {
    if (armed) return Promise.resolve(true);
    const ctx = context();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    bufferFor("ding").catch(() => {});
    bufferFor("buzz").catch(() => {});
    bufferFor("applause").catch(() => {});
    return Promise.all(["ding", "buzz", "applause"].map((name) => armClip(clip(name)))).then((flags) => {
      const ctxOk = !!(ctx && ctx.state === "running");
      if (flags.some(Boolean) || ctxOk) armed = true;
      return armed;
    });
  }

  function isUnlocked() {
    return armed || !!(audioContext && audioContext.state === "running");
  }

  function playBuffer(ctx, name, buffer, token) {
    if (name === "applause" && token !== applauseToken) return;
    if (name !== "applause" && cueSource) {
      try { cueSource.stop(); } catch (error) { /* déjà arrêté */ }
      cueSource = null;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(output(ctx));
    source.onended = () => {
      if (applauseSource === source) applauseSource = null;
    };
    if (name === "applause") applauseSource = source;
    else cueSource = source;
    if (ctx.state !== "running") ctx.resume();
    try { source.start(0); } catch (error) { /* contexte pas prêt */ }
  }

  function startBuffer(name) {
    primeToken += 1;
    const ctx = context();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const token = name === "applause" ? ++applauseToken : 0;
    if (buffers[name]) {
      playBuffer(ctx, name, buffers[name], token);
      return;
    }
    bufferFor(name).then((buffer) => {
      playBuffer(ctx, name, buffer, token);
    }).catch(() => {});
  }

  function stop() {
    playToken += 1;
    clipToken += 1;
    applauseToken += 1;
    ["ding", "buzz", "applause"].forEach((name) => {
      const audio = clips[name];
      if (!audio) return;
      audio.pause();
      try { audio.currentTime = 0; } catch (error) { /* pas encore prêt */ }
    });
    if (!applauseSource) return;
    try { applauseSource.stop(); } catch (error) { /* déjà arrêté */ }
    applauseSource = null;
  }

  function env(ctx, at, attack, dur, volume) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    gain.connect(output(ctx));
    return gain;
  }

  function tone(freq, delay, dur, type, volume) {
    if (master <= 0) return;
    const ctx = context();
    if (!ctx || ctx.state !== "running") return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.connect(env(ctx, at, 0.015, dur, volume * master));
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function fanfare() {
    tone(523, 0, 0.22, "triangle", 0.18);
    tone(659, 0.12, 0.22, "triangle", 0.18);
    tone(784, 0.24, 0.22, "triangle", 0.18);
    tone(1046, 0.36, 0.4, "triangle", 0.2);
  }

  function playCue(name) {
    const ctx = context();
    if (ctx && ctx.state === "running") {
      startBuffer(name);
      return;
    }
    playClip(name);
  }

  function play(type) {
    if (master <= 0) return;
    if (type === "silence") {
      stop();
      return;
    }
    const token = playToken;
    if (type === "dingding") {
      playCue("ding");
      setTimeout(() => { if (token === playToken) playCue("ding"); }, 160);
    } else if (type === "reveal" || type === "faceoff-win" || type === "steal-win") playCue("ding");
    else if (type === "strike" || type === "steal-start" || type === "steal-miss") playCue("buzz");
    else if (type === "done") playCue("applause");
    else if (type === "award") fanfare();
  }

  global.FeudSounds = { unlock, play, stop, setVolume, isUnlocked };
})(window);
