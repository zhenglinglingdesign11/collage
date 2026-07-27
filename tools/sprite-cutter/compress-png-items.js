#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultPacksRoot = path.join(repoRoot, "source-assets", "packs");
const args = parseArgs(process.argv.slice(2));

const config = {
  packsRoot: path.resolve(repoRoot, args.root || defaultPacksRoot),
  pack: args.pack || "",
  engine: args.engine || "auto",
  quality: args.quality || "65-90",
  speed: Number(args.speed || 3),
  oxipngLevel: Number(args.oxipngLevel || 4),
  sharpQuality: Number(args.sharpQuality || 82),
  jpgQuality: Number(args.jpgQuality || 82),
  jpgMaxWidth: Number(args.jpgMaxWidth || 512),
  jpgMaxHeight: args.jpgMaxHeight ? Number(args.jpgMaxHeight) : null,
  skipJpg: Boolean(args.skipJpg),
  skipPng: Boolean(args.skipPng),
  dryRun: Boolean(args.dryRun),
  keepLarger: args.keepLarger !== "false"
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(config.packsRoot)) {
    fail(`Packs root not found: ${config.packsRoot}`);
  }

  const pngFiles = config.skipPng ? [] : listPngItems(config.packsRoot, config.pack);
  const jpgFiles = config.skipJpg ? [] : listPackSheets(config.packsRoot, config.pack);
  const files = pngFiles.concat(jpgFiles);
  if (!files.length) {
    console.log("No asset files found.");
    return;
  }

  console.log(`Files: ${files.length} (${pngFiles.length} PNG items, ${jpgFiles.length} JPG covers)`);
  if (config.dryRun) {
    files.forEach((file) => console.log(`[dry-run] ${path.relative(repoRoot, file)}`));
    return;
  }

  const engine = resolveEngine(config.engine);
  const sharpAvailable = canRequireSharp();
  if (!engine && pngFiles.length) {
    fail("No compressor found. Install pngquant, oxipng, or sharp, then rerun this script.");
  }
  if (jpgFiles.length && !sharpAvailable) {
    console.warn("Sharp not found. Skipping pack-sheet.jpg compression.");
  }

  console.log(`PNG compressor: ${engine || "none"}`);
  console.log(`JPG compressor: ${sharpAvailable && jpgFiles.length ? "sharp" : "none"}`);
  if (sharpAvailable && jpgFiles.length) {
    const heightLabel = config.jpgMaxHeight || "auto";
    console.log(`JPG resize: max ${config.jpgMaxWidth}x${heightLabel}, without enlargement`);
  }

  let changed = 0;
  let beforeTotal = 0;
  let afterTotal = 0;

  for (const file of files) {
    if (isJpeg(file) && !sharpAvailable) continue;
    const before = fs.statSync(file).size;
    const result = isJpeg(file)
      ? await compressJpegWithSharp(file)
      : await compressFile(file, engine);
    const after = fs.statSync(file).size;
    beforeTotal += before;
    afterTotal += after;
    if (result.changed) changed += 1;

    const delta = before ? Math.round((1 - after / before) * 100) : 0;
    const marker = result.changed ? "ok" : "skip";
    console.log(`[${marker}] ${path.relative(repoRoot, file)} ${formatBytes(before)} -> ${formatBytes(after)} (${delta}%)`);
  }

  const totalDelta = beforeTotal ? Math.round((1 - afterTotal / beforeTotal) * 100) : 0;
  console.log(`Done. Changed ${changed}/${files.length}. ${formatBytes(beforeTotal)} -> ${formatBytes(afterTotal)} (${totalDelta}%).`);
}

function listPngItems(packsRoot, packId) {
  const packDirs = packId ? [path.join(packsRoot, packId)] : listDirectories(packsRoot);
  const files = [];

  packDirs.forEach((packDir) => {
    const itemsDir = path.join(packDir, "items");
    if (!fs.existsSync(itemsDir)) return;
    walk(itemsDir, (file) => {
      if (path.extname(file).toLowerCase() === ".png") {
        files.push(file);
      }
    });
  });

  return files.sort(naturalCompare);
}

function listPackSheets(packsRoot, packId) {
  const packDirs = packId ? [path.join(packsRoot, packId)] : listDirectories(packsRoot);
  const files = [];
  packDirs.forEach((packDir) => {
    ["pack-sheet.jpg", "pack-sheet.jpeg"].forEach((fileName) => {
      const file = path.join(packDir, fileName);
      if (fs.existsSync(file)) files.push(file);
    });
  });
  return files.sort(naturalCompare);
}

function listDirectories(dir) {
  return fs.readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((entry) => fs.statSync(entry).isDirectory());
}

function walk(dir, visit) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath);
    }
  });
}

function resolveEngine(engine) {
  const choices = engine === "auto" ? ["pngquant", "oxipng", "sharp"] : [engine];
  return choices.find((choice) => {
    if (choice === "sharp") return canRequireSharp();
    return commandExists(choice);
  }) || "";
}

