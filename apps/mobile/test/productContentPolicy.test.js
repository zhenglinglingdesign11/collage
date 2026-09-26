const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const policy = require('/private/tmp/journal-collage-mobile-portable-cjs/apps/mobile/src/productContentPolicy.js');
const catalog = require(path.resolve(__dirname, '../../../generated/first-release-product-catalog.v1.json'));
const reviewed = require(path.resolve(__dirname, '../../../content/p2-content-entitlements.v1.json'));

test('every shipped browseable item has exactly one reviewed tier', () => {
  const visible = catalog.packs.filter(pack => pack.visibility !== 'internal');
  for (const pack of visible) for (const item of pack.items) {
    assert.ok(['free', 'premium'].includes(policy.productMaterialTier(item.reference.id)), item.reference.id);
  }
  assert.equal(visible.reduce((sum, pack) => sum + pack.items.length, 0), 1312);
  assert.equal(reviewed.packs.reduce((sum, pack) => sum + pack.freeItemIds.length, 0), 437);
});
test('retired items are hidden from new browsing but retain resolver IDs', () => {
  const retired = reviewed.packs.flatMap(pack => (pack.pendingRemovalItemIds ?? []).map(id => `asset://pack/${pack.id}/${id}`));
  assert.equal(retired.length, 10);
  const browseable = catalog.packs.filter(pack => pack.visibility !== 'internal').flatMap(pack => policy.browseableMaterialAssets(pack.items));
  assert.equal(browseable.length, 1302);
  for (const id of retired) {
    assert.equal(policy.isRetiredMaterial(id), true);
    assert.ok(catalog.packs.some(pack => pack.items.some(item => item.reference.id === id)), id);
  }
});
test('reviewed template exception and unreleased content are represented', () => {
  assert.equal(policy.productTemplateTier('template://journalcollage/play-pop'), 'free');
  assert.equal(policy.productTemplateTier('template://journalcollage/play-pop-multi'), 'premium');
  assert.equal(policy.productMaterialTier('asset://pack/pixel-ascii/3-1'), 'free');
  assert.equal(policy.productMaterialTier('asset://pack/caise-01/1'), 'premium');
});
test('updated Free item decisions use stable IDs', () => {
  const expected = {
    'romantic-deco-lace-frame-1': ['1', '5', '6', '8'],
    'decorative-statement-lace': ['2', '16'],
    'decorative-statement-lace-1': ['2', '10', '12'],
    zhenzhi01: ['2', '4', '6', '7', '9', '10', '18', '23'],
    'xiangkuang-02': ['3', '4', '7', '9', '12'],
  };
  for (const [packId, freeIds] of Object.entries(expected)) {
    const pack = reviewed.packs.find(item => item.id === packId);
    assert.deepEqual([...pack.freeItemIds].sort(), [...freeIds].sort());
    for (const itemId of freeIds) assert.equal(policy.productMaterialTier(`asset://pack/${packId}/${itemId}`), 'free');
  }
});
test('confirmed duplicate items are absent from the shipped catalog and reviewed tiers', () => {
  const removed = {
    'structural-plastic-beads-mesh': ['3', '6'],
    zhiganxingxing: ['14'],
    'sanguangtiezhi-02': ['5', '20', '40'],
    'jieri-01': ['53', '54', '55', '56', '57'],
  };
  for (const [packId, itemIds] of Object.entries(removed)) {
    const pack = catalog.packs.find(item => item.id === packId);
    for (const itemId of itemIds) {
      const id = `asset://pack/${packId}/${itemId}`;
      assert.equal(pack.items.some(item => item.reference.id === id), false, id);
      assert.equal(policy.productMaterialTier(id), undefined, id);
    }
  }
});
