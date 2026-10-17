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
  let applauseSource = null;
  let applauseToken = 0;
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

  function unlock() {
    const ctx = context();
    if (!ctx) return Promise.resolve();
    const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    return Promise.all([resume, bufferFor("ding"), bufferFor("buzz"), bufferFor("applause")]).then(() => {});
  }

  function playBuffer(ctx, name, buffer, token) {
    if (name === "applause" && token !== applauseToken) return;
    if (name !== "applause" && cueSource) {
      try { cueSource.stop(); } catch (error) { /* déjà arrêté */ }
      cueSource = null;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (applauseSource === source) applauseSource = null;
    };
    if (name === "applause") applauseSource = source;
    else cueSource = source;
    try { source.start(0); } catch (error) { /* contexte pas prêt */ }
  }

  function startBuffer(name) {
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
    applauseToken += 1;
    if (!applauseSource) return;
    try { applauseSource.stop(); } catch (error) { /* déjà arrêté */ }
    applauseSource = null;
  }

  function env(ctx, at, attack, dur, volume) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    gain.connect(ctx.destination);
    return gain;
  }

  function tone(freq, delay, dur, type, volume) {
    const ctx = context();
    if (!ctx || ctx.state !== "running") return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.connect(env(ctx, at, 0.015, dur, volume));
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function fanfare() {
    tone(523, 0, 0.22, "triangle", 0.18);
    tone(659, 0.12, 0.22, "triangle", 0.18);
    tone(784, 0.24, 0.22, "triangle", 0.18);
    tone(1046, 0.36, 0.4, "triangle", 0.2);
  }

  function play(type) {
    if (type === "reveal" || type === "faceoff-win" || type === "steal-win") startBuffer("ding");
    else if (type === "strike" || type === "steal-start" || type === "steal-miss") startBuffer("buzz");
    else if (type === "done") startBuffer("applause");
    else if (type === "silence") stop();
    else if (type === "award") fanfare();
  }

  global.FeudSounds = { unlock, play, stop };
})(window);
