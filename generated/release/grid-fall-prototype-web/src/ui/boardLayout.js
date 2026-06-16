export function fitBoardToViewport({ boardElement, boardShellElement, tileLayerElement, brickLayerElement = null, columns, rows }) {
  const shellWidth = boardShellElement.clientWidth || 360;
  const shellHeight = boardShellElement.clientHeight || 640;
  const gap = shellWidth <= 360 ? 4 : 6;
  const usableWidth = shellWidth - 8;
  const usableHeight = Math.floor(shellHeight * 0.56);
  const tileSizeByWidth = Math.floor((usableWidth - gap * (columns - 1)) / columns);
  const tileSizeByHeight = Math.floor((usableHeight - gap * (rows - 1)) / rows);
  const tileSize = Math.max(34, Math.min(tileSizeByWidth, tileSizeByHeight));
  const boardPixelWidth = columns * tileSize + (columns - 1) * gap;
  const gameScreenElement = boardShellElement.closest(".game-screen");

  boardElement.style.setProperty("--board-columns", String(columns));
  boardElement.style.setProperty("--board-rows", String(rows));
  boardElement.style.setProperty("--gap", `${gap}px`);
  boardElement.style.setProperty("--tile-size", `${tileSize}px`);
  brickLayerElement?.style.setProperty("--gap", `${gap}px`);
  brickLayerElement?.style.setProperty("--tile-size", `${tileSize}px`);
  tileLayerElement.style.setProperty("--gap", `${gap}px`);
  tileLayerElement.style.setProperty("--tile-size", `${tileSize}px`);
  if (gameScreenElement) {
    gameScreenElement.style.setProperty("--board-pixel-width", `${boardPixelWidth}px`);
  }
}

export function renderBoardSlots({ boardElement, columns, rows, isHole = () => false }) {
  boardElement.innerHTML = "";
  const span = getCellSpan(boardElement);
  const fragment = document.createDocumentFragment();

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.left = `${x * span}px`;
      slot.style.top = `${y * span}px`;
      fragment.appendChild(slot);
    }
  }

  boardElement.appendChild(fragment);
  applyBoardShapeMask({ boardElement, columns, rows, isHole });
}

// 参考 JellyRelocate(src/engine/Board.tsx) 的轮廓提取方式：
//   1) 以「可用格」为实体区域提取整体边界 loop；
//   2) 相连可用格自动融合为一整块，边缘缺块会直接重塑外轮廓；
//   3) rounded path 直接作为整块棋盘的 mask，底色与网格线共用同一轮廓。
export function applyBoardShapeMask({ boardElement, columns, rows, isHole = () => false }) {
  const style = getComputedStyle(boardElement);
  const tileSize = parseFloat(style.getPropertyValue("--tile-size")) || 52;
  const gap = parseFloat(style.getPropertyValue("--gap")) || 6;
  const span = tileSize + gap;
  const width = columns * tileSize + (columns - 1) * gap;
  const height = rows * tileSize + (rows - 1) * gap;

  const playableGrid = [];
  let holeCount = 0;
  let playableCount = 0;
  for (let y = 0; y < rows; y += 1) {
    const row = [];
    for (let x = 0; x < columns; x += 1) {
      const isPlayable = !isHole(x, y);
      if (isPlayable) {
        playableCount += 1;
      } else {
        holeCount += 1;
      }
      row.push(isPlayable ? 1 : 0);
    }
    playableGrid.push(row);
  }

  applyBoardGridOverlay({ boardElement, playableGrid, columns, rows, tileSize, span, width, height });

  removeBoardShapeOutline(boardElement);

  if (playableCount === 0) {
    boardElement.style.removeProperty("--board-hole-mask");
    return;
  }

  if (holeCount === 0) {
    boardElement.style.removeProperty("--board-hole-mask");
    return;
  }

  // 外轮廓贴棋盘边缘，内部扣除边界贴在格缝中心。
  // 这样边界缺块时会直接变成自然外形，而不是“矩形上挖一个口子”。
  const toPixel = (gx, gy) => ({
    x: gx === 0 ? 0 : gx === columns ? width : gx * span - gap / 2,
    y: gy === 0 ? 0 : gy === rows ? height : gy * span - gap / 2,
  });

  const convexRadius = Math.min(tileSize * 0.28, tileSize * 0.5);
  const concaveRadius = convexRadius * 0.6;

  const loops = extractRegionBoundaryLoops(playableGrid, columns, rows);
  const rounded = buildRoundedLoops(loops, toPixel, 0, convexRadius, concaveRadius);
  const outlinePath = rounded.map((loop) => roundedLoopToPath(loop)).join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${outlinePath}" fill="white" fill-rule="evenodd"/></svg>`;
  const maskValue = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  boardElement.style.setProperty("--board-hole-mask", maskValue);
  applyBoardShapeOutline({ boardElement, width, height, outlinePath });
}

