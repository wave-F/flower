import { TILE_KIND_MAP } from "../config/tileKinds.js";

export function createHudView({ elements, moveLimit, appTitle }) {
  function renderLevelHud({ level, movesUsed, goalProgress, isLevelCompleted, isLevelFailed, actionButtonLabel }) {
    elements.levelBadgeElement.textContent = String(level.id);
    elements.moveLabelElement.textContent = `步数 ${movesUsed} / ${moveLimit}`;
    renderGoalList(level.goals, goalProgress);
    elements.nextLevelButtonElement.hidden = !isLevelCompleted && !isLevelFailed;
    elements.nextLevelButtonElement.textContent = actionButtonLabel;
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

  return {
    renderLevelHud,
    setStatus,
  };
}
