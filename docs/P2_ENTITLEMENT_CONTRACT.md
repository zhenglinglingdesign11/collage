# P2 订阅权益契约与测试矩阵

状态：2026-09-26，权益抽象、已审核内容映射与 fake 驱动入口预览。G1 未关闭；此文档不授权真实支付、My Studio 入口、匿名身份或服务端 AIGC。

## 边界

产品层只依赖 `apps/mobile/src/entitlements/index.ts` 的 `EntitlementService`、`FeatureKey` 与 `FeatureDecision`。`editor-core`、`editor-renderer`、`asset-system` 不依赖任何订阅接口。模板 `requiredCapabilities` 只表达客户端兼容性，不表达付费许可。远程素材 `premium` 标记、远程配置、模板元数据都不能授予权益。未来的 RevenueCat、StoreKit、Supabase、CustomerInfo 只能出现在适配器内。

## Feature Catalog

| 策略 | 稳定 key | 状态规则 |
| --- | --- | --- |
| 免费本地 | `editor.core`, `export.standard`, `export.no-watermark`, `material.standard`, `image.sticker-from-photo.basic` | 六态均允许 |
| Premium 本地 | `template.premium`, `material.premium`, `font.premium`, `effect.premium`, `brush.premium` | premium/grace-period 允许；offline-cached 在有效 TTL 内允许 |
| 服务端计次 | `image.subject-cut`, `image.sticker-from-photo.remove-background`, `ai.generate` | Free、expired、Premium、grace-period 均可向 Worker 请求；Worker 按会员层级及剩余额度最终决定；unknown、离线拒绝 |
| 未发布 | `style-kit.premium`, `export.high-resolution`, `cloud-backup`, `cloud.restore`, `cloud.sync` | 所有状态永久拒绝，远程配置不可解锁 |

`image.subject-cut` 是剪刀“主体剪”的统一能力名。基础本地贴纸允许裁切、描边和基础形状；自动去背景是独立服务端能力。抠图是否以后改为端侧实现不改变此 key，但届时必须重新冻结离线策略。AIGC 首发只定义 `ai.generate`，不提前冻结玩法子类型。服务端能力的客户端允许结果含 `requiresServerAuthorization: true`，仅允许发请求，绝非最终授权。Free AI 首次赠送 3 次标准生图（每个服务端 principal 仅一次）；Free 抠图每天 3 次，以 UTC 日历日重置。`image.subject-cut` 与 `image.sticker-from-photo.remove-background` 共用抠图次数，不各领 3 次。数值写在 `FREE_USAGE_POLICY` 作为产品契约，实际余额与扣减只能由 Worker 核准。Premium AI 仍有周期额度；抠图是否消耗 AI 生图额度待产品最终确认，调研建议不消耗。

三种处理结果一旦被用户采用，必须先落为本地用户资产，再以稳定 `generated://image/...` 或 `user://...` 引用进入 Draft。临时处理 URL 不得进入 Draft。

## 状态、拒绝与离线

`premium` 和 `grace-period` 允许本地 Premium。`free` 返回 `premium-required`，`expired` 返回 `expired`。`unknown` 返回可重试的 `unknown`，不乐观解锁。`offline-cached` 只有此前已确认 Premium 的时间戳且时间未倒退、距确认严格小于 24 小时才允许本地 Premium；到期返回 `offline-expired`。服务端能力离线返回 `offline`，不可调用。Worker 返回 `free-quota-exhausted` 或 `premium-quota-exhausted` 后，协调层才能路由 Free 的 Paywall 或 Premium 的额度提示；客户端不得靠本地计数授予调用。时钟倒退也不延长缓存。实际适配器必须只从已确认的 Premium 状态建立离线缓存，不能从远程配置或本地标记合成。

## 服务与流程

