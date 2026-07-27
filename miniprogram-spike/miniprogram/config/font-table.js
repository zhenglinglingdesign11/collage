// Keep id stable because drafts store fontId.
const FONT_BASE_URL = "https://assets.zllarchi.site/fonts";

const fontTable = [
  {
    id: "codystar_regular",
    groupId: "codystar",
    label: "Codystar",
    variantLabel: "常规",
    previewText: "Star",
    family: "JournalCodystarRegular",
    fileName: "Codystar-Regular.ttf",
    fallback: "sans-serif"
  },
  {
    id: "codystar_light",
    groupId: "codystar",
    label: "Codystar",
    variantLabel: "细体",
    previewText: "Star",
    family: "JournalCodystarLight",
    fileName: "Codystar-Light.ttf",
    fallback: "sans-serif"
  },
  {
    id: "gemini_regular",
    groupId: "gemini",
    label: "Gemini",
    variantLabel: "常规",
    previewText: "Gemini",
    family: "JournalGemini",
    fileName: "Gemini-Regular.otf",
    fallback: "serif"
  },
  {
    id: "kelsi_regular",
    groupId: "kelsi",
    label: "Kelsi",
    variantLabel: "常规",
    previewText: "Kelsi",
    family: "JournalKelsiRegular",
    fileName: "Kelsi-Regular.otf",
    fallback: "sans-serif"
  },
  {
    id: "kelsi_fill",
    groupId: "kelsi",
    label: "Kelsi",
    variantLabel: "填充",
    previewText: "Kelsi",
    family: "JournalKelsiFill",
    fileName: "Kelsi-fill.otf",
    fallback: "sans-serif"
  },
  {
    id: "little_kids",
    groupId: "little_kids",
    label: "Little Kids",
    variantLabel: "常规",
    previewText: "Little Kids",
    family: "JournalLittleKids",
    fileName: "LittleKidsHandwriting-Regular.otf",
    fallback: "Kaiti SC, STKaiti, cursive"
  },
  {
    id: "melted_ideas",
    groupId: "melted_ideas",
    label: "Melted Ideas",
    variantLabel: "常规",
    previewText: "Melted Ideas",
    family: "JournalMeltedIdeas",
    fileName: "Melted Ideas.otf",
    fallback: "sans-serif"
  },
  {
    id: "mountains_christmas_regular",
    groupId: "mountains_christmas",
    label: "Mountains",
    variantLabel: "常规",
    previewText: "Mountains",
    family: "JournalMountainsChristmasRegular",
    fileName: "MountainsofChristmas-Regular.ttf",
    fallback: "serif"
  },
  {
    id: "mountains_christmas_bold",
    groupId: "mountains_christmas",
    label: "Mountains",
    variantLabel: "加粗",
    previewText: "Mountains",
    family: "JournalMountainsChristmasBold",
    fileName: "MountainsofChristmas-Bold.ttf",
    fallback: "serif"
  },
  {
    id: "sweet_dreams",
    groupId: "sweet_dreams",
    label: "Sweet Dreams",
    variantLabel: "常规",
    previewText: "Sweet Dreams",
    family: "JournalSweetDreams",
    fileName: "Sweet Dreams.ttf",
    fallback: "cursive"
  }
].map((font) => ({
  ...font,
  url: `${FONT_BASE_URL}/${encodeURIComponent(font.fileName)}`
}));

module.exports = {
  fontTable
};
