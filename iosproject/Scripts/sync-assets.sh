#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRIMARY_SOURCE_ROOT="$REPO_ROOT/miniprogram-spike/miniprogram/assets/packs"
FALLBACK_SOURCE_ROOT="$REPO_ROOT/source-assets/packs"
TARGET_ROOT="$REPO_ROOT/iosproject/JournalCollage/Resources/AssetPacks/packs"

if [[ ! -d "$PRIMARY_SOURCE_ROOT" && ! -d "$FALLBACK_SOURCE_ROOT" ]]; then
  echo "No source asset folders found." >&2
  exit 1
fi

mkdir -p "$TARGET_ROOT"

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
  mkdir -p "$target_pack"

  if [[ -f "$pack/pack-sheet.jpg" ]]; then
    cp "$pack/pack-sheet.jpg" "$target_pack/pack-sheet.jpg"
  fi

  if [[ -d "$pack/items" ]]; then
    mkdir -p "$target_pack/items"
    cp "$pack/items"/* "$target_pack/items/"
  fi
done <<< "$pack_names"

echo "Synced assets to $TARGET_ROOT"
