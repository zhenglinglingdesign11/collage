# JournalCollage 账号、订阅与云端能力实施计划

> 状态：执行基线
> 更新日期：2026-09-19
> 上位规划：`ACCOUNT_SUBSCRIPTION_CLOUD_ROADMAP.md`
> 关联规范：`PRODUCT_PARITY_SPEC.md`、`CROSS_PLATFORM_EDITOR_ARCHITECTURE.md`、`REMOTE_ASSET_RELIABILITY_CONTRACT.md`

## 1. 使用方式

本文档将上位路线拆成可独立实施和验收的工作包。产品、身份、订阅、安全和云端范围发生变化时，先修改上位规划，再同步本文档；本文档不得自行改变已经冻结的产品决策。

`1.0` 的唯一客户端实现边界是 Expo / React Native 新架构：`apps/mobile`、`packages/asset-system` 与 `packages/editor-core`。`iosproject` 是停止推进的旧 Swift 原型，不得承接 P1-A、P1-T、P1-B 或任何后续账号、订阅、云端能力任务。

状态约定：

- `[ ]` 未开始；
- `[~]` 进行中；
- `[x]` 已完成且通过本阶段验证；
- `[!]` 阻塞，必须记录原因和解除条件。

推进规则：

1. 按 P0 → P1-T00 → P1-A → G1-A → P1-T01～P1-T10 → G1-T → P1 → G1 → P2 → G2 → P3 → G3 / `1.0` → P1-B → G1-B → P4 → P5 → P6 → P7 的依赖顺序推进，不跨过阶段门发布依赖其结果的功能。
2. 可以并行开展同一阶段内互不依赖的任务，但阶段门必须统一验收。
3. 进入具体任务前再补充文件级设计、API 参数、SQL migration 和测试用例；不得在总计划中提前冻结尚未验证的实现细节。
4. 任务完成需同时更新状态、验证证据和决策记录，仅提交代码不视为完成。
5. 若实现发现上位假设错误，停止后续阶段，先修正规划与迁移策略。

## 2. 发布映射

| 发布范围 | 必须完成 | 用户可见能力 |
| --- | --- | --- |
| `1.0` | P0、P1-A、P1-T、P1、P2、P3 | 本地作品、创作页本地配方模板、可靠的远程素材加载与恢复、匿名订阅、限定次数服务端 AIGC、Restore Purchases |
| `1.x` 动态内容目录 | P1-B | 素材包与兼容模板免发版新增、修改、隐藏、恢复与回滚 |
| 账号 + 云备份 | P4、P5 | Apple/Email 账号、云备份、账号删除 |
| 跨设备恢复 | P6 | 新设备查看并恢复云端作品 |
| 自动同步 | P7 | 多设备增量同步、冲突副本、版本历史 |

## 3. P0：本地作品可移植性

### 目标

保证当前本地作品不依赖旧设备的沙盒路径即可被序列化、迁移和重建，为后续云备份提供稳定文档边界。

### 非目标

- 不上传任何用户作品；
- 不接入账号、订阅或服务端；
- 不改变 Renderer 的视觉结果；
- 不承诺跨设备同步。

### 前置依赖

- 当前 Draft migration、Asset Catalog、本地保存和 Renderer 缩略图/导出闭环可运行。

### 待办

- [x] **P0-01 文档边界审计**：列出 Draft、Asset Catalog、StoredWorkspace、缓存索引和导出文件的字段与生命周期，确认 Draft 不保存 `file://`、缓存 URL 或平台对象。
  - 验证记录（2026-09-14）：审计表见路线图 §4.5；`validateDraft`/`migrateDraft` 已拒绝画布、图层、效果输入和画笔定义中的设备路径、HTTP(S)、`data:` 与平台媒体 URI；Editor Core 回归测试通过（21/21）。`StoredWorkspace` 仍明确仅限本地恢复，不能直接上传；Portable Project 的序列化/导入留待 P0-05/P0-06。
- [x] **P0-02 资源分类冻结**：定义用户资源、内置资源、远程素材、生成资源、派生缩略图、缓存与临时文件的所有权及清理规则。
  - 验证记录（2026-09-14）：分类、所有权、清理与云端处理矩阵见路线图 §4.6；冻结了“采用生成结果前后”的升级边界、远程素材按稳定 ID/revision 重新解析以及全局引用删除规则。已记录当前远程素材清缓存后的重解析缺口，实施归入 P1-06，未将其误判为已具备的用户承诺。
- [x] **P0-03 稳定身份审计**：确认 project、asset、pack item、generated asset 使用稳定且不依赖路径的 ID；补齐缺失的 UUID 与版本字段。
  - 验证记录（2026-09-14）：身份矩阵见路线图 §4.7。新增共享 UUID 形态 ID 生成器并替换新作品、导入资源和全部新建 Draft 内对象的时间戳身份；用户资源补齐 revision，远程素材包补齐 pack revision，项级 AssetReference 原有 revision 保留。AIGC 尚未实施，采用后的 `generated://image/{uuid}` 契约已冻结，落地留待 P3-08。
- [x] **P0-04 Portable Project 契约**：定义首个 schema、资源 manifest、时间字段、版本字段和未知字段策略。
  - 验证记录（2026-09-14）：v1 规范见 `PORTABLE_PROJECT_CONTRACT.md`。已冻结 envelope、资源 ownership/字节、pack 依赖、字体/画笔依赖、RFC 3339 时间字段、双层版本、严格未知字段与 `extensions` 保留策略；并修正早期路线图示例，使其使用现有 `user://`、`asset://pack/`、`font://`、`brush://` 命名。尚未实现序列化/导入，留待 P0-05/P0-06。
- [x] **P0-05 本地序列化器**：实现 StoredWorkspace → Portable Project，拒绝泄露本地 URI、签名 URL 和运行时对象。
  - 验证记录（2026-09-14）：`exportPortableProject` 将迁移后的 Draft、manifest 与资源字节写入临时目录后原子移动；仅嵌入 `user://`/`generated://` 资源，并记录 MIME、字节数、SHA-256 与像素尺寸。Catalog、`originalUri`、缓存键和远程 URL 均不进入 `project.json`；目录素材只保留稳定引用与 pack/font/brush 依赖。
- [x] **P0-06 本地导入器**：实现 Portable Project + 资源目录 → 新 StoredWorkspace，重新生成当前设备 URI 与 Asset Catalog。
  - 验证记录（2026-09-14）：`importPortableProject` 先验证 envelope 与 Draft/manifest 对应关系，再验证每个嵌入资源的路径、大小和 SHA-256；所有资源落入新临时目录后才原子移动，并以新 URI 构建 Catalog。函数只返回新 Workspace，不会覆盖当前工作区；隔离目录的端到端恢复验收留待 P0-08。
