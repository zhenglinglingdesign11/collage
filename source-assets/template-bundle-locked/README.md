# Locked template bundle sources

These files are immutable copies of the exact bytes referenced by the shipped
product Catalog when the upstream source path has subsequently changed.

`npm run compile:template-bundle-dependencies` verifies their SHA-256, byte
length, MIME type, and pixel dimensions before they can be emitted into the
Expo `require(...)` map. Do not replace a file here to update a template:
publish a new Catalog/template revision instead.
