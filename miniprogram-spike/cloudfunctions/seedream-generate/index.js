const cloud = require("wx-server-sdk");
const https = require("https");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ARK_IMAGE_GENERATION_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const SEEDREAM_MODEL = "doubao-seedream-4-0-250828";
const DEFAULT_CREATIVE_TEAR_PAPER_STYLE = "watercolor-zine-reveal";
const USAGE_COLLECTION = "creative_tear_paper_usage";
const CREATIVE_TEAR_PAPER_STYLES = {
  "watercolor-zine-reveal": {
    label: "水彩杂志撕纸",
    prompt: [
      "Use the input image as one continuous scene.",
      "",
      "Create a large torn-paper reveal composition on warm textured handmade paper.",
      "The torn reveal must be the dominant visual area, occupying 65-80% of the image width and 45-65% of the image height.",
      "Inside the torn reveal, keep the original photo scene clearly visible, detailed, and faithful to the input image.",
      "",
      "The torn shape should be wide and landscape-oriented, not a small central hole.",
      "It should feel like a large sheet of paper was torn away to reveal the original photo underneath.",
      "The reveal should show the main subject, water, trees, horizon, reflections, and important details from the input image.",
      "",
      "Around the torn reveal, extend the same scene outward as pale watercolor and blue-gray ink illustration on aged paper.",
      "The outer illustration must connect spatially with the inner photo:",
      "continue the shoreline, trees, water reflections, horizon, mountains, architecture, or major shapes from the input image across the torn boundary.",
      "The outer layer should be faded, airy, low contrast, and partially absorbed into the paper texture.",
      "",
      "The torn edge should be subtle and realistic:",
      "thin irregular deckled fibers, beige paper pulp, small paper dust, slight inner shadow.",
      "No thick border, no folded paper flaps, no curled page corners, no sticker frame, no strong drop shadow.",
      "",
      "Composition:",
      "wide organic torn opening, photographic center, watercolor continuation around it, warm ivory paper, subtle scan grain, minimal handmade zine style.",
      "",
      "Avoid:",
      "small circular opening,",
      "small decorative window,",
      "photo sticker collage,",
      "folded paper flaps,",
      "curled paper corners,",
      "thick 3D paper frame,",
      "separate pasted photo,",
      "empty outer background,",
      "unrelated landscape,",
      "watermark,",
      "logo."
    ].join("\n")
  }
};

exports.main = async (event = {}) => {
  try {
    return await handleCreativeTearPaper(event);
  } catch (error) {
    return {
      ok: false,
      errorCode: error && error.message || "seedream_generate_failed",
      errorDetail: error && (error.detail || error.responseText || safeStringify(error.response) || error.stack) || ""
    };
  }
};

async function handleCreativeTearPaper(event = {}) {
  if (event.action !== "creativeTearPaper") {
    throw new Error("unsupported_seedream_action");
  }

  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("ark_api_key_not_configured");
  }

  const fileId = String(event.fileId || "");
  if (!fileId) {
    throw new Error("missing_file_id");
  }

  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID || wxContext.openId || "";
  if (!openId) {
    throw new Error("missing_openid");
  }
  await reserveDailyUsage(openId, event.now);

  const imageDataUri = await getImageDataUri(fileId);
  const style = getCreativeTearPaperStyle(event.styleId);
  const arkResult = await requestJson(ARK_IMAGE_GENERATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      prompt: style.prompt,
      image: imageDataUri,
      size: "2K",
      stream: false,
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled"
    })
  });
  const generatedUrl = pickGeneratedImageUrl(arkResult);
  if (!generatedUrl) {
    const error = new Error("missing_seedream_result");
    error.raw = arkResult;
    throw error;
  }

  const imageBuffer = await downloadBinary(generatedUrl);
  const random = Math.random().toString(36).slice(2, 10);
  const uploadResult = await cloud.uploadFile({
    cloudPath: `seedream-output/${Date.now()}-${random}.png`,
    fileContent: imageBuffer
  });
  const outputFileId = uploadResult.fileID || uploadResult.fileId || "";
  const tempFileURL = outputFileId ? await getTempFileURL(outputFileId) : generatedUrl;

  return {
    ok: true,
    fileId: outputFileId,
    tempFileURL,
    styleId: style.id,
    styleLabel: style.label,
    rawCreated: arkResult.created || 0
  };
}

