# JournalCollage 跨端 Editor 架构规划

> 状态：A3（资源与导出本地闭环）进行中。需完成架构 Spike 验证后才能成为正式实施决策。  
> 更新时间：2026-09-10

## 1. 决策背景

JournalCollage 的长期核心不是若干普通页面，而是一个持续演进的拼贴 Editor。产品未来的主要差异化能力包括：

- 照片快速成为可编辑拼贴起点；
- 纸张、胶带、撕边、压花、纹理、图像笔刷等手作效果；
- 文字从普通文本逐渐发展为具有材质的视觉对象；
- 用户照片分割、多对象素材、私人素材库；
- AI 生成材料，而不是 AI 直接替用户完成作品；
- 作品留存、过程回放、动态素材及视频导出。

当前 Swift/iOS 工程可以作为产品行为和部分算法的参考，但不能单独决定长期架构：现有 UI、交互和功能完成度距离预期仍有明显差距，且 Android 预计在 iOS 上线后较快跟进。

## 2. 推荐路线

建议先执行一个独立的 **Expo + React Native + React Native Skia 架构 Spike**。Spike 通过后，采用以下路线重建产品：

```text
Expo + React Native Development Build
+ TypeScript Editor Core
+ React Native Skia 跨端 Renderer
+ Reanimated / Gesture Handler 交互层
+ 按需 Expo Native Modules
```

这不是承诺所有能力都由 JavaScript 实现。目标是让作品数据、编辑命令、绝大多数渲染规则和效果定义在 iOS / Android 共用；仅将平台专有能力做成边界清晰的原生模块。

在 Spike 未通过前，不开始全量迁移，也不继续在现有 SwiftUI 产品层上扩建高级功能。当前 Swift 项目保留为交互、效果和产品流程的参考实现。

## 3. 方案判断

| 方案 | iOS V1 | Android 跟进 | 高级 Editor | 长期维护 | 判断 |
| --- | --- | --- | --- | --- | --- |
| Swift / SwiftUI | 较快 | 需重新开发 | 强 | 每个复杂效果需要双端实现 | 不作为长期主路线 |
| 直接 React Native | 中等 | 较快 | 取决于 Renderer 设计 | 基础设施需自行整合 | 可行但不优先 |
| Expo + RN + Skia | 中等 | 较快 | 需 Spike 验证 | 共享范围最大 | 推荐验证 |
| RN 产品层 + 两套原生 Editor | 较慢 | 中等 | 最强 | JS、Swift、Kotlin 三栈 | 仅作为兜底 |

如果 Android 的计划推迟到 iOS 上线后 18 个月以上，Swift-only 的短期收益会变大；但当前已知节奏是“iOS 后较快跟进 Android”，因此更应优先验证跨端 Editor。

## 4. 总体结构

```text
App Shell
├── Product Layer
│   ├── 创作入口、素材、灵感、我的
│   ├── 登录、订阅、设置
│   └── 作品管理、分享和留存
│
├── Editor UI
│   ├── 顶部工具栏与底部工具面板
│   ├── 选中框、控制点和属性面板
│   └── Phone / Tablet 响应式布局
│
├── Editor Core
│   ├── Draft / Layer 文档模型
│   ├── Command、Undo / Redo
│   ├── Selection、Geometry、Hit Testing
│   ├── 对齐、分组和层级
│   └── Schema Migration 与 Validation
│
├── Renderer
│   ├── Scene Builder
│   ├── Layer Renderer
│   ├── Effect Renderer
│   ├── Brush / Path Renderer
│   └── Preview / Export / Thumbnail Surface
│
├── Asset System
│   ├── Cloudflare 素材配置与缓存
│   ├── 用户照片与派生资源
│   ├── 字体和预览资源
│   └── AI 结果缓存
│
└── Native Adapters
    ├── 相册、文件、保存与分享
    ├── Live Photo
    ├── 本地 AI / 图像处理
    └── 视频编码与导出
```

## 5. 工程边界

建议采用 monorepo，以避免 Editor 被页面代码和 Expo API 污染：

