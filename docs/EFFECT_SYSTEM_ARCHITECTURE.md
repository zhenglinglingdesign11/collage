# 图层效果系统底层方案

> 状态：架构决策草案，尚未切换现有 Draft schema。
>
> 关联：`UI_ALIGNMENT_SYSTEM.md`、`PRODUCT_PARITY_SPEC.md`、`CROSS_PLATFORM_EDITOR_ARCHITECTURE.md`。
> 目标：让创作页的“效果”既能覆盖当前的撕边、贴住、浮起、蕾丝框和印刷质感，也能自然演进到动态材质、真实材料与 AIGC 材料，而不把 Skia、平台滤镜、URL 或异步任务状态写进作品。

## 1. 结论与边界

效果不是一个 UI Sheet，也不是一组 Renderer 特例；它是附着于 Layer 或 Canvas 的、**有序、可版本化、可验证的效果图（effect graph）**。Draft 只保存产品语义和稳定资源引用，Renderer 把该语义编译为 Skia / 原生 / 服务端的具体绘制操作。

```text
Effect catalog + capability registry        Asset resolver / generated asset registry
                 │                                         │
Draft.effectGraph ── Core validation / commands / migration ─┘
                 │
     Scene builder: mask → geometry → content → material → composite → post
                 │
 preview (interactive) / thumbnail / export (deterministic poster or time t)
```

这带来五条不可破坏的规则：

1. 同一 Draft、同一资源 revision、同一 `time` 与导出设置，必须得到可复现的画面；随机性只能来自持久化 `seed`。
2. UI 的预览滑杆、网络生成进度、Skia Picture、shader、缓存路径和纹理 atlas 都是运行时状态，不能进入 Draft。
3. Effect instance 的身份与效果类型分离。一个图层可以有多个阴影或多个纹理覆盖，因此不能继续用 `id: 'shadow'` 同时表示二者。
4. 效果始终尊重图层的可见区域：裁切、剪刀、压花 mask 后才是该图层的有效 alpha；不能让阴影、材质或后处理重新露出被裁掉的像素。
5. AIGC 是产生或派生稳定资源的异步能力，不是 Renderer 在渲染 Draft 时发起的副作用。

## 2. 当前基线与缺口

现有 `editor-core` 的 `Effect` 联合类型已经正确地保存了撕边、阴影、描边的语义参数；`editor-renderer` 也在预览和导出 Scene 中复用它们。这是可用的 Spike 基线。

但它还不能作为长期效果底座：

| 现状 | 后果 | 目标方案 |
| --- | --- | --- |
| `id` 兼作类型，且没有 instance id / version / enabled | 无法同类叠加、局部禁用与独立迁移 | `instanceId + type + version + enabled` |
| 扁平联合类型 | 每新增一个效果都改 Core、Renderer、UI 的穷举分支 | 参数为 JSON 值，使用 catalog schema 校验；关键效果保留 TypeScript helpers |
| Renderer 直接按固定顺序取 `shadow/torn-edge/outline` | 无法表达“先撕边再描边”“纹理在纸面下、压印在纸面上” | 显式 `stage` 与数组顺序，Scene 编译执行计划 |
| 没有资产输入与动画契约 | 真实纹理和动态素材会泄露 URL、平台对象或临时状态 | 稳定 `AssetReference`、`seed`、可选动画轨道 |
| 异步结果无生命周期模型 | AIGC 容易把 task URL、pending 状态或不可复现结果写入草稿 | Job 在 Draft 外；成功后产出 `generated://…@revision`，再以 Command 应用 |

## 3. Draft v4 目标契约

本轮只冻结设计，不修改现有 schema。实施时通过迁移把当前 `effects[]` 转成下列 `EffectInstance[]`，并将 `DRAFT_SCHEMA_VERSION` 升为 4。

```ts
type EffectStage =
  | 'geometry'       // 改变边界或 alpha，例如 torn-edge、lace-frame
  | 'underlay'       // 有效 alpha 下方，例如 attached-tape、shadow
  | 'content'        // 内容颜色/纹理/印刷
  | 'overlay'        // 有效 alpha 上方，例如 grain、foil、emboss highlight
  | 'post-composite';// 图层合成后的局部后处理

type EffectInstance = Readonly<{
  instanceId: string;                 // UUID，实例身份
  type: string;                       // 例如 "paper.torn-edge"
  version: number;                    // 该 type 的参数语义版本
  enabled: boolean;
  stage: EffectStage;                 // catalog 默认值可省略，保存时应显式化
  params: Readonly<Record<string, EffectValue>>;
  inputs?: Readonly<Record<string, AssetReference>>;
  animation?: Readonly<Record<string, EffectTrack>>;
}>;

type EffectValue = string | number | boolean | null
  | readonly EffectValue[] | Readonly<Record<string, EffectValue>>;

type EffectTrack = Readonly<{
  interpolation: 'step' | 'linear' | 'cubic-bezier';
  keyframes: readonly { timeMs: number; value: EffectValue; easing?: [number, number, number, number] }[];
}>;
```

