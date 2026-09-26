import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import type { DenialReason, FeatureKey } from '../entitlements';
import type { ProductLocale } from './localization';
import { productColor } from './tokens';

const names: Partial<Record<FeatureKey, { en: string; zh: string }>> = {
  'template.premium': { en: 'Premium templates', zh: '付费模板' },
  'material.premium': { en: 'Premium materials', zh: '付费素材' },
  'font.premium': { en: 'Premium fonts', zh: '付费字体' },
  'effect.premium': { en: 'Premium effects', zh: '付费效果' },
  'brush.premium': { en: 'Premium brushes', zh: '付费画笔' },
};

/** P2 preview uses only a fake service. It has no price, package, or store action. */
export const PaywallPreview = ({ busy, feature, locale, message, onClose, onRestore, onSimulatePurchase, reason }: Readonly<{
  busy: boolean;
  feature: FeatureKey;
  locale: ProductLocale;
  message?: string;
  onClose: () => void;
  onRestore: () => void;
  onSimulatePurchase: () => void;
  reason: DenialReason;
}>) => {
  const zh = locale === 'zh-Hans';
  const name = names[feature]?.[zh ? 'zh' : 'en'] ?? (zh ? '付费创作能力' : 'Premium creative tools');
  return <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.screen}><SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
    <Pressable accessibilityLabel={zh ? '关闭权益预览' : 'Close entitlement preview'} accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeGlyph}>×</Text></Pressable>
    <View style={styles.content}>
      <Text style={styles.kicker}>{zh ? 'P2 权益预览' : 'P2 ENTITLEMENT PREVIEW'}</Text>
      <Text style={styles.title}>{zh ? '继续使用' : 'Continue with'}{zh ? name : ` ${name}`}</Text>
      <Text style={styles.description}>{zh ? '完整模板与素材库让拼贴创作更自由。此页仅用于验证权益判断与返回流程。' : 'Explore the full template and material library. This screen checks the entitlement flow.'}</Text>
      <View style={styles.benefits}>
        <Text style={styles.benefit}>✦ {zh ? '更多模板与精选素材' : 'More templates and curated materials'}</Text>
        <Text style={styles.benefit}>✦ {zh ? '字体、效果与画笔' : 'Fonts, effects and brushes'}</Text>
      </View>
      <Text style={styles.context}>{reason === 'expired' ? (zh ? '当前权益已过期' : 'Your Premium access has expired') : (zh ? '此入口需要 Premium' : 'This feature requires Premium')}</Text>
      {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
    </View>
    <View style={styles.actions}>
      {__DEV__ && <Pressable accessibilityRole="button" disabled={busy} onPress={onSimulatePurchase} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{zh ? '模拟开通 Premium' : 'Simulate Premium access'}</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={onRestore} style={styles.secondary}><Text style={styles.secondaryText}>{zh ? '模拟恢复购买' : 'Simulate restore'}</Text></Pressable>
      <Text style={styles.note}>{zh ? '开发测试界面：不会发起真实付款' : 'Development preview: no payment is started'}</Text>
    </View>
  </SafeAreaView></SafeAreaProvider>;
};

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: '#FAF7F1', justifyContent: 'space-between', zIndex: 30 },
  safe: { flex: 1, justifyContent: 'space-between' },
  close: { alignItems: 'center', alignSelf: 'flex-end', height: 48, justifyContent: 'center', marginRight: 18, width: 48 },
  closeGlyph: { color: productColor.ink, fontSize: 32, fontWeight: '300' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 30 },
  kicker: { color: '#8C6A70', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 16 },
  title: { color: productColor.ink, fontSize: 35, fontWeight: '700', lineHeight: 42, marginBottom: 14 },
  description: { color: productColor.secondaryText, fontSize: 16, lineHeight: 24 },
  benefits: { backgroundColor: '#FFFFFF', borderRadius: 18, gap: 16, marginTop: 36, padding: 22 },
  benefit: { color: productColor.ink, fontSize: 15, fontWeight: '600' },
  context: { color: '#8C6A70', fontSize: 13, marginTop: 22 },
  message: { color: productColor.ink, fontSize: 13, marginTop: 12 },
  actions: { paddingBottom: 18, paddingHorizontal: 24 },
  primary: { alignItems: 'center', backgroundColor: productColor.ink, borderRadius: 14, height: 54, justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondary: { alignItems: 'center', height: 48, justifyContent: 'center' },
  secondaryText: { color: productColor.ink, fontSize: 14, fontWeight: '600' },
  note: { color: productColor.secondaryText, fontSize: 11, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
