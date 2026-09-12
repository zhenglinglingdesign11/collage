import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { recommendedRemoteAssetPackIds, remoteAssetPacks, type AssetPackCategory, type RemoteAssetPack, type RemotePackItem } from '@journalcollage/asset-system';
import { productColor, productSpace } from './tokens';
import { ProceduralItemPreview, ProceduralPackPreview } from './ProceduralMaterialPreview';
import { CachedRemoteImage } from './CachedRemoteImage';

type LibraryCategory = AssetPackCategory | 'favorites';

const categories: readonly Readonly<{ id: LibraryCategory; label: string }>[] = [
  { id: 'recommended', label: 'Recommended' }, { id: 'favorites', label: 'Favorites' }, { id: 'sticker', label: 'Stickers' },
  { id: 'tape', label: 'Tape' }, { id: 'note', label: 'Notes' }, { id: 'mixed', label: 'Mixed' }, { id: 'frame', label: 'Frames' },
];

/** Product catalogue backed by the exact pack records and cache used by editor. */
export const AssetsLibrary = ({ entryContext, onCreateWithItems, onDetailChange, onReturnToOrigin }: Readonly<{ entryContext: 'create' | 'editor' | null; onCreateWithItems: (items: readonly RemotePackItem[]) => void; onDetailChange: (open: boolean) => void; onReturnToOrigin: () => void }>) => {
  const [category, setCategory] = useState<LibraryCategory>('recommended');
  const [activePack, setActivePack] = useState<RemoteAssetPack | null>(null);
  const [favoritePackIds, setFavoritePackIds] = useState<ReadonlySet<string>>(() => new Set());
  const packs = useMemo(() => {
    if (category === 'favorites') return remoteAssetPacks.filter((pack) => favoritePackIds.has(pack.id));
    return category === 'recommended'
      ? remoteAssetPacks.filter((pack) => recommendedRemoteAssetPackIds.has(pack.id))
      : remoteAssetPacks.filter((pack) => pack.category === category);
  }, [category, favoritePackIds]);
  const toggleFavorite = (packId: string) => setFavoritePackIds((current) => {
    const next = new Set(current);
    if (next.has(packId)) next.delete(packId); else next.add(packId);
    return next;
  });
  if (activePack !== null) return <PackDetail isFavorite={favoritePackIds.has(activePack.id)} pack={activePack} onAddItems={onCreateWithItems} onBack={() => { setActivePack(null); onDetailChange(false); }} onToggleFavorite={() => toggleFavorite(activePack.id)} />;
  return <View style={styles.page}>
    {entryContext !== null && <Pressable accessibilityLabel={entryContext === 'create' ? 'Return to Create' : 'Return to canvas'} hitSlop={10} onPress={onReturnToOrigin} style={styles.originBack}><Text style={styles.originBackGlyph}>‹</Text><Text style={styles.originBackLabel}>{entryContext === 'create' ? 'Back to Create' : 'Back to canvas'}</Text></Pressable>}
    <Text style={styles.title}>Materials</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} style={styles.categoryRail}>
      {categories.map((entry) => <Pressable key={entry.id} onPress={() => setCategory(entry.id)} style={styles.categoryButton}><Text style={[styles.categoryLabel, category === entry.id && styles.categoryLabelActive]}>{entry.label}</Text></Pressable>)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.packGrid} showsVerticalScrollIndicator={false} style={styles.packList}>
      {packs.map((pack) => <Pressable key={pack.id} accessibilityLabel={`Open ${pack.name}`} onPress={() => { setActivePack(pack); onDetailChange(true); }} style={styles.packCard}>{pack.proceduralPreview ? <ProceduralPackPreview pack={pack} /> : <CachedRemoteImage cacheKey={`cover-${pack.id}`} source={pack.cover} style={styles.packCover} />}</Pressable>)}
      {packs.length === 0 && <Text style={styles.empty}>No saved material packs yet.</Text>}
    </ScrollView>
  </View>;
};

