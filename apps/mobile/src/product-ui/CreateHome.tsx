import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, LinearGradient, Rect, vec, type Transforms3d } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { assetUriMap, backgroundPaperPack, proceduralPaperForReferenceId, proceduralStickerForReferenceId, remoteAssetUriMap } from '@journalcollage/asset-system';
import type { Draft } from '@journalcollage/editor-core';
import type { TemplateDefinition } from '@journalcollage/editor-core';
import { ProceduralPaperPreview, SkiaEditorScene } from '@journalcollage/editor-renderer';
import { cacheRemoteResource, hasSavedDraftsSync, loadCachedHomeShowcaseManifest, loadSavedDrafts, resolvedRemoteResourceUri, saveCachedHomeShowcaseManifest, type SavedDraft, type StoredWorkspace } from '../localWorkspace';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace } from './tokens';
import { fallbackHomeShowcaseGroupsForMarket, homeShowcaseManifestUrlForMarket, normalizeHomeShowcaseManifest, withBackgroundShowcaseGroup, type HomeMarket, type HomeShowcaseEffect, type HomeShowcaseGroup, type HomeShowcaseItem } from './homeShowcases';
import { CachedRemoteImage } from './CachedRemoteImage';
import { productCatalogAssetForReference } from '../shippedProductAssetCatalog';
import { localTemplateCatalog } from '../localTemplateCatalog';

export type CreateEntry = 'blank' | 'photo' | 'restore' | 'showcase';
export type ShowcaseIntent = Readonly<{ id: string; effect?: HomeShowcaseEffect; backgroundPresetId?: string }>;
const LACE_FRAME_SOURCES = {
  'wide-hole': { cacheKey: 'effect-frame-lace-center-wide-hole', source: 'https://assets.zllarchi.site/packs/leisi/items/lace-center-01.png' },
  'classic-doily': { cacheKey: 'effect-frame-lace-center-classic-doily', source: 'https://assets.zllarchi.site/packs/leisi/items/lace-doily-frame-transparent.png' },
  'foil-crumpled': { cacheKey: 'effect-frame-foil-center-crumpled', source: 'https://assets.zllarchi.site/effects/foil-frame-02-compress.png' },
} as const;
// Build-time release setting. Set EXPO_PUBLIC_HOME_MARKET=cn for mainland
// China; all other builds use the US English feed by default.
const HOME_MARKET: HomeMarket = process.env.EXPO_PUBLIC_HOME_MARKET === 'cn' ? 'cn' : 'us';

