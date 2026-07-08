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
