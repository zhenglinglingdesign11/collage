import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { EFFECT_CATALOG, type Effect, type Layer } from '@journalcollage/editor-core';
import { t, type ProductCopyKey, type ProductLocale } from './localization';
import { productColor } from './tokens';

type EffectCategory = 'structure' | 'texture';
type Control = Readonly<{ label: ProductCopyKey; max: number; min: number; param: 'blur' | 'width' | 'intensity' | 'radius' | 'scale'; step: number }>;

const controlFor = (effect: Effect): Control | null => {
  if (effect.type === 'light.shadow') return { label: 'editor.effects.blur', min: 0, max: 80, step: 1, param: 'blur' };
  if (effect.type === 'edge.outline') return { label: 'editor.effects.width', min: 0, max: 40, step: 1, param: 'width' };
  if (effect.type === 'paper.torn-edge') return { label: 'editor.effects.intensity', min: 2, max: 70, step: 1, param: 'intensity' };
  if (effect.type === 'material.grain') return { label: 'editor.effects.intensity', min: 0, max: 1, step: 0.05, param: 'intensity' };
  if (effect.type === 'shape.round-corners') return { label: 'editor.effects.radius', min: 0, max: 160, step: 1, param: 'radius' };
  if (effect.type === 'frame.lace-center') return { label: 'editor.effects.scale', min: 0.45, max: 1, step: 0.05, param: 'scale' };
  return null;
};

const makeEffect = (type: string, sequence: number): Effect => {
  const instanceId = `effect-sheet-${type}-${sequence}`;
  if (type === 'light.shadow') return { instanceId, type, version: 1, enabled: true, stage: 'underlay', params: { color: '#392F2A', opacity: 0.22, blur: 22, offset: { x: 16, y: 20 } } };
  if (type === 'edge.outline') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { color: '#FFF8EB', width: 12 } };
  if (type === 'paper.torn-edge') return { instanceId, type, version: 1, enabled: true, stage: 'geometry', params: { seed: 41, intensity: 24 } };
  if (type === 'shape.round-corners') return { instanceId, type, version: 1, enabled: true, stage: 'geometry', params: { radius: 28 } };
  if (type === 'attachment.tape') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { placement: 'double-corners', color: '#E9D28A', opacity: 0.72 } };
  if (type === 'paper.float') return { instanceId, type, version: 1, enabled: true, stage: 'underlay', params: { color: '#392F2A', opacity: 0.24, blur: 34, offset: { x: 16, y: 30 } } };
  if (type === 'frame.lace-center') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { color: '#FFF8EB', opacity: 0.95, scale: 0.82 } };
  return { instanceId, type: 'material.grain', version: 1, enabled: true, stage: 'overlay', params: { color: '#554A42', intensity: 0.18, seed: 23 } };
};