- [x] **P0-07 迁移与校验**：为 Portable Project 增加 schema validation、旧版本 migration、缺失/损坏资源错误模型。
  - 验证记录（2026-09-14）：`migratePortableProjectEnvelope` 支持 v0 `draft/assets` → v1 `document/assetManifest`，拒绝未来版本和未知顶层字段；导入端校验 timestamps、manifest 闭包、资源引用、ownership、嵌入路径、MIME、尺寸、SHA-256 与重复路径。`PortableProjectImportError` 提供稳定错误代码，覆盖 JSON/schema、版本、缺失/截断/篡改资源和目标冲突；Core 回归覆盖 v0、future-version 与 unknown-field。
- [x] **P0-08 隔离重建验证**：在新的临时目录导入真实复杂作品，验证原目录不可访问时仍能恢复。
  - 验证记录（2026-09-14）：新增 `apps/mobile/test/portableWorkspace.integration.test.js`，通过已编译的移动端 `localWorkspace` 导出/导入实现和 Node 文件系统适配器执行隔离重建。测试覆盖内置目录背景、用户图片、文字、笔刷和效果图层；导出后确认 `project.json` 不含原工作区路径，删除原始图片后导入到新工作区，确认 Draft 内容不变、重建 Catalog URI 位于新目录且对应文件存在。
  - 验证命令：`npm run test:portable --workspace mobile`（Editor Core 24/24，隔离重建集成测试 1/1）。
- [x] **P0-09 渲染一致性**：用同一 Renderer 比较原作品与重建作品的预览、缩略图和导出结果。
  - 已完成的自动化层（2026-09-14）：`@journalcollage/editor-renderer` 提供 `renderParitySnapshot`/`renderParityFingerprint`，捕获生产 `SkiaEditorScene` 的持久输入而排除设备 URI 与编辑器选择态。隔离重建测试验证用户资源字节 SHA-256、复杂 Draft 以及 preview（360×450）、thumbnail（80×100）、export（800×1000）三个目标的渲染输入完全一致。
  - 原生验证记录（2026-09-15）：Simulator 开发版中的 `NativeRenderParityProbe` 使用相同 `SkiaEditorScene`，先捕获原项目，再删除原始用户图片、从 Portable Project 导入新目录并捕获重建项目。`SkImage.readPixels()` 的 RGBA SHA-256 对 preview、thumbnail、export 三个目标均一致；PNG 编码哈希仅作为诊断保留。验证结果写入 App 私有 `native-render-parity/proof.json`。
- [x] **P0-10 文档与夹具**：保存最小、真实复杂、旧版本、缺失资源和损坏文档测试夹具。
  - 验证记录（2026-09-14）：新增 `apps/mobile/test/fixtures/portable-project/fixture-matrix.json` 与说明文档，覆盖 `minimal-v1`、`complex-v1`、`legacy-v0`、`missing-resource-v1` 与 `corrupt-resource-v1`。集成测试在每次运行中将夹具物化到新的临时目录，分别断言成功导入、v0 迁移、缺失资源错误和 SHA-256 损坏错误；复杂夹具同时供 P0-08/P0-09 使用。

### 完成标准

- Portable Project 不包含设备绝对路径和短期远程地址；
- 用户资源可复制到新目录并完整重建；
- 内置/远程素材通过稳定引用重新解析；
- 旧 schema 有确定迁移或明确拒绝结果；
- 重建作品与原作品的可见渲染一致。

### 阶段门 G0

P0-01 至 P0-10 全部通过后，才允许把作品或生成结果纳入任何服务端存储设计。

## 4. P1：本地作品与 My Studio

### 目标

完成无需账号也可靠、透明的本地作品管理，并让用户明确知道作品只保存在当前设备。

### 非目标

- 不展示登录入口；
- 不显示云备份或同步成功语义；
- 不把缓存清理扩展为作品删除。

### 前置依赖

- P0 的资源生命周期和删除边界已冻结；现有 My Studio 页面可作为实现起点。

### P1-T00：模板最小契约与依赖规则

#### 目标

在建设 1.0 冻结内容目录前，先冻结配方模板所需的最小数据边界，使 P1-A 能正确收集模板资产依赖。配方模板是后续创作页/再创作页面中的核心创作功能，不属于首页运营 showcase 或远程运营配置；首页可以展示模板成品和入口，但不是模板定义的所有者。

#### 待办

- [x] **P1-T00 模板最小契约与依赖规则**：以 `Romantic Deco`、`Play Pop`、`Soft Archive` 三个 composition tests 作为契约覆盖样本，已冻结 `templateId`、`templateRevision`、照片/文字槽位、固定图层、可替换 `materialSlots`、稳定素材引用、依赖闭包、`requiredCapabilities` 与 Template → Draft 单向实例化边界；`Romantic Deco-1` 作为双图片槽位覆盖样本，小程序基础模板作为仅照片槽位的兼容回归样本。装饰替换从定义的来源素材包打开，且保持图层布局参数。不得把 CDN URL、设备 URI、运营卡片结构或可执行脚本写入模板。见 `TEMPLATE_P1_T00_FREEZE.md`。

#### 完成标准

- 三个 composition tests 的槽位、图层、固定素材与替换行为有可测试描述；小程序基础模板的照片替换能力仍通过同一契约回归；
- 模板依赖可由 stable asset/font/effect reference 静态枚举；
- P1-A03 能据此把首发模板依赖纳入 1.0 冻结内容目录；
- 本任务只冻结最小契约，不提前实施完整模板目录、Recipe 编译器或 UI。

### P1-A：1.0 远程素材可靠性

#### 目标

保证 Expo / React Native iOS `1.0` 随 App 发布的远程素材目录可可靠加载、校验、缓存和恢复；清缓存、离线或 CDN 故障不能静默破坏已保存作品。本阶段不提供素材包免发版新增、修改或下架。

#### 前置依赖

- G0 已通过；远程素材的稳定身份、revision、Portable Project 边界和本地重建渲染一致性均已验证。

#### 范围与不变量

