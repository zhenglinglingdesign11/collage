const MAX_MEDIA_CHECK_SIZE = 10 * 1024 * 1024;
const CHECK_IMAGE_COMPRESS_QUALITY = 65;

function checkImageContent(filePath, options = {}) {
  if (!filePath) return Promise.reject(new Error("missing_file_path"));
  if (!wx.cloud || !wx.cloud.uploadFile || !wx.cloud.callFunction) {
    return Promise.reject(new Error("cloud_unavailable"));
  }

  return createCheckImageFile(filePath)
    .then((checkFilePath) => ensureMediaSize(checkFilePath)
      .then(() => checkFilePath))
    .then((checkFilePath) => wxCloudUploadFile({
      cloudPath: createSecurityCloudPath(checkFilePath),
      filePath: checkFilePath
    }).catch((error) => {
      throw createContentSecurityError("media_upload_failed", error);
    }))
    .then((uploadResult) => {
      const fileId = uploadResult.fileID || uploadResult.fileId || "";
      if (!fileId) throw new Error("missing_uploaded_file_id");
      return wxCloudCallFunction({
        name: "content-security",
        data: {
          action: "checkImage",
          fileId
        }
      }).catch((error) => {
        throw createContentSecurityError("content_check_failed", error);
      }).then((checkResult) => {
        const result = checkResult.result || {};
        if (result.passed === false) {
          const error = new Error(result.reason || "media_risky");
          error.result = result;
          throw error;
        }
        return {
          fileId,
          traceId: result.traceId || "",
          result
        };
      });
    });
}

function checkTextContent(content) {
  const text = String(content || "").trim();
  if (!text) return Promise.resolve({ result: { passed: true } });
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error("cloud_unavailable"));
  }
  return wxCloudCallFunction({
    name: "content-security",
    data: {
      action: "checkText",
      content: text
    }
  }).catch((error) => {
    throw createContentSecurityError("text_check_failed", error);
  }).then((checkResult) => {
    const result = checkResult.result || {};
    if (result.passed === false) {
      const error = new Error(result.reason || "text_risky");
      error.result = result;
      throw error;
    }
    return { result };
  });
}

function createContentSecurityError(message, cause) {
  const error = new Error(message);
  error.cause = cause;
  error.detail = cause && (cause.errMsg || cause.message || JSON.stringify(cause));
  return error;
}

function createCheckImageFile(filePath) {
  if (!wx.compressImage) {
    return Promise.resolve(filePath);
  }
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: CHECK_IMAGE_COMPRESS_QUALITY,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    });
  });
}

function ensureMediaSize(filePath, size) {
  const fileSize = Number(size) || 0;
  if (fileSize > MAX_MEDIA_CHECK_SIZE) {
    return Promise.reject(new Error("media_too_large"));
  }
  if (fileSize || !wx.getFileInfo) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: (res) => {
        if (Number(res.size) > MAX_MEDIA_CHECK_SIZE) {
          reject(new Error("media_too_large"));
          return;
        }
        resolve();
      },
      fail: reject
    });
  });
}

function createSecurityCloudPath(filePath) {
  const extMatch = String(filePath).match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
  const random = Math.random().toString(36).slice(2, 10);
  return `content-security/${Date.now()}-${random}${ext}`;
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

module.exports = {
  checkImageContent,
  checkTextContent
};
