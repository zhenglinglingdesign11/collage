import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { recommendedRemoteAssetPackIds, remoteAssetPacks, type AssetPackCategory, type ProceduralSticker, type RemoteAssetPack, type RemotePackItem } from '@journalcollage/asset-system';
import { productColor } from './tokens';
import { CachedProceduralStickerPreview, ProceduralItemPreview, ProceduralPackPreview } from './ProceduralMaterialPreview';
import { CachedRemoteImage } from './CachedRemoteImage';
import { ProceduralStickerPreview } from '@journalcollage/editor-renderer';

const categories: readonly Readonly<{ id: AssetPackCategory; label: string }>[] = [
  { id: 'recommended', label: 'Recommended' }, { id: 'sticker', label: 'Stickers' }, { id: 'tape', label: 'Tape' },
  { id: 'note', label: 'Notes' }, { id: 'mixed', label: 'Mixed' }, { id: 'frame', label: 'Frames' },
];

const intoRows = <T,>(items: readonly T[], columns: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / columns) }, (_, index) => items.slice(index * columns, (index + 1) * columns));

type ColorTarget = 'paper.background' | 'polka.background' | 'polka.foreground' | 'shape.fill' | 'shape.stroke';
const colorOptions: Readonly<Record<ColorTarget, readonly string[]>> = {
  // Large paper surfaces stay pale and low-saturation so photos and layered
  // stickers remain legible. The final four add cool-blue, jade, plum and
  // persimmon moods without turning the sheet into an accent object.
  'paper.background': ['#FFFAF2', '#ECEFF3', '#F6EAD8', '#EFE2CB', '#D8D1C5', '#FFF2B8', '#FFD9BF', '#F9ECE0', '#F8E7E4', '#F4B8C4', '#F2D9DF', '#EADCF8', '#F0E7F3', '#DFE8FF', '#E8F1FB', '#D7F0ED', '#E1F0E8', '#DFEEDD', '#C8D7CC', '#B8D8D6'],
  // Polka backgrounds are deliberately a compact subset of paper colors;
  // a strong foreground needs a quiet field beneath it.
  'polka.background': ['transparent', '#FFFFFF', '#FDF7EC', '#F7F7F5', '#F9ECE0', '#F5DFD8', '#F0E7F3', '#EAF1F6', '#E8F1FB', '#E1F0E8', '#D7DBC9'],
  // Detail colors combine dependable ink tones with youthful, high-energy
  // accents suitable for stickers, collage marks and social posts.
  'polka.foreground': ['#111111', '#FFFFFF', '#B79B75', '#FFF08A', '#B8D83D', '#F16A3A', '#D94A38', '#B45D79', '#FF9FB7', '#5F806F', '#58A88A', '#86CDBB', '#8FE3CF', '#6D9BC3', '#A9D8FF', '#C9B7FF', '#3A2038'],
  'shape.fill': ['transparent', '#ffffff', '#f2dfc6', '#d7c1a7', '#fff2b8', '#ffd9bf', '#f4b8c4', '#f7c8df', '#F16A3A', '#FF8FBA', '#cfe6bf', '#B8D83D', '#d7f0ed', '#bfe8db', '#58A88A', '#dfe8ff', '#b9d7ff', '#9EC5E8', '#eadcf8', '#B9A4F5', '#3A2038', '#111111'],
  'shape.stroke': ['', '#ffffff', '#111111', '#c79a62', '#7C9C19', '#D95328', '#d94a38', '#b45d79', '#5f806f', '#3F8F73', '#86cdbb', '#6d9bc3', '#4C80B8', '#8b79bd', '#3A2038'],
};
const colorsFor = (target: ColorTarget): readonly string[] => colorOptions[target];
const isWhiteColor = (color: string): boolean => color.toLowerCase() === '#ffffff';
const solidPaperColors = colorsFor('paper.background');
const polkaBackgrounds = colorsFor('polka.background');
const polkaForegrounds = colorsFor('polka.foreground');
const polkaShapes = ['circle', 'square', 'diamond', 'heart', 'star', 'cross'] as const;
type PolkaCustom = { background: string; foreground: string; shape: typeof polkaShapes[number]; radius: number; gap: number; style: 'solid' | 'soft' | 'outline'; opacity: number; offset: 'grid' | 'staggered' };
const basicShapeTypes = ['circle', 'square', 'triangle', 'heart', 'star', 'sparkle', 'flower', 'raindrop', 'diamond', 'rounded', 'cross', 'tag'] as const;
const basicShapeFills = colorsFor('shape.fill');
const basicShapeStrokes = colorsFor('shape.stroke');
const basicShapeTextures = [
  'https://assets.zllarchi.site/effects/shape-textures-01.png', 'https://assets.zllarchi.site/effects/shape-textures-02.png', 'https://assets.zllarchi.site/effects/shape-textures-03.png', 'https://assets.zllarchi.site/effects/shape-textures-04.png', 'https://assets.zllarchi.site/effects/shape-textures-05.png',
] as const;
type BasicShapeCustom = ProceduralSticker;

