import { Canvas, Path } from '@shopify/react-native-skia';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { resolveProductAsset, type ProductAssetId } from './assets';
import { t, type ProductCopyKey, type ProductLocale } from './localization';
import { productColor } from './tokens';

export const EditorHeader = ({ canRedo, canUndo, locale, onExit, onExport, onRedo, onUndo }: Readonly<{
  canRedo: boolean;
  canUndo: boolean;
  locale: ProductLocale;
  onExit: () => void;
  onExport: () => void;
  onRedo: () => void;
  onUndo: () => void;
}>) => (
  <View style={styles.header}>
    <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={onExit} style={[styles.headerIconButton, styles.headerBack]}><BackGlyph /></Pressable>
    <View pointerEvents="none" style={styles.ratioAnchor}><View style={styles.ratioPill}><Text style={styles.ratioLabel}>3:4</Text></View></View>
    <View style={styles.headerActions}>
      <HeaderAction disabled={!canUndo} direction="undo" onPress={onUndo} />
      <HeaderAction disabled={!canRedo} direction="redo" onPress={onRedo} />
      <Pressable accessibilityLabel={t(locale, 'editor.export')} accessibilityRole="button" onPress={onExport} style={styles.exportButton}>
        <Text style={styles.exportLabel}>{t(locale, 'editor.export')}</Text>
      </Pressable>
    </View>
  </View>
);

const HeaderAction = ({ direction, disabled, onPress }: Readonly<{ direction: 'redo' | 'undo'; disabled: boolean; onPress: () => void }>) => (
  <Pressable accessibilityLabel={direction} accessibilityRole="button" disabled={disabled} hitSlop={8} onPress={onPress} style={[styles.headerIconButton, disabled && styles.headerIconDisabled]}>
    <HistoryGlyph direction={direction} />
  </Pressable>
);

export const EditorPrimaryToolbar = ({ bottomInset = 0, locale, onBackground, onEmboss, onMaterial, onPhoto, onScissors, onText }: Readonly<{ bottomInset?: number; locale: ProductLocale; onBackground: () => void; onEmboss: () => void; onMaterial: () => void; onPhoto: () => void; onScissors: () => void; onText: () => void }>) => (
  <View style={[styles.toolbar, { bottom: 24 + bottomInset }]}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarTrack}>
      <EditorTool asset="asset://ui/editor/tool/image" compact={locale === 'zh-Hans'} label="editor.tool.image" locale={locale} onPress={onPhoto} />
      <EditorTool asset="asset://ui/editor/tool/material" compact={locale === 'zh-Hans'} label="editor.tool.material" locale={locale} onPress={onMaterial} />
      <EditorTool asset="asset://ui/editor/tool/background" compact={locale === 'zh-Hans'} label="editor.tool.background" locale={locale} onPress={onBackground} wide />
      <EditorTool asset="asset://ui/editor/tool/text" compact={locale === 'zh-Hans'} label="editor.tool.text" locale={locale} onPress={onText} />
      <EditorTool asset="asset://ui/editor/tool/scissors" compact={locale === 'zh-Hans'} label="editor.tool.scissors" locale={locale} onPress={onScissors} wide />
      <EditorTool asset="asset://ui/editor/tool/emboss" compact={locale === 'zh-Hans'} label="editor.tool.emboss" locale={locale} onPress={onEmboss} />
      <EditorTool asset="asset://ui/editor/tool/brush" compact={locale === 'zh-Hans'} label="editor.tool.brush" locale={locale} small />
    </ScrollView>
  </View>
);

