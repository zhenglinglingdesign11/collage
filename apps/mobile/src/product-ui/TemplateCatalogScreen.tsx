import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TemplateDefinition } from '@journalcollage/editor-core';
import { basicLayoutTemplate, basicLayouts, type BasicLayout } from '../basicLayouts';
import { localTemplateCatalog } from '../localTemplateCatalog';
import { locallySupportedTemplates } from '../templateCapabilities';
import { productCatalogAssetForReference } from '../shippedProductAssetCatalog';
import { CachedRemoteImage } from './CachedRemoteImage';
import { fallbackHomeShowcaseGroupsForMarket, type HomeShowcaseEffect, type HomeShowcaseItem } from './homeShowcases';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace } from './tokens';

export type TemplateCatalogShowcaseIntent = Readonly<{ id: string; effect?: HomeShowcaseEffect }>;

export const TemplateCatalogScreen = ({ locale, onBack, onOpenBasicLayout, onOpenShowcase, onOpenTemplate, withTopSafeArea = false }: Readonly<{
  locale: ProductLocale;
  onBack: () => void;
  onOpenBasicLayout: (layout: BasicLayout) => void;
  onOpenShowcase: (showcase: TemplateCatalogShowcaseIntent) => void;
  onOpenTemplate: (template: TemplateDefinition) => void;
  /** The editor is rendered outside ProductAppShell, so it owns this inset. */
  withTopSafeArea?: boolean;
}>) => {
  const supportedTemplates = locallySupportedTemplates(localTemplateCatalog);
  const showcaseGroups = fallbackHomeShowcaseGroupsForMarket(locale === 'zh-Hans' ? 'cn' : 'us');
  const effectsIn = (id: string) => showcaseGroups.find((group) => group.id === id)?.items ?? [];
  const contentScrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<CreateStylesSectionId, number>>({ basic: 0, shaped: 0, designed: 0, frames: 0, effects: 0 });
  const [activeTab, setActiveTab] = useState<CreateStylesSectionId>('basic');
  const tabs: readonly CreateStylesTab[] = [
    { id: 'basic', title: t(locale, 'templateCatalog.tabBasic') },
    { id: 'shaped', title: t(locale, 'templateCatalog.tabShaped') },
    { id: 'designed', title: t(locale, 'templateCatalog.tabDesigned') },
    { id: 'frames', title: t(locale, 'templateCatalog.tabFrames') },
    { id: 'effects', title: t(locale, 'templateCatalog.tabEffects') },
  ];
  const saveSectionOffset = (id: CreateStylesSectionId, offset: number) => { sectionOffsets.current[id] = offset; };
  const content = <>
  <View style={styles.header}>
    <Pressable accessibilityLabel={t(locale, 'templateCatalog.back')} accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable>
    <Text style={styles.title}>{t(locale, 'templateCatalog.title')}</Text>
    <View style={styles.headerSpacer} />
  </View>
  <ScrollView contentContainerStyle={styles.tabTrack} horizontal showsHorizontalScrollIndicator={false}>
    {tabs.map((tab) => <Pressable accessibilityLabel={tab.title} accessibilityRole="button" key={tab.id} onPress={() => { setActiveTab(tab.id); contentScrollRef.current?.scrollTo({ animated: true, y: Math.max(0, sectionOffsets.current[tab.id] - 8) }); }} style={styles.tab}><Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.title}</Text></Pressable>)}
  </ScrollView>
  <ScrollView contentContainerStyle={styles.content} ref={contentScrollRef} showsVerticalScrollIndicator={false}>
    <SectionAnchor id="basic" onLayout={saveSectionOffset}><BasicLayoutSection locale={locale} onOpenBasicLayout={onOpenBasicLayout} /></SectionAnchor>
    <SectionAnchor id="shaped" onLayout={saveSectionOffset}><HorizontalSection title={t(locale, 'templateCatalog.shapedLayouts')}>
      {shapedLayouts.map((layout) => <BasicLayoutCard compact key={layout.id} layout={layout} locale={locale} onPress={() => onOpenBasicLayout(layout)} />)}
    </HorizontalSection></SectionAnchor>
    <SectionAnchor id="designed" onLayout={saveSectionOffset}><Section title={t(locale, 'templateCatalog.designedTemplates')}>
      {supportedTemplates.map((template) => <DesignedTemplateCard key={template.id} template={template} onPress={() => onOpenTemplate(template)} />)}
    </Section></SectionAnchor>
    <SectionAnchor id="frames" onLayout={saveSectionOffset}><Section title={t(locale, 'templateCatalog.photoFrames')}>
      {effectsIn('lace').map((item) => <ShowcaseEffectCard item={item} key={item.id} onPress={() => onOpenShowcase({ id: item.id, effect: item.effect })} />)}
    </Section></SectionAnchor>
    <SectionAnchor id="effects" onLayout={saveSectionOffset}><HorizontalSection title={t(locale, 'templateCatalog.creativeEffects')}>
      {[...effectsIn('creative-tear-paper'), ...effectsIn('texture')].map((item) => <ShowcaseEffectCard compact item={item} key={item.id} onPress={() => onOpenShowcase({ id: item.id, effect: item.effect })} />)}
    </HorizontalSection></SectionAnchor>
  </ScrollView>
  </>;
  return withTopSafeArea
    ? <SafeAreaView edges={['top']} style={styles.page}>{content}</SafeAreaView>
    : <View style={styles.page}>{content}</View>;
};

