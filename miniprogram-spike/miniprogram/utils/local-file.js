function persistTempFile(tempFilePath) {
  if (!tempFilePath || !wx.getFileSystemManager) {
    return Promise.resolve(tempFilePath || "");
  }
  return new Promise((resolve) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: (res) => resolve(res.savedFilePath || tempFilePath),
      fail: () => resolve(tempFilePath)
    });
  });
}

module.exports = {
  persistTempFile
};