export const AssetDrawer = ({ initialCustomPolkaPaper = false, onAddItem, onAddCustomPolkaPaper, onAddCustomSolidPaper, onAddCustomBasicShape, onClose, onHeightChange, onViewAll, packs = remoteAssetPacks }: Readonly<{
  initialCustomPolkaPaper?: boolean;
  onAddItem: (item: RemotePackItem) => void;
  onAddCustomPolkaPaper: (paper: PolkaCustom) => void;
  onAddCustomSolidPaper: (color: string) => void;
  onAddCustomBasicShape: (sticker: ProceduralSticker, material: boolean) => void;
  onClose: () => void;
  onHeightChange?: (height: number) => void;
  onViewAll: () => void;
  packs?: readonly RemoteAssetPack[];
}>) => {
  const [category, setCategory] = useState<AssetPackCategory>('recommended');
  const [activePack, setActivePack] = useState<RemoteAssetPack | null>(null);
  const [customSolidPaper, setCustomSolidPaper] = useState(false);
  const [customPolkaPaper, setCustomPolkaPaper] = useState(initialCustomPolkaPaper);
  const [customBasicShape, setCustomBasicShape] = useState<null | boolean>(null);
  const [customColor, setCustomColor] = useState<string>(solidPaperColors[0]);
  const [polka, setPolka] = useState<PolkaCustom>({ background: '#FDF7EC', foreground: polkaForegrounds[0], shape: 'circle', radius: 5, gap: 32, style: 'solid', opacity: 0.64, offset: 'grid' });
  const [basicShape, setBasicShape] = useState<BasicShapeCustom>({ shape: 'circle', fillColor: '#f4b8c4', strokeColor: '', strokeWidth: 0, opacity: 1, count: 1, layout: 'single' });
  const visiblePacks = category === 'recommended'
    ? packs.filter((pack) => recommendedRemoteAssetPackIds.has(pack.id))
    : packs.filter((pack) => pack.category === category);
  const packRows = intoRows(visiblePacks, 3);

  return (
    <View onLayout={(event: LayoutChangeEvent) => onHeightChange?.(event.nativeEvent.layout.height)} style={styles.sheet}>
      <Pressable accessibilityLabel="Close materials" hitSlop={12} onPress={onClose} style={styles.handle} />
      <View style={styles.header}>
        {(activePack || customSolidPaper || customPolkaPaper || customBasicShape !== null) && <Pressable accessibilityLabel="Back to materials" hitSlop={10} onPress={() => customSolidPaper ? setCustomSolidPaper(false) : customPolkaPaper ? setCustomPolkaPaper(false) : customBasicShape !== null ? setCustomBasicShape(null) : setActivePack(null)} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable>}
        <Text numberOfLines={1} style={styles.title}>{customSolidPaper ? 'Custom paper' : customPolkaPaper ? 'Custom polka' : customBasicShape !== null ? (customBasicShape ? 'Custom material shape' : 'Custom shape') : activePack?.name ?? 'Materials'}</Text>
        <Pressable accessibilityLabel="View all materials" hitSlop={10} onPress={onViewAll}><Text style={styles.viewAll}>View all</Text></Pressable>
      </View>
      {customSolidPaper ? <View style={styles.customPaperPanel}>
        <View style={[styles.customPaperPreview, { backgroundColor: customColor }]} />
        <Text style={styles.customTitle}>Choose a color</Text>
        <ColorPickerGrid target="paper.background" selected={customColor} onSelect={setCustomColor} />
        <Pressable accessibilityLabel="Add custom paper" onPress={() => { onAddCustomSolidPaper(customColor); setCustomSolidPaper(false); }} style={styles.addCustomButton}><Text style={styles.addCustomButtonText}>Add paper</Text></Pressable>
      </View> : customPolkaPaper ? <View style={styles.polkaPanel}>
        <PolkaPreview paper={polka} />
        <ScrollView style={styles.polkaOptions} showsVerticalScrollIndicator={false}>
          <OptionRow label="Shape" options={polkaShapes} selected={polka.shape} onSelect={(shape) => setPolka((value) => ({ ...value, shape: shape as typeof polkaShapes[number] }))} />
          <ColorPickerRow label="Background" target="polka.background" selected={polka.background} onSelect={(background) => setPolka((value) => ({ ...value, background }))} />
          <ColorPickerRow label="Pattern" target="polka.foreground" selected={polka.foreground} onSelect={(foreground) => setPolka((value) => ({ ...value, foreground }))} />
          <OptionRow label="Size" options={['5', '9', '15']} selected={String(polka.radius)} onSelect={(value) => setPolka((state) => ({ ...state, radius: Number(value) }))} />
          <OptionRow label="Density" options={['Sparse', 'Medium', 'Dense']} selected={polka.gap === 72 ? 'Sparse' : polka.gap === 32 ? 'Dense' : 'Medium'} onSelect={(value) => setPolka((state) => ({ ...state, gap: value === 'Sparse' ? 72 : value === 'Dense' ? 32 : 48 }))} />
          <OptionRow label="Style" options={['solid', 'soft', 'outline']} selected={polka.style} onSelect={(style) => setPolka((state) => ({ ...state, style: style as typeof state.style }))} />
          <ChoiceRow label="Opacity" choices={[{ value: '0.38', label: 'Light' }, { value: '0.64', label: 'Medium' }, { value: '0.82', label: 'Soft' }, { value: '1', label: 'Full' }]} selected={String(polka.opacity)} onSelect={(opacity) => setPolka((state) => ({ ...state, opacity: Number(opacity) }))} />
          <OptionRow label="Arrange" options={['Grid', 'Staggered']} selected={polka.offset === 'grid' ? 'Grid' : 'Staggered'} onSelect={(value) => setPolka((state) => ({ ...state, offset: value === 'Staggered' ? 'staggered' : 'grid' }))} />
        </ScrollView>
        <Pressable accessibilityLabel="Add custom polka paper" onPress={() => { onAddCustomPolkaPaper(polka); setCustomPolkaPaper(false); }} style={styles.addCustomButton}><Text style={styles.addCustomButtonText}>Add paper</Text></Pressable>
      </View> : customBasicShape !== null ? <BasicShapeCustomPanel material={customBasicShape} value={basicShape} onChange={setBasicShape} onAdd={() => { onAddCustomBasicShape({ ...basicShape, textureSource: customBasicShape ? (basicShape.textureSource ?? basicShapeTextures[0]) : undefined, strokeColor: customBasicShape ? undefined : basicShape.strokeColor, strokeWidth: customBasicShape ? 0 : basicShape.strokeWidth }, customBasicShape); setCustomBasicShape(null); }} /> : activePack === null ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} style={styles.categoriesScroll}>
          {categories.map((entry) => <Pressable key={entry.id} onPress={() => setCategory(entry.id)} style={[styles.chip, category === entry.id && styles.chipActive]}><Text style={[styles.chipLabel, category === entry.id && styles.chipLabelActive]}>{entry.label}</Text></Pressable>)}
        </ScrollView>
        <ScrollView contentContainerStyle={styles.materialsContent} showsVerticalScrollIndicator={false} style={styles.materialsScroll}>
          <View style={styles.packGrid}>
            {packRows.map((row, rowIndex) => <View key={`pack-row-${rowIndex}`} style={styles.packRow}>
              {row.map((pack) => <Pressable key={pack.id} accessibilityLabel={pack.name} onPress={() => setActivePack(pack)} style={styles.packTile}>
                {pack.proceduralPreview ? <ProceduralPackPreview pack={pack} /> : <CachedRemoteImage cacheKey={`cover-${pack.id}`} source={pack.cover} style={styles.packCover} />}
              </Pressable>)}
            </View>)}
          </View>
        </ScrollView>
      </> : <ScrollView contentContainerStyle={styles.itemGrid} showsVerticalScrollIndicator={false}>
        {activePack.items.map((item) => <Pressable key={item.id} accessibilityLabel={item.action ? 'Customize material' : `Add ${item.id}`} onPress={() => item.action === 'custom-solid-paper' ? setCustomSolidPaper(true) : item.action === 'custom-polka-paper' ? setCustomPolkaPaper(true) : item.action === 'custom-basic-shape' ? (setBasicShape((value) => ({ ...value, fillColor: '#f4b8c4', textureSource: undefined })), setCustomBasicShape(false)) : item.action === 'custom-material-shape' ? (setBasicShape((value) => ({ ...value, fillColor: '#FFFFFF', strokeColor: undefined, strokeWidth: 0, textureSource: value.textureSource ?? basicShapeTextures[0] })), setCustomBasicShape(true)) : onAddItem(item)} style={styles.itemTile}>
          {item.action ? <View style={styles.customEntry}><Text style={styles.customEntryPlus}>+</Text><Text style={styles.customEntryLabel}>Custom</Text></View> : item.procedural ? <ProceduralItemPreview item={item} /> : <CachedRemoteImage cacheKey={`item-${item.reference.id}`} source={item.source} style={styles.itemImage} />}
        </Pressable>)}
      </ScrollView>}
    </View>
  );
};

