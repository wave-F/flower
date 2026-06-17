export const TILE_KINDS = [
  { key: "brick", label: "Brick", name: "砖头", assetPath: "./assets/brick.png" },
  { key: "crate", label: "Crate", name: "木箱", assetPath: "./assets/box.png" },
  { key: "grass", label: "Grass", name: "杂草", assetPath: "./assets/grass.png" },
  { key: "amber", label: "Amber", name: "橙色", assetPath: "./assets/flowers/flower_1.png" },
  { key: "mint", label: "Mint", name: "粉色", assetPath: "./assets/flowers/flower_2.png" },
  { key: "sky", label: "Sky", name: "黄色", assetPath: "./assets/flowers/flower_3.png" },
  { key: "violet", label: "Violet", name: "红色", assetPath: "./assets/flowers/flower_4.png" },
  { key: "rose", label: "Rose", name: "蓝色", assetPath: "./assets/flowers/flower_5.png" },
  { key: "gold", label: "Gold", name: "紫色", assetPath: "./assets/flowers/flower_6.png" },
  { key: "green", label: "Green", name: "绿色", assetPath: "./assets/flowers/flower_7.png" },
];

export const TILE_KIND_MAP = Object.fromEntries(TILE_KINDS.map((kind) => [kind.key, kind]));
