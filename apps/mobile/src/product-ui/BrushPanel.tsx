import type { BrushDefinition } from '@journalcollage/editor-core';
import { colorsFor } from '@journalcollage/asset-system';
import { DecorativeBrushPreview } from '@journalcollage/editor-renderer';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t, type ProductLocale } from './localization';
import { productColor } from './tokens';

const colors = colorsFor('brush.stroke');
const sizes = [8, 16, 24, 36, 48, 64] as const;

/** Base reserved height; the safe-area inset is included by the parent padding. */
export const BRUSH_EDITOR_PANEL_HEIGHT = 310;

export const BrushPanel = ({ bottomInset, brushAssetUris, brushId, color, definitions, hasPaintStrokes, hasRedo, hasStrokes, isErasing, locale, onBrushChange, onCancel, onClear, onColorChange, onDone, onEraserToggle, onRedo, onSizeChange, onUndo, size }: Readonly<{
  bottomInset: number;
  brushAssetUris: Readonly<Record<string, string>>;
  brushId: string;
  color: string;
  definitions: readonly BrushDefinition[];
  hasPaintStrokes: boolean;
  hasRedo: boolean;
  hasStrokes: boolean;
  isErasing: boolean;
  locale: ProductLocale;
  onBrushChange: (definition: BrushDefinition) => void;
  onCancel: () => void;
  onClear: () => void;
  onColorChange: (color: string) => void;
  onDone: () => void;
  onEraserToggle: () => void;
  onRedo: () => void;
  onSizeChange: (size: number) => void;
  onUndo: () => void;
  size: number;
}>) => (
  <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancel}><Text style={styles.cancel}>{t(locale, 'editor.text.cancel')}</Text></Pressable>
      <Text style={styles.title}>{t(locale, 'editor.brush.title')}</Text>
      <Pressable accessibilityRole="button" disabled={!hasPaintStrokes} hitSlop={8} onPress={onDone}><Text style={[styles.done, !hasPaintStrokes && styles.disabled]}>{t(locale, 'editor.text.done')}</Text></Pressable>
    </View>
    <OptionRow label={t(locale, 'editor.brush.kind')} tall>
      {definitions.map((definition) => <Pressable accessibilityRole="button" accessibilityState={{ selected: definition.id === brushId && !isErasing }} key={definition.id} onPress={() => onBrushChange(definition)} style={[styles.brushOption, definition.id === brushId && !isErasing && styles.brushOptionActive]}>
        <View pointerEvents="none" style={styles.brushPreview}><DecorativeBrushPreview assetUri={definition.asset ? brushAssetUris[definition.asset.id] : undefined} color={color} definition={definition} size={{ width: 54, height: 34 }} /></View>
        <Text numberOfLines={1} style={styles.choiceText}>{t(locale, recipeKey(definition.recipe))}</Text>
      </Pressable>)}
    </OptionRow>
    <OptionRow label={t(locale, 'editor.brush.color')} muted={isErasing}>
      {colors.map((candidate) => <Pressable accessibilityLabel={candidate} accessibilityRole="button" accessibilityState={{ selected: candidate === color }} disabled={isErasing} key={candidate} onPress={() => onColorChange(candidate)} style={[styles.swatch, candidate === color && styles.swatchActive]}><View style={[styles.swatchFill, { backgroundColor: candidate }]} /></Pressable>)}
    </OptionRow>
    <OptionRow label={t(locale, 'editor.brush.size')}>
      {sizes.map((candidate) => <Pressable accessibilityRole="button" accessibilityState={{ selected: candidate === size }} key={candidate} onPress={() => onSizeChange(candidate)} style={[styles.choice, candidate === size && styles.choiceActive]}><Text style={[styles.choiceText, candidate === size && styles.choiceTextActive]}>{candidate}</Text></Pressable>)}
    </OptionRow>
    <View style={styles.actionRow}>
      <Pressable accessibilityRole="button" disabled={!hasStrokes} onPress={onClear} style={[styles.choice, !hasStrokes && styles.choiceDisabled]}><Text style={[styles.choiceText, styles.dangerText, !hasStrokes && styles.disabled]}>{t(locale, 'editor.brush.clear')}</Text></Pressable>
      <View style={styles.actionSpacer} />
      <Pressable accessibilityRole="button" disabled={!hasStrokes} onPress={onUndo} style={[styles.choice, !hasStrokes && styles.choiceDisabled]}><Text style={[styles.choiceText, !hasStrokes && styles.disabled]}>{t(locale, 'editor.brush.undo')}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!hasRedo} onPress={onRedo} style={[styles.choice, !hasRedo && styles.choiceDisabled]}><Text style={[styles.choiceText, !hasRedo && styles.disabled]}>{t(locale, 'editor.brush.redo')}</Text></Pressable>
      <Pressable accessibilityLabel={t(locale, 'editor.brush.eraser')} accessibilityRole="button" accessibilityState={{ selected: isErasing }} onPress={onEraserToggle} style={[styles.eraserAction, isErasing && styles.choiceActive]}><EraserIcon active={isErasing} /></Pressable>
    </View>
  </View>
);

