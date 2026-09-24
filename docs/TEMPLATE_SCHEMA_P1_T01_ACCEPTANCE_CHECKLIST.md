# P1-T01：Template Schema 差距与验收清单

状态：`completed-for-P1-T01`（10 个 Recipe 编译产物已通过 Schema/首发 profile 边界；发布前 Release 构建复核属于 P1-T10）
日期：2026-09-23
上位契约：[TEMPLATE_CONTRACT_P1_T00.md](TEMPLATE_CONTRACT_P1_T00.md)  
实施计划：[ACCOUNT_SUBSCRIPTION_CLOUD_IMPLEMENTATION_PLAN.md](ACCOUNT_SUBSCRIPTION_CLOUD_IMPLEMENTATION_PLAN.md)

## 1. 目标与范围

本清单冻结 P1-T01 的最小实现范围：把构建期 Recipe 编译产物校验为可实例化的 `TemplateDefinition`。它不实现 Recipe 编译、Draft 实例化、创作页、照片选择器、装饰替换或远端模板下发。

`1.0` 的验收集合固定为 10 个模板：

- `romantic-deco`、`romantic-deco-two-photo`、`play-pop`、`soft-archive`；
- `soft-archive-multi`、`play-pop-multi`、`fan-moodboard`、`digital-y2k-ascii`、`digital-y2k-multi`、`material-remix`。

首发只支持照片槽替换：`romantic-deco-two-photo` 有两个独立照片槽；`play-pop-multi` 与 `soft-archive-multi` 各四个（左侧照片卡加三连相框）；`digital-y2k-multi` 有六个独立照片槽；其余六个模板各一个。所有装饰均是固定图层；`materialSlots` 和 `textSlots` 在首发定义中必须为空。

## 2. 当前基线与差距

| 项目 | 现有基线 | P1-T01 必须补齐 |
| --- | --- | --- |
| 类型与版本 | `packages/editor-core/src/template.ts` 已有 v1 `TemplateDefinition`、canvas、slots、fixed layers、依赖和 capability 类型。 | 保持 v1；不为未验证玩法新增字段。 |
| 固定图层和依赖闭包 | 已校验稳定 reference、revision、重复依赖和 direct reference 闭包。 | 所有首发固定素材、背景和预览必须位于 strict shipped Catalog；Recipe 的构建期本地路径不能进入定义。 |
| 首发替换范围 | 已支持 photo/text/material 三种槽位类型。 | 10 个首发定义必须只有 photo slots；`textSlots: []`、`materialSlots: []`，且 capability 不得含 `text.replace` 或 `material.replace`。 |
| 状态与 capability | capability 名称有白名单，但 status 还没有运行时枚举校验。 | 只接受已知 status 与唯一 capability；根据实际 slots 和 effects 推导所需 capability，拒绝未知或冗余的首发替换能力。 |
| 产品素材边界 | material slot 与 fixed image/material layer 已拒绝部分 `user://` 输入。 | preview、canvas background、font reference、fixed layer、effect input 和 dependency 一律拒绝 `user://`、`generated://`、路径、HTTP(S)、`data:` 与运行时 URI。 |
| 未知字段 | 当前 validator 接收已类型化对象，没有解析未受信 JSON 的入口。 | 新增 raw JSON 解析/校验入口；根对象及所有 Template 专属嵌套对象严格拒绝未知字段。固定 `Layer` 使用既有 Draft 迁移/校验边界；首发不开放自由 `extensions`。 |
| Recipe 边界 | `content/template-recipe-input.v1.json` 为构建期输入。 | Schema 不读取 Recipe、源素材路径、预览路径、CDN URL、metadata query 或可执行配置。 |

## 3. 最小实现清单

- [x] 定义 `parseTemplateDefinition(raw)`，输入为 `unknown`，成功时返回已验证 `TemplateDefinition`，失败时返回带稳定 path 的 issues。
- [x] 在根对象拒绝未知字段：`schemaVersion`、`id`、`revision`、`status`、`name`、`canvas`、`preview`、`photoSlots`、`textSlots`、`materialSlots`、`fixedLayers`、`dependencies`、`requiredCapabilities` 以外均拒绝。
- [x] 对 `canvas`、asset reference、dependency、photo/text/material slot 及其 `transform`、`crop`、`effects` 专属对象拒绝未知字段与错误 primitive 类型。
- [x] 只接受已知 `TemplateStatus`；拒绝空或重复 slot ID、重复依赖、缺 revision、未来 schemaVersion、未知 capability 和未闭合依赖。
- [x] 为首发 profile 增加约束：不允许 text/material slots；不允许 `text.replace`、`material.replace`；冻结目录中的照片槽数固定为：`romantic-deco-two-photo` 2、`play-pop-multi`/`soft-archive-multi` 各 4、`digital-y2k-multi` 6，其余六个各 1，且全部 required。
- [x] 首发 profile 只允许当前 Renderer 已支持的锁定 fixed image layer；未知 effect、text/material/brush 固定层确定拒绝，不能静默删层或降级构图。
- [x] 保持 `TemplateDefinition → Draft` 单向边界：解析结果不得包含 Recipe、CDN URL、bundle path、hash、ETag、缓存键、URI、平台对象或可执行脚本。
- [x] 定义仅供导入的 `template-draft.json` 辅助信息：生产字段与 `TemplateDefinition` 相同，`_draft` 审核信息经 `parseTemplateDraftDefinition` 验证后剥离；生产 parser 严格拒绝该字段。

## 4. 自动化验收矩阵

| 用例 | 期望 |
| --- | --- |
| 10 个首发 Recipe 编译后的模板 fixture | 都能通过 raw parser 与 `validateTemplateDefinition`。 |
| `romantic-deco-two-photo` | 恰有两个照片槽；其他 9 个 fixture 恰有一个；所有照片槽具备合法 crop 与有限 transform。 |
| 首发固定层与 preview | 每个 stable reference 含正整数 revision，并可在 strict shipped Catalog 找到；依赖闭包无缺项或多余项。 |
| 未知根字段、未知 slot 字段、未知 dependency 字段 | 返回确定 issue，不部分接受。 |
| `user://`、`generated://`、`file://`、HTTP(S)、`data:`、缓存路径、runtime URI | 在任一模板位置出现时均拒绝。 |
| 未知/重复 capability，首发的 `text.replace` 或 `material.replace` | 确定拒绝。 |
| 未知 status、未来 schemaVersion、重复 slot/dependency、缺 revision | 确定拒绝。 |
| 不支持 layer/effect/mask | 确定拒绝；不修改或静默降级定义。 |

## 5. 完成标准

P1-T01 仅在以下条件均满足时完成：

1. raw JSON 解析入口与 strict unknown-field 策略已实现并有自动化覆盖；
2. 10 个首发模板 fixture 通过 Schema 校验，且每个固定依赖都已是 strict shipped reference；
3. 失败结果包含稳定、可定位的 issue path，调用方不会得到部分有效定义；
4. Draft、Catalog 与 Resolver 的现有稳定 reference/URI 边界没有回退；
5. P1-T02 才可用此 parser 校验 Recipe 编译产物，并继续视觉校准。

完整字段说明、AI draft import 边界与入口见 [TEMPLATE_SCHEMA_P1_T01.md](TEMPLATE_SCHEMA_P1_T01.md)。
