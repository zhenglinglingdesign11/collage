import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type KeyboardEvent, type LayoutChangeEvent } from 'react-native';
import { Canvas, useCanvasRef, type Transforms3d } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { assetUriMap, createCustomBasicShape, createCustomPolkaPaper, createCustomSolidPaper, emptyAssetCatalog, getTextFont, proceduralPaperForReferenceId, proceduralStickerForReferenceId, remoteAssetUriMap, upsertAsset, type AssetCatalog, type ProceduralSticker, type RemotePackItem } from '@journalcollage/asset-system';
import { applyCommand, createDraft, hitTest, identityTransform, migrateDraft, pointInLayerSpace, type BrushCutStroke, type Draft, type EditorCommand, type Effect, type ImageLayer, type Point, type Transform } from '@journalcollage/editor-core';
import { SkiaEditorScene, type BrushCutPreview, type CanvasViewport, type StraightCutPreview } from '@journalcollage/editor-renderer';
import { cacheRemotePackItem, importLocalImage, loadSavedDraft, loadWorkspace, saveExportPng, saveWorkspace, wouldPruneOldestSavedDraft } from './src/localWorkspace';
import { ProductAppShell } from './src/product-ui/ProductAppShell';
import { CreateHome, type CreateEntry } from './src/product-ui/CreateHome';
import { EditorHeader as ProductEditorHeader, EditorPrimaryToolbar, ImageLayerToolbar, ImageSelectionControls, TextLayerToolbar } from './src/product-ui/EditorChrome';
import { AssetDrawer } from './src/product-ui/AssetDrawer';
import { BackgroundDrawer } from './src/product-ui/BackgroundDrawer';
import { TEXT_EDITOR_PANEL_HEIGHT, TextEditorPanel } from './src/product-ui/TextEditorPanel';
import { ensureTextFont, resolvedTextFontUri } from './src/product-ui/fonts';
import { AssetsLibrary } from './src/product-ui/AssetsLibrary';
import { resolveProductLocale, t } from './src/product-ui/localization';
import { productColor } from './src/product-ui/tokens';
import type { ProductTab } from './src/product-ui/ProductTabBar';

const CANVAS_SIZE = { width: 1800, height: 2400 };
const localPolkaPatternUris: Readonly<Record<string, string>> = {
  'asset://pack/polka-paper-materials/pattern-local-24': Image.resolveAssetSource(require('../../miniprogram-spike/miniprogram/assets/packs/24.png')).uri,
  'asset://pack/polka-paper-materials/pattern-local-7': Image.resolveAssetSource(require('../../miniprogram-spike/miniprogram/assets/packs/7.png')).uri,
  'asset://pack/polka-paper-materials/pattern-local-1': Image.resolveAssetSource(require('../../miniprogram-spike/miniprogram/assets/packs/1.png')).uri,
};
type EditorState = Readonly<{ past: readonly Draft[]; present: Draft; future: readonly Draft[] }>;
type EditorAction = Readonly<{ type: 'command'; command: EditorCommand }> | Readonly<{ type: 'undo' }> | Readonly<{ type: 'redo' }> | Readonly<{ type: 'hydrate'; draft: Draft }>;
type MediaLibraryModule = typeof import('expo-media-library/legacy');
type StraightCutSession = Readonly<{ layerId: string; start: Point; end: Point; style: 'straight' | 'wave' }>;
/**
 * The freehand editor must never resolve its input by asset or cut lineage:
 * one image can have several independently cut siblings which share both.
 * Keep the exact layer selected at entry as the immutable editing source.
 */
type BrushCutSession = Readonly<{ layer: ImageLayer; strokes: readonly BrushCutStroke[]; hollowOriginal: boolean }>;
type CutStyle = 'straight' | 'wave' | 'free' | 'subject';

/** Avoid a startup crash in Expo Go or a development build made before this native module was installed. */
const loadMediaLibrary = (): MediaLibraryModule | null => {
  try {
    return require('expo-media-library/legacy') as MediaLibraryModule;
  } catch {
    return null;
  }
};