export const ImageLayerToolbar = ({ bottomInset = 0, locale, onCopy, onCrop, onDelete, onDown, onEmboss, onEffects, onOpacity, onOutline, onScissors, onShadow, onUp }: Readonly<{
  bottomInset?: number;
  locale: ProductLocale;
  onCopy: () => void;
  onCrop: () => void;
  onDelete: () => void;
  onDown: () => void;
  onEmboss: () => void;
  onEffects: () => void;
  onOpacity: () => void;
  onOutline: () => void;
  onScissors: () => void;
  onShadow: () => void;
  onUp: () => void;
}>) => (
  <View style={[styles.layerToolbar, { height: 160 + bottomInset, paddingBottom: bottomInset }]}>
    <View style={styles.layerToolbarHead}><Text style={styles.layerToolbarTitle}>{t(locale, 'editor.layer.selected')}</Text></View>
    <View style={styles.layerActions}>
      <View style={styles.layerActionRow}>
        <LayerAction asset="asset://ui/editor/layer/move-up" label="editor.layer.up" locale={locale} onPress={onUp} />
        <LayerAction asset="asset://ui/editor/layer/move-down" label="editor.layer.down" locale={locale} onPress={onDown} />
        <LayerAction icon="copy" label="editor.layer.copy" locale={locale} onPress={onCopy} />
        <LayerAction asset="asset://ui/editor/layer/delete" label="editor.layer.delete" locale={locale} onPress={onDelete} />
        <LayerAction icon="crop" label="editor.layer.crop" locale={locale} onPress={onCrop} />
        <LayerAction icon="shadow" label="editor.layer.shadow" locale={locale} onPress={onShadow} />
      </View>
      <View style={[styles.layerActionRow, styles.layerActionRowSecond]}>
        <LayerAction icon="opacity" label="editor.layer.opacity" locale={locale} onPress={onOpacity} />
        <LayerAction icon="corner" label="editor.layer.corner" locale={locale} />
        <LayerAction icon="outline" label="editor.layer.outline" locale={locale} onPress={onOutline} />
        <LayerAction icon="effects" label="editor.layer.effects" locale={locale} onPress={onEffects} />
        <LayerAction icon="scissors" label="editor.layer.scissors" locale={locale} onPress={onScissors} />
        <LayerAction icon="emboss" label="editor.layer.emboss" locale={locale} onPress={onEmboss} />
      </View>
    </View>
  </View>
);

/** Mirrors the mini-program selected-text state: normal layer actions plus a
 * persistent edit-text link in the panel header. */
export const TextLayerToolbar = ({ bottomInset = 0, locale, onCopy, onDelete, onDown, onEditText, onOpacity, onOutline, onShadow, onUp }: Readonly<{
  bottomInset?: number;
  locale: ProductLocale;
  onCopy: () => void;
  onDelete: () => void;
  onDown: () => void;
  onEditText: () => void;
  onOpacity: () => void;
  onOutline: () => void;
  onShadow: () => void;
  onUp: () => void;
}>) => (
  <View style={[styles.layerToolbar, { height: 160 + bottomInset, paddingBottom: bottomInset }]}>
    <View style={[styles.layerToolbarHead, styles.textLayerToolbarHead]}><Text style={styles.layerToolbarTitle}>{t(locale, 'editor.layer.selected')}</Text><Pressable accessibilityLabel={t(locale, 'editor.text.edit')} hitSlop={8} onPress={onEditText}><Text style={styles.textEditLink}>{t(locale, 'editor.text.edit')}</Text></Pressable></View>
    <View style={[styles.layerActions, styles.textLayerActions]}>
      <LayerAction asset="asset://ui/editor/layer/move-up" label="editor.layer.up" locale={locale} onPress={onUp} style={styles.textLayerAction} />
      <LayerAction asset="asset://ui/editor/layer/move-down" label="editor.layer.down" locale={locale} onPress={onDown} style={styles.textLayerAction} />
      <LayerAction icon="copy" label="editor.layer.copy" locale={locale} onPress={onCopy} style={styles.textLayerAction} />
      <LayerAction asset="asset://ui/editor/layer/delete" label="editor.layer.delete" locale={locale} onPress={onDelete} style={styles.textLayerAction} />
      <LayerAction icon="shadow" label="editor.layer.shadow" locale={locale} onPress={onShadow} style={styles.textLayerAction} />
      <LayerAction icon="opacity" label="editor.layer.opacity" locale={locale} onPress={onOpacity} style={styles.textLayerAction} />
      <LayerAction icon="outline" label="editor.layer.outline" locale={locale} onPress={onOutline} style={styles.textLayerAction} />
    </View>
  </View>
);

