const assetPacks = [
  {
    id: "papers",
    name: "复古纸张",
    description: "可写字的纸片、便签和拼贴底纸。",
    cover: "/assets/papers/pack-sheet.png",
    sheet: "/assets/papers/pack-sheet.png",
    version: 1,
    items: [
      {
        id: "paper-01",
        type: "paper",
        name: "横线纸片",
        source: "/assets/papers/items/paper-01.png",
        thumb: "/assets/papers/items/paper-01.png",
        width: 371,
        height: 377
      },
      {
        id: "paper-02",
        type: "paper",
        name: "撕边便签",
        source: "/assets/papers/items/paper-02.png",
        thumb: "/assets/papers/items/paper-02.png",
        width: 324,
        height: 352
      }
    ]
  },
  {
    id: "stickers",
    name: "贴纸",
    description: "可点选加入画布的装饰贴纸。",
    cover: "/assets/stickers/pack-sheet.png",
    sheet: "/assets/stickers/pack-sheet.png",
    version: 1,
    items: [
      {
        id: "cat-01",
        type: "sticker",
        name: "小猫贴纸 01",
        source: "/assets/stickers/items/cat-01.png",
        thumb: "/assets/stickers/items/cat-01.png",
        width: 289,
        height: 269
      },
      {
        id: "cat-02",
        type: "sticker",
        name: "小猫贴纸 02",
        source: "/assets/stickers/items/cat-02.png",
        thumb: "/assets/stickers/items/cat-02.png",
        width: 221,
        height: 295
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

function getAssetItems() {
  return assetPacks.reduce((items, pack) => {
    const packItems = pack.items.map((item) => ({
      ...item,
      packId: pack.id,
      packName: pack.name
    }));
    return items.concat(packItems);
  }, []);
}

function getAssetItem(assetId) {
  return getAssetItems().find((item) => item.id === assetId) || null;
}

module.exports = {
  assetPacks,
  getAssetPacks,
  getAssetPack,
  getAssetItems,
  getAssetItem
};