const createFixtureDraft = (): Draft => {
  const draft = createDraft({ id: 'a1-canvas-fixture', size: CANVAS_SIZE, now: '2026-09-10T00:00:00.000Z' });
  return {
    ...draft,
    layers: [
      { id: 'fixture-photo', name: 'Torn photo', type: 'image', asset: { id: 'fixture://photo', kind: 'image' }, frame: { width: 900, height: 680 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: { ...identityTransform(), position: { x: 260, y: 340 }, rotation: -0.07 }, opacity: 1, isLocked: false, effects: [{ id: 'shadow', color: '#392F2A', opacity: 0.22, blur: 24, offset: { x: 18, y: 24 } }, { id: 'outline', color: '#FFF8EB', width: 14 }, { id: 'torn-edge', seed: 61, intensity: 28 }] },
      { id: 'fixture-material', name: 'Paper material', type: 'material', asset: { id: 'fixture://paper', kind: 'texture' }, frame: { width: 420, height: 500 }, transform: { ...identityTransform(), position: { x: 1120, y: 760 }, rotation: 0.13 }, opacity: 1, isLocked: false, effects: [{ id: 'shadow', color: '#392F2A', opacity: 0.18, blur: 18, offset: { x: 12, y: 18 } }, { id: 'outline', color: '#FFF8EB', width: 10 }] },
      { id: 'fixture-title', name: 'Text placeholder', type: 'text', text: 'little moments', frame: { width: 1100, height: 180 }, fontId: 'system', fontVariantId: 'system', fontSize: 86, color: '#49372B', textAlign: 'left', backgroundColor: null, transform: { ...identityTransform(), position: { x: 210, y: 1390 }, rotation: -0.025 }, opacity: 1, isLocked: false, effects: [] },
      { id: 'fixture-brush', name: 'Texture brush', type: 'brush', brush: { id: 'fixture://lace-stamp', kind: 'brush' }, frame: { width: 1320, height: 310 }, points: [{ x: 80, y: 130 }, { x: 250, y: 80 }, { x: 460, y: 150 }, { x: 690, y: 95 }, { x: 930, y: 165 }, { x: 1220, y: 100 }], size: 44, spacing: 24, jitter: 28, seed: 32, color: '#BA786D', transform: { ...identityTransform(), position: { x: 200, y: 1720 }, rotation: 0.03 }, opacity: 1, isLocked: false, effects: [] },
    ],
  };
};

const editorReducer = (state: EditorState, action: EditorAction): EditorState => {
  if (action.type === 'hydrate') return { past: [], present: action.draft, future: [] };
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous === undefined ? state : { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next === undefined ? state : { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
  }
  const result = applyCommand(state.present, action.command, new Date().toISOString());
  if (!result.changed) return state;
  if (action.command.type === 'layer.select') return { ...state, present: result.draft };
  return { past: [...state.past, state.present], present: result.draft, future: [] };
};

const EditorWorkspace = (props: { initialEntry: CreateEntry; initialPackItems?: readonly RemotePackItem[]; restoreSavedDraftId?: string | null; onExit: () => void; onInitialPackItemsConsumed?: () => void; onOpenAssets: () => void }) => (
  <SafeAreaProvider>
    <EditorWorkspaceContent {...props} />
  </SafeAreaProvider>
);

const EditorWorkspaceContent = ({ initialEntry, initialPackItems = [], restoreSavedDraftId, onExit, onInitialPackItemsConsumed, onOpenAssets }: { initialEntry: CreateEntry; initialPackItems?: readonly RemotePackItem[]; restoreSavedDraftId?: string | null; onExit: () => void; onInitialPackItemsConsumed?: () => void; onOpenAssets: () => void }) => {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const locale = resolveProductLocale();
  const [state, dispatch] = useReducer(editorReducer, undefined, () => ({
    past: [],
    present: initialEntry === 'restore'
      ? createFixtureDraft()
      : createDraft({ id: `canvas-${Date.now()}`, size: CANVAS_SIZE, now: new Date().toISOString() }),
    future: [],
  }));
  const [catalog, setCatalog] = useState<AssetCatalog>(() => emptyAssetCatalog());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [canvasFrame, setCanvasFrame] = useState({ x: 0, y: 0 });
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
  const [backgroundDrawerOpen, setBackgroundDrawerOpen] = useState(false);
  const [customPolkaBackgroundOpen, setCustomPolkaBackgroundOpen] = useState(false);
  const [assetDrawerHeight, setAssetDrawerHeight] = useState(0);
  const [textEdit, setTextEdit] = useState<Readonly<{ layerId: string; initialText: string; text: string; created: boolean }> | null>(null);
  const [fontRevision, setFontRevision] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [straightCut, setStraightCut] = useState<StraightCutSession | null>(null);
  const [cutPaletteOpen, setCutPaletteOpen] = useState(false);
  const [pendingCutStyle, setPendingCutStyle] = useState<CutStyle | null>(null);
  const [brushCut, setBrushCut] = useState<BrushCutSession | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [cutHint, setCutHint] = useState<string | null>(null);
  const exportCanvasRef = useCanvasRef();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPackItemsAdded = useRef(false);
  const textLayerSequence = useRef(0);
  const cutHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brushCutRef = useRef<BrushCutSession | null>(null);
  const selectedLayer = state.present.layers.find((layer) => layer.id === state.present.selectedLayerId) ?? null;
  brushCutRef.current = brushCut;
  const renderedDraft = useMemo(() => {
    const withTextPreview = textEdit === null ? state.present : {
      ...state.present,
      layers: state.present.layers.map((layer) => layer.id === textEdit.layerId && layer.type === 'text' ? { ...layer, text: textEdit.text } : layer),
    };
    // Straight cut is a focused, ephemeral editing surface. Other layers stay
    // untouched in the document, but must not visually interfere with the
    // selected source while its cut line is positioned.
    if (straightCut !== null) return { ...withTextPreview, layers: withTextPreview.layers.filter((layer) => layer.id === straightCut.layerId) };
    // Freehand cutting is likewise a single-layer editor. Rendering the
    // session snapshot is deliberate: a remainder (c) and its extracted
    // sibling (b) share an asset but are distinct editable layers.
    if (brushCut !== null) return {
      ...withTextPreview,
      canvas: { ...withTextPreview.canvas, background: '#FAFAF8' },
      selectedLayerId: brushCut.layer.id,
      layers: [brushCut.layer],
    };
    return withTextPreview;
  }, [brushCut, state.present, straightCut, textEdit]);
  const viewport = useMemo<CanvasViewport>(() => {
    if (surfaceSize.width === 0 || surfaceSize.height === 0) return { x: 0, y: 0, scale: 1 };
    const scale = Math.min(surfaceSize.width / CANVAS_SIZE.width, surfaceSize.height / CANVAS_SIZE.height);
    return { scale, x: (surfaceSize.width - CANVAS_SIZE.width * scale) / 2, y: (surfaceSize.height - CANVAS_SIZE.height * scale) / 2 };
  }, [surfaceSize]);
  // Local pattern assets intentionally win over the procedural SVG cache: the
  // paper renderer repeats these PNGs instead of falling back to dot marks.
  const assetUris = useMemo(() => ({ ...remoteAssetUriMap(), ...assetUriMap(catalog), ...localPolkaPatternUris }), [catalog]);

  useEffect(() => {
    const updateKeyboard = (event: KeyboardEvent) => setKeyboardHeight(Math.max(0, window.height - event.endCoordinates.screenY));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    const change = Keyboard.addListener('keyboardWillChangeFrame', updateKeyboard);
    // Android emits the Did events; subscribing to both keeps the panel at the
    // same visual anchor on the shared editor surface.
    const show = Keyboard.addListener('keyboardDidShow', updateKeyboard);
    const didHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { hide.remove(); change.remove(); show.remove(); didHide.remove(); };
  }, [window.height]);

  useEffect(() => {
    const workspacePromise = restoreSavedDraftId ? loadSavedDraft(restoreSavedDraftId) : loadWorkspace();
    void workspacePromise.then((workspace) => {
      if (initialEntry === 'restore' && workspace !== null) {
        const migration = migrateDraft(workspace.draft);
        if (migration.ok) {
          dispatch({ type: 'hydrate', draft: migration.draft });
          setCatalog(workspace.catalog);
        }
      }
    }).finally(() => setWorkspaceReady(true));
  }, [initialEntry, restoreSavedDraftId]);
  // Renderer-only values: no Draft or React state update occurs while fingers move.
  const positionX = useSharedValue(0);
  const positionY = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const rotation = useSharedValue(0);
  const gestureScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScaleX = useSharedValue(1);
  const startScaleY = useSharedValue(1);
  const startRotation = useSharedValue(0);
  const straightCutRef = useRef<StraightCutSession | null>(null);
  const straightCutDragRef = useRef<StraightCutSession | null>(null);
  straightCutRef.current = straightCut;

  useEffect(() => {
    const transform = selectedLayer?.transform ?? identityTransform();
    positionX.value = transform.position.x;
    positionY.value = transform.position.y;
    scaleX.value = transform.scale.x;
    scaleY.value = transform.scale.y;
    rotation.value = transform.rotation;
  }, [positionX, positionY, rotation, scaleX, scaleY, selectedLayer]);
  useEffect(() => { gestureScale.value = viewport.scale; }, [gestureScale, viewport.scale]);

  const activeTransform = useDerivedValue<Transforms3d>(() => [
    { translateX: positionX.value }, { translateY: positionY.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }, { rotate: rotation.value },
  ]);
  const selectAt = useCallback((screenX: number, screenY: number) => {
    if (viewport.scale === 0) return;
    const layer = hitTest(state.present, { x: (screenX - viewport.x) / viewport.scale, y: (screenY - viewport.y) / viewport.scale });
    // This assignment must happen in the same turn as selection. Otherwise
    // Skia briefly applies the previously selected layer's shared transform
    // before the effect below synchronizes it.
    const transform = layer?.transform ?? identityTransform();
    positionX.value = transform.position.x;
    positionY.value = transform.position.y;
    scaleX.value = transform.scale.x;
    scaleY.value = transform.scale.y;
    rotation.value = transform.rotation;
    dispatch({ type: 'command', command: { type: 'layer.select', layerId: layer?.id ?? null } });
  }, [positionX, positionY, rotation, scaleX, scaleY, state.present, viewport]);
  const beginTransformGesture = useCallback(() => setIsTransforming(true), []);
  const cancelTransformGesture = useCallback(() => setIsTransforming(false), []);
  const commitActiveTransform = useCallback((layerId: string, x: number, y: number, nextScaleX: number, nextScaleY: number, nextRotation: number) => {
    const transform: Transform = { position: { x, y }, scale: { x: nextScaleX, y: nextScaleY }, rotation: nextRotation };
    dispatch({ type: 'command', command: { type: 'layer.transform', layerId, transform } });
    setIsTransforming(false);
  }, []);

  const selectedLayerId = selectedLayer?.id ?? null;
  const commitOnEnd = () => {
    'worklet';
    if (selectedLayerId !== null) runOnJS(commitActiveTransform)(selectedLayerId, positionX.value, positionY.value, scaleX.value, scaleY.value, rotation.value);
  };
  const tap = Gesture.Tap().onEnd((event, success) => { if (success) runOnJS(selectAt)(event.x, event.y); });
  // `onBegin` fires as soon as a finger touches the canvas, including an
  // ordinary tap. Keep shared transforms dormant until a gesture is actually
  // active so selecting a cut fragment cannot momentarily move its siblings.
  const pan = Gesture.Pan().minDistance(8).enabled(selectedLayerId !== null && straightCut === null && brushCut === null).onStart(() => { runOnJS(beginTransformGesture)(); startX.value = positionX.value; startY.value = positionY.value; }).onUpdate((event) => { positionX.value = startX.value + event.translationX / gestureScale.value; positionY.value = startY.value + event.translationY / gestureScale.value; }).onEnd(commitOnEnd).onFinalize((_event, success) => { if (!success) runOnJS(cancelTransformGesture)(); });
  const pinch = Gesture.Pinch().enabled(selectedLayerId !== null && straightCut === null && brushCut === null).onStart(() => { runOnJS(beginTransformGesture)(); startScaleX.value = scaleX.value; startScaleY.value = scaleY.value; }).onUpdate((event) => { const next = Math.max(0.15, Math.min(event.scale, 5)); scaleX.value = startScaleX.value * next; scaleY.value = startScaleY.value * next; }).onEnd(commitOnEnd).onFinalize((_event, success) => { if (!success) runOnJS(cancelTransformGesture)(); });
  const rotate = Gesture.Rotation().enabled(selectedLayerId !== null && straightCut === null && brushCut === null).onStart(() => { runOnJS(beginTransformGesture)(); startRotation.value = rotation.value; }).onUpdate((event) => { rotation.value = startRotation.value + event.rotation; }).onEnd(commitOnEnd).onFinalize((_event, success) => { if (!success) runOnJS(cancelTransformGesture)(); });
  const ordinaryGesture = Gesture.Simultaneous(tap, pan, pinch, rotate);
  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => setSurfaceSize(event.nativeEvent.layout), []);
  const onCanvasFrameLayout = useCallback((event: LayoutChangeEvent) => setCanvasFrame(event.nativeEvent.layout), []);
  const selectLayer = useCallback((layerId: string) => dispatch({ type: 'command', command: { type: 'layer.select', layerId } }), []);
  const setEffects = useCallback((effects: readonly Effect[]) => {
    if (selectedLayer === null) return;
    dispatch({ type: 'command', command: { type: 'layer.effects.set', layerId: selectedLayer.id, effects } });
  }, [selectedLayer]);
  const toggleEffect = useCallback((effectId: Effect['id']) => {
    if (selectedLayer === null) return;
    const existing = selectedLayer.effects.find((effect) => effect.id === effectId);
    if (existing) return setEffects(selectedLayer.effects.filter((effect) => effect.id !== effectId));
    const defaults: Record<Effect['id'], Effect> = {
      shadow: { id: 'shadow', color: '#392F2A', opacity: 0.22, blur: 22, offset: { x: 16, y: 20 } },
      outline: { id: 'outline', color: '#FFF8EB', width: 12 },
      'torn-edge': { id: 'torn-edge', seed: 41, intensity: 24 },
    };
    setEffects([...selectedLayer.effects, defaults[effectId]]);
  }, [selectedLayer, setEffects]);
  const updateTornEdge = useCallback((change: 'less' | 'more' | 'reroll') => {
    if (selectedLayer === null) return;
    setEffects(selectedLayer.effects.map((effect) => effect.id !== 'torn-edge' ? effect : {
      ...effect,
      intensity: change === 'less' ? Math.max(2, effect.intensity - 4) : change === 'more' ? Math.min(70, effect.intensity + 4) : effect.intensity,
      seed: change === 'reroll' ? effect.seed + 1 : effect.seed,
    }));
  }, [selectedLayer, setEffects]);
  const updateCrop = useCallback((action: 'in' | 'out' | 'left' | 'right' | 'reset') => {
    if (selectedLayer?.type !== 'image') return;
    const crop = selectedLayer.crop;
    if (action === 'reset') {
      dispatch({ type: 'command', command: { type: 'layer.crop.set', layerId: selectedLayer.id, crop: { x: 0, y: 0, width: 1, height: 1 } } });
      return;
    }
    const width = action === 'in' ? Math.max(0.28, crop.width - 0.1) : action === 'out' ? Math.min(1, crop.width + 0.1) : crop.width;
    const height = action === 'in' ? Math.max(0.28, crop.height - 0.1) : action === 'out' ? Math.min(1, crop.height + 0.1) : crop.height;
    const centerX = crop.x + crop.width / 2 + (action === 'left' ? -0.06 : action === 'right' ? 0.06 : 0);
    const centerY = crop.y + crop.height / 2;
    const next = { x: Math.max(0, Math.min(1 - width, centerX - width / 2)), y: Math.max(0, Math.min(1 - height, centerY - height / 2)), width, height };
    dispatch({ type: 'command', command: { type: 'layer.crop.set', layerId: selectedLayer.id, crop: next } });
  }, [selectedLayer]);
  const showCutHint = useCallback((message: string) => {
    if (cutHintTimer.current !== null) clearTimeout(cutHintTimer.current);
    setCutHint(message);
    cutHintTimer.current = setTimeout(() => { setCutHint(null); cutHintTimer.current = null; }, 2200);
  }, []);
  useEffect(() => () => { if (cutHintTimer.current !== null) clearTimeout(cutHintTimer.current); }, []);
  const openCutPalette = useCallback(() => {
    setAssetDrawerOpen(false);
    setBackgroundDrawerOpen(false);
    setCutPaletteOpen((open) => !open);
  }, []);
  const beginStraightCut = useCallback((style: 'straight' | 'wave' = 'straight') => {
    if (selectedLayer?.type !== 'image') {
      Alert.alert(t(locale, 'editor.cut.unavailableTitle'), t(locale, 'editor.cut.unavailableBody'));
      return;
    }
    if (selectedLayer.isLocked) {
      Alert.alert(t(locale, 'editor.cut.lockedTitle'), t(locale, 'editor.cut.lockedBody'));
      return;
    }
    const { width, height } = selectedLayer.frame;
    setAssetDrawerOpen(false);
    setBackgroundDrawerOpen(false);
    setCutPaletteOpen(false);
    setStraightCut({ layerId: selectedLayer.id, style, start: { x: width * 0.12, y: height * 0.5 }, end: { x: width * 0.88, y: height * 0.5 } });
  }, [locale, selectedLayer]);
  const beginBrushCut = useCallback(() => {
    if (selectedLayer?.type !== 'image' || selectedLayer.isLocked) return;
    setCutPaletteOpen(false);
    // Snapshot the actual selected layer. Do not use asset identity or cut
    // lineage here: both are shared by b/c after a prior brush cut.
    setBrushCut({
      // The cut editor is a focused preview, so centre the selected layer
      // without mutating its persisted canvas transform. Local brush points
      // remain identical and are committed back through the stable layer id.
      layer: {
        ...selectedLayer,
        transform: {
          ...selectedLayer.transform,
          position: {
            x: (CANVAS_SIZE.width - selectedLayer.frame.width) / 2,
            y: (CANVAS_SIZE.height - selectedLayer.frame.height) / 2,
          },
        },
      },
      strokes: [],
      hollowOriginal: true,
    });
  }, [selectedLayer]);
  const selectCutStyle = useCallback((style: CutStyle) => {
    if (selectedLayer?.type !== 'image') {
      setPendingCutStyle(style);
      setCutPaletteOpen(false);
      showCutHint(t(locale, 'editor.cut.selectHint'));
      return;
    }
    if (selectedLayer.isLocked) {
      showCutHint(t(locale, 'editor.cut.lockedBody'));
      return;
    }
    if (style === 'straight' || style === 'wave') {
      beginStraightCut(style);
      return;
    }
    if (style === 'free') {
      beginBrushCut();
      return;
    }
    Alert.alert(t(locale, 'editor.cut.comingSoonTitle'), t(locale, 'editor.cut.comingSoonBody'));
  }, [beginBrushCut, beginStraightCut, locale, selectedLayer, showCutHint]);
  useEffect(() => {
    if (pendingCutStyle === null || selectedLayer?.type !== 'image') return;
    if (selectedLayer.isLocked) {
      setPendingCutStyle(null);
      showCutHint(t(locale, 'editor.cut.lockedBody'));
      return;
    }
    const style = pendingCutStyle;
    setPendingCutStyle(null);
    if (style === 'straight' || style === 'wave') beginStraightCut(style);
    else if (style === 'free') beginBrushCut();
    else Alert.alert(t(locale, 'editor.cut.comingSoonTitle'), t(locale, 'editor.cut.comingSoonBody'));
  }, [beginBrushCut, beginStraightCut, locale, pendingCutStyle, selectedLayer, showCutHint]);
  const beginStraightCutDrag = useCallback(() => { straightCutDragRef.current = straightCutRef.current; }, []);
  const moveStraightCut = useCallback((canvasDx: number, canvasDy: number) => {
    const session = straightCutDragRef.current;
    const layer = session && state.present.layers.find((candidate) => candidate.id === session.layerId);
    if (!session || layer?.type !== 'image') return;
    const rotation = layer.transform.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const dx = (canvasDx * cos + canvasDy * sin) / Math.max(0.01, layer.transform.scale.x);
    const dy = (-canvasDx * sin + canvasDy * cos) / Math.max(0.01, layer.transform.scale.y);
    const minX = Math.min(session.start.x, session.end.x);
    const maxX = Math.max(session.start.x, session.end.x);
    const minY = Math.min(session.start.y, session.end.y);
    const maxY = Math.max(session.start.y, session.end.y);
    const boundedDx = Math.max(-minX, Math.min(layer.frame.width - maxX, dx));
    const boundedDy = Math.max(-minY, Math.min(layer.frame.height - maxY, dy));
    setStraightCut({ ...session, start: { x: session.start.x + boundedDx, y: session.start.y + boundedDy }, end: { x: session.end.x + boundedDx, y: session.end.y + boundedDy } });
  }, [state.present.layers]);
  const cutPan = Gesture.Pan().enabled(straightCut !== null).onBegin(() => { runOnJS(beginStraightCutDrag)(); }).onUpdate((event) => { runOnJS(moveStraightCut)(event.translationX / gestureScale.value, event.translationY / gestureScale.value); });
  const cancelStraightCut = useCallback(() => { setStraightCut(null); }, []);
  const rotateStraightCutBy = useCallback((angle: number) => {
    const session = straightCutDragRef.current;
    const layer = session && state.present.layers.find((candidate) => candidate.id === session.layerId);
    if (!session || layer?.type !== 'image') return;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const center = { x: (session.start.x + session.end.x) / 2, y: (session.start.y + session.end.y) / 2 };
    const rotatePoint = (point: Point): Point => {
      const x = point.x - center.x;
      const y = point.y - center.y;
      return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
    };
    const clamp = (point: Point): Point => ({ x: Math.max(0, Math.min(layer.frame.width, point.x)), y: Math.max(0, Math.min(layer.frame.height, point.y)) });
    setStraightCut({ ...session, start: clamp(rotatePoint(session.start)), end: clamp(rotatePoint(session.end)) });
  }, [state.present.layers]);
  const beginStraightCutRotate = useCallback(() => { straightCutDragRef.current = straightCutRef.current; }, []);
  const cutRotate = Gesture.Rotation().enabled(straightCut !== null).onBegin(() => { runOnJS(beginStraightCutRotate)(); }).onUpdate((event) => { runOnJS(rotateStraightCutBy)(event.rotation); });
  const appendBrushPoint = useCallback((screenX: number, screenY: number, begin: boolean) => {
    const session = brushCutRef.current;
    const layer = session?.layer;
    if (!layer || viewport.scale === 0) return;
    const point = pointInLayerSpace({ x: (screenX - viewport.x) / viewport.scale, y: (screenY - viewport.y) / viewport.scale }, layer);
    const bounded = { x: Math.max(0, Math.min(layer.frame.width, point.x)), y: Math.max(0, Math.min(layer.frame.height, point.y)) };
    const contentFrame = layer.contentFrame ?? { x: 0, y: 0 };
    const contentPoint = { x: bounded.x - contentFrame.x, y: bounded.y - contentFrame.y };
    setBrushCut((current) => {
      if (current === null) return null;
      if (begin) return { ...current, strokes: [...current.strokes, { size: 112, points: [contentPoint] }] };
      const previous = current.strokes.at(-1);
      if (!previous) return current;
      const last = previous.points.at(-1);
      if (last && Math.hypot(last.x - contentPoint.x, last.y - contentPoint.y) < 3) return current;
      return { ...current, strokes: [...current.strokes.slice(0, -1), { ...previous, points: [...previous.points, contentPoint] }] };
    });
  }, [viewport]);
  const brushPan = Gesture.Pan().enabled(brushCut !== null).onBegin((event) => { runOnJS(appendBrushPoint)(event.x, event.y, true); }).onUpdate((event) => { runOnJS(appendBrushPoint)(event.x, event.y, false); });
  const gesture = straightCut !== null ? Gesture.Simultaneous(cutPan, cutRotate) : brushCut !== null ? brushPan : ordinaryGesture;
  const confirmStraightCut = useCallback(() => {
    const session = straightCut;
    if (session === null) return;
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    dispatch({ type: 'command', command: { type: 'image.cut.straight', layerId: session.layerId, start: session.start, end: session.end, firstLayerId: `image-cut-${id}-a`, secondLayerId: `image-cut-${id}-b`, operationId: `${session.style}-cut-${id}`, gap: 18, style: session.style } });
    setStraightCut(null);
  }, [straightCut]);
  const cancelBrushCut = useCallback(() => setBrushCut(null), []);
  const clearBrushCut = useCallback(() => setBrushCut((current) => current ? { ...current, strokes: [] } : null), []);
  const toggleBrushHollow = useCallback(() => setBrushCut((current) => current ? { ...current, hollowOriginal: !current.hollowOriginal } : null), []);
  const confirmBrushCut = useCallback(() => {
    if (brushCut === null || brushCut.strokes.length === 0) return;
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    dispatch({ type: 'command', command: { type: 'image.cut.brush', layerId: brushCut.layer.id, cutLayerId: `image-brush-cut-${id}`, operationId: `brush-cut-${id}`, strokes: brushCut.strokes, hollowOriginal: brushCut.hollowOriginal } });
    setBrushCut(null);
  }, [brushCut]);
  const addRemotePackItem = useCallback(async (item: RemotePackItem) => {
    try {
      const record = await cacheRemotePackItem(item, catalog);
      setCatalog((current) => upsertAsset(current, record));
      const scale = Math.min(760 / item.width, 760 / item.height, 1.8);
      const frame = { width: Math.round(item.width * scale), height: Math.round(item.height * scale) };
      dispatch({ type: 'command', command: {
        type: 'layer.add',
        layer: {
          // A detail-pack multi-add can resolve several cached assets in the
          // same millisecond; item identity keeps every resulting layer unique.
          id: `pack-layer-${Date.now()}-${item.id}`,
          name: item.id,
          type: 'image',
          asset: item.reference,
          frame,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          transform: { ...identityTransform(), position: { x: (CANVAS_SIZE.width - frame.width) / 2, y: (CANVAS_SIZE.height - frame.height) / 2 } },
          opacity: 1,
          isLocked: false,
          effects: [],
        },
      } });
    } catch {
      Alert.alert('Material unavailable', 'This material could not be downloaded. Please try again.');
    }
  }, [catalog]);
  useEffect(() => {
    if (!workspaceReady || initialPackItems.length === 0 || initialPackItemsAdded.current) return;
    initialPackItemsAdded.current = true;
    initialPackItems.forEach((item) => { void addRemotePackItem(item); });
    onInitialPackItemsConsumed?.();
  }, [addRemotePackItem, initialPackItems, onInitialPackItemsConsumed, workspaceReady]);
  const applyBackgroundItem = useCallback(async (item: RemotePackItem) => {
    try {
      // Resolve through the same R2 cache used by material previews and layers
      // before committing the reference. A Draft still contains no URL/path.
      const record = await cacheRemotePackItem(item, catalog);
      setCatalog((current) => upsertAsset(current, record));
      const paper = proceduralPaperForReferenceId(item.reference.id);
      dispatch({ type: 'command', command: {
        type: 'canvas.background.set',
        background: paper?.background ?? '#FDFDFB',
        asset: item.reference,
      } });
    } catch {
      Alert.alert('Background unavailable', 'This paper could not be downloaded. Please try again.');
    }
  }, [catalog]);
  const openAssetsFromEditor = useCallback(async () => {
    // The Assets tab is a separate product surface. Persist first so returning
    // through the pending transfer route restores this exact canvas.
    await saveWorkspace({ draft: state.present, catalog });
    onOpenAssets();
  }, [catalog, onOpenAssets, state.present]);
  const commitImportedPhotos = useCallback(async (assets: readonly ImagePicker.ImagePickerAsset[], replaceLayerId: string | null = null) => {
    try {
      const records = await Promise.all(assets.map((source) => importLocalImage({ uri: source.uri, width: source.width, height: source.height, mimeType: source.mimeType ?? null })));
      records.forEach((record) => setCatalog((current) => upsertAsset(current, record)));
      if (replaceLayerId !== null) {
        dispatch({ type: 'command', command: { type: 'image.asset.replace', layerId: replaceLayerId, asset: records[0].reference } });
        return;
      }
      records.forEach((record, index) => {
        const source = assets[index];
        const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : 1;
        const frame = aspect >= 1 ? { width: 1080, height: 1080 / aspect } : { width: 760 * aspect, height: 760 };
        dispatch({ type: 'command', command: { type: 'layer.add', layer: { id: `layer-${Date.now()}-${index}`, name: source.fileName ?? 'My photo', type: 'image', asset: record.reference, frame, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: { ...identityTransform(), position: { x: (CANVAS_SIZE.width - frame.width) / 2, y: (CANVAS_SIZE.height - frame.height) / 2 } }, opacity: 1, isLocked: false, effects: [] } } });
      });
      // The mini-program returns to the neutral editing state after a standard import.
      dispatch({ type: 'command', command: { type: 'layer.select', layerId: null } });
    } catch {
      Alert.alert('Could not add photo', 'The selected photo could not be stored. Please try again.');
    }
  }, []);
  const pickPhoto = useCallback(async (source: 'camera' | 'library', replaceLayerId: string | null = null) => {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to take a photo for your collage.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
        if (!result.canceled) await commitImportedPhotos(result.assets, replaceLayerId);
        return;
      }

      // iOS presents its own limited-library access flow. Asking for broad
      // library permission before opening it can leave the simulator's picker
      // behind a permission sheet, while the picker itself needs no preflight.
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: replaceLayerId === null,
        mediaTypes: ['images'],
        orderedSelection: replaceLayerId === null,
        quality: 1,
        selectionLimit: 9,
      });
      if (!result.canceled) await commitImportedPhotos(result.assets, replaceLayerId);
    } catch {
      Alert.alert('Could not open photo library', 'Please close the picker and try again. If this continues, reinstall the development build.');
    }
  }, [commitImportedPhotos]);
  const openPhotoSource = useCallback(() => {
    const choose = (source: 'camera' | 'library' | 'collage') => {
      if (source === 'collage') {
        Alert.alert('Collage layout', 'Collage layouts are the next image workflow to be connected.');
        return;
      }
      void pickPhoto(source);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ cancelButtonIndex: 3, options: [t(locale, 'editor.source.library'), t(locale, 'editor.source.camera'), t(locale, 'editor.source.collage'), t(locale, 'editor.source.cancel')] }, (index) => {
        if (index === 0) choose('library');
        if (index === 1) choose('camera');
        if (index === 2) choose('collage');
      });
      return;
    }
    Alert.alert(t(locale, 'editor.tool.image'), undefined, [
      { text: t(locale, 'editor.source.library'), onPress: () => choose('library') },
      { text: t(locale, 'editor.source.camera'), onPress: () => choose('camera') },
      { text: t(locale, 'editor.source.cancel'), style: 'cancel' },
    ]);
  }, [locale, pickPhoto]);
  const addText = useCallback(() => {
    // Do not reuse an editor session or a native TextInput instance when a
    // second text layer is created quickly after the first one.
    textLayerSequence.current += 1;
    const id = `text-${Date.now()}-${textLayerSequence.current}`;
    setTextEdit(null);
    const layer = {
      id, name: 'Text', type: 'text' as const, text: '', frame: { width: 1240, height: 220 },
      fontId: 'system', fontVariantId: 'system', fontSize: 92, color: '#111111', textAlign: 'center' as const, backgroundColor: null,
      transform: { ...identityTransform(), position: { x: 280, y: 1090 } }, opacity: 1, isLocked: false, effects: [],
    };
    dispatch({ type: 'command', command: { type: 'layer.add', layer } });
    setTextEdit({ layerId: id, initialText: '', text: '', created: true });
  }, []);
  const finishTextEditing = useCallback(() => {
    if (textEdit === null) return;
    const text = textEdit.text.trim();
    if (text.length === 0 && textEdit.created) {
      dispatch({ type: 'command', command: { type: 'layer.delete', layerId: textEdit.layerId } });
    } else if (text !== textEdit.initialText) {
      dispatch({ type: 'command', command: { type: 'text.content.set', layerId: textEdit.layerId, text } });
    }
    // Completing text input returns to neutral editing, matching the primary
    // toolbar state. A later canvas tap deliberately reselects this layer.
    dispatch({ type: 'command', command: { type: 'layer.select', layerId: null } });
    setTextEdit(null);
  }, [textEdit]);
  const cancelTextEditing = useCallback(() => {
    if (textEdit?.created) dispatch({ type: 'command', command: { type: 'layer.delete', layerId: textEdit.layerId } });
    setTextEdit(null);
  }, [textEdit]);
  const beginTextEditing = useCallback((layer: Extract<Draft['layers'][number], { type: 'text' }>) => {
    setTextEdit({ layerId: layer.id, initialText: layer.text, text: layer.text, created: false });
    void ensureTextFont(layer.fontVariantId).then(() => setFontRevision((value) => value + 1));
  }, []);
  const updateTextStyle = useCallback((layerId: string, change: { fontId?: string; fontVariantId?: string; fontSize?: number; color?: string; textAlign?: 'left' | 'center' | 'right'; backgroundColor?: string | null; opacity?: number }) => {
    const { opacity, ...style } = change;
    if (Object.keys(style).length > 0) dispatch({ type: 'command', command: { type: 'text.style.set', layerId, ...style } });
    if (opacity !== undefined) dispatch({ type: 'command', command: { type: 'layer.opacity.set', layerId, opacity } });
    if (change.fontVariantId !== undefined) void ensureTextFont(change.fontVariantId).then(() => setFontRevision((value) => value + 1));
  }, []);
  const initialPhotoRequested = useRef(false);
  useEffect(() => {
    if (initialEntry !== 'photo' || !workspaceReady || initialPhotoRequested.current) return;
    initialPhotoRequested.current = true;
    void pickPhoto('library');
  }, [initialEntry, pickPhoto, workspaceReady]);
  const exportPng = useCallback(async () => {
    const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();
    if (!snapshot) {
      Alert.alert('Export unavailable', 'The collage could not be rendered. Please try again.');
      return;
    }
    const uri = await saveExportPng(snapshot.encodeToBase64());
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share collage' });
    } else {
      Alert.alert('Export ready', 'Your PNG is ready to save or share from this device.');
    }
  }, [exportCanvasRef]);
  const requestExit = useCallback(() => {
    const hasCreativeContent = state.present.layers.length > 0
      || state.present.canvas.backgroundAsset !== undefined
      || state.present.canvas.background !== '#F7F3ED';
    const leave = () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      onExit();
    };
    if (!hasCreativeContent) {
      leave();
      return;
    }
    const saveAndLeave = () => {
        if (saveTimer.current !== null) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        void saveWorkspace({ draft: state.present, catalog }, { markAsSaved: true }).then(() => {
          onExit();
        }).catch(() => {
          Alert.alert('Could not save draft', 'Please check available storage and try again.');
        });
    };
    const showSavePrompt = (willPrune: boolean) => Alert.alert(
      willPrune ? 'Save draft and remove oldest?' : 'Save draft?',
      willPrune
        ? 'You have reached the 20-draft limit. Saving this new draft will remove your oldest saved draft.'
        : 'Save this collage so you can continue editing it later.',
      [
        { text: 'Save draft', onPress: saveAndLeave },
        { text: 'Keep editing', style: 'cancel' },
        // Keep the destructive escape hatch at the visual bottom of the iOS alert.
        { text: 'Don’t save', style: 'destructive', onPress: leave },
      ],
    );
    void wouldPruneOldestSavedDraft(state.present.id).then(showSavePrompt).catch(() => showSavePrompt(false));
  }, [catalog, onExit, state.present]);
  const savePngToPhotoLibrary = useCallback(async () => {
    const mediaLibrary = loadMediaLibrary();
    if (mediaLibrary === null) {
      Alert.alert('Save to Photos needs a new build', 'This app client was built before photo-library support was added. Use Share for now, or rebuild and reinstall the development build.');
      return;
    }
    try {
      const permission = await mediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access in Settings to save your finished collage.');
        return;
      }
      const snapshot = await exportCanvasRef.current?.makeImageSnapshotAsync();
      if (!snapshot) {
        Alert.alert('Save unavailable', 'The collage could not be rendered. Please try again.');
        return;
      }
      const uri = await saveExportPng(snapshot.encodeToBase64());
      await mediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Your collage has been saved to the photo library.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Could not save', `Please check photo permission and available storage.\n${message}`);
    }
  }, [exportCanvasRef]);
  const isTablet = window.width >= 768;
  const drawerOpen = assetDrawerOpen || backgroundDrawerOpen;
  // Keep the paper at its normal editing scale while the keyboard is up. The
  // mini-program only lifts the canvas enough to retain the text selection,
  // rather than shrinking it into the remaining keyboard-free rectangle.
  const canvasBottomOverlay = brushCut !== null ? 112 : textEdit !== null ? TEXT_EDITOR_PANEL_HEIGHT : drawerOpen ? Math.max(assetDrawerHeight, 520) : 0;
  const textCanvasOffset = textEdit !== null && keyboardHeight > 0 ? Math.min(120, Math.round(keyboardHeight * 0.35)) : 0;
  const previewSize = useMemo(() => {
    const maxWidth = Math.max(1, window.width - 56);
    const editorHeight = Math.max(1, window.height - insets.top - 56);
    const normalMaxHeight = window.width > 380 ? 520 : 460;
    const maxHeight = canvasBottomOverlay > 0
      // Keep the logical canvas centre visible above the sheet while allowing
      // the lower paper area to continue beneath it. This preserves a useful
      // editing scale instead of shrinking the whole canvas to sheet-free space.
      ? Math.min(normalMaxHeight, Math.max(240, (editorHeight - canvasBottomOverlay - 50) * 2))
      : normalMaxHeight;
    const scale = Math.min(maxWidth / CANVAS_SIZE.width, maxHeight / CANVAS_SIZE.height);
    return { width: Math.round(CANVAS_SIZE.width * scale), height: Math.round(CANVAS_SIZE.height * scale) };
  }, [canvasBottomOverlay, insets.top, window.height, window.width]);
  const proceduralPapers = useMemo(() => Object.fromEntries(state.present.layers.flatMap((layer) => {
    if (layer.type !== 'image') return [];
    const paper = proceduralPaperForReferenceId(layer.asset.id);
    return paper ? [[layer.asset.id, paper] as const] : [];
  })), [state.present.layers]);
  const proceduralStickers = useMemo(() => Object.fromEntries(state.present.layers.flatMap((layer) => {
    if (layer.type !== 'image') return [];
    const sticker = proceduralStickerForReferenceId(layer.asset.id);
    return sticker ? [[layer.asset.id, sticker] as const] : [];
  })), [state.present.layers]);
  const canvasBackgroundAsset = state.present.canvas.backgroundAsset;
  const canvasBackgroundPaper = canvasBackgroundAsset ? proceduralPaperForReferenceId(canvasBackgroundAsset.id) : undefined;
  const canvasBackgroundUri = canvasBackgroundAsset ? assetUris[canvasBackgroundAsset.id] : undefined;
  // Skia receives cached font files directly as Typeface sources. The Draft
  // remains limited to stable font IDs and never observes these local URIs.
  const fontUris = useMemo(() => Object.fromEntries(renderedDraft.layers.filter((layer) => layer.type === 'text').flatMap((layer) => { const uri = resolvedTextFontUri(layer.fontVariantId); return uri ? [[layer.fontVariantId, uri] as const] : []; })), [fontRevision, renderedDraft.layers]);
  const fontSupportsCjk = useMemo(() => Object.fromEntries(renderedDraft.layers.filter((layer) => layer.type === 'text').map((layer) => [layer.fontVariantId, getTextFont(layer.fontVariantId).supportsCjk])), [renderedDraft.layers]);
  const brushCutPreview = brushCut === null ? null : (() => {
    const contentFrame = brushCut.layer.contentFrame ?? { x: 0, y: 0 };
    return { layerId: brushCut.layer.id, strokes: brushCut.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: point.x + contentFrame.x, y: point.y + contentFrame.y })) })) } as BrushCutPreview;
  })();
  const scene = <SkiaEditorScene draft={renderedDraft} viewport={viewport} activeLayer={{ layerId: selectedLayerId, transform: activeTransform, isInteracting: isTransforming }} assetUris={assetUris} proceduralPapers={proceduralPapers} proceduralStickers={proceduralStickers} fontUris={fontUris} fontSupportsCjk={fontSupportsCjk} canvasBackgroundPaper={brushCut === null ? canvasBackgroundPaper : undefined} canvasBackgroundUri={brushCut === null ? canvasBackgroundUri : undefined} surfaceColor="#FAFAF8" straightCutPreview={straightCut as StraightCutPreview | null} brushCutPreview={brushCutPreview} />;
  const canvas = <EditorCanvas bottomOverlay={canvasBottomOverlay} frame={previewSize} gesture={gesture} immersive={brushCut !== null} keyboardOffset={textCanvasOffset} onFrameLayout={onCanvasFrameLayout} onLayout={onCanvasLayout}>{scene}</EditorCanvas>;
  const inspector = <Inspector layer={selectedLayer} onToggleEffect={toggleEffect} onTornEdgeChange={updateTornEdge} onCropChange={updateCrop} />;
  const imageLayerToolbar = selectedLayer?.type === 'image' && straightCut === null ? <ImageLayerToolbar bottomInset={insets.bottom} locale={locale}
    onUp={() => dispatch({ type: 'command', command: { type: 'layer.reorder', layerId: selectedLayer.id, toIndex: Math.min(state.present.layers.length - 1, state.present.layers.findIndex((layer) => layer.id === selectedLayer.id) + 1) } })}
    onDown={() => dispatch({ type: 'command', command: { type: 'layer.reorder', layerId: selectedLayer.id, toIndex: Math.max(0, state.present.layers.findIndex((layer) => layer.id === selectedLayer.id) - 1) } })}
    onCopy={() => dispatch({ type: 'command', command: { type: 'layer.duplicate', layerId: selectedLayer.id, duplicate: { ...selectedLayer, id: `layer-${Date.now()}`, transform: { ...selectedLayer.transform, position: { x: selectedLayer.transform.position.x + 44, y: selectedLayer.transform.position.y + 44 } } } } })}
    onDelete={() => dispatch({ type: 'command', command: { type: 'layer.delete', layerId: selectedLayer.id } })}
    onCrop={() => updateCrop('in')}
    onShadow={() => toggleEffect('shadow')}
    onOpacity={() => dispatch({ type: 'command', command: { type: 'layer.opacity.set', layerId: selectedLayer.id, opacity: selectedLayer.opacity === 1 ? 0.58 : 1 } })}
    onOutline={() => toggleEffect('outline')}
    onEffects={() => toggleEffect('torn-edge')}
    onScissors={openCutPalette}
    onEmboss={() => {}}
  /> : null;
  const textLayerToolbar = selectedLayer?.type === 'text' && textEdit === null ? <TextLayerToolbar bottomInset={insets.bottom} locale={locale}
    onUp={() => dispatch({ type: 'command', command: { type: 'layer.reorder', layerId: selectedLayer.id, toIndex: Math.min(state.present.layers.length - 1, state.present.layers.findIndex((layer) => layer.id === selectedLayer.id) + 1) } })}
    onDown={() => dispatch({ type: 'command', command: { type: 'layer.reorder', layerId: selectedLayer.id, toIndex: Math.max(0, state.present.layers.findIndex((layer) => layer.id === selectedLayer.id) - 1) } })}
    onCopy={() => dispatch({ type: 'command', command: { type: 'layer.duplicate', layerId: selectedLayer.id, duplicate: { ...selectedLayer, id: `layer-${Date.now()}`, transform: { ...selectedLayer.transform, position: { x: selectedLayer.transform.position.x + 44, y: selectedLayer.transform.position.y + 44 } } } }})}
    onDelete={() => dispatch({ type: 'command', command: { type: 'layer.delete', layerId: selectedLayer.id } })}
    onEditText={() => beginTextEditing(selectedLayer)}
    onShadow={() => toggleEffect('shadow')}
    onOpacity={() => dispatch({ type: 'command', command: { type: 'layer.opacity.set', layerId: selectedLayer.id, opacity: selectedLayer.opacity === 1 ? 0.58 : 1 } })}
    onOutline={() => toggleEffect('outline')}
  /> : null;
  const imageSelectionControls = selectedLayer?.type === 'image' ? <ImageSelectionControls
    isLocked={selectedLayer.isLocked}
    lockStyle={{ left: canvasFrame.x + viewport.x + selectedLayer.transform.position.x * viewport.scale - 14, top: canvasFrame.y + viewport.y + selectedLayer.transform.position.y * viewport.scale - 14 }}
    onReplace={() => { void pickPhoto('library', selectedLayer.id); }}
    onToggleLock={() => dispatch({ type: 'command', command: { type: 'layer.lock.set', layerId: selectedLayer.id, isLocked: !selectedLayer.isLocked } })}
    replaceStyle={{ left: canvasFrame.x + viewport.x + (selectedLayer.transform.position.x + selectedLayer.frame.width) * viewport.scale - 14, top: canvasFrame.y + viewport.y + selectedLayer.transform.position.y * viewport.scale - 14 }}
  /> : null;

  return (
    <GestureHandlerRootView style={[styles.root, a3Styles.editorRoot]}>
        <SafeAreaView edges={['top']} style={[styles.safeArea, brushCut !== null && a3Styles.brushEditorSafeArea]}>
        {brushCut === null && <ProductEditorHeader canRedo={state.future.length > 0} canUndo={state.past.length > 0} locale={locale} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} onExport={exportPng} onExit={requestExit} />}
        {isTablet ? (
          <View style={styles.tabletWorkspace}>
            <LayerPanel layers={state.present.layers} selectedLayerId={selectedLayerId} onSelect={selectLayer} />
            <View style={styles.tabletCanvasColumn}>{canvas}</View>
            <View style={styles.tabletInspector}>{inspector}</View>
          </View>
        ) : (
          <View style={[styles.phoneWorkspace, a3Styles.phoneWorkspace, brushCut !== null && a3Styles.brushEditorWorkspace]}>
            {canvas}
            {brushCut !== null && <BrushCutHeader locale={locale} hasStrokes={brushCut.strokes.length > 0} onCancel={cancelBrushCut} onConfirm={confirmBrushCut} />}
            {straightCut === null && brushCut === null && imageSelectionControls}
            {selectedLayer === null && !drawerOpen && textEdit === null && straightCut === null && brushCut === null && <EditorPrimaryToolbar bottomInset={insets.bottom} locale={locale} onBackground={() => setBackgroundDrawerOpen(true)} onMaterial={() => setAssetDrawerOpen(true)} onPhoto={openPhotoSource} onScissors={openCutPalette} onText={addText} />}
            {straightCut === null && brushCut === null && (imageLayerToolbar ?? textLayerToolbar ?? (selectedLayer !== null && inspector))}
            {assetDrawerOpen && <>
              <Pressable accessibilityLabel="Close materials" accessibilityRole="button" onPress={() => { setAssetDrawerOpen(false); setCustomPolkaBackgroundOpen(false); setAssetDrawerHeight(0); }} style={a3Styles.assetDrawerBackdrop} />
              <AssetDrawer initialCustomPolkaPaper={customPolkaBackgroundOpen} onAddItem={(item) => { void addRemotePackItem(item); }} onAddCustomPolkaPaper={(paper) => { if (customPolkaBackgroundOpen) { setAssetDrawerOpen(false); setCustomPolkaBackgroundOpen(false); setAssetDrawerHeight(0); void applyBackgroundItem(createCustomPolkaPaper({ ...paper, pattern: 'polka' })); return; } void addRemotePackItem(createCustomPolkaPaper({ ...paper, pattern: 'polka' })); }} onAddCustomSolidPaper={(color) => { void addRemotePackItem(createCustomSolidPaper(color)); }} onAddCustomBasicShape={(sticker: ProceduralSticker, material) => { void addRemotePackItem(createCustomBasicShape(sticker, material)); }} onClose={() => { setAssetDrawerOpen(false); setCustomPolkaBackgroundOpen(false); setAssetDrawerHeight(0); }} onHeightChange={setAssetDrawerHeight} onViewAll={() => { setAssetDrawerOpen(false); void openAssetsFromEditor(); }} />
            </>}
            {backgroundDrawerOpen && <>
              <Pressable accessibilityLabel="Close backgrounds" accessibilityRole="button" onPress={() => { setBackgroundDrawerOpen(false); setAssetDrawerHeight(0); }} style={a3Styles.assetDrawerBackdrop} />
              <BackgroundDrawer onApply={(item) => { void applyBackgroundItem(item); }} onClear={() => dispatch({ type: 'command', command: { type: 'canvas.background.set', background: '#F7F3ED', asset: null } })} onClose={() => { setBackgroundDrawerOpen(false); setAssetDrawerHeight(0); }} onCustomPolka={() => { setBackgroundDrawerOpen(false); setCustomPolkaBackgroundOpen(true); setAssetDrawerOpen(true); }} onHeightChange={setAssetDrawerHeight} />
            </>}
            {textEdit !== null && selectedLayer?.type === 'text' && <TextEditorPanel key={textEdit.layerId} bottomInset={insets.bottom} keyboardHeight={keyboardHeight} layer={selectedLayer} locale={locale} text={textEdit.text} onCancel={cancelTextEditing} onChangeText={(text) => setTextEdit((current) => current === null ? null : { ...current, text })} onDone={finishTextEditing} onStyleChange={(change) => updateTextStyle(selectedLayer.id, change)} />}
            {cutPaletteOpen && straightCut === null && <Pressable accessibilityLabel={t(locale, 'editor.cut.dismiss')} accessibilityRole="button" onPress={() => setCutPaletteOpen(false)} style={a3Styles.cutPaletteBackdrop} />}
            {cutPaletteOpen && straightCut === null && <CutPalette bottomInset={insets.bottom} hasSelectedLayer={selectedLayer !== null} locale={locale} onClose={() => setCutPaletteOpen(false)} onSelect={selectCutStyle} />}
            {straightCut !== null && <StraightCutActions bottomInset={insets.bottom} locale={locale} onCancel={cancelStraightCut} onConfirm={confirmStraightCut} />}
            {brushCut !== null && <BrushCutPanel bottomInset={insets.bottom} locale={locale} hasStrokes={brushCut.strokes.length > 0} hollowOriginal={brushCut.hollowOriginal} showHollowOption onClear={clearBrushCut} onToggleHollow={toggleBrushHollow} />}
            {cutHint !== null && <View pointerEvents="none" style={[a3Styles.cutHint, { bottom: 112 + insets.bottom }]}><Text style={a3Styles.cutHintText}>{cutHint}</Text></View>}
          </View>
        )}
        <Canvas ref={exportCanvasRef} style={a3Styles.exportCanvas}><SkiaEditorScene draft={state.present} viewport={{ x: 0, y: 0, scale: 1 }} activeLayer={{ layerId: null, transform: activeTransform }} assetUris={assetUris} proceduralPapers={proceduralPapers} proceduralStickers={proceduralStickers} fontUris={fontUris} fontSupportsCjk={fontSupportsCjk} canvasBackgroundPaper={canvasBackgroundPaper} canvasBackgroundUri={canvasBackgroundUri} showSelection={false} /></Canvas>
        <StatusBar style="dark" />
        </SafeAreaView>
      </GestureHandlerRootView>
  );
};