`params` 只可使用有限 JSON 值。颜色、长度、角度、混合模式、枚举值和对象结构由 catalog 的 schema 限制；Core 不能接受任意嵌套/无界数组。`inputs` 只允许稳定 `AssetReference`（包括 `generated://`），禁止 URI、base64、prompt 原文与任意文件路径。

动画轨道属于效果实例的可动画参数，时间以作品时间线毫秒计。静态作品的 canonical poster 为 `timeMs = 0`；视频/动态导出必须传入明确的帧时间，不能依赖设备时钟。没有 `animation` 的参数在任何时间均为同一值。

## 4. Catalog、能力和效果分类

效果定义不随每份 Draft 复制，而由随应用发布、可按 revision 更新的 `EffectDefinition` catalog 提供：显示名 key、适用 layer 类型、默认参数、参数 schema、默认 stage、资源槽位、动画能力、成本等级、降级策略和 renderer recipe。产品 UI 从 catalog 读取控件类型，而不是依据 `type` 名称散落判断。

首批产品语义按以下族群组织，避免未来把“贴纸式结构”与“照片滤镜”混为一谈：

| 族群 | 代表 type | 主要 stage | 输入与说明 |
| --- | --- | --- | --- |
| 结构 / 边缘 | `paper.torn-edge`、`frame.lace`、`paper.round-corners` | geometry | 有效 alpha 与可见 bounds 的来源 |
| 空间 / 附着 | `light.shadow`、`attachment.tape`、`paper.float` | underlay / overlay | 必须使用经 mask 后 alpha；胶带可引用素材资产 |
| 表面材料 | `material.texture-overlay`、`material.paper-fibre`、`material.foil` | content / overlay | 可用纹理 asset、tile、scale、blend、seed |
| 印刷与艺术风格 | `print.cyanotype`、`print.screen`、`print.catalogue`、`art.pixel-embroidery`、`art.matisse` | content / post-composite | 应优先保存可解释参数与引用材料，而非一张烘焙图 |
| 浮雕 / 形状 | `relief.emboss` | geometry + overlay | 与正式 `VisibilityMask` 配合，不拥有第二套 mask 状态 |
| 动态 | `motion.shimmer`、`motion.paper-flutter` | overlay / transform adapter | 仅支持 catalog 明确允许的参数和确定性的 `timeMs` |

`EffectDefinition` 可以指明“需要离屏 alpha”“需要纹理采样”“可在低质量预览近似”等 capability，不能携带 Skia 节点或平台对象。Renderer 的 capability registry 决定当前目标是否可高保真执行；不支持时采用 catalog 指定的静态近似或明确的 `unsupported` 诊断，绝不悄悄改变 Draft 语义。

## 5. 统一渲染管线

每个 Layer 的编译顺序固定如下，数组内同 stage 保持 Draft 顺序：

```text
source asset / procedural content
  → crop + legacy migration normalized visibility mask
  → geometry effects (produce content alpha A and optional contour C)
  → underlay effects using A/C
  → content effects clipped by A
  → overlay effects clipped by A or C as definition declares
  → layer opacity + blend mode → canvas composite
  → explicitly allowed post-composite effects
```

`geometry` 效果产出的是 renderer 内部的 alpha/contour，不写回 Draft path；剪刀和压花仍只通过 `VisibilityMask` 保存。多个 geometry effect 必须定义组合方式（通常 intersect；外扩框类可声明 union/outer-contour），由 catalog 检查非法组合。这样撕边、描边、阴影和纹理在预览、缩略图、导出都看到同一个最终可见边界。

Renderer 为每个请求建立无状态的 `EffectEvaluationContext`：`target`、逻辑 canvas 尺寸、输出尺寸、`timeMs`、quality、解析后的 asset handles、资源 revision 与 capability registry。缓存键至少包含 Draft/layer revision、有效 effect graph、输入 asset revision、输出 scale、quality 和时间 bucket；缓存永不序列化进 Draft。手势期间使用低成本 preview，手势结束和导出重新高质量求值。

## 6. 真实材质方案

“真实材质”分为两种，不应都烘焙成图片：

- **材料内容**：纸张、胶带、相框、贴纸本身是 `MaterialLayer` / `asset://` 内容，保留原始素材、crop 与 transform。
- **材料处理**：纸纤维、颗粒、压印、高光、褪色、转印是 Effect，保存其 recipe、强度、比例、混合方式、seed 和可选 texture asset 引用。

材质资产要求提供稳定 id、revision、色彩空间/alpha 信息、平铺方式与预览/原图分级。高分辨率纹理通过 resolver 在导出阶段按需取得；预览仅持有降采样版本。程序材质必须以 seed、频率和调色板复现，不能把设备噪声函数结果持久化。

首批不追求物理渲染。采用统一 alpha、normal-like relief、blend 和色彩调制即可；当需要真正的光照、位移或高代价滤镜时，定义为可选 renderer capability，并预先提供静态近似路径。

## 7. AIGC 效果与派生资源

AIGC 要分成“生成资产”和“应用效果”两步：

