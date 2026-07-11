const assetPacks = [
  {
    id: "morning",
    name: "晨间纸张",
    category: "纸张",
    tone: "#f3f1ec",
    cover: "/assets/packs/papers/pack-sheet.jpg",
    sheet: "/assets/packs/papers/pack-sheet.jpg",
    version: 1,
    items: [
      {
        id: "paper-01",
        type: "paper",
        name: "横线纸片",
        source: "/assets/packs/papers/items/paper-01.png",
        thumb: "/assets/packs/papers/items/paper-01.png",
        width: 371,
        height: 377
      },
      {
        id: "paper-02",
        type: "paper",
        name: "撕边便签",
        source: "/assets/packs/papers/items/paper-02.png",
        thumb: "/assets/packs/papers/items/paper-02.png",
        width: 324,
        height: 352
      },
      {
        id: "paper-small",
        type: "paper",
        name: "纸片",
        thumb: "",
        layer: {
          type: "paper",
          width: 240,
          height: 300,
          rotation: -7,
          style: { color: "#efe7d8" }
        }
      },
      {
        id: "paper-tall",
        type: "paper",
        name: "长纸片",
        thumb: "",
        layer: {
          type: "paper",
          width: 230,
          height: 320,
          rotation: 5,
          radius: 20,
          style: { color: "#ffffff" }
        }
      }
    ]
  },
  {
    id: "travel",
    name: "旅途票据",
    category: "票据",
    tone: "#eef1f0",
    cover: "/assets/packs/papers/pack-sheet.jpg",
    sheet: "/assets/packs/papers/pack-sheet.jpg",
    version: 1,
    items: [
      {
        id: "receipt-07",
        type: "text",
        name: "票据",
        thumb: "",
        layer: {
          type: "text",
          text: "07\n···",
          width: 190,
          height: 116,
          rotation: 3,
          style: {
            fontSize: 34,
            color: "#111111",
            fontLabel: "打字机",
            fontFamily: "monospace",
            background: "#ffffff"
          }
        }
      },
      {
        id: "frame-card",
        type: "paper",
        name: "边框卡",
        thumb: "",
        layer: {
          type: "paper",
          width: 230,
          height: 280,
          rotation: -2,
          radius: 26,
          style: { color: "#ffffff" }
        }
      }
    ]
  },
  {
    id: "tape",
    name: "彩色胶带",
    category: "胶带",
    tone: "#f5f3ee",
    cover: "/assets/packs/stickers/pack-sheet.jpg",
    sheet: "/assets/packs/stickers/pack-sheet.jpg",
    version: 1,
    items: [
      {
        id: "tape-yellow",
        type: "tape",
        name: "黄胶带",
        thumb: "",
        layer: {
          type: "tape",
          width: 260,
          height: 76,
          rotation: -10,
          style: { color: "#ead48a" }
        }
      },
      {
        id: "tape-sage",
        type: "tape",
        name: "绿胶带",
        thumb: "",
        layer: {
          type: "tape",
          width: 260,
          height: 76,
          rotation: 8,
          style: { color: "#8d9b8e" }
        }
      }
    ]
  },
  {
    id: "mark",
    name: "手写标记",
    category: "标记",
    tone: "#f5f4f1",
    cover: "/assets/packs/stickers/pack-sheet.jpg",
    sheet: "/assets/packs/stickers/pack-sheet.jpg",
    version: 1,
    items: [
      {
        id: "cat-01",
        type: "sticker",
        name: "小猫贴纸 01",
        source: "/assets/packs/stickers/items/cat-01.png",
        thumb: "/assets/packs/stickers/items/cat-01.png",
        width: 289,
        height: 269
      },
      {
        id: "cat-02",
        type: "sticker",
        name: "小猫贴纸 02",
        source: "/assets/packs/stickers/items/cat-02.png",
        thumb: "/assets/packs/stickers/items/cat-02.png",
        width: 221,
        height: 295
      },
      {
        id: "dot-mark",
        type: "paper",
        name: "圆点标记",
        thumb: "",
        layer: {
          type: "paper",
          width: 108,
          height: 108,
          rotation: 0,
          radius: 54,
          style: { color: "#f5ecda", shape: "circle" }
        }
      },
      {
        id: "mono-line",
        type: "tape",
        name: "手绘线",
        thumb: "",
        layer: {
          type: "tape",
          width: 190,
          height: 14,
          rotation: -10,
          style: { color: "#52606a" }
        }
      }
    ]
  }
];

const ASSET_TRANSFER_STORAGE_KEY = "journal.pendingAssetIds";
const FAVORITE_PACK_STORAGE_KEY = "journal.favoritePackIds";

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
  ASSET_TRANSFER_STORAGE_KEY,
  FAVORITE_PACK_STORAGE_KEY,
  assetPacks,
  getAssetPacks,
  getAssetPack,
  getAssetItems,
  getAssetItem
};
