import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Canvas, useCanvasRef, type Transforms3d } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { assetUriMap, emptyAssetCatalog, upsertAsset, type AssetCatalog } from '@journalcollage/asset-system';
import { applyCommand, createDraft, hitTest, identityTransform, migrateDraft, type Draft, type EditorCommand, type Effect, type Transform } from '@journalcollage/editor-core';
import { SkiaEditorScene, type CanvasViewport } from '@journalcollage/editor-renderer';
import { importLocalImage, loadWorkspace, saveExportPng, saveWorkspace } from './src/localWorkspace';

const CANVAS_SIZE = { width: 1800, height: 2400 };
type EditorState = Readonly<{ past: readonly Draft[]; present: Draft; future: readonly Draft[] }>;
type EditorAction = Readonly<{ type: 'command'; command: EditorCommand }> | Readonly<{ type: 'undo' }> | Readonly<{ type: 'redo' }> | Readonly<{ type: 'hydrate'; draft: Draft }>;

const createFixtureDraft = (): Draft => {
  const draft = createDraft({ id: 'a1-canvas-fixture', size: CANVAS_SIZE, now: '2026-09-10T00:00:00.000Z' });
  return {
    ...draft,
    layers: [
      { id: 'fixture-photo', name: 'Torn photo', type: 'image', asset: { id: 'fixture://photo', kind: 'image' }, frame: { width: 900, height: 680 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: { ...identityTransform(), position: { x: 260, y: 340 }, rotation: -0.07 }, opacity: 1, isLocked: false, effects: [{ id: 'shadow', color: '#392F2A', opacity: 0.22, blur: 24, offset: { x: 18, y: 24 } }, { id: 'outline', color: '#FFF8EB', width: 14 }, { id: 'torn-edge', seed: 61, intensity: 28 }] },
      { id: 'fixture-material', name: 'Paper material', type: 'material', asset: { id: 'fixture://paper', kind: 'texture' }, frame: { width: 420, height: 500 }, transform: { ...identityTransform(), position: { x: 1120, y: 760 }, rotation: 0.13 }, opacity: 1, isLocked: false, effects: [{ id: 'shadow', color: '#392F2A', opacity: 0.18, blur: 18, offset: { x: 12, y: 18 } }, { id: 'outline', color: '#FFF8EB', width: 10 }] },
      { id: 'fixture-title', name: 'Text placeholder', type: 'text', text: 'little moments', frame: { width: 1100, height: 180 }, font: null, fontSize: 86, color: '#49372B', transform: { ...identityTransform(), position: { x: 210, y: 1390 }, rotation: -0.025 }, opacity: 1, isLocked: false, effects: [] },
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

const EditorWorkspace = ({ onExit }: { onExit: () => void }) => {
  const window = useWindowDimensions();
  const [state, dispatch] = useReducer(editorReducer, undefined, () => ({ past: [], present: createFixtureDraft(), future: [] }));
  const [catalog, setCatalog] = useState<AssetCatalog>(() => emptyAssetCatalog());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const exportCanvasRef = useCanvasRef();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedLayer = state.present.layers.find((layer) => layer.id === state.present.selectedLayerId) ?? null;
  const viewport = useMemo<CanvasViewport>(() => {
    if (surfaceSize.width === 0 || surfaceSize.height === 0) return { x: 0, y: 0, scale: 1 };
    const scale = Math.min(surfaceSize.width / CANVAS_SIZE.width, surfaceSize.height / CANVAS_SIZE.height);
    return { scale, x: (surfaceSize.width - CANVAS_SIZE.width * scale) / 2, y: (surfaceSize.height - CANVAS_SIZE.height * scale) / 2 };
  }, [surfaceSize]);
  const assetUris = useMemo(() => assetUriMap(catalog), [catalog]);

  useEffect(() => {
    void loadWorkspace().then((workspace) => {
      if (workspace !== null) {
        const migration = migrateDraft(workspace.draft);
        if (migration.ok) {
          dispatch({ type: 'hydrate', draft: migration.draft });
          setCatalog(workspace.catalog);
        }
      }
    }).finally(() => setWorkspaceReady(true));
  }, []);
  useEffect(() => {
    if (!workspaceReady) return;
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    // Persist only settled editor state. Gesture frames stay in shared values and
    // a command commit produces one debounced on-disk update.
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void saveWorkspace({ draft: state.present, catalog });
    }, 350);
    return () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [catalog, state.present, workspaceReady]);

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
    dispatch({ type: 'command', command: { type: 'layer.select', layerId: layer?.id ?? null } });
  }, [state.present, viewport]);
  const commitActiveTransform = useCallback((layerId: string, x: number, y: number, nextScaleX: number, nextScaleY: number, nextRotation: number) => {
    const transform: Transform = { position: { x, y }, scale: { x: nextScaleX, y: nextScaleY }, rotation: nextRotation };
    dispatch({ type: 'command', command: { type: 'layer.transform', layerId, transform } });
  }, []);

  const selectedLayerId = selectedLayer?.id ?? null;
  const commitOnEnd = () => {
    'worklet';
    if (selectedLayerId !== null) runOnJS(commitActiveTransform)(selectedLayerId, positionX.value, positionY.value, scaleX.value, scaleY.value, rotation.value);
  };
  const tap = Gesture.Tap().onEnd((event, success) => { if (success) runOnJS(selectAt)(event.x, event.y); });
  const pan = Gesture.Pan().enabled(selectedLayerId !== null).onBegin(() => { startX.value = positionX.value; startY.value = positionY.value; }).onUpdate((event) => { positionX.value = startX.value + event.translationX / gestureScale.value; positionY.value = startY.value + event.translationY / gestureScale.value; }).onEnd(commitOnEnd);
  const pinch = Gesture.Pinch().enabled(selectedLayerId !== null).onBegin(() => { startScaleX.value = scaleX.value; startScaleY.value = scaleY.value; }).onUpdate((event) => { const next = Math.max(0.15, Math.min(event.scale, 5)); scaleX.value = startScaleX.value * next; scaleY.value = startScaleY.value * next; }).onEnd(commitOnEnd);
  const rotate = Gesture.Rotation().enabled(selectedLayerId !== null).onBegin(() => { startRotation.value = rotation.value; }).onUpdate((event) => { rotation.value = startRotation.value + event.rotation; }).onEnd(commitOnEnd);
  const gesture = Gesture.Simultaneous(tap, pan, pinch, rotate);
  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => setSurfaceSize(event.nativeEvent.layout), []);
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
  const importPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const source = result.assets[0];
    const record = await importLocalImage({ uri: source.uri, width: source.width, height: source.height, mimeType: source.mimeType ?? null });
    setCatalog((current) => upsertAsset(current, record));
    const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : 1;
    const frame = aspect >= 1 ? { width: 1080, height: 1080 / aspect } : { width: 760 * aspect, height: 760 };
    dispatch({ type: 'command', command: { type: 'layer.add', layer: { id: `layer-${Date.now()}`, name: source.fileName ?? 'My photo', type: 'image', asset: record.reference, frame, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: { ...identityTransform(), position: { x: (CANVAS_SIZE.width - frame.width) / 2, y: (CANVAS_SIZE.height - frame.height) / 2 } }, opacity: 1, isLocked: false, effects: [] } } });
  }, []);
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
  const savePngToPhotoLibrary = useCallback(async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
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
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Your collage has been saved to the photo library.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Could not save', `Please check photo permission and available storage.\n${message}`);
    }
  }, [exportCanvasRef]);
  const isTablet = window.width >= 768;
  const scene = <SkiaEditorScene draft={state.present} viewport={viewport} activeLayer={{ layerId: selectedLayerId, transform: activeTransform }} assetUris={assetUris} />;
  const canvas = <EditorCanvas gesture={gesture} onLayout={onCanvasLayout}>{scene}</EditorCanvas>;
  const inspector = <Inspector layer={selectedLayer} onToggleEffect={toggleEffect} onTornEdgeChange={updateTornEdge} onCropChange={updateCrop} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <EditorHeader pastCount={state.past.length} futureCount={state.future.length} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} onExport={exportPng} onSave={savePngToPhotoLibrary} onExit={onExit} />
        {isTablet ? (
          <View style={styles.tabletWorkspace}>
            <LayerPanel layers={state.present.layers} selectedLayerId={selectedLayerId} onSelect={selectLayer} />
            <View style={styles.tabletCanvasColumn}>{canvas}</View>
            <View style={styles.tabletInspector}>{inspector}</View>
          </View>
        ) : (
          <View style={styles.phoneWorkspace}>
            {canvas}
            <PhoneToolbar onPhoto={importPhoto} onEffects={() => toggleEffect('torn-edge')} />
            {inspector}
          </View>
        )}
        <Canvas ref={exportCanvasRef} style={a3Styles.exportCanvas}><SkiaEditorScene draft={state.present} viewport={{ x: 0, y: 0, scale: 1 }} activeLayer={{ layerId: null, transform: activeTransform }} assetUris={assetUris} showSelection={false} /></Canvas>
        <StatusBar style="dark" />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const HistoryButton = ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => <Pressable disabled={disabled} onPress={onPress} style={[styles.historyButton, disabled && styles.historyButtonDisabled]}><Text style={[styles.historyButtonText, disabled && styles.historyButtonTextDisabled]}>{label}</Text></Pressable>;
