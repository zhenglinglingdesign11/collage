const SYSTEM_FONT_ID = "system";
const { fontTable } = require("./font-table");

const systemFont = {
  id: SYSTEM_FONT_ID,
  groupId: SYSTEM_FONT_ID,
  label: "系统",
  variantLabel: "常规",
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
  "圆体": "system",
  gemini: "gemini_regular",
  kelsi: "kelsi_regular"
};

function getTextFonts() {
  return textFonts;
}

function getTextFontOptions() {
  const groups = [];
  textFonts
    .filter((font) => font.id === SYSTEM_FONT_ID || !!font.remoteSource || !!font.cloudFileId)
    .forEach((font) => {
      const groupId = font.groupId || font.id;
      if (groups.some((item) => item.groupId === groupId)) return;
      groups.push({
      id: font.id,
      groupId,
      label: font.label,
      previewText: font.previewText || font.label,
      family: font.family
      });
    });
  return groups;
}

function getTextFontVariantOptions(groupId) {
  const font = resolveTextFont(groupId);
  const resolvedGroupId = font.groupId || font.id;
  return textFonts
    .filter((item) => (item.groupId || item.id) === resolvedGroupId)
    .filter((item) => item.id === SYSTEM_FONT_ID || !!item.remoteSource || !!item.cloudFileId)
    .map((item) => ({
      id: item.id,
      label: item.variantLabel || item.label,
      family: item.family
    }));
}

function getDefaultTextFont() {
  return textFonts[0];
}

function getTextFontById(id) {
  return textFonts.find((font) => font.id === id) || textFonts.find((font) => font.groupId === id) || null;
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
    fontGroupId: font.groupId || font.id,
    fontVariantLabel: font.variantLabel || "常规",
    fontLabel: font.label,
    fontFamily: getFontFamily(font),
    canvasFontFamily: getCanvasFontFamily(font)
  };
}

module.exports = {
  SYSTEM_FONT_ID,
  getTextFonts,
  getTextFontOptions,
  getTextFontVariantOptions,
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
