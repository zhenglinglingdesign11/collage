# 手账拼贴小程序 Spike

这是用于验证小程序编辑器可行性的原生微信小程序 Spike 工程。

## 验证目标

- `canvas` 渲染 Draft / Layer。
- 从相册添加图片。
- 点击选中、单指拖动、双指缩放旋转。
- 添加胶带、纸片和文字。
- 保存 / 恢复 Draft JSON。
- 导出图片并保存到相册。

## 使用方式

1. 使用微信开发者工具打开本目录。
2. 入口页面为 `pages/spike-editor/index`。
3. 建议在真机上重点验证触控、导出和图片路径恢复。

## 关键文件

- `miniprogram/pages/spike-editor/index.js`：页面状态、触控手势、导出流程。
- `miniprogram/utils/renderer.js`：Canvas 渲染、命中检测、Draft 默认值。
- `miniprogram/utils/draft-store.js`：本地草稿保存与恢复。

## 生成素材包配置

素材包配置位于 `miniprogram/config/assets/packs/*.js`。远程素材的本地源文件放在仓库根目录的 `source-assets` 下，不会进入小程序包。

素材包按以下结构放置：

```text
../source-assets/
  packs/
    <pack-id>/
      pack-sheet.jpg
      items/
        1.png
        2.png
  fonts/
    Gemini-Regular.otf
    Kelsi-Regular.otf
```

生成单个素材包配置：

```bash
node scripts/generate-asset-pack-config.js --pack=papers --name=复古纸张 --category=纸张 --tone=#f3f1ec
```

COS / Cloudflare R2 / CDN 使用 `--base-url-root` 批量生成 `baseUrl`。当前素材主方案是 COS：

```bash
node scripts/generate-asset-pack-config.js --base-url-root=https://packs-1327435159.cos.ap-guangzhou.myqcloud.com/packs
```

后续切换 Cloudflare R2 或其他 CDN 时，只需要替换 `--base-url-root`：

```bash
node scripts/generate-asset-pack-config.js --base-url-root=https://assets.example.com/packs
```

微信云 `cloudBasePath` 仅作为备用兼容能力保留，不作为默认素材方案；当前配置文件不要主动使用 `cloudBasePath`。

不传 `--pack` 时会扫描 `../source-assets/packs` 下所有素材包目录并批量生成配置。

## 生成 COS 预签名 URL

COS 存储桶为私有读写时，可以用本地脚本生成短期 GET 预签名 URL 做调试。密钥只通过环境变量传入，不要写进小程序代码。

PowerShell 示例：

```powershell
$env:COS_SECRET_ID="你的 SecretId"
$env:COS_SECRET_KEY="你的 SecretKey"
node scripts/create-cos-presigned-url.js --key=hudiejie/items/1.png --expires=1800
```

如使用临时密钥，再额外设置：

```powershell
$env:COS_SESSION_TOKEN="临时密钥 Token"
```

脚本默认使用 `https://packs-1327435159.cos.ap-guangzhou.myqcloud.com`，可用 `--host=你的COS域名` 覆盖。
