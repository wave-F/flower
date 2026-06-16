import { TILE_KIND_MAP } from "../config/tileKinds.js";

export function createHudView({ elements, appTitle }) {
  let cascadeToastTimer = null;

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

  function showCascadeToast(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier < 2) {
      return;
    }

    if (cascadeToastTimer) {
      clearTimeout(cascadeToastTimer);
      cascadeToastTimer = null;
    }

    elements.cascadeToastElement.hidden = false;
    elements.cascadeToastElement.textContent = `连锁触发X${multiplier}`;
    elements.cascadeToastElement.classList.remove("is-visible");
    void elements.cascadeToastElement.offsetWidth;
    elements.cascadeToastElement.classList.add("is-visible");

    cascadeToastTimer = window.setTimeout(() => {
      elements.cascadeToastElement.classList.remove("is-visible");
      elements.cascadeToastElement.hidden = true;
      cascadeToastTimer = null;
    }, 820);
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
    showCascadeToast,
    getGoalSwatchRect,
    bumpGoal,
    updateFps,
  };
}
