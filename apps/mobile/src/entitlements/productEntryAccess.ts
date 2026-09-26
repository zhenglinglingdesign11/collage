import { productBrushTier, productEffectTier, productFontTier, productMaterialTier, productProceduralPackTier, productTemplateTier } from '../productContentPolicy';
import { PaywallCoordinator, type EntitlementEventSink, type EntitlementService, type FeatureKey, type GateResult, type OperationResult } from './index';

export type ProductEntry = Readonly<{
  kind: 'template' | 'material' | 'font' | 'effect' | 'brush' | 'export';
  id: string;
}>;
export type EntryDecision = GateResult | Readonly<{ type: 'unreviewed'; entry: ProductEntry }>;

/** Product IDs are reviewed here; catalog metadata and template capabilities never grant access. */
export const featureForProductEntry = (entry: ProductEntry): FeatureKey | null => {
  if (entry.kind === 'export') return entry.id === 'export.standard' || entry.id === 'export.no-watermark'
    ? entry.id : entry.id === 'export.high-resolution' ? 'export.high-resolution' : null;
  if (entry.kind === 'material') {
    const tier = productMaterialTier(entry.id);
    if (tier === 'free') return 'material.standard';
    if (tier === 'premium') return 'material.premium';
    const packId = /^asset:\/\/pack\/([^/]+)\//.exec(entry.id)?.[1];
    return packId && productProceduralPackTier(packId) === 'free' ? 'material.standard' : null;
  }
  const tier = entry.kind === 'template' ? productTemplateTier(entry.id)
    : entry.kind === 'font' ? productFontTier(entry.id)
      : entry.kind === 'effect' ? productEffectTier(entry.id)
        : productBrushTier(entry.id);
  if (tier === 'free' || tier === 'temporary-free') return 'editor.core';
  if (tier !== 'premium') return null;
  return ({ template: 'template.premium', font: 'font.premium', effect: 'effect.premium', brush: 'brush.premium' } as const)[entry.kind as 'template' | 'font' | 'effect' | 'brush'];
};

/** Keeps the blocked action out of Draft state and retries it once after a verified refresh. */
export class ProductEntryAccess {
  private pending: { entries: readonly ProductEntry[]; run: () => void } | null = null;
  private readonly paywall: PaywallCoordinator;
  constructor(private readonly service: EntitlementService, sink: EntitlementEventSink) {
    this.paywall = new PaywallCoordinator(service, sink);
  }
  request(entries: ProductEntry | readonly ProductEntry[], run: () => void): EntryDecision {
    const batch = Array.isArray(entries) ? entries : [entries];
    if (batch.length === 0) { run(); return { type: 'allowed', decision: this.service.canUse('editor.core') }; }
    const reviewed = batch.map((entry) => ({ entry, feature: featureForProductEntry(entry) }));
    const missing = reviewed.find(({ feature }) => feature === null);
    if (missing) { this.pending = null; return { type: 'unreviewed', entry: missing.entry }; }
    const denied = reviewed.find(({ feature }) => !this.service.canUse(feature!).allowed);
    if (denied) {
      const result = this.paywall.gate(denied.feature!);
      this.pending = result.type === 'paywall' ? { entries: batch, run } : null;
      return result;
    }
    this.pending = null;
    run();
    return { type: 'allowed', decision: this.service.canUse(reviewed[0]?.feature ?? 'editor.core') };
  }
  async complete(action: 'purchase' | 'restore' | 'manage', packageId?: string): Promise<{ operation: OperationResult; gate: EntryDecision } | null> {
    const pending = this.pending;
    if (!pending) return null;
    const firstDenied = pending.entries.map(featureForProductEntry).find((feature) => feature && !this.service.canUse(feature).allowed);
    const feature = firstDenied ?? featureForProductEntry(pending.entries[0]);
    if (!feature) return null;
    const result = await this.paywall.complete(feature, action, packageId);
    if (this.pending !== pending) return { operation: result.operation, gate: result.gate };
    if (result.operation.outcome === 'cancelled') {
      this.pending = null;
      return result;
    }
    const blocked = pending.entries.find((entry) => {
      const candidate = featureForProductEntry(entry);
      return candidate === null || !this.service.canUse(candidate).allowed;
    });
    if (!blocked) {
      this.pending = null;
      pending.run();
      return result;
    }
    const blockedFeature = featureForProductEntry(blocked);
    return { operation: result.operation, gate: blockedFeature
      ? this.paywall.gate(blockedFeature)
      : { type: 'unreviewed', entry: blocked } };
  }
  dismiss(): void { this.pending = null; }
}
