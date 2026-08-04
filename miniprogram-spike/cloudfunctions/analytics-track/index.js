const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION_NAME = "analytics_events";

exports.main = async (event = {}) => {
  const { OPENID: openId } = cloud.getWXContext();
  const eventName = safeString(event.event, 64);
  if (!eventName) {
    throw new Error("missing_analytics_event");
  }

  const timestamp = Number(event.timestamp) || Date.now();
  const record = {
    event: eventName,
    page: safeString(event.page, 128),
    session_id: safeString(event.session_id, 80),
    device_id: safeString(event.device_id, 80),
    draft_id: safeString(event.draft_id, 100),
    open_id: openId || "",
    timestamp,
    event_date: formatDate(timestamp),
    params: sanitizeParams(event.params),
    created_at: db.serverDate()
  };

  await db.collection(COLLECTION_NAME).add({ data: record });
  return { ok: true };
};

function sanitizeParams(params = {}) {
  return Object.keys(params || {}).reduce((result, key) => {
    const cleanKey = safeString(key, 64);
    const value = params[key];
    if (!cleanKey || value == null) return result;
    if (typeof value === "string") {
      result[cleanKey] = safeString(value, 256);
      return result;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      result[cleanKey] = value;
      return result;
    }
    if (Array.isArray(value)) {
      result[cleanKey] = value
        .filter((item) => ["string", "number", "boolean"].includes(typeof item))
        .slice(0, 20)
        .map((item) => (typeof item === "string" ? safeString(item, 256) : item));
    }
    return result;
  }, {});
}

function safeString(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
