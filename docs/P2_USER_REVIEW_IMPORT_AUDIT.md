# P2 用户内容分类归一化记录

> 更新：2026-09-26。用户标注及后续更正：`content/p2-content-review-source.v1.csv`；稳定 ID 映射：`scripts/normalize-p2-content-review.py`；归一化结果：`content/p2-content-entitlements.v1.json`。本文件是产品决策审计。19 个分组修正、R2 更新与重复项删除已编入 catalog revision 16。付费门控尚未接线。远程目录元数据不授予权益。

## 已落实的分类决定

- 10 个设计模板：Free 4、Premium 6。更正后 `Play Pop Multi` 为 Premium，`Play Pop` 保持 Free。15 个基础布局保持 Free。
- 55 个可浏览素材包、1,312 个目录子项：Free 437、Premium 875。49 个包按明确 item ID 混合拆分，5 个整包 Free，1 个整包 Premium。10 个此前下架子项仍在目录中，素材浏览列表为 1,302 项。
- 12 个字体组：Free 9、Premium 3。15 个效果：Free 11、Premium 3、1 个从收费清单排除（`material.grain`；不等于删除编辑器效果或旧 Draft 支持）。8 种画笔：Free 3、暂时 Free 5。
- 4 个程序化包：Free 3、`material-basic-shape-materials` 仍待确认。当前 PNG 导出保持 Free；高分辨率导出未实现，现有无水印结果不得因抽象键而上锁。
- 6 个旧 Style Kit 候选已从归一化结果剔除。产品尚未提供 Style Kit，`style-kit.premium` 在 P2 Feature Catalog 中按未发布处理。

## 用户更正的 ID 与数量

| 包 | 归一化处理 |
| --- | --- |
| `pixel-ascii` | 原列表的 6 个 Free item 保留，另将 `3-1` 改为 Free，以支持 Free 的 Digital Y2K ASCII 模板；现为 7 个 Free item |
| `fugu-03` | `·3` 解释为已有 item `3`，不重复计数；现为 6 个不同 Free item |
| `editorial-connectors-index-marks` | 重复的第二个 `10` 改为 `30`，重复 `3` 只计一次；现为 37 个不同 Free item |
| `beads-structural-units-1` | 重复 `10` 只计一次；现为 18 个不同 Free item |
| `blue-01` | 第二个 `9` 改为 `19`；现为 10 个不同 Free item |
| `essential-lace-trims` | 5 Free／16 当前 item |
| `digital-ui-1` | 数字按顺序映射到 `sprite-05`、`sprite-06`、`sprite-11`、`sprite-12`、`sprite-14` |
| `decorative-statement-lace` | 新浏览数量 17；Free `2`、`16`；旧命名的 3 项只供已有引用解析 |
| `decorative-statement-lace-1` | 新浏览数量 16；Free `2`、`10`、`12`；旧 `17–20` 只供已有引用解析 |
| `romantic-deco-lace-frame-1` | Free 改为 `1`、`5`、`6`、`8`；`9` 使用新 `9.png`，item revision 3 |
| `zhenzhi01` | Free 改为 `2`、`4`、`6`、`7`、`9`、`10`、`18`、`23`；`5`、`16` 继续隐藏 |
| `xiangkuang-02` | 新浏览数量 17；Free `3`、`4`、`7`、`9`、`12`；旧 `18` 只供已有引用解析 |

原 CSV 的比例备注不是授权来源；实际分类始终使用稳定 `itemId`。不为凑齐旧比例而额外挑选免费素材。

## Free 模板与付费固定装饰

| 模板 | 当前处理 |
| --- | --- |
| Digital Y2K ASCII | Free；`pixel-ascii/3-1` 已改为 Free，不再交叉 |
| Play Pop | Free；固定素材可随模板使用，素材库单独添加仍需 Premium |
| Play Pop Multi | Premium；无需额外 Free 素材例外 |
| Soft Archive | Free；模板现有实例可使用 `editorial-everyday-labels/20`，素材库单独添加仍需 Premium |
| Soft Archive Multi | Free；未发现此类交叉 |

此规则只作用于模板中随配方实例化的**既有固定装饰**。用户将图层替换成另一件 Premium 素材、在素材库新增、复制后以新素材身份添加等动作必须重新过 `EntitlementService`。已保存作品的打开、编辑与导出不得因为订阅到期或目录重排失效。

## 分组与质量返工仍待实施

归一化清单按用户备注修正了 19 个包的风格标签，包括 `visual-foundation`、`romantic-deco` 和新增候选 slug `indie-zine`。首发源目录与编译产物已更新到 catalog revision 16；`indie-zine` 的浏览展示名与排序仍需在正式 UI 复核。风格标签只用于浏览，不表示 Style Kit 已上市。

仍保留在目录但不供新素材浏览的 10 个 item：`decorative-statement-lace/{decorative-statement-lace-1,decorative-statement-lace-2,decorative-statement-lace-3}`、`decorative-statement-lace-1/{17,18,19,20}`、`zhenzhi01/{5,16}`、`xiangkuang-02/18`。本轮从正式素材包与 catalog 删除的 11 个重复 item：`structural-plastic-beads-mesh/{3,6}`、`zhiganxingxing/14`、`sanguangtiezhi-02/{5,20,40}`、`jieri-01/{53,54,55,56,57}`。用户确认 `jieri-01` 的目标是连续 53–57，而非 `5`。10 个设计模板的依赖闭包均未引用这些删除 ID。新素材浏览计数为 1,302：Free 437、Premium 865。

**开发期旧作品：**用户已确认无需恢复。本批 R2 更新覆盖原路径的旧字节，新目录为变动 item 提升 revision；旧 Draft 的旧 revision 引用可能返回 `asset-reference-invalid`。这一限制只针对发布前的开发数据，不作为本轮删除的阻断条件。正式发布后仍须遵守远程素材的不可变 revision 契约。

本批已接收的高清／重切／边缘优化：`romantic-deco-lace-frame-1`、`decorative-statement-lace`、`decorative-statement-lace-1`、`zhenzhi01`、`biantie-01`、`cat-01/{6,23}`、`taocitroy-01/6`、`xiangkuang-02`。六个完整素材包的 114 个 PNG 均与已上传的 R2 字节逐项匹配；`cat-01` 与 `taocitroy-01` 三个指定子项直接从 R2 纳入本地。`zhenzhi01` 继续使用线上 PNG 封面，`biantie-01`、`xiangkuang-02` 使用线上实际 JPG 封面。R2 上的 11 个重复对象尚未物理删除，但 catalog 已不再引用它们。

## 下一步验收顺序

1. 已验证归一化清单覆盖当前 10 个模板、15 个布局和 1,312 个目录素材 ID；Free 模板只剩两处获准的固定装饰交叉。
2. 已修正分组源数据并重新编译目录与 10 个模板的 77 项依赖闭包；本轮 11 个重复项已从目录删除，原有 10 个下架项继续不在新浏览列表。正式 UI 中仍要检查 `indie-zine` 展示文案。
3. 本批更新已升级相关 item revision、重编译 hash／尺寸；仍需在开发包复测远程缓存。开发期旧作品无需恢复。
4. 在 G1 阶段门允许后，才将已确认清单连接到页面／工具消费边界；继续以 `EntitlementService` 判定，不能信任素材远程元数据。