const PolkaPreview = ({ paper }: Readonly<{ paper: PolkaCustom }>) => {
  const solidSymbols: Record<PolkaCustom['shape'], string> = { circle: '●', square: '■', diamond: '◆', heart: '♥', star: '★', cross: '+' };
  const outlineSymbols: Record<PolkaCustom['shape'], string> = { circle: '○', square: '□', diamond: '◇', heart: '♡', star: '☆', cross: '+' };
  const symbol = paper.style === 'outline' ? outlineSymbols[paper.shape] : solidSymbols[paper.shape];
  const scale = 160 / 580;
  const spacing = paper.gap * 1.5;
  const visibleHeight = 90 / scale;
  const columns = Math.ceil(580 / spacing);
  const rows = Math.ceil(visibleHeight / spacing) + 1;
  const fontSize = Math.max(5, paper.radius * 1.45 * scale * 1.55);
  return <View style={[styles.polkaPreview, { backgroundColor: paper.background }]}>{Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns);
    const x = (index % columns) * spacing + spacing / 2 + (paper.offset === 'staggered' && row % 2 === 1 ? spacing / 2 : 0);
    const y = row * spacing + spacing / 2;
    return <Text key={index} style={[styles.polkaPreviewMark, { color: paper.foreground, fontSize, left: x * scale - fontSize / 2, lineHeight: fontSize + 1, opacity: paper.style === 'soft' ? paper.opacity * 0.58 : paper.opacity, top: y * scale - fontSize / 2 }]}>{symbol}</Text>;
  })}</View>;
};
const ColorPickerRow = ({ label, target, onSelect, selected }: Readonly<{ label: string; target: ColorTarget; selected: string; onSelect: (value: string) => void }>) => <View style={styles.optionGroup}><Text style={styles.optionLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{colorsFor(target).map((color) => <ColorSwatch color={color} key={color} selected={color === selected} onPress={() => onSelect(color)} />)}</ScrollView></View>;
const ColorPickerGrid = ({ target, onSelect, selected }: Readonly<{ target: ColorTarget; selected: string; onSelect: (value: string) => void }>) => <View style={styles.colorGrid}>{colorsFor(target).map((color) => <ColorSwatch color={color} key={color} selected={color === selected} onPress={() => onSelect(color)} />)}</View>;
const ColorSwatch = ({ color, selected, onPress }: Readonly<{ color: string; selected: boolean; onPress: () => void }>) => <Pressable accessibilityLabel={color === 'transparent' ? 'Use transparent color' : `Use ${color}`} onPress={onPress} style={[styles.colorSwatch, color === 'transparent' ? styles.transparentSwatch : { backgroundColor: color }, isWhiteColor(color) && styles.whiteSwatch, selected && styles.colorSwatchSelected]}>{color === 'transparent' && <Text style={styles.transparentMark}>×</Text>}</Pressable>;
const OptionRow = ({ label, options, onSelect, selected }: Readonly<{ label: string; options: readonly string[]; selected: string; onSelect: (value: string) => void }>) => <View style={styles.optionGroup}><Text style={styles.optionLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{options.map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.optionChip, option === selected && styles.optionChipActive]}><Text style={[styles.optionText, option === selected && styles.optionTextActive]}>{option}</Text></Pressable>)}</ScrollView></View>;

