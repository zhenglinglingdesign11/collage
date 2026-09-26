#!/usr/bin/env python3
"""Normalize the reviewed P2 CSV against stable first-release content IDs.

This builds a product decision record only. Runtime catalog metadata is never
an entitlement authority and this script does not change shipped assets.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'content/p2-content-review-source.v1.csv'
CATALOG = ROOT / 'generated/first-release-product-catalog.v1.json'
OUTPUT = ROOT / 'content/p2-content-entitlements.v1.json'

rows = list(csv.DictReader(SOURCE.open(encoding='utf-8-sig', newline='')))
packs = {pack['id']: pack for pack in json.loads(CATALOG.read_text())['packs']}
assert len(rows) == 130 and len({(row['kind'], row['id']) for row in rows}) == 130

numerals = '零一二三四五六七八九'
def numeric_id(value):
    if value.isdigit():
        return value
    if not value or any(char not in numerals + '十' for char in value):
        return None
    if value == '十':
        return '10'
    if value.startswith('十'):
        return str(10 + numerals.index(value[1]))
    if value.endswith('十'):
        return str(numerals.index(value[0]) * 10)
    if '十' in value:
        return str(numerals.index(value[0]) * 10 + numerals.index(value[2]))
    return ''.join(str(numerals.index(char)) for char in value)

def item_id(value, pack_id):
    value = value.strip().strip('。')
    value = value.replace('Playful Doodles ', 'playful-doodles-')
    value = value.replace('Cutout Frames & Cropping Accents ', 'cutout-frames-cropping-accents-')
    value = value.replace('_副本', '-copy')
    if value == '·3':
        return '3'  # user correction; same item already listed, not an extra grant
    match = re.fullmatch(r'([零一二三四五六七八九十]+)(-1)?', value)
    if match:
        value = numeric_id(match.group(1)) + (match.group(2) or '')
    if pack_id == 'digital-ui-1' and value.isdigit():
        value = f'sprite-{int(value):02d}'
    return value

# Explicit corrections to duplicated source tokens. Do not invent extra Free IDs
# to force the note's old ratio to match.
pending_removals = {
    'decorative-statement-lace': [f'decorative-statement-lace-{index}' for index in range(1, 4)],
    'decorative-statement-lace-1': ['17', '18', '19', '20'],
    'zhenzhi01': ['5', '16'],
    'xiangkuang-02': ['18'],
}
reviewed = {'templates': [], 'layouts': [], 'packs': [], 'fonts': [], 'effects': [], 'brushes': [], 'proceduralPacks': [], 'exports': []}
for row in rows:
    kind, ident, review = row['kind'], row['id'], row['review'].strip()
    if kind == 'style-kit':
        continue  # not shipped as a product capability
    if kind == 'internal-pack':
        continue  # internal template dependencies are not separately sold
    if kind == 'material-pack':
        pack = packs[ident]
        current = {item['itemId'] for item in pack['items']}
        if review.startswith('素材包下拆分'):
            text = review.split('免费：', 1)[1]
            tokens = [item_id(part, ident) for part in re.split(r'[，,、。\n]+', text) if part.strip()]
            if ident == 'editorial-connectors-index-marks':
                # CSV repeated 3 and 10; user changed second 10 to 30 and
                # confirmed 37 unique Free items.
                seen_3 = seen_10 = False
                corrected = []
                for token in tokens:
                    if token == '3':
                        if seen_3: continue
                        seen_3 = True
                    if token == '10':
                        if seen_10: token = '30'
                        seen_10 = True
                    corrected.append(token)
                tokens = corrected
            if ident == 'blue-01':
                seen_9 = False
                for index, token in enumerate(tokens):
                    if token == '9':
                        if seen_9: tokens[index] = '19'
                        seen_9 = True
            free = set(tokens)
        elif review.lower() == 'free':
            free = current
        elif review.lower() == 'premium':
            free = set()
        else:
            raise ValueError(f'Unrecognized pack review: {ident}: {review}')
        if ident == 'pixel-ascii':
            free.add('3-1')  # user correction for Free Digital Y2K ASCII template
        missing = free - current
        if missing:
            raise ValueError(f'Free item IDs not in {ident}: {sorted(missing)}')
        groups = pack['styles']
        note = row['备注'].lower()
        if 'visual foundation' in note:
            groups = ['visual-foundation']
        elif 'romantic deco' in note:
            groups = ['romantic-deco']
        elif 'indie zine' in note:
            groups = ['indie-zine']
        removals = pending_removals.get(ident, [])
        if set(removals) - current:
            raise ValueError(f'Removal IDs not in {ident}')
        if set(removals) & free:
            raise ValueError(f'Removal IDs marked Free in {ident}')
        reviewed['packs'].append({
            'id': ident, 'styles': groups, 'freeItemIds': sorted(free),
            'premiumItemIds': sorted(current - free),
            **({'pendingRemovalItemIds': removals} if removals else {}),
        })
        continue
    if kind == 'designed-template':
        status = review.lower()
        if ident == 'template://journalcollage/play-pop-multi':
            status = 'premium'  # user correction
        if status not in ('free', 'premium'):
            raise ValueError(f'Unrecognized template review: {ident}: {review}')
        reviewed['templates'].append({'id': ident, 'tier': status})
    elif kind == 'basic-layout':
        reviewed['layouts'].append({'id': ident, 'tier': 'free'})
    elif kind == 'font':
        reviewed['fonts'].append({'id': ident, 'tier': review.lower()})
    elif kind == 'effect':
        reviewed['effects'].append({'id': ident, 'tier': 'excluded' if review == '去掉该项' else review.lower()})
    elif kind == 'brush':
        reviewed['brushes'].append({'id': ident, 'tier': 'temporary-free' if review == '暂时Free' else review.lower()})
    elif kind == 'procedural-pack':
        reviewed['proceduralPacks'].append({'id': ident, 'tier': 'undecided' if review == '需确认' else review.lower()})
    elif kind == 'export':
        reviewed['exports'].append({'id': ident, 'tier': {'待规格': 'unimplemented', '固定边界': 'existing-free-boundary'}.get(review, review.lower())})
    else:
        raise ValueError(f'Unknown kind: {kind}')

assert sum(len(p['freeItemIds']) + len(p['premiumItemIds']) for p in reviewed['packs']) == 1312
assert sum(len(p.get('pendingRemovalItemIds', [])) for p in reviewed['packs']) == 10
assert next(p for p in reviewed['packs'] if p['id'] == 'editorial-connectors-index-marks')['freeItemIds'].__len__() == 37
reviewed['schemaVersion'] = 1
reviewed['source'] = 'content/p2-content-review-source.v1.csv + user corrections (2026-09-25)'
reviewed['templateFixedAssetRule'] = 'A Free template may use its bundled Premium decorative instances; separate additions from the material library still require Premium.'
free_by_pack = {pack['id']: set(pack['freeItemIds']) for pack in reviewed['packs']}
expected_paid_in_free = {
    'template://journalcollage/play-pop': {
        'asset://pack/candy-shapes/4', 'asset://pack/playful-doodles/3',
        'asset://pack/candy-shapes/1', 'asset://pack/candy-shapes/3',
        'asset://pack/playful-doodles/2', 'asset://pack/playful-doodles/12',
        'asset://pack/playful-doodles/14',
    },
    'template://journalcollage/soft-archive': {'asset://pack/editorial-everyday-labels/20'},
}
for template in reviewed['templates']:
    if template['tier'] != 'free':
        continue
    name = template['id'].split('/')[-1]
    definition = json.loads((ROOT / f'generated/template-recipes/{name}.template.json').read_text())
    paid = set()
    for dependency in definition['dependencies']:
        ref = dependency['reference']['id']
        match = re.fullmatch(r'asset://pack/([^/]+)/(.+)', ref)
        if match and match.group(1) in free_by_pack and match.group(2) not in free_by_pack[match.group(1)]:
            paid.add(ref)
    if paid != expected_paid_in_free.get(template['id'], set()):
        raise ValueError(f'Unexpected paid dependencies in Free template {template["id"]}: {sorted(paid)}')
reviewed['unreleasedCapabilities'] = ['style-kit.premium', 'export.high-resolution']
OUTPUT.write_text(json.dumps(reviewed, ensure_ascii=False, indent=2) + '\n')
print(f'Wrote {OUTPUT.relative_to(ROOT)}: {len(reviewed["packs"])} packs, {sum(len(p["freeItemIds"]) for p in reviewed["packs"])} Free items')
