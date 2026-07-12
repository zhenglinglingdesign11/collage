const { showModal, showSuccess } = require("../../utils/feedback");
const { clearDraft, loadRecentDrafts } = require("../../utils/draft-store");

const PENDING_DRAFT_OPEN_KEY = "journal.pendingDraftOpen.v1";

Page({
  data: {
    recentDrafts: [],
    hasRecentDrafts: false
  },

  onShow() {
    this.refreshRecentDrafts();
  },

  refreshRecentDrafts() {
    const recentDrafts = loadRecentDrafts().map((draft) => ({
      id: draft.id,
      thumbnailPath: draft.thumbnailPath || "",
      ratio: draft.ratio || "3:4",
      updatedAt: draft.updatedAt || 0
    }));
    this.setData({
      recentDrafts,
      hasRecentDrafts: recentDrafts.length > 0
    });
  },

  openRecentDraft(event) {
    const draftId = event && event.currentTarget && event.currentTarget.dataset.id;
    if (!draftId) return;
    const app = getApp && getApp();
    if (app && app.globalData) {
      app.globalData.currentDraftId = draftId;
    }
    wx.setStorageSync(PENDING_DRAFT_OPEN_KEY, draftId);
    wx.switchTab({ url: "/pages/create/index" });
  },

  async clearCache() {
    const result = await showModal(
      "清理缓存",
      "将清除本地草稿、临时素材和导出缓存，是否继续？",
      { confirmText: "清理" }
    );
    if (!result.confirm) return;
    clearDraft();
    wx.removeStorageSync(PENDING_DRAFT_OPEN_KEY);
    const app = getApp && getApp();
    if (app && app.globalData) {
      app.globalData.currentDraftId = "";
    }
    this.refreshRecentDrafts();
    showSuccess("缓存已清理");
  }
});
