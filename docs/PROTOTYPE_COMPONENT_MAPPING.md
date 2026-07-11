# H5 原型到小程序组件映射表

更新时间：2026-07-09

本文档用于约束小程序实现：`index.html`、`app.js`、`styles.css` 是当前高保真 H5 原型，后续小程序页面和组件必须先对照本表迁移，不再凭感觉重设结构、文案、间距或视觉效果。

## 使用规则

- H5 原型是视觉与交互规格，不只是氛围参考。
- 改小程序页面前，先找到对应的 H5 render 函数和 CSS class。
- 未经明确要求，不新增 H5 原型没有的信息层级、文案、副标题、按钮或卡片。
- 如果小程序平台能力与 H5 不一致，先记录差异和取舍，再实现。
- 每次改动后反向核对：结构、文案、尺寸/间距、颜色、层级、状态。

## 全局壳层

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderStatusBar()` | `app.js` | 页面顶部安全区 / 自定义状态栏占位 | 部分页面用系统导航或自算安全区 | 一级页需统一顶部高度和标题起点，不混用不同头部节奏 |
| `.screen` | `styles.css` | 各 tab 页面根容器 | 分散在各页面 `.page` | 一级页统一背景 `#fafaf8`、布局方向、底部 tab 预留 |
| `.content` / `.sheet-page` | `styles.css` | 页面滚动内容区 | 各页面自行写 | 统一页面内边距、滚动区和底部避让 |
| `renderTabbar()` | `app.js` | `custom-tab-bar` | 目前使用原生 `tabBar`，不一致 | 必须改自定义 tabbar 才能还原 icon+label、高度、分割线、背景、safe area |
| `.home-indicator` | `styles.css` | 自定义 tabbar 内安全区表达 | 原生 tabbar 不可控 | 与自定义 tabbar 一起处理，不在单页重复画 |

## 主 Tab

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `tabs` 配置 | `app.js` | tab 数据配置 | `app.json tabBar.list` 只有文字 | 保持 4 tab：创作、素材、灵感、我的 |
| `renderIcon("tab-create")` | `app.js` | 创作 tab icon | 缺失 | 迁移为自定义 tabbar 图标，样式用线性图标 |
| `renderIcon("tab-assets")` | `app.js` | 素材 tab icon | 缺失 | 同 H5 图标语义 |
| `renderIcon("tab-inspo")` | `app.js` | 灵感 tab icon | 缺失 | 同 H5 图标语义 |
| `renderIcon("tab-mine")` | `app.js` | 我的 tab icon | 缺失 | 同 H5 图标语义 |
| `.tabbar` | `styles.css` | `custom-tab-bar/index.wxss` | 原生 tabbar | 高度约 `150rpx`，顶部 1px 分割线，白色 0.97 背景，4 等分 |
| `.tab` | `styles.css` | `custom-tab-bar` item | 原生 tabbar | icon 在上、label 在下，居中，未选中 tertiary，选中 ink |
| `.tab-icon` | `styles.css` | tab icon wrapper | 缺失 | 图标约 `42rpx`，不使用彩色 tab 图 |