type CreateStylesSectionId = 'basic' | 'shaped' | 'designed' | 'frames' | 'effects';
type CreateStylesTab = Readonly<{ id: CreateStylesSectionId; title: string }>;
const SectionAnchor = ({ children, id: _id, onLayout }: Readonly<{ children: ReactNode; id: CreateStylesSectionId; onLayout: (id: CreateStylesSectionId, offset: number) => void }>) => <View onLayout={(event) => onLayout(_id, event.nativeEvent.layout.y)}>{children}</View>;

const Section = ({ children, title }: Readonly<{ children: ReactNode; title: string }>) => <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.grid}>{children}</View></View>;
const HorizontalSection = ({ children, title }: Readonly<{ children: ReactNode; title: string }>) => <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><ScrollView contentContainerStyle={styles.horizontalCards} horizontal showsHorizontalScrollIndicator={false}>{children}</ScrollView></View>;

const shapedLayoutIds = new Set<BasicLayout['id']>(['heart-frame', 'circle-frame', 'star-frame', 'heart-mosaic']);
const shapedLayouts = basicLayouts.filter((layout) => shapedLayoutIds.has(layout.id));
const rectangularLayoutColumns = basicLayouts.filter((layout) => !shapedLayoutIds.has(layout.id)).reduce<BasicLayout[][]>((columns, layout, index) => {
  const column = Math.floor(index / 3);
  if (!columns[column]) columns[column] = [];
  columns[column].push(layout);
  return columns;
}, []);

const BasicLayoutSection = ({ locale, onOpenBasicLayout }: Readonly<{ locale: ProductLocale; onOpenBasicLayout: (layout: BasicLayout) => void }>) => <View style={styles.section}>
  <Text style={styles.sectionTitle}>{t(locale, 'templateCatalog.basicLayouts')}</Text>
  <ScrollView contentContainerStyle={styles.basicLayoutColumns} horizontal showsHorizontalScrollIndicator={false}>
    {rectangularLayoutColumns.map((column, index) => <View key={index} style={styles.basicLayoutColumn}>{column.map((layout) => <BasicLayoutCard compact key={layout.id} layout={layout} locale={locale} onPress={() => onOpenBasicLayout(layout)} />)}</View>)}
  </ScrollView>
</View>;

const BasicLayoutCard = ({ compact = false, layout, locale, onPress }: Readonly<{ compact?: boolean; layout: BasicLayout; locale: ProductLocale; onPress: () => void }>) => {
  const name = t(locale, `templateCatalog.layout.${layout.id}` as const);
  const detail = locale === 'zh-Hans' ? `${layout.photoSlots} ${t(locale, 'templateCatalog.photos')}` : `${layout.photoSlots} ${t(locale, 'templateCatalog.photos')}`;
  return <Pressable accessibilityLabel={`${name}, ${detail}`} accessibilityRole="button" onPress={onPress} style={[styles.card, styles.basicLayoutCard, compact && styles.compactLayoutCard]}>
  <View style={[styles.layoutPreview, compact && styles.compactLayoutPreview]}><LayoutDiagram compact={compact} layout={layout} /></View>
  <Text numberOfLines={1} style={[styles.cardTitle, compact && styles.compactLayoutTitle]}>{name}</Text>
</Pressable>;
};

const DesignedTemplateCard = ({ onPress, template }: Readonly<{ onPress: () => void; template: TemplateDefinition }>) => {
  const preview = productCatalogAssetForReference(template.preview as Required<typeof template.preview>);
  return <Pressable accessibilityLabel={`Use ${template.name} template`} accessibilityRole="button" onPress={onPress} style={styles.card}>
    {preview ? <CachedRemoteImage cacheKey={`template-catalog-preview-${template.id}`} reference={template.preview as Required<typeof template.preview>} source={preview.sourceUrl} style={styles.designedPreview} /> : <View style={styles.designedPreviewFallback} />}
    <CardTitleGradient />
    <Text numberOfLines={1} style={styles.designedTitle}>{template.name}</Text>
  </Pressable>;
};

const ShowcaseEffectCard = ({ compact = false, item, onPress }: Readonly<{ compact?: boolean; item: HomeShowcaseItem; onPress: () => void }>) => <Pressable accessibilityLabel={item.title} accessibilityRole="button" onPress={onPress} style={[styles.card, styles.effectCard, compact && styles.compactEffectCard]}>
  {item.imageSrc ? <CachedRemoteImage cacheKey={`template-catalog-effect-${item.id}`} source={item.imageSrc} style={styles.designedPreview} /> : <View style={styles.designedPreviewFallback} />}
  <CardTitleGradient />
  <Text numberOfLines={1} style={styles.designedTitle}>{item.title}</Text>
