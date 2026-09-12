import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductTabBar, type ProductTab } from './ProductTabBar';
import { type ProductLocale } from './localization';
import { productColor } from './tokens';

export const ProductAppShell = ({ activeTab, children, hideTabBar = false, locale, onTabChange }: Readonly<{
  activeTab: ProductTab;
  children: ReactNode;
  hideTabBar?: boolean;
  locale: ProductLocale;
  onTabChange: (tab: ProductTab) => void;
}>) => (
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
  <ProductAppShellContent activeTab={activeTab} hideTabBar={hideTabBar} locale={locale} onTabChange={onTabChange}>
      {children}
    </ProductAppShellContent>
  </SafeAreaProvider>
);

const ProductAppShellContent = ({ activeTab, children, hideTabBar, locale, onTabChange }: Readonly<{
  activeTab: ProductTab;
  children: ReactNode;
  hideTabBar: boolean;
  locale: ProductLocale;
  onTabChange: (tab: ProductTab) => void;
}>) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={[styles.page, { paddingTop: insets.top }]}>{children}</View>
      {!hideTabBar && <ProductTabBar activeTab={activeTab} bottomInset={insets.bottom} locale={locale} onChange={onTabChange} />}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: productColor.page, flex: 1 },
  page: { flex: 1 },
});