export const CreateHome = ({ locale, onOpenAssets, onOpenEditor, onOpenTemplate, onOpenTemplateCatalog, onOpenTemplateStudio }: Readonly<{
  locale: ProductLocale;
  onOpenAssets: () => void;
  onOpenEditor: (entry: CreateEntry, savedDraftId?: string, showcase?: ShowcaseIntent) => void;
  onOpenTemplate: (template: TemplateDefinition) => void;
  onOpenTemplateCatalog: () => void;
  /** Development-only. Omitted by every release build. */
  onOpenTemplateStudio?: () => void;
}>) => {
  // The on-disk draft index is asynchronous. Keep this distinct from an
  // empty result so the home layout does not jump after a JS reload.
  const [savedDrafts, setSavedDrafts] = useState<readonly SavedDraft[] | null>(() => hasSavedDraftsSync() === false ? [] : null);
  const [showcaseGroups, setShowcaseGroups] = useState<readonly HomeShowcaseGroup[]>(() => withBackgroundShowcaseGroup(fallbackHomeShowcaseGroupsForMarket(HOME_MARKET), HOME_MARKET));
  const [showcaseUris, setShowcaseUris] = useState<Readonly<Record<string, string>>>({});
  const [laceFrameUris, setLaceFrameUris] = useState<Readonly<Record<string, string>>>(() => Object.fromEntries(Object.entries(LACE_FRAME_SOURCES).flatMap(([id, frame]) => {
    const uri = resolvedRemoteResourceUri(frame.cacheKey, frame.source);
    return uri ? [[id, uri]] : [];
  })));

  useEffect(() => {
    let active = true;
    void loadSavedDrafts().then((drafts) => { if (active) setSavedDrafts(drafts); }).catch(() => { if (active) setSavedDrafts([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await loadCachedHomeShowcaseManifest(HOME_MARKET).catch(() => null);
      const cachedGroups = cached ? normalizeHomeShowcaseManifest(cached.payload) : [];
      let hasUsableGroups = cachedGroups.length > 0;
      if (active && hasUsableGroups) setShowcaseGroups(withBackgroundShowcaseGroup(cachedGroups, HOME_MARKET));
      try {
        const response = await fetch(homeShowcaseManifestUrlForMarket(HOME_MARKET), { headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined });
        if (response.status === 304) return;
        if (!response.ok) throw new Error(`Home manifest returned ${response.status}`);
        const payload: unknown = await response.json();
        const groups = normalizeHomeShowcaseManifest(payload);
        if (groups.length === 0) throw new Error('Home manifest has no usable groups');
        hasUsableGroups = true;
        if (active) setShowcaseGroups(withBackgroundShowcaseGroup(groups, HOME_MARKET));
        void saveCachedHomeShowcaseManifest(HOME_MARKET, payload, response.headers.get('etag')).catch(() => undefined);
      } catch {
        if (active && !hasUsableGroups) setShowcaseGroups(withBackgroundShowcaseGroup(fallbackHomeShowcaseGroupsForMarket(HOME_MARKET), HOME_MARKET));
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    showcaseGroups.flatMap((group) => group.items).forEach((item) => {
      if (!item.imageSrc) return;
      void cacheRemoteResource(`home-showcase-${item.id}`, item.imageSrc).then((uri) => {
        if (active) setShowcaseUris((current) => ({ ...current, [item.id]: uri }));
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, [showcaseGroups]);
  useEffect(() => {
    let active = true;
    Object.entries(LACE_FRAME_SOURCES).forEach(([id, frame]) => {
      void cacheRemoteResource(frame.cacheKey, frame.source).then((uri) => {
        if (active) setLaceFrameUris((current) => ({ ...current, [id]: uri }));
      }).catch(() => undefined);
    });
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

      {onOpenTemplateStudio && <Pressable accessibilityLabel="Open Template Studio" accessibilityRole="button" onPress={onOpenTemplateStudio} style={styles.templateStudioEntry}><Text style={styles.templateStudioEyebrow}>DEVELOPMENT ONLY</Text><Text style={styles.templateStudioLabel}>Template Studio</Text><Text style={styles.templateStudioHint}>Create and export template authoring JSON</Text></Pressable>}

      <SectionHeader actionLabel={t(locale, 'templateCatalog.viewAll')} onAction={onOpenTemplateCatalog} title={t(locale, 'templateCatalog.featured')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateTrack}>
        {localTemplateCatalog.map((template) => <TemplateCard key={template.id} template={template} onPress={() => onOpenTemplate(template)} />)}
      </ScrollView>

      {savedDrafts !== null && savedDrafts.length > 0 && (
        <>
          <SectionTitle>{t(locale, 'create.recentDrafts')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalTrack}>
            {savedDrafts.map((savedDraft) => <Pressable key={savedDraft.id} accessibilityRole="button" accessibilityLabel={t(locale, 'create.recentDrafts')} onPress={() => onOpenEditor('restore', savedDraft.id)} style={styles.recentCard}>
              <RecentDraftArtwork laceFrameUris={laceFrameUris} workspace={savedDraft.workspace} />
            </Pressable>)}
          </ScrollView>
        </>
      )}
      {savedDrafts === null && <RecentDraftLoadingRow locale={locale} />}

      {showcaseGroups.map((group) => <View key={group.id}><SectionTitle>{group.title}</SectionTitle><ShowcaseRow items={group.items} previewUris={showcaseUris} onPress={(item) => onOpenEditor('showcase', undefined, { id: item.id, effect: item.effect, backgroundPresetId: item.backgroundPresetId })} /></View>)}
    </ScrollView>
  );
};

const SectionTitle = ({ children }: Readonly<{ children: string }>) => <Text style={styles.sectionTitle}>{children}</Text>;

const SectionHeader = ({ actionLabel, onAction, title }: Readonly<{ actionLabel: string; onAction: () => void; title: string }>) => <View style={styles.sectionHeader}>
  <Text style={styles.sectionHeaderTitle}>{title}</Text>
  <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" hitSlop={8} onPress={onAction} style={styles.sectionAction}><Text style={styles.sectionActionText}>{actionLabel}</Text></Pressable>
</View>;

const TemplateCard = ({ onPress, template }: Readonly<{ onPress: () => void; template: TemplateDefinition }>) => {
  const preview = productCatalogAssetForReference(template.preview as Required<typeof template.preview>);
  return <Pressable accessibilityLabel={`Use ${template.name} template`} accessibilityRole="button" onPress={onPress} style={styles.templateCard}>
    {preview ? <CachedRemoteImage cacheKey={`template-preview-${template.id}`} reference={template.preview as Required<typeof template.preview>} source={preview.sourceUrl} style={styles.templatePreview} /> : <View style={styles.templatePreviewFallback} />}
    <ImageCardTitleScrim />
    <View pointerEvents="none" style={styles.templateTitle}><Text numberOfLines={1} style={styles.templateTitleText}>{template.name}</Text></View>
  </Pressable>;
};

/** Keeps the asynchronous draft restore from shifting the home feed. */
const RecentDraftLoadingRow = ({ locale }: Readonly<{ locale: ProductLocale }>) => <View>
  <SectionTitle>{t(locale, 'create.recentDrafts')}</SectionTitle>
  <View accessibilityLabel={t(locale, 'create.recentDrafts')} style={styles.recentLoadingTrack}>
    {Array.from({ length: 3 }, (_, index) => <View key={index} style={styles.recentLoadingCard}><View style={styles.recentLoadingArtwork} /></View>)}
  </View>
</View>;

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
export const RecentDraftArtwork = ({ laceFrameUris, workspace }: Readonly<{ laceFrameUris: Readonly<Record<string, string>>; workspace: StoredWorkspace }>) => {
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
        tornPaperEdgeAtlasUri={recentTornPaperEdgeAtlasUri}
        tornPaperFiberFringeUri={recentTornPaperFiberFringeUri}
        laceFrameFallback={false}
        laceFrameUris={laceFrameUris}
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
const recentTornPaperEdgeAtlasUri = Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/textures/torn-paper-edge-atlas.png')).uri;
const recentTornPaperFiberFringeUri = Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/textures/torn-paper-fiber-fringe.png')).uri;

const backgroundItemById = (id: string) => backgroundPaperPack('polka').items.find((item) => item.id === id);

const ShowcaseRow = ({ items, onPress, previewUris }: Readonly<{ items: readonly HomeShowcaseItem[]; previewUris: Readonly<Record<string, string>>; onPress: (item: HomeShowcaseItem) => void }>) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.showcaseTrack}>
    {items.map((item) => (
      <Pressable accessibilityRole="button" accessibilityLabel={item.title} key={item.id} onPress={() => onPress(item)} style={styles.showcaseCard}>
        {item.imageSrc ? <ShowcaseImagePreview uri={previewUris[item.id]} /> : <HomeBackgroundPreview item={backgroundItemById(item.backgroundPresetId ?? '')} />}
        {!item.hideTitle && <><ImageCardTitleScrim /><View style={styles.showcaseTitle}><Text numberOfLines={1} style={styles.showcaseTitleText}>{item.title}</Text></View></>}
      </Pressable>
    ))}
  </ScrollView>
);

const homePolkaPatternUris = {
  24: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/24.png')).uri,
  7: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/7.png')).uri,
  1: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/1.png')).uri,
};
const HomeBackgroundPreview = ({ item }: Readonly<{ item: ReturnType<typeof backgroundItemById> }>) => item?.paper
  ? <ProceduralPaperPreview paper={item.paper} patternImageUri={item.paper.imageAsset ? homePolkaPatternUris[item.paper.imageAsset] : undefined} size={{ width: 123, height: 150 }} />
  : <View style={styles.backgroundPreview} />;
const ShowcaseImagePreview = ({ uri }: Readonly<{ uri: string | undefined }>) => uri ? <Image source={{ uri }} style={styles.showcaseImage} /> : <View style={styles.showcaseImagePlaceholder}><View style={styles.showcaseImagePlaceholderMark} /></View>;
const ImageCardTitleScrim = () => <Canvas pointerEvents="none" style={styles.imageCardTitleScrim}><Rect height={52} width={123} x={0} y={0}><LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.15)']} end={vec(0, 52)} start={vec(0, 0)} /></Rect></Canvas>;

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
  templateTrack: { gap: 12, paddingRight: productSpace.page },
  templateCard: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.06)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, height: 150, overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.06, shadowRadius: 10, width: 123 },
  templatePreview: { height: '100%', resizeMode: 'cover', width: '100%' },
  templatePreviewFallback: { backgroundColor: '#F3F1EC', height: '100%', width: '100%' },
  templateTitle: { bottom: 0, left: 0, paddingHorizontal: 9, paddingVertical: 7, position: 'absolute', right: 0 },
  templateTitleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  templateStudioEntry: { backgroundColor: '#29251F', borderRadius: 14, marginTop: 12, paddingHorizontal: 16, paddingVertical: 13 },
  templateStudioEyebrow: { color: '#E6CA7B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, lineHeight: 14 },
  templateStudioLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 2 },
  templateStudioHint: { color: '#D8D0C2', fontSize: 12, lineHeight: 17, marginTop: 1 },
  blankGlyph: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.16)', borderRadius: 4, borderWidth: 1, height: 31, justifyContent: 'center', paddingHorizontal: 4, shadowColor: productColor.ink, shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.08, shadowRadius: 7, width: 24 },
  blankLine: { backgroundColor: '#E1DFDA', height: 1, width: '100%' },
  blankLineMiddle: { marginVertical: 4 },
  paperGlyph: { height: 34, width: 28 },
  paperBack: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.10)', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, height: 25, position: 'absolute', right: 1, top: 2, transform: [{ rotate: '8deg' }], width: 18 },
  paperFront: { backgroundColor: '#EFE7D8', borderColor: 'rgba(17,17,17,0.10)', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, height: 25, left: 2, position: 'absolute', top: 7, transform: [{ rotate: '-8deg' }], width: 20 },
  sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 12, marginTop: 28 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 28 },
  sectionHeaderTitle: { color: productColor.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  sectionAction: { minHeight: 28, justifyContent: 'center', paddingLeft: 12 },
  sectionActionText: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  horizontalTrack: { gap: 12 },
  recentCard: { backgroundColor: productColor.surface, borderRadius: 7, height: 118, overflow: 'hidden', padding: 4, shadowColor: productColor.ink, shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.06, shadowRadius: 8, width: 94 },
  recentLoadingTrack: { flexDirection: 'row', gap: 12 },
  recentLoadingCard: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.04)', borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, height: 118, overflow: 'hidden', padding: 4, width: 94 },
  recentLoadingArtwork: { backgroundColor: '#F1F0EC', borderRadius: 4, flex: 1 },
  recentArtwork: { backgroundColor: '#FDFDFB', borderRadius: 4, flex: 1, overflow: 'hidden' },
  recentCanvas: { height: 110, width: 86 },
  showcaseTrack: { gap: 10, paddingRight: productSpace.page },
  showcaseCard: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.06)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, height: 150, overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.06, shadowRadius: 10, width: 123 },
  showcaseImage: { height: '100%', resizeMode: 'cover', width: '100%' },
  showcaseImagePlaceholder: { alignItems: 'center', backgroundColor: '#F3F1EC', height: '100%', justifyContent: 'center', width: '100%' },
  showcaseImagePlaceholderMark: { backgroundColor: '#E3E0D9', borderRadius: 18, height: 36, width: 36 },
  imageCardTitleScrim: { bottom: 0, height: 52, left: 0, position: 'absolute', width: 123 },
  showcaseTitle: { bottom: 0, left: 0, paddingHorizontal: 9, paddingVertical: 7, position: 'absolute', right: 0 },
  showcaseTitleText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  backgroundPreview: { backgroundColor: '#FDFDFB', height: '100%', width: '100%' },
});
