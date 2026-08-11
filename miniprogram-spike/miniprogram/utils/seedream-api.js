function generateSeedreamImage(options = {}) {
  if (!options.filePath) {
    return Promise.reject(new Error("missing_image_file"));
  }
  if (!wx.cloud || !wx.cloud.uploadFile || !wx.cloud.callFunction) {
    return Promise.reject(new Error("cloud_unavailable"));
  }

  return wxCloudUploadFile({
    cloudPath: createSeedreamCloudPath(options.filePath),
    filePath: options.filePath
  })
    .then((uploadResult) => {
      const fileId = uploadResult.fileID || uploadResult.fileId || "";
      if (!fileId) throw new Error("missing_uploaded_file_id");
      return wxCloudCallFunction({
        name: "seedream-generate",
        data: {
          action: "creativeTearPaper",
          fileId,
          styleId: options.styleId || "watercolor-zine-reveal",
          now: options.now || Date.now()
        }
      });
    })
    .then((callResult) => {
      const result = callResult.result || {};
      if (result.ok === false) {
        const error = new Error(result.errorCode || "seedream_generate_failed");
        error.detail = result.errorDetail || "";
        throw error;
      }
      const imageUrl = result.tempFileURL || result.url || result.imageUrl || "";
      if (!imageUrl) throw new Error("missing_seedream_result");
      return downloadImage(imageUrl);
    });
}

function createSeedreamCloudPath(filePath) {
  const extMatch = String(filePath || "").match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
  const random = Math.random().toString(36).slice(2, 10);
  return `seedream-input/${Date.now()}-${random}${ext}`;
}

function wxCloudUploadFile(options) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function wxCloudCallFunction(options) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    if (!wx.downloadFile) {
      reject(new Error("download_unavailable"));
      return;
    }
    wx.downloadFile({
      url,
      success: (res) => {
        const statusCode = Number(res.statusCode || 0);
        if (statusCode >= 200 && statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`seedream_download_${statusCode || "error"}`));
      },
      fail: reject
    });
  });
}

module.exports = {
  generateSeedreamImage
};
