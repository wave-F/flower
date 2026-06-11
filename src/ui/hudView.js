import { TILE_KIND_MAP } from "../config/tileKinds.js";

export function createHudView({ elements, moveLimit, appTitle }) {
  function renderLevelHud({ level, movesUsed, goalProgress }) {
    elements.levelBadgeElement.textContent = String(level.id);
    elements.moveLabelElement.textContent = String(Math.max(moveLimit - movesUsed, 0));
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

  function renderGoalList(goals, goalProgress) {
    elements.goalListElement.innerHTML = "";

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
      elements.goalListElement.appendChild(item);
    }
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
    getGoalSwatchRect,
    bumpGoal,
    updateFps,
  };
}
