#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRIMARY_SOURCE_ROOT="$REPO_ROOT/miniprogram-spike/miniprogram/assets/packs"
FALLBACK_SOURCE_ROOT="$REPO_ROOT/source-assets/packs"
TARGET_ROOT="$REPO_ROOT/iosproject/JournalCollage/Resources/AssetPacks/packs"

if [[ ! -d "$PRIMARY_SOURCE_ROOT" && ! -d "$FALLBACK_SOURCE_ROOT" ]]; then
  echo "No local source asset folders found; remote CDN asset URLs are enabled, skipping local sync." >&2
  exit 0
fi

mkdir -p "$TARGET_ROOT"
shopt -s nullglob

pack_names="$(
  {
    [[ -d "$PRIMARY_SOURCE_ROOT" ]] && find "$PRIMARY_SOURCE_ROOT" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;
    [[ -d "$FALLBACK_SOURCE_ROOT" ]] && find "$FALLBACK_SOURCE_ROOT" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;
  } | sort -u
)"

while IFS= read -r pack_name; do
  [[ -n "$pack_name" ]] || continue
  pack="$PRIMARY_SOURCE_ROOT/$pack_name"
  if [[ ! -d "$pack" ]]; then
    pack="$FALLBACK_SOURCE_ROOT/$pack_name"
  fi

  target_pack="$TARGET_ROOT/$pack_name"
  rm -rf "$target_pack"
  mkdir -p "$target_pack"

  if [[ -f "$pack/pack-sheet.jpg" ]]; then
    cp "$pack/pack-sheet.jpg" "$target_pack/pack-sheet.jpg"
  fi

  if [[ -d "$pack/items" ]]; then
    mkdir -p "$target_pack/items"
    for item_path in "$pack/items"/*; do
      [[ -e "$item_path" ]] || continue
      cp "$item_path" "$target_pack/items/"
    done
  fi
done <<< "$pack_names"

echo "Synced assets to $TARGET_ROOT"
