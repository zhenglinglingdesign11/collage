# P1-T01：TemplateDefinition v1 生产契约

状态：`ready-for-P1-T02`  
实现：[packages/editor-core/src/template.ts](../packages/editor-core/src/template.ts)  
上位规则：[TEMPLATE_CONTRACT_P1_T00.md](TEMPLATE_CONTRACT_P1_T00.md)

这是 Template Studio、模板编译器和 App 共用的唯一生产模板格式。它描述“新作品如何开始”，不描述 Studio 状态、素材文件位置或已保存作品。

## 生产模板

```json
{
  "schemaVersion": 1,
  "id": "template://journalcollage/soft-archive",
  "revision": "1",
  "status": "ready",
  "name": "Soft Archive",
  "canvas": {
    "size": { "width": 1024, "height": 1536 },
    "background": "#F4F0E9",
    "backgroundAsset": {
      "id": "asset://pack/template-assets/soft-archive-background",
      "kind": "image",
      "revision": "1"
    }
  },
  "preview": {
    "id": "asset://pack/template-previews/soft-archive",
    "kind": "image",
    "revision": "1"
  },
  "photoSlots": [
    {
      "type": "photo",
      "id": "hero-photo",
      "required": true,
      "frame": { "width": 592, "height": 796 },
      "transform": {
        "position": { "x": 216, "y": 360 },
        "scale": { "x": 1, "y": 1 },
        "rotation": 0
      },
      "opacity": 1,
      "isLocked": false,
      "effects": [],
      "crop": { "x": 0, "y": 0, "width": 1, "height": 1 }
    }
  ],
  "textSlots": [],
  "materialSlots": [],
  "fixedLayers": [],
  "dependencies": [
    {
      "reference": {
        "id": "asset://pack/template-assets/soft-archive-background",
        "kind": "image",
        "revision": "1"
      },
      "availability": "bundled"
    },
    {
      "reference": {
        "id": "asset://pack/template-previews/soft-archive",
        "kind": "image",
        "revision": "1"
      },
      "availability": "bundled"
    }
  ],
  "requiredCapabilities": ["image.replace", "image.crop", "material.resolve"]
}
```

Coordinates are logical canvas units, never CSS/device pixels. `transform.position` is the layer origin in that canvas; `frame`, `transform`, `rotation`, `opacity`, `crop`, effects, and fixed-layer ordering are the renderer inputs. `fixedLayers` use normal Draft `Layer` records, in paint order from back to front.

## Required invariants

- Root and template-owned nested objects are closed: unknown fields reject the file with a stable issue path.
- `id` is `template://namespace/slug`; template and asset revisions are positive decimal strings.
- Every product reference is a revised `asset://pack/...` identity. Every direct reference — preview, canvas background, slots, fixed layers and effect inputs — appears exactly once in `dependencies`.
- A template never contains an HTTP URL, `file:` path, cache key, local/bundle path, hash, ETag, recipe, platform object, executable code, `user://` or `generated://` reference.
- `TemplateDefinition` is input-only. P1-T03 creates a new Draft and new layer identities; a saved Draft never contains a template object.

## First-release profile

The 10 records in the frozen 1.0 directory are a narrower profile of v1:

- photo-slot counts are fixed at 1, except `romantic-deco-two-photo` (2), `soft-archive-multi`/`play-pop-multi` (4), and `digital-y2k-multi` (6);
- all photo slots are required; `textSlots` and `materialSlots` are empty;
- capabilities are exactly `image.replace`, `image.crop`, and `material.resolve`;
- fixed layers are locked, shipped bitmap `image` layers. Text is baked into a declared image asset; `material` replacement, brush content, and arbitrary future layers are excluded until renderer and editing semantics are shipped together;
- fixed-layer effects must be known to the current renderer. Unsupported input rejects rather than changing the composition.

## AI draft import

`template-draft.json` has the identical production fields plus one import-only field:

```json
{
  "...TemplateDefinition": "all production fields above",
  "_draft": {
    "source": "ai",
    "layerNotes": [
      {
        "target": { "collection": "photoSlots", "id": "hero-photo" },
        "confidence": 0.84,
        "reason": "Central portrait frame inferred from the reference.",
        "needsReview": true
      }
    ]
  }
}
```

Only `parseTemplateDraftDefinition` accepts `_draft`. It validates every note target, then returns a clean `TemplateDefinition`; `parseTemplateDefinition` rejects `_draft`. Template Studio may display this review context on import, but **Export Production Template** must serialize only the clean result. This preserves one renderer/schema contract without letting AI confidence or provenance reach the app.

## Entry points

- `parseTemplateDefinition(raw)` parses untrusted production JSON.
- `parseTemplateDraftDefinition(raw)` imports an AI/human authoring draft and strips `_draft`.
- `validateTemplateDefinition(template)` validates reusable v1 records.
- `validateFirstReleaseTemplateDefinition(template)` applies the 1.0 release profile.

P1-T02 may compile a Recipe into this exact shape only after visual calibration and strict Catalog resolution. It must not pass source paths or Recipe metadata through to this contract.
