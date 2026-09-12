import type { AssetReference } from '@journalcollage/editor-core';

declare const require: (path: string) => unknown;

export type AssetPackCategory = 'recommended' | 'sticker' | 'tape' | 'note' | 'mixed' | 'frame' | 'paper';

export type ProceduralPaper = Readonly<{
  background: string;
  pattern: 'solid' | 'dot' | 'line' | 'square' | 'polka';
  foreground?: string;
  shape?: 'circle' | 'heart' | 'square' | 'diamond' | 'star' | 'cross' | 'image';
  opacity?: number;
  radius?: number;
  gap?: number;
  style?: 'solid' | 'soft' | 'outline';
  offset?: 'grid' | 'staggered';
  imageAsset?: '24' | '7' | '1';
}>;

/** A sticker composition expressed in stable product data, rather than a baked image. */
export type ProceduralSticker = Readonly<{
  shape: 'circle' | 'square' | 'triangle' | 'heart' | 'star' | 'sparkle' | 'flower' | 'raindrop' | 'diamond' | 'rounded' | 'cross' | 'tag';
  fillColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity: number;
  count: 1 | 3 | 6 | 9;
  layout: 'single' | 'row' | 'grid' | 'scatter';
  /** Resolver-only URL for the material variant; never persisted in a Draft. */
  textureSource?: string;
}>;

export type RemotePackItem = Readonly<{
  id: string;
  reference: AssetReference;
  source: string;
  width: number;
  height: number;
  procedural?: boolean;
  paper?: ProceduralPaper;
  sticker?: ProceduralSticker;
  action?: 'custom-solid-paper' | 'custom-polka-paper' | 'custom-basic-shape' | 'custom-material-shape';
}>;

export type RemoteAssetPack = Readonly<{
  id: string;
  name: string;
  category: Exclude<AssetPackCategory, 'recommended'>;
  cover: string;
  items: readonly RemotePackItem[];
  /** Native clients draw these previews instead of asking Image to decode SVG data URIs. */
  proceduralPreview?: 'solid-paper' | 'polka-paper' | 'grid-paper' | 'basic-shape' | 'material-shape';
}>;

const r2 = (path: string): string => `https://assets.zllarchi.site/packs/${path}`;

const remoteItem = (packId: string, fileName: string, width: number, height: number): RemotePackItem => ({
  id: `${packId}-${fileName.replace(/\.png$/, '')}`,
  reference: { id: `asset://pack/${packId}/${fileName.replace(/\.png$/, '')}`, kind: 'image', revision: '1' },
  source: r2(`${packId}/items/${fileName}`),
  width,
  height,
});

const paperSvg = (color: string, pattern = ''): string => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="580" height="760"><rect width="100%" height="100%" fill="${color}"/>${pattern === 'line' ? '<path d="M0 100H580M0 200H580M0 300H580M0 400H580M0 500H580M0 600H580" stroke="#d9d6cf" stroke-width="3"/>' : pattern === 'square' ? '<path d="M0 0V760M116 0V760M232 0V760M348 0V760M464 0V760M580 0V760M0 152H580M0 304H580M0 456H580M0 608H580" stroke="#d9d6cf" stroke-width="2"/>' : pattern === 'dot' ? '<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="#c9c5bc"/></pattern><rect width="100%" height="100%" fill="url(#p)"/>' : ''}</svg>`)}`;

const proceduralPaper = (packId: string, id: string, paper: ProceduralPaper): RemotePackItem => ({
  id,
  reference: { id: `asset://pack/${packId}/${id}`, kind: 'image', revision: '1' },
  source: paperSvg(paper.background, paper.pattern === 'solid' || paper.pattern === 'polka' ? (paper.pattern === 'polka' ? 'dot' : '') : paper.pattern), width: 580, height: 760, procedural: true, paper,
});

