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
