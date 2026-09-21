# JournalCollage 账号、订阅与云端作品路线

> 状态：后续实施基线
> 更新日期：2026-09-19
> 适用范围：Expo + React Native iOS 首发、后续 Android，以及与 RevenueCat、Supabase、Cloudflare R2 相关的产品与服务端实现。
> 执行计划：`ACCOUNT_SUBSCRIPTION_CLOUD_IMPLEMENTATION_PLAN.md`
> 关联文档：`PRODUCT_PARITY_SPEC.md`、`CROSS_PLATFORM_EDITOR_ARCHITECTURE.md`。

## 1. 已冻结的发布决策

JournalCollage 采用本地优先路线：

1. `1.0` 无需用户可见的产品登录即可完成全部本地创作，作品可编辑源文件保存在当前设备。
2. `1.0` 在后台创建 Supabase Anonymous User，作为 AIGC、次数额度和服务端资源的授权主体；用户不提供邮箱或其他个人信息。
3. `1.0` 可上线自动续订，RevenueCat 使用该匿名 Supabase `user.id` 作为 Custom App User ID，并提供 Restore Purchases。
4. 不为了订阅单独发布一个缺少用户价值的**显式**账号体系；无感匿名身份不是可跨设备恢复的账号。
5. 账号与云备份作为同一后续阶段上线，账号第一批方式为 Sign in with Apple 与 Email OTP。
6. 云备份稳定后再开放跨设备恢复；自动跨设备同步与冲突管理再作为独立阶段上线。
7. `1.0` 必须完成未来迁移需要的稳定作品 ID、资源 ID、文档版本、Portable Project 和 entitlement 抽象，避免发布后重构作品格式与订阅身份。
8. `1.0` 的配方模板是创作页/再创作页面的本地核心功能：模板定义随 App bundle 发布并实例化为普通可编辑 Draft；首页运营配置只负责展示和入口，不承载模板定义。模板免发版更新留到 P1-B 的后半阶段。

产品承诺必须与实际能力一致：本地作品不得使用 `Backed up`、`Synced` 或 `Available on all devices`；只有服务端确认提交成功的版本才能显示云备份完成。

## 2. 总体版本路线

| 阶段 | 核心目标 | 账号 | 作品存储 | 订阅身份 |
| --- | --- | --- | --- | --- |
| `1.0` | 稳定发布核心创作闭环、随包配方模板与可靠素材恢复 | 无显式登录；后台匿名身份 | 本地工作区与本地草稿 | Supabase Anonymous User ID |
| `1.1` | 完善本地作品与存储管理 | 无显式登录；后台匿名身份 | 本地、可移植导入/重建验证 | Supabase Anonymous User ID |
| `1.2` | 上线账号与云备份 | Apple + Email OTP，可选登录 | 本地优先、云端备份 | 匿名 ID 迁移到 Supabase user ID |
| `1.3` | 跨设备恢复 | 可选登录 | 云端列表、按需恢复 | 账号权益 |
| `1.4` | 自动跨设备同步 | 可选登录 | 增量 revision、冲突副本 | 账号权益与云空间权益 |
| 后续 | Android/Web 与高级云服务 | 统一账号 | 多平台作品 | 跨平台权益 |

版本号表达依赖关系而非固定发版次数；相邻阶段可以合并，但不得先于其数据基础上线。

## 3. `1.0` 产品范围

### 3.1 本地创作

- 无需登录即可新建、编辑、明确保存与导出作品。
- 编辑检查点负责崩溃恢复；只有明确保存的作品进入最近创作。
- 最近创作使用真实 Renderer 缩略图，点击后恢复可编辑 Draft。
- 草稿、用户原图、导出文件、远程素材和可重新下载缓存必须分开管理。
- 清理缓存只清理可重新下载的运营配置、预览和临时文件，不能删除草稿、用户照片或系统相册文件。
- 删除草稿前检查资源引用，只删除没有被其他草稿和当前工作区引用的用户资源。

### 3.2 My Studio

`1.0` 的 My Studio 包含：

- 最近创作与本地空状态；
- `Saved on This Device` 存储说明；
- Premium 状态与订阅入口；
- Manage Subscription；
- Restore Purchases；
- 清理下载预览及缓存大小；
- 正式支持渠道与可复制 Support ID。

英文基线：

> Saved on This Device
> Your editable creations are stored on this device. Export important work before deleting the app.

中文语义：

> 保存在此设备
> 可编辑作品目前保存在此设备。删除应用前，请导出重要作品。

### 3.3 `1.0` 明确不做

- 用户可见的产品登录、云端上传、跨设备作品恢复和自动同步；
- 社区、用户主页、多人协作和云端版本历史；
- 用户名密码、手机号、Google 或微信登录；
- AI 点数、素材币、导出次数等消耗型商品；
- 对尚未发布的云备份作订阅权益承诺。

