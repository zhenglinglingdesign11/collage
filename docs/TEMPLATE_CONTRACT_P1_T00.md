# P1-T00：模板最小契约与依赖规则

状态：共享数据边界与四个首发模板的真实审计均已冻结；尚未把生产侧 Recipe 编译为实际首发模板。

模板是创作页/再创作的输入，不能是首页运营卡片。它只描述新 Draft 的初始结构；保存后的 Draft 不保留模板对象、CDN URL、bundle 路径、缓存键或可执行脚本。

## 已冻结的边界

- `TemplateDefinition` 使用稳定的 `template://namespace/slug` ID 和递增十进制 revision。
- 画布、照片槽位、文字槽位、装饰素材槽位、固定图层、预览、能力要求及完整素材依赖闭包均为声明式数据。
- 照片槽位仅描述初始 frame、transform、crop 与效果；用户选择的图片在 P1-T03 才生成新的 Draft 图层与身份。
- 固定图层和装饰素材槽位不可引用 `user://` 图片；所有产品素材和字体必须是含 revision 的稳定引用，并逐一出现在 `dependencies` 中。
- 装饰素材槽位冻结 `initialAsset`、`replacementPackId` 与可选的 `allowedItemIds`。替换交互从该来源素材包打开，且只更换素材引用；位置、尺寸、旋转、层级和效果保持不变。
- 依赖只声明 `bundled` 或 `catalog-resolved` 的可用性承诺；解析到包内文件、缓存或 CDN 的具体位置属于 P1-A Resolver，不进入模板。
- `requiredCapabilities` 是已知能力的白名单。当前不接受动态玩法、远端脚本、自动抠图或尚未定义的效果能力。

## 已审计的 composition tests

以下判断来自 `source-assets/配方模版` 的合成成品图，而非猜测的生产素材 ID。视觉参考只用于冻结结构；它不能反向成为可编辑图层或素材依赖。

| 模板参考 | 画布 | 照片槽位 | 固定素材角色 | 一期能力 |
| --- | --- | --- | --- | --- |
| `romantic deco.png` | 1254 × 1254 | 1 个居中的竖向主照片 | 粉色底、蕾丝相框、蝴蝶结、玫瑰装饰 | `image.replace`、`image.crop`、`material.resolve` |
| `romantic deco-1.png` | 1024 × 1536 | 2 个照片；上方正向、下方旋转 | 蕾丝相框、横向蕾丝/缎带、像素心形点缀 | 同上；下方照片须保留初始旋转 transform |
| `play pop.png` | 1024 × 1536 | 1 个居中竖向主照片 | 撕纸底、蓝色相框、几何贴纸、手绘线条与星形 | 同上 |
| `soft archive.png` | 1024 × 1536 | 1 个居中竖向主照片 | 纸张底、格纹纸、胶带、标签和不可编辑的文字印刷素材 | 同上 |

四个模板都没有文字槽位，也不需要抠图、描边、浮起或质感效果。画面中的文字应先作为固定的印刷素材；未来若要允许编辑，再显式增加 `text.replace` 槽位。

代码测试以合成稳定引用验证上述 1/2/1/1 槽位模型、依赖闭包和运行时位置禁令；不冒充这些生产素材已经存在于已发布目录。

## 已提供的固定素材来源映射

这些是生产前的源文件映射，不能直接写入 `TemplateDefinition`；P1-A03/P1-T02 需要先把它们处理成已发布素材包 item，再替换为稳定的 `asset://pack/...` 引用和 revision。

| 模板 | 已确认素材源 |
| --- | --- |
| `Romantic Deco` | `new导出素材/Romantic Deco-Lace Frame(1)/items/6.png`；`packs/hudiejie/items/13.png` |
| `Romantic Deco-1` | `new导出素材/Decorative-&-Statement-Lace（1）/items/2.png`；`new导出素材/Essential-Lace-Trims/items/3.png`；`new导出素材/Pixel & ASCII（还没封面图）/items/7.png` |
| `Play Pop` | `new导出素材/Candy-Shapes/items/{4,6,1,5,3}.png`；`new导出素材/Playful Doodles（还没有封面部分像素优化）/items/{3,11,2,9,14,12}.png` |
| `Soft Archive` | `new导出素材/soft archive blue/items/{30,18,8}.png`；`new导出素材/Editorial-&-Everyday-Labels/items/20.png`；`packs/jiaodai/items/{29,31}.png` |

已存在于 `source-assets/packs` 的 `hudiejie/items/13.png`、`jiaodai/items/29.png` 与 `jiaodai/items/31.png` 可以直接进入后续稳定目录编译。其余列出的 `new导出素材` 文件仍缺少最终 pack ID、封面与发布状态，必须在 P1-A03 前完成处理；其中 Playful Doodles 与 Pixel & ASCII 的封面优化不阻断素材本体映射，但会阻断它们作为用户可浏览素材包的发布验收。

小程序基础模板继续作为“仅照片槽位”的回归样本；它们不再决定新模板契约的上限。

## 下一步所需输入

四个模板的分层素材映射现已齐全。P1-A03/P1-T02 将这些源文件处理为带 revision 的稳定引用，再编译为可运行的真实 `TemplateDefinition`。本地调试可以让 Resolver 临时把稳定引用映射到这些文件；模板和 Draft 均不得保存本地路径。切换到远端图片时只变更内容目录/Resolver，模板 revision 与已保存作品的素材引用保持不变。