const PackDetail = ({ isFavorite, pack, onAddItems, onBack, onToggleFavorite }: Readonly<{ isFavorite: boolean; pack: RemoteAssetPack; onAddItems: (items: readonly RemotePackItem[]) => void; onBack: () => void; onToggleFavorite: () => void }>) => {
  const [boardWidth, setBoardWidth] = useState(0);
  const [selectedItemIds, setSelectedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const items = useMemo(() => pack.items.filter((item) => item.action === undefined), [pack.items]);
  const layout = useMemo(() => layoutScatteredPieces(items, boardWidth), [boardWidth, items]);
  return <View style={styles.page}>
  <View style={styles.detailHeader}>
    <Pressable accessibilityLabel="Back to materials" hitSlop={12} onPress={onBack} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable>
    <Text numberOfLines={1} style={styles.detailTitle}>{pack.name}</Text>
    <Pressable accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'} hitSlop={12} onPress={onToggleFavorite} style={styles.favorite}><Text style={[styles.favoriteGlyph, isFavorite && styles.favoriteGlyphActive]}>{isFavorite ? '★' : '☆'}</Text></Pressable>
  </View>
  <View onLayout={(event: LayoutChangeEvent) => setBoardWidth(event.nativeEvent.layout.width)} style={styles.detailBoard}>
    <ScrollView contentContainerStyle={styles.itemGrid} showsVerticalScrollIndicator={false} style={styles.detailList}>
      <View style={[styles.paperCanvas, { height: layout.height }]}>
        {layout.pieces.map(({ item, left, rotate, top, height, width }) => <Pressable key={item.id} accessibilityLabel={`Select ${item.id}`} accessibilityState={{ selected: selectedItemIds.has(item.id) }} onPress={() => setSelectedItemIds((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} style={[styles.itemTile, selectedItemIds.has(item.id) && styles.itemTileSelected, { height, left, top, transform: [{ rotate: `${rotate}deg` }], width }]}>
          {item.procedural ? <ProceduralItemPreview item={item} /> : <CachedRemoteImage cacheKey={`item-${item.reference.id}`} source={item.source} style={styles.itemImage} />}
        </Pressable>)}
      </View>
    </ScrollView>
  </View>
  <View style={styles.addBar}><Pressable accessibilityLabel="Add selected materials to canvas" disabled={selectedItemIds.size === 0} onPress={() => onAddItems(items.filter((item) => selectedItemIds.has(item.id)))} style={[styles.addButton, selectedItemIds.size === 0 && styles.addButtonDisabled]}><Text style={[styles.addButtonLabel, selectedItemIds.size === 0 && styles.addButtonLabelDisabled]}>{selectedItemIds.size === 0 ? 'Add to canvas' : `Add ${selectedItemIds.size} to canvas`}</Text></Pressable></View>
</View>;
};

type ScatteredPiece = Readonly<{ item: RemotePackItem; left: number; top: number; width: number; height: number; rotate: number }>;
const paperBaseWidth = 670;
const scatterOffsets = [
  { x: -6, y: 0, rotate: -7 }, { x: 12, y: 12, rotate: 5 }, { x: 4, y: -4, rotate: -3 },
  { x: -10, y: 10, rotate: 6 }, { x: 8, y: 4, rotate: -6 }, { x: -4, y: 14, rotate: 4 },
] as const;

/** Port of the mini-program's deterministic detail-paper placement algorithm. */
const layoutScatteredPieces = (items: readonly RemotePackItem[], boardWidth: number): Readonly<{ pieces: readonly ScatteredPiece[]; height: number }> => {
  // Avoid a full-size first frame before native layout reports the paper width.
  const scale = boardWidth > 0 ? boardWidth / paperBaseWidth : 0;
  const sizeFor = (item: RemotePackItem) => {
    const sourceWidth = Math.max(1, item.width || 160); const sourceHeight = Math.max(1, item.height || 160); const ratio = sourceWidth / sourceHeight;
    let maxWidth = 176; let maxHeight = 176;
    if (ratio >= 2.2) { maxWidth = 300; maxHeight = 124; }
    else if (ratio <= 0.35) { maxWidth = 122; maxHeight = 410; }
    else if (ratio <= 0.65) { maxWidth = 146; maxHeight = 270; }
    else if (ratio >= 1.45) { maxWidth = 236; maxHeight = 150; }
    const fit = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    return { width: Math.max(88, Math.round(sourceWidth * fit)), height: Math.max(88, Math.round(sourceHeight * fit)) };
  };
  const assets = items.map((item, index) => ({ item, index, size: sizeFor(item) }));
  const placed: ScatteredPiece[] = [];
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  let y = 52; let index = 0;
  while (index < assets.length) {
    const current = assets[index];
    const fullRow = current.size.width > 250 || current.size.height > 285;
    const row = fullRow || index + 1 >= assets.length || assets[index + 1].size.width > 250 || assets[index + 1].size.height > 285 ? [current] : [current, assets[index + 1]];
    const rowHeight = Math.max(...row.map((asset) => asset.size.height));
    row.forEach((asset, column) => {
      const offset = scatterOffsets[asset.index % scatterOffsets.length];
      const columnWidth = (paperBaseWidth - 42 * 2 - 36) / 2;
      const desiredLeft = row.length === 1
        ? 42 + (paperBaseWidth - 84 - asset.size.width) / 2 + offset.x * 1.6
        : 42 + column * (columnWidth + 36) + (columnWidth - asset.size.width) / 2 + offset.x;
      placed.push({ item: asset.item, left: clamp(desiredLeft, 24, paperBaseWidth - asset.size.width - 24) * scale, top: (y + Math.max(0, (rowHeight - asset.size.height) / 2) + Math.max(-4, offset.y)) * scale, width: asset.size.width * scale, height: asset.size.height * scale, rotate: offset.rotate });
    });
    y += rowHeight + 52;
    index += row.length;
  }
  return { pieces: placed, height: Math.max(920, y + 238) * scale };
};

const styles = StyleSheet.create({
  page: { backgroundColor: productColor.page, flex: 1, paddingTop: 24 },
  originBack: { alignItems: 'center', flexDirection: 'row', height: 34, marginBottom: 5, paddingHorizontal: productSpace.page },
  originBackGlyph: { color: productColor.ink, fontSize: 31, fontWeight: '300', lineHeight: 29, marginRight: 3 },
  originBackLabel: { color: productColor.ink, fontSize: 14, fontWeight: '600' },
  title: { color: productColor.ink, fontSize: 30, fontWeight: '700', lineHeight: 38, marginBottom: 20, paddingHorizontal: productSpace.page },
  categoryRail: { flexGrow: 0, flexShrink: 0 },
  categories: { gap: 26, paddingHorizontal: productSpace.page },
  categoryButton: { height: 34, justifyContent: 'center' },
  packList: { flex: 1 },
  categoryLabel: { color: productColor.secondaryText, fontSize: 17, fontWeight: '500', lineHeight: 25 },
  categoryLabelActive: { color: productColor.ink, fontWeight: '700' },
  packGrid: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingBottom: 32, paddingHorizontal: productSpace.page, paddingTop: 24 },
  packCard: { alignItems: 'center', aspectRatio: 1, backgroundColor: productColor.surface, borderRadius: 16, justifyContent: 'center', overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.04, shadowRadius: 12, width: '47.7%' },
  packCover: { height: '100%', resizeMode: 'contain', width: '100%' },
  empty: { color: productColor.secondaryText, fontSize: 15, marginTop: 30, textAlign: 'center', width: '100%' },
  detailHeader: { alignItems: 'center', borderBottomColor: productColor.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 66, justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: productSpace.page },
  back: { alignItems: 'flex-start', height: 42, justifyContent: 'center', width: 42 },
  backGlyph: { color: productColor.ink, fontSize: 42, fontWeight: '300', lineHeight: 38 },
  detailTitle: { color: productColor.ink, flex: 1, fontSize: 21, fontWeight: '700', textAlign: 'center' },
  favorite: { alignItems: 'flex-end', height: 42, justifyContent: 'center', width: 42 },
  favoriteGlyph: { color: productColor.ink, fontSize: 34, fontWeight: '400', lineHeight: 38 },
  favoriteGlyphActive: { color: '#D9A832' },
  detailBoard: { backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flex: 1, marginBottom: 14, marginHorizontal: productSpace.page, overflow: 'hidden' },
  detailList: { flex: 1 },
  itemGrid: { paddingBottom: 32 },
  paperCanvas: { backgroundColor: productColor.surface, position: 'relative', width: '100%' },
  itemTile: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  itemTileSelected: { borderColor: productColor.ink, borderRadius: 3, borderWidth: 2 },
  itemImage: { height: '100%', resizeMode: 'contain', width: '100%' },
  addBar: { backgroundColor: productColor.page, paddingBottom: 16, paddingHorizontal: productSpace.page, paddingTop: 10 },
  addButton: { alignItems: 'center', backgroundColor: productColor.ink, borderRadius: 999, height: 48, justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: '#F1F0ED' },
  addButtonLabel: { color: productColor.surface, fontSize: 17, fontWeight: '700' },
  addButtonLabelDisabled: { color: '#C9C7C1' },
});
