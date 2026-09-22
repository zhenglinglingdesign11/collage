# P1-T00 首发模板真实审计与冻结

冻结日期：2026-09-20  
状态：`ready`，等待 P1-A03 内容目录编译与 P1-T02 Recipe 编译。  
契约：[TEMPLATE_CONTRACT_P1_T00.md](TEMPLATE_CONTRACT_P1_T00.md)

本清单冻结首发四个模板的身份、组成与依赖闭包。`source-assets` 路径仅为构建期输入；客户端模板和保存的 Draft 只使用下列 `asset://pack/...` 稳定引用。所有引用 revision 均为 `1`；实际内容变更必须创建新 revision，不能原地替换。

## 共同规则

- 模板状态：`ready`；`requiredCapabilities`：`image.replace`、`image.crop`、`material.resolve`、`material.replace`。
- 无 `textSlots`。成品中的英文、日期与手写字均是固定素材的一部分。
- 每一个照片槽位均为必填；替换后允许裁剪和缩放。视觉参考中的初始旋转须保留。
- 本次将已列出的装饰冻结为 `materialSlots`：点击替换时直接打开其 `replacementPackId`，默认允许选择该包内任意 item；仅替换素材引用，保留位置、尺寸、旋转、层级、透明度和效果。非列出的背景色及不可见版式辅助层仍是锁定固定图层。
- 模板预览使用 `asset://pack/template-previews/{template-slug}`；P1-A03 负责将参考 PNG 纳入首发内容目录并提供 bundle/Resolver 回退。

## `template://journalcollage/romantic-deco`

- 参考：`source-assets/配方模版/romantic deco.png`，画布 `1254 × 1254`。
- 照片槽位：`hero-photo`，1 个必填竖向照片；审计显示区域为 `x: 221, y: 178, width: 812, height: 874`，无初始旋转。
- 固定素材依赖：

| 构建期输入 | 冻结稳定引用 |
| --- | --- |
| `new导出素材/Romantic Deco-Lace Frame(1)/items/9_2.png` | `asset://pack/romantic-deco-lace-frame-1/9` revision `2` |
| `packs/hudiejie/items/13.png` | `asset://pack/hudiejie/13` |

## `template://journalcollage/romantic-deco-two-photo`

- 参考：`source-assets/配方模版/romantic deco-1.png`，画布 `1024 × 1536`。
- 照片槽位：`upper-photo` 与 `lower-photo`，均必填。上方是正向相框照片；下方保留参考图中的非零初始旋转。P1-T02 必须以视觉对比固定该 transform 数值，不能将第二张图自动归正。
- 固定素材依赖：

| 构建期输入 | 冻结稳定引用 |
| --- | --- |
| `new导出素材/Decorative-&-Statement-Lace（1）/items/2.png` | `asset://pack/decorative-statement-lace-1/2` |
| `new导出素材/Essential-Lace-Trims/items/3.png` | `asset://pack/essential-lace-trims/3` |
| `new导出素材/Pixel & ASCII（还没封面图）/items/7.png` | `asset://pack/pixel-ascii/7` |

## `template://journalcollage/play-pop`

- 参考：`source-assets/配方模版/play pop.png`，画布 `1024 × 1536`。
- 照片槽位：`hero-photo`，1 个必填竖向照片；审计显示区域为 `x: 216, y: 310, width: 600, height: 888`，无初始旋转。
- 固定素材依赖：

| 构建期输入 | 冻结稳定引用 |
| --- | --- |
| `new导出素材/Candy-Shapes/items/{4,6,1,5,3}.png` | `asset://pack/candy-shapes/{4,6,1,5,3}` |
| `new导出素材/Playful Doodles（还没有封面部分像素优化）/items/{3,11,2,9,14,12}.png` | `asset://pack/playful-doodles/{3,11,2,9,14,12}` |

## `template://journalcollage/soft-archive`

- 参考：`source-assets/配方模版/soft archive.png`，画布 `1024 × 1536`。
- 照片槽位：`hero-photo`，1 个必填竖向照片；审计显示区域为 `x: 264, y: 310, width: 496, height: 650`，无初始旋转。
- 固定素材依赖：

| 构建期输入 | 冻结稳定引用 |
| --- | --- |
| `new导出素材/soft archive blue/items/{30,18,8}.png` | `asset://pack/soft-archive-blue/{30,18,8}` |
| `new导出素材/Editorial-&-Everyday-Labels/items/20.png` | `asset://pack/editorial-everyday-labels/20` |
| `packs/jiaodai/items/{29,31}.png` | `asset://pack/jiaodai/{29,31}` |

## P1-A03 的编译输入与拒绝条件

P1-A03 必须从此清单收集四个预览和全部固定素材，生成有 hash、字节数、像素尺寸、revision 与 Resolver 映射的冻结内容目录。以下任一条件不满足即拒绝编译：

- 某个模板预览或固定素材在声明的本地构建输入或远端 URL 不存在、非 PNG、未处理完成，或没有确定的 pack/item ID；
- 任一 `asset://pack/...` 引用缺少 revision 或解析到运行时 URL/本地路径；
- 模板预览或固定依赖未进入首发离线/远端恢复策略；
- 有模板使用未声明的抠图、描边、撕边、动画或文字编辑能力。
