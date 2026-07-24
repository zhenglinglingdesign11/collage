# Sprite Cutter

本地素材处理小工具：批量上传素材图，自动识别每张图里的独立 sprite，预览检测框，并按 `source-assets/packs` 的素材包结构导出。

## 使用

直接用浏览器打开：

```text
tools/sprite-cutter/index.html
```

也可以从项目根目录启动一个本地静态服务：

```powershell
python -m http.server 5178
```

然后打开：

```text
http://localhost:5178/tools/sprite-cutter/
```

## 参数

- `背景模式`：透明 PNG 用 `透明通道`；JPG 或纯色背景图用 `四角背景色`；不确定时用 `自动`。
- `Alpha 阈值`：透明图里像素 alpha 高于该值会被认为是前景。
- `背景容差`：纯色背景图里，像素颜色和四角背景色差异超过该值会被认为是前景。
- `最小面积`：过滤小噪点。
- `合并距离`：将距离很近的碎片合并为同一个 sprite。
- `导出留白`：每个切片四周额外保留的透明边距。
- `封面质量`：将原图压缩为 `pack-sheet.jpg` 时使用的 JPEG 质量。
- 切片会按原像素尺寸导出透明 PNG，不改变尺寸。

## 保存

现代 Chromium 浏览器会优先弹出文件夹选择器。请选择：

```text
E:\codexproject\手账\source-assets\packs
```

工具会把每张原图的选中 sprite 保存为项目素材包结构：

```text
source-assets/packs/
  stickers-sheet-a/
    pack-sheet.jpg
    items/
      1.png
      2.png
  stickers-sheet-b/
    pack-sheet.jpg
    items/
      1.png
      2.png
```

原图文件名会作为素材包文件夹名。建议上传前把原图命名成最终的 `pack-id`，例如：

```text
jiaodai.png -> source-assets/packs/jiaodai/
```

处理完成后，运行一键处理脚本：

```powershell
cd E:\codexproject\手账
node tools\sprite-cutter\process-asset-packs.js
```

它会依次执行：

```text
压缩 source-assets/packs/**/pack-sheet.jpg
压缩 source-assets/packs/**/items/*.png
重新生成 miniprogram-spike/miniprogram/config/assets/packs/*.js
```

如果使用的浏览器不支持文件夹写入，会退回逐个下载 PNG，无法自动创建 `pack-sheet.jpg + items/` 目录结构。

说明：浏览器导出后，一键脚本会继续处理已有的 `pack-sheet.jpg` 和 `items/*.png`。封面 JPG 默认会压到 `512px` 宽并按比例缩放，同时压缩体积；切片 PNG 只压缩体积，不改变尺寸。

## PNG 体积压缩

推荐直接使用一键脚本：

```powershell
# 处理全部素材包
node tools\sprite-cutter\process-asset-packs.js

# 只处理某个素材包
node tools\sprite-cutter\process-asset-packs.js --pack=jiaodai

# 只预览会处理哪些 PNG，不写文件，不重新生成配置
node tools\sprite-cutter\process-asset-packs.js --dry-run

# 调整封面 JPG 压缩质量
node tools\sprite-cutter\process-asset-packs.js --jpg-quality=78

# 调整封面 JPG 最大宽度
node tools\sprite-cutter\process-asset-packs.js --jpg-max-width=1200

# 跳过封面 JPG，只压缩切片 PNG
node tools\sprite-cutter\process-asset-packs.js --skip-jpg

# 跳过切片 PNG，只压缩封面 JPG
node tools\sprite-cutter\process-asset-packs.js --skip-png
```

一键脚本默认使用远程素材根地址：

```text
https://assets.zllarchi.site/packs
```

如需覆盖：

```powershell
node tools\sprite-cutter\process-asset-packs.js --base-url-root=https://assets.zllarchi.site/packs
```

也可以单独运行素材压缩脚本。

导出素材包后，在项目根目录运行：

```powershell
node tools\sprite-cutter\compress-png-items.js
```

脚本默认扫描：

```text
source-assets/packs/**/pack-sheet.jpg
source-assets/packs/**/items/*.png
```

它会自动选择本机可用的 PNG 压缩器，优先级为 `pngquant` -> `oxipng` -> `sharp`；JPG 封面使用 `sharp` 压到默认 `512px` 宽并压缩体积。PNG 切片不会改变尺寸。

常用命令：

```powershell
# 只预览会处理哪些文件
node tools\sprite-cutter\compress-png-items.js --dry-run

# 只压缩某一个素材包
node tools\sprite-cutter\compress-png-items.js --pack=jiaodai

# 指定使用 pngquant，有损压缩，体积通常更小
node tools\sprite-cutter\compress-png-items.js --engine=pngquant --quality=65-90

# 指定使用 oxipng，无损压缩，体积下降较温和
node tools\sprite-cutter\compress-png-items.js --engine=oxipng --oxipng-level=4

# 调整封面 JPG 压缩质量
node tools\sprite-cutter\compress-png-items.js --jpg-quality=78

# 调整封面 JPG 最大宽度
node tools\sprite-cutter\compress-png-items.js --jpg-max-width=1200
```

如果脚本提示找不到压缩器，需要先在本机安装其中一个：`pngquant`、`oxipng` 或 Node 模块 `sharp`。

如果 `pack-sheet.jpg` 正被图片查看器、浏览器或同步工具占用，脚本会保留原文件，并在同目录写出 `pack-sheet.optimized.jpg`。关闭占用后，可以手动用它替换 `pack-sheet.jpg`。