const HistoryButton = ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => <Pressable disabled={disabled} onPress={onPress} style={[styles.historyButton, disabled && styles.historyButtonDisabled]}><Text style={[styles.historyButtonText, disabled && styles.historyButtonTextDisabled]}>{label}</Text></Pressable>;
const EditorHeader = ({ pastCount, futureCount, onUndo, onRedo, onExport, onSave, onExit }: { pastCount: number; futureCount: number; onUndo: () => void; onRedo: () => void; onExport: () => void; onSave: () => void; onExit: () => void }) => <View style={styles.header}><View style={a3Styles.headerCopy}><Text style={styles.eyebrow}>JOURNAL COLLAGE · A3</Text><Text numberOfLines={1} style={styles.title}>New collage</Text></View><View style={styles.history}><HistoryButton label="Close" disabled={false} onPress={onExit} /><HistoryButton label="↶" disabled={pastCount === 0} onPress={onUndo} /><HistoryButton label="↷" disabled={futureCount === 0} onPress={onRedo} /><HistoryButton label="Save" disabled={false} onPress={onSave} /><HistoryButton label="Share" disabled={false} onPress={onExport} /></View></View>;
const EditorCanvas = ({ bottomOverlay, children, frame, gesture, immersive = false, keyboardOffset, onFrameLayout, onLayout }: { bottomOverlay: number; children: React.ReactNode; frame: { width: number; height: number }; gesture: ReturnType<typeof Gesture.Simultaneous> | ReturnType<typeof Gesture.Pan>; immersive?: boolean; keyboardOffset: number; onFrameLayout: (event: LayoutChangeEvent) => void; onLayout: (event: LayoutChangeEvent) => void }) => (
  <View style={[a3Styles.canvasStage, bottomOverlay > 0 && !immersive ? a3Styles.canvasStageWithSheet : { paddingBottom: immersive ? 0 : 104 }]}>
    <View onLayout={onFrameLayout} style={[a3Styles.canvasFrame, frame, keyboardOffset > 0 && { transform: [{ translateY: -keyboardOffset }] }]}>
      <View onLayout={onLayout} style={a3Styles.canvasMeasurement}>
        <GestureDetector gesture={gesture}>
          <Canvas style={styles.canvas}>{children}</Canvas>
        </GestureDetector>
      </View>
    </View>
  </View>
);
const LayerPanel = ({ layers, selectedLayerId, onSelect }: { layers: Draft['layers']; selectedLayerId: string | null; onSelect: (layerId: string) => void }) => <View style={styles.layerPanel}><Text style={styles.panelLabel}>LAYERS</Text>{[...layers].reverse().map((layer) => <Pressable key={layer.id} onPress={() => onSelect(layer.id)} style={[styles.layerRow, layer.id === selectedLayerId && styles.layerRowSelected]}><View style={[styles.layerSwatch, { backgroundColor: layer.type === 'image' ? '#5E7D79' : layer.type === 'material' ? '#E5AFA1' : '#D6C2A9' }]} /><View><Text style={styles.layerName}>{layer.name ?? layer.type}</Text><Text style={styles.layerType}>{layer.type}</Text></View></Pressable>)}</View>;
const CutPalette = ({ bottomInset, hasSelectedLayer, locale, onClose, onSelect }: Readonly<{ bottomInset: number; hasSelectedLayer: boolean; locale: ReturnType<typeof resolveProductLocale>; onClose: () => void; onSelect: (style: CutStyle) => void }>) => {
  return <View style={[a3Styles.cutPalette, { bottom: (hasSelectedLayer ? 170 : 96) + bottomInset }]}>
    <Pressable accessibilityLabel={t(locale, 'editor.cut.straight')} accessibilityRole="button" onPress={() => onSelect('straight')} style={a3Styles.cutPaletteOption}><Image source={require('../../miniprogram-spike/miniprogram/assets/icons/scissors/bolang.png')} style={a3Styles.cutPaletteIcon} /><Text style={a3Styles.cutPaletteLabel}>{t(locale, 'editor.cut.straight')}</Text></Pressable>
    <Pressable accessibilityLabel={t(locale, 'editor.cut.wave')} accessibilityRole="button" onPress={() => onSelect('wave')} style={a3Styles.cutPaletteOption}><Image source={require('../../miniprogram-spike/miniprogram/assets/icons/scissors/zhijiao.png')} style={a3Styles.cutPaletteIcon} /><Text style={a3Styles.cutPaletteLabel}>{t(locale, 'editor.cut.wave')}</Text></Pressable>
    <Pressable accessibilityLabel={t(locale, 'editor.cut.free')} accessibilityRole="button" onPress={() => onSelect('free')} style={a3Styles.cutPaletteOption}><Image source={require('../../miniprogram-spike/miniprogram/assets/icons/scissors/tumo.png')} style={a3Styles.cutPaletteIcon} /><Text style={a3Styles.cutPaletteLabel}>{t(locale, 'editor.cut.free')}</Text></Pressable>
    <Pressable accessibilityLabel={t(locale, 'editor.cut.subject')} accessibilityRole="button" onPress={() => onSelect('subject')} style={a3Styles.cutPaletteOption}><Image source={require('../../miniprogram-spike/miniprogram/assets/icons/scissors/zhuti.png')} style={a3Styles.cutPaletteIcon} /><Text style={a3Styles.cutPaletteLabel}>{t(locale, 'editor.cut.subject')}</Text></Pressable>
    <Pressable accessibilityLabel={t(locale, 'editor.cut.cancel')} accessibilityRole="button" hitSlop={8} onPress={onClose} style={a3Styles.cutPaletteClose}><Text style={a3Styles.cutPaletteCloseText}>×</Text></Pressable>
  </View>;
};

