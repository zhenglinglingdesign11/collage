# Font Subset

把中文大字体压成适合小程序远程加载的子集字体。脚本不上传字体，只在本地调用 `fontTools.subset`。

## 准备

脚本会按顺序寻找：

1. `pyftsubset`
2. `python -m fontTools.subset`
3. Codex 内置 Python

如果都不可用，安装：

```powershell
python -m pip install fonttools
```

如果要输出 `woff2`，还需要：

```powershell
python -m pip install brotli
```

当前 Codex 内置 Python 已有 `fontTools`，但没有 `brotli`，所以默认建议先输出原格式子集。

## 常用命令

处理单个字体：

```powershell
node tools\font-subset\subset-fonts.js --input "source-assets\fonts\汇文明朝体\汇文明朝体.otf"
```

扫描并处理 `source-assets/fonts` 下大于 8MB 的字体：

```powershell
node tools\font-subset\subset-fonts.js --all-large
```

只预览会执行什么命令：

```powershell
node tools\font-subset\subset-fonts.js --all-large --dry-run
```

输出 `woff2`：

```powershell
node tools\font-subset\subset-fonts.js --input "source-assets\fonts\汇文明朝体\汇文明朝体.otf" --format woff2
```

## 字符策略

默认使用：

```text
tools/font-subset/common-chars.txt
```

这是一个轻量字符表，适合手账、标题、短句。缺字时直接把常用字追加到这个文件后重新运行。

如果要覆盖日常中文输入，建议使用 GB2312 一级常用汉字：

```powershell
node tools\font-subset\subset-fonts.js --input "source-assets\fonts\汇文明朝体\汇文明朝体.otf" --preset gb2312-level1
```

如果想更保守，保留 GB2312 全集，可以用：

```powershell
node tools\font-subset\subset-fonts.js --input "source-assets\fonts\汇文明朝体\汇文明朝体.otf" --preset gb2312
```

如果想最大化覆盖，保留 CJK 基本区，可以用：

```powershell
node tools\font-subset\subset-fonts.js --input "source-assets\fonts\汇文明朝体\汇文明朝体.otf" --preset cjk-basic
```

`cjk-basic` 体积会非常大；小程序端优先使用 `gb2312-level1`。

## 输出

默认输出到：

```text
source-assets/fonts-dist/<字体文件夹>/<原文件名>-subset.<原扩展名>
```

这些输出文件再上传到 Cloudflare，并在 `miniprogram-spike/miniprogram/config/font-table.js` 中引用。
