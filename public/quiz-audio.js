(function initQuizAudio(global) {
  let questionAudio = null;
  let clipStopTimer = null;

  function resolveAudioUrl(filename) {
    const clean = String(filename || "").trim();
    if (!clean) return "";

    if (/^https?:\/\//i.test(clean)) {
      return clean;
    }

    if (clean.startsWith("/audio/")) {
      return clean;
    }

    return `/audio/${clean.replace(/^\/+/, "")}`;
  }

  function clearClipStopTimer() {
    if (clipStopTimer) {
      clearTimeout(clipStopTimer);
      clipStopTimer = null;
    }
  }

  function stopQuestionAudio() {
    clearClipStopTimer();

    if (!questionAudio) return;

    questionAudio.pause();
    questionAudio.currentTime = 0;
    questionAudio = null;
  }

  function unlockAudio() {
    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    silent.volume = 0.01;
    silent.play().catch(() => {});
  }

  function playQuestionAudio(filename, options = {}) {
    stopQuestionAudio();

    const src = resolveAudioUrl(filename);
    if (!src) return false;

    const start = Math.max(0, Number(options.start) || 0);
    const duration = Math.max(0, Number(options.duration) || 0);

    questionAudio = new Audio(src);
    questionAudio.preload = "auto";

    const beginPlayback = () => {
      if (!questionAudio) return;

      if (start > 0) {
        questionAudio.currentTime = start;
      }

      questionAudio.play().catch((error) => {
        console.warn("Lecture audio impossible:", error);
      });

      if (duration > 0) {
        clipStopTimer = setTimeout(() => {
          stopQuestionAudio();
        }, duration * 1000);
      }
    };

    if (start > 0) {
      questionAudio.addEventListener("loadedmetadata", beginPlayback, { once: true });
      questionAudio.load();
    } else {
      beginPlayback();
    }

    return true;
  }

  global.QuizAudio = {
    resolveAudioUrl,
    stopQuestionAudio,
    unlockAudio,
    playQuestionAudio
  };
})(window);