- 本工作包只分发产品拥有的公开素材图片和声明式目录元数据；不上传用户作品、用户导入资源、生成结果或身份信息。
- 远端内容不得包含可执行代码、动态业务逻辑、支付判断或权限授予。`premium` 等标记只用于展示；实际能力判断仍由 P2 `EntitlementService` 执行。
- Draft 继续只保存稳定 `asset://pack/{packId}/{itemId}` 引用及 revision，绝不保存 CDN URL、缓存路径、ETag 或签名 URL。
- App bundle 内的静态目录元数据与基础素材保留为首次安装、离线和远端故障兜底；1.0 的可见目录随 App 版本冻结。
- 远端素材属于路线图 §4.6 的“远程素材/运营配置与下载缓存”，可被清理，但必须能由稳定 ID + revision 重新解析；它不是 P4/P5 的账号或云备份能力。
- 所有实现位于 `apps/mobile`、`packages/asset-system` 或共享的 `packages/editor-core`；不得向 `iosproject` 新增素材 resolver、缓存、网络或测试代码。

#### 待办

- [x] **P1-A01 版本与完整性契约**：冻结 stable ID、pack/item revision、内容 hash、缓存记录和确定错误码；同一 revision 不得被不同内容覆盖。
  - 验证记录（2026-09-15）：已冻结 [`REMOTE_ASSET_RELIABILITY_CONTRACT.md`](REMOTE_ASSET_RELIABILITY_CONTRACT.md) v1。契约定义精确 revision 解析、SHA-256/尺寸/MIME 原子校验、可清理缓存记录、稳定失败码、App bundle/缓存/CDN 优先级与禁止静默替换规则；`blue03`、`zhenzhi01` 仅作为 P1-A02 测试候选，尚未纳入 1.0 冻结目录。
- [x] **P1-A02 验证下载**：在 `packages/asset-system` 实现平台无关的下载、校验、并发与错误策略，在 `apps/mobile` 提供 Expo 文件系统适配器，实现临时写入、尺寸与 SHA-256 校验、原子落盘、并发去重、取消和有限重试；旧 `iosproject` 实验不计入本任务验证。
  - 验证记录（2026-09-15）：已用压缩后的 `zhenzhi01/items/1.png` 完成平台无关 hash/尺寸/MIME 校验与 Expo 暂存→校验→移动缓存测试；`npm run test:remote-assets --workspace mobile` 覆盖 hash 篡改拒绝、并发请求只下载一次、首次网络失败后的第二次成功、两次失败后无暂存目录/缓存记录，以及取消调用方不产生半成品。适配器对网络错误和 HTTP 5xx 至多尝试两次（每次 8 秒超时），不重试 hash、MIME 或 4xx 等确定失败。真实 R2 HTTPS 冒烟验证已通过：`pack-sheet.png`（480×320，97,544 bytes，SHA-256 `0326a80d7ceac1e7841588e1f2606cf773ba36a2855b16408ce9ef49c559ab2b`）与 `items/1.png`（224×242，21,691 bytes，SHA-256 `8ca1ef671c1f28bf881fc6724842efb1a3c65c4a3a2b60ce28c1f6d4606751f6`）均从 `https://assets.zllarchi.site/packs/zhenzhi01/` 返回 `200 image/png`，下载字节与本地一致。iPhone 17 iOS 26.5 Simulator 的 Expo 开发版已实际通过 R2 写缓存、取消下载和不可达 HTTPS 的两次超时重试/清理探针；宿主 `simctl` 在事后读取容器时因 CoreSimulatorService 拒绝连接不可用，目录级清理证据由上述 Expo 文件系统集成测试保留。
- [x] **P1-A03 1.0 冻结内容目录编译**：从已切割并通过 QA 的审核源生成 `ProductAssetCatalog`，包含 pack/item stable ID、独立 revision、MIME、像素尺寸、字节数、SHA-256、UI category、pack-first metadata、必要的 asset override、capability、bundle/CDN location 与 P1-T00 模板依赖闭包；生产状态未达到 `shipped` 的 sheet/素材不得进入客户端目录。
  - 验证记录（2026-09-20，2026-09-21 扩充）：运行时范围原为 46 个用户可浏览的已上传/在线包、1,142 个可浏览素材对象，以及不在素材列表展示的内部 `template-previews` 包（4 个远端预览）。已生成 staging 与 `shipped` 运行时目录。Catalog 使用稳定 pack ID 与实际 R2 object prefix 的映射，远端 URL 带冻结 pack/item revision 查询参数（当前均为 `?v=1`），避免历史 CDN 缓存返回旧字节。
  - Recipe/Catalog 扩充（2026-09-21）：新增 9 个 strict 素材包：`handmade-cutout-type`、`cutout-frames-cropping-accents`、`fan-edit-highlights`、`experimental-print-registration-fragments`、`editorial-connectors-index-marks`、`micro-editorial-1`、`structural-plastic-beads-mesh`、`beads-structural-units-1` 与 `fabric-fiber-thread`；已完整重传的 `caise-01` 与 `caisebodian` 同时提升为 strict。`catalogRevision` 递增至 `3`，生成 56 个包与 656 个上传对象。为避免 `2.png` 与 `2_副本.png` 折叠为同一稳定 ID，编译器将显式“副本”后缀规范化为 `-copy`（例如 `2-copy`）。
  - 最小远端审计（2026-09-21）：抽样验证 `handmade-cutout-type/cover + 8`、`fan-edit-highlights/cover + 2-copy`、`editorial-connectors-index-marks/cover + 10` 的 HTTPS、MIME、字节数和 SHA-256，全部与 Catalog 匹配。`hudiejie/13` 与 `jiaodai/29` 也匹配，但两个包的封面仍为不同 JPEG 字节版本；因此 `hudiejie`、`jiaodai` 继续走 compatibility，不能作为 fixed template dependency。后续模板需要的少数对象须以独立 strict 模板资产副本发布，而不是提升整个旧包。
  - 最简远端审计（2026-09-20）：15 个封面和 15 个样本 item 均可访问且 MIME 正确；默认信任上传时本地/远端目录、文件名和数量一致，不进行全包下载比对。四个首发模板的 22 个固定素材与 4 个预览均通过远端 SHA-256 校验；预览另验证了 PNG MIME、字节数和像素尺寸。`hudiejie/items/13.png`、`jiaodai/items/29.png`、`jiaodai/items/31.png` 曾有旧 CDN 缓存，现以 `?v=1` 命中冻结字节。
  - 后续发布策略：以首发用户价值为范围，不让未上线、未被模板引用的素材包阻塞当前工作。常规新增包由内容负责人确认上传目录/名称/数量一致后，只检查封面和一个样本 item；模板预览与固定依赖仍做完整远端校验；客户端继续在实际下载时执行完整性校验。只有路径/revision 变更、缓存/上传事故或明确冻结审计时才全包下载比对。
