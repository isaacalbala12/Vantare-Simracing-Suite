# Revisión #1929: tooling release y readiness (4-nov-2026)

Las pruebas se ejecutaron únicamente bajo `D:/VantareServer/qa/isa-1840`, con
`CARGO_TARGET_DIR=D:/VantareServer/targets/isa-1840-p7` y
`DUCKDB_LIB_DIR` ausente. Se usó `-AllowDirty` para probar el WIP de #1929;
`source_dirty=true` y `source_sha=ea8d8344d9ff75e05fc2ba6440c6b976930db68b`.
No se ejecutaron Setup, Uninstall, instalación, registro ni publicación.

| Shell | Comando | Resultado | SHA-256 paquete |
| --- | --- | --- | --- |
| Windows PowerShell 5.1.22621.7376 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/build-candidate.ps1 -Version 0.0.989 -Channel beta -OutputDirectory D:/VantareServer/qa/isa-1840/p7-review-ps51 -BuildProfile Release -AllowDirty` | PASS; build release 33m47s | `2ef8ad1bb0b5c92a882eb11dd99dc4d0730835175439d794327b58b97e9e8c39` |
| PowerShell 7.6.6 | `pwsh -NoProfile -File native/packaging/build-candidate.ps1 -Version 0.0.989 -Channel beta -OutputDirectory D:/VantareServer/qa/isa-1840/p7-review-ps7 -BuildProfile Release -AllowDirty` | PASS; caché release 10,28 s | `3b298bba613b3012631a2f15aa8a754e6111af8ee2eed62402f26f67da1c4b40` |

El manifiesto PS 7 contiene 120 miembros: 10 EXE, 10 sidecars, 97 recursos
de `ui/fixtures/` y README/licencia/dependencias. Ambos recursos obligatorios
(`standings-design-system.sequence.json` y `session-alerts.snapshot.json`)
están presentes; `layouts/` y `telemetry-real/` tienen cero miembros.

`build-tooling-tests.ps1` pasa en PS 5.1 y PS 7 con `matrix-verifier.exe` de QA:
stdin UTF-8 sin BOM, firma/verificación con acentos, URL/campos/SHA/notas,
máximo 65535, EXE desconocido, recursos extra y sidecar de Setup ausente.
El workflow Windows ejecuta ese test en ambos shells. Logs:
`D:/VantareServer/qa/isa-1840/p7-review-ps51.log` y `p7-review-ps7.log`.

`build-installer.ps1` construido sobre el paquete PS 7 en la misma raíz QA:
PASS (Uninstall y Setup release). `Assert-PublishArtifacts` verificó el sidecar
real `VantareSetup.exe.sha256`; SHA-256 de Setup:
`51a42ef7a2c10f627d8ce19a76c5aca753b28a5da901c056079300bd8a004594`.
Log: `D:/VantareServer/qa/isa-1840/p7-review-setup.log`.

## Repetición tras integrar #1917 en nightly

Base `076e6404772878ed427c9f2ed1a43594dec5f2ed`; WIP rebasado
`86833c6bd2493c02e1ef905940d78a2ea0ddde26`, de nuevo `source_dirty=true`.
El builder final incorpora el gate QA: grafo de features y escaneo de bytes
antes de copiar los EXE y antes de cerrar el ZIP.

| Shell | Salida QA | Resultado | SHA-256 paquete |
| --- | --- | --- | --- |
| PS 5.1 | `p7-review-final-ps51` | PASS, release 4m25s | `d8ab15d48ad35ae5ed3e103c2443ba95a44c5d3096e2c77ff8faf519c7781c10` |
| PS 7.6.6 | `p7-review-final-ps7` | PASS, build cacheado 1,73 s | `d7e38c48ecb6ce98ecfc600e8b883893218c4d5e9397e2b407b791a243435303` |

`no-qa-tests.ps1` pasó en ambos shells: siete marcadores que cruzan el límite
del buffer, un EXE QA dentro de ZIP rechazado y el ZIP limpio admitido. El
paquete release generado antes del rebase también pasó el escaneo de ZIP.
El paquete final PS 7 repite 120 miembros, 10 EXE, 97 recursos y cero rutas
prohibidas; `Assert-NativeDistributionArchive` lo aceptó.
Logs de la repetición: `p7-review-final-ps51.log` y
`p7-review-final-ps7.log` en la misma raíz QA.

El Setup final se volvió a construir con `build-installer.ps1` después del
rebase: PASS, con escaneo de los EXE dentro del ZIP y de Setup/Uninstall.
`Assert-PublishArtifacts` verificó el sidecar real de Setup, SHA-256
`aefbf5d86e5e519b0cf35c677d1269b127b3495a56e024eea9903eb2383b9427`.
Log: `D:/VantareServer/qa/isa-1840/p7-review-final-setup.log`.

Tras el rebase, `cargo check` y `cargo clippy -D warnings` de runtime y Hub
pasaron con target propio y `compilar.ps1`; también `cargo fmt --check` y el
gate lifecycle de runtime. Los tests de tooling y de exclusión QA pasaron en
PS 5.1 y PS 7. Logs `p7-review-check.log`, `p7-review-clippy.log` y
`p7-review-lifecycle.log` bajo la misma raíz QA.
Telemetría de Runtime con `compilar.ps1`, target propio y perfil `telemetria`:
34/34 PASS (1 lento, 1 omitido por perfil); log `p7-review-telemetria.log`.

## Re-review: BOM de PS 5.1 y cierre P3

El CLI Rust `vantare-services --sign-update/--verify-update` descarta un único
BOM UTF-8 inicial de stdin. La firma cubre los bytes del JSON sin BOM; una
segunda marca se conserva y provoca rechazo de JSON. Un test unitario comprueba
firma y verificación con/sin BOM usando solo semilla TEST. La ruta real de
`sign-beta-manifest.ps1` usa `vantare-services.exe --sign-update` y una semilla
TEST bajo QA; el verificador de matriz comprueba después firma y JSON con
acentos. La verificación de producción rechaza esa firma de prueba.

| Shell | Consola | Entrada observada | Resultado |
| --- | --- | --- | --- |
| Windows PowerShell 5.1 | cp 65001 | `EF-BB-BF` antes del JSON | PASS; `p7-review-bom-ps51.log` |
| PowerShell 7 | UTF-8 | `C3-A1` para `á` | PASS; `p7-review-bom-ps7.log` |

Ambas corridas incluyen las pruebas negativas de versión 65536, URL/SHA,
recurso obligatorio ausente, ruta `layouts/`, recurso extra y ubicación de red;
además comprueban que el build conserva `VANTARE_SCCACHE`,
`VANTARE_CARGO_SLOTS` y `VANTARE_CARGO_MIN_GB`.

Gates afectados: test unitario Services PASS; test de limpieza del temporal
`hub-ready` tras fallo de rename PASS; fmt y Clippy `-D warnings` Services/Hub
PASS mediante `compilar.ps1` y target propio. Quality y retirement PASS,
471 archivos retenidos. El pin de captura apunta al ancestro nightly `076e64047`;
el README anterior se conserva byte a byte en retirement.
