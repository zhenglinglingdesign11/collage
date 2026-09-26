# P1-T00：模板最小契约与依赖规则

状态：P1-T00 契约已冻结，P1-T01～P1-T09 已实施；10 个首发模板已完成 strict Recipe 编译、bundle 依赖闭包与真机核心验证。正式 Archive/Release 构建复核仍是 P1-T10 / G1-T 的发布前事项。

模板是创作页/再创作的输入，不能是首页运营卡片。它只描述新 Draft 的初始结构；保存后的 Draft 不保留模板对象、CDN URL、bundle 路径、缓存键或可执行脚本。

P1-T01 的文件级差距、最小修订范围与自动化验收矩阵见 [TEMPLATE_SCHEMA_P1_T01_ACCEPTANCE_CHECKLIST.md](TEMPLATE_SCHEMA_P1_T01_ACCEPTANCE_CHECKLIST.md)。

## 当前实施记录（2026-09-23）

2026-09-26 素材更新：`Romantic Deco` 固定边框改用 `romantic-deco-lace-frame-1/9@3`，R2 对象为 `items/9.png`；`Romantic Deco — Two Photo` 固定边框改用 `decorative-statement-lace-1/2@2`。两张模板的编译 revision 均升至 `2`，77 项 bundle 依赖闭包已重新生成。下文早期 `9@2` 来源表仅作 P1-T00 历史记录。

- 首发目录固定为 10 个已编译 `TemplateDefinition`；Create styles 和首页只消费随包目录，运营 manifest 不承载模板定义。
- 构建脚本静态收集完整依赖闭包：10 个模板共 77 项 strict 资产。每项在生成 Expo `require(...)` 映射前校验 SHA-256、字节数、MIME 与像素尺寸；上游已替换但 Catalog 仍引用的三个对象保留为锁定字节副本。
- 模板入口使用能力门控；照片槽支持替换、原图 crop 选区与槽内移动。模板实例化后的 Draft 不包含模板对象或运行时 URI。
- 已在 iPhone 开发构建验证模板、草稿、清缓存和重新进入画布的核心路径。资源解析期间的通用图层占位为中性灰，不再使用测试场景插画。

## 已冻结的边界

- `TemplateDefinition` 使用稳定的 `template://namespace/slug` ID 和递增十进制 revision。
- 画布、照片槽位、文字槽位、装饰素材槽位、固定图层、预览、能力要求及完整素材依赖闭包均为声明式数据。
- 照片槽位仅描述初始 frame、transform、crop 与效果；用户选择的图片在 P1-T03 才生成新的 Draft 图层与身份。
- 固定图层和装饰素材槽位不可引用 `user://` 图片；所有产品素材和字体必须是含 revision 的稳定引用，并逐一出现在 `dependencies` 中。
- 装饰素材槽位冻结 `initialAsset`、`replacementPackId` 与可选的 `allowedItemIds`。替换交互从该来源素材包打开，且只更换素材引用；位置、尺寸、旋转、层级和效果保持不变。
- 依赖只声明 `bundled` 或 `catalog-resolved` 的可用性承诺；解析到包内文件、缓存或 CDN 的具体位置属于 P1-A Resolver，不进入模板。
- `requiredCapabilities` 是已知能力的白名单。当前不接受动态玩法、远端脚本、自动抠图或尚未定义的效果能力。

## 1.0 首发试跑范围（2026-09-21 冻结）

`1.0` 上线目录包含 10 个模板，并均须跑通从创作页创建、替换照片、编辑、保存、重启、清缓存恢复和导出的闭环：`Romantic Deco`、`Romantic Deco-1`、`Play Pop`、`Soft Archive`、`soft_archive_multi`、`play_pop_multi`、`fan_moodboard`、`digital_y2k_ascii`、`digital_y2k_multi` 和 `material_remix`。不因扩大模板数提前引入装饰替换、文字编辑或模板管理。

- 首发只提供照片槽位替换：`Romantic Deco-1` 两个独立照片槽；`Play Pop Multi` 与 `Soft Archive Multi` 各四个（左侧照片卡加三连相框）；`Digital Y2K Multi` 六个独立照片槽；其余六个模板各一个。首发不创建文字槽位；预览中的文案保持为固定图像或背景的一部分。
- 所有关联的蕾丝、ASCII、Candy Shapes、Playful Doodles、纸张、胶带、标签、背景和照片框均作为固定构图图层；模板入口不提供“替换为同一素材包其他内容”的选择器。
- 因此，这四个定义只声明 `image.replace`、`image.crop` 和为固定依赖解析所需的 `material.resolve`；不声明或实现 `material.replace`。
- `materialSlots` 仍是共享契约的保留能力，但 10 个首发定义均为空。未来只有当某模板明确需要“保持几何和效果、换同包素材”时，才实现其受限替换交互、候选白名单和回归测试。
- 参考预览只用作布局、层级、尺寸、旋转与裁切的视觉标注，不能拆分为模板图层、固定依赖或 Draft 背景。真实素材合成后产生的预览才是正式 `preview` 资产；以后替换预览不改变模板结构或已保存 Draft。