- [x] **P1-A04 分层 Resolver**：在 `packages/asset-system` 与移动端本地工作区按当前设备本地 Catalog → 已验证远端缓存 → App bundle 素材 → 当前 revision CDN 的顺序解析，不把运行时 URI 写入 Draft；用户资源 Catalog 与产品素材目录保持分离。
  - 验证记录（2026-09-20，2026-09-21）：严格 Resolver 只接受 shipped Catalog 的精确 stable reference，并按已验证缓存 → 可选 bundle → 下载后验证缓存的次序返回本地 URI；测试覆盖 cache → bundle → CDN、拒绝 staged Catalog 与未知 revision。素材库和编辑器抽屉从 46 个可见 shipped 包（加本地 procedural controls）读取：13 个新增/已冻结包与内部模板预览包使用严格 Resolver；33 个历史小程序包（含 `jiaodai`、`hudiejie`）使用兼容缓存，只检查 HTTPS 成功响应与 PNG/JPEG MIME 后落盘，不参与 hash 比对，且不得作为模板固定依赖。模拟器启动曾暴露少数源文件名含空格、括号或下划线，被错误直接用作 asset ID；编译器现将其规范化为合法稳定 ID，R2 object 名和 URL 不变。全 Catalog stable-reference 验证为 0 个异常；`npm run typecheck --workspace @journalcollage/asset-system`、`npm run typecheck --workspace mobile`、`npm run test:remote-assets --workspace mobile` 均通过（7/7）。
  - 历史小程序包最小校验（2026-09-21）：按素材整理表第 19–20 页及既有小程序配置，`/packs/{pack-id}/pack-sheet.jpg` 与 `/items/1.png` 对 33 个历史包均返回 `200` 和正确图片 MIME；`zhenzhi01` 使用例外封面 `pack-sheet.png`，封面与样本也均正常。`papers` 不在小程序使用范围且两个端点均为 `404`，不纳入候选。未做逐对象下载或远端 hash 审计。下一步可直接利用同名本地审核源生成这些包的 hash manifest，并将与当前 15 包重叠的 `jiaodai`、`hudiejie`、`zhenzhi01` 去重后接入 shipped Catalog。
- [x] **P1-A05 已保存作品恢复**：清缓存或本地文件缺失后按 stable ID + revision 重新获取；不可用时显示确定错误，绝不替换为不同素材；首发模板依赖素材使用相同解析路径。
  - 验证记录（2026-09-21）：恢复已保存作品时只枚举 Draft 实际使用的 image/material 图层与画布背景引用，按最多 3 个并行恢复；现有本地文件直接复用。严格包经 Resolver 恢复，历史兼容包只经 HTTPS + PNG/JPEG MIME 缓存恢复。失败不改变 Draft、图层几何或素材引用；编辑器显示持久的“素材不可用 · Retry”入口。自动化回归覆盖 strict 与 compatibility 素材恢复、失败后 Draft/catalog 不被替换或写入；`npm run test:remote-assets --workspace mobile` 通过（9/9）。首期不实现后台重试队列、整包预取或离线下载管理。
- [x] **P1-A06 缓存治理**：记录身份、revision、hash、大小、访问时间和校验状态；只回收可重获资源，并保护当前编辑作品、最近作品和正在实例化的模板依赖。
  - 验证记录（2026-09-21）：严格 Resolver 缓存记录 descriptor、hash、字节数、验证时间与 `lastAccessedAt`；兼容缓存沿用 source/访问时间索引。My Studio 统计已合并两类缓存，“Clear cache” 会同时清除两者且不触碰用户文件、作品或导出。以 250 MB 为保守上限，在进入 My Studio 和显式保存作品后按 LRU 回收可重新获取的资源；当前保存作品和最近保存作品的素材引用不回收。自动化回归覆盖严格缓存的大小统计、受保护引用和 LRU 删除。
  - 素材浏览性能：素材库与编辑器抽屉的包封面列表、包详情已从 `ScrollView + map` 收敛为 `FlatList` 可视区域虚拟列表。首屏只挂载少量行，列表窗口只覆盖当前视区及相邻少量行；因此打开大包不会挂载或下载整包预览。首期不增加独立的后台/整包预取队列，已命中内存或磁盘缓存的项目仍由现有缓存直接复用。
- [ ] **P1-A07 离线与发布回归**：覆盖新安装、离线、hash 不符、CDN 404、低存储、并发下载、模板依赖闭包和清缓存后编辑/导出；远程 Premium 标记在 P2 前默认拒绝。
  - 最小核心回归（2026-09-21）：自动化已覆盖已验证的严格素材在断网后直接复用、不触发第二次下载；严格 CDN `404` 被拒绝且不留下可用缓存记录；四张 shipped `template-previews` 均为 internal strict 资产，并能通过严格 Resolver 的 verified-cache 分支解析。`npm run test:remote-assets --workspace mobile` 通过（13/13）。模拟器层面的新安装、清缓存后作品恢复、离线失败提示/Retry 与生产发布环境检查仍待发布前完成。

#### 完成标准

- 1.0 冻结目录中的素材在正常、离线和 CDN 故障场景都有确定解析或可理解错误；
- 缓存清理后，引用远端素材的已保存作品能按 stable ID + revision 重新解析、编辑和导出，或显示可理解且不替换内容的错误；
- 首发模板引用的全部素材、字体和效果都存在于验证过的依赖闭包，模板依赖不会因普通目录隐藏而失效；
- 远端目录不授予付费权益，也不承担用户数据、账号、备份或同步职责。

#### 阶段门 G1-A

在 Expo / React Native iOS 真机验证离线兜底、hash/404 失败、缓存清理后旧作品恢复、首发模板依赖闭包和 Premium 默认拒绝后，才可在 `1.0` 中发布远程素材。G1-A 是 P1-T01、P1-06 和 G1 的前置条件。

### P1-T：1.0 创作页本地配方模板

#### 目标

在新架构的创作页/再创作页面提供随 App bundle 发布的本地配方模板。模板用于生成普通、可继续编辑的 Draft；它不是首页运营 manifest，也不建立独立渲染器。`1.0` 上线目录固定为 10 个模板：`Romantic Deco`、`Romantic Deco-1`、`Play Pop`、`Soft Archive`、`soft_archive_multi`、`play_pop_multi`、`fan_moodboard`、`digital_y2k_ascii`、`digital_y2k_multi` 和 `material_remix`。所有 10 个模板均须完成照片替换与本地作品生命周期验证；不再以四模板完成作为其余六个模板的筛选前提。

