const assetPacks = [
  {
    id: "starter-paper",
    name: "纸张与胶带",
    description: "P0 内置素材包，用于验证从素材到画布的添加路径。",
    cover: "",
    version: 1,
    items: [
      {
        id: "paper-cream-01",
        type: "paper",
        name: "浅米纸片",
        color: "#efe7d8",
        width: 300,
        height: 360
      },
      {
        id: "tape-sage-01",
        type: "tape",
        name: "鼠尾草胶带",
        color: "#8c9a8d",
        width: 260,
        height: 76
      },
      {
        id: "tape-yellow-01",
        type: "tape",
        name: "淡黄胶带",
        color: "#e9d28a",
        width: 260,
        height: 76
      }
    ]
  }
];

function getAssetPacks() {
  return assetPacks;
}

function getAssetPack(packId) {
  return assetPacks.find((pack) => pack.id === packId) || null;
}

module.exports = {
  assetPacks,
  getAssetPacks,
  getAssetPack
};