const ChoiceRow = ({ label, choices, selected, onSelect }: Readonly<{ label: string; choices: readonly Readonly<{ value: string; label: string }>[]; selected: string; onSelect: (value: string) => void }>) => <View style={styles.optionGroup}><Text style={styles.optionLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{choices.map((choice) => <Pressable key={choice.value} onPress={() => onSelect(choice.value)} style={[styles.optionChip, choice.value === selected && styles.optionChipActive]}><Text style={[styles.optionText, choice.value === selected && styles.optionTextActive]}>{choice.label}</Text></Pressable>)}</ScrollView></View>;

const StrokeRow = ({ selected, onSelect }: Readonly<{ selected: string; onSelect: (color: string) => void }>) => <View style={styles.optionGroup}><Text style={styles.optionLabel}>Stroke</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{colorsFor('shape.stroke').map((color) => <Pressable key={color || 'none'} accessibilityLabel={color ? `Use ${color} stroke` : 'No stroke'} onPress={() => onSelect(color)} style={[styles.strokeSwatch, color === selected && styles.strokeSwatchSelected]}>{color ? <View style={[styles.strokeDot, { backgroundColor: color }, isWhiteColor(color) && styles.whiteStrokeDot]} /> : <Text style={styles.strokeNone}>×</Text>}</Pressable>)}</ScrollView></View>;

const TextureRow = ({ selected, onSelect }: Readonly<{ selected: string; onSelect: (source: string) => void }>) => <View style={styles.optionGroup}><Text style={styles.optionLabel}>Texture</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>{basicShapeTextures.map((source, index) => <Pressable key={source} accessibilityLabel={`Use texture ${index + 1}`} onPress={() => onSelect(source)} style={[styles.textureSwatch, source === selected && styles.textureSwatchSelected]}><CachedRemoteImage cacheKey={`shape-texture-${index + 1}`} source={source} style={styles.textureImage} /></Pressable>)}</ScrollView></View>;

const BasicShapeCustomPanel = ({ material, value, onChange, onAdd }: Readonly<{ material: boolean; value: BasicShapeCustom; onChange: (next: BasicShapeCustom) => void; onAdd: () => void }>) => {
  const set = (patch: Partial<BasicShapeCustom>) => onChange({ ...value, ...patch });
  const shapeChoices = [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' }, { value: 'heart', label: 'Heart' }, { value: 'star', label: 'Star' }, { value: 'sparkle', label: 'Sparkle' }, { value: 'flower', label: 'Flower' }, { value: 'raindrop', label: 'Drop' }, { value: 'diamond', label: 'Diamond' }, { value: 'rounded', label: 'Rounded' }, { value: 'cross', label: 'Cross' }, { value: 'tag', label: 'Tag' }] as const;
  return <View style={styles.polkaPanel}>
    <View style={styles.basicShapePreview}>{material ? <CachedProceduralStickerPreview cacheKey={`custom-shape-texture-${basicShapeTextures.indexOf((value.textureSource ?? basicShapeTextures[0]) as typeof basicShapeTextures[number]) + 1}`} sticker={{ ...value, fillColor: '#FFFFFF', textureSource: value.textureSource ?? basicShapeTextures[0], strokeColor: undefined, strokeWidth: 0 }} size={{ width: 112, height: 112 }} /> : <ProceduralStickerPreview sticker={{ ...value, textureSource: undefined }} size={{ width: 112, height: 112 }} />}</View>
    <ScrollView style={styles.polkaOptions} showsVerticalScrollIndicator={false}>
      <ChoiceRow label="Shape" choices={shapeChoices} selected={value.shape} onSelect={(shape) => set({ shape: shape as BasicShapeCustom['shape'] })} />
      {material ? <TextureRow selected={value.textureSource ?? basicShapeTextures[0]} onSelect={(textureSource) => set({ textureSource })} /> : <ColorPickerRow label="Fill" target="shape.fill" selected={value.fillColor} onSelect={(fillColor) => set({ fillColor })} />}
      {!material && <><StrokeRow selected={value.strokeColor ?? ''} onSelect={(strokeColor) => set({ strokeColor, strokeWidth: strokeColor && !value.strokeWidth ? 3 : strokeColor ? value.strokeWidth : 0 })} /><ChoiceRow label="Width" choices={[{ value: '0', label: 'None' }, { value: '3', label: 'Thin' }, { value: '6', label: 'Medium' }, { value: '10', label: 'Bold' }]} selected={String(value.strokeWidth ?? 0)} onSelect={(strokeWidth) => set({ strokeWidth: Number(strokeWidth) })} /></>}
      <ChoiceRow label="Opacity" choices={[{ value: '0.38', label: 'Light' }, { value: '0.64', label: 'Medium' }, { value: '0.82', label: 'Soft' }, { value: '1', label: 'Full' }]} selected={String(value.opacity)} onSelect={(opacity) => set({ opacity: Number(opacity) })} />
      <ChoiceRow label="Count" choices={['1', '3', '6', '9'].map((count) => ({ value: count, label: count }))} selected={String(value.count)} onSelect={(count) => set({ count: Number(count) as BasicShapeCustom['count'] })} />
      <ChoiceRow label="Arrange" choices={[{ value: 'single', label: 'Single' }, { value: 'row', label: 'Row' }, { value: 'grid', label: 'Grid' }, { value: 'scatter', label: 'Scatter' }]} selected={value.layout} onSelect={(layout) => set({ layout: layout as BasicShapeCustom['layout'] })} />
    </ScrollView>
    <Pressable accessibilityLabel="Add custom shape" onPress={onAdd} style={styles.addCustomButton}><Text style={styles.addCustomButtonText}>Add shape</Text></Pressable>
  </View>;
};

const styles = StyleSheet.create({
  sheet: { backgroundColor: productColor.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, bottom: 0, height: 520, left: 0, overflow: 'hidden', position: 'absolute', right: 0, shadowColor: productColor.ink, shadowOffset: { height: -8, width: 0 }, shadowOpacity: 0.06, shadowRadius: 22, zIndex: 10 },
  handle: { alignSelf: 'center', backgroundColor: '#D9D7D1', borderRadius: 3, height: 5, marginTop: 12, width: 48 },
  header: { alignItems: 'center', flexDirection: 'row', height: 66, justifyContent: 'space-between', paddingHorizontal: 20 },
  title: { color: productColor.ink, flex: 1, fontSize: 20, fontWeight: '700', lineHeight: 28 },
  viewAll: { color: productColor.ink, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  back: { height: 32, justifyContent: 'center', marginRight: 6, width: 20 },
  backGlyph: { color: productColor.ink, fontSize: 34, fontWeight: '300', lineHeight: 32 },
  categories: { gap: 8, paddingBottom: 0, paddingHorizontal: 20 },
  // ScrollView defaults to participating in the parent's flex sizing.  The
  // category rail must be exactly one chip tall or it pushes the pack list down.
  categoriesScroll: { flexGrow: 0, flexShrink: 0, height: 36 },
  materialsScroll: { flex: 1 },
  materialsContent: { paddingBottom: 28 },
  chip: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderRadius: 999, height: 36, justifyContent: 'center', paddingHorizontal: 16 },
  chipActive: { backgroundColor: productColor.ink },
  chipLabel: { color: productColor.secondaryText, fontSize: 14, fontWeight: '500' },
  chipLabelActive: { color: productColor.surface, fontWeight: '600' },
  packGrid: { gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  packRow: { flexDirection: 'row', gap: 12 },
  packTile: { alignItems: 'center', aspectRatio: 1, backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', overflow: 'hidden', width: '30.4%' },
  packCover: { height: '100%', resizeMode: 'contain', width: '100%' },
  itemGrid: { alignContent: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 12 },
  itemTile: { alignItems: 'center', aspectRatio: 1, backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, elevation: 2, justifyContent: 'center', overflow: 'visible', shadowColor: productColor.ink, shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.07, shadowRadius: 5, width: '30.4%' },
  itemImage: { height: '82%', resizeMode: 'contain', width: '82%' },
  customEntry: { alignItems: 'center', justifyContent: 'center' },
  customEntryPlus: { color: productColor.ink, fontSize: 34, fontWeight: '300', lineHeight: 36 },
  customEntryLabel: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600', marginTop: 3 },
  customPaperPanel: { alignItems: 'center', flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  customPaperPreview: { borderColor: productColor.border, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, height: 92, shadowColor: '#665F56', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.12, shadowRadius: 4, width: 70 },
  customTitle: { alignSelf: 'flex-start', color: productColor.ink, fontSize: 15, fontWeight: '600', marginBottom: 12, marginTop: 18 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  colorSwatch: { borderColor: 'transparent', borderRadius: 999, borderWidth: 2, height: 32, width: 32 },
  whiteSwatch: { borderColor: '#D8D4CD' },
  transparentSwatch: { alignItems: 'center', backgroundColor: '#F1EFEB', borderColor: '#D8D4CD', justifyContent: 'center' },
  transparentMark: { color: productColor.secondaryText, fontSize: 21, fontWeight: '400', lineHeight: 25 },
  colorSwatchSelected: { borderColor: productColor.ink },
  strokeSwatch: { alignItems: 'center', backgroundColor: productColor.weakSurface, borderColor: 'transparent', borderRadius: 999, borderWidth: 2, height: 32, justifyContent: 'center', width: 32 },
  strokeSwatchSelected: { borderColor: productColor.ink },
  strokeDot: { borderRadius: 99, height: 18, width: 18 },
  whiteStrokeDot: { borderColor: '#D8D4CD', borderWidth: StyleSheet.hairlineWidth },
  strokeNone: { color: productColor.secondaryText, fontSize: 22, fontWeight: '400', lineHeight: 24 },
  textureSwatch: { borderColor: 'transparent', borderRadius: 7, borderWidth: 2, height: 36, overflow: 'hidden', width: 46 },
  textureSwatchSelected: { borderColor: productColor.ink },
  textureImage: { height: '100%', width: '100%' },
  addCustomButton: { alignItems: 'center', backgroundColor: productColor.ink, borderRadius: 999, height: 44, justifyContent: 'center', marginTop: 'auto', marginBottom: 22, width: '100%' },
  addCustomButtonText: { color: productColor.surface, fontSize: 15, fontWeight: '700' },
  polkaPanel: { alignItems: 'center', flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  basicShapePreview: { alignItems: 'center', borderColor: productColor.border, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, height: 112, justifyContent: 'center', overflow: 'hidden', width: 160 },
  polkaPreview: { aspectRatio: 16 / 9, borderColor: productColor.border, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, height: 90, overflow: 'hidden', position: 'relative', width: 160 },
  polkaPreviewMark: { position: 'absolute', textAlign: 'center' },
  polkaOptions: { alignSelf: 'stretch', flex: 1, marginTop: 12 },
  optionGroup: { alignItems: 'center', flexDirection: 'row', height: 48 },
  optionLabel: { color: productColor.ink, fontSize: 13, fontWeight: '600', width: 88 },
  optionRow: { alignItems: 'center', gap: 8, paddingRight: 20 },
  optionChip: { backgroundColor: productColor.weakSurface, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  optionChipActive: { backgroundColor: productColor.ink },
  optionText: { color: productColor.secondaryText, fontSize: 12, fontWeight: '600' },
  optionTextActive: { color: productColor.surface },
});