#### 非目标

- 不在 1.0 免发版新增、修改或下架模板；
- 不在客户端运行生产侧 Recipe metadata query、自动选素材或生成构图；
- 不实现动态玩法、时间轴、远端脚本或任意业务逻辑；
- 不把首页 showcase 的 effect/background intent 当作模板模型；
- 不承诺尚未稳定的自动人物抠图、派生裁切、subject-aware annotation 或 Recipe shuffle。
- 首发不提供装饰素材替换、同包素材候选选择器或模板管理后台；关联装饰均为固定构图图层。

#### 前置依赖

- P1-T00 与 G1-A 已通过；
- 首发模板使用的素材、字体和效果已经进入 1.0 冻结内容目录；
- 候选模板已通过成品质量和照片替换可用性审核。

#### 待办

- [ ] **P1-T01 模板 Schema**：在共享包定义版本化 `TemplateDefinition`，覆盖 10 个首发模板的 canvas、照片槽、固定图层、稳定引用、初始 crop/transform/opacity/z-order、依赖闭包、预览、`requiredCapabilities`、状态和严格未知字段策略。照片槽数冻结为：`Romantic Deco-1` 2，`Play Pop Multi` 与 `Soft Archive Multi` 各 4（左侧照片卡加三连相框），`Digital Y2K Multi` 6，其余六个各 1；首发定义的 `materialSlots` 为空；仅声明 `image.replace`、`image.crop` 与 `material.resolve`，不实现 `material.replace`。文件级差距与验收见 `TEMPLATE_SCHEMA_P1_T01_ACCEPTANCE_CHECKLIST.md`。
- [ ] **P1-T02 Recipe 编译器与视觉校准**：维护 10 个首发模板的 `角色 / 来源 asset / 是否缺失 / z-index / 相对 frame / rotation / 是否锁定` 图层清单，以真实关联素材和临时照片按各自画布尺寸完成校准合成并与参考预览叠对。补齐 Romantic Deco 的粉色背景、Play Pop 的撕纸底和透明中心蓝色照片框、Soft Archive 的含固定文案/日期的纸张背景；把 `hudiejie`、`jiaodai` 以及第二批需要的 `xiangkuang/1`、`jiazi/2` 作为 strict 内部模板资产发布，不能把 compatibility 包直接写入固定依赖；随后在构建工具中把已校准、审核通过的 Recipe/Template Instance 编译为确定性模板记录。metadata query 只在构建时解析，客户端只接收具体引用和参数；编译拒绝缺失依赖、未发布素材和不支持能力。
- [ ] **P1-T03 模板实例化**：实现 TemplateDefinition → 新 Draft，生成新的 project/layer identity，不保存 CDN URL、bundle path 或模板运行时对象；实例化后的作品可脱离模板目录独立保存和恢复。
- [ ] **P1-T04 模板替换语义**：首发只实现照片槽位替换，保留模板规定的 crop/mask/effects/z-order/safe area，并覆盖 10 个首发模板（Romantic Deco-1 两槽，Play Pop Multi/Soft Archive Multi 各四槽，Digital Y2K Multi 六槽）。关联装饰保持固定；文字替换、同源派生与同包装饰素材替换留待首发闭环验证后另行立项。
- [ ] **P1-T05 创作页本地模板目录与预览**：在创作页/再创作入口展示随包 TemplateCatalog、模板卡片、预览和基础分组；首页可链接到模板入口或展示成品，但运营 manifest 不承载模板定义。
- [ ] **P1-T06 模板能力门控**：只展示当前 App schema、Renderer、effect 和编辑能力完整支持的模板；不支持模板确定隐藏或拒绝，不能静默降级为不同构图。
- [ ] **P1-T07 模板资产依赖校验**：构建时验证每个素材、字体、效果及其 revision/hash；首发模板的完整依赖必须具备 bundle 可用副本，避免首次使用或离线时依赖网络。
- [ ] **P1-T08 模板完整验收**：覆盖 10 个首发模板的常见照片比例、横竖图、人脸/主体遮挡、模板实例化、照片替换、保存、重启、清缓存、离线、缩略图和导出渲染一致性。文字长度与装饰素材替换不属于当前首发矩阵。
- [ ] **P1-T09 首发模板编排**：为 10 个已确定首发模板完成创作页排序、基础分组、正式预览与可见性复核；不再承担候选筛选职责。未配置或未通过验收的模板不得因存在参考图而进入目录。
- [ ] **P1-T10 模板发布验证**：在 Expo / React Native iOS 真机逐个验证首发模板入口、预览、实例化、替换、编辑、保存、恢复和导出，并确认 Release 构建不包含开发验收面板或未发布模板。

#### 完成标准

- 配方模板从创作页进入并生成可编辑 Draft，不依赖首页运营配置；
- 两个基础模板与筛选后的预设计模板在离线首开时可用；
- 模板实例化后按普通作品保存、恢复和导出，不因模板目录变化失效；
- 模板只使用当前 App 支持的声明式图层与效果，不执行远端代码或动态业务逻辑。

#### 阶段门 G1-T

P1-T01 至 P1-T10、首发模板依赖闭包、真机逐模板替换及离线保存/恢复/导出全部通过后，才能把配方模板纳入 `1.0`。G1-T 与 G1-A 均是 G1 的前置条件。

### 待办

- [ ] **P1-01 最近作品模型**：确认明确保存、自动检查点和最近创作的边界与排序。
- [ ] **P1-02 空态与加载态**：无草稿时不闪加载骨架；有草稿时恢复和缩略图不造成布局跳动。
- [ ] **P1-03 本地存储说明**：加入 `Saved on This Device` 语义及中英文文案。
- [ ] **P1-04 草稿操作**：支持打开、重命名、删除；破坏性操作使用 iOS 确认并保持 Android 可移植性。
- [ ] **P1-05 引用安全删除**：删除草稿时只回收无引用用户资源，不删除其他作品或当前工作区依赖。
- [ ] **P1-06 缓存统计与清理**：在 P1-A06 完成后，只统计、清理可重新下载内容；清理后通过稳定引用重新获取，且不破坏已保存作品或已实例化模板。
- [ ] **P1-07 导出文件边界**：App 内导出副本与系统相册文件分离，文案准确说明清理范围。
- [ ] **P1-08 Support ID 位置**：预留可复制的非秘密支持标识和正式支持渠道。
- [ ] **P1-09 生命周期测试**：覆盖重启、升级、低存储、保存上限、删除和缓存清理。
- [ ] **P1-10 双语与可访问性**：英文使用语义化文案；中文完整；按钮、状态和确认框具备可访问标签。

