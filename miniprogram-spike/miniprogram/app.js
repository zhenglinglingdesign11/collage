const { initAnalytics } = require("./utils/analytics");

App({
  onLaunch(options) {
    if (wx.cloud) {
      wx.cloud.init({
        env: "cloudbase-d6g4f30s2b2a1c042"
      });
    }
    initAnalytics({ launchOptions: options || {} });
  },
  globalData: {
    analyticsDebug: false,
    draftId: "local-draft-v1",
    currentDraftId: ""
  }
});
