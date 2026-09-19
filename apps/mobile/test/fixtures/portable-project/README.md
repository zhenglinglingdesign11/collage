# Portable Project fixtures

`fixture-matrix.json` is the version-controlled fixture inventory used by
`portableWorkspace.integration.test.js`. The test materializes each scenario
in a fresh temporary directory so no fixture can accidentally depend on a
developer's device path or a previous test run.

| Fixture | Expected result |
| --- | --- |
| `minimal-v1` | imports without embedded resources |
| `complex-v1` | imports and has identical production-renderer inputs after rebuilding |
| `legacy-v0` | migrates into Portable Project v1 before import |
| `missing-resource-v1` | fails with `missing-resource` |
| `corrupt-resource-v1` | fails with `resource-hash-mismatch` |

Fixture byte strings are intentionally tiny, deterministic stand-ins rather
than visual assets. The importer validates container bytes, length, and hash;
native visual regressions use the same complex semantic document with actual
image assets on an iOS runtime.
