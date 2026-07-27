const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultSourceDir = path.join(repoRoot, "source-assets", "fonts");
const defaultOutDir = path.join(repoRoot, "source-assets", "fonts-dist");
const defaultCharsFile = path.join(__dirname, "common-chars.txt");
const codexPython = "C:\\Users\\Administrator\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";

const unicodePresets = {
  common: "",
  gb2312: "",
  "gb2312-level1": "",
  "cjk-basic": "U+0020-007E,U+00A0-00FF,U+2000-206F,U+3000-303F,U+FF00-FFEF,U+4E00-9FFF"
};

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const charsFile = resolveFromRoot(options.chars || defaultCharsFile);
  const outDir = resolveFromRoot(options.outDir || defaultOutDir);
  const minSizeMb = Number(options.minSizeMb || 8);
  const format = options.format || "same";
  const preset = options.preset || "common";
  const dryRun = !!options.dryRun;
  const extraUnicodes = options.unicodes || unicodePresets[preset] || "";

  if (!fs.existsSync(charsFile)) {
    fail(`字符表不存在：${charsFile}`);
  }
  if (!["same", "woff2"].includes(format)) {
    fail("format 只支持 same 或 woff2。OTF/TTF 之间不要强转，避免轮廓格式出错。");
  }

  const fonts = collectTargetFonts(options, minSizeMb);
  if (!fonts.length) {
    fail("没有找到要处理的字体。可使用 --input 指定字体，或使用 --all-large 扫描大字体。");
  }

  const runner = resolveSubsetRunner(options.python);
  if (!runner) {
    fail([
      "没有找到 pyftsubset 或可用的 Python fontTools。",
      "安装方式：python -m pip install fonttools",
      "若需要 woff2：python -m pip install fonttools brotli"
    ].join("\n"));
  }

  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });
  const effectiveCharsFile = createEffectiveCharsFile(charsFile, preset, runner, dryRun);

  console.log(`字体数量：${fonts.length}`);
  console.log(`字符表：${effectiveCharsFile}`);
  console.log(`输出目录：${outDir}`);
  console.log(`格式：${format}`);
  console.log(`执行器：${runner.label}`);
  if (extraUnicodes) console.log(`额外 Unicode：${extraUnicodes}`);
  if (dryRun) console.log("模式：dry-run，不会写入文件");
  console.log("");

  let failed = 0;
  fonts.forEach((fontPath) => {
    const outputPath = createOutputPath(fontPath, outDir, format);
    const args = buildSubsetArgs(runner, fontPath, outputPath, effectiveCharsFile, format, extraUnicodes);
    const inputSize = fs.statSync(fontPath).size;

    console.log(`- ${path.relative(repoRoot, fontPath)}`);
    console.log(`  -> ${path.relative(repoRoot, outputPath)}`);

    if (dryRun) {
      console.log(`  ${runner.command} ${args.map(quoteArg).join(" ")}`);
      return;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const result = spawnSync(runner.command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.status !== 0) {
      failed += 1;
      console.error(`  失败：${result.stderr || result.stdout || "unknown error"}`);
      if (format === "woff2") {
        console.error("  提示：woff2 需要 brotli，可执行 python -m pip install brotli。");
      }
      return;
    }

    const outputSize = fs.statSync(outputPath).size;
    console.log(`  ${formatBytes(inputSize)} -> ${formatBytes(outputSize)} (${ratioText(outputSize, inputSize)})`);
  });

  if (failed) process.exitCode = 1;
}

function parseArgs(args) {
  const options = { inputs: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--all-large") {
      options.allLarge = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--input" || arg === "-i") {
      options.inputs.push(args[++i]);
    } else if (arg.startsWith("--input=")) {
      options.inputs.push(arg.slice("--input=".length));
    } else if (arg === "--out-dir") {
      options.outDir = args[++i];
    } else if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
    } else if (arg === "--chars") {
      options.chars = args[++i];
    } else if (arg.startsWith("--chars=")) {
      options.chars = arg.slice("--chars=".length);
    } else if (arg === "--format") {
      options.format = args[++i];
    } else if (arg.startsWith("--format=")) {
      options.format = arg.slice("--format=".length);
    } else if (arg === "--preset") {
      options.preset = args[++i];
    } else if (arg.startsWith("--preset=")) {
      options.preset = arg.slice("--preset=".length);
    } else if (arg === "--unicodes") {
      options.unicodes = args[++i];
    } else if (arg.startsWith("--unicodes=")) {
      options.unicodes = arg.slice("--unicodes=".length);
    } else if (arg === "--min-size-mb") {
      options.minSizeMb = args[++i];
    } else if (arg.startsWith("--min-size-mb=")) {
      options.minSizeMb = arg.slice("--min-size-mb=".length);
    } else if (arg === "--python") {
      options.python = args[++i];
    } else if (arg.startsWith("--python=")) {
      options.python = arg.slice("--python=".length);
    } else {
      fail(`未知参数：${arg}`);
    }
  }
  return options;
}