## 4. 本地作品与资源基础

### 4.1 数据分类

| 数据 | 用户作品数据 | 可由“清理缓存”删除 | 后续云备份 |
| --- | --- | --- | --- |
| Draft / Portable Project | 是 | 否 | 是 |
| 用户导入原图与用户生成资源 | 是 | 否 | 是 |
| App 内导出副本 | 是 | 单独管理 | 默认否 |
| 系统相册导出 | 是 | App 无权清理 | 否 |
| 运营 manifest 与预览 | 否 | 是 | 否 |
| 远程素材预览 | 否 | 是 | 否 |
| 作品依赖的远程素材 | 是，作为稳定引用 | 只有可重新解析时 | 记录引用，不重复上传 |
| 缩略图 | 派生数据 | 可重新生成时 | 可选上传 |
| 临时渲染文件 | 否 | 是 | 否 |

### 4.2 作品元数据

每份明确保存的作品至少具有：

- 稳定 UUID `projectId`；
- `documentVersion`；
- `createdAt`、`updatedAt`、`savedAt`；
- 标题与缩略图标识；
- 本地 `sourceDeviceId`；
- `cloudProjectId: null`、`cloudRevision: null`；
- `backupState: local-only`。

数组位置、文件名、邮箱和完整 `file://` 路径都不能成为永久身份。

### 4.3 用户资源元数据

用户导入资源至少保存：

- 稳定 `assetId`；
- 当前本地 URI；
- MIME、宽高、文件大小和创建时间；
- 来源类型；
- 可选 SHA-256；
- 被草稿引用的关系。

Draft 引用稳定 `assetId`，Asset Catalog 在运行时将其解析为当前设备 URI。

### 4.4 三层本地保存

1. **编辑检查点**：高频、防崩溃，不自动成为最近作品。
2. **明确保存**：进入最近创作，更新 `savedAt`、缩略图与元数据。
3. **导出文件**：最终 PNG/JPEG，与可编辑草稿独立；系统相册副本不受 App 缓存清理影响。

### 4.5 P0-01 文档边界审计记录（2026-09-14）

当前实现的文件归属和生命周期如下。这里的“设备 URI”是模拟器或真机 App 沙盒中的 `file://` 路径，以及仅在当前运行期可用的远程/缓存地址；它不是指已经上线用户的数据。

| 持久对象 | 当前字段与内容 | 生命周期与边界 | 后续云端规则 |
| --- | --- | --- | --- |
| `Draft` | schema、作品 ID、画布、图层、效果、画笔和 `AssetReference` | 编辑器语义文档；资源只以 `asset://`、`user://`、`brush://` 等稳定逻辑身份出现 | 可作为 Portable Project 的语义来源；不得出现设备路径、HTTP(S)、`data:` URI 或平台对象 |
| `AssetCatalog` / `LocalAssetRecord` | 稳定 `reference` 加 `originalUri`、尺寸、MIME、创建时间 | 当前设备的解析目录；`originalUri` 可以是 App 沙盒路径、下载缓存路径或程序化资源的可用地址 | 绝不能原样上传；P0-05/06 将以资源 manifest 和复制后的资源重建它 |
| `StoredWorkspace` 与明确保存草稿 | `{ draft, catalog, savedAt? }`，写入工作区和 `saved-drafts/` | 仅用于当前设备恢复、检查点和最近创作 | 不是 Portable Project，禁止直接作为云端作品文档上传 |
| 运营 manifest 与远程缓存索引 | manifest payload、ETag、缓存时间；资源 key、来源 URL、当前 URI、访问时间 | 可重新下载的产品配置和预览缓存；“清理下载缓存”可删除 | 不属于用户作品，也不进入云备份 |
| App 内导出 PNG | 单独的 PNG 字节文件 | 与 Draft/Asset Catalog 无反向引用；系统相册副本由系统管理 | 默认不上传；未来作为用户明确选择的独立导出能力处理 |

审计时发现导入校验此前只要求 `AssetReference` 非空，无法阻止损坏 JSON 或未来写入路径把运行时 URI 放进 Draft。现已在 Editor Core 的统一校验和 migration 入口拒绝 `file:`、HTTP(S)、`data:`、平台媒体 URI 及绝对路径；检查范围覆盖画布背景、图片/素材图层、效果输入与画笔定义。稳定命名空间仍保持可扩展，不将当前 Catalog 的 URI 规则泄漏进 Draft。

### 4.6 P0-02 资源分类与清理契约（2026-09-14）

分类冻结的是每类数据的所有权和生命周期，不是素材目录的封闭清单。以后增加远程素材包、生成器或新格式时，必须先归入下表的某一类；若不能归类，需要先扩展此契约和 Portable Project manifest，不能以“缓存”名义绕过用户作品保护。