const stickerSvg = (sticker: ProceduralSticker): string => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340"><rect width="100%" height="100%" fill="transparent"/><circle cx="170" cy="170" r="82" fill="${sticker.fillColor}" opacity="${sticker.opacity}"/></svg>`)}`;
const proceduralSticker = (packId: string, id: string, sticker: ProceduralSticker): RemotePackItem => ({
  id,
  reference: { id: `asset://pack/${packId}/${id}`, kind: 'image', revision: '1' },
  source: stickerSvg(sticker),
  width: sticker.count > 1 ? 340 : 220,
  height: sticker.count > 1 ? 340 : 220,
  procedural: true,
  sticker,
});

export const createCustomSolidPaper = (color: string): RemotePackItem =>
  proceduralPaper('local-background-paper-materials', `custom-solid-${color.slice(1).toLowerCase()}`, { background: color, pattern: 'solid' });

export const createCustomPolkaPaper = (paper: ProceduralPaper): RemotePackItem => {
  const encoded = [paper.background, paper.foreground ?? '#111111', paper.shape ?? 'circle', paper.radius ?? 9, paper.gap ?? 48, paper.style ?? 'solid', paper.opacity ?? 0.64, paper.offset ?? 'grid']
    .map((part) => String(part) === 'transparent' ? 'transparent' : String(part).replace('#', '')).join('-');
  return proceduralPaper('polka-paper-materials', `custom-polka-${encoded}`, { ...paper, pattern: 'polka' });
};

const customSolidPaperAction: RemotePackItem = {
  id: 'paper-solid-custom-entry', reference: { id: 'asset://action/paper-solid-custom-entry', kind: 'image', revision: '1' }, source: '', width: 160, height: 160, action: 'custom-solid-paper',
};
const customPolkaPaperAction: RemotePackItem = {
  id: 'paper-polka-custom-entry', reference: { id: 'asset://action/paper-polka-custom-entry', kind: 'image', revision: '1' }, source: '', width: 160, height: 160, action: 'custom-polka-paper',
};

/**
 * Product-independent R2 material metadata. These stable IDs are the only
 * material identities allowed into Draft; URLs remain resolver data.
 */