### 完成标准

- 用户能区分作品、导出和缓存；
- 清理缓存后所有本地作品仍可打开、编辑和导出；
- 删除作品不会误删共享资源；
- 页面不暗示尚未存在的云备份。

### 阶段门 G1

G1-A、G1-T、真实草稿与资源删除回归测试均通过后，才能开始在 My Studio 接入订阅状态和付费入口。

## 5. P2：订阅权益抽象

### 目标

建立与 RevenueCat 解耦的统一 entitlement 契约，让 Editor、素材、导出和 AIGC 只依赖产品能力，不依赖供应商 SDK。

### 非目标

- 本阶段不发起真实购买；
- 不调用模型服务；
- 不决定最终售价与营销文案。

### 前置依赖

- Premium 功能范围已有产品清单；本地功能可以通过稳定 feature key 判断。

### 待办

- [ ] **P2-01 Feature Catalog**：列出免费、Premium、本地和服务端能力的稳定 key 与默认策略。
- [ ] **P2-02 Entitlement 状态机**：定义 free、premium、grace-period、expired、unknown、offline-cached。
- [ ] **P2-03 服务接口**：定义查询、刷新、购买、恢复、观察变化和功能判断接口。
- [ ] **P2-04 本地开发适配器**：提供无 RevenueCat 的 deterministic fake，支持所有状态测试。
- [ ] **P2-05 UI 消费边界**：页面和工具只调用 entitlement 接口；不直接读取 RevenueCat CustomerInfo。
- [ ] **P2-06 离线策略**：冻结离线缓存有效期、未知状态下本地已购能力和服务端能力的不同处理。
- [ ] **P2-07 Paywall 契约**：定义入口、成功、取消、失败、恢复和管理订阅后的状态刷新。
- [ ] **P2-08 遥测事件**：定义不含作品内容的 paywall、purchase、restore 与 entitlement 事件。
- [ ] **P2-09 单元与状态测试**：覆盖状态迁移、重复回调、离线、过期和恢复。
- [ ] **P2-10 产品复核**：确认 `cloud-backup` 等未发布能力无法被远程配置提前解锁。

### 完成标准

- 移除或替换 RevenueCat 适配器不会修改 Editor Core、Renderer 或具体业务功能；
- 所有 Premium 入口在 unknown/offline/expired 状态下有确定行为；
- 服务端 AIGC 不依赖客户端 entitlement 作为授权依据。

### 阶段门 G2

Fake 适配器覆盖完整状态矩阵并通过测试后，才接入真实订阅 SDK 和服务端额度。

## 6. P3：无感身份、匿名订阅与服务端 AIGC

### 目标

在不要求用户显式登录的前提下，为第一版提供可服务端鉴权、可限额、可审计的订阅与少量 AIGC 创意图能力。

### 非目标

- 不提供 Apple/Email 登录 UI；
- 不上传或同步用户作品；
- 不将匿名 principal 描述为可恢复账号；
- 不销售独立消耗型点数。

### 前置依赖

- G0、G1、G2 已通过；AIGC 供应商、模型、输入输出限制和订阅周期次数已有产品决定。

### 待办

- [ ] **P3-01 / S0 环境隔离**：建立 development、staging、production 的 Supabase、Worker、RevenueCat 与模型配置；secret 仅存服务端。
- [ ] **P3-02 / S1 Anonymous principal**：首次需要私有服务时创建 Supabase Anonymous User；SecureStore 持久会话；重启复用 UUID。
- [ ] **P3-03 / S2 数据与 RLS**：建立 principal、请求、额度 ledger、预留和审计记录；RLS 明确区分 anonymous/permanent。
- [ ] **P3-04 / S3 Worker 网关**：验证 JWT、schema、幂等键、超时、并发和速率；客户端不能直连模型。
- [ ] **P3-05 / S4 RevenueCat**：以 principal UUID 作为 Custom App User ID；接入购买、Restore、webhook、服务端 entitlement 校验和 transfer/alias 事件。
- [ ] **P3-06 / S5 周期额度**：以稳定商店交易身份和 entitlement 周期计数；原子预留、成功确认、失败释放。
- [ ] **P3-07 / S6 模型调用**：限制输入、输出、尺寸、重试与并发；生成结果私有存放并按期回收。
- [ ] **P3-08 结果进入作品**：用户采用结果后生成稳定 `generated://`/用户资源身份，再进入本地 Asset Catalog 与 Draft。
- [ ] **P3-09 / S7 反滥用**：匿名注册使用 Turnstile/CAPTCHA；高成本请求使用 App Attest nonce/assertion；增加 IP、principal、设备与全局预算限制。
- [ ] **P3-10 / S8 可观测性**：记录 request ID、模型、估算费用、状态、失败码、额度变化与风险事件，不记录不必要的作品内容。
- [ ] **P3-11 成本熔断**：配置单请求、单用户、每日和月度预算阈值；达到阈值时安全停止生成并保留本地创作能力。
- [ ] **P3-12 匿名清理策略**：只清理满足期限且无有效订阅、额度账本、生成结果或待处理任务的匿名 user。
- [ ] **P3-13 / S9 发布验证**：完成 Sandbox 订阅、重装 Restore、同周期额度延续、并发、伪造请求、模型失败和预算熔断演练。
- [ ] **P3-14 隐私与审核资料**：更新隐私政策、App Privacy、订阅说明、审核路径与支持资料。

### 完成标准

- Worker 不信任客户端 CustomerInfo、principalId 或剩余次数；
- 重复/并发请求不会超扣或重复生成；
- 重装后 Restore 不重置同一订阅周期已使用次数；
- 模型或服务端不可用时，本地保存、编辑和导出继续工作；
- 匿名身份可在后续链接为正式身份。

### 阶段门 G3 / `1.0` 发布门

P3-01 至 P3-14、订阅 Sandbox 矩阵、真实 iOS 设备 App Attest 和成本熔断演练全部通过后，才能发布含订阅与 AIGC 的 `1.0`。

## 7. P1-B：远端内容动态发布平台（`1.x`）

### 目标

在 Expo / React Native `1.0` 稳定发布后，先支持素材包，再支持与旧 App 能力兼容的声明式模板免发版新增、修改、隐藏、恢复与回滚；不改变 Draft 的 stable ID + revision 契约，也不承担账号、权益或用户数据职责。动态模板仍是创作页功能，首页运营配置只可引用其入口或预览。

