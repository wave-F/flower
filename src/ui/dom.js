function requireElement(doc, selector) {
  const element = doc.querySelector(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

export function getDomElements(doc = document) {
  return {
    boardElement: requireElement(doc, "#board"),
    boardShellElement: requireElement(doc, ".board-shell"),
    tileLayerElement: requireElement(doc, "#tileLayer"),
    flyLayerElement: requireElement(doc, "#flyLayer"),
    levelBadgeElement: requireElement(doc, "#levelBadge"),
    moveLabelElement: requireElement(doc, "#moveLabel"),
    goalListElement: requireElement(doc, "#goalList"),
    nextLevelButtonElement: requireElement(doc, "#nextLevelButton"),
    levelOverlayElement: requireElement(doc, "#levelOverlay"),
    levelOverlayTitleElement: requireElement(doc, "#levelOverlayTitle"),
    levelOverlayDetailElement: requireElement(doc, "#levelOverlayDetail"),
    fpsCounterElement: requireElement(doc, "#fpsCounter"),
    debugWindmillButtonElement: requireElement(doc, "#debugWindmillButton"),
    tutorialGuideElement: requireElement(doc, "#tutorialGuide"),
    tutorialHandElement: requireElement(doc, "#tutorialHand"),
    tutorialTipElement: requireElement(doc, "#tutorialTip"),
    persistentHintElement: requireElement(doc, "#persistentHint"),
  };
}