### 初始四模板的最小素材与布局工作

实施前为每个模板维护一份图层清单：`角色 / 来源 asset / 是否缺失 / z-index / 相对 frame / rotation / 是否锁定`。坐标按各自参考画布归一化保存，运行时不得依赖预览像素或设备尺寸。

| 模板 | 可直接作为固定层的关联素材 | 缺口与首发处理 |
| --- | --- | --- |
| `Romantic Deco` | `Romantic Deco-Lace Frame(1)/items/9.png` 高清蕾丝相框；`hudiejie/items/13.png` 顶部装饰 | 新建一个不含用户照片的粉色背景。照片槽置于相框后方；相框与顶部装饰保持固定。`hudiejie` 仅为源映射，必须先编译为 strict shipped 模板资产副本。蕾丝框以同一 stable ID 的 revision `2` 发布，旧 revision `1` 保留其不可变 R2 对象。 |
| `Romantic Deco-1` | `Decorative-&-Statement-Lace（1）/items/2.png` 蕾丝相框；`Essential-Lace-Trims/items/3.png` 横向蕾丝带；`Pixel & ASCII/items/7.png` 双心图案（允许按布局复用） | 没有独立背景资产。两张示例人物照片由上方正向、下方旋转的两个照片槽替换；需通过一次真实合成确认相框透明区、照片 crop 和层级。 |
| `Play Pop` | Candy Shapes `{4,6,1,5,3}` 与 Playful Doodles `{3,11,2,9,14,12}`，均为独立固定前景层 | 新建两个产品资产：不含用户照片的撕纸/纸张底 `play-pop-base`，以及透明中心、位于照片前景的 `play-pop-photo-frame`。不得把照片框烘焙进底图。预览中未关联的粉箭头、红线圈等固定装饰可烘焙进 `play-pop-base`。 |
| `Soft Archive` | `soft archive blue/items/{30,18,8}.png`、`Editorial-&-Everyday-Labels/items/20.png`、`jiaodai/items/{29,31}.png`，均为独立固定层 | 新建一个不含用户照片的浅色纸张背景，并将两组固定排版文字、短线与日期一并烘焙进此背景。首发不创建文字 PNG、`textSlots` 或字体依赖；中央照片仍为独立照片槽。`jiaodai` 仅为源映射，必须先编译为 strict shipped 模板资产副本。 |

最小生产步骤为：先用真实关联素材和临时照片按各自画布尺寸完成校准合成并与参考预览叠对；补齐 `Romantic Deco` 的一个背景、`Play Pop` 的两个资产和 `Soft Archive` 的一个含固定排版的背景；把来自 `hudiejie`、`jiaodai` 的源映射编译为 strict shipped 模板资产副本；将全部固定依赖和正式预览纳入严格 shipped Catalog；最后才编译四个真实 `TemplateDefinition`。校准图仅用于核对，不能作为正式模板或运行时资产。

### 新增首发模板的 Recipe 输入

`content/template-recipe-input.v1.json` 是 P1-T02 的构建期映射输入，不能直接被客户端读取或保存到 Draft。第一批已录入 `fan-moodboard`、`digital-y2k-ascii` 和 `material-remix`：三者均为 1024 × 1536、一个照片槽，并分别拥有 7、1、10 个 strict 固定素材引用。它们当前状态为 `calibration-pending`，但已属于 1.0 上线目录；完成真实素材校准、正式预览、完整依赖审计和 P1-T08 验收是发布条件，而不是筛选条件。

`content/template-layer-inventory.v1.json` 是十个首发模板统一的图层清单与坐标校准输入：每层必须记录角色、来源、strict 状态、z-index、归一化 frame、rotation 与锁定状态。`normalizedFrame: null` 明确表示尚未由参考图校准，不能被 Recipe 编译器当作可发布布局。参考图的原始比例也被保留；其中 `romantic-deco` 为正方形、`soft-archive-multi` 为 1024 × 1241，二者不可被静默拉伸为其它模板的 1024 × 1536 画布。