```text
用户配置 recipe / 选择参考资源
 → app/native adapter 创建 GenerationJob（Draft 外，允许重试/取消）
 → 服务返回不可变 generated://material/<uuid>@<revision>
 → Asset system 校验、缓存、生成 thumbnail/preview/original
 → Command 将该 AssetReference 写入新 Layer 或 EffectInstance.inputs
 → Renderer 按普通资产路径渲染
```

`GenerationJob` 包含 provider、请求、进度、失败原因、内容安全/授权状态和临时 URL；它属于应用数据库，不属于 Draft，也不进入同步作品 JSON。成功后的 Draft 只保留结果 resource id/revision 和必要的、用户同意保存的 provenance 摘要。若资源被清理、权限失效或跨设备未下载，AssetResolver 返回可识别占位和 `asset-missing` 诊断，作品结构仍可恢复和编辑。

对“AI 风格化图片”优先保存为派生的 `generated://image/...` 资源并用 `imageStyle` Effect 记录强度、混合和来源关系；不要只替换原图。这样用户可以禁用/删除效果、恢复原图，且可在未来替换模型实现。服务端模型版本并非 Renderer recipe；如果同一 prompt 在新模型下会不同，必须把结果资产固定下来。

## 8. Command、历史和迁移

建议在 v4 采用细粒度命令：`layer.effect.add`、`layer.effect.patch`、`layer.effect.move`、`layer.effect.remove`、`layer.effect.enabled.set`。`layer.effects.set` 仅在迁移或“替换整套预设”时使用。连续滑杆在交互会话内只更新临时 preview，确认/防抖后合并为一条 `patch` 历史；取消不写 Draft。

预设是可复制的效果实例模板，不是对某一 layer 的隐式引用。应用预设时生成新的 `instanceId`、固化默认 version/params，再用 Command 进入历史。删除效果不会删除其输入资产；资源回收由 Asset System 在草稿引用分析后单独处理。

迁移要求：

1. v3 `shadow`、`outline`、`torn-edge` 映射到对应 v4 catalog type 和参数，生成确定性的 instance id；旧 Draft 的视觉输出作为迁移 golden。
2. 未认识的 future type/version 必须保留原始 JSON 且标记不可编辑；支持它的 renderer 可继续画，不支持则给出非破坏性占位。禁止迁移时静默丢失效果。
3. `validateDraft` 限制 effect 数量、参数深度、数值范围、资源 kind、轨道 keyframe 数和单调时间，防止损坏 JSON 导致内存/渲染攻击。

## 9. 分阶段实施

| 阶段 | 交付 | 不做什么 |
| --- | --- | --- |
| E0：契约 Spike | v4 types、catalog schema、validator、v3→v4 migration、命令与 Core 测试 | 不改 UI，不接 AIGC |
| E1：效果图渲染 | stage compiler、alpha/contour 中间结果、shadow/outline/torn-edge 迁移、预览/导出 golden | 不实现全部质感效果 |
| E2：图层效果 UI | 效果 Sheet 从 catalog 生成；结构/质感分组、预设、暂存预览、撤销 | 不把滑杆 move 写入历史 |
| E3：材质能力 | texture resolver 分级、paper fibre / screen / cyanotype、缓存和 30 层压力测试 | 不上重型物理滤镜 |
| E4：动态与 AIGC | `timeMs` 帧求值、poster/video 一致性、GenerationJob→generated asset 流程 | 不把云端任务塞进 Renderer 或 Draft |

E0/E1 是下一轮图层编辑真正应先落地的底座。产品 UI 仍按 `PRODUCT_PARITY_SPEC.md` 的“结构”和“质感”分组呈现，但 UI 分组只是 catalog metadata，不决定存储与渲染顺序。

## 10. 验收门禁

- 对每种 effect，固定 Draft、asset revision、time 和导出尺寸，比较 preview / thumbnail / 1800×2400 export 的像素容差 golden。
- 覆盖 effect 与 crop、visibility mask、连续剪刀、压花、图层 opacity / blend / reorder 的组合；被剪掉的区域不得被任何 underlay 或 overlay 重新显示。
- 验证 v3 草稿迁移前后视觉回归、撤销/重做、禁用/启用、重复同类 effect、未知 future effect 的保留。
- 30 层真实素材中，交互预览不得触发 React 全量重渲染；缓存命中/失效、纹理缺失、低内存降级、Android renderer capability 都要有可观测诊断。
- 动态效果以 `t=0` poster、多个固定帧和视频导出验证；AIGC 离线、任务失败、取消、资源缺失、跨设备恢复均不得损坏 Draft。

## 11. 本轮明确不做的事

- 不在现有 UI 中提前堆叠“蓝晒、丝网、马蒂斯”等假入口。
- 不把效果做成一次性位图烘焙后替换原图，除非它被明确产出为可追溯的 `generated://` 派生资产。
- 不让每个新效果自行选择预览/导出路径；所有效果必须接入同一 Scene 编译和验收链。
- 不把完整视频时间轴、端侧扩散模型或任意第三方滤镜 SDK 作为当前图层编辑的前置条件。