### 前置依赖

- G3 已通过且 1.0 已发布；P1-A 的下载、缓存与历史作品恢复以及 P1-T 的本地模板实例化已在生产环境稳定。

### 待办

- [ ] **P1-B01 动态素材目录 schema**：冻结 `manifest.json`、`pack.json`、状态、schemaVersion、revision、hash、兼容期和未知版本回退策略。
- [ ] **P1-B02 素材发布工具链**：从审核源生成单包清单、尺寸、hash 和全量索引，拒绝重复 ID、缺失资源、非法路径及未提升 revision 的不兼容变更。
- [ ] **P1-B03 环境与回滚**：建立 staging/production CDN 根地址、缓存头、ETag、不可变 manifest 历史、发布前验证和一键回滚步骤。
- [ ] **P1-B04 增量素材目录 Provider**：在 `apps/mobile` 启动时先用 App bundle/验证缓存，后台条件请求目录并只合并通过校验的变更包；共享 pack 映射通过 `packages/asset-system` 暴露，不实现 Swift 平行目录。
- [ ] **P1-B05 上下架与历史兼容**：hidden/retired 不再向新用户展示；兼容保留期内继续提供历史 revision，旧作品不得静默替换素材。
- [ ] **P1-B06 状态与观测**：提供更新、离线、失败、不可用和手动重试状态；记录匿名刷新、下载、校验和错误指标，不记录作品内容。
- [ ] **P1-B07 素材发布演练**：覆盖 304、schema 升级、包更新、上下架、manifest 回滚和旧 App/旧作品兼容，并完成真机免发版可见验证。
- [ ] **P1-B08 动态模板目录 schema**：在素材动态目录稳定后，为模板增加独立 manifest，定义 templateRevision、preview hash、依赖闭包、`minAppVersion`、`requiredCapabilities`、hidden/retired、历史保留和未知 schema 回退；禁止脚本和远端业务逻辑。
- [ ] **P1-B09 动态模板发布与门控**：复用 P1-T 编译器生成声明式模板，发布前验证全部依赖与客户端能力；旧 App 自动忽略不兼容模板，已实例化作品不依赖模板继续在线。
- [ ] **P1-B10 动态模板回滚演练**：覆盖新增、修改、隐藏、旧 revision 保留、依赖素材下架冲突、manifest 回滚、旧 App 兼容和真机创作页免发版可见验证。

### 阶段门 G1-B

staging/production 发布与回滚演练、旧 Expo App/旧作品兼容和 React Native iOS 真机免发版更新全部通过后，才能把相应动态目录作为 `1.x` 用户能力发布。P1-B01～P1-B07 可先发布动态素材，P1-B08～P1-B10 通过后再发布动态模板。P1-B 不阻塞 P4 的方案设计，但 G1-B 通过后才进入 P4 实施；账号和云备份不得假设未通过 G1-B 的动态内容可永久解析。

## 8. P4：显式账号与身份链接

### 目标

上线 Apple 与 Email OTP 登录，将无感身份安全升级或切换为可跨设备恢复的永久账号，为云备份提供 owner。

### 非目标

- 不做密码、手机号、社交主页、团队或多人协作；
- 不在账号发布前承诺云端作品已上传。

### 前置依赖

- G3 已通过；账号隐私、删除和身份冲突规则已完成产品/法务复核。

### 待办

- [ ] **P4-01 登录契约**：定义 anonymous、linking、signed-in、switching、expired 和 deleting 状态。
- [ ] **P4-02 Sign in with Apple**：配置原生能力、nonce、回调、隐藏邮箱和凭证撤销处理。
- [ ] **P4-03 Email OTP**：配置邮件、验证码、速率、失败与账号恢复流程。
- [ ] **P4-04 同身份升级**：当前 anonymous user 链接 Apple/Email 时保持 Supabase user ID 不变。
- [ ] **P4-05 已有账号登录**：定义当前匿名数据与已有 permanent user 的切换、保留和显式合并流程。
- [ ] **P4-06 RevenueCat 迁移**：同 ID 不切换；不同 ID 使用 `logIn()` 与冻结的 transfer/alias 策略，刷新服务端 entitlement。
- [ ] **P4-07 会话生命周期**：覆盖 SecureStore、refresh、撤销、过期、离线和多设备会话。
- [ ] **P4-08 My Studio 账号 UI**：登录价值、账号状态、退出、支持、隐私和数据管理入口。
- [ ] **P4-09 账号删除**：App 内发起，覆盖 Auth 和现阶段服务端数据；明确 App Store 订阅需单独取消。
- [ ] **P4-10 审核与测试**：提供审核路径或 demo mode，覆盖 Apple/Email、切换账号、删除和 RevenueCat 迁移矩阵。

### 完成标准

- 同设备身份链接不丢订阅、额度或本地作品；
- 登录已有账号不会静默覆盖当前本地数据；
- 退出登录不删除本地作品；
- 删除账号可验证完成且不声称取消商店订阅。

### 阶段门 G4

账号创建、链接、切换、退出、撤销和删除全链路通过后，才能让账号拥有云端作品。

## 9. P5：云备份

### 目标

将明确保存的本地作品可靠备份到账号下，网络或服务失败不影响本地创作。

### 非目标

- 不承诺实时同步；
- 不自动合并多设备修改；
- 不默认上传 App 内导出结果。

### 前置依赖

- G0 与 G4 已通过；服务端容量、保留期、免费/Premium 配额和隐私政策已冻结。

### 待办

- [ ] **P5-01 云端 schema**：建立 profiles、devices、projects、revisions、user_assets、backup_jobs 与必要索引/RLS。
- [ ] **P5-02 R2 私有命名与生命周期**：定义用户、project、revision、asset、thumbnail 路径和回收规则。
- [ ] **P5-03 签名上传 API**：Worker 验证 JWT、owner、配额、MIME、大小、hash 和请求期限。
- [ ] **P5-04 本地持久队列**：任务在断网、App 退出和重启后可以继续；状态与错误可观察。
- [ ] **P5-05 资源清单与去重**：仅上传缺失的用户资源；内置/远程素材保留稳定引用。
- [ ] **P5-06 原子 revision 提交**：所有依赖资源有效后才能更新 latest revision；失败不暴露半成品。
- [ ] **P5-07 触发策略**：明确保存后排队；前后台和网络恢复时继续；提供 Back Up Now。
- [ ] **P5-08 状态 UI**：显示 local-only、queued、uploading、waiting-for-wifi、backed-up、failed 和 retry。
- [ ] **P5-09 配额与到期**：服务端执行免费/Premium 空间、作品数和订阅到期只读保留策略。
- [ ] **P5-10 删除与回收**：软删除、保留期、账号删除和孤立 R2 对象回收可审计、可重试。
- [ ] **P5-11 监控与告警**：成功率、延迟、流量、容量、孤立文件、失败码和成本阈值。
- [ ] **P5-12 故障演练**：断网、杀 App、重复上传、签名过期、部分成功、数据库失败和服务回滚。

