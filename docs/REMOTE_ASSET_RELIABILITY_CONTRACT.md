# JournalCollage Expo / React Native 1.0 远程素材可靠性契约

> Schema: `journalcollage.remote-asset-integrity`
> Contract version: `1`
> Status: frozen for P1-A01
> Updated: 2026-09-15
> Scope: Expo / React Native iOS `1.0` 冻结素材目录的可靠解析、下载、校验与缓存恢复

## 1. 目的与边界

本契约保证 Expo / React Native iOS `1.0` 已发布目录中的远程素材，在网络可用、离线、下载失败、缓存清理和 CDN 故障时都有确定行为。它定义产品素材的稳定身份、revision、完整性元数据、缓存记录和错误码。实现仅位于 `apps/mobile`、`packages/asset-system` 与 `packages/editor-core`；旧 `iosproject` 不在本契约的实现范围内。

它不定义免发版新增/修改/隐藏素材包；该能力属于 `P1-B`，必须在 `1.0` 发布后另行实现。它也不定义用户资源、账号、订阅、云备份、签名 URL 或任何可执行远端内容。

## 2. 不变量

1. Draft 与 Portable Project 只保存 `asset://pack/{packId}/{itemId}`、`kind: "image"` 和 item `revision`；不得保存 CDN URL、缓存路径、ETag、hash 或下载状态。
2. `packId` 和 `itemId` 一经发布不可重用。删除、替换或改名后，旧身份仍表示旧素材，不能指向不同内容。
3. 相同 `(reference.id, kind, revision)` 的有效字节、MIME 类型、像素尺寸和渲染语义不可改变。任何不兼容变化必须创建新 revision。
4. App bundle 与远端目录均可提供同一 revision 的素材；两者必须通过同一份完整性元数据验证。校验失败的文件不能进入可用缓存。
5. 缓存是可再生数据。清理缓存不得删除用户资源，且不能使已保存作品静默改用其他素材或其他 revision。
6. 远端素材元数据只描述图片与声明式显示信息，不能授予 Premium 权益、改变功能逻辑或下发可执行代码。
7. 进入 P1-A Resolver 前，旧 Draft 中缺失 revision 的远程素材引用必须由 migration 根据冻结目录唯一补齐；无法唯一确定时返回 `asset-reference-invalid`，不得猜测为当前或最新 revision。

## 3. 稳定身份和 revision

### 3.1 ID 语法

`packId` 和 `itemId` 使用小写 ASCII 字母、数字和连字符，且以字母或数字开始、结束：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

当前已存在的无连字符 ID（例如 `blue03`、`zhenzhi01`）符合该规则。素材制作目录中的 `items/<fileName>` 以扩展名前的文件名为 `itemId`；例如 `items/24.png` 对应 `asset://pack/blue03/24`。禁止以显示名称、数组下标或本地路径作为身份。

### 3.2 Revision

- pack 与 item revision 都是非空十进制字符串，初始值为 `"1"`，后续严格递增；不得使用日期、Git SHA 或 `latest`。
- **item revision** 决定 Draft 引用的兼容性。图片像素、透明度、MIME、像素尺寸、视觉边界或任何会改变历史作品渲染结果的变化，必须递增 item revision。
- **pack revision** 决定包级目录元数据：名称、分类、色调、封面、可见 item 集合和排序。包级变更必须递增 pack revision；仅某个 item 的变更同时递增该 item revision 和所属 pack revision。
- 只改善传输编码而能够证明解码后 RGBA 像素、尺寸和 alpha 完全相同，可以维持 item revision；但 SHA-256 仍会改变，因此 1.0 中默认将此类变化也视为新 item revision，避免跨平台解码差异。
- 新增 item 不改变既有 item revision，但必须递增 pack revision。隐藏、retire 或恢复既有 item 也必须递增 pack revision。

## 4. 1.0 发布目录与完整性清单

每个 Expo / React Native iOS `1.0` 构建产出一份随 App bundle 交付的冻结目录及完整性清单。该清单是当前版本允许解析的唯一产品素材集合；它可以包含远端 URL，但 URL 只是 resolver 输入，不是文档身份。

逻辑结构如下：

