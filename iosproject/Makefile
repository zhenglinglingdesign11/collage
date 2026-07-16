.PHONY: assets validate project bootstrap clean

assets:
	node Scripts/generate-asset-catalog.js
	bash Scripts/sync-assets.sh

validate:
	node Scripts/validate-resources.js

project:
	xcodegen generate

bootstrap: assets validate project

clean:
	rm -rf build DerivedData JournalCollage.xcodeproj
