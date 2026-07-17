# iOS Localization Copy

English is the primary UI language. Every key should be named by product context, not by source text, and the English copy should be short enough to fit the current compact SwiftUI controls before Simplified Chinese is added.

## Naming Rules

- Use dot-separated, scene-based keys: `editor.toolbar.photo`, `assets.add.button`.
- Split copy by UI context instead of reusing one long phrase everywhere.
- Prefer short nouns and verbs for compact controls.
- Keep Chinese semantic and natural; it does not need to mirror English word order.

## Length Limits

| Key pattern | Max English length |
|---|---:|
| `tab.*` | 10 |
| `*.toolbar.*` | 10 |
| `*.button` | 16 |
| `layer.action.*` | 12 |
| `*.category.*` | 16 |
| `*.title` | 28 |
| `*.status.*` | 24 |

These limits are enforced by `Scripts/validate-localization.js`.

## P0 Copy Table

| Key | English | 简体中文 | UI context |
|---|---|---|---|
| `tab.create` | Create | 创作 | Root tab |
| `tab.assets` | Assets | 素材 | Root tab |
| `tab.inspiration` | Inspo | 灵感 | Root tab |
| `tab.mine` | Mine | 我的 | Root tab |
| `create.title` | New Collage | 新拼贴 | Create page title |
| `create.add_photo.title` | Add Photo | 添加照片 | Add-photo card title |
| `create.add_photo.subtitle` | Pick a photo to start | 从相册选择，开始你的拼贴 | Add-photo card subtitle |
| `create.start_assets` | Start with Assets | 从素材包开始 | Create page asset entry |
| `create.recent_drafts` | Drafts | 最近草稿 | Recent draft section |
| `create.no_drafts` | No drafts yet | 暂无草稿 | Empty recent drafts |
| `editor.status.unsaved` | Unsaved | 未保存 | Editor save status |
| `editor.status.saved` | Saved | 已保存 | Editor save status |
| `editor.status.save_failed` | Save Failed | 保存失败 | Editor save status |
| `editor.status.exporting` | Exporting | 正在导出 | Editor export status |
| `editor.status.export_success` | Saved to Photos | 已保存到相册 | Editor export status |
| `editor.save.button` | Save | 保存 | Editor top bar |
| `editor.export.button` | Export | 导出 | Editor top bar |
| `editor.leave.title` | Save draft before leaving? | 离开前保存草稿？ | Leave confirmation |
| `editor.leave.message` | Save your changes or discard edits from this session. | 可以保存当前编辑，或放弃本次进入编辑器后的修改。 | Leave confirmation |
| `editor.leave.save` | Save Draft | 保存为草稿 | Leave confirmation action |
| `editor.leave.discard` | Discard | 不保存 | Leave confirmation action |
| `editor.leave.cancel` | Cancel | 取消 | Leave confirmation action |
| `editor.toolbar.photo` | Photo | 图片 | Editor bottom toolbar |
| `editor.toolbar.asset` | Asset | 素材 | Editor bottom toolbar |
| `editor.toolbar.tape` | Tape | 胶带 | Editor bottom toolbar |
| `editor.toolbar.background` | Bg | 背景 | Editor bottom toolbar |
| `editor.toolbar.text` | Text | 文字 | Editor bottom toolbar |
| `editor.toolbar.ratio` | Ratio | 比例 | Editor bottom toolbar |
| `layer.action.up` | Up | 上移 | Layer action toolbar |
| `layer.action.down` | Down | 下移 | Layer action toolbar |
| `layer.action.copy` | Copy | 复制 | Layer action toolbar |
| `layer.action.delete` | Delete | 删除 | Layer action toolbar |
| `layer.action.effects` | Effects | 效果 | Layer action toolbar |
| `layer.action.crop` | Crop | 裁切 | Layer action toolbar |
| `layer.action.mask` | Mask | 形状 | Layer action toolbar |
| `layer.action.brush` | Brush | 涂抹 | Layer action toolbar |
| `layer.action.subject` | Subject | 主体 | Layer action toolbar |
| `assets.title` | Assets | 素材包 | Assets page title |
| `assets.category.recommended` | Recommended | 推荐 | Asset category chip |
| `assets.category.favorites` | Favorites | 收藏 | Asset category chip |
| `assets.empty.favorites` | No favorites yet | 还没有收藏的素材包 | Asset empty state |
| `assets.add.button` | Add | 添加 | Asset detail add button |
| `assets.browse_all` | All Assets | 查看全部素材 | Editor asset drawer |
| `inspiration.title` | Inspo | 灵感 | Inspiration page title |
| `inspiration.close` | Close | 关闭 | Inspiration preview close |
| `mine.title` | Mine | 我的 | Mine page title |
| `mine.recent_drafts` | Drafts | 最近草稿 | Mine page draft section |
| `mine.clear_cache` | Clear Cache | 清理缓存 | Mine cache action |

## Copy Decisions

- `Inspo` is used instead of `Inspiration` for compact tab and navigation layouts.
- `Bg` is used in the editor toolbar to avoid crowding.
- `Add` is used for the asset detail primary button; full phrasing is reserved for longer explanatory text.
- `Discard` is used instead of `Don't Save` to keep the confirmation action short.

## Update Checklist

1. Add the key to both `en.lproj/Localizable.strings` and `zh-Hans.lproj/Localizable.strings`.
2. Keep English within the configured length limit.
3. Add a new limit pattern to `Scripts/validate-localization.js` if the key belongs to a new compact UI family.
4. Run `node Scripts/validate-localization.js`.
5. Run `node Scripts/preflight-acceptance.js`.
