const colors = {
  ink: "#111111",
  textSecondary: "#6f6f6f",
  page: "#fafaf8",
  panel: "#ffffff",
  weakSurface: "#f7f7f5",
  canvas: "#fdfdfb",
  borderLight: "#e8e6e1",
  tapeYellow: "#e9d28a",
  paperBeige: "#efe7d8",
  sageTape: "#8c9a8d",
  stampRed: "#d94a38"
};

const typography = {
  pageTitle: { size: 24, lineHeight: 32, weight: 600 },
  sectionTitle: { size: 16, lineHeight: 24, weight: 600 },
  bodyStrong: { size: 14, lineHeight: 20, weight: 600 },
  body: { size: 13, lineHeight: 20, weight: 400 },
  caption: { size: 12, lineHeight: 17, weight: 400 },
  tiny: { size: 10, lineHeight: 14, weight: 500 }
};

const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32
};

const radii = {
  small: 6,
  medium: 8,
  large: 12,
  panel: 18,
  toolbar: 24
};

const shadows = {
  light: "0 2px 8px rgba(17, 17, 17, 0.06)",
  panel: "0 8px 24px rgba(17, 17, 17, 0.08)",
  toolbar: "0 8px 28px rgba(17, 17, 17, 0.10)",
  paper: "0 6px 18px rgba(17, 17, 17, 0.10)",
  floatingLayer: "0 10px 28px rgba(17, 17, 17, 0.14)"
};

module.exports = {
  colors,
  typography,
  spacing,
  radii,
  shadows
};
