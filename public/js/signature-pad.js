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

    const fillWhite = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    fillWhite();

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
        fillWhite();
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
        fillWhite();
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

  function applySignaturePayload(form, payload) {
    if (!form || !payload) return;

    form.querySelectorAll("[data-signature-pad]").forEach((wrap) => {
      const field = wrap.dataset.signatureField;
      if (!field) return;
      const existing = payload[field] || "";
      const hiddenInput = wrap.querySelector('input[type="hidden"]');
      if (hiddenInput) hiddenInput.value = existing;
      wrap.dataset.signatureInitial = existing;
      const pad = wrap._signaturePad;
      if (pad) {
        if (existing) pad.load(existing);
        else pad.clear();
      }
    });

    document.querySelectorAll("[data-signature-preview]").forEach((img) => {
      const field = img.dataset.signaturePreview;
      const dataUrl = payload[field];
      if (!dataUrl) return;
      img.src = dataUrl;
      img.hidden = false;
      const placeholder = document.querySelector(
        `[data-signature-preview-placeholder="${field}"]`
      );
      if (placeholder) placeholder.hidden = true;
    });
  }

  function loadDeferredContractSignatures(form) {
    const url = form?.dataset?.contractSignaturesUrl;
    if (!url) return Promise.resolve();

    return fetch(url, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) applySignaturePayload(form, payload);
      })
      .catch(() => {});
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

  document.querySelectorAll("form[data-contract-signatures-url]").forEach((form) => {
    loadDeferredContractSignatures(form);
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
