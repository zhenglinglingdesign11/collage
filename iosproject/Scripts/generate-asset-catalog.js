const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const packsModule = path.join(repoRoot, "miniprogram-spike", "miniprogram", "config", "assets", "packs");
const { imagePackDefinitions } = require(packsModule);

function itemTypeForCategory(category) {
  if (category === "胶带") return "tape";
  if (category === "纸张") return "paper";
  return "sticker";
}

function itemId(packId, fileName) {
  return `${packId}-${String(fileName)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

const packs = imagePackDefinitions.map((pack) => ({
  id: pack.id,
  name: pack.name,
  category: pack.category,
  tone: pack.tone,
  cover: `packs/${pack.id}/${pack.cover}`,
  version: 1,
  items: pack.items.map((item) => ({
    id: itemId(pack.id, item[0]),
    type: itemTypeForCategory(pack.category),
    name: item[3] || `${pack.name} ${String(item[0]).replace(/\.[^.]+$/, "")}`,
    source: `packs/${pack.id}/items/${item[0]}`,
    width: item[1],
    height: item[2]
  }))
}));

const catalog = {
  schemaVersion: 1,
  generatedFrom: "miniprogram-spike/miniprogram/config/assets/packs",
  packs
};

const outPath = path.join(
  repoRoot,
  "iosproject",
  "JournalCollage",
  "Resources",
  "AssetPacks",
  "asset-packs.json"
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${packs.length} packs to ${path.relative(repoRoot, outPath)}`);
