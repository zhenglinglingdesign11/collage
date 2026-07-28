const {
  isRemoteImageSource,
  resolveCachedRemoteImage
} = require("../../utils/remote-image-cache");

Page({
  data: {
    inspirations: [
      {
        id: "single-material-1",
        src: "/assets/packs/papers/items/8.png",
        alt: "灵感单素材 1",
        ratio: 0.98
      },
      {
        id: "single-material-2",
        src: "https://assets.zllarchi.site/packs/jiaodai/items/11.png",
        alt: "灵感单素材 2",
        ratio: 0.97
      },
      {
        id: "single-material-3",
        src: "https://assets.zllarchi.site/packs/xiangkuang/items/8.png",
        alt: "灵感单素材 3",
        ratio: 1.25
      },
      {
        id: "single-material-4",
        src: "https://assets.zllarchi.site/packs/jiaodai/items/11.png",
        alt: "灵感单素材 4",
        ratio: 0.97
      },
      {
        id: "single-material-5",
        src: "/assets/packs/papers/items/3.png",
        alt: "灵感单素材 5",
        ratio: 1.376
      },
      {
        id: "single-material-6",
        src: "https://assets.zllarchi.site/packs/jiaodai/items/7.png",
        alt: "灵感单素材 6",
        ratio: 2.828
      },
      {
        id: "single-material-7",
        src: "https://assets.zllarchi.site/packs/xiangkuang/items/4.png",
        alt: "灵感单素材 7",
        ratio: 0.537
      }
    ],
    leftInspirations: [],
    rightInspirations: [],
    selectedImageSrc: "",
    selectedImageAlt: ""
  },

  onLoad() {
    this.refreshInspirations();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setSelectedByPath) {
      tabBar.setSelectedByPath("/pages/inspiration/index");
    }
  },

  openInspiration(event) {
    const { src, alt } = event.currentTarget.dataset;
    if (!src) return;
    this.setData({
      selectedImageSrc: src,
      selectedImageAlt: alt || "灵感大图"
    });
  },

  closePreview() {
    this.setData({
      selectedImageSrc: "",
      selectedImageAlt: ""
    });
  },

  noop() {
  },

  refreshInspirations() {
    resolveInspirationImages(this.data.inspirations).then((inspirations) => {
      const inspirationColumns = splitInspirationColumns(inspirations);
      this.setData({
        inspirations,
        leftInspirations: inspirationColumns[0],
        rightInspirations: inspirationColumns[1]
      });
    });
  }
});

const remoteInspirationImageCache = {};

function resolveInspirationImages(items) {
  return Promise.all((items || []).map((item) => resolveInspirationImage(item)));
}

function resolveInspirationImage(item) {
  if (!item || !isRemoteImageSource(item.src)) return Promise.resolve(item);
  const cached = remoteInspirationImageCache[item.src];
  if (cached) {
    return cached.then((src) => ({
      ...item,
      src: src || item.src
    }));
  }
  const promise = resolveCachedRemoteImage(item.src, { logPrefix: "[inspiration]" });
  remoteInspirationImageCache[item.src] = promise;
  return promise.then((src) => ({
    ...item,
    src: src || item.src
  }));
}

function splitInspirationColumns(items) {
  const columns = [[], []];
  const heights = [0, 0];
  items.forEach((item) => {
    const targetColumn = heights[0] <= heights[1] ? 0 : 1;
    columns[targetColumn].push({
      ...item,
      paddingTop: `${Math.round(item.ratio * 10000) / 100}%`
    });
    heights[targetColumn] += item.ratio;
  });
  return columns;
}