</Pressable>;

const CardTitleGradient = () => <Canvas pointerEvents="none" style={styles.titleScrim}><Rect height={60} width={1000} x={0} y={0}><LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']} end={vec(0, 60)} start={vec(0, 0)} /></Rect></Canvas>;

const LayoutDiagram = ({ compact = false, layout }: Readonly<{ compact?: boolean; layout: BasicLayout }>) => {
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const template = basicLayoutTemplate(layout);
  const { width: canvasWidth, height: canvasHeight } = template.canvas.size;
  return <View onLayout={(event) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== previewSize.width || height !== previewSize.height) setPreviewSize({ width, height });
  }} style={styles.diagram}>
    {previewSize.width > 0 && template.photoSlots.map((slot) => {
      const shape = slot.visibilityMask?.shape;
      const glyph = shape === 'heart' ? '♥' : shape === 'star' ? '★' : shape === 'circle' ? '●' : null;
      return <View key={slot.id} style={[styles.diagramCell, glyph !== null && styles.diagramShapeCell, {
        height: Math.max(0, slot.frame.height / canvasHeight * previewSize.height - 1),
        left: slot.transform.position.x / canvasWidth * previewSize.width + 0.5,
        top: slot.transform.position.y / canvasHeight * previewSize.height + 0.5,
        width: Math.max(0, slot.frame.width / canvasWidth * previewSize.width - 1),
      }]}>{glyph !== null && <Text style={[styles.diagramShapeGlyph, compact && styles.compactDiagramShapeGlyph]}>{glyph}</Text>}</View>;
    })}
  </View>;
};

const styles = StyleSheet.create({
  page: { backgroundColor: productColor.page, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', height: 58, justifyContent: 'space-between', paddingHorizontal: productSpace.page },
  back: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  backGlyph: { color: productColor.ink, fontSize: 34, fontWeight: '300', lineHeight: 34, marginTop: -4 },
  title: { color: productColor.ink, fontSize: 17, fontWeight: '600', lineHeight: 24 },
  headerSpacer: { width: 34 },
  // Match the Material page category rail: typography-led tabs, no pill chrome.
  tabTrack: { gap: 18, paddingBottom: 14, paddingHorizontal: productSpace.page },
  tab: { height: 34, justifyContent: 'center' },
  tabLabel: { color: productColor.secondaryText, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  tabLabelActive: { color: productColor.ink, fontWeight: '700' },
  content: { paddingBottom: 30, paddingHorizontal: productSpace.page },
  section: { marginBottom: 28 },
  sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  horizontalCards: { gap: 10, paddingRight: productSpace.page },
  basicLayoutColumns: { flexDirection: 'row', gap: 10, paddingRight: productSpace.page },
  basicLayoutColumn: { gap: 10 },
  card: { backgroundColor: productColor.surface, borderColor: 'rgba(17,17,17,0.06)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, height: 174, overflow: 'hidden', shadowColor: productColor.ink, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.06, shadowRadius: 10, width: '47.8%' },
  // Basic layouts only show a title now. Keep the card tightly sized to that
  // single metadata line instead of retaining the former photo-count gap.
  basicLayoutCard: { height: 153 },
  compactLayoutCard: { height: 102, width: 118 },
  effectCard: { width: '47.8%' },
  compactEffectCard: { height: 138, width: 118 },
  // Match the canvas contract: presets have no decorative inset or gap, so
  // the preview's photo cells must meet the preview edge as well.
  layoutPreview: { alignItems: 'center', backgroundColor: '#F2F0EB', height: 124, justifyContent: 'center', overflow: 'hidden' },
  compactLayoutPreview: { height: 76 },
  diagram: { alignSelf: 'stretch', flex: 1, position: 'relative' },
  diagramCell: { backgroundColor: '#D4D0C7', borderColor: '#9D988E', borderStyle: 'dashed', borderWidth: 1, position: 'absolute' },
  diagramShapeCell: { alignItems: 'center', backgroundColor: '#F2F0EB', borderWidth: 0, justifyContent: 'center' },
  diagramShapeGlyph: { color: '#D4D0C7', fontSize: 78, lineHeight: 82 },
  compactDiagramShapeGlyph: { fontSize: 36, lineHeight: 40 },
  cardTitle: { color: productColor.ink, fontSize: 12, fontWeight: '600', lineHeight: 17, marginHorizontal: 9, marginTop: 7 },
  compactLayoutTitle: { fontSize: 11, lineHeight: 15, marginTop: 5 },
  designedPreview: { height: '100%', resizeMode: 'cover', width: '100%' },
  designedPreviewFallback: { backgroundColor: '#F3F1EC', height: '100%', width: '100%' },
  titleScrim: { bottom: 0, height: 60, left: 0, position: 'absolute', right: 0 },
  designedTitle: { bottom: 0, color: '#FFFFFF', fontSize: 12, fontWeight: '600', left: 0, lineHeight: 17, paddingHorizontal: 10, paddingVertical: 9, position: 'absolute', right: 0 },
});
