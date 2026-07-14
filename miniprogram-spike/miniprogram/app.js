App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: "cloudbase-d6g4f30s2b2a1c042"
      });
    }
  },
  globalData: {
    draftId: "local-draft-v1",
    currentDraftId: ""
  }
});