### 完成标准

- 云端确认前只显示本地保存；
- 不存在引用缺失用户资产的完成 revision；
- 重复任务幂等且不会重复计费/占用；
- 服务端故障不阻塞本地作品使用；
- 用户能够理解并处理每种备份状态。

### 阶段门 G5 / 账号 + 云备份发布门

真实多尺寸作品连续备份、失败恢复、配额和删除演练全部通过后，才能公开 Cloud Backup。

## 10. P6：跨设备恢复

### 目标

让用户在新设备登录后查看云端作品并按需恢复为完整、可编辑的本地作品。

### 非目标

- 不进行实时自动同步；
- 不自动合并两台设备的编辑结果；
- 不预下载全部用户原图。

### 前置依赖

- G5 已通过；Portable Project migration 和资源签名下载稳定。

### 待办

- [ ] **P6-01 云端作品索引**：分页拉取元数据、状态和缩略图，不加载完整作品。
- [ ] **P6-02 本地/云端合并列表**：用 project ID 和 revision 区分 local、cloud-only、downloaded 和 newer-in-cloud。
- [ ] **P6-03 按需恢复任务**：持久化下载状态，支持暂停、重试、签名刷新和磁盘空间检查。
- [ ] **P6-04 文档与资源校验**：先校验 schema、migration、hash 与完整性，再创建本地草稿。
- [ ] **P6-05 Asset Catalog 重建**：下载用户资源，重新解析内置/远程素材，生成当前设备 URI。
- [ ] **P6-06 原子本地落盘**：所有必需资源可用后才将作品标为可打开；失败清理临时文件。
- [ ] **P6-07 缓存边界**：云端缩略图可清理；已恢复的用户资源转为作品数据，不能由缓存清理删除。
- [ ] **P6-08 用户体验**：显示下载进度、空间不足、网络失败、旧版本不可用和重试。
- [ ] **P6-09 新设备验收**：在干净安装的 iPhone/iPad 上恢复多类真实作品并继续编辑、保存、导出和再次备份。
- [ ] **P6-10 安全测试**：跨用户对象访问、过期签名、删除中项目和撤销账号均被拒绝。

### 完成标准

- 新设备无需旧沙盒路径即可完整恢复作品；
- 缺失或损坏文件不会生成可编辑的半成品；
- 恢复后的渲染和导出与源版本一致；
- 清理缓存不会破坏恢复后的作品。

### 阶段门 G6 / 跨设备恢复发布门

干净设备、弱网、空间不足、迁移和跨用户访问测试全部通过后，才能宣传 Restore on another device。

## 11. P7：自动同步、冲突与版本历史

### 目标

在备份/恢复基础上增加多设备自动增量同步，任何冲突都不静默覆盖用户作品。

### 非目标

- 不做实时多人协作；
- 第一阶段不做图层级自动合并；
- 不上传每次手势操作。

### 前置依赖

- G6 已通过；revision、device、冲突保留期限和版本配额已冻结。

### 待办

- [ ] **P7-01 同步状态机**：定义 clean、dirty、uploading、newer-remote、conflict、deleted 与 error。
- [ ] **P7-02 Base revision**：本地编辑记录来源 revision；服务端使用条件提交拒绝过期覆盖。
- [ ] **P7-03 增量调度**：稳定检查点触发同步，不对每次手势或文字输入请求云端。
- [ ] **P7-04 远端变更发现**：前台、手动刷新和推送/轮询策略在实现阶段选型并可降级。
- [ ] **P7-05 冲突副本**：检测并保留当前设备与云端两个版本，记录来源设备和时间。
- [ ] **P7-06 冲突 UI**：允许预览、重命名、保留和删除，不使用含糊的“自动合并成功”。
- [ ] **P7-07 删除同步**：使用 tombstone、保留期和确认语义，避免离线旧设备复活已删除作品。
- [ ] **P7-08 版本历史**：按权益控制数量/期限；恢复历史版本创建新 revision，不改写历史。
- [ ] **P7-09 多设备矩阵**：iPhone/iPad/后续 Android 的离线编辑、同时保存、删除、恢复和账号切换。
- [ ] **P7-10 运维与回滚**：同步功能具备远程停止、只读降级、指标告警和 schema 回滚策略。

### 完成标准

- 过期设备不能静默覆盖新 revision；
- 冲突始终产生可恢复副本；
- 删除、恢复和历史版本行为可解释、可审计；
- 服务异常时自动降级为本地保存与稍后同步。

### 阶段门 G7 / 自动同步发布门

连续多设备冲突、离线、删除和版本恢复演练通过后，才能使用 `Sync across devices` 和 `Up to date` 等产品文案。

## 11. 跨阶段阻塞条件

遇到以下任一条件，停止进入下一阶段：

- 作品重建或导出与源作品不一致；
- 仍存在无法分类所有权的文件或缓存；
- 客户端可以绕过 Worker 直接使用付费模型；
- 服务端根据客户端自报 entitlement 或次数授权；
- 同一请求可能重复扣次数或重复调用模型；
- Restore Purchases 可造成同周期次数重置；
- 匿名身份无法确定地升级/切换到正式账号；
- 云端 revision 可能引用未完成上传的资源；
- 多设备修改可能静默覆盖；
- 删除账号、作品或资源的范围无法解释和审计；
- 生产成本没有限额、熔断或告警。

## 12. 执行记录模板

每次开始一个任务时，在该任务的实现文档或 PR/提交说明中记录：

```text
Task: P3-06 周期额度
Status: [~]
Scope: 本轮包含什么
Out of scope: 本轮不包含什么
Dependencies: 已满足的前置项
Decisions: 新增或改变的决策
Verification: 自动化测试、真机测试、后台证据
Open risks: 未解决风险
Next task: 通过后允许进入的任务
```

若任务改变上位架构或产品承诺，必须先更新 `ACCOUNT_SUBSCRIPTION_CLOUD_ROADMAP.md`，再继续实现。
