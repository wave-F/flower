export const TILE_KINDS = [
  { key: "grass", label: "Grass", name: "杂草" },
  { key: "amber", label: "Amber", name: "橙色" },
  { key: "mint", label: "Mint", name: "粉色" },
  { key: "sky", label: "Sky", name: "黄色" },
  { key: "violet", label: "Violet", name: "红色" },
  { key: "rose", label: "Rose", name: "蓝色" },
  { key: "gold", label: "Gold", name: "紫色" },
  { key: "green", label: "Green", name: "绿色" },
];

export const TILE_KIND_MAP = Object.fromEntries(TILE_KINDS.map((kind) => [kind.key, kind]));
