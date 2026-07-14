const SYSTEM_FONT_ID = "system";

const textFonts = [
  {
    id: SYSTEM_FONT_ID,
    label: "系统",
    previewText: "System",
    family: "PingFang SC",
    source: "",
    fallback: "PingFang SC, sans-serif",
    packaged: false
  },
  {
    id: "little_kids",
    label: "Little Kids",
    previewText: "Little Kids",
    family: "JournalLittleKids",
    remoteSource: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/LittleKidsHandwriting-Regular.otf?sign=cd1144506dc2d08a6d213b75ac3aec65&t=1784032227",
    fallback: "Kaiti SC, STKaiti, cursive",
    packaged: true
  },
  {
    id: "gemini",
    label: "Gemini",
    previewText: "Gemini",
    family: "JournalGemini",
    remoteSource: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/Gemini-Regular.otf?sign=f2e6d46143f00cef689921be9559fd8b&t=1784032166",
    fallback: "serif",
    packaged: true
  },
  {
    id: "kelsi",
    label: "Kelsi",
    previewText: "Kelsi",
    family: "JournalKelsi",
    remoteSource: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/Kelsi-Regular.otf?sign=05b6961d76e1fc42f9d6ed8cb218afc5&t=1784032219",
    fallback: "sans-serif",
    packaged: true
  }
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