| 类别 | 归属与进入条件 | 本地位置/引用 | 清理与删除规则 | Portable Project / 云端规则 |
| --- | --- | --- | --- | --- |
| 用户导入资源 | 用户拥有；照片经用户选取并被采用时进入 | App 私有作品资源；Draft 仅用稳定 `user://` 身份引用 | 不能由清理缓存删除；仅在没有任何已保存草稿或当前工作区引用时，才可通过明确删除回收 | 复制原始字节和元数据；重建当前设备 Catalog URI |
| 已采用的生成资源 | 用户拥有；AIGC 结果被用户选择加入作品时进入 | 与用户导入资源相同；生成服务返回的短期 URL 不进入 Draft | 与用户导入资源相同；不能按“AI 临时结果”清除 | 上传采用后的资源字节与来源元数据；不上传短期结果 URL |
| 未采用生成候选 | 服务端结果的短期交付物；尚未成为作品资源 | 只在请求会话/下载缓存中存在 | 可在请求完成、过期或用户放弃后删除；不得留下 Draft 引用 | 不备份；再次采用前须先落盘为已采用生成资源 |
| 内置资源 | App 随版本交付，产品拥有 | bundle 或平台 resolver；稳定 `builtin://`/`asset://` 身份 | 不由用户缓存清理处理；随 App 更新替换 | 仅记录稳定 ID 与兼容 revision，不复制资源字节 |
| 远程素材 | 内容供应方/产品目录拥有；用户将其加入作品后，作品拥有该稳定引用的使用语义 | 目录提供稳定 pack/item ID；本机仅保存可重新获取的预览或文件缓存 | 可删除本地缓存，但必须能按稳定 ID + revision 重新解析；下线、付费或版本不兼容时须给出确定的恢复错误，不能静默替换素材 | 记录稳定引用、revision 与必要的 pack 依赖；默认不重复上传公开素材字节 |
| 派生缩略图 | 作品的可再生派生数据 | 缩略图缓存或未来云端缩略图 | 在可由 Draft + 资源重建时可删除；删除不得影响编辑、保存或导出 | 可选上传，永远不能是唯一作品副本 |
| 运营配置与下载缓存 | 产品拥有、可重新获取 | manifest、ETag、封面、远程字体/纹理和 `remote-cache/` | “清理下载缓存”可删除；不得包含用户资源或唯一作品副本 | 不备份为用户数据 |
| 临时渲染与传输文件 | 运行期工作数据 | 临时目录、未完成下载、导出过程的中间文件 | 操作结束、失败、超时或低存储清理时可删除；必须原子化，不能删除已提交资源 | 不备份 |
| App 内导出与系统相册副本 | 用户导出的最终媒体，不是可编辑作品源 | App 导出目录或系统相册 | 不由“清理下载缓存”删除；App 内副本的单独删除需要明确用户动作，系统相册由系统管理 | 默认不纳入作品备份；未来作为显式导出管理功能处理 |

所有未来资源类型还必须满足以下不可变规则：

1. Draft 只引用稳定逻辑身份，不能引用 Catalog URI、缓存键、签名 URL 或平台对象。
2. “清理下载缓存”只可删除可从稳定身份重新取得或重新生成的数据；不能使已保存作品失去可编辑、预览或导出能力。
3. 资源从候选/缓存升级为用户资源时，必须先完成私有落盘和元数据写入，再写入 Draft；失败时 Draft 保持不变。
4. 删除用户资源必须基于全局引用检查，而不是目录、文件名或最近一次访问时间。
5. 远程素材的下线、权限变化或 revision 不兼容是可预期的恢复失败，必须暴露可理解的错误状态，不能替换为不同素材。

当前实现已将运营 manifest、封面和远程预览放在可清缓存边界，也把用户导入照片放在独立 `assets/` 目录。已知缺口是：清空 `remote-cache/` 后，已保存作品内的部分远程素材 Catalog 记录仍持有过期的本地 URI；P1-A05 负责按稳定引用与精确 revision 恢复作品依赖，P1-06 负责缓存统计与用户清理流程。两项均通过后，才能宣称“清理缓存后所有作品仍可立即打开并导出”。该缺口不改变本契约，也不允许将远程素材缓存误标为用户资源。

### 4.7 P0-03 稳定身份审计记录（2026-09-14）