export const EffectSheet = ({ bottomInset, effects, layer, locale, onCancel, onCommit, onPreview }: Readonly<{
  bottomInset: number;
  effects: readonly Effect[];
  layer: Layer;
  locale: ProductLocale;
  onCancel: () => void;
  onCommit: (effects: readonly Effect[]) => void;
  onPreview: (effects: readonly Effect[]) => void;
}>) => {
  const [draft, setDraft] = useState<readonly Effect[]>(effects);
  const [selectedId, setSelectedId] = useState<string | null>(effects[0]?.instanceId ?? null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [sequence, setSequence] = useState(0);
  useEffect(() => {
    setDraft(effects);
    setSelectedId(effects[0]?.instanceId ?? null);
    setAdjustingId(null);
  }, [effects, layer.id]);
  const available = (category: EffectCategory) => Object.values(EFFECT_CATALOG).filter((definition) => definition.category === category && definition.editorEntry !== 'layer-control' && definition.supportedLayers.includes(layer.type));
  const selected = draft.find((effect) => effect.instanceId === selectedId) ?? null;
  const update = (next: readonly Effect[]) => { setDraft(next); onPreview(next); };
  const toggle = (type: string) => {
    const existing = draft.find((effect) => effect.type === type);
    if (existing) {
      remove(type);
      return;
    }
    const next = makeEffect(type, sequence);
    setSequence((value) => value + 1); setSelectedId(next.instanceId); update([...draft, next]);
  };
  const remove = (type: string) => {
    const existing = draft.find((effect) => effect.type === type);
    if (!existing) return;
    setSelectedId((current) => current === existing.instanceId ? null : current);
    update(draft.filter((effect) => effect.instanceId !== existing.instanceId));
  };
  const clearCategory = (category: EffectCategory) => {
    const types = new Set(available(category).map((definition) => definition.type));
    setSelectedId(null); update(draft.filter((effect) => !types.has(effect.type)));
  };
  const control = selected ? controlFor(selected) : null;
  const value = control && selected && typeof selected.params[control.param] === 'number' ? selected.params[control.param] as number : 0;
  const setValue = (nextValue: number) => {
    if (!selected || !control) return;
    const rounded = Math.round((Math.max(control.min, Math.min(control.max, nextValue)) / control.step)) * control.step;
    update(draft.map((effect) => effect.instanceId === selected.instanceId ? { ...effect, params: { ...effect.params, [control.param]: rounded } } : effect));
  };

  const adjusting = draft.find((effect) => effect.instanceId === adjustingId) ?? null;
  const adjustmentControl = adjusting ? controlFor(adjusting) : null;
  if (adjusting && adjustmentControl) return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.cancel}>{t(locale, 'editor.effects.back')}</Text></Pressable><Text style={styles.title}>{effectLabel(locale, adjusting.type, adjusting.type)}</Text><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
    <View style={styles.adjustment}><Text style={styles.controlLabel}>{t(locale, adjustmentControl.label)}</Text><EffectSlider maximum={adjustmentControl.max} minimum={adjustmentControl.min} value={typeof adjusting.params[adjustmentControl.param] === 'number' ? adjusting.params[adjustmentControl.param] as number : 0} onChange={setValue} /></View>
  </View>;
  return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={10} onPress={onCancel}><Text style={styles.cancel}>{t(locale, 'editor.effects.cancel')}</Text></Pressable><Text style={styles.title}>{t(locale, 'editor.effects.title')}</Text><Pressable hitSlop={10} onPress={() => onCommit(draft)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
    {(['structure', 'texture'] as const).map((category) => <View key={category} style={styles.section}><Text style={styles.sectionTitle}>{t(locale, category === 'structure' ? 'editor.effects.structure' : 'editor.effects.texture')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.effectTrack}><Pressable accessibilityLabel={t(locale, 'editor.effects.none')} onPress={() => clearCategory(category)} style={styles.effectTile}><View style={styles.noneGlyph} /><Text numberOfLines={1} style={styles.effectLabel}>{t(locale, 'editor.effects.none')}</Text></Pressable>{available(category).map((definition) => { const effect = draft.find((item) => item.type === definition.type); const active = effect !== undefined; return <Pressable key={definition.type} onLongPress={() => remove(definition.type)} onPress={() => toggle(definition.type)} style={[styles.effectTile, active && styles.effectTileActive]}><View style={[styles.effectGlyph, active && styles.effectGlyphActive]} /><Text numberOfLines={1} style={[styles.effectLabel, active && styles.effectLabelActive]}>{effectLabel(locale, definition.type, definition.label)}</Text>{effect && controlFor(effect) && <Pressable hitSlop={8} onPress={() => setAdjustingId(effect.instanceId)} style={styles.adjust}><Text style={styles.adjustText}>≡</Text></Pressable>}</Pressable>; })}</ScrollView></View>)}
  </View>;
};

const effectLabel = (locale: ProductLocale, type: string, fallback: string): string => {
  const keys: Record<string, ProductCopyKey> = { 'light.shadow': 'editor.effects.shadow', 'edge.outline': 'editor.effects.outline', 'paper.torn-edge': 'editor.effects.torn', 'material.grain': 'editor.effects.grain', 'shape.round-corners': 'editor.effects.corners', 'attachment.tape': 'editor.effects.tape', 'paper.float': 'editor.effects.float', 'frame.lace-center': 'editor.effects.lace' };
  return keys[type] ? t(locale, keys[type]) : fallback;
};

const EffectSlider = ({ maximum, minimum, onChange, value }: Readonly<{ maximum: number; minimum: number; onChange: (value: number) => void; value: number }>) => {
  const [width, setWidth] = useState(1);
  const setFromEvent = (event: GestureResponderEvent) => onChange(minimum + Math.max(0, Math.min(width, event.nativeEvent.locationX)) / width * (maximum - minimum));
  const ratio = (value - minimum) / (maximum - minimum);
  return <View onLayout={(event: LayoutChangeEvent) => setWidth(Math.max(1, event.nativeEvent.layout.width))} onResponderGrant={setFromEvent} onResponderMove={setFromEvent} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} style={styles.slider}><View style={[styles.sliderFill, { width: `${ratio * 100}%` }]} /><View pointerEvents="none" style={[styles.thumb, { left: `${ratio * 100}%` }]} /></View>;
};