async function reserveDailyUsage(openId, now) {
  const usageDate = getUsageDate(now);
  const usageId = `${openId}:${usageDate}`;
  try {
    await db.collection(USAGE_COLLECTION).add({
      data: {
        _id: usageId,
        openId,
        usageDate,
        action: "creativeTearPaper",
        createdAt: db.serverDate()
      }
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error("daily_limit_exceeded");
    }
    throw error;
  }
}

function getUsageDate(now) {
  const date = now ? new Date(now) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = validDate.getFullYear();
  const month = String(validDate.getMonth() + 1).padStart(2, "0");
  const day = String(validDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDuplicateKeyError(error) {
  const message = `${error && (error.errMsg || error.message || error.code || error.errCode) || ""}`;
  return /duplicate|duplicate key|-501007|DATABASE_DUPLICATE|E11000/i.test(message);
}

function getCreativeTearPaperStyle(styleId) {
  const id = String(styleId || DEFAULT_CREATIVE_TEAR_PAPER_STYLE);
  const style = CREATIVE_TEAR_PAPER_STYLES[id] || CREATIVE_TEAR_PAPER_STYLES[DEFAULT_CREATIVE_TEAR_PAPER_STYLE];
  return {
    id: CREATIVE_TEAR_PAPER_STYLES[id] ? id : DEFAULT_CREATIVE_TEAR_PAPER_STYLE,
    label: style.label,
    prompt: style.prompt
  };
}

function getTempFileURL(fileId) {
  return cloud.getTempFileURL({
    fileList: [fileId]
  }).then((response) => {
    const file = response.fileList && response.fileList[0];
    if (!file || file.status !== 0 || !file.tempFileURL) {
      throw new Error("failed_to_resolve_file_url");
    }
    return file.tempFileURL;
  });
}

async function getImageDataUri(fileId) {
  const downloadResult = await cloud.downloadFile({ fileID: fileId });
  const content = downloadResult.fileContent;
  if (!content || !content.length) {
    throw new Error("failed_to_download_seedream_input");
  }
  return `data:image/png;base64,${content.toString("base64")}`;
}

function requestJson(url, options = {}) {
  return requestBuffer(url, options).then(({ statusCode, body }) => {
    const text = body.toString("utf8");
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      const parseError = new Error("seedream_invalid_json");
      parseError.responseText = text;
      throw parseError;
    }
    if (statusCode < 200 || statusCode >= 300) {
      const httpError = new Error(`seedream_http_${statusCode}:${summarizeResponse(payload)}`);
      httpError.response = payload;
      throw httpError;
    }
    return payload;
  });
}

function safeStringify(value) {
  if (!value) return "";
  try {
    return JSON.stringify(value).slice(0, 1200);
  } catch (error) {
    return "";
  }
}

function summarizeResponse(payload) {
  if (!payload || typeof payload !== "object") return "empty_response";
  const error = payload.error || payload;
  const parts = [
    error.code || error.err_code || error.error_code || payload.code,
    error.message || error.err_msg || error.msg || payload.message
  ].filter(Boolean);
  if (parts.length) return parts.join(":").slice(0, 480);
  try {
    return JSON.stringify(payload).slice(0, 480);
  } catch (error) {
    return "unserializable_response";
  }
}

function downloadBinary(url) {
  return requestBuffer(url, { method: "GET" }).then(({ statusCode, body }) => {
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`seedream_result_download_${statusCode}`);
    }
    return body;
  });
}

function requestBuffer(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method || "GET",
      headers: options.headers || {}
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectCount < 5) {
        response.resume();
        resolve(requestBuffer(new URL(location, url).toString(), options, redirectCount + 1));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ statusCode, body: Buffer.concat(chunks) }));
    });
    request.on("error", reject);
    request.setTimeout(120000, () => {
      request.destroy(new Error("seedream_request_timeout"));
    });
    if (options.body) request.write(options.body);
    request.end();
  });
}

function pickGeneratedImageUrl(payload = {}) {
  const data = Array.isArray(payload.data) ? payload.data : [];
  for (let index = 0; index < data.length; index += 1) {
    const item = data[index] || {};
    const url = item.url || item.image_url || item.imageUrl || "";
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return "";
}