```ts
type RemoteAssetIntegrityManifestV1 = Readonly<{
  format: 'journalcollage.remote-asset-integrity';
  formatVersion: 1;
  catalogRevision: string;
  assets: readonly Readonly<{
    reference: Readonly<{
      id: `asset://pack/${string}/${string}`;
      kind: 'image';
      revision: string;
    }>;
    packId: string;
    packRevision: string;
    mimeType: 'image/png' | 'image/jpeg';
    byteLength: number;
    sha256: string;
    pixelSize: Readonly<{ width: number; height: number }>;
    source: Readonly<{ url: string }>;
  }>;
}>;
```

规则：

- `catalogRevision` 是构建产物身份，只用于诊断与审计；它不替代 pack/item revision。
- 每个 `(reference.id, kind, revision)` 在清单中只出现一次；每个 `source.url` 必须为 HTTPS、位于获准素材域名且无凭证、签名参数或用户标识。
- `sha256` 是原始响应字节的 64 位小写十六进制 SHA-256；`byteLength` 是相同字节长度。校验不依赖 `Content-Length` 响应头。
- `pixelSize` 由解码后的图片头或像素数据验证；不接受 SVG、GIF、WebP、重定向后的非图片内容或未声明 MIME 类型。
- `source.url` 在 `1.0` 的语义是固定 revision 的地址。CDN 绝不能用同一 URL 返回不同 revision 的内容；推荐文件名含 content hash，且设置 immutable 缓存策略。

## 5. 缓存记录和写入协议

远端素材缓存索引属于 App 私有可清理数据。逻辑记录：

```ts
type VerifiedRemoteAssetCacheRecordV1 = Readonly<{
  formatVersion: 1;
  reference: Readonly<{ id: string; kind: 'image'; revision: string }>;
  packRevision: string;
  mimeType: 'image/png' | 'image/jpeg';
  byteLength: number;
  sha256: string;
  pixelSize: Readonly<{ width: number; height: number }>;
  relativePath: string;
  verifiedAt: string;
  lastAccessedAt: string;
}>;
```

- 缓存 key 是 `(reference.id, kind, revision, sha256)`；`relativePath` 必须在远端缓存根目录内，不能含 `..`、绝对路径或 URI。
- 下载先写入同一卷的临时文件；完成 hash、字节数、MIME 和尺寸验证后，再原子移动到正式位置并原子更新索引。
- 任一验证、取消、磁盘不足或写入失败时删除临时文件，不产生可用缓存记录。
- 读取缓存前重新确认记录与冻结清单的 reference、revision、hash、尺寸和 MIME 完全相等；不相等即视为缓存无效并可清理。
- 相同 key 的并发请求共用一个下载任务；取消一个等待者不得取消仍有消费者的任务。
- `lastAccessedAt` 可更新，但其失败不得使已经验证的素材不可用。

## 6. 解析与恢复顺序

给定 Draft 的稳定引用，Resolver 只能寻找**精确相同**的 item revision：

```text
已验证的当前设备 Catalog 记录
  → 已验证的远端素材缓存
  → 同 revision 的 App bundle 基础素材
  → 冻结完整性清单中的同 revision HTTPS 下载
  → 确定失败
```

Resolver 不得降级到同一 item 的较新 revision、较旧 revision、相似文件名或其他包。网络失败时可继续返回已验证缓存或 App bundle 文件；若两者均不存在，返回错误状态而非空白替代图作为成功结果。

## 7. 稳定错误码

| 错误码 | 含义 | 恢复行为 |
| --- | --- | --- |
| `asset-reference-invalid` | Draft 引用不符合稳定素材身份或 revision 缺失 | 拒绝解析；保留作品，不修改 Draft |
| `asset-revision-unavailable` | App bundle 与冻结清单都没有该精确 revision | 显示不可用；不得替换素材 |
| `asset-offline-unavailable` | 无网络且本地没有已验证文件 | 显示离线提示并允许稍后重试 |
| `asset-download-failed` | 网络、TLS、超时或 HTTP 非 2xx 失败 | 保留旧缓存；允许有限重试 |
| `asset-content-type-invalid` | 响应 MIME 或图片格式不符合清单 | 丢弃临时文件，记录诊断 |
| `asset-size-mismatch` | 字节长度或像素尺寸不匹配 | 丢弃临时文件，停止使用该响应 |
| `asset-hash-mismatch` | SHA-256 与清单不符 | 丢弃临时文件，视为完整性故障 |
| `asset-cache-write-failed` | 磁盘空间、权限或原子写入失败 | 不写缓存；若内存/App bundle 已有文件可继续本次显示 |
| `asset-cache-record-invalid` | 缓存索引或路径不安全/不一致 | 删除该记录与对应可清理文件后重新解析 |

用户界面只展示“素材暂不可用”“离线时无法下载素材”及可操作的重试提示；诊断日志可保存错误码、HTTP 类别和 reference，不保存用户作品内容或本地绝对路径。

## 8. P1-A02 实施验收输入

`source-assets/packs/blue03` 和 `source-assets/packs/zhenzhi01` 是 P1-A02 的真实测试候选。它们在通过生成、ID/revision、尺寸和 hash 校验前，不自动成为 1.0 冻结目录的一部分。

P1-A02 必须至少证明：同一素材并发请求只下载一次、篡改字节触发 `asset-hash-mismatch`、中途失败没有残留有效缓存记录、以及已验证文件可以在离线时解析。下载、校验、并发与错误策略属于 `packages/asset-system`；Expo 文件系统、网络和原子落盘能力由 `apps/mobile` 适配，不能在 `iosproject` 建立平行实现。