const OptionRow = ({ children, label, muted = false, tall = false }: Readonly<{ children: React.ReactNode; label: string; muted?: boolean; tall?: boolean }>) => <View style={[styles.optionGroup, tall && styles.optionGroupTall, muted && styles.muted]}>
  <Text style={styles.optionLabel}>{label}</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{children}</ScrollView>
</View>;

const recipeKey = (recipe: BrushDefinition['recipe']) => `editor.brush.${recipe}` as const;
const EraserIcon = ({ active }: Readonly<{ active: boolean }>) => <View pointerEvents="none" style={styles.eraserIcon}>
  <View style={[styles.eraserCap, active && styles.eraserCapActive]} />
  <View style={[styles.eraserFace, active && styles.eraserFaceActive]} />
</View>;

const styles = StyleSheet.create({
  sheet: { backgroundColor: productColor.surface, borderColor: productColor.divider, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, left: 0, paddingHorizontal: 18, paddingTop: 8, position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.08, shadowRadius: 22, zIndex: 12 },
  handle: { alignSelf: 'center', backgroundColor: productColor.border, borderRadius: 99, height: 4, width: 36 },
  header: { alignItems: 'center', flexDirection: 'row', height: 38, justifyContent: 'space-between' },
  cancel: { color: productColor.secondaryText, fontSize: 14 }, title: { color: productColor.ink, fontSize: 16, fontWeight: '700' }, done: { color: productColor.ink, fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.42 },
  optionGroup: { alignItems: 'center', flexDirection: 'row', height: 42 }, optionGroupTall: { height: 72 }, optionLabel: { color: productColor.ink, fontSize: 13, fontWeight: '600', width: 52 }, optionRow: { alignItems: 'center', gap: 8, paddingRight: 18 }, muted: { opacity: 0.42 },
  brushOption: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderColor: 'transparent', borderRadius: 10, borderWidth: 1.5, height: 62, justifyContent: 'center', paddingHorizontal: 5, width: 66 }, brushOptionActive: { backgroundColor: '#FFFFFF', borderColor: productColor.ink }, brushPreview: { alignItems: 'center', height: 38, justifyContent: 'center', overflow: 'hidden', width: 54 },
  choice: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 32, justifyContent: 'center', minWidth: 34, paddingHorizontal: 11 }, choiceActive: { backgroundColor: productColor.ink }, choiceDisabled: { opacity: 0.42 }, choiceText: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600' }, choiceTextActive: { color: productColor.surface },
  swatch: { alignItems: 'center', borderColor: 'transparent', borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 }, swatchActive: { borderColor: productColor.ink }, swatchFill: { borderRadius: 9, height: 18, width: 18 },
  actionRow: { alignItems: 'center', borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, height: 46, paddingTop: 8 }, actionSpacer: { flex: 1 }, dangerText: { color: '#C34A3C' },
  eraserAction: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 32, justifyContent: 'center', width: 38 }, eraserIcon: { backgroundColor: '#FFFFFF', borderColor: '#111111', borderRadius: 3, borderWidth: 2, height: 20, overflow: 'hidden', position: 'relative', transform: [{ rotate: '-43deg' }], width: 13 }, eraserCap: { backgroundColor: '#111111', height: 10, left: -1, position: 'absolute', right: -1, top: -1 }, eraserFace: { backgroundColor: '#FFFFFF', bottom: 0, height: 8, left: 0, position: 'absolute', right: 0 }, eraserCapActive: { backgroundColor: '#FFFFFF' }, eraserFaceActive: { backgroundColor: '#111111' },
});
