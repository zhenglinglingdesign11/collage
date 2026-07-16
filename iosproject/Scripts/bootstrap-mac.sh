#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$IOS_ROOT"

node Scripts/generate-asset-catalog.js
bash Scripts/sync-assets.sh

if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate
  echo "Generated JournalCollage.xcodeproj"
else
  echo "xcodegen is not installed. Install it or create an Xcode SwiftUI project and add JournalCollage/ manually."
fi