| 对象 | 规范化身份 | 版本与审计结论 |
| --- | --- | --- |
| 作品（当前 `Draft.id`，后续 `projectId`） | 新作品由 `createStableId('project')` 生成 UUIDv4 形态的不可变 ID；保存、恢复和文件索引都使用该 ID，不使用文件名、数组位置或设备路径 | Draft schema 已为 v4；Portable Project 的独立 `projectId`/`documentVersion` 仍由 P0-04 定义 |
| 文档内对象 | 新建图层、文字、画笔图层、效果实例、复制层、剪裁 fragment/operation 使用 UUID 形态 ID；笔触可由稳定 layer ID + 单调序号命名 | 这些 ID 在 Draft 内保持不变；时间戳只保留为笔触输入时间，不再参与对象身份 |
| 用户资源 | 导入时生成 `user-image-{uuid}`，以 `user://image/{id}` 和 revision `1` 写入 Catalog/Draft；本地文件名只派生自该 ID | URI 是当前设备 resolver 数据，不参与身份；未来用户/生成资源 manifest 将携带 MIME、尺寸、hash 与版本 |
| 内置资源、字体、画笔 | 目录中使用稳定逻辑 ID，如 `asset://`、`font://`、`brush://` | AssetReference 和画笔定义均已有 revision；替换渲染语义时必须递增 revision 或建立 migration |
| 远程素材包与项 | pack 使用稳定 `pack.id` + 新增 `pack.revision`；item 使用 `asset://pack/{packId}/{itemId}`，并已有 item revision | URL 只是 resolver 信息；同 ID 的不兼容内容变更必须提升 item/pack revision，不能覆盖为不同语义 |
| 自定义程序化素材 | 由规范化的颜色、形状、布局等语义参数确定 stable item ID；不含路径或运行时随机数 | 生成配方变更必须提升 revision；任一不能确定重建的输入，应升级为用户资源而非远程素材 |
| 服务端 AIGC 结果（尚未实施） | 候选结果不得进入 Draft；用户采用后将分配 `generated://image/{uuid}`，并作为用户拥有资源写入 Catalog | P3-08 实施时生成 immutable asset ID、来源模型/请求审计元数据和 revision；短期 URL 不得成为身份 |

身份生成优先使用运行时 Web Crypto；旧开发运行时只使用 UUID 形态的随机回退，绝不从路径或时间戳推导。历史本地作品保留既有 ID，以避免破坏恢复；它们在未来 Portable Project 导出时映射为相同 `projectId`，不静默重命名。

## 5. Portable Project

云备份前必须定义不依赖当前设备路径的可移植作品。v1 正式契约见 [PORTABLE_PROJECT_CONTRACT.md](PORTABLE_PROJECT_CONTRACT.md)：它冻结了 `project.json` envelope、资产 manifest、内置/远程/用户资源的处理、时间/版本字段、未知字段策略，以及 P0-05/P0-06 的实现边界。

`1.0` 发布门槛仍是：现有作品可以导出 Portable Project，在新的本地目录中重建 Asset Catalog，并由同一个 Renderer 得到等价预览与导出结果。

## 6. `1.0` 无感身份、订阅与服务端 AIGC

### 6.1 无感匿名身份

`1.0` 不展示注册或登录页，但不等于服务端没有身份。首次需要 AIGC、订阅或其他私有服务时，App 创建并持久化 Supabase Anonymous User session。该 user 的 UUID 是内部 `principalId`：

```text
首次启动 / 首次需要服务端能力
    ↓
Supabase Anonymous User + SecureStore session
    ↓
principalId = auth.user.id
    ↓
RevenueCat configure(appUserID: principalId)
    ↓
Worker 通过 Supabase JWT 鉴定请求
```

匿名 user 不收集 PII，也不在 UI 中称为“账号”。它只能代表当前安装：退出、清除 App 数据或换设备后无法自行找回。后续用户在**同一安装**开启 Apple/Email 登录时，应将身份链接到同一 Supabase user，保留相同 UUID；若登录已有账号，才执行合并和迁移流程。

纯 RevenueCat 自动生成的匿名 ID 不能单独作为高成本服务端 AIGC 的授权依据，因为 Worker 无法仅凭客户端提交的 ID 安全证明请求者身份。

身份升级规则：

- **同一安装开启 Apple/Email**：将 Supabase Anonymous User 链接为永久 user，`auth.user.id` 不变；RevenueCat Custom App User ID、AIGC 账本 owner、Worker JWT 与 RLS 主体都继续使用，不发生替换；
- **登录另一设备已有账号**：当前匿名 principal 与已有 permanent user 不相同。App 切换到已有 user ID，RevenueCat 按 transfer/alias 策略切换；只有未来需要保留的本地作品或未完成任务按明确合并规则迁移，绝不静默合并两份用户数据；
- **新设备或重装**：会创建新的匿名 principal，不能恢复本地作品。Restore Purchases 可以恢复订阅，但本周期 AIGC 次数必须根据稳定商店交易身份延续，不能按新 principal 重置。

### 6.2 商品与权益

首版可销售月度、年度自动续订；永久解锁只有在单独完成恢复测试后才允许上线。不销售素材币、导出次数等独立消耗型或非续订次数商品。

适合 Premium 的首版权益：

- 高级素材、背景、效果与画笔；
- 每个有效订阅周期内有限次数的服务端 AIGC 创意图；
- 高分辨率或高级导出；
- 无水印（若免费版设计包含水印）；
- 其他完全在本地兑现的高级能力。

