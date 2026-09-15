/**
 * Product-layer fallback for the mini-program's remotely managed home feed.
 * URLs are preview-only: a Draft stores only the resulting effect/background
 * semantics, never these URLs or their cached file paths.
 */
export type HomeShowcaseEffect = 'creative-tear-paper' | 'screen-print' | 'matisse-cutout' | 'pixel-cross-stitch' | 'vintage-botanical' | 'lace-center' | 'foil-center' | 'emboss-circle' | 'emboss-stamp';
export type HomeShowcaseItem = Readonly<{ id: string; title: string; imageSrc?: string; effect?: HomeShowcaseEffect; backgroundPresetId?: string; hideTitle?: boolean }>;
export type HomeShowcaseGroup = Readonly<{ id: string; title: string; items: readonly HomeShowcaseItem[] }>;
export type HomeMarket = 'us' | 'cn';

// Cloudflare R2's public route treats query variants as separate cached
// objects. Keep these exact object URLs query-free.
export const HOME_SHOWCASE_MANIFEST_URL = 'https://assets.zllarchi.site/homecase/manifest.json';
export const HOME_SHOWCASE_EN_MANIFEST_URL = 'https://assets.zllarchi.site/homecase/manifest.en.json';
export const homeShowcaseManifestUrlForMarket = (market: HomeMarket): string => market === 'cn' ? HOME_SHOWCASE_MANIFEST_URL : HOME_SHOWCASE_EN_MANIFEST_URL;

const image = (id: string, title: string, path: string, effect: HomeShowcaseEffect, hideTitle = false): HomeShowcaseItem => ({ id, title, imageSrc: `https://assets.zllarchi.site/homecase/${path}`, effect, hideTitle });

const backgroundShowcaseGroupEn: HomeShowcaseGroup = { id: 'pattern-background', title: 'Play with Polka', items: [
  ['polka-cream-small', 'Cream Polka Dots'], ['polka-pink-heart', 'Soft Pink Hearts'], ['polka-ink-fine', 'Fine Black Dots'], ['polka-cream-star', 'Cream Stars'], ['polka-red-cross', 'Red Crosses'], ['pattern-local-24', 'Graphic Polka Pattern'],
].map(([backgroundPresetId, title]) => ({ id: `home-${backgroundPresetId}`, title, backgroundPresetId })) };
const backgroundShowcaseGroupCn: HomeShowcaseGroup = { id: 'pattern-background', title: '波点控看过来', items: [
  ['polka-cream-small', '奶油波点感'], ['polka-pink-heart', '爱心甜妹感'], ['polka-ink-fine', '黑白细波点'], ['polka-cream-star', '星星氛围感'], ['polka-red-cross', '红色十字感'], ['pattern-local-24', '图案波点感'],
].map(([backgroundPresetId, title]) => ({ id: `home-${backgroundPresetId}`, title, backgroundPresetId })) };

export const withBackgroundShowcaseGroup = (groups: readonly HomeShowcaseGroup[], market: HomeMarket): readonly HomeShowcaseGroup[] => {
  const backgroundShowcaseGroup = market === 'cn' ? backgroundShowcaseGroupCn : backgroundShowcaseGroupEn;
  if (groups.some((group) => group.id === backgroundShowcaseGroup.id)) return groups;
  const textureIndex = groups.findIndex((group) => group.id === 'texture');
  const insertIndex = textureIndex >= 0 ? textureIndex + 1 : Math.min(1, groups.length);
  return [...groups.slice(0, insertIndex), backgroundShowcaseGroup, ...groups.slice(insertIndex)];
};

export const fallbackHomeShowcaseGroups: readonly HomeShowcaseGroup[] = [
  { id: 'creative-tear-paper', title: '限时体验创意撕纸', items: [
    image('creative-tear-paper-01', '创意撕纸', '0811-sizhi/01.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-02', '水彩延展', '0811-sizhi/02.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-06', '纸感延展', '0811-sizhi/06.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-07', '自然撕边', '0811-sizhi/07.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-08', '水彩留白', '0811-sizhi/08.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-03', '手作纸感', '0811-sizhi/03.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-04', '杂志拼贴', '0811-sizhi/04.jpg?v=20260811d', 'creative-tear-paper', true), image('creative-tear-paper-05', '纸上风景', '0811-sizhi/05.jpg?v=20260811d', 'creative-tear-paper', true),
  ] },
  { id: 'texture', title: '颗粒一加，氛围到位', items: [
    image('texture-screen-print', '丝网印', '0806-zhigan/01.jpg?v=20260806', 'screen-print'), image('texture-matisse', '马蒂斯', '0806-zhigan/02.jpg', 'matisse-cutout'), image('texture-pixel-cross-stitch', '拼豆像素绣', '0806-zhigan/03.jpg', 'pixel-cross-stitch'), image('texture-botanical', '图鉴', '0806-zhigan/04.jpg', 'vintage-botanical'),
  ] },
  { id: 'lace', title: '一键拥有精致边框', items: [
    image('lace-circle', '圆形蕾丝框', '0806-jiegou/01.jpg', 'lace-center'), image('foil-crumpled', '圆形锡纸框', '0806-jiegou/02.jpg', 'foil-center'),
  ] },
  { id: 'emboss', title: '压花让照片更特别', items: [
    image('emboss-swap', '压花互换', '0806-yahua/01.jpg', 'emboss-circle'), image('emboss-circle', '圆形压花', '0806-yahua/02.jpg', 'emboss-circle'), image('emboss-stamp', '邮票压花', '0806-yahua/03.jpg', 'emboss-stamp'),
  ] },
];