const EditorHeader = ({ pastCount, futureCount, onUndo, onRedo, onExport, onSave, onExit }: { pastCount: number; futureCount: number; onUndo: () => void; onRedo: () => void; onExport: () => void; onSave: () => void; onExit: () => void }) => <View style={styles.header}><View style={a3Styles.headerCopy}><Text style={styles.eyebrow}>JOURNAL COLLAGE · A3</Text><Text numberOfLines={1} style={styles.title}>New collage</Text></View><View style={styles.history}><HistoryButton label="Close" disabled={false} onPress={onExit} /><HistoryButton label="↶" disabled={pastCount === 0} onPress={onUndo} /><HistoryButton label="↷" disabled={futureCount === 0} onPress={onRedo} /><HistoryButton label="Save" disabled={false} onPress={onSave} /><HistoryButton label="Share" disabled={false} onPress={onExport} /></View></View>;
const EditorCanvas = ({ gesture, onLayout, children }: { gesture: ReturnType<typeof Gesture.Simultaneous>; onLayout: (event: LayoutChangeEvent) => void; children: React.ReactNode }) => <View style={styles.canvasArea} onLayout={onLayout}><GestureDetector gesture={gesture}><Canvas style={styles.canvas}>{children}</Canvas></GestureDetector></View>;
const LayerPanel = ({ layers, selectedLayerId, onSelect }: { layers: Draft['layers']; selectedLayerId: string | null; onSelect: (layerId: string) => void }) => <View style={styles.layerPanel}><Text style={styles.panelLabel}>LAYERS</Text>{[...layers].reverse().map((layer) => <Pressable key={layer.id} onPress={() => onSelect(layer.id)} style={[styles.layerRow, layer.id === selectedLayerId && styles.layerRowSelected]}><View style={[styles.layerSwatch, { backgroundColor: layer.type === 'image' ? '#5E7D79' : layer.type === 'material' ? '#E5AFA1' : '#D6C2A9' }]} /><View><Text style={styles.layerName}>{layer.name ?? layer.type}</Text><Text style={styles.layerType}>{layer.type}</Text></View></Pressable>)}</View>;
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
  headerCopy: { flexShrink: 1 },
  exportCanvas: { height: CANVAS_SIZE.height, left: -10000, position: 'absolute', top: -10000, width: CANVAS_SIZE.width },
});

