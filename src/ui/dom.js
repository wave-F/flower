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
    brickLayerElement: requireElement(doc, "#brickLayer"),
    tileLayerElement: requireElement(doc, "#tileLayer"),
    flyLayerElement: requireElement(doc, "#flyLayer"),
    collectionTrayElement: requireElement(doc, "#collectionTray"),
    collectionTrayCountElement: requireElement(doc, "#collectionTrayCount"),
    levelBadgeElement: requireElement(doc, "#levelBadge"),
    moveLabelElement: requireElement(doc, "#moveLabel"),
    goalListElement: requireElement(doc, "#goalList"),
    nextLevelButtonElement: requireElement(doc, "#nextLevelButton"),
    levelOverlayElement: requireElement(doc, "#levelOverlay"),
    levelOverlayTitleElement: requireElement(doc, "#levelOverlayTitle"),
    levelOverlayDetailElement: requireElement(doc, "#levelOverlayDetail"),
    fpsCounterElement: requireElement(doc, "#fpsCounter"),
    debugWindmillButtonElement: requireElement(doc, "#debugWindmillButton"),
    debugBombButtonElement: requireElement(doc, "#debugBombButton"),
    debugHiveButtonElement: requireElement(doc, "#debugHiveButton"),
    debugDualHiveButtonElement: requireElement(doc, "#debugDualHiveButton"),
    debugLevelPickerButtonElement: requireElement(doc, "#debugLevelPickerButton"),
    debugLevelPanelElement: requireElement(doc, "#debugLevelPanel"),
    debugLevelSelectElement: requireElement(doc, "#debugLevelSelect"),
    debugLevelJumpButtonElement: requireElement(doc, "#debugLevelJumpButton"),
    tutorialGuideElement: requireElement(doc, "#tutorialGuide"),
    tutorialHandElement: requireElement(doc, "#tutorialHand"),
    tutorialTipElement: requireElement(doc, "#tutorialTip"),
    cascadeToastElement: requireElement(doc, "#cascadeToast"),
    persistentHintElement: requireElement(doc, "#persistentHint"),
  };
}
