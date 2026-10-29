(function () {
  const BLEEP_SRC = "/audio/sound-effect---bleep-blooper-tv-peep.wav";
  const BUZZ_SRC = "/audio/timer-buzz.mp3";

  let bleepAudio = null;
  let buzzAudio = null;
  let audioContext = null;
  let bleepBuffer = null;
  let buzzBuffer = null;
  let bleepLoading = null;
  let buzzLoading = null;
  let countdownActive = false;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function loadBuffer(src, getBuffer, setBuffer, getLoading, setLoading) {
    const ready = getBuffer();
    if (ready) return Promise.resolve(ready);

    const pending = getLoading();
    if (pending) return pending;

    const loading = fetch(src)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => getAudioContext().decodeAudioData(arrayBuffer))
      .then((buffer) => {
        setBuffer(buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        setLoading(null);
      });

    setLoading(loading);
    return loading;
  }

  function loadBleepBuffer() {
    return loadBuffer(
      BLEEP_SRC,
      () => bleepBuffer,
      (buffer) => {
        bleepBuffer = buffer;
      },
      () => bleepLoading,
      (loading) => {
        bleepLoading = loading;
      }
    );
  }

  function loadBuzzBuffer() {
    return loadBuffer(
      BUZZ_SRC,
      () => buzzBuffer,
      (buffer) => {
        buzzBuffer = buffer;
      },
      () => buzzLoading,
      (loading) => {
        buzzLoading = loading;
      }
    );
  }

  function playBleepFallback() {
    if (!bleepAudio) {
      bleepAudio = new Audio(BLEEP_SRC);
      bleepAudio.preload = "auto";
    }

    bleepAudio.currentTime = 0;
    bleepAudio.play().catch(() => {});
  }

  function playBleep() {
    const context = getAudioContext();

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    if (!bleepBuffer) {
      loadBleepBuffer().then((buffer) => {
        if (buffer) {
          playBleep();
        } else {
          playBleepFallback();
        }
      });
      return;
    }

    const source = context.createBufferSource();
    source.buffer = bleepBuffer;
    source.connect(context.destination);
    source.start(0);
  }

  function playBuzzFallback() {
    if (!buzzAudio) {
      buzzAudio = new Audio(BUZZ_SRC);
      buzzAudio.preload = "auto";
    }

    buzzAudio.currentTime = 0;
    buzzAudio.play().catch(() => {});
  }

  function playBuzz() {
    const context = getAudioContext();

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    if (!buzzBuffer) {
      loadBuzzBuffer().then((buffer) => {
        if (buffer) {
          playBuzz();
        } else {
          playBuzzFallback();
        }
      });
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buzzBuffer;
    source.connect(context.destination);
    source.start(0);
  }

  function handleTimerFinished(data) {
    if (Number(data?.remaining) > 0) return;
    playBuzz();
  }

  function resetTimerTickSound() {
    countdownActive = false;
  }

  function handleTimerTick() {
    if (countdownActive) return;
    playBleep();
  }

  function handleCountdownSound(data) {
    const value = Number(data?.value);

    if (value === -1) {
      countdownActive = false;
      return;
    }

    countdownActive = true;

    if (value >= 0 && value <= 3) {
      playBleep();
    }
  }

  window.TimerSounds = {
    handleTimerTick,
    handleTimerFinished,
    handleCountdownSound,
    resetTimerTickSound,
    unlockAudio() {
      loadBleepBuffer();
      loadBuzzBuffer();
      getAudioContext().resume().catch(() => {});

      if (bleepAudio) {
        bleepAudio.play().then(() => {
          bleepAudio.pause();
          bleepAudio.currentTime = 0;
        }).catch(() => {});
      }
    }
  };
})();
