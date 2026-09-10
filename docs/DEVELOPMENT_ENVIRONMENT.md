# JournalCollage 开发环境与依赖策略

> 最后验证：2026-09-10。A0 的 iOS Development Build 已在此组合下成功生成。

## 1. 固定的开发环境

| 工具 | 已验证版本 | 用途 |
| --- | --- | --- |
| Node.js | 22.23.2 | JavaScript 工具链 |
| npm | 10.9.8 | workspace 与依赖安装 |
| Expo SDK | 57（锁定解析为 57.0.23） | 移动端运行时 |
| React Native | 0.86.3 | 跨端运行时 |
| React | 19.2.3 | UI 运行时 |
| CocoaPods | 1.17.0 | iOS 原生依赖 |
| CMake | 4.4.3 | Hermes iOS 构建 |
| Xcode | 26.6（17F113） | iOS 编译 |

使用 nvm 时，在仓库根目录执行：

```bash
nvm use
```

`.nvmrc`、根 `package.json` 的 `engines` 和 `packageManager` 是 Node/npm 版本约定。它们会提示版本不一致；开发者仍应通过 nvm 安装对应 Node 版本。

## 2. 依赖版本的规则

`package-lock.json` 是 JavaScript 依赖的唯一精确版本来源，必须提交到版本控制。

- 日常安装与 CI 使用 `npm ci`，确保得到完全相同的依赖树；
- 新增 Expo 或原生依赖使用 `npm exec --workspace=mobile -- expo install <package>`；
- 不执行无目标的 `npm update`、`npm audit fix` 或 `npm audit fix --force`；
- `package.json` 中 Expo SDK 包可保留 `~57.x` 兼容区间，实际安装版本由 lockfile 锁定；
- React Native、Skia、Reanimated 等核心 Editor 依赖的任何升级必须单独进行，并完成本文件第 4 节验证。

## 3. 原生工程策略

当前采用 Expo Continuous Native Generation（CNG）。`apps/mobile/ios` 和 `apps/mobile/android` 是生成物，已被忽略，不作为长期手工维护的工程提交。

- 修改纯 TypeScript / React / Skia 代码：保持开发服务运行即可；
- 新增原生依赖或修改 `app.json` 原生配置：执行 `npx expo run:ios` 或 `npx expo run:android` 重建开发版；
- iOS Pods 发生变化时，在 `apps/mobile/ios` 执行 `pod install` 后再运行 iOS 开发构建；
- 提交正式 App Store 前，将 `app.json` 中临时的 `com.anonymous.journal-collage` 替换为已在 Apple Developer 账号注册的 Bundle Identifier。

## 4. 每次有计划升级后的验证

在仓库根目录依次执行：

```bash
npm ci
npm run typecheck
npm exec --workspace=mobile -- expo install --check
npm exec --workspace=mobile -- expo export --platform ios --output-dir /private/tmp/journalcollage-ios-export
```

涉及原生依赖时，还必须在 iOS、Android Phone 和 Android Tablet 的 Development Build 上打开一个真实 Draft、编辑并导出一次。升级说明需要记录：升级目的、变更包、锁文件变更和验证结果。