```text
apps/
  mobile/                       # Expo App、页面、导航和产品 UI
  mobile/modules/               # 本地 Expo Native Modules

packages/
  editor-core/                  # 不依赖 React / Skia / Expo
  editor-renderer/              # Skia Scene、Layer、Effect、导出
  asset-system/                 # catalog、下载、缓存、字体
  shared-contracts/             # API、分析、feature flag
```

### 5.0 A0 的实际交付边界

A0 只建立可运行工程与长期契约，不实现真正的 Editor 界面或效果。当前代码应包含：

- `apps/mobile`：Expo Development Build 的 App Shell；
- `packages/editor-core`：Draft、Asset、Effect、Geometry、Command、Validation、Migration；
- `packages/editor-renderer`：不绑定 Skia 的 Renderer 输入/目标契约；
- workspace 配置：App 通过包名消费 Core，而不是复制或直接引用平台代码。

A0 不应包含：编辑器工具栏、素材入口、真实画布、相册导入、Cloudflare 下载、草稿数据库或任何“为了看起来像产品”的临时逻辑。这些分别进入后续 A1–A3。

### 5.1 长期架构边界

需要明确区分“跨端核心资产”和“可替换的 Renderer 实现”。

优先保持长期稳定、跨端共享的资产：

```text
Draft Contract
Command Contract
Effect Definition
Asset Contract
Geometry / Transform Rules
Migration / Validation
```

允许随着性能需求、平台能力或产品阶段而替换的实现：

```text
Skia Renderer
Native Renderer
Image Processing
Video Export
平台特有 Native Module
```

换言之，跨端核心负责定义“作品是什么、编辑发生了什么、效果表达什么”；可替换实现负责决定“如何在某个平台画出来、处理出来或导出来”。

`Effect Definition` 只保存产品语义与稳定参数，例如 `tornEdge { seed, intensity }`，不能保存 Skia Shader、Picture 或某个平台滤镜对象。`Image Processing` 可以在未来由云端、Skia 或原生实现替换，但其输入输出必须通过 `Asset Contract` 表达；Draft 不能引用平台临时文件路径或某种具体图像处理实现。

当前阶段明确避免：

- 提前实现完整视频编辑、端侧 AI 等尚未验证的未来能力；
- 为未来 Android 提前维护两套完整原生 Editor；
- 将 Renderer 缓存、Skia 序列化结果或平台对象写入 Draft。

### 5.2 Editor Core

`editor-core` 只能接受普通数据并返回普通数据：

```text
Draft + Command → New Draft
Draft + Point → Hit Test Result
Draft + Selection → Alignment Result
Draft vN → Migration → Draft vN+1
```

它不能依赖 React state、Skia 对象、Expo API、平台文件路径或 UI 生命周期。

### 5.3 Renderer

Renderer 读取 Draft 并生成画面，不能直接修改 Draft。预览、导出、缩略图必须复用同一份 Layer / Effect 渲染定义，只允许尺寸、采样质量和缓存策略不同：

```text
Draft
→ Scene Builder
→ Layer / Effect Renderer
  ├── Preview Surface
  ├── Export Surface
  └── Thumbnail Surface
```

### 5.4 Editor UI

工具栏和 Sheet 只负责发起 Command。选中框、控制点、参考线等属于 UI Overlay，不写入 Draft，也不参与导出。

## 6. Draft 与 Layer 契约

Draft 是最重要的长期资产，必须是平台无关 JSON：

```text
Draft
├── schemaVersion
├── id
├── canvas
│   ├── width / height / ratio
│   ├── background
│   └── backgroundEffects
├── layers[]
├── assetReferences[]
├── metadata
│   ├── createdAt / updatedAt
│   ├── date / location / weather / tags
│   └── provenance
└── exportSettings
```

Layer 应明确区分通用属性、内容和遮罩：

