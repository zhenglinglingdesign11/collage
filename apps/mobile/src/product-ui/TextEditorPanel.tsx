import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getTextFontGroups, getTextFontVariants, type TextFont } from '@journalcollage/asset-system';
import type { TextLayer } from '@journalcollage/editor-core';
import { t, type ProductLocale } from './localization';
import { productColor } from './tokens';
import { ensureTextFont, fontStatus, subscribeFontStatus } from './fonts';
import { showCenterToast } from './CenterToast';

type Mode = 'font' | 'variant' | 'color' | 'size' | 'align' | 'background' | 'opacity';
const colors = ['#111111', '#4A4A4A', '#9A9A9A', '#FFFFFF', '#D94A38', '#E9D28A', '#8C9A8D', '#6D9BC3', '#C9B7FF'];
const backgrounds: readonly Readonly<{ value: string | null; label: 'editor.text.none' | 'editor.text.ink' | 'editor.text.paper' | 'editor.text.white' | 'editor.text.tape' }>[] = [{ value: null, label: 'editor.text.none' }, { value: '#EFE7D8', label: 'editor.text.paper' }, { value: '#FFFFFF', label: 'editor.text.white' }, { value: '#111111', label: 'editor.text.ink' }, { value: '#E9D28A', label: 'editor.text.tape' }];
export const TEXT_EDITOR_PANEL_HEIGHT = 238;
type Change = { fontId?: string; fontVariantId?: string; fontSize?: number; color?: string; textAlign?: TextLayer['textAlign']; backgroundColor?: string | null; opacity?: number };

