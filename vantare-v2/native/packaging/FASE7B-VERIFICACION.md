# Evidencia local fase 7b — #1432

2026-09-30, Windows x64. Worker Codex; revisión del diff pendiente de Claude
Opus 5.5. Referencia: [GitHub #1432](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1432).
Notion no disponible: excepción expresa del encargo para trabajar solo con
GitHub. No se certifica estado, proyecto ni última actualización de Notion.

Rama `vantareapp/isa-1432-w-fase7b`; base asignada
`a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`. Implementación:
`a1fec02c36811dd92cfee7bdd55bcaf33c6b942c`. El manifiesto del candidato registra
ese SHA, `source_dirty=false`, versión `0.0.0-local`, canal `nightly` y perfil
**Debug**. El canal del manifiesto es metadato; no hubo promoción a nightly.
El hito posterior solo añade esta evidencia y corrige el recuento documental.

## Artefactos medidos

Directorio local: `native/target/fase7b-clean/` (no versionado). Construcción:

```powershell
# Desde native/, checkout limpio en el SHA de implementación
./packaging/candidate.ps1 -Operation Build -Version 0.0.0-local `
  -Channel nightly -BuildProfile Debug -OutputDirectory target/fase7b-clean
```

El builder usa Cargo offline, locked, workspace bins, `-j 2`; contrasta el
inventario con `cargo metadata`. Diez ejecutables, diez sidecars individuales y
cuatro miembros auxiliares: 24 entradas de manifiesto, 172.928.099 bytes.
Los ejecutables suman **172.801.024 bytes** (164,80 MiB). Tamaños Debug, sin
valor probatorio de tamaño/rendimiento Release.

| Ejecutable | Bytes |
| --- | ---: |
| vantare.exe | 368.128 |
| vantare-core.exe | 4.260.352 |
| vantare-overlays.exe | 32.458.240 |
| vantare-hub.exe | 33.845.760 |
| vantare-engineer.exe | 1.790.464 |
| vantare-storage.exe | 61.734.912 |
| vantare-workshop.exe | 32.783.872 |
| vantare-grabar-lmu.exe | 2.437.120 |
| vantare-grabar-acc.exe | 1.224.704 |
| vantare-import-profile.exe | 1.897.472 |

| Artefacto | Bytes | SHA-256 |
| --- | ---: | --- |
| vantare-native-amd64-package.zip | 50.027.956 | `9a44faac49402dec660673b75b3d12cada83f7f3dcd8936980141154eabbe85c` |
| vantare-native-portable-amd64.zip | 50.038.873 | `147ffb457e948a25dc37ab6d71b6f3aff3e87381c975908ae9ed84ec03356f41` |
| vantare-native-installer.ps1 | 30.263 | `1ed5f304d3ccd27b95f660d468279f4e20fee4ecffddfa6fde4ce2b6adc85686` |

Se releen tamaños y hashes de todos los miembros del payload y los tres
sidecars externos: PASS. Los hashes individuales también están en
`payload/manifest.json` y `payload/bin/*.exe.sha256`.

## Gates y pruebas

Antes del commit de implementación, desde `native/`, todos con salida 0:

```text
cargo fmt --check
cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings
cargo test --offline --workspace -j 2
```

- fmt: PASS; clippy: PASS, sin warnings.
- Tests workspace: **546 passed, 0 failed, 4 ignored**, más **11 escenarios
  de procesos** del harness lifecycle propio, todos PASS. Los cuatro ignored
  requieren LMU REST/SHM o ACC físicos; no se ejecutaron.
- Importador: cinco tests nuevos, incluyendo golden de layout/informe,
  entradas inválidas, letterbox/origen negativo, defaults de los 18 Settings
  productivos y protección del origen/destino existente.
- Build limpio: PASS. No se añaden dependencias ni se modifican widgets.
- Harness PowerShell: **102 comprobaciones PASS**, salida 0. Instala todos los
  binarios y sidecars; portable, integridad, actualización/rollback, archivos
  corruptos, exe en uso, muerte real del actualizador en tres fronteras,
  ownership/cierre del launcher e importación V4 con rollback del layout.
- `git diff --check`: PASS. Los mismos tres gates se repiten antes del hito
  documental; sus logs se conservan como `fase7b-*-docs.log`.

Invocación verificada del harness (desde `native/`):

```powershell
& "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" `
  -NoProfile -File packaging/tests.ps1 `
  -ArtifactsDirectory C:/tmp/vw3-fase7b/vantare-v2/native/target/fase7b-clean
```

Host real: Windows PowerShell **5.1.26100.9444**. La primera invocación desde
PowerShell 7 falló al buscar su proceso hijo `powershell.exe` en `$PSHOME`;
no se contabiliza como PASS. Repetida completa por la ruta absoluta anterior.

Logs no versionados en `native/target/`: `fase7b-fmt-final.log`,
`fase7b-clippy-final.log`, `fase7b-test-final.log`, `fase7b-build.log` y
`fase7b-packaging-tests5.log`. El último identifica la evidencia retenida:
`phase7-tests-5c10944e263348289f9338acdba383dc/`.

## Cobertura, límites y revisión

Conversión explícita V4: coordenadas contain del viewport a bounds de monitor
globales, enabled, opacidad y contenido/apariencia efectiva usando Settings
productivos camelCase. No escribe en el original. Crea layout e informe;
ImportLayout prepara una generación nueva y Rollback recupera la anterior.
Fixtures sanitizados, sin datos personales. Contrato y pasos de verificación
manual en [IMPORTACION-V4.md](IMPORTACION-V4.md).

Se omiten con informe los cuatro tipos no portados, sesiones y diseños que
no son Eficiencia. Escala/tamaño/aspectLocked no tienen destino en layout v1.
Reglas de visibilidad se importan ocultas; opciones sin Settings se reportan.
No se migra DB, Strategy ni cuenta. El bootstrap antiguo de seis binarios
requiere instalación aislada con el nuevo instalador; no se demuestra su
actualización al inventario ampliado.

No ejecutados: Release, paridad visual y DPI en ventana real, LMU/ACC/OBS,
audio, soak, otra GPU/Windows limpio, apagón/disco físico, firma/distribución
final y CI remoto. Go/frontend solo se leen; no necesitan checks por este diff.
El paquete corresponde a esta base, no a commits todavía aislados de otros
workers. El orquestador debe revisar/repetir inventario y gates sobre la
integración final y reconciliar Notion al recuperar acceso.

Sin preguntas bloqueantes. Pendientes de aceptación: bounds/DPI físicos,
paridad visual y bootstrap/distribución final. Solo commits locales; sin push,
PR, merge, release ni acción externa de publicación.