function applyBoardGridOverlay({ boardElement, playableGrid, columns, rows, tileSize, span, width, height }) {
  const segments = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (playableGrid[y][x] !== 1) {
        continue;
      }

      if (x + 1 < columns && playableGrid[y][x + 1] === 1) {
        const lineX = round(x * span + tileSize) + 0.5;
        const startY = round(y * span) + 0.5;
        const endY = round(y * span + tileSize) + 0.5;
        segments.push(`<line x1="${lineX}" y1="${startY}" x2="${lineX}" y2="${endY}" />`);
      }

      if (y + 1 < rows && playableGrid[y + 1][x] === 1) {
        const lineY = round(y * span + tileSize) + 0.5;
        const startX = round(x * span) + 0.5;
        const endX = round(x * span + tileSize) + 0.5;
        segments.push(`<line x1="${startX}" y1="${lineY}" x2="${endX}" y2="${lineY}" />`);
      }
    }
  }

  if (segments.length === 0) {
    boardElement.style.removeProperty("--board-grid-overlay");
    return;
  }

  const strokeColor = "rgba(145, 84, 48, 0.1)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="${strokeColor}" stroke-width="1" stroke-linecap="square">${segments.join("")}</g></svg>`;
  boardElement.style.setProperty("--board-grid-overlay", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

function applyBoardShapeOutline({ boardElement, width, height, outlinePath }) {
  const strokeColor = "rgba(145, 84, 48, 0.14)";
  const strokeWidth = 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${outlinePath}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  const outline = document.createElement("div");
  outline.className = "board-shape-outline";
  outline.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  boardElement.appendChild(outline);
}

function removeBoardShapeOutline(boardElement) {
  const existing = boardElement.querySelector(".board-shape-outline");
  if (existing) {
    existing.remove();
  }
}

// ===== 以下边界追踪 / 圆角逻辑参考 JellyRelocate/src/engine/Board.tsx =====

const DIRECTION_PRIORITY = [0, 1, 3];

function pointKey(p) {
  return `${p.x},${p.y}`;
}

function getDirection(from, to) {
  if (to.x > from.x) return 0; // 右
  if (to.y > from.y) return 1; // 下
  if (to.x < from.x) return 2; // 左
  return 3;                    // 上
}

// 行进方向的「左法线」（指向区域内侧），用于把边界点向外/内扩展
function getLeftNormal(direction) {
  switch (direction) {
    case 0: return { x: 0, y: -1 };
    case 1: return { x: 1, y: 0 };
    case 2: return { x: 0, y: 1 };
    default: return { x: -1, y: 0 };
  }
}

function getSignedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    area += cur.x * next.y - next.x * cur.y;
  }
  return area / 2;
}

function chooseNextEdge(currentDir, candidateIndices, edges) {
  let bestIndex = candidateIndices[0];
  let bestRank = Number.POSITIVE_INFINITY;
  candidateIndices.forEach((index) => {
    const diff = (edges[index].dir - currentDir + 4) % 4;
    const rank = DIRECTION_PRIORITY.indexOf(diff);
    const priority = rank === -1 ? DIRECTION_PRIORITY.length : rank;
    if (priority < bestRank) {
      bestRank = priority;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function simplifyLoop(points) {
  if (points.length <= 2) {
    return points;
  }

  const unique = [...points];
  const first = unique[0];
  const last = unique[unique.length - 1];
  if (first.x === last.x && first.y === last.y) {
    unique.pop();
  }

  const simplified = [];
  for (let i = 0; i < unique.length; i += 1) {
    const prev = unique[(i - 1 + unique.length) % unique.length];
    const cur = unique[i];
    const next = unique[(i + 1) % unique.length];
    const sameX = prev.x === cur.x && cur.x === next.x;
    const sameY = prev.y === cur.y && cur.y === next.y;
    if (!sameX && !sameY) {
      simplified.push(cur);
    }
  }
  return simplified;
}

// 提取区域（值为 1 的格子）的边界 loop，单位为「格点」。
// 只对区域边界（相邻格不在区域内）生成边，相连格的公共边天然不产生外边。
function extractRegionBoundaryLoops(grid, columns, rows) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows && grid[y][x] === 1;
  const edges = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!inside(x, y)) {
        continue;
      }
      // 顺时针绕格：上(dir0)、右(dir1)、下(dir2)、左(dir3)
      if (!inside(x, y - 1)) {
        edges.push({ start: { x, y }, end: { x: x + 1, y }, dir: 0 });
      }
      if (!inside(x + 1, y)) {
        edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 }, dir: 1 });
      }
      if (!inside(x, y + 1)) {
        edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 }, dir: 2 });
      }
      if (!inside(x - 1, y)) {
        edges.push({ start: { x, y: y + 1 }, end: { x, y }, dir: 3 });
      }
    }
  }

  const outgoing = new Map();
  edges.forEach((edge, index) => {
    const k = pointKey(edge.start);
    const list = outgoing.get(k);
    if (list) {
      list.push(index);
    } else {
      outgoing.set(k, [index]);
    }
  });

  const unused = new Set(edges.map((_, index) => index));
  const loops = [];

  while (unused.size > 0) {
    const startIndex = unused.values().next().value;
    let currentIndex = startIndex;
    const startPoint = edges[startIndex].start;
    const loop = [startPoint];
    let guard = 0;

    while (guard < 1000000) {
      guard += 1;
      const currentEdge = edges[currentIndex];
      unused.delete(currentIndex);
      loop.push(currentEdge.end);

      if (currentEdge.end.x === startPoint.x && currentEdge.end.y === startPoint.y) {
        break;
      }

      const candidates = (outgoing.get(pointKey(currentEdge.end)) ?? []).filter((index) => unused.has(index));
      if (candidates.length === 0) {
        break;
      }
      currentIndex = chooseNextEdge(currentEdge.dir, candidates, edges);
    }

    const simplified = simplifyLoop(loop);
    if (simplified.length >= 4) {
      loops.push(simplified);
    }
  }

  return loops;
}

