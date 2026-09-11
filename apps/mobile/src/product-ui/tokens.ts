/**
 * Product-facing visual tokens. These are deliberately separate from editor
 * rendering tokens: changing an app surface must never alter a Draft export.
 */
export const productColor = {
  ink: '#111111',
  secondaryText: '#6F6F6F',
  tertiaryText: '#9A9A9A',
  page: '#FAFAF8',
  surface: '#FFFFFF',
  weakSurface: '#F7F7F5',
  border: '#E8E6E1',
  divider: '#ECEAE5',
} as const;

export const productSpace = {
  page: 20,
  tabHorizontal: 11,
  tabTop: 4,
} as const;

/** Measurements converted from the source mini-program custom tab bar. */
export const productTabMetrics = {
  contentHeight: 56,
  itemHeight: 48,
  iconSize: 23,
  labelSize: 12,
  labelLineHeight: 16,
  labelGap: 2,
} as const;
