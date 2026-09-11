import type { ImageSourcePropType } from 'react-native';

/**
 * The catalog exposes stable IDs. Expo-specific `require` resolution stays in
 * the mobile product layer, so neither editor-core nor asset-system imports RN.
 */
export type ProductAssetId =
  | 'asset://ui/tabbar/create/default'
  | 'asset://ui/tabbar/create/selected'
  | 'asset://ui/tabbar/assets/default'
  | 'asset://ui/tabbar/assets/selected'
  | 'asset://ui/tabbar/mine/default'
  | 'asset://ui/tabbar/mine/selected'
  | 'asset://ui/home/showcase/paper-sheet'
  | 'asset://ui/home/showcase/pack-one'
  | 'asset://ui/home/showcase/pack-seven'
  | 'asset://ui/home/showcase/pack-twenty-four'
  | 'asset://ui/editor/tool/image'
  | 'asset://ui/editor/tool/material'
  | 'asset://ui/editor/tool/background'
  | 'asset://ui/editor/tool/text'
  | 'asset://ui/editor/tool/scissors'
  | 'asset://ui/editor/tool/emboss'
  | 'asset://ui/editor/tool/brush'
  | 'asset://ui/editor/layer/move-up'
  | 'asset://ui/editor/layer/move-down'
  | 'asset://ui/editor/layer/delete'
  | 'asset://ui/editor/layer/lock'
  | 'asset://ui/editor/layer/unlock'
  | 'asset://ui/editor/layer/replace';

const assets: Readonly<Record<ProductAssetId, ImageSourcePropType>> = {
  'asset://ui/tabbar/create/default': require('../../assets/product/tabbar/tab-create.png'),
  'asset://ui/tabbar/create/selected': require('../../assets/product/tabbar/tab-create-active.png'),
  'asset://ui/tabbar/assets/default': require('../../assets/product/tabbar/tab-assets.png'),
  'asset://ui/tabbar/assets/selected': require('../../assets/product/tabbar/tab-assets-active.png'),
  'asset://ui/tabbar/mine/default': require('../../assets/product/tabbar/tab-mine.png'),
  'asset://ui/tabbar/mine/selected': require('../../assets/product/tabbar/tab-mine-active.png'),
  'asset://ui/home/showcase/paper-sheet': require('../../assets/product/home/pack-sheet.jpg'),
  'asset://ui/home/showcase/pack-one': require('../../assets/product/home/pack-1.png'),
  'asset://ui/home/showcase/pack-seven': require('../../assets/product/home/pack-7.png'),
  'asset://ui/home/showcase/pack-twenty-four': require('../../assets/product/home/pack-24.png'),
  'asset://ui/editor/tool/image': require('../../assets/product/editor-tools/image.png'),
  'asset://ui/editor/tool/material': require('../../assets/product/editor-tools/material.png'),
  'asset://ui/editor/tool/background': require('../../assets/product/editor-tools/background.png'),
  'asset://ui/editor/tool/text': require('../../assets/product/editor-tools/text.png'),
  'asset://ui/editor/tool/scissors': require('../../assets/product/editor-tools/scissors.png'),
  'asset://ui/editor/tool/emboss': require('../../assets/product/editor-tools/emboss.png'),
  'asset://ui/editor/tool/brush': require('../../assets/product/editor-tools/brush.png'),
  'asset://ui/editor/layer/move-up': require('../../assets/product/layer-actions/move-up.png'),
  'asset://ui/editor/layer/move-down': require('../../assets/product/layer-actions/move-down.png'),
  'asset://ui/editor/layer/delete': require('../../assets/product/layer-actions/delete.png'),
  'asset://ui/editor/layer/lock': require('../../assets/product/layer-actions/lock-outline.png'),
  'asset://ui/editor/layer/unlock': require('../../assets/product/layer-actions/unlock-outline.png'),
  'asset://ui/editor/layer/replace': require('../../assets/product/layer-actions/replace.png'),
};

export const resolveProductAsset = (id: ProductAssetId): ImageSourcePropType => assets[id];
