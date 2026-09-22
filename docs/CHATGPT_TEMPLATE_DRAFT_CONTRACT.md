# JournalCollage Template Draft Contract v1

Use this document as the contract for a GPT conversation that analyzes a template reference image and an Asset Contact Sheet.

## Role

You are producing an importable `template-draft.json` for JournalCollage Template Studio. Your job is structural visual analysis, not pixel-perfect reproduction. Infer layers, approximate geometry, stacking order, photo placeholders, and the best available asset matches. Mark uncertainty for human review.

## Inputs supplied in the conversation

1. **Reference Image** — the intended finished template composition.
2. **Asset Contact Sheet** — the available shared and template-private production assets. Each visible item must be identified by the exact stable asset reference shown with it, such as:

   ```text
   asset://pack/soft-archive-blue/18@1
   ```

3. Optional constraints: template ID, display name, canvas dimensions, and assets that are allowed to be template-private.

Never invent an asset ID. If no matching Contact Sheet asset exists, explicitly declare a missing template-private asset in `_draft.layerNotes`; do not substitute a visually unrelated asset.

## Required response

Return **only one valid JSON object**, with no Markdown fence, prose, comments, URL, local file path, or trailing text.

The JSON must be a `TemplateDefinition` v1 plus exactly one review-only `_draft` object. All production fields must be present:

```text
schemaVersion
id
revision
status
name
canvas
preview
photoSlots
textSlots
materialSlots
fixedLayers
dependencies
requiredCapabilities
_draft
```

## Production constraints

- `schemaVersion` is always `1`.
- `id` is supplied by the user in the form `template://journalcollage/<slug>`; do not invent a different namespace.
- `revision` is supplied by the user; default to the string `"1"` only when absent.
- Set `status` to `"draft"`.
- Use the supplied canvas dimensions. All dimensions and positions use logical canvas units, not percentages, CSS pixels, screen coordinates, or reference-image pixel coordinates.
- All resolved product assets must have this exact structure:

  ```json
  { "id": "asset://pack/<pack-id>/<item-id>", "kind": "image", "revision": "1" }
  ```

- Never output `http:`, `https:`, `file:`, `data:`, bundle paths, cache paths, hashes, ETags, source design-file data, executable code, `user://`, or `generated://`.
- Every production asset reference must appear once in `dependencies`, with `availability` set to `"bundled"`.
- `preview` is a reserved future strict asset reference. If the user has not supplied its exact ID, use the supplied placeholder preview reference; do not use the reference image URL or path.
- The reference image itself is visual evidence only. It must not become `preview`, a fixed layer, a background asset, or a Draft asset.
- Fixed layers are ordered back-to-front in `fixedLayers`. Every fixed layer is `isLocked: true`.
- The initial 1.0 profile permits only `image` fixed layers, `photoSlots`, and the exact capabilities below. Printed text must be baked into a background or fixed image asset, not emitted as editable text.
- `textSlots` and `materialSlots` must be empty arrays.
- `requiredCapabilities` must be exactly:

  ```json
  ["image.replace", "image.crop", "material.resolve"]
  ```

## Photo-slot format

Each user-photo placeholder must be required and use this shape:

```json
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
```

Use distinct stable slot IDs. Preserve meaningful rotation from the reference. Do not create an image asset for a user photo.

## Fixed-image-layer format

Use this format for every resolved background, frame, tape, sticker, label, or decorative asset:

```json
{
  "type": "image",
  "id": "fixed-blue-tape-top",
  "name": "Blue tape, top",
  "asset": {
    "id": "asset://pack/example-pack/blue-tape-03",
    "kind": "image",
    "revision": "1"
  },
  "frame": { "width": 280, "height": 96 },
  "transform": {
    "position": { "x": 390, "y": 188 },
    "scale": { "x": 1, "y": 1 },
    "rotation": 8
  },
  "opacity": 1,
  "isLocked": true,
  "effects": [],
  "crop": { "x": 0, "y": 0, "width": 1, "height": 1 }
}
```

For a full-canvas image background, use `canvas.backgroundAsset` and also include that reference in `dependencies`. Do not duplicate it as a fixed layer unless it must be transformable or layered above another item.

## Missing template-private asset rule

If the reference needs a one-off background or decoration that is absent from the Contact Sheet:

1. Do **not** create an unresolved production asset reference or fake asset ID.
2. Do **not** add it to `fixedLayers` or `dependencies`.
3. Add a `_draft.layerNotes` entry with `needsReview: true`, a precise `reason`, and a descriptive target. If it has no corresponding production layer yet, target the nearest relevant slot or fixed layer and explain what is missing.

Human production then creates the private bitmap and P1-T02 publishes it as a non-browsable strict internal asset, for example `{ "id": "asset://pack/template-assets/soft-archive-background", "kind": "image", "revision": "1" }`. Only then may it enter the final production template and dependency closure.

## `_draft` review metadata

`_draft` is accepted only by Template Studio import. It is removed before production export.

```json
{
  "_draft": {
    "source": "ai",
    "layerNotes": [
      {
        "target": { "collection": "fixedLayers", "id": "fixed-blue-tape-top" },
        "confidence": 0.86,
        "reason": "Closest blue gingham tape in the supplied Contact Sheet.",
        "needsReview": false
      }
    ]
  }
}
```

- `source` must be `"ai"`.
- Each note target must point to an existing `photoSlots`, `textSlots`, `materialSlots`, or `fixedLayers` item.
- `confidence` is a number from `0` to `1`.
- Use `needsReview: true` for approximate geometry, weak asset matches, occlusion ambiguity, or missing private assets.
- Do not add any field other than `source` and `layerNotes` under `_draft`.

## Final self-check before responding

1. The output is a single JSON object and no prose.
2. Every `asset://pack/...` reference has an explicit revision and one matching dependency.
3. No dependency is unused.
4. No asset reference is invented, a URL, a local path, or a user/generated asset.
5. `textSlots` and `materialSlots` are empty.
6. All fixed layers are locked image layers and correctly back-to-front ordered.
7. Any uncertainty is recorded in `_draft.layerNotes`, not hidden by a guess.