const englishFallbackTitles: Readonly<Record<string, string>> = {
  'creative-tear-paper': 'Make It Your Own with Torn Paper',
  texture: 'Add Texture, Set the Mood',
  lace: 'A Refined Frame in One Tap',
  emboss: 'Give Your Photos an Embossed Finish',
  'texture-screen-print': 'Screen Print',
  'texture-matisse': 'Matisse Cutout',
  'texture-pixel-cross-stitch': 'Pixel Embroidery',
  'texture-botanical': 'Botanical Plate',
  'lace-circle': 'Round Lace Frame',
  'foil-crumpled': 'Round Foil Frame',
  'emboss-swap': 'Emboss Swap',
  'emboss-circle': 'Round Emboss',
  'emboss-stamp': 'Postage Stamp Emboss',
};

/** Synchronous seed data prevents a cold JS reload from reflowing the home list. */
export const fallbackHomeShowcaseGroupsForMarket = (market: HomeMarket): readonly HomeShowcaseGroup[] => market === 'cn' ? fallbackHomeShowcaseGroups : fallbackHomeShowcaseGroups.map((group) => ({
  ...group,
  title: englishFallbackTitles[group.id] ?? group.title,
  items: group.items.map((item) => ({ ...item, title: englishFallbackTitles[item.id] ?? item.title })),
}));

const knownEffects = new Set<HomeShowcaseEffect>(['creative-tear-paper', 'screen-print', 'matisse-cutout', 'pixel-cross-stitch', 'vintage-botanical', 'lace-center', 'foil-center', 'emboss-circle', 'emboss-stamp']);
const knownBackgroundPresetIds = new Set(['polka-cream-small', 'polka-pink-heart', 'polka-ink-fine', 'polka-cream-star', 'polka-red-cross', 'pattern-local-24']);

/** Accept only the public subset the native client can render safely. */
export const normalizeHomeShowcaseManifest = (payload: unknown): readonly HomeShowcaseGroup[] => {
  const data = typeof payload === 'string' ? (() => { try { return JSON.parse(payload) as unknown; } catch { return null; } })() : payload;
  const groups = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { groups?: unknown }).groups) ? (data as { groups: unknown[] }).groups : [];
  return groups.flatMap((group, groupIndex) => {
    if (!group || typeof group !== 'object') return [];
    const raw = group as { id?: unknown; title?: unknown; items?: unknown[] };
    const items = (Array.isArray(raw.items) ? raw.items : []).flatMap((item, itemIndex) => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as { id?: unknown; title?: unknown; imageSrc?: unknown; effect?: unknown; backgroundPresetId?: unknown; hideTitle?: unknown };
      const imageSrc = typeof candidate.imageSrc === 'string' && candidate.imageSrc.startsWith('https://') ? candidate.imageSrc : undefined;
      const backgroundPresetId = typeof candidate.backgroundPresetId === 'string' && knownBackgroundPresetIds.has(candidate.backgroundPresetId) ? candidate.backgroundPresetId : undefined;
      if (!imageSrc && !backgroundPresetId) return [];
      return [{ id: typeof candidate.id === 'string' ? candidate.id : `${groupIndex}-${itemIndex}`, title: typeof candidate.title === 'string' ? candidate.title : 'Creative inspiration', imageSrc, effect: typeof candidate.effect === 'string' && knownEffects.has(candidate.effect as HomeShowcaseEffect) ? candidate.effect as HomeShowcaseEffect : undefined, backgroundPresetId, hideTitle: candidate.hideTitle === true }];
    });
    return items.length ? [{ id: typeof raw.id === 'string' ? raw.id : String(groupIndex), title: typeof raw.title === 'string' ? raw.title : '创作效果', items }] : [];
  });
};