`EntitlementService` 包含 `getStatus`, `canUse`, `refresh`, `observeChanges`, `purchase`, `restorePurchases`, `manageSubscription`。操作结果仅为 `success | cancelled | failed | unavailable`，无购买历史的恢复以 `success` 加 `no-purchases` 表达。fake 默认所有操作 `unavailable`，测试可显式预设结果和刷新后的状态。重复的相同状态不重复通知 observer；取消订阅后不再通知。

所有入口调用 `canUse(feature)`。拒绝时传递稳定 feature/reason 给 `PaywallCoordinator`；unknown、offline、unreleased 不展示购买页，UI 依 reason 展示重试或不可用。可展示 paywall 的拒绝仅为 `premium-required`、`expired`。购买、恢复、管理返回后各刷新一次，再判断原 feature。管理订阅成功不推断权益改变；取消是正常操作结果。

## 遥测

仅允许类型化事件 `paywall.shown`, `purchase.started/completed/cancelled/failed`, `restore.started/completed/failed`, `entitlement.refreshed/changed`，字段限 feature、状态和稳定拒绝原因。fake sink 供测试。不得记录 Draft、作品标题、素材引用、图片、prompt、交易原文、token、邮箱或完整 principal ID。生产分析 SDK 尚未接入。

## 产品决策与测试矩阵

具体商业化建议、实验顺序和待确认项见 `PRICING_PAYWALL_STRATEGY_V1.md`。定价调研建议以 Premium 模板和素材库为核心价值（其中 Style Kits 是未落地的未来包装），AI 是限额附加能力；首版一个生图入口和抠图。产品已确认 Free AI 首次 3 次、Free 抠图每天 3 次。$29.99/$39.99/$49.99 年费测试、试用、折扣、30 credits/月均属研究建议，未冻结为产品或代码常量。逐项内容审核见 `content/p2-content-entitlements.v1.json`，入口由 `productEntryAccess.ts` 将内容 ID 映射为稳定 feature，再调用 `canUse`；远程目录标记本身不授予权益。Style Kit 尚未提供，高分辨率导出尚未实现；现有无水印 PNG 继续免费。调研建议抠图不消耗 AI credits，但仍待最终确认；Premium 抠图额度与滥用保护阈值仍待 P3 成本设计。

## 当前 UI 消费范围

模板启动、素材库批量添加、编辑器素材与背景添加、字体选择、效果提交、画笔选择和标准导出已调用同一 `ProductEntryAccess`。批量添加先判整批，购买／恢复后刷新一次并重新判整批，只有全部获准才继续原操作。Free 模板既有的 Premium 固定图层随模板实例保留，用户从素材库再次添加同一素材时仍需单独判断。未审核 ID 关闭入口；未发布能力不可由 fake 解锁。模板兼容性检查仍单独执行。

开发包以 Free fake 状态展示占位 Paywall，可模拟 Premium 成功或无历史购买的恢复；取消直接关闭。正式包默认 unknown，未接真实支付或商店页面。该预览不包含真实套餐价格，也不出现在 My Studio。P3 的服务端计次入口和 Worker 授权尚未接线。`material-basic-shape-materials` 的具体收费策略仍为 undecided，因此该组入口保持关闭，待产品复核。

| 测试 | 覆盖 |
| --- | --- |
| Feature × 六态 | 免费、本地 Premium、服务端 Premium、未发布的全目录矩阵 |
| 离线 | TTL 内、边界、过期、未来时间戳；服务端一直拒绝 |
| Observer | 状态变化、重复状态、卸载 |
| 操作 | purchase 成功/取消/失败，restore 无历史，manage 返回；各只刷新一次 |
| 后续真实 adapter 合同 | 同一行为矩阵须复用；需补乱序 SDK 回调、身份切换、服务端复核集成测试 |

验证：`npm run test:entitlements --workspace mobile` 与 `npm run typecheck --workspace mobile`。G2 保持待复核：真实 adapter 尚不存在，未执行真机 UI 验收。
