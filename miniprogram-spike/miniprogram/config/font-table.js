// Update font URLs here when signed CloudBase links change.
// Keep id stable because drafts store fontId.
const fontTable = [
  {
    id: "little_kids",
    label: "Little Kids",
    previewText: "Little Kids",
    family: "JournalLittleKids",
    url: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/LittleKidsHandwriting-Regular.otf?sign=1d2c2cab88faa475fee24f2b412dfe38&t=1784103265",
    fallback: "Kaiti SC, STKaiti, cursive"
  },
  {
    id: "gemini",
    label: "Gemini",
    previewText: "Gemini",
    family: "JournalGemini",
    url: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/Gemini-Regular.otf?sign=e11ffcd12eb0b640e63978f301a96b63&t=1784103237",
    fallback: "serif"
  },
  {
    id: "kelsi",
    label: "Kelsi",
    previewText: "Kelsi",
    family: "JournalKelsi",
    url: "https://636c-cloudbase-d6g4f30s2b2a1c042-1453943164.tcb.qcloud.la/Kelsi-Regular.otf?sign=056d5e07f290930692d0932540ef704f&t=1784103254",
    fallback: "sans-serif"
  }
];

module.exports = {
  fontTable
};
