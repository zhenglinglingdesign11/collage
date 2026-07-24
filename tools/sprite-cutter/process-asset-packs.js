#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const miniProgramRoot = path.join(repoRoot, "miniprogram-spike");
const defaultBaseUrlRoot = "https://assets.zllarchi.site/packs";
const args = parseArgs(process.argv.slice(2));

main();

function main() {
  const packArgs = args.pack ? [`--pack=${args.pack}`] : [];
  const compressArgs = [
    path.join("tools", "sprite-cutter", "compress-png-items.js"),
    ...packArgs
  ];

  if (args.engine) compressArgs.push(`--engine=${args.engine}`);
  if (args.quality) compressArgs.push(`--quality=${args.quality}`);
  if (args.oxipngLevel) compressArgs.push(`--oxipng-level=${args.oxipngLevel}`);
  if (args.sharpQuality) compressArgs.push(`--sharp-quality=${args.sharpQuality}`);
  if (args.jpgQuality) compressArgs.push(`--jpg-quality=${args.jpgQuality}`);
  if (args.jpgMaxWidth) compressArgs.push(`--jpg-max-width=${args.jpgMaxWidth}`);
  if (args.jpgMaxHeight) compressArgs.push(`--jpg-max-height=${args.jpgMaxHeight}`);
  if (args.skipJpg) compressArgs.push("--skip-jpg");
  if (args.skipPng) compressArgs.push("--skip-png");
  if (args.dryRun) compressArgs.push("--dry-run");

  run(process.execPath, compressArgs, repoRoot);

  if (args.dryRun) {
    console.log("Dry run complete. Skipped config generation.");
    return;
  }

  const baseUrlRoot = args.baseUrlRoot || defaultBaseUrlRoot;
  const generateArgs = [
    path.join("scripts", "generate-asset-pack-config.js"),
    `--base-url-root=${baseUrlRoot}`,
    ...packArgs
  ];

  if (args.name) generateArgs.push(`--name=${args.name}`);
  if (args.category) generateArgs.push(`--category=${args.category}`);
  if (args.tone) generateArgs.push(`--tone=${args.tone}`);

  run(process.execPath, generateArgs, miniProgramRoot);
  console.log("Asset pack processing complete.");
}

function run(command, commandArgs, cwd) {
  console.log(`\n> node ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
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