function compressFile(file, engine) {
  if (engine === "pngquant") return compressWithPngquant(file);
  if (engine === "oxipng") return compressWithOxipng(file);
  if (engine === "sharp") return compressWithSharp(file);
  throw new Error(`Unsupported engine: ${engine}`);
}

function compressWithPngquant(file) {
  const tempFile = tempPath(file);
  const result = spawnSync("pngquant", [
    "--quality", config.quality,
    "--speed", String(config.speed),
    "--strip",
    "--force",
    "--output", tempFile,
    file
  ], { encoding: "utf8" });

  if (result.status !== 0 || !fs.existsSync(tempFile)) {
    removeIfExists(tempFile);
    return { changed: false };
  }

  return replaceIfSmaller(file, tempFile);
}

function compressWithOxipng(file) {
  const before = fs.statSync(file).size;
  const result = spawnSync("oxipng", [
    "-o", String(config.oxipngLevel),
    "--strip", "safe",
    file
  ], { encoding: "utf8" });

  if (result.status !== 0) return { changed: false };
  const after = fs.statSync(file).size;
  return { changed: after < before };
}

function compressWithSharp(file) {
  const sharp = require("sharp");
  const tempFile = tempPath(file);
  return sharp(file)
    .png({
      palette: true,
      quality: config.sharpQuality,
      compressionLevel: 9,
      effort: 10,
      adaptiveFiltering: true
    })
    .toFile(tempFile)
    .then(() => replaceIfSmaller(file, tempFile));
}

function compressJpegWithSharp(file) {
  const sharp = require("sharp");
  const tempFile = tempPath(file);
  const resizeOptions = {
    width: config.jpgMaxWidth,
    fit: "inside",
    withoutEnlargement: true
  };
  if (config.jpgMaxHeight) {
    resizeOptions.height = config.jpgMaxHeight;
  }
  return sharp(file)
    .resize(resizeOptions)
    .jpeg({
      quality: config.jpgQuality,
      mozjpeg: true
    })
    .toFile(tempFile)
    .then(() => replaceIfSmaller(file, tempFile));
}

function isJpeg(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg";
}

function replaceIfSmaller(file, tempFile) {
  const before = fs.statSync(file).size;
  const after = fs.statSync(tempFile).size;
  if (!config.keepLarger || after < before) {
    const replaceResult = replaceFile(file, tempFile);
    if (!replaceResult.replaced) {
      const fallbackFile = optimizedPath(file);
      try {
        fs.writeFileSync(fallbackFile, fs.readFileSync(tempFile));
        removeIfExists(tempFile);
        console.warn(`[warn] Could not replace ${path.relative(repoRoot, file)}: ${replaceResult.error}`);
        console.warn(`[warn] Wrote optimized copy: ${path.relative(repoRoot, fallbackFile)}`);
        return { changed: false };
      } catch {
        // Fall through to the original warning when even the fallback cannot be written.
      }
      removeIfExists(tempFile);
      console.warn(`[warn] Could not replace ${path.relative(repoRoot, file)}: ${replaceResult.error}`);
      return { changed: false };
    }
    return { changed: after < before || !config.keepLarger };
  }
  removeIfExists(tempFile);
  return { changed: false };
}

function replaceFile(file, tempFile) {
  try {
    fs.writeFileSync(file, fs.readFileSync(tempFile));
    removeIfExists(tempFile);
    return { replaced: true };
  } catch (writeError) {
    try {
      const backupFile = `${file}.replace-backup-${process.pid}`;
      fs.renameSync(file, backupFile);
      try {
        fs.renameSync(tempFile, file);
        removeIfExists(backupFile);
        return { replaced: true };
      } catch (replaceError) {
        if (!fs.existsSync(file) && fs.existsSync(backupFile)) {
          fs.renameSync(backupFile, file);
        }
        throw replaceError;
      }
    } catch (renameError) {
      return {
        replaced: false,
        error: renameError && renameError.message ? renameError.message : writeError.message
      };
    }
  }
}

function tempPath(file) {
  const ext = path.extname(file);
  const baseName = path.basename(file, ext);
  const tempName = `sprite-cutter-${baseName}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
  return path.join(os.tmpdir(), tempName);
}

function optimizedPath(file) {
  const ext = path.extname(file);
  const baseName = path.basename(file, ext);
  return path.join(path.dirname(file), `${baseName}.optimized${ext}`);
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const argsForChecker = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, argsForChecker, { encoding: "utf8", shell: process.platform !== "win32" });
  return result.status === 0;
}

function canRequireSharp() {
  try {
    require.resolve("sharp");
    return true;
  } catch {
    return false;
  }
}

function removeIfExists(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function parseArgs(argv) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith("--")) return result;
    const [key, value] = arg.slice(2).split(/=(.*)/s);
    result[toCamelCase(key)] = value === undefined ? true : value;
    return result;
  }, {});
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
