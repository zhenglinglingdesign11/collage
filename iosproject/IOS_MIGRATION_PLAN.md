# iOS 应用迁移方案

更新时间：2026-07-16

本文用于把当前微信小程序「手账拼贴」的功能、流程和视觉体系迁移到 iOS 应用。当前结论：iOS 不照搬小程序代码，重点复用产品结构、Draft / Layer schema、素材配置、灵感配置、视觉规范和导出闭环。

## 1. 迁移目标

做一款原生质感的 iOS 拼贴创作应用，让用户在 3-5 分钟内完成：

```text
打开 App
→ 添加照片
→ 在画布中移动 / 缩放 / 旋转
→ 添加素材 / 背景 / 文字 / 胶带
→ 自动保存草稿
→ 导出图片到相册 / 分享
```

iOS 版本的产品感要比小程序更顺手、更高质量，但不要变成复杂设计软件。核心仍然是「现代创作工具里的真实纸质拼贴工作台」。

## 2. 当前小程序能力盘点

### 一级页面

当前小程序已保留 4 个主 tab：

- 创作：核心首页和编辑器入口。
- 素材：素材包列表、素材包详情、添加到画布。
- 灵感：双列瀑布流、大图预览。
- 我的：最近草稿、清理缓存。

iOS 继续保留这 4 个一级入口，但建议用系统 `TabView` 承载，编辑态全屏隐藏 tab。

### 创作页状态

当前创作页已有三类核心状态：

- 空状态：新拼贴、添加照片、从素材包开始、最近草稿。
- 编辑状态：顶部返回 / 比例 / 撤销 / 重做 / 导出，中间画布，底部主工具栏。
- 图层选中状态：选中框、图层工具栏、文字编辑入口、上移下移、复制删除、裁切、剪刀、压花、阴影、透明度、圆角、撕边。

iOS 需要保留这三个状态，但交互应更靠近 iOS：底部工具用可拖拽 sheet 或固定 accessory bar，文本编辑使用键盘上方工具栏。

### 编辑器能力

小程序当前已经实现或部分实现：

- 画布比例：`3:4`、`1:1`、`9:16`。
- 图层类型：`image`、`text`、`sticker`、`tape`、`paper`。
- 画布背景：纯色、纸感、格纹、图案。
- 图片添加：相册 / 拍照入口。
- 图层手势：点击选中、拖拽、双指缩放、旋转。
- 辅助线：画布边缘 / 中心对齐、旋转角度吸附。
- 撤销 / 重做。
- 文字：字体、颜色、大小、底色、透明度。
- 素材：素材包、素材包详情、创作页素材抽屉。
- 胶带：多个颜色样式。
- 裁切：比例裁切、自由裁切。
- 剪刀：涂抹剪、主体剪入口。
- 压花 / 形状：圆形、心形、星形、标签、邮票。
- 图层效果：阴影、透明度、圆角、撕边。
- 草稿：本地自动保存、最近草稿、缩略图。
- 导出：生成图片、保存相册。

iOS P0 不必一次迁移全部高级功能。建议先保证拼贴闭环，再迁移裁切、剪刀、压花等差异化工具。

## 3. iOS 功能范围建议

### P0：首个可用版本

- 4 tab 基础架构：创作、素材、灵感、我的。
- 创作空状态：添加照片、从素材开始、最近草稿。
- 编辑器基础画布：`3:4`、`1:1`、`9:16`。
- 添加照片：照片库选择，后续再加拍照。
- 基础图层手势：选中、拖拽、缩放、旋转。
- 图层操作：复制、删除、上移、下移。
- 素材添加：纸张、贴纸、胶带、边框等素材包。
- 背景选择：纯色、纸感、格纹。
- 基础文字：输入、字体预设、颜色、字号。
- 草稿：本地保存、恢复、最近草稿。
- 导出：保存到相册、系统分享。

### P1：体验增强

