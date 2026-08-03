const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MEDIA_TYPE_IMAGE = 2;
const SCENE_SOCIAL_LOG = 4;

exports.main = async (event = {}) => {
  if (event.action === "checkText") {
    return msgSecCheck(event.content);
  }

  if (event.action !== "checkImage" && event.action !== "mediaCheckAsync") {
    throw new Error("unsupported_content_security_action");
  }

  const fileId = String(event.fileId || "");
  if (!fileId) {
    throw new Error("missing_file_id");
  }

  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) {
    throw new Error("missing_openid");
  }

  const mediaUrl = await getTempFileURL(fileId);
  const asyncResult = await cloud.openapi.security.mediaCheckAsync({
    media_url: mediaUrl,
    media_type: MEDIA_TYPE_IMAGE,
    version: 2,
    scene: SCENE_SOCIAL_LOG,
    openid
  });

  if (event.action === "mediaCheckAsync") {
    return createPassResult(asyncResult);
  }

  const syncResult = await imgSecCheck(fileId, mediaUrl);
  if (!syncResult.passed) {
    return {
      ok: true,
      passed: false,
      reason: syncResult.reason,
      traceId: asyncResult.traceId || asyncResult.trace_id || "",
      asyncRaw: asyncResult,
      syncRaw: syncResult.raw
    };
  }

  return createPassResult(asyncResult, syncResult.raw);
};

function createPassResult(asyncResult, syncResult) {
  return {
    ok: true,
    passed: true,
    traceId: asyncResult.traceId || asyncResult.trace_id || "",
    asyncRaw: asyncResult,
    syncRaw: syncResult || null
  };
}

async function imgSecCheck(fileId, mediaUrl) {
  try {
    const downloadResult = await cloud.downloadFile({ fileID: fileId });
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: contentTypeForUrl(mediaUrl),
        value: downloadResult.fileContent
      }
    });
    const errCode = Number(result.errCode || result.errcode || 0);
    return {
      passed: errCode === 0,
      reason: errCode === 0 ? "" : "media_risky",
      raw: result
    };
  } catch (error) {
    const errCode = Number(error.errCode || error.errcode || 0);
    if (errCode === 87014) {
      return {
        passed: false,
        reason: "media_risky",
        raw: normalizeError(error)
      };
    }
    throw error;
  }
}

async function msgSecCheck(content) {
  const text = String(content || "").trim();
  if (!text) {
    return {
      ok: true,
      passed: true,
      raw: null
    };
  }
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content: text
    });
    const errCode = Number(result.errCode || result.errcode || 0);
    return {
      ok: true,
      passed: errCode === 0,
      reason: errCode === 0 ? "" : "text_risky",
      raw: result
    };
  } catch (error) {
    const errCode = Number(error.errCode || error.errcode || 0);
    if (errCode === 87014) {
      return {
        ok: true,
        passed: false,
        reason: "text_risky",
        raw: normalizeError(error)
      };
    }
    throw error;
  }
}

async function getTempFileURL(fileId) {
  const response = await cloud.getTempFileURL({
    fileList: [fileId]
  });
  const file = response.fileList && response.fileList[0];
  if (!file || file.status !== 0 || !file.tempFileURL) {
    throw new Error("failed_to_resolve_media_url");
  }
  return file.tempFileURL;
}

function contentTypeForUrl(url) {
  const cleanUrl = String(url || "").split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".gif")) return "image/gif";
  if (cleanUrl.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function normalizeError(error) {
  return {
    errCode: error.errCode || error.errcode || 0,
    errMsg: error.errMsg || error.errmsg || error.message || "content_security_error"
  };
}