云备份、跨设备同步和云端版本历史在发布前不能出现在售卖承诺中。

### 6.3 Entitlement 与 AIGC 次数边界

页面、Editor 和 Asset System 不直接依赖 RevenueCat SDK，统一通过产品层服务访问：

```text
EntitlementService
├── getStatus()
├── canUse(feature)
├── purchase(package)
├── restorePurchases()
├── refresh()
└── observeChanges()
```

统一状态至少包括 `free`、`premium`、`grace-period`、`expired`、`unknown` 和 `offline-cached`。功能使用稳定 feature key；`cloud-backup` 在能力正式发布前固定为不可用，而不是靠配置提前暴露。

AIGC 次数不是客户端计数器，也不是 RevenueCat 消耗型商品。服务端按“已验证的订阅权益 + 稳定的商店订阅身份 + 当前订阅周期”维护 `ai_generation_ledger`：

- Worker 用 Supabase JWT 确认请求者为 `principalId`；
- Worker 用 RevenueCat secret API 或经过验证的 webhook 确认 Premium entitlement；
- 次数账本键使用 Apple 原始交易/RevenueCat 稳定交易身份与 entitlement 到期周期，**不能只使用匿名 principalId**，防止用户重装并 Restore Purchases 后重置本周期额度；
- 生成前原子预留次数，成功时确认扣减，失败/超时释放预留；
- 每个请求有 idempotency key，重复提交不重复扣次数或重复调用模型；
- 生成结果以短期私有 URL 返回，用户选择加入作品后才进入本地作品资产。

免费试用次数若存在，只能作为低成本体验，并通过匿名身份、App Attest、IP/网络限流与冷却时间控制；不能将其视为不可绕过的反滥用边界。

### 6.4 RevenueCat 与服务端授权

- RevenueCat 使用匿名 Supabase `principalId` 作为 Custom App User ID；它不是用户可跨设备恢复的账号，但可由 Worker 的 JWT 验证。
- 必须在 My Studio 和 Paywall 提供 Restore Purchases。
- Support ID 可展示经过脱敏/可复制的 `principalId`，便于支持定位。
- Webhook 数据模型保存 `app_user_id`、`original_app_user_id`、`aliases` 与 `TRANSFER` 事件。
- 禁止把 `original_app_user_id` 作为未来产品用户主键。
- Worker 的 RevenueCat secret key 永不进入客户端；客户端 CustomerInfo 只用于展示，服务端 AIGC 授权必须由 Worker 独立验证。
- Restore Behavior 在 Sandbox 验证后使用适合匿名/可选登录产品的 `Transfer to new App User ID`。

### 6.5 AIGC 请求链路

```text
用户选择 Premium AIGC 创意图
    ↓
App 取得 Supabase JWT 与 App Attest assertion
    ↓
Worker 验证 JWT、assertion、限流与请求幂等性
    ↓
Worker 验证 RevenueCat entitlement 和本周期额度
    ↓
原子预留一次生成额度
    ↓
调用模型服务
    ↓
确认扣减并返回私有结果
    ↓
用户选择结果后缓存为本地作品资源
```

## 7. 账号与匿名权益迁移

账号与云备份同时上线，第一批登录方式为 Sign in with Apple 和 Email OTP。Supabase `auth.user.id` 是唯一产品身份，邮箱仅是可变属性。

若用户在当前匿名安装上开启账号，优先通过身份链接将其转换为永久 user，保持同一 `user.id`，无需改变 RevenueCat App User ID。若用户登录的是另一台设备已有的账号，才需要把当前匿名身份中的本地状态按产品规则合并，并让 RevenueCat 切换到已有正式 user ID。

登录后的身份迁移顺序：

```text
登录已有 Supabase 账号
    ↓
取得 auth.user.id（UUID）
    ↓
RevenueCat.logIn(userId)
    ↓
刷新 CustomerInfo 与本地 entitlement
    ↓
Webhook 记录 alias / transfer
    ↓
服务端 entitlement 镜像关联 userId
```

约束：

- 不使用邮箱、Apple 隐藏邮箱、设备 ID 或广告 ID 作为 RevenueCat Custom App User ID；
- RevenueCat 迁移失败不能使产品账号登录失败或使本地作品不可用；
- 切换账号后必须重新读取 CustomerInfo，不能沿用上一账号的客户端权益；
- 退出登录清除 Supabase 会话与私有云缓存，RevenueCat 回到匿名状态，但不删除本地作品；
- 同一 Apple Account 在多个产品账号间恢复购买必须遵循已冻结的 transfer 策略并给出明确提示。

## 8. 账号与云备份产品流程

登录入口表达具体价值：

> Turn On Cloud Backup
> Sign in to back up your creations and restore them on another device.

首次登录后：