type AppTab = 'create' | 'assets' | 'inspiration' | 'mine';

const tabCopy: Readonly<Record<AppTab, Readonly<{ label: string; eyebrow: string; title: string; body: string }>>> = {
  create: { label: 'Create', eyebrow: 'YOUR WORKSPACE', title: 'Make a collage', body: 'Start with a photo, then layer paper, tape, type, and handmade details.' },
  assets: { label: 'Assets', eyebrow: 'MATERIAL LIBRARY', title: 'Choose materials', body: 'Paper, tape, stickers, and brushes are added to a collage without changing its portable draft format.' },
  inspiration: { label: 'Inspiration', eyebrow: 'WAYS TO START', title: 'Begin with a feeling', body: 'Inspiration will open a new canvas at its recommended ratio and surface the relevant materials.' },
  mine: { label: 'Mine', eyebrow: 'ON THIS DEVICE', title: 'Your private drafts', body: 'Collages and imported photos stay on this device unless you explicitly export or share them.' },
};

export default function App() {
  const [tab, setTab] = useState<AppTab>('create');
  const [editing, setEditing] = useState(false);

  if (editing) return <EditorWorkspace onExit={() => setEditing(false)} />;

  const copy = tabCopy[tab];
  return (
    <SafeAreaView style={shellStyles.safeArea}>
      <View style={shellStyles.content}>
        <Text style={shellStyles.brand}>JOURNAL COLLAGE</Text>
        <Text style={shellStyles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={shellStyles.title}>{copy.title}</Text>
        <Text style={shellStyles.body}>{copy.body}</Text>
        <Pressable style={shellStyles.primaryButton} onPress={() => setEditing(true)}>
          <Text style={shellStyles.primaryButtonLabel}>{tab === 'create' ? 'Start a new collage' : 'Open the editor'}</Text>
        </Pressable>
        {tab === 'create' && <Text style={shellStyles.caption}>Your latest draft restores automatically when you reopen the editor.</Text>}
      </View>
      <View style={shellStyles.tabBar}>
        {(Object.keys(tabCopy) as AppTab[]).map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={shellStyles.tabButton}>
            <Text style={[shellStyles.tabLabel, tab === item && shellStyles.tabLabelActive]}>{tabCopy[item].label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const shellStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  brand: { color: '#111111', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 28 },
  eyebrow: { color: '#6F6F6F', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10 },
  title: { color: '#111111', fontSize: 32, fontWeight: '700', letterSpacing: -0.6, marginBottom: 12 },
  body: { color: '#6F6F6F', fontSize: 16, lineHeight: 24, maxWidth: 360 },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#111111', borderRadius: 18, marginTop: 28, minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 },
  primaryButtonLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  caption: { color: '#9A9A9A', fontSize: 12, lineHeight: 18, marginTop: 14, maxWidth: 310 },
  tabBar: { borderTopColor: '#E8E6E1', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingHorizontal: 8, paddingTop: 10 },
  tabButton: { alignItems: 'center', flex: 1, minHeight: 48, justifyContent: 'center' },
  tabLabel: { color: '#9A9A9A', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#111111' },
});
