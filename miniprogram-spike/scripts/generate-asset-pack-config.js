#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const packsRoot = path.join(workspaceRoot, "source-assets", "packs");
const configRoot = path.join(projectRoot, "miniprogram", "config", "assets", "packs");

const args = parseArgs(process.argv.slice(2));
const imageExtensions = new Set([".png", ".jpg", ".jpeg"]);

function main() {
  ensureDirectory(configRoot);
  if (!fs.existsSync(packsRoot)) {
    console.log(`No source asset packs directory found: ${path.relative(workspaceRoot, packsRoot)}`);
    console.log("Create source-assets/packs/<pack-id>/items and put remote assets there.");
    return;
  }
  const packIds = args.pack
    ? [args.pack]
    : fs.readdirSync(packsRoot).filter((name) => fs.statSync(path.join(packsRoot, name)).isDirectory());

  if (!packIds.length) {
    console.log("No asset packs found.");
    return;
  }

  packIds.forEach((packId) => {
    const definition = createPackDefinition(packId);
    const outputPath = path.join(configRoot, `${packId}.js`);
    fs.writeFileSync(outputPath, renderPackModule(definition), "utf8");
    console.log(`Generated ${path.relative(projectRoot, outputPath)} (${definition.items.length} items)`);
  });
}

function createPackDefinition(packId) {
  const packDir = path.join(packsRoot, packId);
  const itemsDir = path.join(packDir, "items");
  if (!fs.existsSync(itemsDir)) {
    throw new Error(`Missing items directory: ${itemsDir}`);
  }

  const files = fs.readdirSync(itemsDir)
    .filter((fileName) => imageExtensions.has(path.extname(fileName).toLowerCase()))
    .sort(naturalCompare);

  return {
    id: packId,
    name: args.name || toDisplayName(packId),
    category: args.category || "贴纸",
    tone: args.tone || "#f5f4f1",
    baseUrl: args.baseUrl || joinRemotePath(args.baseUrlRoot, packId),
    cloudBasePath: args.cloudBasePath || joinRemotePath(args.cloudRoot, packId),
    cover: args.cover || detectCover(packDir),
    items: files.map((fileName) => {
      const size = readImageSize(path.join(itemsDir, fileName));
      return [fileName, size.width, size.height];
    })
  };
}

function detectCover(packDir) {
  const candidates = ["pack-sheet.jpg", "pack-sheet.png", "cover.jpg", "cover.png"];
  return candidates.find((fileName) => fs.existsSync(path.join(packDir, fileName))) || "pack-sheet.jpg";
}

function renderPackModule(definition) {
  const lines = [
    "module.exports = {",
    `  id: ${JSON.stringify(definition.id)},`,
    `  name: ${JSON.stringify(definition.name)},`,
    `  category: ${JSON.stringify(definition.category)},`,
    `  tone: ${JSON.stringify(definition.tone)},`,
    definition.baseUrl ? `  baseUrl: ${JSON.stringify(definition.baseUrl)},` : "",
    definition.cloudBasePath ? `  cloudBasePath: ${JSON.stringify(definition.cloudBasePath)},` : "",
    `  cover: ${JSON.stringify(definition.cover)},`,
    "  items: ["
  ].filter(Boolean);
  definition.items.forEach((item, index) => {
    const suffix = index === definition.items.length - 1 ? "" : ",";
    lines.push(`    [${JSON.stringify(item[0])}, ${item[1]}, ${item[2]}]${suffix}`);
  });
  lines.push("  ]");
  lines.push("};");
  return `${lines.join("\n")}\n`;
}

function readImageSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return readPngSize(buffer, filePath);
  if (ext === ".jpg" || ext === ".jpeg") return readJpegSize(buffer, filePath);
  throw new Error(`Unsupported image type: ${filePath}`);
}

function readPngSize(buffer, filePath) {
  const signature = "89504e470d0a1a0a";
  if (buffer.slice(0, 8).toString("hex") !== signature) {
    throw new Error(`Invalid PNG: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegSize(buffer, filePath) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new Error(`Invalid JPEG marker: ${filePath}`);
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += 2 + length;
  }
  throw new Error(`JPEG size not found: ${filePath}`);
}

function parseArgs(argv) {
  return argv.reduce((result, arg) => {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      result[toCamelCase(match[1])] = match[2];
    }
    return result;
  }, {});
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function toDisplayName(packId) {
  return packId.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function joinRemotePath(root, segment) {
  if (!root) return "";
  return `${trimRight(root, "/")}/${segment}`;
}

function trimRight(value, char) {
  let result = String(value || "");
  while (result.endsWith(char)) {
    result = result.slice(0, -1);
  }
  return result;
}

main();
