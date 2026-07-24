const ASSET_TRANSFER_STORAGE_KEY = "journal.pendingAssetIds";
const ASSET_TRANSFER_MODE_STORAGE_KEY = "journal.pendingAssetMode";
const ASSET_ENTRY_CONTEXT_STORAGE_KEY = "journal.assetEntryContext";
const FAVORITE_PACK_STORAGE_KEY = "journal.favoritePackIds";
const { imagePackDefinitions } = require("./assets/packs/index");

const remoteUrlCache = {};

const assetPacks = imagePackDefinitions.map(createImagePack);

function createImagePack(definition) {
  const basePath = `/assets/packs/${definition.id}`;
  const cover = createAssetSource(definition, definition.cover, `${basePath}/${definition.cover}`);
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    tone: definition.tone,
    cover: cover.preview || cover.source,
    sheet: cover.preview || cover.source,
    coverCloudFileId: cover.cloudFileId,
    version: 1,
    items: definition.items.map(([fileName, width, height, label]) => {
      const assetSource = createAssetSource(definition, `items/${fileName}`, `${basePath}/items/${fileName}`);
      const itemId = `${definition.id}-${fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
      return {
        id: itemId,
        type: "sticker",
        name: label || `${definition.name} ${fileName.replace(/\.[^.]+$/, "")}`,
        source: assetSource.source,
        thumb: assetSource.preview || assetSource.source,
        cloudFileId: assetSource.cloudFileId,
        width,
        height
      };
    })
  };
}

function createAssetSource(definition, relativePath, fallbackPath) {
  if (definition.baseUrl) {
    const source = `${trimRight(definition.baseUrl, "/")}/${relativePath}`;
    return {
      source,
      preview: source,
      cloudFileId: ""
    };
  }
  if (definition.cloudBasePath) {
    const cloudFileId = `${trimRight(definition.cloudBasePath, "/")}/${relativePath}`;
    return {
      source: "",
      preview: cloudFileId,
      cloudFileId
    };
  }
  return {
    source: fallbackPath,
    preview: fallbackPath,
    cloudFileId: ""
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

function getResolvedAssetPacks() {
  return resolveAssetPacks(getAssetPacks());
}

function getResolvedAssetPack(packId) {
  const pack = getAssetPack(packId);
  return pack ? resolveAssetPack(pack) : Promise.resolve(null);
}

function getResolvedAssetItem(assetId) {
  const item = getAssetItem(assetId);
  return item ? resolveAssetItem(item) : Promise.resolve(null);
}

function resolveAssetPacks(packs) {
  return Promise.all((packs || []).map(resolveAssetPack));
}

function resolveAssetPack(pack) {
  if (!pack) return Promise.resolve(null);
  return Promise.all([
    resolveAssetUrl(pack.cover, pack.coverCloudFileId),
    Promise.all((pack.items || []).map(resolveAssetItem))
  ]).then(([cover, items]) => ({
    ...pack,
    cover,
    sheet: cover,
    items
  }));
}

function resolveAssetItem(item) {
  if (!item) return Promise.resolve(null);
  return resolveAssetUrl(item.source, item.cloudFileId).then((source) => ({
    ...item,
    source: source || item.source || item.cloudFileId || "",
    thumb: source || item.thumb || item.cloudFileId || ""
  }));
}

function resolveAssetUrl(source, cloudFileId) {
  if (source) return Promise.resolve(source);
  if (!cloudFileId) return Promise.resolve("");
  if (remoteUrlCache[cloudFileId]) return Promise.resolve(remoteUrlCache[cloudFileId]);
  if (!wx.cloud || !wx.cloud.getTempFileURL) return Promise.resolve("");
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: [cloudFileId],
      success: (res) => {
        const file = res && res.fileList && res.fileList[0];
        const tempUrl = file && file.tempFileURL ? file.tempFileURL : "";
        if (tempUrl) {
          remoteUrlCache[cloudFileId] = tempUrl;
          console.info("[assets] getTempFileURL success", cloudFileId);
        } else {
          console.warn("[assets] getTempFileURL empty", cloudFileId, file, res);
        }
        resolve(tempUrl);
      },
      fail: (error) => {
        console.warn("[assets] getTempFileURL failed", cloudFileId, error);
        resolve("");
      }
    });
  });
}

function trimRight(value, char) {
  let result = String(value || "");
  while (result.endsWith(char)) {
    result = result.slice(0, -1);
  }
  return result;
}

module.exports = {
  ASSET_TRANSFER_STORAGE_KEY,
  ASSET_TRANSFER_MODE_STORAGE_KEY,
  ASSET_ENTRY_CONTEXT_STORAGE_KEY,
  FAVORITE_PACK_STORAGE_KEY,
  assetPacks,
  getAssetPacks,
  getAssetPack,
  getAssetItems,
  getAssetItem,
  getResolvedAssetPacks,
  getResolvedAssetPack,
  getResolvedAssetItem
};