const virtualNotePacks: readonly RemoteAssetPack[] = [
  {
    id: 'local-background-paper-materials', name: 'Basic paper', category: 'note', cover: paperSvg('#f4efe5'), proceduralPreview: 'solid-paper', items: [
      customSolidPaperAction,
      proceduralPaper('local-background-paper-materials', 'plain-warm', { background: '#fdfdfb', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-white', { background: '#ffffff', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-mist', { background: '#f7f7f5', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-cream', { background: '#f4efe5', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-pink', { background: '#f5dfd8', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-sage', { background: '#d7dbc9', pattern: 'solid' }),
      // Expanded shared paper palette. These IDs are used by both Notes and
      // the canvas background drawer, keeping the two surfaces in lockstep.
      proceduralPaper('local-background-paper-materials', 'plain-cloud', { background: '#eceff3', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-oat', { background: '#f6ead8', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-kraft', { background: '#efe2cb', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-butter', { background: '#fff2b8', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-peach', { background: '#ffd9bf', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-blush', { background: '#f8e7e4', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-rose', { background: '#f4b8c4', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-lilac', { background: '#eadcf8', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-sky', { background: '#dfe8ff', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-mint', { background: '#d7f0ed', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-moss', { background: '#dfeedd', pattern: 'solid' }),
      proceduralPaper('local-background-paper-materials', 'plain-teal', { background: '#b8d8d6', pattern: 'solid' }),
    ],
  },
  {
    id: 'polka-paper-materials', name: 'Polka paper', category: 'note', cover: paperSvg('#f8f4ec', 'dot'), proceduralPreview: 'polka-paper', items: [
      customPolkaPaperAction,
      proceduralPaper('polka-paper-materials', 'polka-cream-small', { background: '#fdf7ec', foreground: '#b79b75', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'circle', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-pink-heart', { background: '#f5dfd8', foreground: '#ffffff', radius: 5, gap: 32, opacity: 1, pattern: 'polka', shape: 'heart', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-ink-fine', { background: '#ffffff', foreground: '#111111', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'circle', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-sage-square', { background: '#d7dbc9', foreground: '#5f806f', radius: 5, gap: 32, opacity: 0.38, pattern: 'polka', shape: 'square', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-blue-diamond', { background: '#eaf1f6', foreground: '#6d9bc3', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'diamond', style: 'outline', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-cream-star', { background: '#fdf7ec', foreground: '#111111', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'star', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'polka-red-cross', { background: '#ffffff', foreground: '#d94a38', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'cross', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'pattern-local-24', { background: '#ffffff', foreground: '#111111', imageAsset: '24', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'image', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'pattern-local-7', { background: '#ffffff', foreground: '#111111', imageAsset: '7', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'image', style: 'solid', offset: 'grid' }),
      proceduralPaper('polka-paper-materials', 'pattern-local-1', { background: '#ffffff', foreground: '#111111', imageAsset: '1', radius: 5, gap: 32, opacity: 0.64, pattern: 'polka', shape: 'image', style: 'solid', offset: 'grid' }),
    ],
  },
];

const basicShapeTextures = [
  'https://assets.zllarchi.site/effects/shape-textures-01.png',
  'https://assets.zllarchi.site/effects/shape-textures-02.png',
  'https://assets.zllarchi.site/effects/shape-textures-03.png',
  'https://assets.zllarchi.site/effects/shape-textures-04.png',
  'https://assets.zllarchi.site/effects/shape-textures-05.png',
] as const;

const textureForId = (id: string): string | undefined => basicShapeTextures[Number(/^texture-(\d)$/.exec(id)?.[1]) - 1];

export const createCustomBasicShape = (sticker: ProceduralSticker, material: boolean): RemotePackItem => {
  const textureIndex = sticker.textureSource ? basicShapeTextures.indexOf(sticker.textureSource as typeof basicShapeTextures[number]) : -1;
  const textureId = textureIndex >= 0 ? `texture-${textureIndex + 1}` : 'none';
  const opacity = Math.round(sticker.opacity * 100);
  const fill = sticker.fillColor === 'transparent' ? 'transparent' : sticker.fillColor.replace('#', '');
  const id = `custom-${sticker.shape}-${fill}-${(sticker.strokeColor || 'none').replace('#', '')}-${sticker.strokeWidth ?? 0}-${opacity}-${sticker.count}-${sticker.layout}-${textureId}`;
  return proceduralSticker(material ? 'material-basic-shape-materials' : 'basic-shape-materials', id, sticker);
};

const customBasicShapeAction = (material: boolean): RemotePackItem => ({
  id: material ? 'material-basic-shape-custom-entry' : 'basic-shape-custom-entry',
  reference: { id: `asset://action/${material ? 'material-basic-shape' : 'basic-shape'}-custom-entry`, kind: 'image', revision: '1' },
  source: '', width: 160, height: 160, action: material ? 'custom-material-shape' : 'custom-basic-shape',
});

const basicShapeDefinitions: readonly (readonly [string, ProceduralSticker])[] = [
  ['basic-shape-circle-pink', { shape: 'circle', fillColor: '#f4b8c4', opacity: 1, count: 1, layout: 'single' }],
  ['basic-shape-square-soft', { shape: 'square', fillColor: '#bfe8db', opacity: 0.9, count: 1, layout: 'single' }],
  ['basic-shape-triangle-peach', { shape: 'triangle', fillColor: '#111111', opacity: 0.9, count: 1, layout: 'single' }],
  ['basic-shape-heart-row', { shape: 'heart', fillColor: '#ffd9bf', opacity: 0.82, count: 3, layout: 'row' }],
  ['basic-shape-star-scatter', { shape: 'star', fillColor: '#111111', opacity: 0.64, count: 9, layout: 'scatter' }],
  ['basic-shape-sparkle-mint', { shape: 'sparkle', fillColor: '#d7f0ed', strokeColor: '#111111', strokeWidth: 3, opacity: 1, count: 1, layout: 'single' }],
  ['basic-shape-flower-soft', { shape: 'flower', fillColor: '#eadcf8', strokeColor: '#ffffff', strokeWidth: 3, opacity: 0.9, count: 1, layout: 'single' }],
  ['basic-shape-raindrop-blue', { shape: 'raindrop', fillColor: '#dfe8ff', opacity: 1, count: 1, layout: 'single' }],
  ['basic-shape-diamond-blue', { shape: 'diamond', fillColor: '#111111', opacity: 1, count: 1, layout: 'single' }],
  ['basic-shape-rounded-cream', { shape: 'rounded', fillColor: '#fff2b8', strokeColor: '#111111', strokeWidth: 3, opacity: 0.92, count: 1, layout: 'single' }],
  ['basic-shape-plus-scatter', { shape: 'cross', fillColor: '#111111', opacity: 0.64, count: 9, layout: 'scatter' }],
  ['basic-shape-label', { shape: 'tag', fillColor: '#f2dfc6', strokeColor: '#111111', strokeWidth: 3, opacity: 1, count: 1, layout: 'single' }],
  ['basic-shape-sparkle-grid', { shape: 'sparkle', fillColor: '#d7f0ed', strokeColor: '#111111', strokeWidth: 3, opacity: 0.9, count: 9, layout: 'grid' }],
  ['basic-shape-flower-grid', { shape: 'flower', fillColor: '#eadcf8', strokeColor: '#ffffff', strokeWidth: 3, opacity: 0.9, count: 9, layout: 'grid' }],
  ['basic-shape-raindrop-grid', { shape: 'raindrop', fillColor: '#dfe8ff', opacity: 0.9, count: 9, layout: 'grid' }],
  ['basic-shape-diamond-grid', { shape: 'diamond', fillColor: '#111111', opacity: 0.82, count: 9, layout: 'grid' }],
];

const virtualStickerPacks: readonly RemoteAssetPack[] = [
  {
    id: 'basic-shape-materials', name: 'Basic shapes', category: 'sticker', cover: stickerSvg(basicShapeDefinitions[0][1]), proceduralPreview: 'basic-shape',
    items: [customBasicShapeAction(false), ...basicShapeDefinitions.map(([id, sticker]) => proceduralSticker('basic-shape-materials', id, sticker))],
  },
  {
    id: 'material-basic-shape-materials', name: 'Material shapes', category: 'sticker', cover: stickerSvg({ ...basicShapeDefinitions[0][1], fillColor: '#FFFFFF', textureSource: basicShapeTextures[0] }), proceduralPreview: 'material-shape',
    items: [customBasicShapeAction(true), ...basicShapeDefinitions.map(([id, sticker], index) => proceduralSticker('material-basic-shape-materials', `material-${id}`, { ...sticker, fillColor: '#FFFFFF', strokeColor: undefined, strokeWidth: 0, textureSource: basicShapeTextures[index % basicShapeTextures.length] }))],
  },
];

type MiniProgramPackDefinition = Readonly<{ id: string; name: string; category: string; baseUrl?: string; cover: string; items: readonly [string, number, number][] }>;

// The mini-program definitions are the shared source of truth for every R2
// pack. Metro watches the workspace, so this stays synchronized in development.
const miniProgramDefinitions = (require('../../../miniprogram-spike/miniprogram/config/assets/packs') as Readonly<{ imagePackDefinitions: readonly MiniProgramPackDefinition[] }>).imagePackDefinitions;
// The mini-program normalizes “内芯纸” into the visible “便签” category.
const miniCategoryMap: Readonly<Record<string, RemoteAssetPack['category']>> = { '贴纸': 'sticker', '胶带': 'tape', '便签': 'note', '主题混装': 'mixed', '相框': 'frame', '内芯纸': 'note' };
const categoryFor = (category: string): RemoteAssetPack['category'] => miniCategoryMap[category] ?? 'sticker';
const localGridPaperItems = (): readonly RemotePackItem[] => [
  proceduralPaper('paper-04', 'grid-dot', { background: '#fdfdfb', pattern: 'dot' }),
  proceduralPaper('paper-04', 'grid-line', { background: '#ffffff', pattern: 'line' }),
  proceduralPaper('paper-04', 'grid-square', { background: '#f7f7f5', pattern: 'square' }),
];
const packFromMiniProgram = (definition: MiniProgramPackDefinition): RemoteAssetPack => {
  const baseUrl = definition.baseUrl ?? r2(definition.id);
  const displayNameById: Readonly<Record<string, string>> = {
    'biantie-01': 'Sulfur paper',
    papers: 'Vintage papers',
  };
  return {
    id: definition.id,
    name: displayNameById[definition.id] ?? definition.name,
    category: categoryFor(definition.category),
    cover: `${baseUrl}/${definition.cover}`,
    items: [
      ...definition.items.map(([fileName, width, height]) => ({
      ...remoteItem(definition.id, fileName, width, height),
      source: `${baseUrl}/items/${fileName}`,
      })),
      ...(definition.id === 'paper-04' ? localGridPaperItems() : []),
    ],
  };
};

const miniProgramRemoteAssetPacks = miniProgramDefinitions.map(packFromMiniProgram);
const takePack = (id: string): RemoteAssetPack | undefined => miniProgramRemoteAssetPacks.find((pack) => pack.id === id);
const notePackIdsPlacedFirst = new Set(['biantie-01', 'papers']);

export const remoteAssetPacks: readonly RemoteAssetPack[] = [
  // Match the material drawer's intentional Notes order.  These are package
  // records, not one synthetic "Basic paper" bucket, so each opens its own grid.
  virtualNotePacks[0],
  virtualNotePacks[1],
  takePack('biantie-01'),
  takePack('papers'),
  ...virtualStickerPacks,
  ...miniProgramRemoteAssetPacks.filter((pack) => !notePackIdsPlacedFirst.has(pack.id)),
].filter((pack): pack is RemoteAssetPack => pack !== undefined);

/**
 * The mini-program's background sheet is a curated view of the same paper
 * inventory shown under Notes.  Keep this mapping here so clients do not
 * duplicate R2 URLs or accidentally turn background resources into layers.
 */
export type BackgroundMaterialCategory = 'plain' | 'polka' | 'grid' | 'paper' | 'pattern';
export const backgroundMaterialPacks: Readonly<Record<Exclude<BackgroundMaterialCategory, 'plain' | 'polka'>, readonly RemoteAssetPack[]>> = {
  grid: remoteAssetPacks.filter((pack) => pack.id === 'paper-02' || pack.id === 'paper-04'),
  paper: remoteAssetPacks.filter((pack) => pack.id === 'paper-05'),
  pattern: remoteAssetPacks.filter((pack) => pack.id === 'paper-01' || pack.id === 'paper-03'),
};

export const backgroundPaperPack = (category: Extract<BackgroundMaterialCategory, 'plain' | 'polka'>): RemoteAssetPack =>
  remoteAssetPacks.find((pack) => pack.id === (category === 'plain' ? 'local-background-paper-materials' : 'polka-paper-materials'))!;

/** Matches the mini-program's fixed Recommended order; virtual packs stay category-only. */
export const recommendedRemoteAssetPackIds = new Set([
  'blue-01', 'fugu-02', 'fugu-03', 'youpiao-01', 'caise-01', 'troy-01', 'hudiejie',
  'leisi', 'zhiganxingxing', 'blingshuijing', 'jiaodai', 'biantie-01', 'xiangkuang-02',
]);

export const remoteAssetUriMap = (): Readonly<Record<string, string>> =>
  Object.fromEntries(remoteAssetPacks.flatMap((pack) => pack.items.filter((item) => item.action === undefined).map((item) => [item.reference.id, item.source])));

/** Renderer input derived from stable asset identities; it never enters a Draft. */
export const proceduralPaperMap = (): Readonly<Record<string, ProceduralPaper>> =>
  Object.fromEntries(remoteAssetPacks.flatMap((pack) => pack.items.flatMap((item) => item.paper ? [[item.reference.id, item.paper] as const] : [])));

export const proceduralPaperForReferenceId = (referenceId: string): ProceduralPaper | undefined => {
  const builtIn = proceduralPaperMap()[referenceId];
  if (builtIn !== undefined) return builtIn;
  const customColor = /^asset:\/\/pack\/local-background-paper-materials\/custom-solid-([0-9a-f]{6})$/i.exec(referenceId)?.[1];
  if (customColor) return { background: `#${customColor}`, pattern: 'solid' };
  const polka = /^asset:\/\/pack\/polka-paper-materials\/custom-polka-(transparent|[0-9a-f]{6})-([0-9a-f]{6})-(circle|heart|square|diamond|star|cross)-(\d+)-(\d+)-(solid|soft|outline)-(0\.\d+|1)-(grid|staggered)$/i.exec(referenceId);
  return polka ? { background: polka[1] === 'transparent' ? 'transparent' : `#${polka[1]}`, foreground: `#${polka[2]}`, pattern: 'polka', shape: polka[3] as ProceduralPaper['shape'], radius: Number(polka[4]), gap: Number(polka[5]), style: polka[6] as ProceduralPaper['style'], opacity: Number(polka[7]), offset: polka[8] as ProceduralPaper['offset'] } : undefined;
};

export const proceduralStickerMap = (): Readonly<Record<string, ProceduralSticker>> =>
  Object.fromEntries(remoteAssetPacks.flatMap((pack) => pack.items.flatMap((item) => item.sticker ? [[item.reference.id, item.sticker] as const] : [])));

export const proceduralStickerForReferenceId = (referenceId: string): ProceduralSticker | undefined => {
  const builtIn = proceduralStickerMap()[referenceId];
  if (builtIn !== undefined) return builtIn;
  const custom = /^asset:\/\/pack\/(basic-shape-materials|material-basic-shape-materials)\/custom-(circle|square|triangle|heart|star|sparkle|flower|raindrop|diamond|rounded|cross|tag)-(transparent|[0-9a-f]{6})-(none|[0-9a-f]{6})-(\d+)-(\d+)-(1|3|6|9)-(single|row|grid|scatter)-(none|texture-[1-5])$/i.exec(referenceId);
  if (!custom) return undefined;
  const [, packId, shape, fill, stroke, strokeWidth, opacity, count, layout, textureId] = custom;
  return {
    shape: shape as ProceduralSticker['shape'], fillColor: fill === 'transparent' ? 'transparent' : `#${fill}`, strokeColor: stroke === 'none' ? undefined : `#${stroke}`, strokeWidth: Number(strokeWidth), opacity: Number(opacity) / 100,
    count: Number(count) as ProceduralSticker['count'], layout: layout as ProceduralSticker['layout'],
    textureSource: packId === 'material-basic-shape-materials' && textureId !== 'none' ? textureForId(textureId) : undefined,
  };
};

export const ASSET_CATALOG_VERSION = 1 as const;

/** Runtime location belongs to the catalog, never to a Draft. */
export type LocalAssetRecord = Readonly<{
  reference: AssetReference;
  originalUri: string;
  width: number;
  height: number;
  mimeType: string | null;
  createdAt: string;
}>;

export type AssetCatalog = Readonly<{
  version: typeof ASSET_CATALOG_VERSION;
  assets: readonly LocalAssetRecord[];
}>;

export const emptyAssetCatalog = (): AssetCatalog => ({ version: ASSET_CATALOG_VERSION, assets: [] });

export const upsertAsset = (catalog: AssetCatalog, record: LocalAssetRecord): AssetCatalog => ({
  ...catalog,
  assets: [...catalog.assets.filter((asset) => asset.reference.id !== record.reference.id), record],
});

export const assetUriMap = (catalog: AssetCatalog): Readonly<Record<string, string>> =>
  Object.fromEntries(catalog.assets.map((asset) => [asset.reference.id, asset.originalUri]));
