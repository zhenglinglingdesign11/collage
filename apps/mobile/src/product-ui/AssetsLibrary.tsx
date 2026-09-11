import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recommendedRemoteAssetPackIds, remoteAssetPacks, type AssetPackCategory } from '@journalcollage/asset-system';
import { productColor, productSpace } from './tokens';
import { ProceduralPackPreview } from './ProceduralMaterialPreview';
import { CachedRemoteImage } from './CachedRemoteImage';

const categories: readonly Readonly<{ id: AssetPackCategory; label: string }>[] = [
  { id: 'recommended', label: 'Recommended' }, { id: 'sticker', label: 'Stickers' }, { id: 'tape', label: 'Tape' },
  { id: 'note', label: 'Notes' }, { id: 'mixed', label: 'Mixed' }, { id: 'frame', label: 'Frames' },
];

/** Product list surface backed by the exact catalog used by the editor drawer. */
export const AssetsLibrary = () => {
  const [category, setCategory] = useState<AssetPackCategory>('recommended');
  const packs = useMemo(() => category === 'recommended'
    ? remoteAssetPacks.filter((pack) => recommendedRemoteAssetPackIds.has(pack.id))
    : remoteAssetPacks.filter((pack) => pack.category === category), [category]);
  return <View style={styles.page}>
    <Text style={styles.title}>Materials</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
      {categories.map((entry) => <Pressable key={entry.id} onPress={() => setCategory(entry.id)} style={[styles.chip, category === entry.id && styles.chipActive]}><Text style={[styles.chipLabel, category === entry.id && styles.chipLabelActive]}>{entry.label}</Text></Pressable>)}
    </ScrollView>
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false} style={styles.packList}>
      {packs.map((pack) => <View key={pack.id} style={styles.card}>{pack.proceduralPreview ? <ProceduralPackPreview pack={pack} /> : <CachedRemoteImage cacheKey={`cover-${pack.id}`} source={pack.cover} style={styles.cover} />}</View>)}
    </ScrollView>
  </View>;
};

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 24 },
  title: { color: productColor.ink, fontSize: 24, fontWeight: '700', lineHeight: 30, marginBottom: 18, paddingHorizontal: productSpace.page },
  categories: { gap: 8, paddingBottom: 0, paddingHorizontal: productSpace.page },
  packList: { flex: 1 },
  chip: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 36, justifyContent: 'center', paddingHorizontal: 16 },
  chipActive: { backgroundColor: productColor.ink },
  chipLabel: { color: productColor.secondaryText, fontSize: 14, fontWeight: '500' },
  chipLabelActive: { color: productColor.surface, fontWeight: '600' },
  grid: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 32, paddingHorizontal: productSpace.page, paddingTop: 12 },
  card: { alignItems: 'center', aspectRatio: 1, backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden', width: '47.9%' },
  cover: { height: '100%', resizeMode: 'contain', width: '100%' },
});
