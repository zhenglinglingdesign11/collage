const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { FakeEntitlementService, FakeEntitlementEventSink } = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/entitlements/index.js');
const { ProductEntryAccess, featureForProductEntry } = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/entitlements/productEntryAccess.js');
const catalog = require(path.resolve(__dirname, '../../../generated/first-release-product-catalog.v1.json'));
const free = () => new FakeEntitlementService({ status: 'free', checkedAt: 1 }, () => 1);

test('reviewed catalog IDs map to local features without using pack metadata', () => {
  for (const pack of catalog.packs.filter(pack => pack.visibility !== 'internal')) {
    for (const item of pack.items) {
      const feature = featureForProductEntry({ kind: 'material', id: item.reference.id });
      assert.ok(feature === 'material.standard' || feature === 'material.premium', item.reference.id);
    }
  }
  assert.equal(featureForProductEntry({ kind: 'template', id: 'template://journalcollage/play-pop' }), 'editor.core');
  assert.equal(featureForProductEntry({ kind: 'template', id: 'template://journalcollage/play-pop-multi' }), 'template.premium');
  assert.equal(featureForProductEntry({ kind: 'material', id: 'asset://pack/polka-paper-materials/pattern-local-1' }), 'material.standard');
  assert.equal(featureForProductEntry({ kind: 'material', id: 'asset://pack/missing/1' }), null);
  assert.equal(featureForProductEntry({ kind: 'effect', id: 'material.grain' }), null);
  assert.equal(featureForProductEntry({ kind: 'export', id: 'export.high-resolution' }), 'export.high-resolution');
});

test('batch addition waits for one paywall, refreshes once, then resumes once', async () => {
  const service = free();
  const sink = new FakeEntitlementEventSink();
  const access = new ProductEntryAccess(service, sink);
  let runs = 0;
  let refreshes = 0;
  const refresh = service.refresh.bind(service);
  service.refresh = async () => { refreshes++; return refresh(); };
  const entries = [
    { kind: 'material', id: 'asset://pack/romantic-deco-lace-frame-1/1' },
    { kind: 'material', id: 'asset://pack/romantic-deco-lace-frame-1/9' },
  ];
  assert.equal(access.request(entries, () => runs++).type, 'paywall');
  assert.equal(runs, 0);
  assert.equal(sink.events.filter(event => event.type === 'paywall.shown').length, 1);
  service.setOperationResult('purchase', { outcome: 'success' });
  service.setRefreshResult({ status: 'premium', checkedAt: 2 });
  const result = await access.complete('purchase', 'fake-premium');
  assert.equal(result.gate.type, 'allowed');
  assert.equal(refreshes, 1);
  assert.equal(runs, 1);
  assert.equal(await access.complete('purchase', 'fake-premium'), null);
});

test('cancel is normal, unknown and unreviewed entries stay closed', async () => {
  const service = free();
  const access = new ProductEntryAccess(service, new FakeEntitlementEventSink());
  let runs = 0;
  assert.equal(access.request({ kind: 'template', id: 'template://journalcollage/romantic-deco' }, () => runs++).type, 'paywall');
  service.setOperationResult('purchase', { outcome: 'cancelled' });
  assert.equal((await access.complete('purchase', 'fake-premium')).operation.outcome, 'cancelled');
  assert.equal(runs, 0);
  assert.equal(await access.complete('purchase', 'fake-premium'), null);
  service.setStatus({ status: 'unknown', checkedAt: 2 });
  assert.equal(access.request({ kind: 'template', id: 'template://journalcollage/romantic-deco' }, () => runs++).type, 'unavailable');
  assert.equal(access.request({ kind: 'material', id: 'asset://pack/unknown/1' }, () => runs++).type, 'unreviewed');
  assert.equal(access.request({ kind: 'export', id: 'export.high-resolution' }, () => runs++).type, 'unavailable');
  assert.equal(runs, 0);
});

test('Free template starts without granting separate Premium material additions', () => {
  const access = new ProductEntryAccess(free(), new FakeEntitlementEventSink());
  let starts = 0;
  assert.equal(access.request({ kind: 'template', id: 'template://journalcollage/play-pop' }, () => starts++).type, 'allowed');
  assert.equal(starts, 1);
  assert.equal(access.request({ kind: 'material', id: 'asset://pack/candy-shapes/4' }, () => starts++).type, 'paywall');
  assert.equal(starts, 1);
});

test('a mixed batch remains blocked if refresh unlocks only its first feature', async () => {
  const service = free();
  const access = new ProductEntryAccess(service, new FakeEntitlementEventSink());
  let runs = 0;
  const entries = [
    { kind: 'material', id: 'asset://pack/romantic-deco-lace-frame-1/9' },
    { kind: 'export', id: 'export.high-resolution' },
  ];
  assert.equal(access.request(entries, () => runs++).type, 'paywall');
  service.setOperationResult('purchase', { outcome: 'success' });
  service.setRefreshResult({ status: 'premium', checkedAt: 2 });
  const result = await access.complete('purchase', 'fake-premium');
  assert.equal(result.gate.type, 'unavailable');
  assert.equal(result.gate.reason, 'unreleased');
  assert.equal(runs, 0);
});

test('restore without purchases refreshes once and leaves the pending action blocked', async () => {
  const service = free();
  const access = new ProductEntryAccess(service, new FakeEntitlementEventSink());
  let runs = 0;
  let refreshes = 0;
  const refresh = service.refresh.bind(service);
  service.refresh = async () => { refreshes++; return refresh(); };
  assert.equal(access.request({ kind: 'template', id: 'template://journalcollage/romantic-deco' }, () => runs++).type, 'paywall');
  service.setOperationResult('restore', { outcome: 'success', reason: 'no-purchases' });
  const result = await access.complete('restore');
  assert.equal(result.operation.reason, 'no-purchases');
  assert.equal(result.gate.type, 'paywall');
  assert.equal(refreshes, 1);
  assert.equal(runs, 0);
});
