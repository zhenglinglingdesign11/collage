const { getAssetPacks } = require("../../config/assets");

Page({
  data: {
    packs: getAssetPacks()
  }
});
