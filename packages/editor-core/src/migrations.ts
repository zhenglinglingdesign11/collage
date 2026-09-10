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
  const draft = raw as Draft;
  const issues = validateDraft(draft);
  return issues.length === 0 ? { ok: true, draft, migrated: false } : { ok: false, issues };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