function collectTargetFonts(options, minSizeMb) {
  const inputFonts = (options.inputs || []).map(resolveFromRoot);
  if (inputFonts.length) return inputFonts.filter(assertFontFile);
  if (!options.allLarge) return [];
  const minBytes = minSizeMb * 1024 * 1024;
  return walk(defaultSourceDir)
    .filter(assertFontFile)
    .filter((filePath) => fs.statSync(filePath).size >= minBytes)
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

function assertFontFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".otf", ".ttf"].includes(ext);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function resolveSubsetRunner(pythonOverride) {
  const pyftsubset = findOnPath("pyftsubset");
  if (pyftsubset) {
    return { command: pyftsubset, prefixArgs: [], label: pyftsubset };
  }
  const candidates = pythonOverride
    ? [resolveFromRoot(pythonOverride)]
    : [findOnPath("python"), findOnPath("python3"), findOnPath("py"), fs.existsSync(codexPython) ? codexPython : ""].filter(Boolean);
  for (const python of candidates) {
    const checkArgs = path.basename(python).toLowerCase() === "py.exe" || path.basename(python).toLowerCase() === "py"
      ? ["-3", "-m", "fontTools.subset", "--help"]
      : ["-m", "fontTools.subset", "--help"];
    const check = spawnSync(python, checkArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (check.status === 0) {
      const prefixArgs = checkArgs.slice(0, -1);
      return { command: python, prefixArgs, label: `${python} ${prefixArgs.join(" ")}` };
    }
  }
  return null;
}

function buildSubsetArgs(runner, inputPath, outputPath, charsFile, format, extraUnicodes) {
  const args = runner.prefixArgs.concat([
    inputPath,
    `--output-file=${outputPath}`,
    `--text-file=${charsFile}`,
    "--layout-features=*",
    "--glyph-names",
    "--symbol-cmap",
    "--legacy-cmap",
    "--notdef-glyph",
    "--notdef-outline",
    "--recommended-glyphs",
    "--ignore-missing-glyphs",
    "--ignore-missing-unicodes",
    "--name-IDs=*",
    "--name-legacy",
    "--name-languages=*",
    "--drop-tables+=DSIG"
  ]);
  if (extraUnicodes) args.push(`--unicodes=${extraUnicodes}`);
  if (format === "woff2") args.push("--flavor=woff2");
  return args;
}

function createOutputPath(inputPath, outDir, format) {
  const parentName = path.basename(path.dirname(inputPath));
  const ext = format === "woff2" ? ".woff2" : path.extname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(outDir, parentName, `${base}-subset${ext}`);
}

function resolveFromRoot(value) {
  if (!value) return value;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(repoRoot, value);
}

function findOnPath(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.status !== 0 || !result.stdout) return "";
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function quoteArg(value) {
  return /\s|["']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function ratioText(outputSize, inputSize) {
  if (!inputSize) return "0%";
  return `${Math.round((outputSize / inputSize) * 100)}%`;
}

function printHelp() {
  console.log(`
Usage:
  node tools/font-subset/subset-fonts.js --input <font-file>
  node tools/font-subset/subset-fonts.js --all-large

Options:
  --input, -i <file>       指定单个字体，可重复传入
  --all-large             扫描 source-assets/fonts 下的大字体
  --min-size-mb <number>  --all-large 的阈值，默认 8
  --out-dir <dir>         输出目录，默认 source-assets/fonts-dist
  --chars <file>          字符表，默认 tools/font-subset/common-chars.txt
  --format <same|woff2>   输出格式，默认 same；woff2 需要 brotli
  --preset <common|gb2312-level1|gb2312|cjk-basic>
                           common 只保留字符表；gb2312-level1 保留常用中文；
                           gb2312 额外保留 GB2312 中文；
                           cjk-basic 额外保留 CJK 基本区
  --unicodes <ranges>     额外 Unicode 范围，如 U+4E00-9FFF
  --python <path>         指定 Python 路径
  --dry-run               只打印命令，不生成文件
`);
}

function createEffectiveCharsFile(charsFile, preset, runner, dryRun) {
  if (preset !== "gb2312" && preset !== "gb2312-level1") return charsFile;
  const outputPath = path.join(os.tmpdir(), `mixmade-font-subset-${preset}-chars.txt`);
  const pythonRunner = runner && runner.prefixArgs && runner.prefixArgs.includes("fontTools.subset")
    ? runner
    : resolveSubsetRunner();
  if (!pythonRunner || !pythonRunner.prefixArgs.length) {
    fail("gb2312 预设需要可用的 Python 来生成字符表。");
  }
  const script = [
    "from pathlib import Path",
    "import sys",
    "base=Path(sys.argv[1]).read_text(encoding='utf-8')",
    "chars=[]",
    "preset=sys.argv[3]",
    "if preset == 'gb2312-level1':",
    "    source=[]",
    "    for high in range(0xB0, 0xD8):",
    "        for low in range(0xA1, 0xFF):",
    "            try:",
    "                source.append(bytes([high, low]).decode('gb2312'))",
    "            except Exception:",
    "                pass",
    "else:",
    "    source=[chr(cp) for cp in range(0x4E00,0xA000)]",
    "for ch in source:",
    "    try:",
    "        ch.encode('gb2312')",
    "    except Exception:",
    "        continue",
    "    chars.append(ch)",
    "extra='\\nABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\\n，。！？、；：“”‘’（）《》〈〉【】〔〕—…·￥'",
    "Path(sys.argv[2]).write_text(base+'\\n'+''.join(chars)+extra, encoding='utf-8')"
  ].join("\n");
  const pythonArgs = pythonRunner.prefixArgs[0] === "-3"
    ? ["-3", "-c", script, charsFile, outputPath, preset]
    : ["-c", script, charsFile, outputPath, preset];
  const result = spawnSync(pythonRunner.command, pythonArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    fail(`生成 GB2312 字符表失败：${result.stderr || result.stdout || "unknown error"}`);
  }
  if (!dryRun) console.log(`${preset} 字符表已生成：${outputPath}`);
  return outputPath;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
