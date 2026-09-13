/**
 * Shared, product-owned color families. Tools consume named palettes instead
 * of carrying their own divergent swatch arrays in view code.
 */
export type ProductColorTarget = 'paper.background' | 'polka.background' | 'polka.foreground' | 'shape.fill' | 'shape.stroke' | 'brush.stroke';

export const productColorOptions: Readonly<Record<ProductColorTarget, readonly string[]>> = {
  'paper.background': ['#FFFAF2', '#ECEFF3', '#F6EAD8', '#EFE2CB', '#D8D1C5', '#FFF2B8', '#FFD9BF', '#F9ECE0', '#F8E7E4', '#F4B8C4', '#F2D9DF', '#EADCF8', '#F0E7F3', '#DFE8FF', '#E8F1FB', '#D7F0ED', '#E1F0E8', '#DFEEDD', '#C8D7CC', '#B8D8D6'],
  'polka.background': ['transparent', '#FFFFFF', '#FDF7EC', '#F7F7F5', '#F9ECE0', '#F5DFD8', '#F0E7F3', '#EAF1F6', '#E8F1FB', '#E1F0E8', '#D7DBC9'],
  'polka.foreground': ['#111111', '#FFFFFF', '#B79B75', '#FFF08A', '#B8D83D', '#F16A3A', '#D94A38', '#B45D79', '#FF9FB7', '#5F806F', '#58A88A', '#86CDBB', '#8FE3CF', '#6D9BC3', '#A9D8FF', '#C9B7FF', '#3A2038'],
  'shape.fill': ['transparent', '#ffffff', '#f2dfc6', '#d7c1a7', '#fff2b8', '#ffd9bf', '#f4b8c4', '#f7c8df', '#F16A3A', '#FF8FBA', '#cfe6bf', '#B8D83D', '#d7f0ed', '#bfe8db', '#58A88A', '#dfe8ff', '#b9d7ff', '#9EC5E8', '#eadcf8', '#B9A4F5', '#3A2038', '#111111'],
  'shape.stroke': ['', '#ffffff', '#111111', '#c79a62', '#7C9C19', '#D95328', '#d94a38', '#b45d79', '#5f806f', '#3F8F73', '#86cdbb', '#6d9bc3', '#4C80B8', '#8b79bd', '#3A2038'],
  // Decorative marks use the existing detail/sticker palette, with a compact
  // ordered subset that stays legible against paper and photographs.
  'brush.stroke': ['#111111', '#FFFFFF', '#4A4A4A', '#BA786D', '#B79B75', '#FFF08A', '#E9D28A', '#B8D83D', '#F16A3A', '#D94A38', '#B45D79', '#FF9FB7', '#5F806F', '#58A88A', '#86CDBB', '#6D9BC3', '#A9D8FF', '#C9B7FF', '#3A2038'],
};

export const colorsFor = (target: ProductColorTarget): readonly string[] => productColorOptions[target];