const StraightCutActions = ({ bottomInset, locale, onCancel, onConfirm }: Readonly<{ bottomInset: number; locale: ReturnType<typeof resolveProductLocale>; onCancel: () => void; onConfirm: () => void }>) => (
  <View style={[a3Styles.straightCutActions, { bottom: 28 + bottomInset }]}>
    <Pressable accessibilityRole="button" onPress={onCancel} style={a3Styles.straightCutAction}><Text style={a3Styles.straightCutCancel}>{t(locale, 'editor.cut.cancel')}</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onConfirm} style={a3Styles.straightCutAction}><Text style={a3Styles.straightCutDone}>{t(locale, 'editor.cut.done')}</Text></Pressable>
  </View>
);
const BrushCutHeader = ({ locale, hasStrokes, onCancel, onConfirm }: Readonly<{ locale: ReturnType<typeof resolveProductLocale>; hasStrokes: boolean; onCancel: () => void; onConfirm: () => void }>) => (
  <View style={a3Styles.brushCutHeader}>
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onCancel} style={a3Styles.brushCutHeaderAction}><Text style={a3Styles.brushCutCancel}>{t(locale, 'editor.cut.cancel')}</Text></Pressable>
    <Text style={a3Styles.brushCutTitle}>{t(locale, 'editor.cut.free')}</Text>
    <Pressable accessibilityRole="button" disabled={!hasStrokes} hitSlop={10} onPress={onConfirm} style={[a3Styles.brushCutHeaderAction, a3Styles.brushCutHeaderDone]}><Text style={[a3Styles.brushCutDone, !hasStrokes && a3Styles.disabledAction]}>{t(locale, 'editor.cut.done')}</Text></Pressable>
  </View>
);
const BrushCutPanel = ({ bottomInset, locale, hasStrokes, hollowOriginal, showHollowOption, onClear, onToggleHollow }: Readonly<{ bottomInset: number; locale: ReturnType<typeof resolveProductLocale>; hasStrokes: boolean; hollowOriginal: boolean; showHollowOption: boolean; onClear: () => void; onToggleHollow: () => void }>) => (
  <View style={[a3Styles.brushCutPanel, { paddingBottom: Math.max(14, bottomInset + 6) }]}>
    <View style={a3Styles.brushCutOptions}><Pressable accessibilityRole="button" disabled={!hasStrokes} onPress={onClear} style={a3Styles.brushCutClearButton}><Text style={[a3Styles.brushCutClear, !hasStrokes && a3Styles.disabledAction]}>{t(locale, 'editor.cut.clear')}</Text></Pressable>{showHollowOption && <Pressable accessibilityRole="switch" accessibilityState={{ checked: hollowOriginal }} onPress={onToggleHollow} style={a3Styles.brushCutHollow}><Text style={a3Styles.brushCutHollowLabel}>{t(locale, 'editor.cut.hollow')}</Text><View style={[a3Styles.brushCutSwitch, hollowOriginal && a3Styles.brushCutSwitchActive]}><View style={[a3Styles.brushCutKnob, hollowOriginal && a3Styles.brushCutKnobActive]} /></View></Pressable>}</View>
  </View>
);
const PhoneToolbar = ({ onPhoto, onEffects }: { onPhoto: () => void; onEffects: () => void }) => <View style={styles.phoneToolbar}><ToolButton label="Photo" onPress={onPhoto} /><ToolButton label="Material" /><ToolButton label="Text" /><ToolButton label="Torn" onPress={onEffects} /></View>;
const ToolButton = ({ label, onPress }: { label: string; onPress?: () => void }) => <Pressable onPress={onPress} style={styles.toolButton}><View style={styles.toolGlyph} /><Text style={styles.toolLabel}>{label}</Text></Pressable>;
const Inspector = ({ layer, onToggleEffect, onTornEdgeChange, onCropChange }: { layer: Draft['layers'][number] | null; onToggleEffect: (effect: Effect['id']) => void; onTornEdgeChange: (change: 'less' | 'more' | 'reroll') => void; onCropChange: (action: 'in' | 'out' | 'left' | 'right' | 'reset') => void }) => {
  const torn = layer?.effects.find((effect) => effect.id === 'torn-edge');
  return <View style={styles.inspector}>
    <Text style={styles.inspectorLabel}>SELECTION</Text>
    <Text style={styles.inspectorValue}>{layer?.name ?? 'Tap a layer to select it'}</Text>
    {layer && <>
      <Text style={a2Styles.controlLabel}>EFFECTS</Text>
      <View style={a2Styles.chipRow}><EffectChip label="Shadow" active={layer.effects.some((effect) => effect.id === 'shadow')} onPress={() => onToggleEffect('shadow')} /><EffectChip label="Outline" active={layer.effects.some((effect) => effect.id === 'outline')} onPress={() => onToggleEffect('outline')} /><EffectChip label="Torn edge" active={torn !== undefined} onPress={() => onToggleEffect('torn-edge')} /></View>
      {torn && <View style={a2Styles.parameterRow}><Text style={a2Styles.parameterText}>Edge {torn.intensity}</Text><MiniButton label="−" onPress={() => onTornEdgeChange('less')} /><MiniButton label="+" onPress={() => onTornEdgeChange('more')} /><MiniButton label="Reroll" onPress={() => onTornEdgeChange('reroll')} /></View>}
      {layer.type === 'image' && <><Text style={a2Styles.controlLabel}>CROP</Text><View style={a2Styles.parameterRow}><MiniButton label="Zoom −" onPress={() => onCropChange('out')} /><MiniButton label="Zoom +" onPress={() => onCropChange('in')} /><MiniButton label="←" onPress={() => onCropChange('left')} /><MiniButton label="→" onPress={() => onCropChange('right')} /><MiniButton label="Reset" onPress={() => onCropChange('reset')} /></View></>}
    </>}
    <Text style={styles.inspectorHint}>Draft commands persist effects and crop. Drag · pinch · rotate remains available on canvas.</Text>
  </View>;
};
const EffectChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => <Pressable onPress={onPress} style={[a2Styles.effectChip, active && a2Styles.effectChipActive]}><Text style={[a2Styles.effectChipText, active && a2Styles.effectChipTextActive]}>{label}</Text></Pressable>;
const MiniButton = ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable onPress={onPress} style={a2Styles.miniButton}><Text style={a2Styles.miniButtonText}>{label}</Text></Pressable>;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEE8DF' }, safeArea: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }, eyebrow: { color: '#806F62', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }, title: { color: '#30251E', fontSize: 22, fontWeight: '700', marginTop: 3 }, history: { flexDirection: 'row', gap: 8 }, historyButton: { backgroundColor: '#FFFDF9', borderColor: '#D7CDC1', borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 }, historyButtonDisabled: { backgroundColor: '#E7E0D7', borderColor: '#E7E0D7' }, historyButtonText: { color: '#49372B', fontSize: 13, fontWeight: '600' }, historyButtonTextDisabled: { color: '#A89C90' }, phoneWorkspace: { flex: 1 }, tabletWorkspace: { flex: 1, flexDirection: 'row', gap: 12, paddingBottom: 12, paddingHorizontal: 12 }, tabletCanvasColumn: { flex: 1, minWidth: 0 }, layerPanel: { backgroundColor: '#FFFDF9', borderColor: '#DDD2C7', borderRadius: 20, borderWidth: 1, gap: 8, padding: 12, width: 180 }, panelLabel: { color: '#917D6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 }, layerRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 9, padding: 8 }, layerRowSelected: { backgroundColor: '#E8EFF5' }, layerSwatch: { borderRadius: 8, height: 30, width: 30 }, layerName: { color: '#30251E', fontSize: 12, fontWeight: '600' }, layerType: { color: '#8C7D70', fontSize: 10, marginTop: 2 }, canvasArea: { flex: 1, marginHorizontal: 12, overflow: 'hidden' }, canvas: { flex: 1 }, tabletInspector: { width: 235 }, inspector: { backgroundColor: '#FFFDF9', borderColor: '#DDD2C7', borderRadius: 22, borderWidth: 1, gap: 5, margin: 16, paddingHorizontal: 18, paddingVertical: 14 }, inspectorLabel: { color: '#917D6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 }, inspectorValue: { color: '#30251E', fontSize: 16, fontWeight: '600' }, inspectorHint: { color: '#7B6D62', fontSize: 12, lineHeight: 17 }, phoneToolbar: { backgroundColor: '#FFFDF9', borderColor: '#DDD2C7', borderRadius: 22, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginTop: 10, paddingVertical: 10 }, toolButton: { alignItems: 'center', gap: 5, minWidth: 56 }, toolGlyph: { backgroundColor: '#CBBEB2', borderRadius: 7, height: 25, width: 25 }, toolLabel: { color: '#5A4B40', fontSize: 11, fontWeight: '600' },
});