1. 检测本地明确保存作品数量；
2. 提示备份当前设备的作品；
3. 用户确认后将任务加入持久上传队列；
4. 保留原 `projectId`、`assetId` 和保存时间；
5. 登录、上传或网络失败均不影响本地编辑和本地保存。

账号必须同时支持退出、绑定第二种登录方式和 App 内删除账号。删除账号不等于取消 App Store 订阅；本地作品默认保留，云端删除范围单独确认。

## 9. 云备份架构

### 9.1 服务边界

- Supabase Auth：账号与 JWT；
- Supabase Postgres：用户、设备、项目、revision、资源元数据、任务和 entitlement 镜像；
- Cloudflare R2：用户原图、Portable Project 与云端缩略图；
- Cloudflare Worker：验证 Supabase JWT、配额、签名上传/下载及 revision 提交；
- RevenueCat：App Store 订阅权威状态。

移动端不能持有 R2 写入密钥。服务端从已验证 JWT 取得 owner，不能相信请求体传入的 `user_id`。

### 9.2 核心实体

- `profiles(user_id, locale, created_at, deleted_at)`；
- `devices(id, user_id, platform, app_version, last_seen_at)`；
- `projects(id, user_id, title, latest_revision, thumbnail_object_key, created_at, updated_at, deleted_at)`；
- `project_revisions(project_id, revision, document_version, content_hash, document_object_key, source_device_id, created_at)`；
- `user_assets(id, user_id, sha256, object_key, mime_type, width, height, byte_size, created_at, deleted_at)`；
- `backup_jobs(id, user_id, project_id, state, error_code, retry_count, created_at, finished_at)`；
- `entitlements(user_id, entitlement, status, source, expires_at, updated_at)`；
- `revenuecat_identities(user_id, app_user_id, is_alias, created_at)`。

### 9.3 R2 命名

```text
users/{userId}/assets/{assetId}
users/{userId}/projects/{projectId}/revisions/{revision}.json
users/{userId}/projects/{projectId}/thumbnails/{revision}.jpg
```

用户对象默认私有。公开运营资源继续使用独立的 `homecase/`、`packs/`、`effects/` 目录和公开缓存策略。

### 9.4 原子备份过程

```text
本地保存完成
    ↓
持久化 backup job
    ↓
生成 Portable Project 和资源清单
    ↓
计算 hash，查询已存在资源
    ↓
签名上传缺失二进制
    ↓
上传 Portable Project
    ↓
服务端原子提交 revision
    ↓
更新 latest_revision
    ↓
本地标记 backed-up
```

文件全部可用前不能提交完成的 revision。任务支持断网、App 重启和失败重试；不依赖有限的 iOS 后台时间保证完成。

## 10. 跨设备恢复

登录后先拉取项目元数据和缩略图，不自动下载全部原图。用户打开云端作品时：

1. 下载 Portable Project；
2. 校验并迁移 `documentVersion`；
3. 获取缺失用户资源的短期签名 URL；
4. 下载并校验 hash；
5. 写入作品资源目录并重建 Asset Catalog；
6. 完成本地草稿保存后再进入 Editor。

云端缩略图和未打开文档属于可清缓存；已恢复作品的用户原图属于作品数据，不得被“清理下载预览”删除。

## 11. 自动同步与冲突

云备份和恢复稳定后再承诺 `Sync across devices`。自动同步以稳定检查点/revision 为单位，不上传每次手势操作。

提交时携带 `baseRevision`。若设备 A 基于 revision 12 编辑，而云端已为 revision 13，服务端拒绝静默覆盖，将设备 A 保存为冲突副本。第一阶段不做图层级自动合并，用户可以保留、重命名或删除任一副本。

作品可见状态包括：

- `local-only`、`queued`、`preparing`、`uploading`；
- `backed-up`、`waiting-for-wifi`、`failed`；
- `conflict`、`cloud-only`、`downloading`。

## 12. 云端订阅权益

账号上线后，RevenueCat 仍是购买权威来源，Postgres `entitlements` 只是服务端授权镜像。客户端缓存仅支持短时离线体验，不能作为 R2/Worker 权限依据。

免费账号可以提供有限作品数/容量以验证云备份；Premium 可提升作品数、空间、自动备份与历史版本。具体配额在观察真实作品体积后冻结。

订阅到期时：

- 本地作品和已经下载的作品继续可用；
- 停止新增云备份或降到免费配额；
- 云端作品进入明确的只读保留期，可下载自己的内容；
- 不立即删除云端数据，恢复订阅后可继续备份。

## 13. 退出、删除、安全与隐私

退出登录不删除本地作品或相册导出；如有未完成上传，先显示具体数量。删除账号任务覆盖 Auth、Postgres、R2 私有对象、上传队列与身份映射，并明确告知用户 App Store 订阅需另行管理。

