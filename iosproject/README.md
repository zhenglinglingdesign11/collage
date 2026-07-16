# JournalCollage iOS

This folder contains the first-phase SwiftUI skeleton for the iOS version of the collage app.

## Phase 1 Scope

- SwiftUI app entry and root 4-tab navigation.
- Design tokens for color, type, spacing, radius, and basic controls.
- Platform-neutral Draft, Layer, AssetPack, and Inspiration models.
- Bundled `asset-packs.json` generated from the mini program asset pack definitions.
- Placeholder Create, Editor, Assets, Inspiration, and Mine screens.

## Xcode Setup

This workspace was scaffolded on Windows, so it intentionally does not include a hand-written `.xcodeproj`. On macOS, generate the project with XcodeGen:

```bash
brew install xcodegen
make bootstrap
open JournalCollage.xcodeproj
```

`make bootstrap` runs:

- `node Scripts/generate-asset-catalog.js`
- `bash Scripts/sync-assets.sh`
- `node Scripts/validate-resources.js`
- `xcodegen generate`

If you do not want to install XcodeGen, create a new iOS SwiftUI App in Xcode named `JournalCollage`, then add the `JournalCollage/` folder to the app target and the `JournalCollageTests/` folder to a unit test target.

## Build iOS Apps Plugin Flow

After generating `JournalCollage.xcodeproj` on macOS, the Build iOS Apps plugin can take over:

```bash
xcodebuild -list -project JournalCollage.xcodeproj
```

Then in Codex, use:

```text
discover_projs
list_schemes
list_sims
session_set_defaults(projectPath: ".../JournalCollage.xcodeproj", scheme: "JournalCollage", simulatorName: "iPhone 16", simulatorPlatform: "iOS Simulator")
build_run_sim
screenshot
```

The exact simulator name depends on the Mac's installed Xcode runtimes.

## Resource Notes

`JournalCollage/Resources/AssetPacks/asset-packs.json` is generated from the mini program asset pack definitions. The actual image files are copied by `Scripts/sync-assets.sh` or `Scripts/sync-assets.ps1` into matching relative paths such as:

```text
packs/papers/items/1.png
packs/jiaodai/pack-sheet.jpg
```

The source assets currently live in the repository under `miniprogram-spike/miniprogram/assets/packs` and `source-assets/packs`.

## Useful Commands

```bash
make assets      # regenerate JSON and copy pack images
make validate    # verify every catalog resource exists in the bundle folder
make preflight   # verify app scaffold, asset catalog, and empty Draft contract
make project     # generate JournalCollage.xcodeproj
make bootstrap   # assets + validate + preflight + project
make clean       # remove generated project/build folders
```

PowerShell asset sync is also available on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File Scripts\sync-assets.ps1
```

## Editor Spike Core

The phase 2 editor foundation lives in:

- `JournalCollage/Rendering/CanvasViewport.swift` for screen/canvas coordinate conversion.
- `JournalCollage/Rendering/HitTesting.swift` for topmost layer picking.
- `JournalCollage/Rendering/LayerTransform.swift` for translate/scale/rotate updates.
- `JournalCollage/Rendering/DraftRenderer.swift` for the first SwiftUI draft preview.
- `JournalCollage/Storage/DraftStore.swift` for local JSON draft persistence.
- `JournalCollage/Domain/Samples/SampleDrafts.swift` for a reusable starter draft.

Once macOS + Xcode is available, run the generated unit tests from Xcode or with:

```bash
xcodebuild test -project JournalCollage.xcodeproj -scheme JournalCollage -destination 'platform=iOS Simulator,name=iPhone 16'
```

Current editor capabilities wired into code:

- Canvas ratio switching and fit-to-screen layout.
- Photo import through `PhotosPicker`, saved via `ImageStore`.
- Image, sticker, tape, paper, and text layer rendering through `DraftRenderer`.
- Tap selection, drag translation, pinch scale, and rotation gestures through `InteractiveDraftCanvas`.
- Copy, delete, move up, and move down commands for the selected layer.
- Local JSON draft save, latest draft restore in the editor, and recent draft entry points on the Create screen.