export const TextEditorPanel = ({ bottomInset, keyboardHeight, layer, locale, onCancel, onChangeText, onDone, onStyleChange, text }: Readonly<{ bottomInset: number; keyboardHeight: number; layer: TextLayer; locale: ProductLocale; text: string; onCancel: () => void; onChangeText: (value: string) => void; onDone: () => void; onStyleChange: (change: Change) => void }>) => {
  const [mode, setMode] = useState<Mode>('font');
  const inputRef = useRef<TextInput>(null);
  const variants = useMemo(() => getTextFontVariants(layer.fontId), [layer.fontId]);
  const updateFont = (font: TextFont) => onStyleChange({ fontId: font.groupId, fontVariantId: font.variantId });
  const retainKeyboard = (apply: () => void) => {
    apply();
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  // On iOS an absolutely positioned input can mount after autoFocus ran.
  // Re-focus after layout so this editing state always requests the keyboard.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [layer.id]);
  return <View style={[styles.sheet, { bottom: keyboardHeight > 0 ? keyboardHeight : bottomInset }]}>
    <View style={styles.handle} />
    <View style={styles.header}><Pressable hitSlop={8} onPress={onCancel}><Text style={styles.cancel}>{t(locale, 'editor.text.cancel')}</Text></Pressable><Text style={styles.title}>{t(locale, 'editor.text.title')}</Text><Pressable hitSlop={8} onPress={onDone}><Text style={styles.done}>{t(locale, 'editor.text.done')}</Text></Pressable></View>
    <TextInput autoFocus blurOnSubmit={false} maxLength={240} multiline onChangeText={onChangeText} onLayout={() => inputRef.current?.focus()} placeholder={t(locale, 'editor.text.placeholder')} placeholderTextColor={productColor.tertiaryText} ref={inputRef} style={styles.input} value={text} />
    <View style={styles.toolRow}>{([['font', 'B', 'editor.text.font'], ['variant', 'Aa', 'editor.text.variant'], ['color', '●', 'editor.text.color'], ['size', 'A', 'editor.text.size'], ['align', '≡', 'editor.text.align'], ['background', '□', 'editor.text.background'], ['opacity', '▦', 'editor.text.opacity']] as const).map(([id, icon, label]) => <Pressable key={id} onPress={() => setMode(id)} style={styles.tool}><Text style={[styles.toolIcon, mode === id && styles.toolActive]}>{icon}</Text><Text numberOfLines={1} style={[styles.toolLabel, mode === id && styles.toolLabelActive]}>{t(locale, label)}</Text></Pressable>)}</View>
    <View style={styles.optionSlot}><Option mode={mode} layer={layer} locale={locale} variants={variants} onChange={(change) => retainKeyboard(() => onStyleChange(change))} onFont={(font) => retainKeyboard(() => updateFont(font))} /></View>
  </View>;
};

const Option = ({ layer, locale, mode, onChange, onFont, variants }: Readonly<{ layer: TextLayer; locale: ProductLocale; mode: Mode; onChange: (change: Change) => void; onFont: (font: TextFont) => void; variants: readonly TextFont[] }>) => {
  const currentColor = layer.color.toUpperCase();
  const colorOptions = colors.includes(currentColor) ? colors : [...colors, currentColor];
  const baseSizeOptions = [['42', 42], ['54', 54], ['68', 68], ['88', 88], ['112', 112], ['144', 144]] as const;
  const sizeOptions = baseSizeOptions.some(([, value]) => value === layer.fontSize)
    ? baseSizeOptions
    : [...baseSizeOptions, [String(layer.fontSize), layer.fontSize] as const].sort((left, right) => left[1] - right[1]);
  if (mode === 'font') return <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{getTextFontGroups().map((font) => <FontChoice active={layer.fontId === font.groupId} font={font} key={font.groupId} locale={locale} onPress={() => onFont(font)} />)}</ScrollView>;
  if (mode === 'variant') return <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{variants.map((font) => <FontChoice active={layer.fontVariantId === font.variantId} font={font} key={font.variantId} locale={locale} onPress={() => onFont(font)} />)}</ScrollView>;
  if (mode === 'color') return <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>{colorOptions.map((color) => <Pressable key={color} onPress={() => onChange({ color })} style={[styles.swatch, { backgroundColor: color }, color === '#FFFFFF' && styles.white, currentColor === color && styles.swatchActive]} />)}</ScrollView>;
  if (mode === 'size') return <ChoiceRow selected={layer.fontSize} choices={sizeOptions} onChoose={(fontSize) => onChange({ fontSize: fontSize as number })} />;
  if (mode === 'align') return <ChoiceRow selected={layer.textAlign} choices={[[t(locale, 'editor.text.left'), 'left'], [t(locale, 'editor.text.center'), 'center'], [t(locale, 'editor.text.right'), 'right']]} onChoose={(textAlign) => onChange({ textAlign: textAlign as TextLayer['textAlign'] })} />;
  if (mode === 'background') return <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{backgrounds.map((background) => <Choice active={layer.backgroundColor === background.value} key={background.label} label={t(locale, background.label)} onPress={() => onChange({ backgroundColor: background.value })} />)}</ScrollView>;
  return <ChoiceRow selected={layer.opacity} choices={[['45%', 0.45], ['70%', 0.7], ['100%', 1]]} onChoose={(opacity) => onChange({ opacity: opacity as number })} />;
};
const Choice = ({ active, label, onPress }: Readonly<{ active: boolean; label: string; onPress: () => void }>) => <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text></Pressable>;
const ChoiceRow = ({ choices, onChoose, selected }: Readonly<{ choices: readonly (readonly [string, string | number])[]; onChoose: (value: string | number) => void; selected: string | number }>) => <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRow}>{choices.map(([label, value]) => <Choice active={selected === value} key={label} label={label} onPress={() => onChoose(value)} />)}</ScrollView>;
const fontPreviewAssets = {
  codystar_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/codystar_regular.png'), codystar_light: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/codystar_light.png'), gemini_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/gemini_regular.png'), kelsi_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/kelsi_regular.png'), kelsi_fill: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/kelsi_fill.png'), little_kids: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/little_kids.png'), melted_ideas: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/melted_ideas.png'), mountains_christmas_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/mountains_christmas_regular.png'), mountains_christmas_bold: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/mountains_christmas_bold.png'), sweet_dreams: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/sweet_dreams.png'), kose_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/kose_regular.png'), xinyugong_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/xinyugong_regular.png'), kurewa_gothic_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/kurewa_gothic_regular.png'), qingsong_handwriting_regular: require('../../../../miniprogram-spike/miniprogram/assets/font-previews/qingsong_handwriting_regular.png'),
} as const;
const FontChoice = ({ active, font, locale, onPress }: Readonly<{ active: boolean; font: TextFont; locale: ProductLocale; onPress: () => void }>) => {
  const preview = font.variantId === 'system' ? undefined : fontPreviewAssets[font.variantId as keyof typeof fontPreviewAssets];
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const previewRetryPending = useRef(false);
  const fontRetryPending = useRef(false);
  const fontRetryStarted = useRef(false);
  const status = useSyncExternalStore(subscribeFontStatus, () => fontStatus(font.variantId));
  useEffect(() => {
    if (status === 'loading' && fontRetryPending.current) fontRetryStarted.current = true;
    else if (status === 'failed' && fontRetryStarted.current) {
      fontRetryPending.current = false;
      fontRetryStarted.current = false;
      showCenterToast(locale === 'zh-Hans' ? '字体仍无法加载，请检查网络' : 'Font still unavailable. Check your connection.');
    } else if (status === 'ready') {
      fontRetryPending.current = false;
      fontRetryStarted.current = false;
    }
  }, [locale, status]);
  const failPreview = () => {
    setPreviewFailed(true);
    if (!previewRetryPending.current) return;
    previewRetryPending.current = false;
    showCenterToast(locale === 'zh-Hans' ? '字体预览仍无法加载，请检查网络' : 'Font preview still unavailable. Check your connection.');
  };
  const retryPreview = () => {
    previewRetryPending.current = true;
    setPreviewLoaded(false);
    setPreviewFailed(false);
    setPreviewAttempt((value) => value + 1);
  };
  const pressFont = () => {
    if (status === 'failed') fontRetryPending.current = true;
    onPress();
  };
  useEffect(() => {
    if (!active || status !== 'failed') return;
    const timer = setTimeout(() => { void ensureTextFont(font.variantId); }, 10_000);
    return () => clearTimeout(timer);
  }, [active, font.variantId, status]);
  useEffect(() => {
    if (!previewFailed) return;
    const timer = setTimeout(() => { setPreviewLoaded(false); setPreviewFailed(false); setPreviewAttempt((value) => value + 1); }, 10_000);
    return () => clearTimeout(timer);
  }, [previewFailed, previewAttempt]);
  useEffect(() => {
    if (!preview || previewFailed || previewLoaded) return;
    const timer = setTimeout(failPreview, 8_000);
    return () => clearTimeout(timer);
  }, [preview, previewAttempt, previewFailed, previewLoaded]);
  const statusLabel = previewFailed ? (locale === 'zh-Hans' ? '预览失败，点按重试' : 'Preview failed, tap to retry') : status === 'idle' ? (locale === 'zh-Hans' ? '待下载' : 'Download') : status === 'loading' ? (locale === 'zh-Hans' ? '下载中' : 'Loading') : status === 'failed' ? (locale === 'zh-Hans' ? '下载失败，点按重试' : 'Download failed, tap to retry') : (locale === 'zh-Hans' ? '已就绪' : 'Ready');
  return <Pressable accessibilityRole="button" accessibilityLabel={`${font.label} ${font.variantLabel}, ${statusLabel}`} accessibilityState={{ busy: status === 'loading', selected: active }} onPress={previewFailed ? retryPreview : pressFont} style={[styles.fontChoice, active && styles.choiceActive]}>
    <Text numberOfLines={1} style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{font.previewText}</Text>
    {preview && !previewFailed && <View pointerEvents="none" style={[styles.fontPreviewOverlay, active && styles.fontPreviewOverlayActive, !previewLoaded && styles.fontPreviewPending]}><Image key={previewAttempt} onError={failPreview} onLoad={() => { previewRetryPending.current = false; setPreviewLoaded(true); }} resizeMode="contain" source={preview} style={[styles.fontPreview, active && styles.fontPreviewActive]} /></View>}
    {previewFailed ? <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh-Hans' ? '重试字体预览' : 'Retry font preview'} hitSlop={5} onPress={(event) => { event.stopPropagation(); retryPreview(); }} style={[styles.fontStatusBadge, styles.fontStatusFailed]}><Text style={styles.fontStatusGlyph}>↻</Text></Pressable>
      : font.remoteSource && status === 'failed' ? <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh-Hans' ? '重试字体下载' : 'Retry font download'} hitSlop={5} onPress={(event) => { event.stopPropagation(); pressFont(); }} style={[styles.fontStatusBadge, styles.fontStatusFailed]}><Text style={styles.fontStatusGlyph}>↻</Text></Pressable>
      : font.remoteSource && status !== 'ready' ? <View pointerEvents="none" style={styles.fontStatusBadge}>{status === 'loading' ? <ActivityIndicator color={productColor.ink} size="small" style={styles.fontStatusSpinner} /> : <Text style={styles.fontStatusGlyph}>↓</Text>}</View> : null}
  </Pressable>;
};

