const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const localizationRoot = path.join(root, "JournalCollage", "Resources", "Localization");
const enPath = path.join(localizationRoot, "en.lproj", "Localizable.strings");
const zhPath = path.join(localizationRoot, "zh-Hans.lproj", "Localizable.strings");
const swiftRoot = path.join(root, "JournalCollage");

function readStrings(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const entries = {};
  const pattern = /^\s*"([^"]+)"\s*=\s*"((?:\\"|[^"])*)";/gm;
  let match;
  while ((match = pattern.exec(content))) {
    entries[match[1]] = match[2].replace(/\\"/g, '"');
  }
  return entries;
}

function maxLengthForKey(key) {
  if (key.startsWith("tab.")) return 10;
  if (key.includes(".toolbar.")) return 10;
  if (key.endsWith(".button")) return 16;
  if (key.startsWith("layer.action.")) return 12;
  if (key.includes(".category.")) return 16;
  if (key.endsWith(".title")) return 28;
  if (key.includes(".status.")) return 24;
  return null;
}

function fail(message) {
  throw new Error(message);
}

function walkFiles(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

for (const filePath of [enPath, zhPath]) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing localization file: ${path.relative(root, filePath)}`);
  }
}

const en = readStrings(enPath);
const zh = readStrings(zhPath);
const enKeys = Object.keys(en).sort();
const zhKeys = Object.keys(zh).sort();

const missingInZh = enKeys.filter((key) => !zhKeys.includes(key));
const missingInEn = zhKeys.filter((key) => !enKeys.includes(key));
if (missingInZh.length) fail(`Missing zh-Hans keys: ${missingInZh.join(", ")}`);
if (missingInEn.length) fail(`Missing en keys: ${missingInEn.join(", ")}`);

for (const key of enKeys) {
  const limit = maxLengthForKey(key);
  if (limit && en[key].length > limit) {
    fail(`English localization too long for ${key}: "${en[key]}" (${en[key].length}/${limit})`);
  }
}

const hardcodedChinese = [];
for (const filePath of walkFiles(swiftRoot, (candidate) => candidate.endsWith(".swift"))) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = /[\u4e00-\u9fff]/.exec(content);
  if (match) {
    hardcodedChinese.push(`${path.relative(root, filePath)}:${lineNumberAt(content, match.index)}`);
  }
}
if (hardcodedChinese.length) {
  fail(`Hardcoded Chinese found in Swift files:\n${hardcodedChinese.join("\n")}`);
}

console.log(`Localization ok: ${enKeys.length} keys, en + zh-Hans, no hardcoded Chinese in Swift`);
