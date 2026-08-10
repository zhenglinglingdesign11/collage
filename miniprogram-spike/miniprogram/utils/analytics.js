const SESSION_STORAGE_KEY = "journal.analytics.session.v1";
const DEVICE_STORAGE_KEY = "journal.analytics.device.v1";
const CLOUD_FUNCTION_NAME = "analytics-track";

let analyticsState = {
  sessionId: "",
  deviceId: "",
  launchOptions: {},
  enabled: true
};

function initAnalytics(options = {}) {
  analyticsState.sessionId = createSessionId();
  analyticsState.deviceId = getOrCreateDeviceId();
  analyticsState.launchOptions = options.launchOptions || {};
  wx.setStorageSync(SESSION_STORAGE_KEY, {
    sessionId: analyticsState.sessionId,
    startedAt: Date.now()
  });
  track("app_launch", {
    scene: analyticsState.launchOptions.scene || "",
    path: analyticsState.launchOptions.path || ""
  });
}

function track(event, params = {}) {
  if (!analyticsState.enabled || !event) return;
  const app = safeGetApp();
  const payload = {
    event,
    page: params.page || getCurrentPageRoute(),
    session_id: analyticsState.sessionId || createSessionId(),
    device_id: analyticsState.deviceId || getOrCreateDeviceId(),
    draft_id: params.draftId || "",
    timestamp: Date.now(),
    field_mode: params.__analyticsFieldMode || "default",
    params: sanitizeParams(params)
  };
  if (app && app.globalData && app.globalData.analyticsDebug !== false) {
    console.info("[analytics]", payload.event, payload);
  }
  reportToWeAnalytics(payload, app);
  if (!wx.cloud || !wx.cloud.callFunction) return;
  wx.cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: payload,
    fail: (error) => {
      console.warn("[analytics] upload failed", event, error && error.errMsg || error);
    }
  });
}

function reportToWeAnalytics(payload, app) {
  if (app && app.globalData && app.globalData.analyticsWeDataEnabled === false) return;
  const data = payload.field_mode === "minimal"
    ? {
      session_id: payload.session_id,
      device_id: payload.device_id,
      draft_id: payload.draft_id,
      ...(payload.params || {})
    }
    : {
      page: payload.page,
      session_id: payload.session_id,
      device_id: payload.device_id,
      draft_id: payload.draft_id,
      timestamp: payload.timestamp,
      ...(payload.params || {})
    };
  try {
    if (wx.reportEvent) {
      wx.reportEvent(payload.event, data);
      return;
    }
    if (wx.reportAnalytics) {
      wx.reportAnalytics(payload.event, data);
    }
  } catch (error) {
    console.warn("[analytics] WeData upload failed", payload.event, error);
  }
}

function trackPageShow(page, pageName) {
  if (!page) return;
  page.__analyticsPageName = pageName || getCurrentPageRoute();
  page.__analyticsShowAt = Date.now();
  track("page_show", { page: page.__analyticsPageName });
}

function trackPageHide(page) {
  if (!page || !page.__analyticsShowAt) return;
  const durationMs = Date.now() - page.__analyticsShowAt;
  const params = {
    page: page.__analyticsPageName || getCurrentPageRoute(),
    duration_ms: durationMs
  };
  track("page_hide", params);
  track("page_duration", params);
  page.__analyticsShowAt = 0;
}

function trackShare(page, channel, params = {}) {
  track(channel === "timeline" ? "share_timeline" : "share_app_message", {
    page,
    ...params
  });
}

function sanitizeParams(params) {
  const result = {};
  Object.keys(params || {}).forEach((key) => {
    if (key.startsWith("__")) return;
    if (key === "page" || key === "draftId") return;
    const value = params[key];
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[toSnakeCase(key)] = value;
      return;
    }
    if (Array.isArray(value)) {
      result[toSnakeCase(key)] = value
        .filter((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
        .slice(0, 20);
    }
  });
  return result;
}

function getCurrentPageRoute() {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const page = pages && pages.length ? pages[pages.length - 1] : null;
  return page && page.route ? page.route : "";
}

function safeGetApp() {
  try {
    return typeof getApp === "function" ? getApp() : null;
  } catch (error) {
    return null;
  }
}

function getOrCreateDeviceId() {
  const cached = wx.getStorageSync(DEVICE_STORAGE_KEY);
  if (cached) return cached;
  const deviceId = createId("device");
  wx.setStorageSync(DEVICE_STORAGE_KEY, deviceId);
  return deviceId;
}

function createSessionId() {
  return createId("session");
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toSnakeCase(value) {
  return String(value || "")
    .replace(/([A-Z])/g, "_$1")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

module.exports = {
  initAnalytics,
  track,
  trackPageShow,
  trackPageHide,
  trackShare
};