账号阶段发布门槛：

- 匿名与永久 token 均使用 SecureStore；
- 匿名 sign-in 启用 CAPTCHA/Turnstile、速率限制与不再使用的匿名 user 清理策略；
- 高成本 AIGC 请求使用服务端 nonce 验证的 App Attest assertion；不支持 App Attest 的设备走更低额度、严格限流或人工风险策略；
- R2 用户对象私有，签名 URL 短时有效；
- 用户表启用 RLS；
- 上传限制 MIME、大小、像素与数量；
- 日志不记录 token、签名 URL 或用户图片内容；
- 提供 App 内账号删除、隐私政策和数据保留说明；
- 删除流程可审计、可重试，孤立文件可回收。

## 14. 测试矩阵

### 14.1 本地作品

- 新安装无草稿、一个草稿和达到数量上限；
- 崩溃恢复、升级迁移、删除草稿；
- 多草稿共享资源；
- 清理缓存后草稿仍可完整打开；
- 相册导出不受 App 内清理影响；
- Portable Project 在新目录完整重建。

### 14.2 匿名订阅

- 月度/年度购买、取消、失败、退款、过期和 grace period；
- App 重启、卸载重装和换设备 Restore Purchases；
- 无购买时 Restore；
- CustomerInfo 延迟与离线缓存；
- Support ID 能在 RevenueCat 后台定位。

### 14.3 无感身份与 AIGC

- Anonymous User 创建、会话重启、SecureStore 丢失和重装；
- Premium、过期、grace period 与 Restore 后的服务端 entitlement 校验；
- 同一 Apple 原始交易在重装/Restore 后不重置本周期次数；
- 并发请求只扣减一次、模型失败释放预留、重试幂等；
- 伪造 principalId、JWT、App Attest assertion 和重复 nonce 均被拒绝；
- 免费体验额度的限流、冷却和异常请求告警。

### 14.4 匿名转账号

- 未购买匿名用户登录；
- 已购买匿名用户首次登录新账号；
- 正式账号已存在或已有匿名 alias；
- 两台设备分别匿名使用后登录同一账号；
- 同设备切换账号、退出并重新登录；
- 同一 Apple Account 恢复到另一产品账号；
- `logIn()` 失败、Webhook 延迟和 `TRANSFER` 事件。

### 14.5 云备份与恢复

- 纯内置素材作品、多个用户图片和大文件作品；
- 上传中断网、杀 App、网络切换和失败重试；
- 文件去重、上传完成但 revision 提交失败；
- 文档损坏、旧 schema 迁移和 hash 不一致；
- 干净安装设备完整恢复；
- 两台设备同时修改生成冲突副本。

## 15. 监控与成本控制

首版记录 Paywall、购买、取消、失败、Restore 和 entitlement 刷新，不收集作品内容。账号阶段增加登录/OTP、首次备份、平均作品体积、上传失败、恢复、迁移、冲突、R2 容量/流量、Webhook 延迟与账号删除完成率。

上线云端前冻结：

- 单文件、单作品和单用户上限；
- 免费/Premium 空间；
- 上传并发、网络策略和 Worker 限流；
- revision 数量、软删除保留期与孤立对象回收；
- 异常成本和失败率告警。

### 15.1 服务成本边界

| 服务 | 首版用途 | 早期成本判断 | 账号上线后 |
| --- | --- | --- | --- |
| Supabase Auth / Postgres | Anonymous User、JWT、AIGC ledger | Free 可用于开发；生产建议 Pro，匿名活跃安装同样计入 MAU | 同一 Auth、JWT、RLS 和 Postgres 继续使用 |
| Cloudflare Workers | AIGC 网关、RevenueCat 验证、限流 | Free 可做开发；生产建议 Paid 以获得更充足 CPU 与可预期限额 | 同一 Worker 扩展签名上传、云备份和同步接口 |
| Cloudflare Turnstile | 匿名注册反滥用 | Free 足够大多数早期生产流量 | 继续用于高风险注册/请求 |
| Apple App Attest | iOS 高成本请求真实性 | Apple 未单列按请求收费；集成与服务端验证有工程成本 | 仍是设备级校验，不替代用户身份 |
| RevenueCat | IAP、entitlement、webhook | 按其当前 MTR 定价；具体以发布前 Pricing 页复核 | Custom App User ID 与 entitlement 机制继续使用 |
| AIGC 模型服务 | 创意图生成 | 主要可变成本，必须设置每周期额度、单请求成本上限和总预算熔断 | 随使用量增长，是最主要的成本项 |

生产预算必须单独计算模型调用、图片存储、数据库与日志；不要把免费认证或 Worker 配额当作 AIGC 成本控制措施。

## 16. 实施顺序与阶段门

