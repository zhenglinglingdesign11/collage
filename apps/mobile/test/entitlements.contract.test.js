const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FEATURE_CATALOG, FREE_USAGE_POLICY, OFFLINE_PREMIUM_TTL_MS, FakeEntitlementService, FakeEntitlementEventSink, PaywallCoordinator } = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/entitlements/index.js');
const now = 1000000000;
const snapshot = (status, extra = {}) => ({ status, checkedAt: now, ...extra });
test('complete feature and status matrix', () => {
  for (const status of ['free', 'premium', 'grace-period', 'expired', 'unknown', 'offline-cached']) {
    const service = new FakeEntitlementService(snapshot(status, { offlinePremiumConfirmedAt: now - 1000 }), () => now);
    for (const [feature, policy] of Object.entries(FEATURE_CATALOG)) {
      const decision = service.canUse(feature);
      const expected = policy === 'free' || (policy === 'premium-local' && ['premium', 'grace-period', 'offline-cached'].includes(status)) || (policy === 'server-metered' && !['unknown', 'offline-cached'].includes(status));
      assert.equal(decision.allowed, expected, `${status} ${feature}`);
      if (policy === 'server-metered' && decision.allowed) assert.equal(decision.requiresServerAuthorization, true);
    }
  }
});
test('offline TTL is bounded and server features stay denied', () => {
  for (const age of [0, OFFLINE_PREMIUM_TTL_MS - 1, OFFLINE_PREMIUM_TTL_MS, OFFLINE_PREMIUM_TTL_MS + 1]) {
    const service = new FakeEntitlementService(snapshot('offline-cached', { offlinePremiumConfirmedAt: now - age }), () => now);
    assert.equal(service.canUse('material.premium').allowed, age < OFFLINE_PREMIUM_TTL_MS);
    assert.equal(service.canUse('ai.generate').allowed, false);
    assert.equal(service.canUse('image.subject-cut').allowed, false);
  }
  const future = new FakeEntitlementService(snapshot('offline-cached', { offlinePremiumConfirmedAt: now + 1 }), () => now);
  assert.equal(future.canUse('material.premium').allowed, false);
});
test('observer deduplicates changes and unsubscribe works', () => {
  const service = new FakeEntitlementService(); let calls = 0;
  const unsubscribe = service.observeChanges(() => calls++);
  service.setStatus(snapshot('premium'));
  service.setStatus(snapshot('premium'));
  unsubscribe(); service.setStatus(snapshot('free'));
  assert.equal(calls, 1);
});
test('purchase, cancel, failure, restore with no history, and manage always refresh once', async () => {
  for (const [action, result] of [
    ['purchase', { outcome: 'success' }], ['purchase', { outcome: 'cancelled' }], ['purchase', { outcome: 'failed', reason: 'network' }],
    ['restore', { outcome: 'success', reason: 'no-purchases' }], ['manage', { outcome: 'success' }],
  ]) {
    const service = new FakeEntitlementService(snapshot('free'), () => now);
    service.setOperationResult(action, result);
    if (result.outcome === 'success' && result.reason !== 'no-purchases' && action !== 'manage') service.setRefreshResult(snapshot('premium'));
    let refreshes = 0; const refresh = service.refresh.bind(service);
    service.refresh = async () => { refreshes++; return refresh(); };
    const sink = new FakeEntitlementEventSink();
    const response = await new PaywallCoordinator(service, sink).complete('material.premium', action, 'fixture');
    assert.deepEqual(response.operation, result);
    assert.equal(refreshes, 1);
    assert.equal(response.gate.type, service.canUse('material.premium').allowed ? 'allowed' : 'paywall');
    assert.equal(sink.events.filter(event => event.type === 'entitlement.refreshed').length, 1);
  }
});

test('Free and expired may request server-metered features but never self-authorize usage', () => {
  for (const status of ['free', 'expired']) {
    const service = new FakeEntitlementService(snapshot(status), () => now);
    for (const feature of ['ai.generate', 'image.subject-cut', 'image.sticker-from-photo.remove-background']) {
      assert.deepEqual(service.canUse(feature), { allowed: true, feature, requiresServerAuthorization: true });
    }
  }
});

test('trusted Worker quota denial routes to contextual paywall', () => {
  const sink = new FakeEntitlementEventSink();
  const coordinator = new PaywallCoordinator(new FakeEntitlementService(snapshot('free'), () => now), sink);
  const result = coordinator.serverDenied({ feature: 'ai.generate', reason: 'free-quota-exhausted' });
  assert.deepEqual(result, { type: 'paywall', feature: 'ai.generate', reason: 'free-quota-exhausted' });
  assert.equal(sink.events[0].type, 'paywall.shown');
  assert.equal(coordinator.serverDenied({ feature: 'ai.generate', reason: 'premium-quota-exhausted' }).type, 'limit');
  assert.equal(sink.events.length, 1);
});

test('Free usage policy freezes the product limits without granting on-device access', () => {
  assert.equal(FREE_USAGE_POLICY['ai.generate'].limit, 3);
  assert.equal(FREE_USAGE_POLICY['ai.generate'].period, 'once-per-principal');
  assert.equal(FREE_USAGE_POLICY['image.subject-cut'].limit, 3);
  assert.equal(FREE_USAGE_POLICY['image.subject-cut'].period, 'utc-day');
  assert.equal(FREE_USAGE_POLICY['image.sticker-from-photo.remove-background'].sharedBucket, 'image.subject-cut');
});