const a2Styles = StyleSheet.create({
  controlLabel: { color: '#917D6B', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  effectChip: { backgroundColor: '#F1EAE2', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  effectChipActive: { backgroundColor: '#4A6F9A' },
  effectChipText: { color: '#5A4B40', fontSize: 11, fontWeight: '600' },
  effectChipTextActive: { color: '#FFFFFF' },
  parameterRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  parameterText: { color: '#5A4B40', fontSize: 11, fontWeight: '600', marginRight: 2 },
  miniButton: { backgroundColor: '#F1EAE2', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  miniButtonText: { color: '#5A4B40', fontSize: 11, fontWeight: '600' },
});

const a3Styles = StyleSheet.create({
  editorRoot: { backgroundColor: '#FAFAF8' },
  brushEditorSafeArea: { backgroundColor: '#FFFFFF' },
  headerCopy: { flexShrink: 1 },
  phoneWorkspace: { position: 'relative' },
  brushEditorWorkspace: { backgroundColor: '#FAFAF8' },
  canvasStage: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 104, paddingTop: 8 },
  canvasStageWithSheet: { justifyContent: 'flex-start', paddingBottom: 0, paddingTop: 8 },
  assetDrawerBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 9 },
  cutPaletteBackdrop: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 6 },
  canvasFrame: { backgroundColor: '#FDFDFB', shadowColor: '#111111', shadowOffset: { height: 9, width: 0 }, shadowOpacity: 0.12, shadowRadius: 29 },
  canvasMeasurement: { flex: 1 },
  exportCanvas: { height: CANVAS_SIZE.height, left: -10000, position: 'absolute', top: -10000, width: CANVAS_SIZE.width },
  cutPalette: { alignItems: 'stretch', backgroundColor: 'rgba(255,255,255,0.94)', borderColor: '#ECEAE5', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 82, left: 32, paddingHorizontal: 9, position: 'absolute', right: 32, shadowColor: '#111111', shadowOffset: { height: 9, width: 0 }, shadowOpacity: 0.1, shadowRadius: 20, zIndex: 7 },
  cutPaletteOption: { alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: 0, paddingTop: 4 },
  cutPaletteIcon: { height: 31, resizeMode: 'contain', width: 31 },
  cutPaletteLabel: { color: '#111111', fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  cutPaletteClose: { alignItems: 'center', backgroundColor: '#F2F1EE', borderRadius: 10, height: 20, justifyContent: 'center', position: 'absolute', right: -7, top: -7, width: 20 },
  cutPaletteCloseText: { color: '#6F6F6F', fontSize: 17, fontWeight: '400', lineHeight: 19 },
  cutHint: { alignSelf: 'center', backgroundColor: 'rgba(17,17,17,0.88)', borderRadius: 18, left: 32, paddingHorizontal: 16, paddingVertical: 10, position: 'absolute', right: 32, zIndex: 10 },
  cutHintText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  straightCutActions: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, flexDirection: 'row', height: 44, left: '25%', position: 'absolute', right: '25%', shadowColor: '#111111', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.12, shadowRadius: 22, zIndex: 7 },
  straightCutAction: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  straightCutCancel: { color: '#6F6F6F', fontSize: 17, fontWeight: '600' },
  straightCutDone: { color: '#111111', fontSize: 17, fontWeight: '700' },
  brushCutPanel: { backgroundColor: 'rgba(255,255,255,0.98)', borderTopColor: '#ECEAE5', borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, left: 0, minHeight: 94, paddingHorizontal: 20, paddingTop: 14, position: 'absolute', right: 0, zIndex: 8 },
  brushCutHeader: { alignItems: 'center', backgroundColor: '#FFFFFF', flexDirection: 'row', height: 58, justifyContent: 'space-between', left: 0, paddingHorizontal: 20, position: 'absolute', right: 0, top: 0, zIndex: 9 },
  brushCutHeaderAction: { justifyContent: 'center', minWidth: 74 },
  brushCutHeaderDone: { alignItems: 'flex-end' },
  brushCutCancel: { color: '#6F6F6F', fontSize: 16, fontWeight: '500' },
  brushCutTitle: { color: '#111111', fontSize: 17, fontWeight: '700' },
  brushCutDone: { color: '#111111', fontSize: 16, fontWeight: '700' },
  brushCutOptions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brushCutClearButton: { backgroundColor: '#F3F2EF', borderRadius: 18, minWidth: 108, paddingHorizontal: 15, paddingVertical: 9 },
  brushCutClear: { color: '#111111', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  brushCutHollow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brushCutHollowLabel: { color: '#454545', fontSize: 14, fontWeight: '500' },
  brushCutSwitch: { backgroundColor: '#E6E4E0', borderColor: '#DDDAD4', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, height: 28, padding: 3, width: 48 },
  brushCutSwitchActive: { backgroundColor: '#111111', borderColor: '#111111' },
  brushCutKnob: { backgroundColor: '#FFFFFF', borderRadius: 11, height: 22, width: 22 },
  brushCutKnobActive: { backgroundColor: '#FFFFFF', transform: [{ translateX: 20 }] },
  disabledAction: { opacity: 0.35 },
});

export default function App() {
  const [tab, setTab] = useState<ProductTab>('create');
  const [editing, setEditing] = useState(false);
  const [editorEntry, setEditorEntry] = useState<CreateEntry>('blank');
  const [assetsDetailOpen, setAssetsDetailOpen] = useState(false);
  const [assetsEntryContext, setAssetsEntryContext] = useState<'create' | 'editor' | null>(null);
  const [pendingPackItems, setPendingPackItems] = useState<readonly RemotePackItem[]>([]);
  const [restoreSavedDraftId, setRestoreSavedDraftId] = useState<string | null>(null);
  const locale = resolveProductLocale();

  if (editing) return <EditorWorkspace initialEntry={editorEntry} initialPackItems={pendingPackItems} restoreSavedDraftId={restoreSavedDraftId} onInitialPackItemsConsumed={() => setPendingPackItems([])} onExit={() => { setAssetsDetailOpen(false); setAssetsEntryContext(null); setEditing(false); setTab('create'); }} onOpenAssets={() => { setAssetsEntryContext('editor'); setEditing(false); setTab('assets'); }} />;

  return (
    <ProductAppShell activeTab={tab} hideTabBar={assetsDetailOpen} locale={locale} onTabChange={(nextTab) => { setAssetsDetailOpen(false); setAssetsEntryContext(null); setTab(nextTab); }}>
      <StatusBar style="dark" />
      {tab === 'create'
        ? <CreateHome locale={locale} onOpenAssets={() => { setAssetsEntryContext('create'); setTab('assets'); }} onOpenEditor={(entry, savedDraftId) => { setRestoreSavedDraftId(savedDraftId ?? null); setEditorEntry(entry); setEditing(true); }} />
        : tab === 'assets'
          ? <AssetsLibrary entryContext={assetsEntryContext} onDetailChange={setAssetsDetailOpen} onReturnToOrigin={() => { const context = assetsEntryContext; setAssetsEntryContext(null); if (context === 'editor') { setEditorEntry('restore'); setEditing(true); } else setTab('create'); }} onCreateWithItems={(items) => { setPendingPackItems(items); if (assetsEntryContext !== 'editor') setRestoreSavedDraftId(null); setEditorEntry(assetsEntryContext === 'editor' ? 'restore' : 'blank'); setAssetsEntryContext(null); setEditing(true); }} />
          : <View style={productShellStyles.page}><Text style={productShellStyles.title}>{t(locale, `tab.${tab}`)}</Text></View>}
    </ProductAppShell>
  );
}

const productShellStyles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 32 },
  title: { color: '#111111', fontSize: 22, fontWeight: '600', lineHeight: 28 },
});
