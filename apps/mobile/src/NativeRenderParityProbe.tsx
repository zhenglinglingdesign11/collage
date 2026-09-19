import * as FileSystem from 'expo-file-system/legacy';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, useCanvasRef } from '@shopify/react-native-skia';
import { assetUriMap, brushDefinitionsById, emptyAssetCatalog, proceduralPaperForReferenceId } from '@journalcollage/asset-system';
import { createDraft, identityTransform, sha256HexForBytes, type Draft } from '@journalcollage/editor-core';
import { SkiaEditorScene } from '@journalcollage/editor-renderer';
import { exportPortableProject, importPortableProject, type StoredWorkspace } from './localWorkspace';

const ROOT = `${FileSystem.documentDirectory}native-render-parity/`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAF/gJ+F7gkUQAAAABJRU5ErkJggg==';
const bytes = (base64: string) => Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
const pixelHash = (image: { readPixels: () => Uint8Array | Float32Array | null }) => {
  const pixels = image.readPixels();
  if (!pixels) throw new Error('Skia pixel readback unavailable');
  return sha256HexForBytes(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
};
const cases = [{ name: 'preview', width: 360, height: 450, scale: 0.45 }, { name: 'thumbnail', width: 80, height: 100, scale: 0.1 }, { name: 'export', width: 800, height: 1000, scale: 1 }] as const;

const documentForProbe = (): Draft => ({
  ...createDraft({ id: 'native-render-parity', size: { width: 800, height: 1000 }, now: '2026-09-14T00:00:00.000Z' }),
  canvas: { size: { width: 800, height: 1000 }, background: '#FDFDFB', backgroundAsset: { id: 'asset://pack/paper-04/grid-dot', kind: 'image', revision: '1' } },
  layers: [
    { id: 'photo', type: 'image', name: 'Probe image', asset: { id: 'user://image/native-probe', kind: 'image', revision: '1' }, frame: { width: 300, height: 300 }, crop: { x: 0, y: 0, width: 1, height: 1 }, transform: { ...identityTransform(), position: { x: 250, y: 160 } }, opacity: 1, isLocked: false, effects: [{ instanceId: 'outline', type: 'edge.outline', version: 1, enabled: true, stage: 'overlay', params: { color: '#111111', width: 8 } }] },
    { id: 'title', type: 'text', text: 'Native parity', frame: { width: 500, height: 100 }, fontId: 'system', fontVariantId: 'system', fontSize: 42, color: '#111111', textAlign: 'left', backgroundColor: null, transform: { ...identityTransform(), position: { x: 120, y: 560 } }, opacity: 1, isLocked: false, effects: [] },
    { id: 'brush', type: 'brush', frame: { width: 500, height: 120 }, transform: { ...identityTransform(), position: { x: 140, y: 720 } }, opacity: 1, isLocked: false, effects: [], strokes: [{ id: 'stroke', brushId: 'brush://builtin/plain', brushRevision: '1', points: [{ x: 20, y: 40 }, { x: 420, y: 70 }], style: { color: '#D94A38', size: 18, spacing: 4, jitter: 0, seed: 1, opacity: 1 } }] },
  ],
  selectedLayerId: null,
});

export const NativeRenderParityProbe = () => {
  const originalPreview = useCanvasRef(); const rebuiltPreview = useCanvasRef(); const originalThumbnail = useCanvasRef(); const rebuiltThumbnail = useCanvasRef(); const originalExport = useCanvasRef(); const rebuiltExport = useCanvasRef();
  const refs = [[originalPreview, rebuiltPreview], [originalThumbnail, rebuiltThumbnail], [originalExport, rebuiltExport]];
  const originalHashes = useRef<readonly Readonly<{ pixels: string; png: string }>[] | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly [StoredWorkspace, StoredWorkspace] | null>(null);
  const [status, setStatus] = useState('Native parity not run');
  const capture = async (ref: Readonly<{ current: { makeImageSnapshotAsync: () => Promise<{ readPixels: () => Uint8Array | Float32Array | null; encodeToBase64: () => string }> | null } | null }>, label: string) => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const image = await ref.current?.makeImageSnapshotAsync();
      if (image) return image;
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`${label} snapshot unavailable after resource settle`);
  };
  const run = async () => {
    try {
      setStatus('Building isolated project…');
      await FileSystem.deleteAsync(ROOT, { idempotent: true });
      await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
      const sourceUri = `${ROOT}source.png`;
      await FileSystem.writeAsStringAsync(sourceUri, PNG, { encoding: FileSystem.EncodingType.Base64 });
      const draft = documentForProbe();
      const original: StoredWorkspace = { draft, catalog: { ...emptyAssetCatalog(), assets: [{ reference: draft.layers[0].type === 'image' ? draft.layers[0].asset : { id: '', kind: 'image' }, originalUri: sourceUri, width: 1, height: 1, mimeType: 'image/png', createdAt: draft.createdAt }] } };
      const portable = await exportPortableProject(original, `${ROOT}portable/`);
      setWorkspaces([original, original]); setStatus('Capturing original native PNG snapshots…');
      setTimeout(() => { void (async () => {
        originalHashes.current = await Promise.all(refs.map(async ([left], index) => { const image = await capture(left, `${cases[index].name} original`); return { pixels: pixelHash(image), png: sha256HexForBytes(bytes(image.encodeToBase64())) }; }));
        await FileSystem.deleteAsync(sourceUri, { idempotent: true });
        const rebuilt = await importPortableProject(portable.directoryUri, `${ROOT}rebuilt/`);
        setWorkspaces([original, rebuilt]); setStatus('Capturing rebuilt native PNG snapshots…');
        setTimeout(() => { void (async () => {
          const checks = await Promise.all(refs.map(async ([, right], index) => { const image = await capture(right, `${cases[index].name} rebuilt`); const rebuilt = { pixels: pixelHash(image), png: sha256HexForBytes(bytes(image.encodeToBase64())) }; const original = originalHashes.current![index]; return { target: cases[index].name, original, rebuilt, equal: original.pixels === rebuilt.pixels, pngEqual: original.png === rebuilt.png }; }));
          await FileSystem.writeAsStringAsync(`${ROOT}proof.json`, JSON.stringify(checks), { encoding: FileSystem.EncodingType.UTF8 });
          setStatus(checks.every((check) => check.equal) ? `PASS · ${checks.map((check) => `${check.target}:${check.original.pixels.slice(0, 12)}`).join(' · ')}` : `FAIL · ${JSON.stringify(checks)}`);
        })().catch((error: unknown) => setStatus(`FAIL · ${error instanceof Error ? error.message : String(error)}`)); }, 1600);
      })().catch((error: unknown) => setStatus(`FAIL · ${error instanceof Error ? error.message : String(error)}`)); }, 3000);
    } catch (error) { setStatus(`FAIL · ${error instanceof Error ? error.message : String(error)}`); }
  };
  const scene = (workspace: StoredWorkspace, item: typeof cases[number]) => <SkiaEditorScene draft={workspace.draft} viewport={{ x: 0, y: 0, scale: item.scale }} activeLayer={{ layerId: null, transform: { value: [] } as never }} assetUris={assetUriMap(workspace.catalog)} brushDefinitions={brushDefinitionsById} canvasBackgroundPaper={proceduralPaperForReferenceId('asset://pack/paper-04/grid-dot')} showSelection={false} surfaceColor="#FAFAF8" />;
  return <View style={styles.panel}><Pressable accessibilityLabel="Run native render parity" onPress={() => { void run(); }} style={styles.button}><Text style={styles.buttonText}>Run native parity</Text></Pressable><Text accessibilityLabel="Native render parity status" style={styles.status}>{status}</Text>{workspaces && cases.map((item, index) => <View key={item.name} style={styles.hidden}><Canvas ref={refs[index][0]} style={{ width: item.width, height: item.height }}>{scene(workspaces[0], item)}</Canvas><Canvas ref={refs[index][1]} style={{ width: item.width, height: item.height }}>{scene(workspaces[1], item)}</Canvas></View>)}</View>;
};
const styles = StyleSheet.create({ panel: { bottom: 6, left: 6, position: 'absolute', right: 6, zIndex: 99 }, button: { alignSelf: 'flex-start', backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }, buttonText: { color: '#fff', fontSize: 11, fontWeight: '700' }, status: { backgroundColor: '#fff', color: '#111', fontSize: 10, marginTop: 4, padding: 4 }, hidden: { left: 0, opacity: 0.01, position: 'absolute', top: 0, zIndex: -1 } });
