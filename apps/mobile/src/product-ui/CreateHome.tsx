import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, type Transforms3d } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { assetUriMap, proceduralPaperForReferenceId, proceduralStickerForReferenceId, remoteAssetUriMap } from '@journalcollage/asset-system';
import type { Draft } from '@journalcollage/editor-core';
import { SkiaEditorScene } from '@journalcollage/editor-renderer';
import { loadSavedDrafts, type SavedDraft, type StoredWorkspace } from '../localWorkspace';
import { resolveProductAsset } from './assets';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace } from './tokens';

export type CreateEntry = 'blank' | 'photo' | 'restore';

export const CreateHome = ({ locale, onOpenAssets, onOpenEditor }: Readonly<{
  locale: ProductLocale;
  onOpenAssets: () => void;
  onOpenEditor: (entry: CreateEntry, savedDraftId?: string) => void;
}>) => {
  const [savedDrafts, setSavedDrafts] = useState<readonly SavedDraft[]>([]);

  useEffect(() => {
    let active = true;
    void loadSavedDrafts().then((drafts) => { if (active) setSavedDrafts(drafts); });
    return () => { active = false; };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{t(locale, 'create.title')}</Text>

      <Pressable accessibilityRole="button" accessibilityLabel={t(locale, 'create.addPhoto')} onPress={() => onOpenEditor('photo')} style={styles.photoEntry}>
        <DotPaper />
        <View pointerEvents="none" style={styles.photoGhost} />
        <View pointerEvents="none" style={styles.tape} />
        <View pointerEvents="none" style={styles.photoContent}>
          <View style={styles.plus}><Text style={styles.plusLabel}>+</Text></View>
          <Text style={styles.photoLabel}>{t(locale, 'create.addPhoto')}</Text>
        </View>
      </Pressable>

      <View style={styles.quickRow}>
        <QuickStartCard kind="blank" label={t(locale, 'create.blankCanvas')} onPress={() => onOpenEditor('blank')} />
        <QuickStartCard kind="materials" label={t(locale, 'create.materialPack')} onPress={onOpenAssets} />
      </View>

      {savedDrafts.length > 0 && (
        <>
          <SectionTitle>{t(locale, 'create.recentDrafts')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalTrack}>
            {savedDrafts.map((savedDraft) => <Pressable key={savedDraft.id} accessibilityRole="button" accessibilityLabel={t(locale, 'create.recentDrafts')} onPress={() => onOpenEditor('restore', savedDraft.id)} style={styles.recentCard}>
              <RecentDraftArtwork workspace={savedDraft.workspace} />
            </Pressable>)}
          </ScrollView>
        </>
      )}

      <SectionTitle>{t(locale, 'create.tearPaper')}</SectionTitle>
      <ShowcaseRow onPress={() => onOpenEditor('photo')} items={[
        'asset://ui/home/showcase/paper-sheet',
        'asset://ui/home/showcase/pack-one',
        'asset://ui/home/showcase/pack-seven',
      ]} />

      <SectionTitle>{t(locale, 'create.texture')}</SectionTitle>
      <ShowcaseRow onPress={() => onOpenEditor('photo')} items={[
        'asset://ui/home/showcase/pack-twenty-four',
        'asset://ui/home/showcase/paper-sheet',
        'asset://ui/home/showcase/pack-one',
      ]} />
    </ScrollView>
  );
};

const SectionTitle = ({ children }: Readonly<{ children: string }>) => <Text style={styles.sectionTitle}>{children}</Text>;

const QuickStartCard = ({ kind, label, onPress }: Readonly<{ kind: 'blank' | 'materials'; label: string; onPress: () => void }>) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickCard}>
    {kind === 'blank' ? <BlankPageGlyph /> : <PaperStackGlyph />}
    <Text style={styles.quickLabel}>{label}</Text>
  </Pressable>
);

const BlankPageGlyph = () => <View style={styles.blankGlyph}><View style={styles.blankLine} /><View style={[styles.blankLine, styles.blankLineMiddle]} /><View style={styles.blankLine} /></View>;

const PaperStackGlyph = () => <View style={styles.paperGlyph}><View style={styles.paperBack} /><View style={styles.paperFront} /></View>;

const DotPaper = () => <View pointerEvents="none" style={styles.dotPaper}>{Array.from({ length: 42 }, (_, index) => <View key={index} style={styles.dot} />)}</View>;

