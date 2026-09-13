import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { EFFECT_CATALOG, type Effect, type Layer } from '@journalcollage/editor-core';
import { t, type ProductCopyKey, type ProductLocale } from './localization';
import { productColor } from './tokens';

type EffectCategory = 'structure' | 'texture';
type Control = Readonly<{ label: ProductCopyKey; max: number; min: number; param: 'blur' | 'edgeWidth' | 'width' | 'intensity' | 'radius' | 'scale'; step: number }>;
type CenterFrameId = 'wide-hole' | 'classic-doily' | 'foil-crumpled';
type TextureLabel = Readonly<{ en: string; zh: string }>;
type TextureOption = Readonly<{ label: TextureLabel; value: string | number }>;
type TextureControl = Readonly<{ key: string; label: TextureLabel; options: readonly TextureOption[] }>;

const textureLabel = (en: string, zh: string): TextureLabel => ({ en, zh });
const textureControlsFor = (effect: Effect): readonly TextureControl[] => {
  const option = (value: string | number, en: string, zh: string): TextureOption => ({ value, label: textureLabel(en, zh) });
  if (effect.type === 'print.cyanotype') return [
    { key: 'tone', label: textureLabel('Tone', '色调'), options: [option('prussian', 'Prussian', '普鲁士蓝'), option('teal', 'Teal', '蓝绿'), option('violet', 'Violet', '紫调'), option('rose', 'Rose', '玫瑰'), option('mono', 'Mono', '黑白')] },
    { key: 'intensity', label: textureLabel('Intensity', '强度'), options: [option('soft', 'Soft', '柔和'), option('standard', 'Standard', '标准'), option('deep', 'Deep', '浓郁')] },
    { key: 'paper', label: textureLabel('Paper', '纸张'), options: [option('cool', 'Cool', '冷白'), option('warm', 'Warm', '暖白'), option('aged', 'Aged', '旧纸'), option('gray', 'Gray', '灰纸')] },
    { key: 'grain', label: textureLabel('Grain', '颗粒'), options: [option('low', 'Low', '低'), option('medium', 'Medium', '中'), option('high', 'High', '高')] },
  ];
  if (effect.type === 'print.screen') return [
    { key: 'palette', label: textureLabel('Palette', '配色'), options: [option('red-blue', 'Red / blue', '红蓝'), option('orange-blue', 'Orange / blue', '橙蓝'), option('pink-green', 'Pink / green', '粉绿'), option('black-cream', 'Black / cream', '黑米'), option('purple-yellow', 'Purple / yellow', '紫黄')] },
    { key: 'strength', label: textureLabel('Strength', '浓度'), options: [option('soft', 'Soft', '柔和'), option('standard', 'Standard', '标准'), option('bold', 'Bold', '浓重')] },
    { key: 'halftone', label: textureLabel('Halftone', '网点'), options: [option('none', 'None', '无'), option('fine', 'Fine', '细'), option('medium', 'Medium', '中'), option('coarse', 'Coarse', '粗')] },
    { key: 'offset', label: textureLabel('Offset', '套印偏移'), options: [option('none', 'None', '无'), option('slight', 'Slight', '轻微'), option('strong', 'Strong', '明显')] },
  ];
  if (effect.type === 'print.riso') return [
    { key: 'palette', label: textureLabel('Palette', '配色'), options: [option('pink-blue', 'Pink / blue', '粉蓝'), option('orange-teal', 'Orange / teal', '橙绿'), option('purple-yellow', 'Purple / yellow', '紫黄'), option('red-black', 'Red / black', '红黑'), option('green-pink', 'Green / pink', '绿粉')] },
    { key: 'mode', label: textureLabel('Layers', '印色层数'), options: [option('duo', 'Two colors', '双色'), option('three', 'Three colors', '三色')] },
    { key: 'ink', label: textureLabel('Ink', '油墨'), options: [option('light', 'Light', '轻'), option('standard', 'Standard', '标准'), option('dense', 'Dense', '浓')] },
    { key: 'offset', label: textureLabel('Offset', '套印偏移'), options: [option('none', 'None', '无'), option('slight', 'Slight', '轻微'), option('strong', 'Strong', '明显')] },
    { key: 'grain', label: textureLabel('Grain', '颗粒'), options: [option('low', 'Low', '低'), option('medium', 'Medium', '中'), option('high', 'High', '高')] },
  ];
  if (effect.type === 'art.botanical-plate') return [
    { key: 'tone', label: textureLabel('Tone', '色调'), options: [option('blueprint', 'Blueprint', '蓝晒'), option('sage', 'Sage', '鼠尾草'), option('sepia', 'Sepia', '棕褐')] },
    { key: 'detail', label: textureLabel('Detail', '细节'), options: [option('soft', 'Soft', '柔和'), option('medium', 'Medium', '中等'), option('etched', 'Etched', '蚀刻')] },
    { key: 'frame', label: textureLabel('Border', '边框'), options: [option('on', 'On', '显示'), option('off', 'Off', '隐藏')] },
  ];
  if (effect.type === 'art.pixel-embroidery') return [
    { key: 'grid', label: textureLabel('Grid', '网格'), options: [option(48, 'Coarse', '粗'), option(72, 'Medium', '中'), option(104, 'Fine', '细')] },
    { key: 'colors', label: textureLabel('Colors', '颜色数'), options: [option(4, '4 colors', '4 色'), option(8, '8 colors', '8 色'), option(12, '12 colors', '12 色')] },
    { key: 'style', label: textureLabel('Style', '风格'), options: [option('pixel', 'Pixel', '像素'), option('stitch', 'Stitch', '针脚'), option('mixed', 'Mixed', '混合')] },
  ];
  if (effect.type === 'art.matisse-cutout') return [
    { key: 'detail', label: textureLabel('Detail', '细节'), options: [option(44, 'Simple', '简化'), option(64, 'Standard', '标准'), option(86, 'Fine', '丰富')] },
    { key: 'palette', label: textureLabel('Palette', '配色'), options: [option('vivid', 'Vivid', '鲜艳'), option('earth', 'Earth', '大地'), option('soft', 'Soft', '柔和')] },
  ];
  return [];
};