- 裁切：图片比例裁切、自由裁切。
- 高级文字：底色、透明度、多行文本、更多字体。
- 图层效果：阴影、圆角、撕边、透明度。
- 对齐辅助线和旋转吸附。
- 素材收藏。
- 导出预览页。
- iCloud 或账号草稿同步的前置设计。

### P2：差异化和商业化

- 涂抹剪 / 主体剪。
- 压花 / 形状蒙版。
- 高质量素材包管理。
- 订阅 / IAP。
- 云端素材配置。
- 英文版素材、灵感、App Store 资源。
- 多设备草稿同步。

## 4. 核心流程迁移

### 从照片开始

```text
创作 tab
→ 新拼贴空状态
→ 添加照片
→ 请求照片权限
→ 用户选择图片
→ 创建默认 3:4 Draft
→ 图片图层进入画布中央
→ 自动选中图片
→ 用户调整图片
→ 添加素材 / 背景 / 文字
→ 自动保存草稿
→ 导出到相册或分享
```

iOS 差异：

- 照片权限需要清晰处理 limited access。
- 导入图片建议复制到 App 沙盒，草稿只保存本地文件引用或资源 ID。
- 大图导入要做尺寸压缩和缩略图缓存。

### 从素材开始

```text
素材 tab
→ 浏览素材包
→ 打开素材包详情
→ 选择一个或多个素材
→ 添加到画布
→ 若无当前 Draft，则创建默认 3:4 Draft
→ 回到创作 tab 编辑态
```

iOS 差异：

- 素材详情可以更像真实纸面，支持更自然的轻微散落布局。
- 添加后可以用轻量动画从素材详情过渡到画布。

### 编辑图层

```text
点击画布图层
→ 出现细线选中框和控制点
→ 底部主工具栏切换为图层工具栏
→ 用户执行复制 / 删除 / 层级 / 效果
→ 点击空白或完成返回普通编辑态
```

iOS 差异：

- 选中框和控制点建议用 SwiftUI overlay 或自定义 Canvas overlay，不直接画入导出画布。
- 手势层与渲染层分离，避免 UI 控件影响导出。

### 草稿恢复

```text
编辑行为发生
→ 防抖保存 Draft JSON
→ 同步生成缩略图
→ 创作空状态 / 我的页显示最近草稿
→ 点击草稿
→ 恢复画布、图层和素材
```

iOS 差异：

- 草稿应存入 App 沙盒，元数据可用 SQLite / SwiftData，资源文件放入 draft resource 目录。
- Draft schema 必须带 `schemaVersion`，后续支持 migrate。

### 导出分享

```text
点击导出
→ 离屏渲染高清画布
→ 生成预览
→ 保存到相册 / 调起系统分享
→ 成功提示
```

iOS 差异：

- 导出渲染必须与编辑预览一致。
- 建议输出尺寸按画布比例固定，例如 3:4 输出 1800x2400 或 2160x2880。
- 保存相册失败、权限不足、图片生成失败都要有明确兜底。

## 5. 视觉迁移原则

### 保留的品牌方向

- 现代、克制、轻纸感。
- UI 退后，画布和素材成为主角。
- 黑白灰为主，极浅暖白作为页面背景。
- 纸感只存在于画布、素材、背景纸，不做全局旧纸皮肤。
- 避免商城感、可爱贴纸感、厚重拟物、蓝色系统按钮感。

### iOS 化处理

- 使用系统导航和安全区节奏，但不要变成默认表单 App。
- 一级 tab 用 SF Symbols 或自定义线性图标，保持黑白灰。
- 编辑态顶部栏要轻：返回、比例、撤销、重做、导出。
- 底部工具栏可使用 iOS bottom bar / sheet 组合，保留「图片、素材、背景、文字、剪刀、压花」。
- Bottom sheet 使用白底、轻阴影、短 handle，避免大面积毛玻璃。
- 文字编辑面板放在键盘上方，功能切换用图标 + 短标签。
- 素材页坚持「素材纸包」视觉，不做商品卡片。

