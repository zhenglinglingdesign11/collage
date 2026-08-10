const { showModal, showSuccess } = require("../../utils/feedback");
const { clearDraft, loadRecentDrafts } = require("../../utils/draft-store");
const { shareDefault } = require("../../utils/share");
const { track, trackPageShow, trackPageHide, trackShare } = require("../../utils/analytics");

const PENDING_DRAFT_OPEN_KEY = "journal.pendingDraftOpen.v1";

Page({
  data: {
    recentDrafts: [],
    hasRecentDrafts: false,
    feedbackVisible: false
  },

  onLoad() {
    enableShareMenu();
    track("me_page_view", { page: "me" });
  },

  onShareAppMessage() {
    trackShare("me", "app_message");
    return shareDefault();
  },

  onShareTimeline() {
    trackShare("me", "timeline");
    return shareDefault();
  },

  onShow() {
    trackPageShow(this, "me");
    this.refreshRecentDrafts();
  },

  onHide() {
    trackPageHide(this);
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
    track("me_recent_draft_open", {
      page: "me",
      draftId
    });
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
    track("cache_clear", { page: "me" });
    showSuccess("缓存已清理");
  },

  openFeedback() {
    this.setData({ feedbackVisible: true });
    track("feedback_open", { page: "me" });
  },

  closeFeedback() {
    this.setData({ feedbackVisible: false });
  },

  stopPropagation() {},

  copyFeedbackEmail() {
    const email = "2972455713@qq.com";
    wx.setClipboardData({
      data: email,
      success: () => {
        track("feedback_email_copy", { page: "me" });
        showSuccess("邮箱已复制");
      }
    });
  }
});

function enableShareMenu() {
  if (!wx.showShareMenu) return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
}
