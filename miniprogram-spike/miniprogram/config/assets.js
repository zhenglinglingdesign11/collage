const ASSET_TRANSFER_STORAGE_KEY = "journal.pendingAssetIds";
const FAVORITE_PACK_STORAGE_KEY = "journal.favoritePackIds";

const imagePackDefinitions = [
  {
    id: "papers",
    name: "复古纸张",
    category: "纸张",
    tone: "#f3f1ec",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 342, 352],
      ["2.png", 291, 299],
      ["3.png", 285, 326],
      ["4.png", 289, 264],
      ["5.png", 256, 348],
      ["6.png", 356, 322],
      ["7.png", 291, 275],
      ["8.png", 255, 235],
      ["9.png", 322, 231],
      ["10.png", 303, 233]
    ]
  },
  {
    id: "stickers",
    name: "贴纸",
    category: "贴纸",
    tone: "#f5f4f1",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 178, 260],
      ["2.png", 279, 197],
      ["3.png", 213, 234],
      ["4.png", 219, 247],
      ["5.png", 196, 261],
      ["6.png", 203, 303],
      ["7.png", 294, 293],
      ["8.png", 299, 287],
      ["9.png", 238, 266],
      ["10.png", 231, 267]
    ]
  },
  {
    id: "jiaodai",
    name: "胶带",
    category: "胶带",
    tone: "#f5f3ee",
    cover: "pack-sheet.jpg",
    items: [
      ["book-1.png", 287, 107],
      ["book-2.png", 261, 111],
      ["book-3.png", 255, 103],
      ["chat-1.png", 302, 112],
      ["chat-2.png", 323, 104],
      ["chat-3.png", 291, 133],
      ["profile-1.png", 282, 106],
      ["profile-2.png", 82, 79],
      ["profile-3.png", 191, 162],
      ["profile-4.png", 254, 119]
    ]
  },
  {
    id: "hudiejie",
    name: "蝴蝶结",
    category: "贴纸",
    tone: "#f6f0ee",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 276, 250],
      ["2.png", 269, 249],
      ["3.png", 263, 250],
      ["4.png", 259, 180],
      ["5.png", 258, 179],
      ["6.png", 261, 184],
      ["7.png", 294, 154],
      ["8.png", 281, 151],
      ["9.png", 290, 147],
      ["10.png", 273, 184]
    ]
  },
  {
    id: "jiazi",
    name: "夹子",
    category: "贴纸",
    tone: "#f0f2f1",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 160, 215],
      ["2.png", 107, 199],
      ["3.png", 97, 196],
      ["4.png", 192, 201],
      ["5.png", 96, 160],
      ["6.png", 110, 181],
      ["7.png", 149, 213],
      ["8.png", 169, 219],
      ["9.png", 111, 214],
      ["10.png", 229, 251]
    ]
  },
  {
    id: "leisi",
    name: "蕾丝",
    category: "纹理",
    tone: "#f7f4ef",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 100, 749],
      ["2.png", 72, 752],
      ["3.png", 73, 755],
      ["4.png", 106, 750],
      ["5.png", 73, 749],
      ["6.png", 114, 752],
      ["7.png", 92, 755],
      ["8.png", 96, 753],
      ["9.png", 83, 751],
      ["10.png", 66, 751]
    ]
  },
  {
    id: "sanguangtiezhi",
    name: "三光贴纸",
    category: "贴纸",
    tone: "#f5f5f2",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 305, 323],
      ["2.png", 68, 68],
      ["3.png", 80, 100],
      ["4.png", 188, 195],
      ["5.png", 265, 269],
      ["6.png", 122, 131],
      ["7.png", 85, 117],
      ["8.png", 50, 49],
      ["9.png", 219, 222],
      ["10.png", 237, 174]
    ]
  },
  {
    id: "sanjiao",
    name: "三角素材",
    category: "贴纸",
    tone: "#f3f1ec",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 268, 278],
      ["2.png", 276, 275],
      ["3.png", 284, 276],
      ["4.png", 282, 263],
      ["5.png", 290, 264],
      ["6.png", 301, 262],
      ["7.png", 286, 258],
      ["8.png", 283, 248],
      ["9.png", 285, 243],
      ["10.png", 283, 426]
    ]
  },
  {
    id: "troy",
    name: "Troy",
    category: "贴纸",
    tone: "#f1f3f2",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 195, 156],
      ["2.png", 177, 191],
      ["3.png", 219, 166],
      ["4.png", 110, 184],
      ["5.png", 153, 130],
      ["6.png", 177, 172],
      ["7.png", 145, 160],
      ["8.png", 114, 174],
      ["9.png", 201, 172],
      ["10.png", 212, 195]
    ]
  },
  {
    id: "xiangkuang",
    name: "相框",
    category: "边框",
    tone: "#f4f0ec",
    cover: "pack-sheet.jpg",
    items: [
      ["1.png", 284, 663],
      ["2.png", 392, 274],
      ["3.png", 254, 332],
      ["4.png", 364, 171],
      ["5.png", 273, 256],
      ["6.png", 308, 229],
      ["7.png", 337, 276],
      ["8.png", 252, 167],
      ["9.png", 353, 197],
      ["10.png", 269, 273]
    ]
  }
];

const temporarilyIgnoredPackIds = [
  "stickers",
  "hudiejie",
  "jiazi",
  "sanguangtiezhi",
  "sanjiao",
  "troy",
  "leisi"
];

const assetPacks = imagePackDefinitions
  .filter((definition) => !temporarilyIgnoredPackIds.includes(definition.id))
  .map(createImagePack);

function createImagePack(definition) {
  const basePath = `/assets/packs/${definition.id}`;
  const cover = `${basePath}/${definition.cover}`;
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    tone: definition.tone,
    cover,
    sheet: cover,
    version: 1,
    items: definition.items.map(([fileName, width, height, label]) => {
      const source = `${basePath}/items/${fileName}`;
      const itemId = `${definition.id}-${fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
      return {
        id: itemId,
        type: "sticker",
        name: label || `${definition.name} ${fileName.replace(/\.[^.]+$/, "")}`,
        source,
        thumb: source,
        width,
        height
      };
    })
  };
}

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
