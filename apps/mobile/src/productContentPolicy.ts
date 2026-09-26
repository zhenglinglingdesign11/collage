/** Reviewed product classification. This metadata never grants an entitlement. */
import reviewed from '../../../content/p2-content-entitlements.v1.json';

export type ProductTier = 'free' | 'premium' | 'temporary-free' | 'excluded' | 'unimplemented' | 'undecided';
const materialTiers = new Map<string, ProductTier>();
const retiredMaterialIds = new Set<string>();
for (const pack of reviewed.packs) {
  for (const itemId of pack.freeItemIds) materialTiers.set(`asset://pack/${pack.id}/${itemId}`, 'free');
  for (const itemId of pack.premiumItemIds) materialTiers.set(`asset://pack/${pack.id}/${itemId}`, 'premium');
  for (const itemId of pack.pendingRemovalItemIds ?? []) retiredMaterialIds.add(`asset://pack/${pack.id}/${itemId}`);
}
const tiersFor = (items: readonly { id: string; tier: string }[]): ReadonlyMap<string, ProductTier> =>
  new Map(items.map((item) => [item.id, item.tier as ProductTier]));
const templateTiers = tiersFor(reviewed.templates);
const fontTiers = tiersFor(reviewed.fonts);
const effectTiers = tiersFor(reviewed.effects);
const brushTiers = tiersFor(reviewed.brushes);
const proceduralPackTiers = tiersFor(reviewed.proceduralPacks);

export const productMaterialTier = (referenceId: string): ProductTier | undefined => materialTiers.get(referenceId);
export const productTemplateTier = (id: string): ProductTier | undefined => templateTiers.get(id);
export const productFontTier = (id: string): ProductTier | undefined => fontTiers.get(id);
export const productEffectTier = (id: string): ProductTier | undefined => effectTiers.get(id);
export const productBrushTier = (id: string): ProductTier | undefined => brushTiers.get(id);
export const productProceduralPackTier = (id: string): ProductTier | undefined => proceduralPackTiers.get(id);
/** Retired items remain in the verified resolver for saved Drafts. */
export const isRetiredMaterial = (referenceId: string): boolean => retiredMaterialIds.has(referenceId);
export const browseableMaterialAssets = <T extends { reference: { id: string } }>(assets: readonly T[]): readonly T[] =>
  assets.filter((asset) => !isRetiredMaterial(asset.reference.id));
