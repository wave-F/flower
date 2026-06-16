/**
 * 关卡数字映射表 (根据图片实际颜色):
 * 0: 杂草 (grass)
 * 1: 橙色 (flower_1)
 * 2: 粉色 (flower_2)
 * 3: 黄色 (flower_3)
 * 4: 红色 (flower_4)
 * 5: 蓝色 (flower_5)
 * 6: 紫色 (flower_6)
 * 7: 绿色 (flower_7)
 * bricks: 障碍砖块坐标，格式为 [x, y]。砖块不参与掉落，四邻格累计被消除 2 次后破碎。
 */

const lineColumn = (x, rows, skip = []) =>
  Array.from({ length: rows }, (_, y) => (skip.includes(y) ? null : [x, y])).filter(Boolean);

const lineRow = (y, columns, skip = []) =>
  Array.from({ length: columns }, (_, x) => (skip.includes(x) ? null : [x, y])).filter(Boolean);

const dashedColumn = (x, rows, start = 0) =>
  Array.from({ length: rows }, (_, y) => ((y + start) % 2 === 0 ? [x, y] : null)).filter(Boolean);

const dashedRow = (y, columns, start = 0) =>
  Array.from({ length: columns }, (_, x) => ((x + start) % 2 === 0 ? [x, y] : null)).filter(Boolean);

const rect = (startX, startY, width, height) => {
  const holes = [];
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      holes.push([x, y]);
    }
  }
  return holes;
};

const combineHoles = (...groups) => groups.flat();
const cratesFromCells = (cells) => cells.map(([x, y]) => ({ x, y }));