const styles = StyleSheet.create({
  fontPreviewOverlay: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  fontPreviewOverlayActive: { backgroundColor: productColor.ink },
  fontPreviewPending: { opacity: 0 },
  fontStatusBadge: { alignItems: 'center', backgroundColor: '#E9E7E2', borderColor: productColor.surface, borderRadius: 9, borderWidth: 1, height: 18, justifyContent: 'center', position: 'absolute', right: -5, top: -6, width: 18 },
  fontStatusFailed: { backgroundColor: '#F4DCD7' },
  fontStatusGlyph: { color: productColor.ink, fontSize: 12, fontWeight: '700', lineHeight: 15 },
  fontStatusSpinner: { transform: [{ scale: 0.55 }] },
  sheet: { backgroundColor: productColor.surface, borderTopColor: productColor.divider, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth, height: TEXT_EDITOR_PANEL_HEIGHT, left: 0, paddingHorizontal: 18, position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.08, shadowRadius: 22, zIndex: 12 }, handle: { alignSelf: 'center', backgroundColor: productColor.border, borderRadius: 99, height: 4, marginTop: 8, width: 36 }, header: { alignItems: 'center', flexDirection: 'row', height: 40, justifyContent: 'space-between' }, cancel: { color: productColor.secondaryText, fontSize: 14 }, done: { color: productColor.ink, fontSize: 14, fontWeight: '700' }, title: { color: productColor.ink, fontSize: 16, fontWeight: '700' }, input: { backgroundColor: '#F8F7F4', borderRadius: 10, color: productColor.ink, fontSize: 15, height: 48, paddingHorizontal: 12, paddingVertical: 11, textAlignVertical: 'top' }, optionSlot: { height: 54, overflow: 'hidden' }, optionRow: { alignItems: 'center', gap: 9, paddingVertical: 9 }, choice: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 35, justifyContent: 'center', minWidth: 68, paddingHorizontal: 13 }, fontChoice: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 35, justifyContent: 'center', minWidth: 82, paddingHorizontal: 13 }, fontPreview: { height: 22, tintColor: productColor.ink, width: 62 }, fontPreviewActive: { tintColor: productColor.surface }, choiceActive: { backgroundColor: productColor.ink }, choiceLabel: { color: productColor.ink, fontSize: 13, fontWeight: '600' }, choiceLabelActive: { color: productColor.surface }, swatchRow: { alignItems: 'center', gap: 16, paddingVertical: 12 }, swatch: { borderRadius: 15, height: 30, width: 30 }, white: { borderColor: productColor.border, borderWidth: StyleSheet.hairlineWidth }, swatchActive: { borderColor: productColor.ink, borderWidth: 3 }, stepRow: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 54, justifyContent: 'flex-start' }, toolRow: { borderTopColor: productColor.divider, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 61, justifyContent: 'space-between', paddingTop: 6 }, tool: { alignItems: 'center', flex: 1, minWidth: 0 }, toolIcon: { color: productColor.secondaryText, fontSize: 17, fontWeight: '600', height: 24, lineHeight: 22 }, toolActive: { color: productColor.ink }, toolLabel: { color: productColor.secondaryText, fontSize: 10, lineHeight: 14, textAlign: 'center' }, toolLabelActive: { color: productColor.ink, fontWeight: '700' },
});
