import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { cacheRemoteResource, resolvedRemoteResourceUri } from '../localWorkspace';

/** Disk-backed image surface for remote material covers and thumbnails. */
export const CachedRemoteImage = ({ cacheKey, source, style }: Readonly<{ cacheKey: string; source: string; style: StyleProp<ImageStyle> }>) => {
  const cachedUri = resolvedRemoteResourceUri(cacheKey, source);
  const [uri, setUri] = useState<string | null>(source.startsWith('data:') ? source : cachedUri ?? null);
  useEffect(() => {
    let active = true;
    setUri(source.startsWith('data:') ? source : resolvedRemoteResourceUri(cacheKey, source) ?? null);
    void cacheRemoteResource(cacheKey, source).then((localUri) => { if (active) setUri(localUri); }).catch(() => { if (active) setUri(source); });
    return () => { active = false; };
  }, [cacheKey, source]);
  return uri === null ? <View style={style as StyleProp<ViewStyle>} /> : <Image source={{ uri }} style={style} />;
};