// 把格点 loop 转成像素、按拐角方向扩展并标注每个角的圆角半径
function buildRoundedLoops(loops, toPixel, expansion, convexRadius, concaveRadius) {
  return loops.map((loopPoints) => {
    const points = [];
    const radii = [];

    for (let i = 0; i < loopPoints.length; i += 1) {
      const prev = loopPoints[(i - 1 + loopPoints.length) % loopPoints.length];
      const cur = loopPoints[i];
      const next = loopPoints[(i + 1) % loopPoints.length];
      const prevDir = getDirection(prev, cur);
      const nextDir = getDirection(cur, next);
      const turn = (nextDir - prevDir + 4) % 4;
      const prevNormal = getLeftNormal(prevDir);
      const nextNormal = getLeftNormal(nextDir);
      const px = toPixel(cur.x, cur.y);

      // 向「区域外侧」（镂空外、棋盘实体一侧）扩展：左法线指向区域内侧，故取负
      points.push({
        x: px.x - (prevNormal.x + nextNormal.x) * expansion,
        y: px.y - (prevNormal.y + nextNormal.y) * expansion,
      });
      // turn===1 是外凸角（用大圆角），其余（含 turn===3 内凹角）用小圆角
      radii.push(turn === 1 ? convexRadius : concaveRadius);
    }

    return {
      points,
      radii,
      isHole: getSignedArea(loopPoints) < 0,
    };
  });
}

// 把一个扩展后的 loop 转成带圆角的 SVG path（圆角用圆弧 A 指令，等价 canvas arcTo）
function roundedLoopToPath(loop) {
  const { points, radii } = loop;
  const n = points.length;
  if (n < 2) {
    return "";
  }

  const corners = points.map((point, index) => {
    const prev = points[(index - 1 + n) % n];
    const next = points[(index + 1) % n];
    const prevDx = point.x - prev.x;
    const prevDy = point.y - prev.y;
    const nextDx = next.x - point.x;
    const nextDy = next.y - point.y;
    const prevLen = Math.hypot(prevDx, prevDy);
    const nextLen = Math.hypot(nextDx, nextDy);
    const r = Math.min(radii[index], prevLen / 2, nextLen / 2);
    const prevUx = prevLen === 0 ? 0 : prevDx / prevLen;
    const prevUy = prevLen === 0 ? 0 : prevDy / prevLen;
    const nextUx = nextLen === 0 ? 0 : nextDx / nextLen;
    const nextUy = nextLen === 0 ? 0 : nextDy / nextLen;
    return {
      corner: point,
      radius: r,
      start: { x: point.x - prevUx * r, y: point.y - prevUy * r },
      end: { x: point.x + nextUx * r, y: point.y + nextUy * r },
      // 叉积判断转弯方向，决定圆弧 sweep
      cross: prevUx * nextUy - prevUy * nextUx,
    };
  });

  const parts = [`M${round(corners[0].start.x)} ${round(corners[0].start.y)}`];

  corners.forEach(({ start, end, radius, cross }, index) => {
    if (index > 0) {
      parts.push(`L${round(start.x)} ${round(start.y)}`);
    }
    if (radius > 0) {
      // 圆角朝棋盘实体一侧切：外凸角圆弧凸向洞内（顺时针 sweep=1），内凹角反向
      const sweep = cross < 0 ? 0 : 1;
      parts.push(`A${round(radius)} ${round(radius)} 0 0 ${sweep} ${round(end.x)} ${round(end.y)}`);
    } else {
      parts.push(`L${round(end.x)} ${round(end.y)}`);
    }
  });

  parts.push("Z");
  return parts.join(" ");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function getBoardMetrics({ boardElement, boardShellElement }) {
  const boardRect = boardElement.getBoundingClientRect();
  const shellRect = boardShellElement.getBoundingClientRect();
  const style = getComputedStyle(boardElement);
  const tileSize = parseFloat(style.getPropertyValue("--tile-size")) || 52;
  const gap = parseFloat(style.getPropertyValue("--gap")) || 6;

  return {
    left: boardRect.left - shellRect.left,
    top: boardRect.top - shellRect.top,
    tileSize,
    gap,
    span: tileSize + gap,
  };
}

function getCellSpan(boardElement) {
  const style = getComputedStyle(boardElement);
  const tileSize = parseFloat(style.getPropertyValue("--tile-size")) || 52;
  const gap = parseFloat(style.getPropertyValue("--gap")) || 6;
  return tileSize + gap;
}
