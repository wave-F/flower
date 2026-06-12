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
 */

export const LEVELS = [
  {
    id: 1,
    columns: 5,
    rows: 5,
    moveLimit: 5,
    tileKinds: [5, 3, 2, 1,6, 0], // 5:蓝色, 3:黄色, 2:粉色, 1:橙色, 0:杂草
    initialBoard: [
      [1, 2, 3, 6, 3],
      [5, 1, 3, 0, 2],
      [0, 2, 0, 6, 1],
      [5, 6, 3, 2, 3],
      [5, 2, 0, 1, 2],
    ],
    goals: [
      { kind: 5, count: 3 },
      { kind: 3, count: 3 },
    ],
  },
  {
    id: 2,
    columns: 6,
    rows: 6,
    moveLimit: 8,
    tileKinds: [1, 2, 3, 4,5,0],
    goals: [
      { kind: 5, count: 6 },
      { kind: 2, count: 6 },
    ],
  },
  {
    id: 3,
    columns: 6,
    rows: 6,
    moveLimit: 10,
    tileKinds: [1, 2, 3, 4, 5,0],
    goals: [
      { kind: 1, count: 8 },
      { kind: 4, count: 8 },
    ],
  },
  {
    id: 4,
    columns: 7,
    rows: 7,
    moveLimit: 12,
    tileKinds: [1, 2, 3, 4, 5, 6],
    goals: [
      { kind: 6, count: 10 },
      { kind: 4, count: 10 },
    ],
  },
  {
    id: 5,
    columns: 8,
    rows: 8,
    moveLimit: 14,
    tileKinds: [1, 2, 3, 4, 5, 6],
    goals: [
      { kind: 5, count: 10 },
      { kind: 3, count: 10 },
      { kind: 1, count: 8 },
    ],
  },
  {
    id: 6,
    columns: 8,
    rows: 8,
    moveLimit: 16,
    tileKinds: [1, 2, 3, 4, 5, 6],
    holes: [
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [3, 7],
    ],
    goals: [
      { kind: 1, count: 12 },
      { kind: 5, count: 12 },
      { kind: 7, count: 10 },
    ],
  },
  {
    id: 7,
    columns: 8,
    rows: 9,
    moveLimit: 18,
    tileKinds: [1, 2, 3, 4, 5, 6],
    holes: [
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
      [7, 4],
      [8, 4],
    ],
    goals: [
      { kind: 2, count: 14 },
      { kind: 4, count: 14 },
      { kind: 6, count: 12 },
    ],
  },
  {
    id: 8,
    columns: 8,
    rows: 10,
    moveLimit: 20,
    tileKinds: [1, 2, 3, 4, 5, 6],
    holes: [
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [3, 7],
      [3, 8],
      [3, 9],
    ],
    goals: [
      { kind: 1, count: 14 },
      { kind: 3, count: 14 },
      { kind: 5, count: 14 },
      { kind: 6, count: 12 },
    ],
  },
];
