SHELL := /bin/sh

.PHONY: assets validate preflight project bootstrap clean

assets:
	node Scripts/generate-asset-catalog.js
	$(SHELL) Scripts/sync-assets.sh

validate:
	node Scripts/validate-resources.js

preflight:
	node Scripts/preflight-acceptance.js

project:
	xcodegen generate

bootstrap: assets validate preflight project

clean:
	rm -rf build DerivedData JournalCollage.xcodeproj
