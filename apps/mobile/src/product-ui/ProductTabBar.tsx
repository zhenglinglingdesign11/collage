import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { resolveProductAsset, type ProductAssetId } from './assets';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace, productTabMetrics } from './tokens';

export type ProductTab = 'create' | 'assets' | 'mine';

const tabDefinition: Readonly<Record<ProductTab, Readonly<{ label: Parameters<typeof t>[1]; icon: ProductAssetId; selectedIcon: ProductAssetId }>>> = {
  create: { label: 'tab.create', icon: 'asset://ui/tabbar/create/default', selectedIcon: 'asset://ui/tabbar/create/selected' },
  assets: { label: 'tab.assets', icon: 'asset://ui/tabbar/assets/default', selectedIcon: 'asset://ui/tabbar/assets/selected' },
  mine: { label: 'tab.mine', icon: 'asset://ui/tabbar/mine/default', selectedIcon: 'asset://ui/tabbar/mine/selected' },
};

const fallbackGlyph: Readonly<Record<ProductTab, string>> = { create: '＋', assets: '▧', mine: '◯' };

const TabIcon = ({ asset, selected, tab }: Readonly<{ asset: ProductAssetId; selected: boolean; tab: ProductTab }>) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!failed) return;
    const retry = setTimeout(() => { setFailed(false); setLoaded(false); setAttempt((current) => current + 1); }, 10000);
    return () => clearTimeout(retry);
  }, [failed]);
  return <View style={styles.iconSlot}>
    {!loaded && <Text style={[styles.iconFallback, selected && styles.iconFallbackSelected]}>{fallbackGlyph[tab]}</Text>}
    {!failed && <Image key={attempt} accessibilityIgnoresInvertColors onError={() => setFailed(true)} onLoad={() => setLoaded(true)} source={resolveProductAsset(asset)} style={[styles.icon, !loaded && styles.iconPending]} />}
  </View>;
};

export const ProductTabBar = ({ activeTab, bottomInset, locale, onChange }: Readonly<{
  activeTab: ProductTab;
  bottomInset: number;
  locale: ProductLocale;
  onChange: (tab: ProductTab) => void;
}>) => (
  <View accessibilityRole="tablist" style={[styles.bar, { height: productTabMetrics.contentHeight + bottomInset, paddingBottom: bottomInset }]}> 
    {(Object.keys(tabDefinition) as ProductTab[]).map((tab) => {
      const selected = tab === activeTab;
      const definition = tabDefinition[tab];
      const label = t(locale, definition.label);
      return (
        <Pressable
          key={tab}
          accessibilityLabel={label}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          hitSlop={8}
          onPress={() => onChange(tab)}
          style={styles.item}
        >
          <TabIcon key={selected ? definition.selectedIcon : definition.icon} asset={selected ? definition.selectedIcon : definition.icon} selected={selected} tab={tab} />
          <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  bar: {
    backgroundColor: productColor.surface,
    borderTopColor: productColor.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: productSpace.tabHorizontal,
    paddingTop: productSpace.tabTop,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    height: productTabMetrics.itemHeight,
    justifyContent: 'center',
  },
  iconSlot: {
    height: productTabMetrics.iconSize,
    marginBottom: productTabMetrics.labelGap,
    width: productTabMetrics.iconSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { height: productTabMetrics.iconSize, position: 'absolute', width: productTabMetrics.iconSize },
  iconPending: { opacity: 0 },
  iconFallback: { color: productColor.secondaryText, fontSize: 22, lineHeight: 25, textAlign: 'center' },
  iconFallbackSelected: { color: productColor.ink },
  label: {
    color: productColor.secondaryText,
    fontSize: productTabMetrics.labelSize,
    fontWeight: '400',
    lineHeight: productTabMetrics.labelLineHeight,
  },
  labelSelected: {
    color: productColor.ink,
    fontWeight: '600',
  },
});