第二批的 `soft_archive_multi`、`play_pop_multi` 与 `digital_y2k_multi` 也属于 1.0 上线目录，但在写入 Recipe 前须先把 `xiangkuang/1`、`jiazi/2` 与 `jiaodai/{17,31}` 发布为内部 strict 模板资产；原 compatibility 包不得作为固定依赖。`play pop(1).png` 尚无关联素材配置，不在这 6 个新增模板或 1.0 目录内。

## 已审计的 composition tests

以下判断来自 `source-assets/配方模版` 的合成成品图，而非猜测的生产素材 ID。视觉参考只用于冻结结构；它不能反向成为可编辑图层或素材依赖。

| 模板参考 | 画布 | 照片槽位 | 固定素材角色 | 一期能力 |
| --- | --- | --- | --- | --- |
| `romantic deco.png` | 1254 × 1254 | 1 个居中的竖向主照片 | 粉色底、蕾丝相框、蝴蝶结、玫瑰装饰 | `image.replace`、`image.crop`、`material.resolve` |
| `romantic deco-1.png` | 1024 × 1536 | 2 个照片；上方正向、下方旋转 | 蕾丝相框、横向蕾丝/缎带、像素心形点缀 | 同上；下方照片须保留初始旋转 transform |
| `play pop.png` | 1024 × 1536 | 1 个居中竖向主照片 | 撕纸底、蓝色相框、几何贴纸、手绘线条与星形 | 同上 |
| `soft archive.png` | 1024 × 1536 | 1 个居中竖向主照片 | 纸张底、格纹纸、胶带、标签和不可编辑的文字印刷素材 | 同上 |

四个模板都没有文字槽位，也不需要抠图、描边、浮起或质感效果。画面中的文字应先作为固定的印刷素材；未来若要允许编辑，再显式增加 `text.replace` 槽位。`Soft Archive` 的两组固定文案和日期在首发并入背景资产，不新增单独文字素材或字体依赖。

代码测试以合成稳定引用验证上述 1/2/1/1 槽位模型、依赖闭包和运行时位置禁令；不冒充这些生产素材已经存在于已发布目录。

## 已提供的固定素材来源映射

这些是生产前的源文件映射，不能直接写入 `TemplateDefinition`；P1-A03/P1-T02 需要先把它们处理成已发布素材包 item，再替换为稳定的 `asset://pack/...` 引用和 revision。

| 模板 | 已确认素材源 |
| --- | --- |
| `Romantic Deco` | `new导出素材/Romantic Deco-Lace Frame(1)/items/9_2.png`（压缩后发布为 `asset://pack/romantic-deco-lace-frame-1/9@2`）；`packs/hudiejie/items/13.png` |
| `Romantic Deco-1` | `new导出素材/Decorative-&-Statement-Lace（1）/items/2.png`；`new导出素材/Essential-Lace-Trims/items/3.png`；`new导出素材/Pixel & ASCII（还没封面图）/items/7.png` |
| `Play Pop` | `new导出素材/Candy-Shapes/items/{4,6,1,5,3}.png`；`new导出素材/Playful Doodles（还没有封面部分像素优化）/items/{3,11,2,9,14,12}.png` |
| `Soft Archive` | `new导出素材/soft archive blue/items/{30,18,8}.png`；`new导出素材/Editorial-&-Everyday-Labels/items/20.png`；`packs/jiaodai/items/{29,31}.png` |

已存在于 `source-assets/packs` 的 `hudiejie/items/13.png`、`jiaodai/items/29.png` 与 `jiaodai/items/31.png` 可以直接进入后续稳定目录编译。其余列出的 `new导出素材` 文件仍缺少最终 pack ID、封面与发布状态，必须在 P1-A03 前完成处理；其中 Playful Doodles 与 Pixel & ASCII 的封面优化不阻断素材本体映射，但会阻断它们作为用户可浏览素材包的发布验收。

小程序基础模板继续作为“仅照片槽位”的回归样本；它们不再决定新模板契约的上限。

## 下一步所需输入

首发试跑先完成四个模板的图层清单和校准合成；其中需补齐 `Romantic Deco` 背景、`Play Pop` 背景与照片框，以及 `Soft Archive` 的含固定排版背景。P1-A03/P1-T02 将经审核的源文件和新增产品资产处理为带 revision 的稳定引用，再编译为可运行的真实 `TemplateDefinition`。本地调试可以让 Resolver 临时把稳定引用映射到这些文件；模板和 Draft 均不得保存本地路径。切换到远端图片时只变更内容目录/Resolver，模板 revision 与已保存作品的素材引用保持不变。
