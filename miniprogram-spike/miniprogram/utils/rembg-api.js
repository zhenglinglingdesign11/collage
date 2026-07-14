const rembgConfig = require("../config/rembg");

function removeImageBackground(options = {}) {
  const endpoint = options.endpoint || rembgConfig.endpoint;
  if (!endpoint) {
    return Promise.reject(new Error("missing_rembg_endpoint"));
  }

  return uploadToRembg({
    endpoint,
    filePath: options.filePath,
    fileFieldName: options.fileFieldName || rembgConfig.fileFieldName || "file",
    formData: options.formData || rembgConfig.formData || {},
    headers: options.headers || rembgConfig.headers || {}
  });
}

function uploadToRembg({ endpoint, filePath, fileFieldName, formData, headers }) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error("missing_image_file"));
      return;
    }
    wx.uploadFile({
      url: endpoint,
      filePath,
      name: fileFieldName,
      formData,
      header: headers,
      success: (res) => {
        const statusCode = Number(res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`rembg_http_${statusCode || "error"}`));
          return;
        }
        handleRembgResponse(res.data)
          .then(resolve)
          .catch(reject);
      },
      fail: reject
    });
  });
}

function handleRembgResponse(rawData) {
  const data = parseJson(rawData);
  if (!data) {
    if (typeof rawData === "string" && looksLikeBase64Image(rawData)) {
      return saveBase64Image(rawData);
    }
    return Promise.reject(new Error("unsupported_rembg_response"));
  }

  const payload = data.data && typeof data.data === "object" ? data.data : data;
  const imageUrl = pickFirstString(payload, ["url", "imageUrl", "outputUrl", "resultUrl", "downloadUrl"]);
  if (imageUrl) {
    return downloadImage(imageUrl);
  }

  const base64 = pickFirstString(payload, ["base64", "imageBase64", "resultBase64", "data"]);
  if (base64) {
    return saveBase64Image(base64);
  }

  return Promise.reject(new Error("missing_rembg_result"));
}

function parseJson(rawData) {
  if (!rawData) return null;
  if (typeof rawData === "object") return rawData;
  try {
    return JSON.parse(rawData);
  } catch (error) {
    return null;
  }
}

function pickFirstString(data, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = data[keys[i]];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function looksLikeBase64Image(value) {
  const trimmed = value.trim();
  if (/^data:image\/\w+;base64,/.test(trimmed)) return true;
  return trimmed.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        const statusCode = Number(res.statusCode || 0);
        if (statusCode >= 200 && statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error(`rembg_download_${statusCode || "error"}`));
      },
      fail: reject
    });
  });
}

function saveBase64Image(value) {
  return new Promise((resolve, reject) => {
    if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
      reject(new Error("filesystem_unavailable"));
      return;
    }
    const match = /^data:image\/\w+;base64,(.+)$/.exec(value);
    const payload = match ? match[1] : value;
    const filePath = `${wx.env.USER_DATA_PATH}/rembg-${Date.now()}.png`;
    wx.getFileSystemManager().writeFile({
      filePath,
      data: payload,
      encoding: "base64",
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

module.exports = {
  removeImageBackground
};
