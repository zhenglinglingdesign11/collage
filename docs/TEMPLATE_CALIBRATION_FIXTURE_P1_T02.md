# P1-T02：参考图坐标校准夹具

该夹具只做一件事：把参考预览中的像素矩形转换为稳定的归一化 frame。它不修改素材、不生成预览、不猜测图层身份，也不把本地路径写进 TemplateDefinition。

源清单是 [template-layer-inventory.v1.json](../content/template-layer-inventory.v1.json)。每个模板已有参考图路径与原始尺寸；通过视觉叠对确认一个照片槽或固定层的像素边界后，运行：

```sh
npm run calibrate:template-layer -- \
  --template play-pop-multi \
  --target photoSlot:polaroid-photo \
  --frame 63,704,334,420 \
  --rotation -4
```

命令只输出可审阅的 `pixelFrame`、`normalizedFrame` 与 rotation；人工审核后才将结果写回清单。坐标精度固定到 6 位小数。

查看待校准目标：

```sh
npm run calibrate:template-layer -- --missing
```

校准完成时，必须用 `npm run validate:template-layer-inventory` 校验所有非空归一化 frame 位于 `[0, 1]` 内。P1-T02 再使用这些已审核数据编译正式 TemplateDefinition fixture。
