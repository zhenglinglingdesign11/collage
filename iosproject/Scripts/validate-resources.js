const fs = require("fs");
const path = require("path");

const iosRoot = path.resolve(__dirname, "..");
const assetRoot = path.join(iosRoot, "JournalCollage", "Resources", "AssetPacks");
const catalogPath = path.join(assetRoot, "asset-packs.json");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const required = catalog.packs.flatMap((pack) => [
  pack.cover,
  ...pack.items.map((item) => item.source)
]);

const missing = required.filter((relativePath) => !fs.existsSync(path.join(assetRoot, relativePath)));

if (missing.length) {
  console.error(`Missing ${missing.length} asset files:`);
  missing.slice(0, 50).forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`Asset resources ok: ${catalog.packs.length} packs, ${required.length} files`);
