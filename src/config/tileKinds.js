export const TILE_KINDS = [
  { key: "amber", label: "Amber", name: "琥珀花" },
  { key: "mint", label: "Mint", name: "薄荷花" },
  { key: "sky", label: "Sky", name: "晴空花" },
  { key: "violet", label: "Violet", name: "紫藤花" },
  { key: "rose", label: "Rose", name: "玫瑰花" },
  { key: "gold", label: "Gold", name: "金花" },
];

export const TILE_KIND_MAP = Object.fromEntries(TILE_KINDS.map((kind) => [kind.key, kind]));
