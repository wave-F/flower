import { TILE_KIND_MAP } from "../config/tileKinds.js";

export function createHudView({ elements, appTitle, onEliminationComboResolve = null }) {
  const COMBO_TIERS = [
    { key: "legendary", minCount: 80, title: "Legendary" },
    { key: "amazing", minCount: 60, title: "Amazing" },
    { key: "great", minCount: 40, title: "Great" },
    { key: "nice", minCount: 20, title: "Nice" },
  ];
  const COMBO_DISPLAY_THRESHOLD = COMBO_TIERS[COMBO_TIERS.length - 1].minCount;
  let comboAnimationFrame = 0;
  let comboDisplayedCount = 0;
  let comboTargetCount = 0;

  function positionCascadeToast() {
    const boardRect = elements.boardElement.getBoundingClientRect();
    elements.cascadeToastElement.style.left = `${Math.round(boardRect.right - 8)}px`;
    elements.cascadeToastElement.style.top = `${Math.round(boardRect.top + 8)}px`;
  }

  function ensureComboToastContent() {
    let contentElement = elements.cascadeToastElement.querySelector(".cascade-toast-content");
    let labelElement = elements.cascadeToastElement.querySelector(".cascade-toast-label");
    let valueElement = elements.cascadeToastElement.querySelector(".cascade-toast-value");
    if (contentElement && labelElement && valueElement) {
      return { contentElement, labelElement, valueElement };
    }

    elements.cascadeToastElement.textContent = "";
    contentElement = document.createElement("span");
    contentElement.className = "cascade-toast-content";

    labelElement = document.createElement("span");
    labelElement.className = "cascade-toast-label";
    labelElement.textContent = "连续消除";

    valueElement = document.createElement("span");
    valueElement.className = "cascade-toast-value";
    valueElement.textContent = String(COMBO_DISPLAY_THRESHOLD);

    contentElement.append(labelElement, valueElement);
    elements.cascadeToastElement.append(contentElement);
    return { contentElement, labelElement, valueElement };
  }

  function renderComboToast(count) {
    const { contentElement, labelElement, valueElement } = ensureComboToastContent();
    const normalizedCount = Math.max(0, Math.floor(count));
    const comboOverage = Math.max(0, normalizedCount - COMBO_DISPLAY_THRESHOLD);
    const comboScale = 1 + Math.min(0.46, comboOverage * 0.026);
    const comboTilt = Math.max(-10, Math.min(10, -4 + comboOverage * 0.35));
    const comboTier = getComboTier(normalizedCount);

    labelElement.textContent = `${comboTier.title} 连续消除`;
    valueElement.textContent = String(normalizedCount);
    elements.cascadeToastElement.dataset.comboTier = comboTier.key;
    contentElement.style.setProperty("--combo-scale", comboScale.toFixed(3));
    contentElement.style.setProperty("--combo-tilt", `${comboTilt.toFixed(2)}deg`);
  }

  function getComboTier(count) {
    return COMBO_TIERS.find((tier) => count >= tier.minCount) ?? COMBO_TIERS[COMBO_TIERS.length - 1];
  }

  function stopComboAnimation() {
    if (!comboAnimationFrame) {
      return;
    }

    cancelAnimationFrame(comboAnimationFrame);
    comboAnimationFrame = 0;
  }

  function consumeComboRewardPayload() {
    if (comboTargetCount < COMBO_DISPLAY_THRESHOLD) {
      return null;
    }

    const contentElement = elements.cascadeToastElement.querySelector(".cascade-toast-content");
    const sourceRect = contentElement?.getBoundingClientRect() ?? elements.cascadeToastElement.getBoundingClientRect() ?? null;
    return {
      count: comboTargetCount,
      sourceRect,
    };
  }

  function animateComboValue(fromCount, toCount) {
    stopComboAnimation();

    const normalizedFrom = Math.max(COMBO_DISPLAY_THRESHOLD, Math.floor(fromCount));
    const normalizedTo = Math.max(normalizedFrom, Math.floor(toCount));
    if (normalizedTo === normalizedFrom) {
      comboDisplayedCount = normalizedTo;
      renderComboToast(comboDisplayedCount);
      return;
    }

    const duration = Math.min(420, Math.max(180, (normalizedTo - normalizedFrom) * 48));
    let startTime = 0;

    const step = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const progress = Math.min(1, (timestamp - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      comboDisplayedCount = Math.floor(normalizedFrom + (normalizedTo - normalizedFrom) * easedProgress);
      renderComboToast(comboDisplayedCount);

      if (progress >= 1) {
        comboDisplayedCount = normalizedTo;
        renderComboToast(comboDisplayedCount);
        comboAnimationFrame = 0;
        return;
      }

      comboAnimationFrame = requestAnimationFrame(step);
    };

    comboAnimationFrame = requestAnimationFrame(step);
  }

  function renderLevelHud({ level, movesUsed, goalProgress }) {
    elements.levelBadgeElement.textContent = String(level.id);
    elements.moveLabelElement.textContent = String(Math.max(level.moveLimit - movesUsed, 0));
    
    const heroBadge = elements.levelBadgeElement.closest(".hero-badge");
    if (heroBadge) {
      heroBadge.classList.add("hero-badge--no-icon");
    }

    renderGoalList(level.goals, goalProgress);
  }

  function showLevelOverlay({ title, detail, actionLabel }) {
    elements.levelOverlayTitleElement.textContent = title;
    elements.levelOverlayDetailElement.textContent = detail ?? "";
    elements.nextLevelButtonElement.textContent = actionLabel;
    elements.levelOverlayElement.hidden = false;
  }

  function hideLevelOverlay() {
    elements.levelOverlayElement.hidden = true;
  }

  function setStatus(title, detail) {
    document.title = detail ? `${title} - ${appTitle}` : appTitle;
  }

  function showEliminationCombo(count) {
    if (!Number.isFinite(count) || count < COMBO_DISPLAY_THRESHOLD) {
      return;
    }

    positionCascadeToast();
    elements.cascadeToastElement.hidden = false;
    ensureComboToastContent();

    const wasVisible = elements.cascadeToastElement.classList.contains("is-visible");
    elements.cascadeToastElement.classList.add("is-visible");
    elements.cascadeToastElement.classList.remove("is-bumping");
    void elements.cascadeToastElement.offsetWidth;
    elements.cascadeToastElement.classList.add("is-bumping");

    const nextTargetCount = Math.floor(count);
    const animationStartCount = comboDisplayedCount > 0 ? comboDisplayedCount : COMBO_DISPLAY_THRESHOLD;
    comboTargetCount = Math.max(comboTargetCount, nextTargetCount);
    if (!wasVisible) {
      comboDisplayedCount = animationStartCount;
      renderComboToast(comboDisplayedCount);
    }

    animateComboValue(animationStartCount, comboTargetCount);
  }

  function hideEliminationCombo({ immediate = false, collectReward = true } = {}) {
    stopComboAnimation();
    const rewardPayload = collectReward ? consumeComboRewardPayload() : null;
    comboDisplayedCount = 0;
    comboTargetCount = 0;
    delete elements.cascadeToastElement.dataset.comboTier;
    elements.cascadeToastElement.classList.remove("is-bumping");
    elements.cascadeToastElement.classList.remove("is-visible");

    const rewardPromise = rewardPayload
      ? Promise.resolve(onEliminationComboResolve?.(rewardPayload)).catch(() => {})
      : Promise.resolve();

    if (immediate) {
      elements.cascadeToastElement.hidden = true;
      return rewardPromise;
    }

    window.setTimeout(() => {
      if (!elements.cascadeToastElement.classList.contains("is-visible")) {
        elements.cascadeToastElement.hidden = true;
      }
    }, 180);

    return rewardPromise;
  }

  function renderGoalList(goals, goalProgress) {
    elements.goalListElement.innerHTML = "";
    elements.goalListElement.dataset.goalCount = String(goals.length);
    elements.goalListElement.dataset.goalLayout = goals.length <= 2 ? "single" : "double";
    const fragment = document.createDocumentFragment();

    for (const goal of goals) {
      const item = document.createElement("li");
      const progress = Math.min(goalProgress[goal.kind] ?? 0, goal.count);
      const isComplete = progress >= goal.count;
      const kind = TILE_KIND_MAP[goal.kind] ?? Object.values(TILE_KIND_MAP)[0];

      item.className = isComplete ? "goal-item is-complete" : "goal-item";
      item.dataset.goalKind = goal.kind;

      const swatch = document.createElement("span");
      swatch.className = `goal-swatch goal-swatch--${goal.kind}`;
      swatch.setAttribute("aria-hidden", "true");

      const copy = document.createElement("span");
      copy.className = "goal-copy";

      const name = document.createElement("span");
      name.className = "goal-name";
      name.textContent = kind.name;

      const count = document.createElement("span");
      count.className = "goal-progress";
      count.textContent = `${progress} / ${goal.count}`;

      copy.append(name, count);
      item.append(swatch, copy);
      fragment.appendChild(item);
    }

    elements.goalListElement.appendChild(fragment);
  }

  function getGoalSwatchRect(kind) {
    const item = elements.goalListElement.querySelector(`[data-goal-kind="${kind}"]`);
    const swatch = item?.querySelector(".goal-swatch");
    if (!swatch) {
      return null;
    }

    return swatch.getBoundingClientRect();
  }

  function bumpGoal(kind) {
    const item = elements.goalListElement.querySelector(`[data-goal-kind="${kind}"]`);
    if (!item) {
      return;
    }

    item.classList.remove("is-bumping");
    void item.offsetWidth;
    item.classList.add("is-bumping");
  }

  function updateFps(fps) {
    elements.fpsCounterElement.textContent = `FPS: ${fps}`;
  }

  return {
    renderLevelHud,
    showLevelOverlay,
    hideLevelOverlay,
    setStatus,
    showEliminationCombo,
    hideEliminationCombo,
    positionCascadeToast,
    getGoalSwatchRect,
    bumpGoal,
    updateFps,
  };
}
