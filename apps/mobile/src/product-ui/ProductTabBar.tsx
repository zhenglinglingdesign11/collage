import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveProductAsset, type ProductAssetId } from './assets';
import { t, type ProductLocale } from './localization';
import { productColor, productSpace, productTabMetrics } from './tokens';

export type ProductTab = 'create' | 'assets' | 'mine';

const tabDefinition: Readonly<Record<ProductTab, Readonly<{ label: Parameters<typeof t>[1]; icon: ProductAssetId; selectedIcon: ProductAssetId }>>> = {
  create: { label: 'tab.create', icon: 'asset://ui/tabbar/create/default', selectedIcon: 'asset://ui/tabbar/create/selected' },
  assets: { label: 'tab.assets', icon: 'asset://ui/tabbar/assets/default', selectedIcon: 'asset://ui/tabbar/assets/selected' },
  mine: { label: 'tab.mine', icon: 'asset://ui/tabbar/mine/default', selectedIcon: 'asset://ui/tabbar/mine/selected' },
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
          <Image accessibilityIgnoresInvertColors source={resolveProductAsset(selected ? definition.selectedIcon : definition.icon)} style={styles.icon} />
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
  icon: {
    height: productTabMetrics.iconSize,
    marginBottom: productTabMetrics.labelGap,
    width: productTabMetrics.iconSize,
  },
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