```text
Layer
├── common
│   ├── id / kind / zIndex
│   ├── transform
│   ├── opacity / blendMode
│   └── locked / hidden
├── content
│   └── image / paper / sticker / text / brush / shape
├── effects[]
└── mask
    ├── crop
    ├── shape mask
    ├── alpha mask
    └── clip path
```

不要以无限增长的 `style: Record<string, any>` 承载正式产品能力。允许 `extensions` 保留兼容字段，但正式 Effect 必须有稳定类型、版本和参数。

```text
Effect
├── id
├── type
├── version
├── enabled
└── params
```

初期建议支持：`shadow`、`outline`、`tornEdge`、`attachedTape`、`floatingPaper`、`emboss`、`textureOverlay`、`imageStyle`。

## 7. 编辑命令与手势

所有持久化编辑操作必须通过 Command：

```text
AddLayer
DeleteLayer
DuplicateLayer
UpdateTransform
SetCrop
ApplyEffect
RemoveEffect
MoveLayer
SetTextContent
AddBrushStroke
ReplaceSource
GroupLayers
UngroupLayers
```

手势期间不应更新完整 Draft 或产生大量历史记录：

```text
手势开始 → 保存初始 Transform
手势移动 → Reanimated Shared Value 更新临时视觉状态
手势结束 → 提交一次 UpdateTransform Command → 写入历史和草稿
```

笔刷保存语义笔画而非立刻烘焙成位图：

```text
BrushStroke
├── brushId
├── points
├── size / spacing / jitter
├── seed
└── color / material
```

复杂笔刷、花边和缝线需要缓存 Path、Picture 或纹理 Atlas，避免每帧重新构建大量 React 子组件。

## 8. 资源系统

Draft 只保存稳定资源 ID，而不是临时 URL 或设备绝对路径：

```text
asset://pack/papers/012
user://image/uuid
generated://material/uuid
remote://asset/version
```

`AssetResolver` 负责将资源 ID 映射为本地缓存或 Cloudflare 下载结果。

每张用户照片至少区分：

```text
thumbnail  # 草稿列表和素材列表
preview    # 画布编辑
original   # 高清导出、重新裁切、AI 处理
```

字体记录稳定 `fontId` 与 `fontVariantId`，不记录 iOS 或 Android 平台字体名。

## 9. Native Module 边界

Native Module 只提供设备能力，不持有 Editor 业务状态。建议初期通过本地 Expo Module 提供：

| 能力 | V1 方案 | 后续演进 |
| --- | --- | --- |
| 主体抠图 | 云端服务优先 | 本地模型加速 |
| 多对象分割 | 云端任务 | 设备能力分层 |
| Live Photo | iOS Module | Android 映射为 motion photo / 视频 |
| 视频导出 | V1 静态图 | 验证留存后独立原生合成器 |
| 保存与分享 | Expo API + 小模块 | 统一跨端接口 |
| AI 材料生成 | 云端异步任务 | 缓存和资产化 |

不要在 V1 预先开发完整原生视频编辑器、端侧大模型或跨端像素级原生滤镜 SDK。

## 10. Phone 与 Tablet

Canvas 使用逻辑坐标，Viewport 才与屏幕尺寸相关。作品坐标不能随手机、平板或导出尺寸改变。

```text
Phone:    全屏画布 + 底部工具栏 + Bottom Sheet
Tablet:  左侧素材/图层 + 中央画布 + 右侧属性或效果面板
```

## 11. Expo 工程策略

使用 Expo development build，不依赖 Expo Go。

原生工程必须二选一管理：

1. 使用 Continuous Native Generation：所有原生配置进入 config plugin，本地能力写为 Expo Module，不长期手改生成的 `ios/` 与 `android/`；
2. 提交并手动维护原生工程：允许直接修改，但避免频繁使用 clean prebuild 覆盖变更。

前期建议采用第一种，只有当原生能力显著膨胀时再评估转为手动维护原生工程。

## 12. 架构 Spike

在完整迁移前，先在独立目录或独立仓库完成 Spike。范围严格控制为：

