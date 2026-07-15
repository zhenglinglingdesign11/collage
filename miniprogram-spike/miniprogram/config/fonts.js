const SYSTEM_FONT_ID = "system";
const { fontTable } = require("./font-table");

const systemFont = {
  id: SYSTEM_FONT_ID,
  label: "系统",
  previewText: "System",
  family: "PingFang SC",
  source: "",
  fallback: "PingFang SC, sans-serif",
  packaged: false
};

const textFonts = [
  systemFont,
  ...fontTable.map((font) => ({
    ...font,
    remoteSource: font.url || "",
    packaged: !!font.url || !!font.cloudFileId
  }))
];

const legacyFontLabelMap = {
  "系统": "system",
  "手写": "little_kids",
  "打字机": "system",
  "衬线": "system",
  "圆体": "system"
};

function getTextFonts() {
  return textFonts;
}

function getTextFontOptions() {
  return textFonts
    .filter((font) => font.id === SYSTEM_FONT_ID || !!font.remoteSource || !!font.cloudFileId)
    .map((font) => ({
      id: font.id,
      label: font.label,
      previewText: font.previewText || font.label,
      family: font.family
    }));
}

function getDefaultTextFont() {
  return textFonts[0];
}

function getTextFontById(id) {
  return textFonts.find((font) => font.id === id) || null;
}

function getTextFontByLabel(label) {
  const legacyId = legacyFontLabelMap[label];
  if (legacyId) return getTextFontById(legacyId);
  return textFonts.find((font) => font.label === label) || null;
}

function resolveTextFont(value) {
  return getTextFontById(value) || getTextFontByLabel(value) || getDefaultTextFont();
}

function getFontFamily(font) {
  if (!font) return getDefaultTextFont().fallback;
  return font.packaged ? `${font.family}, ${font.fallback}` : font.fallback;
}

function getCanvasFontFamily(font) {
  if (!font) return getDefaultTextFont().fallback;
  return font.packaged ? font.family : font.fallback;
}

function getFontSource(font) {
  if (!font || !font.packaged) return "";
  if (font.remoteSource) return font.remoteSource;
  return "";
}

function getFontCloudFileId(font) {
  if (!font || !font.packaged) return "";
  return font.cloudFileId || "";
}

function createTextFontStyle(value) {
  const font = resolveTextFont(value);
  return {
    fontId: font.id,
    fontLabel: font.label,
    fontFamily: getFontFamily(font),
    canvasFontFamily: getCanvasFontFamily(font)
  };
}

module.exports = {
  SYSTEM_FONT_ID,
  getTextFonts,
  getTextFontOptions,
  getDefaultTextFont,
  getTextFontById,
  getTextFontByLabel,
  resolveTextFont,
  getFontFamily,
  getCanvasFontFamily,
  getFontSource,
  getFontCloudFileId,
  createTextFontStyle
};
