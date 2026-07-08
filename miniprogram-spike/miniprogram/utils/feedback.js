function showToast(title, options = {}) {
  wx.showToast({
    title,
    icon: options.icon || "none",
    duration: options.duration || 1800
  });
}

function showSuccess(title) {
  showToast(title, { icon: "success" });
}

function showError(title) {
  showToast(title, { icon: "none" });
}

function showModal(title, content, options = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: options.showCancel !== false,
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      success: resolve,
      fail: () => resolve({ confirm: false, cancel: true })
    });
  });
}

module.exports = {
  showToast,
  showSuccess,
  showError,
  showModal
};