### iOS 设计 token

| Token | iOS 建议 |
| --- | --- |
| Ink Black `#111111` | `Color(hex: 0x111111)`，主文字和选中态 |
| Page `#FAFAF8` | App 主背景 |
| Panel `#FFFFFF` | sheet、工具栏、详情面板 |
| Weak `#F7F7F5` | chip、弱背景 |
| Border `#E8E6E1` | 分割线、卡片边框 |
| Text Secondary `#6F6F6F` | 次级文字 |
| Text Tertiary `#9A9A9A` | tab 未选中、说明文字 |
| Tape Yellow `#E9D28A` | 仅用于素材 / 胶带 |
| Stamp Red `#D94A38` | 仅用于素材标记、少量辅助线 |

字体：

- UI 使用 `SF Pro` / 系统中文字体。
- 画布文字可引入自定义字体，但 UI 不使用手写体或复古字体。

## 6. 数据与模型复用

### Draft v1

iOS 应沿用当前小程序 Draft 结构，并补齐平台无关字段：

```swift
struct Draft: Codable, Identifiable {
    var schemaVersion: Int
    var id: String
    var ratio: CanvasRatio
    var width: Double
    var height: Double
    var background: String
    var backgroundImage: BackgroundImage?
    var backgroundPattern: String?
    var layers: [Layer]
    var assets: [DraftAsset]
    var thumbnailPath: String?
    var updatedAt: TimeInterval
}
```

### Layer v1

当前可直接迁移的字段：

```swift
struct Layer: Codable, Identifiable {
    var id: String
    var type: LayerType
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var rotation: Double
    var scale: Double
    var opacity: Double
    var zIndex: Int
    var source: String?
    var text: String?
    var assetId: String?
    var sourceWidth: Double?
    var sourceHeight: Double?
    var crop: CropBox?
    var radius: Double?
    var shadow: Bool?
    var tear: Bool?
    var style: [String: JSONValue]
}
```

### 素材包

当前小程序素材包结构可转换为 JSON 后供 iOS 读取：

- `packId`
- `name`
- `category`
- `tone`
- `cover`
- `items`
- `version`
- `width`
- `height`
- `tags`

建议把 `miniprogram/config/assets/packs/*.js` 生成一份平台无关的 `asset-packs.json`，iOS 读取 JSON，不直接解析 JS。

### 字体

当前字体配置来自 `config/fonts.js` 和 `font-table.js`。iOS 需要：

- 整理字体授权。
- 将可内置字体放入 iOS bundle。
- 用 PostScript name 注册和渲染。
- 草稿里保存 `fontId`，不要保存平台字体名作为唯一依据。

## 7. iOS 技术架构建议

### 推荐栈

- UI：SwiftUI。
- 画布编辑：SwiftUI +自定义渲染层；必要时局部用 UIKit gesture / CoreGraphics。
- 图片选择：PhotosPicker。
- 本地存储：文件系统 + SQLite / SwiftData 元数据。
- 图片缓存：本地缩略图缓存。
- 导出：离屏 CoreGraphics / ImageRenderer 路线，确保和编辑态一致。

### 模块划分

```text
iosproject/
  App/
    JournalCollageApp.swift
    RootTabView.swift
  Features/
    Create/
    Editor/
    Assets/
    Inspiration/
    Mine/
    Export/
  Domain/
    Draft/
    Layer/
    AssetPack/
    Inspiration/
  Rendering/
    DraftRenderer.swift
    LayerRenderer.swift
    HitTesting.swift
    ExportRenderer.swift
  Storage/
    DraftStore.swift
    AssetStore.swift
    ImageStore.swift
  DesignSystem/
    Colors.swift
    Typography.swift
    Spacing.swift
    Components/
  Resources/
    AssetPacks/
    Fonts/
```

### 编辑器关键设计

