import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { backgroundMaterialPacks, backgroundPaperPack, type BackgroundMaterialCategory, type RemoteAssetPack, type RemotePackItem } from '@journalcollage/asset-system';
import { productColor } from './tokens';
import { CachedRemoteImage } from './CachedRemoteImage';
import { ProceduralItemPreview } from './ProceduralMaterialPreview';

type Category = Readonly<{ id: BackgroundMaterialCategory; label: string }>;

// This is deliberately the same category split as the mini-program. The
// contents themselves are the Notes paper inventory, not background copies.
const categories: readonly Category[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'polka', label: 'Polka' },
  { id: 'grid', label: 'Grid' },
  { id: 'paper', label: 'Paper' },
  { id: 'pattern', label: 'Pattern' },
];

const packsFor = (category: BackgroundMaterialCategory): readonly RemoteAssetPack[] =>
  category === 'plain' || category === 'polka' ? [backgroundPaperPack(category)] : backgroundMaterialPacks[category];

export const BackgroundDrawer = ({ onApply, onClear, onClose, onCustomPolka, onHeightChange }: Readonly<{
  onApply: (item: RemotePackItem) => void;
  onClear: () => void;
  onClose: () => void;
  onCustomPolka: () => void;
  onHeightChange?: (height: number) => void;
}>) => {
  const [category, setCategory] = useState<BackgroundMaterialCategory>('plain');
  const visibleItems = useMemo(
    () => packsFor(category).flatMap((pack) => pack.items.filter((item) => item.action === undefined)),
    [category],
  );

  return <View onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)} style={styles.sheet}>
    <Pressable accessibilityLabel="Close backgrounds" hitSlop={12} onPress={onClose} style={styles.handle} />
    <View style={styles.header}>
      <Text numberOfLines={1} style={styles.title}>Background</Text>
      <Pressable accessibilityLabel="Reset background" hitSlop={10} onPress={onClear}><Text style={styles.reset}>Reset</Text></Pressable>
    </View>
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} style={styles.categoriesScroll}>
        {categories.map((entry) => <Pressable key={entry.id} onPress={() => setCategory(entry.id)} style={[styles.chip, category === entry.id && styles.chipActive]}><Text style={[styles.chipLabel, category === entry.id && styles.chipLabelActive]}>{entry.label}</Text></Pressable>)}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.itemGrid} showsVerticalScrollIndicator={false}>
      {category === 'polka' && <Pressable accessibilityLabel="Customize polka background" onPress={onCustomPolka} style={styles.itemTile}>
        <View style={styles.customEntry}><Text style={styles.customEntryPlus}>+</Text><Text style={styles.customEntryLabel}>Custom</Text></View>
      </Pressable>}
      {visibleItems.map((item) => <Pressable key={item.id} accessibilityLabel={`Use ${item.id} as background`} onPress={() => onApply(item)} style={styles.itemTile}>
        {item.procedural ? <ProceduralItemPreview item={item} /> : <CachedRemoteImage cacheKey={`item-${item.reference.id}`} source={item.source} style={styles.itemImage} />}
      </Pressable>)}
      </ScrollView>
    </>
  </View>;
};

const styles = StyleSheet.create({
  sheet: { backgroundColor: productColor.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, bottom: 0, height: 520, left: 0, overflow: 'hidden', position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.06, shadowRadius: 22, zIndex: 10 },
  handle: { alignSelf: 'center', backgroundColor: '#D9D7D1', borderRadius: 3, height: 5, marginTop: 12, width: 48 },
  header: { alignItems: 'center', flexDirection: 'row', height: 66, justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { color: productColor.ink, flex: 1, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  reset: { color: productColor.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  categories: { gap: 8, paddingHorizontal: 20 },
  categoriesScroll: { flexGrow: 0, flexShrink: 0, height: 36 },
  chip: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 36, justifyContent: 'center', paddingHorizontal: 16 },
  chipActive: { backgroundColor: productColor.ink },
  chipLabel: { color: productColor.secondaryText, fontSize: 14, fontWeight: '500' },
  chipLabelActive: { color: productColor.surface, fontWeight: '600' },
  itemGrid: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 12 },
  itemTile: { alignItems: 'center', aspectRatio: 1, backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, elevation: 2, justifyContent: 'center', overflow: 'visible', shadowColor: productColor.ink, shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.07, shadowRadius: 5, width: '30.4%' },
  itemImage: { height: '100%', resizeMode: 'cover', width: '100%' },
  customEntry: { alignItems: 'center', justifyContent: 'center' },
  customEntryPlus: { color: productColor.ink, fontSize: 34, fontWeight: '300', lineHeight: 36 },
  customEntryLabel: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600', marginTop: 3 },
});