const styles = StyleSheet.create({
  sheet: { backgroundColor: productColor.surface, borderTopColor: productColor.divider, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, height: 286, left: 0, paddingHorizontal: 18, position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.08, shadowRadius: 22, zIndex: 14 },
  handle: { alignSelf: 'center', backgroundColor: '#D9D7D1', borderRadius: 3, height: 5, marginTop: 10, width: 42 }, header: { alignItems: 'center', flexDirection: 'row', height: 48, justifyContent: 'space-between' }, title: { color: productColor.ink, fontSize: 16, fontWeight: '700' }, cancel: { color: productColor.secondaryText, fontSize: 14 }, done: { color: productColor.ink, fontSize: 14, fontWeight: '700' }, categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 }, category: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 99, height: 32, justifyContent: 'center', paddingHorizontal: 15 }, categoryActive: { backgroundColor: productColor.ink }, categoryLabel: { color: productColor.secondaryText, fontSize: 13, fontWeight: '600' }, categoryLabelActive: { color: productColor.surface }, effectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, effectTile: { alignItems: 'center', borderColor: productColor.border, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, gap: 5, height: 68, justifyContent: 'center', width: 86 }, effectTileActive: { backgroundColor: productColor.ink, borderColor: productColor.ink }, effectGlyph: { backgroundColor: productColor.ink, borderRadius: 4, height: 17, opacity: 0.7, width: 22 }, effectGlyphActive: { backgroundColor: productColor.surface }, effectLabel: { color: productColor.ink, fontSize: 11, fontWeight: '600', maxWidth: 76, textAlign: 'center' }, effectLabelActive: { color: productColor.surface }, presetRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 16 }, presetTitle: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600', marginRight: 2 }, preset: { backgroundColor: productColor.weakSurface, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, presetText: { color: productColor.ink, fontSize: 12, fontWeight: '600' }, control: { borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 }, controlHeader: { flexDirection: 'row', justifyContent: 'space-between' }, controlLabel: { color: productColor.secondaryText, fontSize: 13, fontWeight: '600' }, controlValue: { color: productColor.ink, fontSize: 13, fontWeight: '700' }, slider: { backgroundColor: productColor.border, borderRadius: 4, height: 5, marginHorizontal: 4, marginTop: 15 }, sliderFill: { backgroundColor: productColor.ink, borderRadius: 4, height: 5 }, thumb: { backgroundColor: productColor.surface, borderColor: productColor.ink, borderRadius: 10, borderWidth: 2, height: 20, marginLeft: -10, marginTop: -7.5, position: 'absolute', width: 20 },
  section: { marginBottom: 14 }, sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '700', marginBottom: 5 }, effectTrack: { gap: 10, paddingRight: 18 }, adjust: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 8, height: 17, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 17 }, adjustText: { color: productColor.ink, fontSize: 13, fontWeight: '800', lineHeight: 15 }, adjustment: { borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 18 },
  noneGlyph: { borderColor: productColor.secondaryText, borderRadius: 4, borderWidth: 1.5, height: 18, transform: [{ rotate: '-45deg' }], width: 18 },
});