- 图片、文字、素材图层；
- 点选、拖拽、缩放、旋转；
- 层级、复制、删除；
- 裁切、阴影、描边；
- 一个真实撕边效果；
- 一个纹理笔刷；
- Undo / Redo；
- 1800 × 2400 静态图导出；
- 草稿关闭后恢复。

必须在以下设备验证：

- 一台较新的 iPhone；
- 一台普通 Android Phone；
- 一台 Android Tablet。

### 12.1 通过条件

- 30 层真实素材仍可连续交互；
- 高频手势不依赖 React 全量重渲染；
- 预览与导出没有明显视觉差异；
- 字体、裁切、透明度在两端基本一致；
- Draft 可跨 iOS / Android 打开；
- 一个新 Effect 可在短时间内同时覆盖两端。

### 12.2 失败后的决策

若 Spike 失败，应先确认问题来自资源管理、状态更新还是 Skia 实现。只有证实共享 Renderer 无法满足性能或视觉要求，才进入 Hybrid 评估。

Hybrid 的正确形式是仅原生化明确瓶颈，例如视频导出、本地分割或特定图像处理；不要立即维护完整 Swift Editor 与完整 Kotlin Editor 两套实现。

## 13. 实施顺序

### A0：工程与契约底座

- Expo Development Build、npm workspace 和最小 App Shell；
- Draft / Asset / Effect / Command / Geometry / Validation / Migration 契约；
- Renderer 的输入、目标和替换边界；
- 无真实 Editor UI、无业务页面、无平台路径写入 Draft。

### A1：可交互画布骨架

- Skia 场景与 Image / Text / Material 图层；
- 选择、命中、拖拽、缩放、旋转；
- Command 历史与 Undo / Redo；
- iPhone、Android Phone、Android Tablet 的真实设备初测。

### A2：Spike 的高风险能力

- 裁切、阴影、描边；
- 一个真实撕边、一个纹理笔刷；
- 30 层压力场景；
- 1800 × 2400 导出与预览一致性。

### A3：数据和资源闭环

- 本地草稿恢复；
- 相册导入与 Asset Resolver；
- Cloudflare 素材缓存；
- 以同一 Draft 完成跨设备恢复验证。

### A4：Spike 决策门

验证跨端绘制、交互、导出和 Android 真机表现；通过后才进入可上线闭环，失败时按 12.2 的规则定位并决定是否仅下沉单个瓶颈。

### Phase 1：可上线闭环

- 照片 → 拼贴；
- 素材、背景、文字、胶带；
- 本地草稿；
- 导出和分享；
- Cloudflare 素材缓存；
- 基础手作效果。

### Phase 2：差异化 Editor

- 撕边、压花、图像笔刷；
- 主体抠图与个人素材库；
- “贴住”“浮起”等组合式效果；
- 字体、文字样式与材质文字。

### Phase 3：记忆与动态能力

- 动态素材和视频导出；
- 拼贴过程回放；
- 日期、地点、天气和月度回顾；
- 账号、同步、订阅和高级素材。

动态能力当前不实现完整时间轴，但 Renderer API 应从一开始预留 `time` 参数，静态作品固定为 `time = 0`。

## 14. 成本与节奏判断

以个人/小团队 + Codex 开发模式粗略估计：

| 工作范围 | Swift 继续 | Expo + RN + Skia |
| --- | --- | --- |
| iPhone V1 | 约 8–14 人周 | 约 10–16 人周 |
| Android Phone | 再增加 8–14+ 人周 | 再增加约 2–5 人周 |
| Tablet | 两端分别适配 | 大部分布局和 Core 共用 |
| 后续复杂效果 | 双端分别实现 | 主要共享实现 |

跨端路线可能让 iOS 首发增加约 2–4 人周，但在“iOS 后较快跟进 Android”的前提下，能减少总成本和后续效果迭代成本。

## 15. 最终原则

> 跨端共享的核心不是页面，而是作品文档、编辑命令、效果定义和渲染规则。

只要这四部分保持独立、可迁移、可测试，未来即使某个高性能能力必须下沉原生，也不会导致整个产品再次重构。