- Draft 坐标使用逻辑画布坐标，例如 `900x1200`，不要直接存屏幕坐标。
- 屏幕坐标和画布坐标通过 `CanvasViewport` 统一转换。
- 渲染层只负责画 Draft，不持有业务状态。
- 手势层负责命中检测、变换和选中态。
- 导出渲染复用同一套 Layer 绘制逻辑，避免导出和编辑态不一致。

## 8. 页面迁移映射

| 小程序页面 | iOS 页面 | 迁移重点 |
| --- | --- | --- |
| `pages/create` 空状态 | `CreateHomeView` | 新拼贴、添加照片、从素材开始、最近草稿 |
| `pages/create` 编辑态 | `EditorView` | 画布、顶部栏、主工具栏、图层工具栏 |
| 素材抽屉 | `AssetDrawerView` | 分类、素材包、快速添加 |
| `pages/assets` | `AssetsView` / `AssetPackDetailView` | 素材纸包、散落详情、添加到画布 |
| `pages/inspiration` | `InspirationView` | 双列瀑布流、大图预览 |
| `pages/me` | `MineView` | 最近草稿、设置、清理缓存 |
| 导出逻辑 | `ExportPreviewView` | 预览、保存相册、系统分享 |

## 9. 迁移优先级

### 第 1 阶段：iOS 骨架和数据模型

- 初始化 Xcode / SwiftUI 工程。
- 建立 DesignSystem tokens。
- 建立 Draft / Layer / AssetPack Codable 模型。
- 生成或手写 `asset-packs.json`。
- 做 4 tab 空壳。

验收：iOS App 可运行，能读取素材包配置，能创建空 Draft。

### 第 2 阶段：编辑器闭环

- 画布比例和缩放布局。
- 图片导入。
- 图片 / 贴纸 / 胶带 / 文字图层渲染。
- 点击选中、拖拽、缩放、旋转。
- 复制、删除、上移、下移。
- 本地草稿保存和恢复。

验收：能完成一张基础拼贴并恢复草稿。

### 第 3 阶段：素材、背景、文字

- 素材 tab 和素材包详情。
- 从素材添加到画布。
- 背景选择。
- 文字编辑面板。
- 字体、颜色、字号。

验收：素材和文字创作体验达到小程序 P0 水平。

### 第 4 阶段：导出和体验打磨

- 高清导出。
- 保存相册。
- 系统分享。
- 导出预览。
- 错误提示和权限处理。
- 视觉细节打磨。

验收：导出图片与编辑预览一致，保存和分享稳定。

### 第 5 阶段：高级工具

- 裁切。
- 透明度、圆角、阴影、撕边。
- 对齐辅助线。
- 涂抹剪 / 主体剪。
- 压花 / 形状蒙版。

验收：形成明显区别于普通拼图 App 的手作拼贴体验。

## 10. 主要风险

- 编辑态和导出态渲染不一致：必须共用渲染核心。
- 手势复杂度上升：先做基础拖拽 / 缩放 / 旋转，再做控制点和裁切。
- 字体授权和字体名称差异：草稿保存 `fontId`，平台分别映射。
- 素材包体积过大：首版可内置少量素材，后续转 CDN 和按需下载。
- iOS 照片权限：必须处理 limited photo access。
- 草稿资源丢失：导入图片时复制进沙盒，不依赖照片库原路径。

## 11. 下一步建议

先不要急着写完整编辑器。建议下一步在 `iosproject` 初始化 SwiftUI 工程后，按这个顺序落地：

1. 建立 Draft / Layer / AssetPack Swift 模型。
2. 生成 `asset-packs.json`。
3. 做一个 `EditorView` 技术 spike：渲染一张照片、一个素材、一个文字。
4. 实现画布坐标和屏幕坐标转换。
5. 实现拖拽、缩放、旋转。
6. 实现离屏导出。

只要这 6 步跑通，iOS 版本的技术底座就稳了。
