# Historical inventory regression

`shipped-inventory-0.0.987.json` fija los 109 nombres beta del paquete conservado
en `C:/VantareServer/evidence/rc9-publicacion/candidate/payload/manifest.json`,
incluyendo versión, source_sha y SHA del manifiesto de procedencia. Aunque la
carpeta se llama RC9, ese manifiesto dice **0.0.987**; no se etiqueta como 988.
Se comprobó que coincide exactamente con el inventario beta actual. Este snapshot
es un contrato de tests, no una lista de producto: no se regenera al retirar una
ruta. El test exige conservarla en el inventario actual o declararla retirada.

`manifest-beta-0.0.974.json` conserva el manifiesto anterior observado por SSH
en el PC de Isaac (#1793), sin datos de cuenta. SHA256
`166fbf2c620bb5cc2dad0141d48ca3acde732598874e04cdf2495cc30f2a0845`;
productor `00f37fef0767f009f388d0e797531481efd468d3`. El `state.json` real
referenciaba este manifiesto como `previous` y el manifiesto público 0.0.975
como activo. Ambos tienen el mismo inventario de 91 miembros. Son evidencia
histórica, no una segunda lista de producto: desde #1840/1a cada instalada
declara su inventario en su manifiesto ligado por SHA-256 desde el estado,
siempre dentro del universo cerrado de rutas conocidas del motor.
La regresión construye ese estado con PE inertes y hashes propios, comprueba
sonda/actualización/rollback y conserva los datos y la generación anterior.
Incluye activas 0.0.974–0.0.979, anterior 0.0.973 y referencias ausentes,
malformadas o corruptas, sin relajar la validación de la activa.

`manifest-beta-0.0.975.json` contains the exact bytes from the public
[native-beta-v0.0.975 release](https://github.com/isaacalbala12/Vantare-Simracing-Suite/releases/tag/native-beta-v0.0.975).

- Setup SHA256: e0d1aafbbaf338b54709ed95c0dd6abf62ab352878dea24b770c8f7e114c61de.
- Package ZIP SHA256: 372bcd60cf168cb6187be1c481b21c835268db1dbcc3e0a0aeb17246bede7066.
- Manifest SHA256: 4fc39c73a4660a3c859638d8078c97b30b732048f70ed72f5535d8ec12cc9219.

The same 91-member beta inventory remained through the pre-resources 0.0.979
RC1 (local evidence rc1/build/payload/manifest.json); #1696 added 18 resources
without changing that version. The installed reader uses its own state-bound
manifest inventory within the engine's closed public path universe, independently
of a hardcoded version interval. Incoming packages always require
the current complete inventory, independently of their version.

`historical-inventory-tests.ps1` runs offline from build-inventory-tests (already
in the required workflow). It reads the actual manifest and uses inert OS PE
fixtures for mutation/upgrade/rollback/reinstall/uninstall checks. Optional
`-LegacyPackage <public ZIP>` repeats the sequence with all real 0.0.975 files;
it verifies the release digest first. No app binary is executed or GUI opened.
