# Remote Source Assets

这个目录只作为远程资源的本地源文件库，不会被小程序打包。正式运行时，小程序应通过微信云存储或 Cloudflare R2 的 HTTPS URL 加载这些资源。

推荐目录结构：

```text
source-assets/
  packs/
    papers/
      pack-sheet.jpg
      items/
        1.png
        2.png
  fonts/
    Gemini-Regular.otf
    Kelsi-Regular.otf
```

`packs` 用于素材包配置生成；`fonts` 用于后续上传到云端后替换 `miniprogram-spike/miniprogram/config/font-table.js` 中的字体 URL。
