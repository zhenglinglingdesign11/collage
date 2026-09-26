/** P2 product policy. Vendor, catalogue metadata and template compatibility never grant access. */
export const OFFLINE_PREMIUM_TTL_MS = 24 * 60 * 60 * 1000;
/** Product policy for the future Worker ledger; never use these values as client-side authorization. */
export const FREE_USAGE_POLICY = {
  'ai.generate': { limit: 3, period: 'once-per-principal' },
  'image.subject-cut': { limit: 3, period: 'utc-day' },
  'image.sticker-from-photo.remove-background': { limit: 3, period: 'utc-day', sharedBucket: 'image.subject-cut' },
} as const;
export const FEATURE_CATALOG = {
  'editor.core': 'free', 'export.standard': 'free', 'material.standard': 'free',
  'image.sticker-from-photo.basic': 'free',
  'template.premium': 'premium-local', 'style-kit.premium': 'unreleased', 'font.premium': 'premium-local',
  'material.premium': 'premium-local', 'effect.premium': 'premium-local',
  'brush.premium': 'premium-local', 'export.high-resolution': 'unreleased',
  'export.no-watermark': 'free',
  'image.sticker-from-photo.remove-background': 'server-metered',
  'image.subject-cut': 'server-metered', 'ai.generate': 'server-metered',
  'cloud-backup': 'unreleased', 'cloud.restore': 'unreleased', 'cloud.sync': 'unreleased',
} as const;
export type FeatureKey = keyof typeof FEATURE_CATALOG;
export type EntitlementStatus = 'free' | 'premium' | 'grace-period' | 'expired' | 'unknown' | 'offline-cached';
export type DenialReason = 'premium-required' | 'expired' | 'unknown' | 'offline-expired' | 'server-verification-required' | 'free-quota-exhausted' | 'premium-quota-exhausted' | 'offline' | 'unreleased';
export type FeatureDecision = { allowed: true; feature: FeatureKey; requiresServerAuthorization: boolean } | { allowed: false; feature: FeatureKey; reason: DenialReason; retryable: boolean };
export type EntitlementSnapshot = { status: EntitlementStatus; checkedAt: number; offlinePremiumConfirmedAt?: number };
export type OperationResult = { outcome: 'success' | 'cancelled' | 'failed' | 'unavailable'; reason?: 'no-purchases' | 'network' | 'unsupported' | 'unknown' };
export type Unsubscribe = () => void;
export interface EntitlementService {
  getStatus(): EntitlementSnapshot;
  canUse(feature: FeatureKey): FeatureDecision;
  refresh(): Promise<EntitlementSnapshot>;
  observeChanges(listener: (snapshot: EntitlementSnapshot) => void): Unsubscribe;
  purchase(packageId: string): Promise<OperationResult>;
  restorePurchases(): Promise<OperationResult>;
  manageSubscription(): Promise<OperationResult>;
}
export function decideFeature(feature: FeatureKey, snapshot: EntitlementSnapshot, now: number): FeatureDecision {
  const policy = FEATURE_CATALOG[feature];
  const deny = (reason: DenialReason, retryable = false): FeatureDecision => ({ allowed: false, feature, reason, retryable });
  if (policy === 'unreleased') return deny('unreleased');
  if (policy === 'free') return { allowed: true, feature, requiresServerAuthorization: false };
  if (policy === 'server-metered') {
    if (snapshot.status === 'offline-cached') return deny('offline', true);
    if (snapshot.status === 'unknown') return deny('unknown', true);
    // Admission to the Worker only. Free quota and Premium quota are checked server-side.
    return { allowed: true, feature, requiresServerAuthorization: true };
  }
  if (snapshot.status === 'premium' || snapshot.status === 'grace-period') return { allowed: true, feature, requiresServerAuthorization: false };
  if (snapshot.status === 'offline-cached') {
    const confirmed = snapshot.offlinePremiumConfirmedAt;
    return confirmed !== undefined && now >= confirmed && now - confirmed < OFFLINE_PREMIUM_TTL_MS
      ? { allowed: true, feature, requiresServerAuthorization: false }
      : deny('offline-expired', true);
  }
  if (snapshot.status === 'unknown') return deny('unknown', true);
  return deny(snapshot.status === 'expired' ? 'expired' : 'premium-required');
}