export const ImageSelectionControls = ({ isLocked, lockStyle, onReplace, onToggleLock, replaceStyle }: Readonly<{
  isLocked: boolean;
  lockStyle: ViewStyle;
  onReplace: () => void;
  onToggleLock: () => void;
  replaceStyle: ViewStyle;
}>) => (
  <>
    <Pressable accessibilityLabel={isLocked ? 'Unlock layer' : 'Lock layer'} accessibilityRole="button" hitSlop={8} onPress={onToggleLock} style={[styles.selectionControl, lockStyle]}>
      <Image source={resolveProductAsset(isLocked ? 'asset://ui/editor/layer/lock' : 'asset://ui/editor/layer/unlock')} style={styles.selectionControlIcon} />
    </Pressable>
    <Pressable accessibilityLabel="Replace image" accessibilityRole="button" hitSlop={8} onPress={onReplace} style={[styles.selectionControl, replaceStyle]}>
      <Image source={resolveProductAsset('asset://ui/editor/layer/replace')} style={styles.selectionControlIcon} />
    </Pressable>
  </>
);

type LayerActionIconKind = 'copy' | 'crop' | 'shadow' | 'opacity' | 'corner' | 'outline' | 'effects' | 'scissors' | 'emboss';

const LayerAction = ({ asset, icon, label, locale, onPress, style }: Readonly<{ asset?: ProductAssetId; icon?: LayerActionIconKind; label: ProductCopyKey; locale: ProductLocale; onPress?: () => void; style?: ViewStyle }>) => (
  <Pressable accessibilityLabel={t(locale, label)} accessibilityRole="button" onPress={onPress} style={[styles.layerAction, style]}>
    {asset ? <Image source={resolveProductAsset(asset)} style={styles.layerActionImage} /> : icon ? <LayerActionIcon kind={icon} /> : null}
    <Text numberOfLines={1} style={styles.layerActionLabel}>{t(locale, label)}</Text>
  </Pressable>
);

/** Mirrors the small-program layer-action construction rather than using text glyphs. */
const LayerActionIcon = ({ kind }: Readonly<{ kind: LayerActionIconKind }>) => {
  switch (kind) {
    case 'copy': return <View style={styles.actionIcon}><View style={[styles.copySheet, styles.copySheetBack]} /><View style={[styles.copySheet, styles.copySheetFront]} /></View>;
    case 'crop': return <View style={[styles.actionIcon, styles.cropIcon]}><View style={[styles.cropCorner, styles.cropTopLeft]} /><View style={[styles.cropCorner, styles.cropBottomRight]} /></View>;
    case 'shadow': return <View style={styles.actionIcon}><View style={styles.shadowBack} /><View style={styles.shadowFront} /></View>;
    case 'opacity': return <View style={[styles.actionIcon, styles.opacityIcon]}><View style={styles.opacityFill} /></View>;
    case 'corner': return <View style={[styles.actionIcon, styles.cornerIcon]} />;
    case 'outline': return <View style={styles.actionIcon}><View style={styles.outlineBack} /><View style={styles.outlineFront} /></View>;
    case 'effects': return <View style={styles.actionIcon}><View style={styles.effectPaper} /><View style={styles.effectTape} /></View>;
    case 'scissors': return <View style={styles.actionIcon}><View style={[styles.scissorRing, styles.scissorRingLeft]} /><View style={[styles.scissorRing, styles.scissorRingRight]} /><View style={[styles.scissorBlade, styles.scissorBladeLeft]} /><View style={[styles.scissorBlade, styles.scissorBladeRight]} /><View style={styles.scissorJoint} /></View>;
    case 'emboss': return <View style={styles.actionIcon}><View style={styles.embossFrame} /><View style={styles.embossStar} /></View>;
  }
};