export const LEVELS = [
  {
    id: 1,
    columns: 5,
    rows: 5,
    moveLimit: 10,
    tileKinds: [1, 2, 3, 0],
    initialBoard: [
      [2, 3, 2, 3, 2],
      [3, 2, 1, 2, 3],
      [2, 1, 0, 1, 2],
      [3, 2, 3, 2, 3],
      [2, 3, 2, 3, 2],
    ],
    goals: [{ kind: 1, count: 6 }],
  },
  {
    id: 2,
    columns: 5,
    rows: 6,
    moveLimit: 12,
    tileKinds: [1, 2, 3, 0],
    crates: cratesFromCells([[1, 3], [3, 2], [2, 4]]),
    goals: [
      { kind: 1, count: 16 },
      { kind: 2, count: 16 },
    ],
  },
  {
    id: 3,
    columns: 6,
    rows: 6,
    moveLimit: 15,
    tileKinds: [1, 2, 3, 4, 0],
    bricks: lineRow(2, 6),
    goals: [
      { kind: 1, count: 24 },
      { kind: 3, count: 24 },
    ],
  },
  {
    id: 4,
    columns: 6,
    rows: 6,
    moveLimit: 16,
    tileKinds: [1, 2, 3, 4, 0],
    crates: cratesFromCells([
      [0, 1],
      [0, 2], [1, 2],
      [0, 3], [1, 3], [2, 3],
      [0, 4], [1, 4], [2, 4], [3, 4],
      [0, 5], [1, 5], [2, 5], [3, 5], [4, 5],
    ]),
    goals: [
      { kind: 2, count: 28 },
      { kind: 4, count: 28 },
    ],
  },
  {
    id: 5,
    columns: 7,
    rows: 7,
    moveLimit: 18,
    tileKinds: [1, 2, 3, 4, 0],
    bricks: [[2, 3], [4, 3]],
    crates: cratesFromCells([
      [1, 2], [3, 2], [5, 2],
      [2, 4], [3, 4], [4, 4],
      [2, 5], [4, 5],
    ]),
    goals: [
      { kind: 1, count: 32 },
      { kind: 3, count: 32 },
      { kind: 4, count: 20 },
    ],
  },
  {
    id: 6,
    columns: 7,
    rows: 7,
    moveLimit: 14,
    tileKinds: [1, 2, 3, 4, 0],
    holes: dashedColumn(3, 7, 1),
    crates: cratesFromCells([
      [1, 2], [2, 2],
      [1, 4], [2, 4],
      [4, 2], [5, 2],
      [4, 4], [5, 4],
    ]),
    goals: [{ kind: 1, count: 44 }],
  },
  {
    id: 7,
    columns: 7,
    rows: 8,
    moveLimit: 20,
    tileKinds: [1, 2, 3, 4, 0],
    holes: dashedRow(4, 7, 1),
    crates: cratesFromCells([
      [1, 2], [3, 2], [5, 2],
      [1, 5], [3, 5], [5, 5],
    ]),
    goals: [
      { kind: 2, count: 36 },
      { kind: 4, count: 36 },
    ],
  },
  {
    id: 8,
    columns: 8,
    rows: 8,
    moveLimit: 22,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: dashedColumn(3, 8, 0),
    crates: cratesFromCells([
      [0, 2], [1, 2], [2, 2],
      [5, 2], [6, 2], [7, 2],
      [0, 5], [1, 5], [2, 5],
      [5, 5], [6, 5], [7, 5],
    ]),
    goals: [
      { kind: 1, count: 40 },
      { kind: 5, count: 40 },
    ],
  },
  {
    id: 9,
    columns: 8,
    rows: 8,
    moveLimit: 24,
    tileKinds: [0, 2, 3, 4, 5, 6],
    holes: combineHoles(
      lineColumn(2, 8, [2, 3, 4, 5]),
      lineColumn(5, 8, [1, 3, 4, 6]),
    ),
    crates: cratesFromCells([
      [1, 1], [6, 1],
      [1, 2], [6, 2],
      [1, 5], [6, 5],
      [1, 6], [6, 6],
    ]),
    goals: [
      { kind: 2, count: 40 },
      { kind: 3, count: 40 },
      { kind: 5, count: 28 },
    ],
  },
  {
    id: 10,
    columns: 8,
    rows: 9,
    moveLimit: 18,
    tileKinds: [1, 2, 3, 4, 5, 0],
    goals: [{ kind: 1, count: 100 }],
  },
  {
    id: 11,
    columns: 7,
    rows: 8,
    moveLimit: 26,
    tileKinds: [1, 2, 3, 4, 5, 0],
    bricks: [[2, 2], [4, 2], [2, 4], [4, 4]],
    goals: [
      { kind: 1, count: 44 },
      { kind: 4, count: 44 },
    ],
  },
  {
    id: 12,
    columns: 8,
    rows: 8,
    moveLimit: 28,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: lineRow(3, 8, [3, 4]),
    bricks: [[2, 2], [5, 2], [3, 5]],
    goals: [
      { kind: 2, count: 48 },
      { kind: 5, count: 48 },
    ],
  },
  {
    id: 13,
    columns: 8,
    rows: 8,
    moveLimit: 30,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: combineHoles(
      lineColumn(2, 8, [3, 4]),
      lineColumn(5, 8, [3, 4]),
    ),
    bricks: [[3, 2], [4, 5]],
    goals: [
      { kind: 1, count: 48 },
      { kind: 3, count: 48 },
      { kind: 5, count: 36 },
    ],
  },
  {
    id: 14,
    columns: 8,
    rows: 9,
    moveLimit: 28,
    tileKinds: [1, 2, 3, 4, 5, 0],
    bricks: [[2, 2], [5, 2], [2, 6], [5, 6]],
    goals: [
      { kind: 2, count: 56 },
      { kind: 4, count: 56 },
    ],
  },
  {
    id: 15,
    columns: 8,
    rows: 9,
    moveLimit: 24,
    tileKinds: [1, 2, 3, 4, 5, 0],
    goals: [{ kind: 3, count: 100 }],
  },
  {
    id: 16,
    columns: 8,
    rows: 9,
    moveLimit: 30,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: combineHoles(
      lineColumn(2, 9, [4]),
      lineColumn(5, 9, [4]),
    ),
    crates: cratesFromCells([[1, 2], [6, 2], [1, 6], [6, 6]]),
    goals: [
      { kind: 1, count: 56 },
      { kind: 3, count: 56 },
      { kind: 5, count: 48 },
    ],
  },
  {
    id: 17,
    columns: 8,
    rows: 10,
    moveLimit: 32,
    tileKinds: [1, 2, 3, 4, 6, 0],
    holes: combineHoles(lineColumn(3, 10, [4, 5]), lineRow(4, 8, [3, 4])),
    bricks: [[2, 4], [5, 4]],
    crates: cratesFromCells([[1, 3], [6, 3], [2, 7], [5, 7]]),
    goals: [
      { kind: 2, count: 60 },
      { kind: 4, count: 60 },
      { kind: 6, count: 48 },
    ],
  },
  {
    id: 18,
    columns: 8,
    rows: 10,
    moveLimit: 34,
    tileKinds: [1, 2, 3, 5, 6, 0],
    bricks: [[2, 2], [5, 2], [2, 7], [5, 7]],
    crates: cratesFromCells([[1, 4], [6, 4], [3, 5], [4, 5]]),
    goals: [
      { kind: 1, count: 64 },
      { kind: 5, count: 64 },
      { kind: 6, count: 52 },
    ],
  },
  {
    id: 19,
    columns: 9,
    rows: 9,
    moveLimit: 32,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: rect(3, 2, 3, 5),
    crates: cratesFromCells([[1, 2], [7, 2], [1, 6], [7, 6]]),
    goals: [
      { kind: 2, count: 60 },
      { kind: 3, count: 60 },
      { kind: 4, count: 48 },
    ],
  },
  {
    id: 20,
    columns: 9,
    rows: 9,
    moveLimit: 24,
    tileKinds: [1, 2, 3, 4, 5, 0],
    goals: [{ kind: 1, count: 120 }],
  },
  {
    id: 21,
    columns: 9,
    rows: 10,
    moveLimit: 34,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: combineHoles(
      lineColumn(2, 10, [4, 5]),
      lineColumn(6, 10, [4, 5]),
    ),
    crates: cratesFromCells([[1, 2], [7, 2], [1, 7], [7, 7], [4, 4]]),
    goals: [
      { kind: 1, count: 60 },
      { kind: 4, count: 60 },
      { kind: 5, count: 52 },
    ],
  },
  {
    id: 22,
    columns: 9,
    rows: 10,
    moveLimit: 36,
    tileKinds: [1, 2, 3, 5, 6, 0],
    bricks: [[2, 1], [6, 1], [2, 8], [6, 8]],
    crates: cratesFromCells([[1, 4], [7, 4], [3, 5], [5, 5]]),
    goals: [
      { kind: 2, count: 68 },
      { kind: 5, count: 68 },
      { kind: 6, count: 56 },
    ],
  },
  {
    id: 23,
    columns: 9,
    rows: 10,
    moveLimit: 36,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: combineHoles(
      lineColumn(2, 10, [4, 5]),
      lineRow(4, 9, [2, 6]),
    ),
    crates: cratesFromCells([[1, 2], [7, 2], [1, 7], [7, 7], [4, 4]]),
    goals: [
      { kind: 1, count: 68 },
      { kind: 3, count: 68 },
      { kind: 5, count: 56 },
    ],
  },
  {
    id: 24,
    columns: 10,
    rows: 10,
    moveLimit: 38,
    tileKinds: [1, 2, 3, 4, 5, 0],
    holes: combineHoles(
      lineColumn(3, 10, [4]),
      lineColumn(6, 10, [5]),
    ),
    crates: cratesFromCells([[2, 2], [7, 2], [2, 7], [7, 7]]),
    goals: [
      { kind: 2, count: 72 },
      { kind: 4, count: 72 },
      { kind: 5, count: 60 },
    ],
  },
  {
    id: 25,
    columns: 10,
    rows: 10,
    moveLimit: 26,
    tileKinds: [1, 2, 3, 4, 5, 0],
    goals: [{ kind: 2, count: 140 }],
  },
  {
    id: 26,
    columns: 10,
    rows: 10,
    moveLimit: 40,
    tileKinds: [1, 2, 3, 5, 6, 0],
    bricks: [[2, 2], [7, 2], [2, 7], [7, 7], [4, 4]],
    crates: cratesFromCells([[1, 4], [8, 4], [4, 1], [4, 8]]),
    goals: [
      { kind: 1, count: 76 },
      { kind: 3, count: 76 },
      { kind: 5, count: 64 },
    ],
  },
  {
    id: 27,
    columns: 10,
    rows: 10,
    moveLimit: 42,
    tileKinds: [1, 2, 4, 5, 6, 0],
    holes: combineHoles(
      lineColumn(2, 10, [3, 7]),
      lineColumn(7, 10, [2, 6]),
      lineRow(5, 10, [2, 7]),
    ),
    crates: cratesFromCells([[1, 2], [8, 2], [1, 7], [8, 7], [4, 4], [5, 4]]),
    goals: [
      { kind: 2, count: 80 },
      { kind: 4, count: 80 },
      { kind: 5, count: 68 },
    ],
  },
  {
    id: 28,
    columns: 10,
    rows: 10,
    moveLimit: 44,
    tileKinds: [1, 3, 4, 5, 6, 0],
    holes: rect(3, 2, 4, 5),
    crates: cratesFromCells([[1, 2], [8, 2], [1, 7], [8, 7]]),
    goals: [
      { kind: 1, count: 84 },
      { kind: 3, count: 84 },
      { kind: 6, count: 72 },
    ],
  },
  {
    id: 29,
    columns: 10,
    rows: 11,
    moveLimit: 46,
    tileKinds: [2, 3, 4, 5, 6, 0],
    bricks: [[2, 2], [7, 2], [2, 8], [7, 8]],
    crates: cratesFromCells([[4, 1], [5, 1], [4, 9], [5, 9]]),
    goals: [
      { kind: 2, count: 88 },
      { kind: 4, count: 88 },
      { kind: 5, count: 76 },
    ],
  },
  {
    id: 30,
    columns: 10,
    rows: 11,
    moveLimit: 48,
    tileKinds: [1, 3, 4, 5, 6, 0],
    holes: combineHoles(lineColumn(3, 11, [2, 5, 8]), lineColumn(6, 11, [1, 5, 9]), lineRow(5, 10, [3, 4, 5, 6])),
    crates: cratesFromCells([[1, 2], [8, 2], [1, 8], [8, 8], [4, 4], [5, 6]]),
    goals: [
      { kind: 1, count: 96 },
      { kind: 3, count: 96 },
      { kind: 5, count: 84 },
      { kind: 6, count: 72 },
    ],
  },
];
