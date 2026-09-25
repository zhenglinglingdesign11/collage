import { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';
import type { ProductLocale } from './localization';
import { BreathingSkeleton } from './BreathingSkeleton';
import { showCenterToast } from './CenterToast';

/** Loading, failure, and retry UI shared by display-only network image cards. */
export const RemoteImageCard = ({ active = true, fallbackSource, locale = 'en', onReadyChange, onRetry, source, style }: Readonly<{
  active?: boolean;
  fallbackSource?: string;
  locale?: ProductLocale;
  onReadyChange?: (ready: boolean) => void;
  onRetry?: () => void;
  source: ImageSourcePropType | null;
  style: StyleProp<ImageStyle>;
}>) => {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<View>(null);
  const autoRetryCount = useRef(0);
  const manualRetryPending = useRef(false);
  const { resizeMode, ...containerStyle } = StyleSheet.flatten(style) ?? {};
  const sourceIdentity = typeof source === 'number' ? String(source) : source && !Array.isArray(source) && 'uri' in source ? source.uri : String(source);
  useEffect(() => { autoRetryCount.current = 0; setFailed(false); setLoading(true); setUsingFallback(false); }, [sourceIdentity, fallbackSource]);
  const currentSource = usingFallback && fallbackSource ? { uri: fallbackSource } : source;
  const retry = () => {
    setFailed(false);
    setLoading(true);
    setUsingFallback(false);
    setAttempt((value) => value + 1);
    onReadyChange?.(false);
    onRetry?.();
  };
  useEffect(() => {
    if (!failed || !active) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!mounted) return;
        if (AppState.currentState !== 'active') { schedule(); return; }
        containerRef.current?.measureInWindow((x, y, width, height) => {
          if (!mounted) return;
          const window = Dimensions.get('window');
          if (width > 0 && height > 0 && x < window.width && x + width > 0 && y < window.height && y + height > 0) {
            autoRetryCount.current += 1;
            retry();
          } else schedule();
        });
      }, Math.min(30_000, 5_000 * 2 ** autoRetryCount.current));
    };
    schedule();
    return () => { mounted = false; clearTimeout(timer); };
  }, [active, failed, sourceIdentity]);
  const retryLabel = locale === 'zh-Hans' ? '重试' : 'Retry';
  const failedLabel = locale === 'zh-Hans' ? '图片加载失败，点按重试' : 'Image unavailable, tap to retry';
  const showFailedRetryBubble = () => {
    if (!manualRetryPending.current) return;
    manualRetryPending.current = false;
    showCenterToast(locale === 'zh-Hans' ? '仍无法加载，请检查网络' : 'Still unavailable. Check your connection.');
  };
  return <View ref={containerRef} style={[containerStyle, styles.container]}>
    {currentSource !== null && !failed && (active || !loading) && <Image key={`${attempt}-${usingFallback}`} source={currentSource} style={StyleSheet.absoluteFill} resizeMode={resizeMode ?? 'cover'} onLoad={() => { manualRetryPending.current = false; autoRetryCount.current = 0; setLoading(false); setFailed(false); onReadyChange?.(true); }} onError={() => {
      if (!usingFallback && fallbackSource) { setUsingFallback(true); setLoading(true); }
      else { setLoading(false); setFailed(true); onReadyChange?.(false); showFailedRetryBubble(); }
    }} />}
    {loading && !failed && <BreathingSkeleton style={styles.status} />}
    {failed && <Pressable accessibilityRole="button" accessibilityLabel={failedLabel} onPress={(event) => { event.stopPropagation(); manualRetryPending.current = true; retry(); }} style={styles.status}>
      <Text style={styles.failureMark}>↻</Text><Text style={styles.failureText}>{retryLabel}</Text>
    </Pressable>}
  </View>;
};

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  status: { alignItems: 'center', backgroundColor: '#F3F1EC', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  failureMark: { color: '#77736D', fontSize: 21, lineHeight: 25 },
  failureText: { color: '#77736D', fontSize: 10, lineHeight: 14, textAlign: 'center' },
});
