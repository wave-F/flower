export function createExplosionFx({ boardShellElement } = {}) {
  if (!boardShellElement) {
    return createNoopFx();
  }

  const canvas = document.createElement("canvas");
  canvas.className = "board-explosion-layer";
  boardShellElement.appendChild(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return createNoopFx();
  }

  const waves = [];
  const particles = [];
  let rafId = 0;
  let lastFrameTime = 0;
  let width = 1;
  let height = 1;

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
      syncCanvasSize();
    })
    : null;
  resizeObserver?.observe(boardShellElement);
  syncCanvasSize();

  function createNoopFx() {
    return {
      clear() {},
      emitExplosion() {},
    };
  }

  function syncCanvasSize() {
    const rect = boardShellElement.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width === Math.round(nextWidth * dpr) && canvas.height === Math.round(nextHeight * dpr)) {
      width = nextWidth;
      height = nextHeight;
      return;
    }

    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(nextWidth * dpr);
    canvas.height = Math.round(nextHeight * dpr);
    canvas.style.width = `${nextWidth}px`;
    canvas.style.height = `${nextHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function emitExplosion({ rect, strength = 1, maxRadius = null } = {}) {
    if (!rect) {
      return;
    }

    syncCanvasSize();
    const shellRect = boardShellElement.getBoundingClientRect();
    const centerX = rect.left - shellRect.left + rect.width / 2;
    const centerY = rect.top - shellRect.top + rect.height / 2;
    const baseRadius = Math.max(rect.width, rect.height) * 0.56;
    const normalizedStrength = Math.max(0.8, Math.min(strength, 2.2));
    const cappedRadius = Number.isFinite(maxRadius)
      ? Math.max(baseRadius * 0.9, maxRadius)
      : baseRadius * (2.7 + normalizedStrength * 0.5);

    waves.push({
      x: centerX,
      y: centerY,
      radius: baseRadius * 0.32,
      maxRadius: cappedRadius * 0.92,
      thickness: Math.max(10, baseRadius * 0.5),
      life: 0.24 + normalizedStrength * 0.03,
      elapsed: 0,
      fillAlpha: 0.16 + normalizedStrength * 0.04,
      glowAlpha: 0.94,
      coreAlpha: 1,
    });
    waves.push({
      x: centerX,
      y: centerY,
      radius: 0,
      maxRadius: Math.min(cappedRadius * 0.52, baseRadius * 1.18),
      thickness: 0,
      life: 0.12,
      elapsed: 0,
      fillAlpha: 0.58,
      glowAlpha: 0,
      coreAlpha: 0,
    });
    waves.push({
      x: centerX,
      y: centerY,
      radius: baseRadius * 0.08,
      maxRadius: cappedRadius,
      thickness: Math.max(6, baseRadius * 0.28),
      life: 0.2 + normalizedStrength * 0.03,
      elapsed: 0,
      delay: 0.02,
      fillAlpha: 0,
      glowAlpha: 0.5,
      coreAlpha: 0.72,
    });

    const particleCount = Math.round(18 + normalizedStrength * 7);
    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + (Math.random() - 0.5) * 0.26;
      const speed = (170 + Math.random() * 210) * (0.92 + normalizedStrength * 0.24);
      const life = 0.26 + Math.random() * 0.22;
      const distance = Math.random() * baseRadius * 0.24;
      particles.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        previousX: centerX,
        previousY: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 4.8 + Math.random() * 2.6,
        gravity: 42 + Math.random() * 28,
        life,
        maxLife: life,
        size: 1.8 + Math.random() * 3.6 + normalizedStrength * 0.45,
      });
    }

    shakeBoard(normalizedStrength);
    ensureAnimationLoop();
  }

  function shakeBoard(strength) {
    const amplitude = Math.min(11, 3 + strength * 2.2);
    boardShellElement.animate([
      { transform: "translate3d(0, 0, 0)" },
      { transform: `translate3d(${-amplitude}px, 0, 0)` },
      { transform: `translate3d(${amplitude * 0.9}px, 0, 0)` },
      { transform: `translate3d(${-(amplitude * 0.55)}px, 0, 0)` },
      { transform: "translate3d(0, 0, 0)" },
    ], {
      duration: 170 + strength * 36,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }

  function ensureAnimationLoop() {
    if (rafId) {
      return;
    }

    lastFrameTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function frame(timestamp) {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }

    const deltaSeconds = Math.min(0.032, Math.max(0.001, (timestamp - lastFrameTime) / 1000));
    lastFrameTime = timestamp;

    step(deltaSeconds);
    render();

    if (waves.length > 0 || particles.length > 0) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    rafId = 0;
    lastFrameTime = 0;
    context.clearRect(0, 0, width, height);
  }

  function step(deltaSeconds) {
    for (let index = waves.length - 1; index >= 0; index -= 1) {
      const wave = waves[index];
      wave.elapsed += deltaSeconds;
      const totalLife = wave.life + (wave.delay ?? 0);
      if (wave.elapsed >= totalLife) {
        waves.splice(index, 1);
      }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.previousX = particle.x;
      particle.previousY = particle.y;
      particle.vx *= Math.exp(-particle.drag * deltaSeconds);
      particle.vy = particle.vy * Math.exp(-particle.drag * deltaSeconds) + particle.gravity * deltaSeconds;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.life -= deltaSeconds;

      if (particle.life <= 0) {
        particles.splice(index, 1);
      }
    }
  }

  function render() {
    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = "lighter";

    for (const wave of waves) {
      const activeElapsed = wave.elapsed - (wave.delay ?? 0);
      if (activeElapsed < 0) {
        continue;
      }

      const progress = Math.max(0, Math.min(1, activeElapsed / wave.life));
      const radius = wave.radius + (wave.maxRadius - wave.radius) * progress;
      const alpha = Math.max(0, 1 - progress);

      if (wave.thickness > 0.1) {
        context.beginPath();
        context.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
        context.lineWidth = Math.max(2, wave.thickness * (1 - progress * 0.62));
        context.strokeStyle = `rgba(255, 176, 88, ${alpha * (wave.glowAlpha ?? 0.8)})`;
        context.stroke();

        context.beginPath();
        context.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
        context.lineWidth = Math.max(1, wave.thickness * 0.34 * (1 - progress * 0.48));
        context.strokeStyle = `rgba(255, 248, 222, ${alpha * (wave.coreAlpha ?? 0.96)})`;
        context.stroke();
      }

      if (wave.fillAlpha > 0) {
        context.beginPath();
        context.arc(wave.x, wave.y, Math.max(2, radius * 0.42), 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 245, 216, ${alpha * wave.fillAlpha})`;
        context.fill();
      }
    }

    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);

      context.beginPath();
      context.moveTo(particle.previousX, particle.previousY);
      context.lineTo(particle.x, particle.y);
      context.lineWidth = Math.max(1, particle.size * 0.42 * alpha);
      context.strokeStyle = `rgba(255, 188, 95, ${alpha * 0.75})`;
      context.stroke();

      context.beginPath();
      context.arc(particle.x, particle.y, Math.max(0.8, particle.size * alpha), 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 244, 214, ${alpha})`;
      context.fill();
    }

    context.restore();
  }

  function clear() {
    waves.length = 0;
    particles.length = 0;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastFrameTime = 0;
    context.clearRect(0, 0, width, height);
  }

  return {
    clear,
    emitExplosion,
  };
}