const EditorTool = ({ asset, compact, label, locale, onPress, small = false, wide = false }: Readonly<{ asset: ProductAssetId; compact: boolean; label: ProductCopyKey; locale: ProductLocale; onPress?: () => void; small?: boolean; wide?: boolean }>) => (
  <Pressable accessibilityLabel={t(locale, label)} accessibilityRole="button" onPress={onPress} style={[styles.tool, compact && styles.toolCompact, !compact && wide && styles.toolWide]}>
    <View style={styles.toolIconSlot}><Image source={resolveProductAsset(asset)} style={[styles.toolIcon, small && styles.toolIconSmall]} /></View>
    <Text numberOfLines={1} style={styles.toolLabel}>{t(locale, label)}</Text>
  </Pressable>
);

const BackGlyph = () => <LineIcon paths={["M15 6l-6 6 6 6"]} />;

const HistoryGlyph = ({ direction }: Readonly<{ direction: 'redo' | 'undo' }>) => direction === 'undo'
  ? <LineIcon paths={["M9 8H5v-4", "M5.5 8.5a7 7 0 1 1 1.8 7"]} />
  : <LineIcon paths={["M15 8h4v-4", "M18.5 8.5a7 7 0 1 0-1.8 7"]} />;

/** The paths are the original mini-program line-back/undo/redo SVG paths. */
const LineIcon = ({ paths }: Readonly<{ paths: readonly string[] }>) => (
  <Canvas pointerEvents="none" style={styles.lineIcon}>
    {paths.map((path) => <Path key={path} color={productColor.ink} path={path} strokeCap="round" strokeJoin="round" strokeWidth={1.65} style="stroke" />)}
  </Canvas>
);

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: productColor.page, borderBottomColor: productColor.divider, borderBottomWidth: StyleSheet.hairlineWidth, height: 56, position: 'relative' },
  headerIconButton: { alignItems: 'center', flexShrink: 0, height: 36, justifyContent: 'center', width: 36 },
  headerIconDisabled: { opacity: 0.75 },
  headerBack: { left: 20, position: 'absolute', top: 10 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 4, position: 'absolute', right: 20, top: 10 },
  ratioAnchor: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, pointerEvents: 'none', position: 'absolute', right: 0, top: 0 },
  ratioPill: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderColor: productColor.border, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, height: 30, justifyContent: 'center', minWidth: 48, paddingHorizontal: 13 },
  ratioLabel: { color: productColor.ink, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  exportButton: { alignItems: 'center', backgroundColor: productColor.ink, borderRadius: 999, flexShrink: 0, height: 30, justifyContent: 'center', marginLeft: 2, minWidth: 58, paddingHorizontal: 13 },
  exportLabel: { color: productColor.surface, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  lineIcon: { height: 24, width: 24 },
  toolbar: { backgroundColor: 'rgba(255,255,255,0.97)', borderColor: productColor.border, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, bottom: 24, height: 63, left: 12, overflow: 'hidden', position: 'absolute', right: 12, shadowColor: productColor.ink, shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.10, shadowRadius: 20 },
  toolbarTrack: { alignItems: 'flex-start', minWidth: '100%' },
  tool: { alignItems: 'center', height: 53, justifyContent: 'flex-start', paddingTop: 0, width: 58 },
  toolCompact: { width: 52 },
  toolWide: { width: 78 },
  toolIconSlot: { alignItems: 'center', height: 41, justifyContent: 'center', width: 41 },
  toolIcon: { height: 41, opacity: 0.72, width: 41 },
  toolIconSmall: { height: 28, width: 28 },
  toolLabel: { color: productColor.secondaryText, fontSize: 12, lineHeight: 16, marginTop: -3, textAlign: 'center', width: '100%' },
  layerToolbar: { backgroundColor: productColor.surface, borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 18, borderTopRightRadius: 18, bottom: 0, height: 160, left: 0, position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.06, shadowRadius: 22 },
  layerToolbarHead: { height: 34, justifyContent: 'center', paddingHorizontal: 20 },
  textLayerToolbarHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  layerToolbarTitle: { color: productColor.ink, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  textEditLink: { color: productColor.ink, fontSize: 13, fontWeight: '600' },
  layerActions: { marginHorizontal: 12 },
  layerActionRow: { flexDirection: 'row', height: 54 },
  layerActionRowSecond: { marginTop: 9 },
  textLayerActions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 0, width: '100%' },
  // Override the generic action's `flex: 1`; otherwise Yoga assigns every
  // action the full row width before wrapping it.
  textLayerAction: { flex: 0, flexBasis: '16.66%', flexGrow: 0, flexShrink: 0, maxWidth: '16.66%', width: '16.66%' },
  layerAction: { alignItems: 'center', flex: 1, height: 54, justifyContent: 'flex-start', minWidth: 0 },
  layerActionImage: { height: 24, resizeMode: 'contain', width: 24 },
  layerActionLabel: { color: productColor.ink, fontSize: 11, lineHeight: 15, marginTop: 3, textAlign: 'center', width: '100%' },
  actionIcon: { height: 24, position: 'relative', width: 24 },
  copySheet: { backgroundColor: productColor.surface, borderColor: productColor.ink, borderRadius: 2, borderWidth: 2, height: 11, position: 'absolute', width: 10 },
  copySheetBack: { left: 5, opacity: 0.38, top: 4 },
  copySheetFront: { left: 9, top: 8 },
  cropIcon: { height: 22, width: 22 },
  cropCorner: { borderColor: productColor.ink, height: 12, position: 'absolute', width: 12 },
  cropTopLeft: { borderLeftWidth: 2, borderTopWidth: 2, left: 2, top: 2 },
  cropBottomRight: { borderBottomWidth: 2, borderRightWidth: 2, bottom: 2, right: 2 },
  shadowBack: { backgroundColor: productColor.ink, borderRadius: 3, height: 12, left: 8, opacity: 0.24, position: 'absolute', top: 8, width: 12 },
  shadowFront: { backgroundColor: productColor.surface, borderColor: productColor.ink, borderRadius: 3, borderWidth: 2, height: 12, left: 4, position: 'absolute', top: 4, width: 12 },
  opacityIcon: { borderColor: productColor.ink, borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  opacityFill: { backgroundColor: productColor.ink, height: '100%', width: '50%' },
  cornerIcon: { borderColor: productColor.ink, borderRadius: 6, borderWidth: 2, height: 18, marginTop: 3, width: 18 },
  outlineBack: { borderColor: productColor.ink, borderRadius: 5, borderWidth: 3, height: 17, left: 3, opacity: 0.28, position: 'absolute', top: 3, width: 17 },
  outlineFront: { backgroundColor: productColor.surface, borderColor: productColor.ink, borderRadius: 3, borderWidth: 2, height: 11, left: 7, position: 'absolute', top: 7, width: 11 },
  effectPaper: { borderColor: productColor.ink, borderRadius: 2, borderWidth: 2, height: 17, left: 4, position: 'absolute', top: 4, width: 16 },
  effectTape: { backgroundColor: productColor.ink, height: 5, left: 9, opacity: 0.5, position: 'absolute', top: 3, transform: [{ rotate: '-9deg' }], width: 12 },
  scissorRing: { borderColor: productColor.ink, borderRadius: 6, borderWidth: 2, height: 8, position: 'absolute', top: 14, width: 8 },
  scissorRingLeft: { left: 4 },
  scissorRingRight: { right: 4 },
  scissorBlade: { backgroundColor: productColor.ink, borderRadius: 2, height: 13, left: 11, position: 'absolute', top: 3, transformOrigin: '50% 92%', width: 2 },
  scissorBladeLeft: { transform: [{ rotate: '-32deg' }] },
  scissorBladeRight: { transform: [{ rotate: '32deg' }] },
  scissorJoint: { backgroundColor: productColor.ink, borderRadius: 2, height: 4, left: 10, position: 'absolute', top: 13, width: 4 },
  embossFrame: { borderColor: productColor.ink, borderRadius: 5, borderWidth: 2, height: 16, left: 4, position: 'absolute', top: 4, width: 17 },
  embossStar: { backgroundColor: productColor.ink, height: 10, left: 8, position: 'absolute', top: 7, transform: [{ rotate: '45deg' }], width: 10 },
  selectionControl: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, height: 28, justifyContent: 'center', position: 'absolute', width: 28, zIndex: 4 },
  selectionControlIcon: { height: 18, resizeMode: 'contain', width: 18 },
});
