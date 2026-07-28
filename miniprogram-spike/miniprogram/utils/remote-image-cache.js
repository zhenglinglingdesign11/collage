const CACHE_INDEX_KEY = "journal.remoteImageCache.v1";
const CACHE_DIR_NAME = "journal-remote-images";
const MAX_CACHE_ENTRIES = 160;
const MAX_CACHE_BYTES = 30 * 1024 * 1024;

const inFlightDownloads = {};

function resolveCachedRemoteImage(url, options = {}) {
  if (!isRemoteImageSource(url)) return Promise.resolve(url || "");
  if (inFlightDownloads[url]) return inFlightDownloads[url];
  const promise = getCachedFilePath(url)
    .then((cachedPath) => {
      if (cachedPath) return cachedPath;
      return downloadAndCacheImage(url, options);
    })
    .catch((error) => {
      console.warn("[remote-cache] resolve failed", url, error);
      return "";
    })
    .then((path) => {
      delete inFlightDownloads[url];
      return path || "";
    });
  inFlightDownloads[url] = promise;
  return promise;
}

function isRemoteImageSource(url) {
  return /^https?:\/\//i.test(url || "");
}

function getCachedFilePath(url) {
  const entry = readCacheIndex()[url];
  if (!entry || !entry.path) return Promise.resolve("");
  return fileExists(entry.path).then((exists) => {
    if (!exists) {
      removeCacheEntry(url);
      return "";
    }
    touchCacheEntry(url);
    return entry.path;
  });
}

function downloadAndCacheImage(url, options) {
  return downloadRemoteImage(url, options).then((tempFilePath) => {
    if (!tempFilePath) return "";
    return persistRemoteImage(url, tempFilePath)
      .then((filePath) => filePath || tempFilePath)
      .catch((error) => {
        console.warn("[remote-cache] persist failed", url, error);
        return tempFilePath;
      });
  });
}

function downloadRemoteImage(url, options = {}) {
  return new Promise((resolve) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        if (options.logPrefix) {
          console.warn(`${options.logPrefix} remote image download failed`, url, res.statusCode);
        }
        resolve("");
      },
      fail: (error) => {
        if (options.logPrefix) {
          console.warn(`${options.logPrefix} remote image download failed`, url, error);
        }
        resolve("");
      }
    });
  });
}

function persistRemoteImage(url, tempFilePath) {
  if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
    return Promise.resolve(tempFilePath || "");
  }
  const fs = wx.getFileSystemManager();
  const dirPath = `${wx.env.USER_DATA_PATH}/${CACHE_DIR_NAME}`;
  const filePath = `${dirPath}/${hashUrl(url)}${getFileExtension(url)}`;
  return ensureDirectory(fs, dirPath)
    .then(() => fileExists(filePath))
    .then((exists) => {
      if (exists) return filePath;
      return saveFile(fs, tempFilePath, filePath);
    })
    .then((savedPath) => statFile(fs, savedPath).then((size) => {
      upsertCacheEntry(url, {
        path: savedPath,
        size,
        updatedAt: Date.now(),
        lastAccessedAt: Date.now()
      });
      pruneCache(url);
      return savedPath;
    }));
}

function ensureDirectory(fs, dirPath) {
  return fileExists(dirPath).then((exists) => {
    if (exists) return undefined;
    return new Promise((resolve) => {
      fs.mkdir({
        dirPath,
        recursive: true,
        success: () => resolve(),
        fail: () => resolve()
      });
    });
  });
}

function saveFile(fs, tempFilePath, filePath) {
  return new Promise((resolve, reject) => {
    fs.saveFile({
      tempFilePath,
      filePath,
      success: (res) => resolve(res.savedFilePath || filePath),
      fail: reject
    });
  });
}

function fileExists(path) {
  if (!path || !wx.getFileSystemManager) return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.getFileSystemManager().access({
      path,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

function statFile(fs, filePath) {
  return new Promise((resolve) => {
    fs.stat({
      path: filePath,
      success: (res) => resolve(res.stats && res.stats.size || 0),
      fail: () => resolve(0)
    });
  });
}

function readCacheIndex() {
  const value = wx.getStorageSync(CACHE_INDEX_KEY);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeCacheIndex(index) {
  wx.setStorageSync(CACHE_INDEX_KEY, index || {});
}

function upsertCacheEntry(url, entry) {
  const index = readCacheIndex();
  index[url] = entry;
  writeCacheIndex(index);
}

function touchCacheEntry(url) {
  const index = readCacheIndex();
  if (!index[url]) return;
  index[url] = {
    ...index[url],
    lastAccessedAt: Date.now()
  };
  writeCacheIndex(index);
}

function removeCacheEntry(url) {
  const index = readCacheIndex();
  if (!index[url]) return;
  delete index[url];
  writeCacheIndex(index);
}

function pruneCache(protectedUrl) {
  const index = readCacheIndex();
  const entries = Object.keys(index)
    .map((url) => ({ url, ...index[url] }))
    .filter((entry) => entry.path);
  let totalSize = entries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0);
  const sorted = entries.sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));
  while (sorted.length > MAX_CACHE_ENTRIES || totalSize > MAX_CACHE_BYTES) {
    const entry = sorted.shift();
    if (!entry) break;
    if (entry.url === protectedUrl) continue;
    delete index[entry.url];
    totalSize -= Number(entry.size) || 0;
    unlinkFile(entry.path);
  }
  writeCacheIndex(index);
}

function unlinkFile(filePath) {
  if (!filePath || !wx.getFileSystemManager) return;
  wx.getFileSystemManager().unlink({
    filePath,
    fail: () => {}
  });
}

function hashUrl(url) {
  let hash = 2166136261;
  const value = String(url || "");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `img-${(hash >>> 0).toString(16)}`;
}

function getFileExtension(url) {
  const path = String(url || "").split("?")[0].split("#")[0];
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(path);
  return match ? `.${match[1].toLowerCase()}` : ".img";
}

module.exports = {
  resolveCachedRemoteImage,
  isRemoteImageSource
};
