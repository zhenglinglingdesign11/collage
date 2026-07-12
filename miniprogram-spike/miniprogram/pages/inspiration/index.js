Page({
  data: {
    inspirations: [
      {
        id: "single-material-1",
        src: "/assets/packs/sanguangtiezhi/items/8.png",
        alt: "灵感单素材 1",
        ratio: 0.98
      },
      {
        id: "single-material-2",
        src: "/assets/packs/sanguangtiezhi/items/2.png",
        alt: "灵感单素材 2",
        ratio: 1
      },
      {
        id: "single-material-3",
        src: "/assets/packs/sanguangtiezhi/items/3.png",
        alt: "灵感单素材 3",
        ratio: 1.25
      },
      {
        id: "single-material-4",
        src: "/assets/packs/jiaodai/items/profile-2.png",
        alt: "灵感单素材 4",
        ratio: 0.963
      },
      {
        id: "single-material-5",
        src: "/assets/packs/sanguangtiezhi/items/7.png",
        alt: "灵感单素材 5",
        ratio: 1.376
      },
      {
        id: "single-material-6",
        src: "/assets/packs/jiazi/items/5.png",
        alt: "灵感单素材 6",
        ratio: 1.667
      },
      {
        id: "single-material-7",
        src: "/assets/packs/hudiejie/items/8.png",
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
    const inspirationColumns = splitInspirationColumns(this.data.inspirations);
    this.setData({
      leftInspirations: inspirationColumns[0],
      rightInspirations: inspirationColumns[1]
    });
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
  }
});

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
