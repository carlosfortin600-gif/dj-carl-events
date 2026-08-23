(function () {
  function initSignaturePad(canvas, hiddenInput, existingDataUrl) {
    if (!canvas || !hiddenInput) return;

    const ctx = canvas.getContext("2d");
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";

    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const syncHidden = () => {
      if (!hasInk) {
        hiddenInput.value = "";
        return;
      }
      hiddenInput.value = canvas.toDataURL("image/png");
    };

    let drawing = false;
    let hasInk = false;

    const drawImage = (dataUrl) => {
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        hasInk = true;
        syncHidden();
      };
      img.src = dataUrl;
    };

    const pointerPos = (e) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top
      };
    };

    const start = (e) => {
      drawing = true;
      hasInk = true;
      const p = pointerPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    };

    const move = (e) => {
      if (!drawing) return;
      const p = pointerPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    };

    const end = () => {
      if (!drawing) return;
      drawing = false;
      syncHidden();
    };

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);

    if (existingDataUrl) {
      drawImage(existingDataUrl);
      hiddenInput.value = existingDataUrl;
    }

    return {
      clear() {
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        hasInk = false;
        hiddenInput.value = "";
      },
      load(dataUrl) {
        if (dataUrl) drawImage(dataUrl);
        else this.clear();
      }
    };
  }

  document.querySelectorAll("[data-signature-pad]").forEach((wrap) => {
    const canvas = wrap.querySelector("canvas");
    const hiddenInput = wrap.querySelector('input[type="hidden"]');
    const clearBtn = wrap.querySelector("[data-signature-clear]");
    const existing = hiddenInput.value || "";

    const pad = initSignaturePad(canvas, hiddenInput, existing);
    if (clearBtn && pad) {
      clearBtn.addEventListener("click", () => pad.clear());
    }
  });
})();