## 创作页空状态

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderEmptyCreate()` | `app.js` | `pages/create/index.wxml` 空状态分支 | 已部分迁移 | 只按 H5 空状态结构调整；用户已明确空状态不展示尺寸选项 |
| `.top-row .page-title` | `styles.css` | `.empty-header .page-title` | 已部分迁移 | 只显示「新拼贴」，不加副标题 |
| `.ratio-tabs` | `styles.css` | 空状态不迁移 | 已移除 | 比例选择只保留编辑态 |
| `.starter-panel` + `.upload-zone` | `styles.css` | 单一 `button.starter-panel.upload-zone` | 已修正为单层 button | 不再出现外层容器包按钮的双层入口 |
| `.upload-content` | `styles.css` | 上传入口内容 | 已部分迁移 | 文案保持「添加照片」「从相册选择，开始你的拼贴」 |
| `.material-start` | `styles.css` | 素材入口按钮 | 已部分迁移 | 只显示「从素材包开始」，不显示副文案，不折行 |
| `.section-head` | `styles.css` | 最近草稿标题 | 已部分迁移 | 只显示「最近草稿」，不显示「继续编辑」 |
| `.draft-row` / `.draft-thumb` | `styles.css` | 草稿缩略图行 | 已部分迁移 | 有草稿时按 H5 草稿缩略图节奏 |
| `.empty-note` | `styles.css` | 无草稿状态 | 小程序为轻插画空态 | 若继续还原 H5，应保持克制，不做额外说明卡 |

## 创作页编辑态

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderEditor()` | `app.js` | `pages/create/index.wxml` 编辑分支 | 已部分迁移 | 顶部栏、画布区、底部工具栏按 H5 层级 |
| `.editor-topbar` | `styles.css` | `.editor-topbar` | 已部分迁移 | 左返回、中比例、右撤销/重做/导出；不要恢复旧 spike 顶栏 |
| `.ratio-pill` | `styles.css` | `.ratio-pill` | 已迁移 | 编辑态比例入口 |
| `.canvas-stage` | `styles.css` | `.canvas-stage` | 已部分迁移 | 中央画布、底部工具栏避让 |
| `.collage-canvas` | `styles.css` | `canvas` 渲染视觉 | 由 `renderer.js` 绘制 | 背景纸感和阴影需由 canvas / 容器共同还原 |
| `renderMainToolbar()` | `app.js` | `.main-toolbar` | 已部分迁移 | 仅编辑态显示，不在空态显示 |
| `.main-toolbar .tool` | `styles.css` | 主工具项 | 已部分迁移 | 6 等分：图片、素材、胶带、文字、剪刀、形状 |

## 图层选中态

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderLayerToolbar()` | `app.js` | `.layer-toolbar` | 已部分迁移 | 选中图层后替换主工具栏 |
| `.layer-head` | `styles.css` | `.layer-head` | 已部分迁移 | 标题和文字编辑入口按 H5 |
| `.layer-actions` | `styles.css` | 操作列表 | 已部分迁移 | 左对齐，保持现代线性工具面板，不做卡片 |
| `layerActions` | `app.js` | 操作项数据 | 已部分迁移 | 复制、删除、收纳、上移、下移、阴影、透明度、圆角、撕边 |
| `.canvas-layer.selected` | `styles.css` | canvas 选中框绘制 | 由 renderer 绘制 | 黑色细线、小控制点，不能用厚重系统选框 |

## 底部面板与抽屉

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderDrawer()` | `app.js` | `.drawer` / cover-view 面板 | 已部分迁移 | 图片、素材、胶带等用 bottom sheet |
| `.drawer-backdrop` | `styles.css` | `.drawer-backdrop` | 已部分迁移 | 半透明黑，不使用蓝色或系统弹窗感 |
| `.drawer-handle` | `styles.css` | `.drawer-handle` | 已部分迁移 | 顶部短 handle |
| `.ios-action-sheet` | `styles.css` | 图片选择面板 | 已部分迁移 | 相册、拍照、取消 |
| `.asset-grid` / `.asset-tile` | `styles.css` | 胶带/素材快速面板 | 已部分迁移 | 快速添加可以网格，素材页不做商城网格 |
| `.tool-palette` | `styles.css` | 剪刀 / 形状局部浮层 | 已部分迁移 | 保持 H5 浮层位置和轻玻璃感，不扩展成大面板 |

