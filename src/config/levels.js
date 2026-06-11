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
    moveLimit: 10,
    tileKinds: [5, 3, 2, 1, 4, 0], // 5:蓝色, 3:黄色, 2:粉色, 1:橙色, 4:红色, 0:杂草
    initialBoard: [
      [5, 0, 3, 2, 1],
      [5, 2, 3, 1, 2],
      [0, 1, 0, 5, 3],
      [5, 2, 3, 1, 0],
      [1, 3, 5, 2, 5],
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
    moveLimit: 14,
    tileKinds: [1, 2, 3, 4, 5, 6, 0],
    goals: [
      { kind: 6, count: 8 },
      { kind: 2, count: 8 },
    ],
  },
  {
    id: 3,
    columns: 7,
    rows: 7,
    moveLimit: 18,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 1, count: 10 },
      { kind: 4, count: 10 },
    ],
  },
  {
    id: 4,
    columns: 8,
    rows: 8,
    moveLimit: 22,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 6, count: 14 },
      { kind: 4, count: 14 },
    ],
  },
  {
    id: 5,
    columns: 8,
    rows: 9,
    moveLimit: 24,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 5, count: 12 },
      { kind: 3, count: 12 },
      { kind: 7, count: 10 },
    ],
  },
  {
    id: 6,
    columns: 8,
    rows: 10,
    moveLimit: 26,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 1, count: 14 },
      { kind: 2, count: 14 },
      { kind: 6, count: 12 },
    ],
  },
  {
    id: 7,
    columns: 8,
    rows: 10,
    moveLimit: 28,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 4, count: 16 },
      { kind: 5, count: 16 },
      { kind: 7, count: 14 },
    ],
  },
  {
    id: 8,
    columns: 8,
    rows: 10,
    moveLimit: 30,
    tileKinds: [1, 2, 3, 4, 5, 6, 7, 0],
    goals: [
      { kind: 1, count: 15 },
      { kind: 3, count: 15 },
      { kind: 5, count: 15 },
      { kind: 6, count: 15 },
    ],
  },
];
