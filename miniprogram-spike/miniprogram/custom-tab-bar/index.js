function getInitialTabBarState() {
  try {
    const app = getApp ? getApp() : null;
    const globalData = app && app.globalData ? app.globalData : {};
    return {
      selected: Number.isInteger(globalData.tabBarSelectedIndex) ? globalData.tabBarSelectedIndex : 0,
      hidden: !!globalData.tabBarHidden
    };
  } catch (error) {
    return { selected: 0, hidden: false };
  }
}

const initialTabBarState = getInitialTabBarState();

Component({
  data: {
    selected: initialTabBarState.selected,
    hidden: initialTabBarState.hidden,
    items: [
      {
        pagePath: "/pages/create/index",
        text: "创作",
        iconPath: "/assets/icons/tabbar/tab-create.png",
        selectedIconPath: "/assets/icons/tabbar/tab-create-active.png"
      },
      {
        pagePath: "/pages/assets/index",
        text: "素材",
        iconPath: "/assets/icons/tabbar/tab-assets.png",
        selectedIconPath: "/assets/icons/tabbar/tab-assets-active.png"
      },
      {
        pagePath: "/pages/inspiration/index",
        text: "灵感",
        iconPath: "/assets/icons/tabbar/tab-inspo.png",
        selectedIconPath: "/assets/icons/tabbar/tab-inspo-active.png"
      },
      {
        pagePath: "/pages/me/index",
        text: "我的",
        iconPath: "/assets/icons/tabbar/tab-mine.png",
        selectedIconPath: "/assets/icons/tabbar/tab-mine-active.png"
      }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelectedFromRoute();
    }
  },

  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index || 0);
      const item = this.data.items[index];
      if (!item || index === this.data.selected) return;
      this.applyTabBarState(index, false);
      wx.switchTab({ url: item.pagePath });
    },

    setSelectedByPath(path, options = {}) {
      const normalizedPath = path && path.charAt(0) === "/" ? path : `/${path || ""}`;
      const selected = this.data.items.findIndex((item) => item.pagePath === normalizedPath);
      const hidden = options.hidden == null ? false : !!options.hidden;
      this.applyTabBarState(selected >= 0 ? selected : 0, hidden);
    },

    syncSelectedFromRoute() {
      const pages = getCurrentPages ? getCurrentPages() : [];
      const current = pages[pages.length - 1];
      if (current && current.route) {
        const app = getApp ? getApp() : null;
        const hidden = !!(app && app.globalData && app.globalData.tabBarHidden);
        this.setSelectedByPath(current.route, { hidden });
      }
    },

    setHidden(hidden) {
      this.applyTabBarState(this.data.selected >= 0 ? this.data.selected : 0, !!hidden);
    },

    applyTabBarState(selected, hidden) {
      const nextSelected = Number.isInteger(selected) ? selected : 0;
      const nextHidden = !!hidden;
      const app = getApp ? getApp() : null;
      if (app && app.globalData) {
        app.globalData.tabBarSelectedIndex = nextSelected;
        app.globalData.tabBarHidden = nextHidden;
      }
      if (this.data.selected === nextSelected && this.data.hidden === nextHidden) return;
      this.setData({
        selected: nextSelected,
        hidden: nextHidden
      });
    }
  }
});
