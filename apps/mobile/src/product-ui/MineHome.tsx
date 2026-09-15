import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { clearDownloadCache, getDownloadCacheSummary, loadSavedDrafts, type DownloadCacheSummary, type SavedDraft } from '../localWorkspace';
import { RecentDraftArtwork } from './CreateHome';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace } from './tokens';

const formatBytes = (bytes: number): string => bytes < 1024 * 1024
  ? `${Math.max(0, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const MineHome = ({ locale, onOpenDraft }: Readonly<{ locale: ProductLocale; onOpenDraft: (id: string) => void }>) => {
  const [drafts, setDrafts] = useState<readonly SavedDraft[] | null>(null);
  const [cache, setCache] = useState<DownloadCacheSummary | null>(null);
  const [clearing, setClearing] = useState(false);
  const refresh = useCallback(() => {
    void loadSavedDrafts().then(setDrafts).catch(() => setDrafts([]));
    void getDownloadCacheSummary().then(setCache).catch(() => setCache({ bytes: 0, files: 0 }));
  }, []);
  useEffect(refresh, [refresh]);
  const requestClear = () => Alert.alert(t(locale, 'mine.clearCacheConfirmTitle'), t(locale, 'mine.clearCacheConfirmBody'), [
    { text: t(locale, 'editor.source.cancel'), style: 'cancel' },
    { text: t(locale, 'mine.clearCacheAction'), style: 'destructive', onPress: () => {
      setClearing(true);
      void clearDownloadCache().then(() => setCache({ bytes: 0, files: 0 })).finally(() => setClearing(false));
    } },
  ]);
  return <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.title}>{t(locale, 'mine.title')}</Text>
    <Text style={styles.sectionTitle}>{t(locale, 'mine.recentDrafts')}</Text>
    {drafts === null ? <View style={styles.loadingRow}>{[0, 1, 2].map((id) => <View key={id} style={styles.loadingCard} />)}</View>
      : drafts.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>{t(locale, 'mine.noDrafts')}</Text></View>
      : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.draftTrack}>
        {drafts.map((saved) => <Pressable key={saved.id} accessibilityRole="button" accessibilityLabel={t(locale, 'mine.recentDrafts')} onPress={() => onOpenDraft(saved.id)} style={styles.draftCard}>
          <RecentDraftArtwork laceFrameUris={{}} workspace={saved.workspace} />
        </Pressable>)}
      </ScrollView>}
    <Text style={styles.sectionTitle}>{t(locale, 'mine.clearCache')}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t(locale, 'mine.clearCache')} disabled={clearing} onPress={requestClear} style={[styles.setting, clearing && styles.settingDisabled]}>
      <View style={styles.settingCopy}><Text style={styles.settingTitle}>{t(locale, 'mine.clearCache')}</Text><Text style={styles.settingDetail}>{t(locale, 'mine.clearCacheDetail')}</Text></View>
      <Text style={styles.cacheSize}>{cache ? formatBytes(cache.bytes) : '...'}</Text>
    </Pressable>
    <Text style={styles.sectionTitle}>{t(locale, 'mine.support')}</Text>
    <View accessibilityLabel={t(locale, 'mine.support')} style={styles.setting}>
      <View style={styles.settingCopy}><Text style={styles.settingTitle}>{t(locale, 'mine.support')}</Text><Text style={styles.settingDetail}>{t(locale, 'mine.supportDetail')}</Text></View>
    </View>
  </ScrollView>;
};

const styles = StyleSheet.create({
  content: { paddingBottom: 28, paddingHorizontal: productSpace.page, paddingTop: 18 },
  title: { color: productColor.ink, fontSize: 22, fontWeight: '600', lineHeight: 28, marginBottom: 24 },
  sectionTitle: { color: productColor.ink, fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 12, marginTop: 20 },
  draftTrack: { gap: 12, paddingRight: productSpace.page },
  draftCard: { backgroundColor: productColor.surface, borderRadius: 7, height: 118, overflow: 'hidden', padding: 4, shadowColor: productColor.ink, shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.06, shadowRadius: 8, width: 94 },
  empty: { alignItems: 'center', backgroundColor: '#F5F4F0', borderRadius: 12, height: 118, justifyContent: 'center' },
  emptyText: { color: productColor.secondaryText, fontSize: 13 },
  loadingRow: { flexDirection: 'row', gap: 12 },
  loadingCard: { backgroundColor: '#F1F0EC', borderRadius: 7, height: 118, width: 94 },
  setting: { alignItems: 'center', backgroundColor: productColor.surface, borderColor: productColor.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, minHeight: 96, padding: 16 },
  settingDisabled: { opacity: 0.55 },
  settingCopy: { flex: 1 },
  settingTitle: { color: productColor.ink, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  settingDetail: { color: productColor.secondaryText, fontSize: 12, lineHeight: 18, marginTop: 5 },
  cacheSize: { color: productColor.secondaryText, fontSize: 12, fontVariant: ['tabular-nums'] },
});