/** A real renderer-backed thumbnail, rather than a static placeholder artwork. */
const RecentDraftArtwork = ({ workspace }: Readonly<{ workspace: StoredWorkspace }>) => {
  const inactiveTransform = useSharedValue<Transforms3d>([]);
  const { draft, catalog } = workspace;
  const assetUris = { ...remoteAssetUriMap(), ...assetUriMap(catalog), ...recentLocalPolkaUris };
  const proceduralPapers = Object.fromEntries(draft.layers.flatMap((layer) => layer.type === 'image' ? (() => { const paper = proceduralPaperForReferenceId(layer.asset.id); return paper ? [[layer.asset.id, paper] as const] : []; })() : []));
  const proceduralStickers = Object.fromEntries(draft.layers.flatMap((layer) => layer.type === 'image' ? (() => { const sticker = proceduralStickerForReferenceId(layer.asset.id); return sticker ? [[layer.asset.id, sticker] as const] : []; })() : []));
  const backgroundAsset = draft.canvas.backgroundAsset;
  const scale = Math.min(86 / draft.canvas.size.width, 110 / draft.canvas.size.height);
  return <View style={styles.recentArtwork}>
    <Canvas style={styles.recentCanvas}>
      <SkiaEditorScene
        activeLayer={{ layerId: null, transform: inactiveTransform }}
        assetUris={assetUris}
        canvasBackgroundPaper={backgroundAsset ? proceduralPaperForReferenceId(backgroundAsset.id) : undefined}
        canvasBackgroundUri={backgroundAsset ? assetUris[backgroundAsset.id] : undefined}
        draft={{ ...draft, selectedLayerId: null } as Draft}
        proceduralPapers={proceduralPapers}
        proceduralStickers={proceduralStickers}
        showSelection={false}
        surfaceColor="#FFFDF9"
        viewport={{ scale, x: (86 - draft.canvas.size.width * scale) / 2, y: (110 - draft.canvas.size.height * scale) / 2 }}
      />
    </Canvas>
  </View>;
};

const recentLocalPolkaUris: Readonly<Record<string, string>> = {
  'asset://pack/polka-paper-materials/pattern-local-24': Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/24.png')).uri,
  'asset://pack/polka-paper-materials/pattern-local-7': Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/7.png')).uri,
  'asset://pack/polka-paper-materials/pattern-local-1': Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/1.png')).uri,
};

const ShowcaseRow = ({ items, onPress }: Readonly<{ items: readonly ('asset://ui/home/showcase/paper-sheet' | 'asset://ui/home/showcase/pack-one' | 'asset://ui/home/showcase/pack-seven' | 'asset://ui/home/showcase/pack-twenty-four')[]; onPress: () => void }>) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.showcaseTrack}>
    {items.map((item) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Open with a photo" key={item} onPress={onPress} style={styles.showcaseCard}>
        <Image source={resolveProductAsset(item)} style={styles.showcaseImage} />
      </Pressable>
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingHorizontal: productSpace.page, paddingTop: 18 },
  title: { color: productColor.ink, fontSize: 22, fontWeight: '600', lineHeight: 28, marginBottom: 24 },
  photoEntry: { alignItems: 'center', backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, height: 144, justifyContent: 'center', overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.06, shadowRadius: 8 },
  dotPaper: { flexDirection: 'row', flexWrap: 'wrap', height: '100%', left: 0, opacity: 0.72, padding: 10, position: 'absolute', top: 0, width: '100%' },
  dot: { backgroundColor: '#EDECE8', borderRadius: 1, height: 1.5, marginHorizontal: 9, marginVertical: 8, width: 1.5 },
  photoGhost: { backgroundColor: 'rgba(255,255,255,0.60)', borderColor: 'rgba(17,17,17,0.04)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, height: 80, position: 'absolute', transform: [{ rotate: '-3deg' }], width: 132 },
  tape: { backgroundColor: 'rgba(233,210,138,0.48)', height: 20, position: 'absolute', top: 28, transform: [{ rotate: '-8deg' }], width: 74 },
  photoContent: { alignItems: 'center', marginTop: 4 },
  plus: { alignItems: 'center', backgroundColor: productColor.ink, borderRadius: 22, height: 44, justifyContent: 'center', marginBottom: 8, shadowColor: productColor.ink, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.14, shadowRadius: 14, width: 44 },
  plusLabel: { color: productColor.surface, fontSize: 28, fontWeight: '300', lineHeight: 34, marginTop: -2 },
  photoLabel: { color: productColor.ink, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  quickCard: { alignItems: 'center', backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flex: 1, flexDirection: 'row', gap: 9, height: 63, paddingHorizontal: 11, shadowColor: productColor.ink, shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.06, shadowRadius: 8 },
  quickLabel: { color: productColor.ink, flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  blankGlyph: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.16)', borderRadius: 4, borderWidth: 1, height: 31, justifyContent: 'center', paddingHorizontal: 4, shadowColor: productColor.ink, shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.08, shadowRadius: 7, width: 24 },
  blankLine: { backgroundColor: '#E1DFDA', height: 1, width: '100%' },
  blankLineMiddle: { marginVertical: 4 },
  paperGlyph: { height: 34, width: 28 },
  paperBack: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.10)', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, height: 25, position: 'absolute', right: 1, top: 2, transform: [{ rotate: '8deg' }], width: 18 },
  paperFront: { backgroundColor: '#EFE7D8', borderColor: 'rgba(17,17,17,0.10)', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, height: 25, left: 2, position: 'absolute', top: 7, transform: [{ rotate: '-8deg' }], width: 20 },
  sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 12, marginTop: 28 },
  horizontalTrack: { gap: 12 },
  recentCard: { backgroundColor: productColor.surface, borderRadius: 7, height: 118, overflow: 'hidden', padding: 4, shadowColor: productColor.ink, shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.06, shadowRadius: 8, width: 94 },
  recentArtwork: { backgroundColor: '#FDFDFB', borderRadius: 4, flex: 1, overflow: 'hidden' },
  recentCanvas: { height: 110, width: 86 },
  showcaseTrack: { gap: 10, paddingRight: productSpace.page },
  showcaseCard: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.06)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, height: 150, overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.06, shadowRadius: 10, width: 123 },
  showcaseImage: { height: '100%', resizeMode: 'cover', width: '100%' },
});
