const { showToast } = require("../../utils/feedback");

Page({
  data: {
    hasDrafts: false
  },

  clearCache() {
    showToast("缓存清理待接入");
  }
});
