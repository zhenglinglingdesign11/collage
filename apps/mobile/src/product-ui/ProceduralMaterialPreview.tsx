import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ProceduralPaper, ProceduralSticker, RemoteAssetPack, RemotePackItem } from '@journalcollage/asset-system';
import { ProceduralPaperPreview, ProceduralStickerPreview } from '@journalcollage/editor-renderer';
import { cacheRemoteResource, resolvedRemoteResourceUri } from '../localWorkspace';

const fallbackPaper: ProceduralPaper = { background: '#F4EFE5', pattern: 'solid' };
const localPatternUris: Readonly<Record<NonNullable<ProceduralPaper['imageAsset']>, string>> = {
  24: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/24.png')).uri,
  7: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/7.png')).uri,
  1: Image.resolveAssetSource(require('../../../../miniprogram-spike/miniprogram/assets/packs/1.png')).uri,
};

const previewKind = (item: RemotePackItem): RemoteAssetPack['proceduralPreview'] => {
  if (item.reference.id.includes('polka-paper-materials')) return 'polka-paper';
  if (item.paper?.pattern === 'dot' || item.paper?.pattern === 'line' || item.paper?.pattern === 'square') return 'grid-paper';
  return 'solid-paper';
};

const Paper = ({ item, kind }: Readonly<{ item: RemotePackItem; kind: RemoteAssetPack['proceduralPreview'] }>) => {
  const paper = item.paper ?? fallbackPaper;
  return <View style={[styles.paper, { backgroundColor: paper.background }]}>
    {(kind === 'polka-paper' || kind === 'grid-paper') && <ProceduralPaperPreview paper={paper} patternImageUri={paper.imageAsset ? localPatternUris[paper.imageAsset] : undefined} size={{ width: 64, height: 84 }} />}
  </View>
};

export const ProceduralPackPreview = ({ pack }: Readonly<{ pack: RemoteAssetPack }>) => {
  const items = pack.items.filter((item) => item.action === undefined).slice(0, 4);
  return <View style={styles.packPreview}>
    {items.map((item) => <View key={item.id} style={[styles.packSwatch, { backgroundColor: item.paper?.background ?? 'transparent' }]}>
      {pack.proceduralPreview === 'polka-paper' && item.paper && <ProceduralPaperPreview paper={item.paper} patternImageUri={item.paper.imageAsset ? localPatternUris[item.paper.imageAsset] : undefined} size={{ width: 34, height: 46 }} />}
      {(pack.proceduralPreview === 'basic-shape' || pack.proceduralPreview === 'material-shape') && item.sticker && <CachedProceduralStickerPreview cacheKey={`preview-${item.reference.id}`} sticker={item.sticker} size={{ width: 34, height: 46 }} />}
    </View>)}
  </View>;
};

export const ProceduralItemPreview = ({ item }: Readonly<{ item: RemotePackItem }>) => (
  <View style={styles.itemPreview}>{item.sticker ? <CachedProceduralStickerPreview cacheKey={`preview-${item.reference.id}`} sticker={item.sticker} size={{ width: 94, height: 94 }} /> : <Paper item={item} kind={previewKind(item)} />}</View>
);

/** Skia previews receive only local texture URIs; remote URLs are not reliable on iOS. */
export const CachedProceduralStickerPreview = ({ cacheKey, sticker, size }: Readonly<{ cacheKey: string; sticker: ProceduralSticker; size: { width: number; height: number } }>) => {
  const source = sticker.textureSource;
  const [textureUri, setTextureUri] = useState<string | null>(() => source ? resolvedRemoteResourceUri(cacheKey, source) ?? null : null);
  useEffect(() => {
    let active = true;
    if (!source) return undefined;
    setTextureUri(resolvedRemoteResourceUri(cacheKey, source) ?? null);
    void cacheRemoteResource(cacheKey, source).then((uri) => { if (active) setTextureUri(uri); }).catch(() => {});
    return () => { active = false; };
  }, [cacheKey, source]);
  return <ProceduralStickerPreview sticker={sticker} size={size} textureUri={source ? textureUri : undefined} />;
};

const styles = StyleSheet.create({
  packPreview: { alignContent: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, height: 99, justifyContent: 'center', width: 76 },
  packSwatch: { alignItems: 'center', borderColor: '#E8E4DE', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, elevation: 2, height: 46, justifyContent: 'center', overflow: 'hidden', shadowColor: '#665F56', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.12, shadowRadius: 3, width: 34 },
  itemPreview: { alignItems: 'center', height: '100%', justifyContent: 'center', width: '100%' },
  paper: { alignItems: 'center', borderColor: '#E8E4DE', borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, elevation: 3, height: 84, justifyContent: 'center', overflow: 'hidden', shadowColor: '#665F56', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.18, shadowRadius: 5, width: 64 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', height: '100%', width: '100%' },
  gridCell: { borderColor: '#D8D3CB', borderWidth: StyleSheet.hairlineWidth, height: '33.333%', width: '33.333%' },
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'space-around', padding: 7 },
  gridDot: { backgroundColor: '#8D8981', borderRadius: 99, height: 2, opacity: 0.35, width: 2 },
  lines: { height: '100%', justifyContent: 'space-around', width: '100%' },
  line: { backgroundColor: '#8D8981', height: StyleSheet.hairlineWidth, opacity: 0.2, width: '100%' },
});
