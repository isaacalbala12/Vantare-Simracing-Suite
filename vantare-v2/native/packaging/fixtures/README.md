# Historical inventory regression

`manifest-beta-0.0.975.json` contains the exact bytes from the public
[native-beta-v0.0.975 release](https://github.com/isaacalbala12/Vantare-Simracing-Suite/releases/tag/native-beta-v0.0.975).

- Setup SHA256: e0d1aafbbaf338b54709ed95c0dd6abf62ab352878dea24b770c8f7e114c61de.
- Package ZIP SHA256: 372bcd60cf168cb6187be1c481b21c835268db1dbcc3e0a0aeb17246bede7066.
- Manifest SHA256: 4fc39c73a4660a3c859638d8078c97b30b732048f70ed72f5535d8ec12cc9219.

The same 91-member beta inventory remained through the pre-resources 0.0.979
RC1 (local evidence rc1/build/payload/manifest.json); #1696 added 18 resources
without changing that version. The installed reader admits the frozen inventory
for 0.0.975–0.0.979 and the current inventory. Incoming packages always require
the current complete inventory, independently of their version.

`historical-inventory-tests.ps1` runs offline from build-inventory-tests (already
in the required workflow). It reads the actual manifest and uses inert OS PE
fixtures for mutation/upgrade/rollback/reinstall/uninstall checks. Optional
`-LegacyPackage <public ZIP>` repeats the sequence with all real 0.0.975 files;
it verifies the release digest first. No app binary is executed or GUI opened.
