import { DRAFT_SCHEMA_VERSION, type Draft } from './document';
import { validateDraft, type ValidationIssue } from './validation';

export type MigrationResult =
  | Readonly<{ ok: true; draft: Draft; migrated: boolean }>
  | Readonly<{ ok: false; issues: readonly ValidationIssue[] }>;

/**
 * The first release has no prior schema to transform. Keeping this as the only
 * import boundary for untrusted stored JSON prevents ad-hoc migrations later.
 */
export const migrateDraft = (raw: unknown): MigrationResult => {
  if (!isRecord(raw) || raw.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    return { ok: false, issues: [{ path: 'schemaVersion', message: 'Unsupported or missing draft schema version.' }] };
  }
  // Text styling was expanded without changing the document envelope.  Old
  // A3 drafts used `font: null`; normalize them at this single import
  // boundary so persisted documents never need platform font names.
  const draft = normalizeTextLayers(raw) as Draft;
  const issues = validateDraft(draft);
  return issues.length === 0 ? { ok: true, draft, migrated: JSON.stringify(raw) !== JSON.stringify(draft) } : { ok: false, issues };
};

const normalizeTextLayers = (raw: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(raw.layers)) return raw;
  let changed = false;
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || layer.type !== 'text') return layer;
    const next = {
      ...layer,
      ...(typeof layer.fontId === 'string' ? {} : { fontId: 'system' }),
      ...(typeof layer.fontVariantId === 'string' ? {} : { fontVariantId: 'system' }),
      ...(layer.textAlign === 'left' || layer.textAlign === 'center' || layer.textAlign === 'right' ? {} : { textAlign: 'left' }),
      ...(typeof layer.backgroundColor === 'string' || layer.backgroundColor === null ? {} : { backgroundColor: null }),
    };
    changed ||= JSON.stringify(next) !== JSON.stringify(layer);
    return next;
  });
  return changed ? { ...raw, layers } : raw;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
