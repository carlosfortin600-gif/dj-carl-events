(function () {
  function initSignaturePad(canvas, hiddenInput, existingDataUrl) {
    if (!canvas || !hiddenInput) return null;

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
      hiddenInput.value = canvas.toDataURL("image/jpeg", 0.82);
    };

    let drawing = false;
    let hasInk = false;

    const drawImage = (dataUrl, opts = {}) => {
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        hasInk = true;
        if (!opts.keepStoredValue) syncHidden();
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
      hiddenInput.value = existingDataUrl;
      drawImage(existingDataUrl, { keepStoredValue: true });
      hasInk = true;
    }

    return {
      syncHidden,
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

  function prepareSignatureFieldsForSubmit(form) {
    form.querySelectorAll("[data-signature-pad]").forEach((wrap) => {
      const hiddenInput = wrap.querySelector('input[type="hidden"]');
      const pad = wrap._signaturePad;
      if (!hiddenInput) return;

      pad?.syncHidden?.();

      const initial = wrap.dataset.signatureInitial || "";
      const current = hiddenInput.value || "";
      if (current === initial) {
        hiddenInput.removeAttribute("name");
      }
    });
  }

  document.querySelectorAll("[data-signature-pad]").forEach((wrap) => {
    const canvas = wrap.querySelector("canvas");
    const hiddenInput = wrap.querySelector('input[type="hidden"]');
    const clearBtn = wrap.querySelector("[data-signature-clear]");
    const existing = hiddenInput?.value || "";

    wrap.dataset.signatureInitial = existing;

    const pad = initSignaturePad(canvas, hiddenInput, existing);
    wrap._signaturePad = pad;
    if (clearBtn && pad) {
      clearBtn.addEventListener("click", () => pad.clear());
    }
  });

  if (!document.documentElement.dataset.signatureSubmitPrep) {
    document.documentElement.dataset.signatureSubmitPrep = "1";
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!form || form.tagName !== "FORM") return;
        prepareSignatureFieldsForSubmit(form);
      },
      true
    );
  }
})();
