function persistTempFile(tempFilePath) {
  if (!tempFilePath || !wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
    return Promise.resolve(tempFilePath || "");
  }
  return new Promise((resolve) => {
    const fileManager = wx.getFileSystemManager();
    const extensionMatch = tempFilePath.match(/\.[a-zA-Z0-9]+(?:\?.*)?$/);
    const extension = extensionMatch ? extensionMatch[0].split("?")[0] : ".jpg";
    const savedFilePath = `${wx.env.USER_DATA_PATH}/image-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    // saveFile 会移动临时文件，画布仍在读取临时路径时会触发 image load failed。
    // 使用 copyFile 保留临时源，待图层安全切换到永久路径后再由系统清理临时文件。
    fileManager.copyFile({
      srcPath: tempFilePath,
      destPath: savedFilePath,
      success: () => resolve(savedFilePath),
      fail: () => resolve(tempFilePath)
    });
  });
}

module.exports = {
  persistTempFile
};