/** Deterministic test and development adapter; never backed by a store. */
export class FakeEntitlementService implements EntitlementService {
  private listeners = new Set<(snapshot: EntitlementSnapshot) => void>();
  private results: Record<'purchase' | 'restore' | 'manage', OperationResult> = {
    purchase: { outcome: 'unavailable', reason: 'unsupported' },
    restore: { outcome: 'unavailable', reason: 'unsupported' },
    manage: { outcome: 'unavailable', reason: 'unsupported' },
  };
  private refreshSnapshot?: EntitlementSnapshot;
  constructor(private snapshot: EntitlementSnapshot = { status: 'unknown', checkedAt: 0 }, private readonly now: () => number = Date.now) {}
  getStatus(): EntitlementSnapshot { return { ...this.snapshot }; }
  canUse(feature: FeatureKey): FeatureDecision { return decideFeature(feature, this.snapshot, this.now()); }
  observeChanges(listener: (snapshot: EntitlementSnapshot) => void): Unsubscribe { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  setStatus(snapshot: EntitlementSnapshot): void {
    if (JSON.stringify(snapshot) === JSON.stringify(this.snapshot)) return;
    this.snapshot = { ...snapshot };
    for (const listener of [...this.listeners]) listener(this.getStatus());
  }
  setRefreshResult(snapshot: EntitlementSnapshot): void { this.refreshSnapshot = { ...snapshot }; }
  setOperationResult(operation: 'purchase' | 'restore' | 'manage', result: OperationResult): void { this.results[operation] = result; }
  async refresh(): Promise<EntitlementSnapshot> { if (this.refreshSnapshot) this.setStatus(this.refreshSnapshot); return this.getStatus(); }
  async purchase(_packageId: string): Promise<OperationResult> { return { ...this.results.purchase }; }
  async restorePurchases(): Promise<OperationResult> { return { ...this.results.restore }; }
  async manageSubscription(): Promise<OperationResult> { return { ...this.results.manage }; }
}

export type EntitlementEvent = { type: 'paywall.shown' | 'purchase.started' | 'purchase.completed' | 'purchase.cancelled' | 'purchase.failed' | 'restore.started' | 'restore.completed' | 'restore.failed' | 'entitlement.refreshed' | 'entitlement.changed'; feature?: FeatureKey; status?: EntitlementStatus; reason?: DenialReason };
export interface EntitlementEventSink { emit(event: EntitlementEvent): void }
export class FakeEntitlementEventSink implements EntitlementEventSink {
  readonly events: EntitlementEvent[] = [];
  emit(event: EntitlementEvent): void { this.events.push({ ...event }); }
}
export type ServerUsageDenial = { feature: 'ai.generate' | 'image.subject-cut' | 'image.sticker-from-photo.remove-background'; reason: 'free-quota-exhausted' | 'premium-quota-exhausted' };
export type GateResult = { type: 'allowed'; decision: FeatureDecision } | { type: 'paywall' | 'unavailable' | 'limit'; feature: FeatureKey; reason: DenialReason };
export class PaywallCoordinator {
  constructor(private readonly service: EntitlementService, private readonly sink: EntitlementEventSink) {}
  gate(feature: FeatureKey): GateResult {
    const decision = this.service.canUse(feature);
    if (decision.allowed) return { type: 'allowed', decision };
    if (decision.reason !== 'premium-required' && decision.reason !== 'expired') return { type: 'unavailable', feature, reason: decision.reason };
    this.sink.emit({ type: 'paywall.shown', feature, reason: decision.reason });
    return { type: 'paywall', feature, reason: decision.reason };
  }
  /** Called only with a trusted Worker denial; client counters cannot create a grant. */
  serverDenied(denial: ServerUsageDenial): GateResult {
    if (denial.reason === 'premium-quota-exhausted') return { type: 'limit', feature: denial.feature, reason: denial.reason };
    this.sink.emit({ type: 'paywall.shown', feature: denial.feature, reason: denial.reason });
    return { type: 'paywall', feature: denial.feature, reason: denial.reason };
  }
  async complete(feature: FeatureKey, action: 'purchase' | 'restore' | 'manage', packageId?: string): Promise<{ operation: OperationResult; gate: GateResult }> {
    if (action === 'purchase') this.sink.emit({ type: 'purchase.started', feature });
    if (action === 'restore') this.sink.emit({ type: 'restore.started', feature });
    let operation: OperationResult;
    try {
      operation = action === 'purchase' ? await this.service.purchase(packageId ?? '') : action === 'restore' ? await this.service.restorePurchases() : await this.service.manageSubscription();
    } catch { operation = { outcome: 'failed', reason: 'unknown' }; }
    if (action === 'purchase') this.sink.emit({ type: `purchase.${operation.outcome === 'success' ? 'completed' : operation.outcome === 'cancelled' ? 'cancelled' : 'failed'}`, feature });
    if (action === 'restore') this.sink.emit({ type: `restore.${operation.outcome === 'failed' ? 'failed' : 'completed'}`, feature });
    const before = this.service.getStatus().status;
    const after = await this.service.refresh();
    this.sink.emit({ type: 'entitlement.refreshed', status: after.status });
    if (before !== after.status) this.sink.emit({ type: 'entitlement.changed', status: after.status });
    return { operation, gate: this.gate(feature) };
  }
}
