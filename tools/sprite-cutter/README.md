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

## AI 去背景模式

复杂白底素材纸建议先用本地 `rembg` 去背景，再识别切片。

首次使用先安装依赖：

```powershell
cd E:\codexproject\手账
python -m pip install -r tools\sprite-cutter\requirements-rembg.txt
```

启动本地去背景服务：

```powershell
python tools\sprite-cutter\rembg-server.py
```

如果你的终端提示找不到 `python`，可以用 Codex 内置 Python：

```powershell
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m pip install -r tools\sprite-cutter\requirements-rembg.txt
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\sprite-cutter\rembg-server.py
```

保持这个窗口开着，再打开 Sprite Cutter。上传图片后点击：

```text
AI 去背景
```

或：

```text
批量 AI 去背景
```

前端会把图片发送到本机 `http://127.0.0.1:5180/remove-bg`，返回透明 PNG 后自动切换到 `透明通道` 模式重新识别。图片不会上传到外部服务。

AI 去背景结果只作为识别 mask 使用，不会覆盖原图。预览、封面和最终切片仍使用原图像素，只用 AI mask 决定透明区域。`rembg` 不是多物体实例分割模型，如果对象之间被阴影或半透明区域连在一起，需要继续调高 `Alpha 阈值`、降低 `合并距离` 或手动排除误识别切片。

## FastSAM 实例分割模式

如果 `rembg` 对素材纸效果不好，可以改用本地 FastSAM 实例分割。这个模式会尝试直接识别一张图里的多个独立物体，更适合素材纸切图。

首次使用先安装依赖：

```powershell
cd E:\codexproject\手账
python -m pip install -r tools\sprite-cutter\requirements-fastsam.txt
```

如果你的终端提示找不到 `python`，可以用 Codex 内置 Python：

```powershell
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m pip install -r tools\sprite-cutter\requirements-fastsam.txt
```

启动本地 FastSAM 服务：

```powershell
python tools\sprite-cutter\fastsam-server.py
```

或使用 Codex 内置 Python：

```powershell
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\sprite-cutter\fastsam-server.py
```

保持这个窗口开着，再打开 Sprite Cutter。上传图片后点击：

```text
FastSAM 分割
```

或：

```text
批量 FastSAM
```

前端会把图片发送到本机 `http://127.0.0.1:5181/segment`。FastSAM 返回的是彩色实例 mask，每种颜色代表一个物体。工具仍然不会覆盖原图：预览、封面和导出的切片都继续使用原图像素，只用实例 mask 决定哪些像素保留透明。

`FastSAM 分割` 默认基于上传的原图。若想对比 AI 去背景后的输入效果，先点击 `AI 去背景`，再点击 `抠图后 FastSAM`；这个按钮会把 rembg 生成的透明 PNG 发送给 FastSAM。两种 FastSAM 都只改变实例 mask 的来源，最终切片仍使用原图像素导出。

切换 `背景模式` 或点击 `重新识别` 会退出当前图片的 FastSAM 结果，并按当前背景模式重新识别。只有点击 `FastSAM 分割` 或 `抠图后 FastSAM` 才会重新启用 FastSAM。

第一次启动或第一次分割时，`ultralytics` 可能会自动下载 `FastSAM-s.pt` 权重，耗时取决于网络。FastSAM 服务支持这些可选参数：

```powershell
python tools\sprite-cutter\fastsam-server.py --imgsz=1024 --conf=0.25 --iou=0.9 --min-area=800
```

FastSAM 结果会先在服务端做后处理：拆分连通块、过滤过大的背景容器、优先保留完整物体 mask，并抑制内部文字/纹理碎片。常用可调参数：

