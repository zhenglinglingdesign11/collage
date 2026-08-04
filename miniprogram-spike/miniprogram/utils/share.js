const SHARE_PATHS = {
  create: "/pages/create/index",
  assets: "/pages/assets/index",
  inspiration: "/pages/inspiration/index",
  me: "/pages/me/index"
};

function shareCreate() {
  return {
    title: "用照片做一张手账拼贴",
    path: SHARE_PATHS.create
  };
}

function shareAssets() {
  return {
    title: "翻一翻手账贴纸和拼贴素材",
    path: SHARE_PATHS.assets
  };
}

function shareInspiration() {
  return {
    title: "看看这些手账拼贴灵感",
    path: SHARE_PATHS.inspiration
  };
}

function shareDefault() {
  return {
    title: "手账拼贴、贴纸素材和照片拼贴工具",
    path: SHARE_PATHS.create
  };
}

module.exports = {
  shareCreate,
  shareAssets,
  shareInspiration,
  shareDefault
};