const controlFor = (effect: Effect): Control | null => {
  if (effect.type === 'light.shadow') return { label: 'editor.effects.blur', min: 0, max: 80, step: 1, param: 'blur' };
  if (effect.type === 'edge.outline') return { label: 'editor.effects.width', min: 0, max: 40, step: 1, param: 'width' };
  if (effect.type === 'paper.torn-edge') return { label: 'editor.effects.width', min: 6, max: 48, step: 1, param: 'edgeWidth' };
  if (effect.type === 'material.grain') return { label: 'editor.effects.intensity', min: 0, max: 1, step: 0.05, param: 'intensity' };
  if (effect.type === 'shape.round-corners') return { label: 'editor.effects.radius', min: 0, max: 160, step: 1, param: 'radius' };
  if (effect.type === 'frame.lace-center') return { label: 'editor.effects.scale', min: 0.45, max: 1, step: 0.05, param: 'scale' };
  if (effect.type === 'frame.foil-center') return { label: 'editor.effects.scale', min: 0.45, max: 1, step: 0.05, param: 'scale' };
  return null;
};

const makeEffect = (type: string, sequence: number): Effect => {
  const instanceId = `effect-sheet-${type}-${sequence}`;
  if (type === 'light.shadow') return { instanceId, type, version: 1, enabled: true, stage: 'underlay', params: { color: '#392F2A', opacity: 0.22, blur: 22, offset: { x: 16, y: 20 } } };
  if (type === 'edge.outline') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { color: '#FFF8EB', width: 12 } };
  if (type === 'paper.torn-edge') return { instanceId, type, version: 1, enabled: true, stage: 'geometry', params: { seed: 41, intensity: 24, edgeWidth: 16 } };
  if (type === 'shape.round-corners') return { instanceId, type, version: 1, enabled: true, stage: 'geometry', params: { radius: 28 } };
  if (type === 'attachment.tape') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { placement: 'double-corners', color: '#E9D28A', opacity: 0.72 } };
  if (type === 'paper.float') return { instanceId, type, version: 1, enabled: true, stage: 'underlay', params: { color: '#392F2A', opacity: 0.24, blur: 34, offset: { x: 16, y: 30 } } };
  if (type === 'frame.lace-center') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { color: '#FFF8EB', opacity: 0.95, frameId: 'wide-hole', scale: 1, contentScale: 1 } };
  if (type === 'frame.foil-center') return { instanceId, type, version: 1, enabled: true, stage: 'overlay', params: { color: '#FFFFFF', opacity: 1, frameId: 'foil-crumpled', scale: 1, contentScale: 1 } };
  if (type === 'print.cyanotype') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { tone: 'prussian', intensity: 'standard', paper: 'cool', grain: 'medium', seed: 23 } };
  if (type === 'print.screen') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { palette: 'red-blue', strength: 'standard', halftone: 'medium', offset: 'slight', seed: 23 } };
  if (type === 'print.riso') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { palette: 'pink-blue', mode: 'duo', ink: 'standard', offset: 'slight', grain: 'medium', seed: 23 } };
  if (type === 'art.botanical-plate') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { tone: 'blueprint', detail: 'medium', frame: 'on', seed: 23 } };
  if (type === 'art.pixel-embroidery') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { grid: 72, colors: 8, style: 'pixel', seed: 23 } };
  if (type === 'art.matisse-cutout') return { instanceId, type, version: 1, enabled: true, stage: 'content', params: { detail: 64, palette: 'vivid', seed: 23 } };
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
    // Texture effects are complete image-material recipes. Keeping one active
    // makes their paper, ink and print parameters legible instead of blending
    // unrelated colour pipelines together.
    const isTexture = EFFECT_CATALOG[type]?.category === 'texture';
    const retained = isTexture ? draft.filter((effect) => EFFECT_CATALOG[effect.type]?.category !== 'texture') : draft;
    setSequence((value) => value + 1); setSelectedId(next.instanceId); update([...retained, next]);
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
  const setValue = (nextValue: number) => {
    if (!selected || !control) return;
    const rounded = Math.round((Math.max(control.min, Math.min(control.max, nextValue)) / control.step)) * control.step;
    update(draft.map((effect) => effect.instanceId === selected.instanceId ? { ...effect, params: { ...effect.params, [control.param]: rounded } } : effect));
  };

  const adjusting = draft.find((effect) => effect.instanceId === adjustingId) ?? null;
  const adjustmentControl = adjusting ? controlFor(adjusting) : null;
  const patchAdjustment = (params: Readonly<Record<string, string | number>>) => {
    if (!adjusting) return;
    update(draft.map((effect) => effect.instanceId === adjusting.instanceId ? { ...effect, params: { ...effect.params, ...params } } : effect));
  };
  const setLaceValue = (key: 'scale' | 'contentScale', value: number) => {
    const range = key === 'scale' ? { min: 0.45, max: 1 } : { min: 0.65, max: 1.8 };
    patchAdjustment({ [key]: Math.max(range.min, Math.min(range.max, value)) });
  };
  const textureControls = adjusting ? textureControlsFor(adjusting) : [];
  if (adjusting && textureControls.length > 0) return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.cancel}>{t(locale, 'editor.effects.back')}</Text></Pressable><Text style={styles.title}>{effectLabel(locale, adjusting.type, adjusting.type)}</Text><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
    <ScrollView style={styles.textureAdjustmentScroll} contentContainerStyle={styles.textureAdjustment} showsVerticalScrollIndicator={false}>
      {textureControls.map((control) => <View key={control.key} style={styles.textureControl}><Text style={styles.controlLabel}>{locale === 'zh-Hans' ? control.label.zh : control.label.en}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.textureOptions}>{control.options.map((option) => {
        const active = adjusting.params[control.key] === option.value;
        return <Pressable key={String(option.value)} onPress={() => patchAdjustment({ [control.key]: option.value })} style={[styles.textureOption, active && styles.textureOptionActive]}><Text style={[styles.textureOptionLabel, active && styles.textureOptionLabelActive]}>{locale === 'zh-Hans' ? option.label.zh : option.label.en}</Text></Pressable>;
      })}</ScrollView></View>)}
    </ScrollView>
  </View>;
  if (adjusting?.type === 'frame.lace-center' || adjusting?.type === 'frame.foil-center') {
    const isFoil = adjusting.type === 'frame.foil-center';
    const frameId: CenterFrameId = isFoil ? 'foil-crumpled' : adjusting.params.frameId === 'classic-doily' ? 'classic-doily' : 'wide-hole';
    const openingScale = typeof adjusting.params.scale === 'number' ? adjusting.params.scale : 1;
    const contentScale = typeof adjusting.params.contentScale === 'number' ? adjusting.params.contentScale : 1;
    const frameOptions: readonly (readonly [CenterFrameId, ProductCopyKey])[] = isFoil
      ? [['foil-crumpled', 'editor.effects.foilCrumpled']]
      : [['wide-hole', 'editor.effects.laceWide'], ['classic-doily', 'editor.effects.laceClassic']];
    return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
      <View style={styles.handle} />
      <View style={styles.header}><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.cancel}>{t(locale, 'editor.effects.back')}</Text></Pressable><Text style={styles.title}>{effectLabel(locale, adjusting.type, adjusting.type)}</Text><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
      <View style={styles.adjustment}>
        <Text style={styles.controlLabel}>{t(locale, 'editor.effects.frameStyle')}</Text>
        <View style={[styles.laceOptions, frameOptions.length === 1 && styles.laceOptionsSingle]}>{frameOptions.map(([id, label]) => <Pressable key={id} onPress={() => patchAdjustment({ frameId: id })} style={[styles.laceOption, frameOptions.length === 1 && styles.laceOptionSingle, frameId === id && styles.laceOptionActive]}><View style={[styles.lacePreview, id === 'classic-doily' && styles.lacePreviewClassic, id === 'foil-crumpled' && styles.foilPreview]} /><Text style={[styles.laceOptionLabel, frameId === id && styles.laceOptionLabelActive]}>{t(locale, label)}</Text></Pressable>)}</View>
        <LaceSlider label={t(locale, 'editor.effects.laceOpening')} maximum={1} minimum={0.45} onChange={(value) => setLaceValue('scale', value)} value={openingScale} />
        <LaceSlider displayAsPercent={false} label={t(locale, 'editor.effects.laceContent')} maximum={100} minimum={0} onChange={(value) => setLaceValue('contentScale', 0.65 + value / 100 * 1.15)} value={(contentScale - 0.65) / 1.15 * 100} />
      </View>
    </View>;
  }
  if (adjusting && adjustmentControl) return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.cancel}>{t(locale, 'editor.effects.back')}</Text></Pressable><Text style={styles.title}>{effectLabel(locale, adjusting.type, adjusting.type)}</Text><Pressable hitSlop={10} onPress={() => setAdjustingId(null)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
    <View style={styles.adjustment}><Text style={styles.controlLabel}>{t(locale, adjustmentControl.label)}</Text><EffectSlider maximum={adjustmentControl.max} minimum={adjustmentControl.min} value={typeof adjusting.params[adjustmentControl.param] === 'number' ? adjusting.params[adjustmentControl.param] as number : adjustmentControl.min} onChange={setValue} /></View>
  </View>;
  return <View style={[styles.sheet, { paddingBottom: Math.max(12, bottomInset + 4) }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={10} onPress={onCancel}><Text style={styles.cancel}>{t(locale, 'editor.effects.cancel')}</Text></Pressable><Text style={styles.title}>{t(locale, 'editor.effects.title')}</Text><Pressable hitSlop={10} onPress={() => onCommit(draft)}><Text style={styles.done}>{t(locale, 'editor.effects.done')}</Text></Pressable></View>
    {(['structure', 'texture'] as const).map((category) => <View key={category} style={styles.section}><Text style={styles.sectionTitle}>{t(locale, category === 'structure' ? 'editor.effects.structure' : 'editor.effects.texture')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.effectTrack}><Pressable accessibilityLabel={t(locale, 'editor.effects.none')} onPress={() => clearCategory(category)} style={styles.effectTile}><View style={styles.noneGlyph} /><Text numberOfLines={1} style={styles.effectLabel}>{t(locale, 'editor.effects.none')}</Text></Pressable>{available(category).map((definition) => { const effect = draft.find((item) => item.type === definition.type); const active = effect !== undefined; return <Pressable key={definition.type} onLongPress={() => remove(definition.type)} onPress={() => toggle(definition.type)} style={[styles.effectTile, active && styles.effectTileActive]}><View style={[styles.effectGlyph, active && styles.effectGlyphActive]} /><Text numberOfLines={1} style={[styles.effectLabel, active && styles.effectLabelActive]}>{effectLabel(locale, definition.type, definition.label)}</Text>{effect && (controlFor(effect) || textureControlsFor(effect).length > 0) && <Pressable hitSlop={8} onPress={() => setAdjustingId(effect.instanceId)} style={styles.adjust}><Text style={styles.adjustText}>≡</Text></Pressable>}</Pressable>; })}</ScrollView></View>)}
  </View>;
};

const LaceSlider = ({ displayAsPercent = true, label, maximum, minimum, onChange, value }: Readonly<{ displayAsPercent?: boolean; label: string; maximum: number; minimum: number; onChange: (value: number) => void; value: number }>) => <View style={styles.laceControl}><View style={styles.controlHeader}><Text style={styles.controlLabel}>{label}</Text><Text style={styles.controlValue}>{Math.round(displayAsPercent ? value * 100 : value)}%</Text></View><EffectSlider maximum={maximum} minimum={minimum} onChange={onChange} value={value} /></View>;

const effectLabel = (locale: ProductLocale, type: string, fallback: string): string => {
  const keys: Record<string, ProductCopyKey> = { 'light.shadow': 'editor.effects.shadow', 'edge.outline': 'editor.effects.outline', 'paper.torn-edge': 'editor.effects.torn', 'material.grain': 'editor.effects.grain', 'shape.round-corners': 'editor.effects.corners', 'attachment.tape': 'editor.effects.tape', 'paper.float': 'editor.effects.float', 'frame.lace-center': 'editor.effects.lace', 'frame.foil-center': 'editor.effects.foil', 'print.cyanotype': 'editor.effects.cyanotype', 'print.screen': 'editor.effects.screenPrint', 'print.riso': 'editor.effects.riso', 'art.botanical-plate': 'editor.effects.botanical', 'art.pixel-embroidery': 'editor.effects.pixelEmbroidery', 'art.matisse-cutout': 'editor.effects.matisse' };
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
  section: { marginBottom: 14 }, sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '700', marginBottom: 5 }, effectTrack: { gap: 10, paddingRight: 18 }, adjust: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 8, height: 17, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 17 }, adjustText: { color: productColor.ink, fontSize: 13, fontWeight: '800', lineHeight: 15 }, adjustment: { borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 0, paddingTop: 8 }, textureAdjustmentScroll: { borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth }, textureAdjustment: { gap: 12, paddingTop: 10, paddingBottom: 4 }, textureControl: { gap: 7 }, textureOptions: { gap: 8, paddingRight: 18 }, textureOption: { borderColor: productColor.border, borderRadius: 99, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 7 }, textureOptionActive: { backgroundColor: productColor.ink, borderColor: productColor.ink }, textureOptionLabel: { color: productColor.ink, fontSize: 12, fontWeight: '600' }, textureOptionLabelActive: { color: productColor.surface }, laceOptions: { flexDirection: 'row', gap: 10, marginTop: 9 }, laceOptionsSingle: { alignSelf: 'flex-start' }, laceOption: { alignItems: 'center', borderColor: productColor.border, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, flex: 1, gap: 5, paddingBottom: 7, paddingTop: 7 }, laceOptionSingle: { flex: 0, width: 86 }, laceOptionActive: { backgroundColor: productColor.ink, borderColor: productColor.ink }, lacePreview: { borderColor: '#BFAF9D', borderRadius: 99, borderWidth: 5, height: 26, width: 26 }, lacePreviewClassic: { borderWidth: 8 }, foilPreview: { borderColor: '#BEC3C9', borderStyle: 'dashed', borderWidth: 7 }, laceOptionLabel: { color: productColor.ink, fontSize: 11, fontWeight: '600' }, laceOptionLabelActive: { color: productColor.surface }, laceControl: { marginTop: 13 },
  noneGlyph: { borderColor: productColor.secondaryText, borderRadius: 4, borderWidth: 1.5, height: 18, transform: [{ rotate: '-45deg' }], width: 18 },
});
