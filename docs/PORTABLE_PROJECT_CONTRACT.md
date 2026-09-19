# JournalCollage Portable Project Contract

> Schema: `journalcollage.portable-project`
> Format version: `1`
> Status: frozen for P0-05/P0-06 implementation
> Updated: 2026-09-14

## 1. Purpose and boundaries

Portable Project is the only portable representation of an editable work. It is deliberately different from the local `StoredWorkspace`: it contains a portable document, resource manifest, and resource files, but never an `AssetCatalog`, `originalUri`, cache key, signed URL, or platform object.

The archive/container choice is deliberately not frozen here. P0-05 may initially use a directory containing this JSON and `resources/`; a ZIP or upload bundle is valid only if it preserves exactly the same logical layout and bytes.

## 2. V1 envelope

`project.json` is UTF-8 JSON with this logical shape. `document` is a complete current `Draft`, after migration to its supported Draft schema.

```ts
type PortableProjectV1 = Readonly<{
  format: 'journalcollage.portable-project';
  formatVersion: 1;
  projectId: string;
  document: Draft;
  assetManifest: readonly PortableAssetManifestEntry[];
  requiredPackAssets: readonly RequiredPackAsset[];
  catalogDependencies: Readonly<{
    fonts: readonly Readonly<{ fontId: string; fontVariantId: string; revision: string }>;
    brushes: readonly Readonly<{ id: string; revision: string }>;
  }>;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
  extensions?: Readonly<Record<string, unknown>>;
}>;

type PortableAssetManifestEntry = Readonly<{
  reference: Readonly<{ id: string; kind: 'image' | 'font' | 'texture' | 'brush'; revision: string }>;
  ownership: 'user' | 'generated' | 'catalog';
  required: boolean;
  content?: Readonly<{
    relativePath: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
  }>;
  pixelSize?: Readonly<{ width: number; height: number }>;
  source?: Readonly<{
    type: 'imported' | 'generated';
    generationRequestId?: string;
  }>;
}>;

type RequiredPackAsset = Readonly<{
  packId: string;
  packRevision: string;
  itemReference: Readonly<{ id: string; kind: 'image' | 'texture' | 'brush'; revision: string }>;
}>;
```

V1 invariants:

1. `projectId === document.id`; both are immutable opaque project identities. New projects use UUID-shaped IDs; a pre-P0-03 local project retains its existing non-empty ID so export does not silently rename it.
2. `document.schemaVersion` is the Draft schema version, while `formatVersion` is the Portable Project envelope version. They evolve independently.
3. `createdAt`, `updatedAt`, and `exportedAt` are RFC 3339 UTC timestamps. Export never changes `createdAt`; `exportedAt` is not a document edit.
4. Each document asset reference appears once in `assetManifest`, matched by `(id, kind)`. A document revision, when present, must equal the manifest revision. Legacy Draft references with no revision are normalized to manifest revision `1` during export; manifest entries not referenced by `document` are rejected in v1.
5. `requiredPackAssets` is a verified, deduplicated summary of all `asset://pack/{packId}/{itemId}` references. Its item reference must have the same revision as its manifest entry.
6. `catalogDependencies.fonts` records every text layer’s font pair and resolver revision; `catalogDependencies.brushes` records every persisted brush ID/revision. Effects retain their own type/version in `document`.

## 3. Resource ownership and bytes

| Ownership | Valid reference family | `content` | Import behavior |
| --- | --- | --- | --- |
| `user` | `user://image/{uuid}` | Required. Bytes live below `resources/`, have size, MIME and SHA-256. | Copy bytes into the new device’s private resource directory, then create a new Catalog URI. |
| `generated` | `generated://image/{uuid}` | Required after the user adopts a generated result. | Same as user resources; generation URL/request response is never a resolver. |
| `catalog` | `asset://…`, `font://…`, `brush://…` | Forbidden. | Resolve through the installed/bundled/remote catalog by stable ID + revision. |

`relativePath` must be normalized, non-empty, begin with `resources/`, contain no `..`, no leading slash, no backslash, and no URI scheme. Two manifest entries cannot share a path. P0-05 writes content only after hashing it; P0-06 verifies hash and byte length before accepting it.

Remote material URLs, R2 signatures, `file://` paths, `data:` URIs, `ph://`/`content://` media identifiers, renderer objects, and React Native asset handles are forbidden everywhere in the Portable Project.

## 4. Current reference mapping

V1 preserves the current stable logical IDs instead of introducing a second URI vocabulary:

| Current reference | Portable interpretation |
| --- | --- |
| `user://image/{uuid}` | `ownership: 'user'`, embedded byte content |
| `generated://image/{uuid}` | `ownership: 'generated'`, embedded byte content; reserved until P3-08 |
| `asset://pack/{packId}/{itemId}` | `ownership: 'catalog'`, listed in `requiredPackAssets` |
| other `asset://…`, `font://…`, `brush://…` | `ownership: 'catalog'`, resolved by installed catalog and revision |

Procedural catalog materials remain `catalog` only when their current stable reference deterministically reconstructs the same recipe. A non-deterministic or user-created result must instead be embedded as `user` or `generated` content.

## 5. Validation, compatibility, and unknown fields

P0-07 implements these rules:

1. Reject missing required fields, duplicate IDs/paths, malformed timestamps, unsupported enum values, unsafe paths, bad hashes, and any runtime URI/platform object in the parsed tree.
2. Reject `formatVersion` newer than the reader supports. Do not partially import a newer project or silently discard its semantics.
3. Migrate supported older envelope versions sequentially to v1 before Draft migration. v0’s `draft` and `assets` fields are migrated to v1’s `document` and `assetManifest`; the contained `document` then goes through the existing Draft migration boundary.
4. Core envelope objects are closed in v1: unknown fields at root, manifest, dependency, or content level are rejected. This prevents a writer from believing an importer preserved data that it actually ignored.
5. Forward-compatible optional data belongs only in `extensions`, whose keys must be reverse-DNS namespaces (for example `site.zllarchi.future-feature`). Importers preserve an opaque extension JSON value without interpreting or dropping it; otherwise they reject the import rather than silently losing it.
6. Unknown effect types already permitted by the Draft’s structural validation remain inside `document`; they are not reinterpreted by the envelope. A renderer that cannot render one must report a deterministic compatibility state.

Import failures use stable error codes: `invalid-json`, `invalid-schema`, `unsupported-version`, `future-version`, `missing-resource`, `resource-size-mismatch`, `resource-hash-mismatch`, and `destination-exists`. UI and future cloud restore flows must map those codes to user-facing recovery guidance without exposing file paths or implementation details.

## 6. Implementation handoff

P0-05 provides a `StoredWorkspace → PortableProjectV1 + resources/` serializer. It must build the manifest from the migrated Draft and Catalog, embed only user/adopted-generation bytes, resolve all pack metadata by stable IDs, and reject any unclassifiable asset.

P0-06 must provide the inverse importer into a new local workspace directory. It must not reuse source device paths, must rebuild the Asset Catalog from embedded bytes and resolvable catalog dependencies, and must be atomic: no visible restored project until document and every required resource validate.
