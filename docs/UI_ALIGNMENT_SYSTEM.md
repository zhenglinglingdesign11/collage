# 产品 UI 对齐系统

## 目的

本系统让 Expo 产品层以小程序为视觉和交互真源，先生成可复用的 token、组件和验收证据，再实现页面。它不改变 `editor-core` 的文档/命令契约，也不影响 `editor-renderer` 的画布、缩略图或导出。

## 真源与适用边界

1. 截图是视觉结果真源：`小程序截图/IMG_7586.PNG` 至 `IMG_7599.PNG`。
2. `miniprogram-spike/miniprogram/` 是现行状态和尺寸真源。
3. 小程序状态栏、右上角胶囊属于微信容器，iOS 不复制；用原生 Safe Area 表达相同的内容层级。
4. Development Build 的浮动齿轮等调试层不属于产品，截图对比必须使用 Preview 或 Release 构建。

## 目录与职责

| 位置 | 职责 |
| --- | --- |
| `apps/mobile/src/product-ui/tokens.ts` | 产品 UI 的颜色、间距和尺寸；不得放画布/导出 token。 |
| `apps/mobile/src/product-ui/localization.ts` | 用户可见 UI key、英文基线与简体中文；缺失 key 回退英文，禁止显示 key。 |
| `apps/mobile/src/product-ui/assets.ts` | 稳定 `asset://ui/...` ID 到 Expo bundle 资源的唯一平台解析点。 |
| `apps/mobile/src/product-ui/ProductAppShell.tsx` | 全屏 Safe Area 分配与 Tab 容器。 |
| `apps/mobile/src/product-ui/ProductTabBar.tsx` | 三 Tab 的精确可复用实现。 |
| `packages/asset-system` | 编辑素材和用户资源的目录/缓存；不导入 React Native 或 `require()`。 |

## 已冻结的 Tab Bar 度量

源于 `custom-tab-bar/index.wxss`，按 iOS point 转换并以 Safe Area 自适应：

| 项目 | 规格 |
| --- | --- |
| 可见内容高度 | 56 pt |
| 底部高度 | 当前设备 `safeAreaInsets.bottom` |
| 顶部/水平内边距 | 4 pt / 11 pt |
| 单项高度 | 48 pt |
| 图标 | 23 × 23 pt，使用现有 default/selected PNG |
| 标签 | 12 pt / 16 pt；普通 `#6F6F6F`，选中 `#111111` |
| 表面/分隔线 | `#FFFFFF` / `#ECEAE5` hairline |

## 已冻结的编辑器顶部栏关系

来源为 `pages/create/index.wxml` 与 `pages/create/index.wxss` 的 `editor-topbar`，并用编辑器未选中图层的截图核验。

| 项目 | 规格 |
| --- | --- |
| 栏高与边距 | 56 pt 高；左右 20 pt |
| 垂直关系 | 返回、比例、撤销、重做、导出均以栏的同一垂直中线为准 |
| 返回 | 左侧 20 pt；36 × 36 pt 命中区域，原始 `line-back.svg` path |
| 比例 | 相对**产品 viewport**水平居中；不参与左右操作组的宽度分配 |
| 操作组 | 右侧 20 pt；两个 36 × 36 pt 图标命中区域、4 pt 间距、30 pt 高导出胶囊 |
| 图标 | 使用小程序 `line-back.svg`、`line-undo.svg`、`line-redo.svg` 的原始 24 × 24 path 和 1.65 pt 圆角描边 |

截图素材可能包含模拟器或容器的右侧留白；对齐时必须先确定实际产品 viewport，不能以导出的整张图片边界推导“屏幕中心”。

## 页面实施顺序

1. App Shell 和 Tab Bar：三 Tab、真实图标、Safe Area、双语言。
2. 创作空态：标题、照片主入口、空白/素材包入口。
3. 创作内容流与最近草稿。
4. 素材列表与详情。
5. 我的与草稿管理。
6. 编辑器顶栏、工具栏、Sheet 和全屏工具状态。

每一阶段先复用现有 token/组件；若现有组件不能表达参考页面，先扩展组件或 token，再写页面局部样式。

## 视觉验收门禁

- 使用同一交互状态、同一语言、相近 390 pt 和 402 pt 宽度 iPhone 进行成对截图。
- 首先检查：Safe Area、页面边距、Tab 区高度、图标资源、文字层级和滚动/遮挡。
- 通过透明叠图检查位置和大小；允许因系统字体抗锯齿和设备像素密度产生细微差异，但不允许替代图标、占位布局或容器 UI 混入产品截图。
- 每次修改共享 token 或 shell，必须回归创作、素材、我的三页的中英文状态。