## 素材页

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderAssetsScreen()` | `app.js` | `pages/assets/index.*` | 当前仍是简化素材列表，不一致 | 需整体迁移，不做商品卡片 |
| `.sheet-page` | `styles.css` | 素材页滚动容器 | 未统一 | 顶部标题后进入滚动内容，底部避让 tab |
| `.category-tabs` | `styles.css` | 分类 tabs | 未迁移 | 推荐、收藏、纸张、胶带、票据、贴纸、标记、纹理 |
| `.pack-grid` | `styles.css` | 素材包双列 | 未迁移 | 双列 pack card |
| `.pack-card` | `styles.css` | 素材包卡片 | 未迁移 | 卡片展示散落素材，不显示商品描述、数量、购买感 |
| `.pack-scatter` / `.paper-mini` / `.tape-mini` | `styles.css` | 素材包内容预览 | 未迁移 | 内容本身是主视觉 |
| `renderAssetDetail()` | `app.js` | 素材包详情页/状态 | 未迁移 | 像打开一张真实素材纸 |
| `.detail-paper` | `styles.css` | 非结构化素材纸 | 未迁移 | 大纸面、散落素材、点击选中 |
| `.add-to-canvas` | `styles.css` | 添加到画布按钮 | 未迁移 | 仅选中素材后出现 |

## 灵感页

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderInspoScreen()` | `app.js` | `pages/inspiration/index.*` | 需核对 | 瀑布流图片，不做模板说明页 |
| `.inspo-list` | `styles.css` | 双列瀑布流 | 待核对 | 两列、窄间距、底部避让 tab |
| `.inspo-card` | `styles.css` | 灵感卡片 | 待核对 | 图片为主，圆角 8px，轻阴影 |
| `.inspo-preview` | `styles.css` | 大图预览浮层 | 待核对 | 黑色遮罩、居中大图、关闭按钮 |

## 我的页

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderMineScreen()` | `app.js` | `pages/me/index.*` | 需核对 | 最近草稿 + 设置 |
| `.settings-card` | `styles.css` | 设置项 | 待迁移/核对 | 清理缓存卡片，右侧 icon button |
| `.settings-copy` | `styles.css` | 设置文字 | 待迁移/核对 | 标题 + 说明，保持克制 |
| `.settings-action` | `styles.css` | 设置操作按钮 | 待迁移/核对 | 弱背景圆形图标按钮 |

## 导出页

| H5 原型 | H5 位置 | 小程序目标 | 当前状态 | 迁移要求 |
| --- | --- | --- | --- | --- |
| `renderExportScreen()` | `app.js` | 创作页导出状态/页面 | 已部分迁移导出能力 | 导出预览与保存状态后续按 H5 对齐 |
| `.export-preview` | `styles.css` | 导出内容区 | 待迁移/核对 | 顶部返回、中间预览、底部保存按钮 |
| `.preview-wrap` | `styles.css` | 画布预览容器 | 待迁移/核对 | 画布缩放预览 |
| `.share-row` / `.share-button` | `styles.css` | 分享入口 | P0 可后置 | 不影响 P0 时可不做 |

## 视觉 Token 对照

| H5 token / class | 值 | 小程序落点 | 要求 |
| --- | --- | --- | --- |
| `--ink` | `#111111` | `app.wxss` / 页面 wxss | 主文字、主按钮、选中态 |
| `--text-secondary` | `#6f6f6f` | 页面 wxss | 次级文字 |
| `--text-tertiary` | `#9a9a9a` | 页面 wxss | tab 未选中、箭头 |
| `--page` | `#fafaf8` | `app.wxss` | 全局页面背景 |
| `--weak` | `#f7f7f5` | 页面 wxss | 弱背景、chip |
| `--border` | `#e8e6e1` | 页面 wxss | 卡片边框 |
| `--divider` | `#eceae5` | 页面 wxss | 分割线 |
| `--paper` | `#fdfdfb` | canvas / 上传区 | 纸面背景 |
| `--tape` | `#ead48a` | 素材 / 画布 | 只用于素材，不做主 UI 色 |
| `--shadow-light` | `0 2px 8px rgba(17,17,17,.06)` | `0 2rpx 16rpx rgba(17,17,17,.06)` | 轻卡片阴影 |
| `--shadow-toolbar` | `0 8px 28px rgba(17,17,17,.10)` | `0 16rpx 56rpx rgba(17,17,17,.10)` | 工具栏 |

## 当前优先级

1. 主 tab / 全局壳层：改自定义 tabbar，对齐 H5 `.tabbar`。
2. 创作页空状态：保持当前已修正范围，不再发散。
3. 创作页编辑态：核对顶栏、画布、主工具栏、图层工具栏。
4. 素材页：整体迁移 H5 `renderAssetsScreen()`，替换当前简化列表。
5. 灵感页 / 我的页：按 H5 对应函数逐页核对。

