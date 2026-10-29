(function initWheelCore(global) {
  const POINTER_ANGLE = 0;

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function getIndexAtPointer(angleDegrees, segmentCount) {
    const slice = 360 / segmentCount;
    const normalized = ((POINTER_ANGLE - angleDegrees + 90) % 360 + 360) % 360;
    return Math.floor(normalized / slice) % segmentCount;
  }

  function createWheelController(options) {
    const canvas = options.canvas;
    const lightsEl = options.lightsEl;
    const ctx = canvas.getContext("2d");

    let segments = [];
    let rotation = 0;
    let spinning = false;
    let animationId = null;

    function getLayout() {
      const w = canvas.width;
      const h = canvas.height;
      const centerY = h * 0.5;
      const drumR = h * 0.44;
      const rimX = w * 0.1;
      const rimW = w * 0.7;
      const rimTop = centerY - drumR * 1.02;
      const rimH = drumR * 2.04;
      const pointerY = centerY;
      const pointerX = rimX + rimW + 6;
      return {
        w,
        h,
        centerY,
        drumR,
        rimX,
        rimW,
        rimTop,
        rimH,
        pointerY,
        pointerX,
        faceR: drumR,
        faceCy: centerY,
        faceRy: drumR
      };
    }

    function placeLights() {
      if (lightsEl) {
        lightsEl.innerHTML = "";
        lightsEl.style.display = "none";
      }
    }

    function rimPanelColor(index) {
      return index % 2 === 0 ? "#16a34a" : "#101010";
    }

    function rimTextColor(index) {
      return index % 2 === 0 ? "#1e3a8a" : "#ffffff";
    }

    function drawRimShell(layout) {
      const { rimX, rimTop, rimW, rimH } = layout;
      const pad = 6;

      ctx.fillStyle = "#1f2937";
      ctx.fillRect(rimX, rimTop, rimW, rimH);

      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 5;
      ctx.strokeRect(rimX, rimTop, rimW, rimH);

      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.strokeRect(rimX + pad, rimTop + pad, rimW - pad * 2, rimH - pad * 2);
    }

    function drawPointer(layout) {
      const { pointerX, pointerY, rimX, rimW } = layout;
      const tipX = rimX + rimW - 4;

      ctx.save();
      ctx.fillStyle = "#dc2626";
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tipX, pointerY);
      ctx.lineTo(pointerX + 34, pointerY - 22);
      ctx.lineTo(pointerX + 34, pointerY + 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#dc2626";
      ctx.fillRect(pointerX + 28, pointerY - 10, 38, 20);
      ctx.strokeRect(pointerX + 28, pointerY - 10, 38, 20);
      ctx.restore();
    }

    function drawWheel(angleDegrees) {
      const layout = getLayout();
      const {
        w,
        h,
        rimX,
        rimW,
        rimTop,
        rimH,
        pointerY
      } = layout;

      ctx.clearRect(0, 0, w, h);
      drawRimShell(layout);

      if (segments.length < 1) {
        return;
      }

      if (segments.length === 1) {
        const innerX = rimX + 10;
        const innerW = rimW - 20;
        const innerTop = rimTop + 10;
        const innerH = rimH - 20;
        const panelH = innerH - 8;
        const centerY = innerTop + innerH / 2;
        const segment = segments[0];

        ctx.fillStyle = rimPanelColor(0);
        ctx.fillRect(innerX, innerTop + 4, innerW, panelH);

        ctx.fillStyle = rimTextColor(0);
        ctx.font = `900 ${Math.max(14, Math.floor(panelH * 0.44))}px Arial Black, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 4;
        ctx.fillText(segment.label, innerX + innerW / 2, centerY);
        ctx.shadowBlur = 0;

        drawPointer(layout);
        return;
      }

      const count = segments.length;
      const slice = 360 / count;
      const segmentH = rimH / 3.4;
      const segmentGap = 14;
      const panelH = segmentH - segmentGap;
      const innerX = rimX + 10;
      const innerW = rimW - 20;
      const innerTop = rimTop + 10;
      const innerH = rimH - 20;
      const normalized = ((POINTER_ANGLE - angleDegrees + 90) % 360 + 360) % 360;
      const floatIndex = normalized / slice;
      const pointerOffset = pointerY - innerTop;
      const offset = floatIndex * segmentH - pointerOffset;
      const totalH = count * segmentH;

      ctx.save();
      ctx.beginPath();
      ctx.rect(innerX, innerTop, innerW, innerH);
      ctx.clip();

      const panels = [];
      for (let copy = -1; copy <= 1; copy += 1) {
        segments.forEach((segment, index) => {
          const top = innerTop + index * segmentH - offset + copy * totalH;
          const centerY = top + panelH / 2;
          if (top + panelH < innerTop || top > innerTop + innerH) return;

          panels.push({ segment, index, top, centerY });
        });
      }

      panels.forEach((panel) => {
        const { segment, index, top, centerY } = panel;
        const x = innerX;
        const width = innerW;
        const color = rimPanelColor(index);

        ctx.fillStyle = color;
        ctx.fillRect(x, top, width, panelH);

        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, top + panelH);
        ctx.lineTo(x + width, top + panelH);
        ctx.stroke();

        ctx.fillStyle = rimTextColor(index);
        ctx.font = `900 ${Math.max(14, Math.floor(panelH * 0.44))}px Arial Black, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 4;
        ctx.fillText(segment.label, x + width / 2, centerY);
        ctx.shadowBlur = 0;
      });

      ctx.restore();

      drawPointer(layout);
    }

    function lightenColor(hex, amount) {
      return mixColor(hex, "#ffffff", amount);
    }

    function darkenColor(hex, amount) {
      return mixColor(hex, "#000000", amount);
    }

    function mixColor(hex, target, amount) {
      const source = parseHex(hex);
      const dest = parseHex(target);
      const ratio = Math.max(0, Math.min(1, amount));
      const r = Math.round(source.r + (dest.r - source.r) * ratio);
      const g = Math.round(source.g + (dest.g - source.g) * ratio);
      const b = Math.round(source.b + (dest.b - source.b) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }

    function parseHex(hex) {
      const clean = String(hex || "#888888").replace("#", "");
      const value = clean.length === 3
        ? clean.split("").map((c) => c + c).join("")
        : clean.padEnd(6, "0");
      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
      };
    }

    function setSegments(nextSegments) {
      segments = Array.isArray(nextSegments) ? nextSegments.slice() : [];
      placeLights();
      drawWheel(rotation);
    }

    function setRotation(nextRotation) {
      rotation = Number(nextRotation) || 0;
      drawWheel(rotation);
    }

    function isSpinning() {
      return spinning;
    }

    function cancelAnimation() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }

    function animateSpin(payload, callbacks) {
      if (segments.length < 2) return;

      spinning = true;
      cancelAnimation();

      const startRotation = Number(payload.startRotation) || rotation;
      const endRotation = Number(payload.endRotation) || startRotation;
      const duration = Math.max(1, Number(payload.duration) || 5000);
      const serverStart = Number(payload.startedAt) || Date.now();
      const slice = 360 / segments.length;
      let lastTickStep = 0;

      rotation = startRotation;
      drawWheel(rotation);

      function frame() {
        const elapsed = Date.now() - serverStart;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuad(progress);
        rotation = startRotation + (endRotation - startRotation) * eased;
        drawWheel(rotation);

        const tickStep = Math.floor((rotation - startRotation) / slice);
        if (tickStep > lastTickStep && typeof callbacks?.onSegmentTick === "function") {
          for (let step = lastTickStep + 1; step <= tickStep; step += 1) {
            callbacks.onSegmentTick();
          }
          lastTickStep = tickStep;
        }

        if (progress < 1) {
          animationId = requestAnimationFrame(frame);
          return;
        }

        rotation = endRotation;
        drawWheel(rotation);
        spinning = false;
        animationId = null;

        if (typeof callbacks?.onComplete === "function") {
          callbacks.onComplete({
            rotation,
            winnerLabel: payload.winnerLabel,
            targetIndex: payload.targetIndex
          });
        }
      }

      if (Date.now() - serverStart >= duration) {
        rotation = endRotation;
        drawWheel(rotation);
        spinning = false;
        if (typeof callbacks?.onComplete === "function") {
          callbacks.onComplete({
            rotation,
            winnerLabel: payload.winnerLabel,
            targetIndex: payload.targetIndex
          });
        }
        return;
      }

      animationId = requestAnimationFrame(frame);
    }

    placeLights();
    drawWheel(rotation);

    return {
      setSegments,
      setRotation,
      drawWheel,
      animateSpin,
      isSpinning,
      getRotation: () => rotation,
      getIndexAtPointer: (angle) => getIndexAtPointer(angle, segments.length)
    };
  }

  global.WheelCore = {
    createWheelController,
    getIndexAtPointer
  };
})(window);