- `--min-area=800`：过滤太小的碎片。识别过碎时调高；漏掉小物体时调低。
- `--max-area-ratio=0.45`：过滤面积占整图过大的 mask。
- `--max-box-area-ratio=0.55`：过滤外接框占整图过大的 mask。
- `--max-span-ratio=0.82`：过滤横向或纵向跨度过大的长条背景 mask。
- `--min-remaining-ratio=0.55`：过滤已经被更完整候选覆盖掉的大部分重复 mask。
- `--edge-grow=3`：在实例 mask 边缘附近尝试补回遗漏像素。边缘缺失时调高到 `4` 或 `5`；带入白底时调低到 `1` 或 `2`。
- `--edge-refine / --no-edge-refine`：默认开启局部颜色和纹理边缘补边。关闭后会退回简单膨胀。
- `--edge-refine-tolerance=18`：判断候选边缘像素和局部背景的颜色差异。越低越容易补边，也越容易带入背景。

如果识别过碎，可以调高 `--conf` 或 `--min-area`；如果漏识别，可以降低 `--conf` 或 `--min-area`。CPU 可以跑，但会比较慢。

## 局部混合切图

FastSAM 识别后的切片默认会开启 `局部精修边缘`。它不会重新决定物体位置，而是在每个 FastSAM 切片的小范围内估计局部背景，再只沿着实例 mask 外围补回纸边、蕾丝、毛边和浅色纹理。

- `FastSAM 补边`：请求本地 FastSAM 服务时使用，影响返回的实例 mask。
- `局部精修边缘`：浏览器生成预览和导出 PNG 时使用，影响最终透明边缘。
- `精修容差`：越低越容易补回边缘，也越容易带入白底；越高越保守。
- `去白边强度`：浏览器生成预览和导出 PNG 时使用，对所有识别模式生效，只在切片 mask 外缘附近收掉接近局部背景的浅色低纹理像素。

如果边缘仍缺失，先把 `FastSAM 补边` 调到 `4` 或 `5` 并重新分割；如果还缺，再降低 `精修容差`。如果白边过多，先调高 `去白边强度`，再调高 `精修容差` 或关闭 `局部精修边缘` 对比原始 FastSAM 结果。

## 参数

- `背景模式`：外部工具已抠好的透明 PNG 用 `透明填洞`；简单透明 PNG 可用 `透明通道`；JPG 或纯色背景图用 `四角背景色`；扫描/生成的白底素材纸用 `白底素材纸`；不确定时用 `自动`。
- `透明填洞`：用 alpha 通道识别对象，但识别时会按单个连通组件闭合断裂并填充内部镂空，适合外部抠图后带蕾丝、纸框、镂空或半透明边缘的 PNG。导出仍使用原图 alpha，不会把镂空填死，也不会把多个物体之间的大透明背景填成一块。如果 alpha 覆盖率异常高，会自动退回四角背景色识别，避免整张图变成一个对象。
- `白底素材纸`：针对白底、浅阴影、米白贴纸边缘的素材页，会结合白底估计、饱和度、亮度差、局部边缘和填洞后处理来识别对象。
- `Alpha 阈值`：透明图里像素 alpha 高于该值会被认为是前景。
- `背景容差`：纯色背景图里，像素颜色和四角背景色差异超过该值会被认为是前景。
- `最小面积`：过滤小噪点。
- `合并距离`：将距离很近的碎片合并为同一个 sprite。
- `导出留白`：每个切片四周额外保留的透明边距。
- `局部精修边缘`：FastSAM 切片导出前的局部边缘精修，只影响 FastSAM 结果。
- `精修容差`：局部精修判断边缘像素和背景差异的阈值。
- `去白边强度`：切片导出前的边缘收白强度，范围 `0-10`，`0` 表示关闭，对所有识别模式生效。通常先用 `1-3`，白边明显时再提高到 `4-8`。
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

如果 `pack-sheet.jpg` 正被图片查看器、浏览器或同步工具占用，脚本会保留原文件，并在同目录写出 `pack-sheet.optimized.jpg`。关闭占用后重跑一键命令，脚本会自动替换同名 `pack-sheet.jpg`。
