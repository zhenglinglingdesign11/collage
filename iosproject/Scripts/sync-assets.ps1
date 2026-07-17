param(
  [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
)

$primarySourceRoot = Join-Path $RepoRoot "miniprogram-spike\miniprogram\assets\packs"
$fallbackSourceRoot = Join-Path $RepoRoot "source-assets\packs"
$targetRoot = Join-Path $RepoRoot "iosproject\JournalCollage\Resources\AssetPacks\packs"

if (!(Test-Path -LiteralPath $primarySourceRoot) -and !(Test-Path -LiteralPath $fallbackSourceRoot)) {
  throw "No source asset folders found."
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

$packNames = @()
if (Test-Path -LiteralPath $primarySourceRoot) {
  $packNames += Get-ChildItem -LiteralPath $primarySourceRoot -Directory | ForEach-Object { $_.Name }
}
if (Test-Path -LiteralPath $fallbackSourceRoot) {
  $packNames += Get-ChildItem -LiteralPath $fallbackSourceRoot -Directory | ForEach-Object { $_.Name }
}

$packNames | Sort-Object -Unique | ForEach-Object {
  $packName = $_
  $sourcePack = Join-Path $primarySourceRoot $packName
  if (!(Test-Path -LiteralPath $sourcePack)) {
    $sourcePack = Join-Path $fallbackSourceRoot $packName
  }

  $targetPack = Join-Path $targetRoot $packName
  New-Item -ItemType Directory -Force -Path $targetPack | Out-Null

  $cover = Join-Path $sourcePack "pack-sheet.jpg"
  if (Test-Path -LiteralPath $cover) {
    Copy-Item -LiteralPath $cover -Destination (Join-Path $targetPack "pack-sheet.jpg") -Force
  }

  $sourceItems = Join-Path $sourcePack "items"
  if (Test-Path -LiteralPath $sourceItems) {
    $targetItems = Join-Path $targetPack "items"
    New-Item -ItemType Directory -Force -Path $targetItems | Out-Null
    Get-ChildItem -LiteralPath $sourceItems -File | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $targetItems -Force
    }
  }
}

Write-Host "Synced assets to $targetRoot"