本节只表达总依赖。具体 P0–P7（包括 P1-A、P1-T 与 P1-B）工作包、编号待办、完成标准、测试与阻塞条件，以 `ACCOUNT_SUBSCRIPTION_CLOUD_IMPLEMENTATION_PLAN.md` 为执行基线；下方 S0–S9 保留为 P3 的摘要，不替代完整执行清单。

```text
完善本地草稿和资源生命周期
    ↓
定义并验证 Portable Project
    ↓
冻结创作页模板最小契约与依赖规则（P1-T00）
    ↓
编译 1.0 冻结内容目录，完成 Resolver、恢复、缓存治理与 G1-A
    ↓
实现创作页本地配方模板、模板实例化与 G1-T
    ↓
完善 My Studio 本地作品管理与存储说明
    ↓
建立 Supabase Anonymous User、SecureStore session 与最小 RLS
    ↓
建立 EntitlementService 与 Worker 服务端授权边界
    ↓
接入 RevenueCat Custom App User ID、Webhook 与 Restore Purchases
    ↓
实现 AIGC ledger、幂等预留、模型网关、限流与预算熔断
    ↓
接入 App Attest、Turnstile 与安全测试
    ↓
完成订阅/AIGC 测试并发布 1.0
    ↓
建设远端内容动态发布、上下架与回滚平台（P1-B：先素材，后兼容模板）
    ↓
接入 Apple/Email 显式账号、身份链接与账号删除
    ↓
实现 Worker、R2 私有上传和持久备份队列，发布账号 + 云备份
    ↓
实现新设备按需恢复，再升级为自动同步、冲突与版本历史
```

### 16.1 `1.0` 服务端身份与 AIGC 授权待办

以下待办必须在 AIGC/订阅首版发布前完成；它们不要求用户可见登录 UI。

| 顺序 | 待办 | 完成标准 |
| --- | --- | --- |
| S0 | 建立服务端环境 | 分离 development/staging/production 的 Supabase、Worker、RevenueCat 和模型密钥；所有 secret 仅在服务端保存。 |
| S1 | Anonymous principal | 首次需服务端能力时创建 Supabase Anonymous User；Session 存入 SecureStore；App 重启可复用同一 UUID。 |
| S2 | 最小数据库与 RLS | 创建 `ai_generation_ledger`、请求/预留记录和审计事件；所有行按 JWT `user.id` 限制，匿名与永久 user 权限显式区分。 |
| S3 | Worker 授权网关 | 所有 AIGC 请求只经过 Worker；Worker 验证 JWT、请求 schema、幂等键、并发和限流，客户端不可直连模型或持有模型密钥。 |
| S4 | RevenueCat 关联 | 以 `principalId` 配置 RevenueCat；接收并验证 webhook；Worker 以服务端记录/RevenueCat secret API 判断 entitlement，不能相信客户端 CustomerInfo。 |
| S5 | 周期额度账本 | 以稳定商店交易身份 + entitlement 周期计数；原子预留、成功确认、失败释放；重装/Restore 不重置已使用次数。 |
| S6 | 模型调用与结果处理 | 设置单请求输入/输出限制、超时、重试策略和预算上限；结果先私有保存，只有用户采用后才进入本地作品资源。 |
| S7 | 反滥用 | 匿名注册启用 Turnstile/CAPTCHA；高成本请求使用 App Attest nonce/assertion；限制 IP、principal、设备、并发和每日总预算。 |
| S8 | 可观测性与支持 | 记录不含创作内容的 request ID、费用、状态、失败码、额度变化与风险事件；Support ID 可定位用户但不暴露 secret。 |
| S9 | 发布验证 | 完成第 14.2 与 14.3 节所有场景；进行真实设备、Sandbox 订阅、重装、Restore、并发和模型失败演练。 |

### 16.2 当前下一步

P0、P1-A01 与 P1-A02 已完成。当前只在 Expo / React Native 新架构中按以下顺序推进：

1. 完成 P1-T00，审计并冻结小程序端要迁移的一期两个基础模板、槽位语义和静态依赖规则；配方模板属于创作页/再创作功能，不属于首页运营配置。
2. 完成 P1-A03～P1-A07：生成 1.0 冻结内容目录，接入分层 Resolver、精确 revision 恢复、缓存治理，并通过 G1-A。
3. 完成 P1-T01～P1-T10：先迁移两个基础模板，再接入筛选后的本地预设计模板，并通过 G1-T。
4. 完成 P1-01～P1-10 本地作品管理并通过 G1。
5. 随后按 P2、P3 与 S0–S9 建立 entitlement、无感身份、匿名订阅及服务端 AIGC 授权底座。
6. `1.0` 发布后推进 P1-B：先发布动态素材目录，再在独立兼容验收后发布动态模板目录。

`iosproject` 仅保留为历史行为与算法参考。写入其中的 P1-A/P1-T 缓存、网络、模板或测试实验不构成阶段交付，也不得作为完成状态或验证证据。
