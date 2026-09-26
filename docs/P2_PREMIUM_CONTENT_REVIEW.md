# P2 首发内容权益预整理

> 状态：初始候选，已由 `P2_USER_REVIEW_IMPORT_AUDIT.md` 与 `content/p2-content-entitlements.v1.json` 的用户审核结果取代；本文件只保留预整理方法。更新：2026-09-24。逐项可编辑表见 `P2_PREMIUM_CONTENT_CANDIDATES.csv`。列中的 `candidate` 只是产品审核建议；现有 catalog 的 `status: shipped` 表示内容随首发目录发布，不表示 Free 或 Premium。

## 数据来源与覆盖

- 候选表生成时的目录快照有 57 个包，其中 55 个可浏览包、1,319 个 item。2026-09-26 的复核结果见 `content/p2-content-entitlements.v1.json`：目录子项 1,312 个，隐藏 10 个旧 item 后可浏览 1,302 个。CSV 保留原始候选快照；逐项 Free/Premium 决定以归一化清单为准。
- `generated/template-recipes/*.template.json`：10 个首发设计模板；`apps/mobile/src/basicLayouts.ts`：15 个本地基础布局。
- `packages/asset-system/src/index.ts`：4 个端侧程序化素材包；`miniprogram-spike/miniprogram/config/font-table.js`：11 个远端字体组，另有系统字体。
- `packages/editor-core/src/effects.ts`：15 个效果；`packages/asset-system/src/brushes.ts`：8 种画笔；`apps/mobile/App.tsx`：当前 PNG 导出。

CSV 共 130 行，每行包括稳定 ID、名称、风格或分组、item／依赖数、候选层级、理由、来源和审核状态。`review` 列可直接改成“确认 Free／确认 Premium／暂缓／需拆分”，随后才有资格成为实际付费清单。模板 `requiredCapabilities` 仍只表示客户端兼容性，不表达付费归属。

## 候选分层原则

1. **免费创作闭环**：15 个基础布局、基础编辑、足量基础素材和字体、基础效果与画笔，以及正常 PNG 导出保持可用。不可把现有导出、已有草稿或素材包缓存的恢复路径作为付费筹码。
2. **可见的风格体验**：每个风格至少保留一个 Free 素材包候选，Premium 展示完整系列。素材和设计模板应允许完整预览；实际使用才判断权限。
3. **内容库是 Premium 主价值**：完整 Style Kits、更多成品模板、主要装饰素材及手作增强效果／画笔作为候选；AI 额度是附加价值。
4. **内部资产不售卖**：`template-previews` 与 `template-assets` 是模板预览和固定依赖，不作为独立素材商品。模板所需的固定素材与用户在素材库单独添加该素材是不同权限动作，需明确模板打包许可语义。
5. **未实现规格不假装已上市**：当前只有 PNG 导出，最大逻辑边 2048；独立高分辨率导出尚未实现。未发现现有导出水印机制，因此 `export.no-watermark` 不能用于锁住当前无水印导出。

## 优先请产品审核的项目

| 项目 | 当前候选 | 需要确认的边界 |
| --- | --- | --- |
| 10 个设计模板 | Play Pop、Soft Archive 单图为 Free 候选；其余 8 个为 Premium 候选 | 两个 Free 模板是否足以体验；固定装饰依赖是否允许随模板使用 |
| 6 个有风格标签的系列 | 完整 Style Kit 为 Premium 候选，每种风格保留一个 Free 样本素材包 | 系列的正式商品边界；Free 样本是否适合实际审美展示 |
| 55 个可浏览素材包 | 12 个 Free、43 个 Premium 候选 | 按包收费是否合适；未标风格的 12 个包需要重点审美复核；是否有必须拆分到 item 的包 |
| 4 个程序化包 | Basic paper、Polka paper、Basic shapes 为 Free；Material shapes 为 Premium 候选 | 自定义程序化纸张与形状是否应始终免费 |
| 12 个字体组 | System、Gemini、Kose、Kurewa Gothic 为 Free 候选；其余 8 组 Premium 候选 | 中文基础字体覆盖、商用授权、变体是否同组授权 |
| 15 个效果 | Shadow、Outline、Corners 为 Free；其余 12 个 Premium 候选 | 撕边、贴胶带和纸张浮起是核心产品体验，是否应留一个 Free 样本 |
| 8 种画笔 | Plain、Crayon、Marker 为 Free；其余 5 种 Premium 候选 | 手作笔刷是否需要一个 Free 样本 |
| 导出 | 当前 PNG 为 Free；高分辨率为未来 Premium 候选 | 先定义分辨率与设备性能；目前无水印导出不应上锁 |

## 与实施计划的关系

这张表只是 P2-10 的产品审核输入，不改资源元数据，也不把 `premium` 写入远程 catalog。产品确认后，应另建**稳定 ID → feature key** 的付费清单，由 `apps/mobile` 的产品层调用 `EntitlementService.canUse()`；`editor-core`、`editor-renderer` 和 `asset-system` 不读取订阅状态。设计模板能否在订阅过期后继续打开、编辑、导出旧作品，也须作为存量作品规则单独确认。

当前 P2 Feature Catalog 尚未包含字体的付费 feature key；如确认高级字体收费，需补 `font.premium` 及对应消费边界。`export.no-watermark` 目前只是抽象键，不对应已实现的付费规格。
