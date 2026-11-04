# Instalador nativo y paquete beta

El Setup y Uninstall de `native/installer` y el lanzador `Vantare.exe` son el único motor instalado. El paquete contiene binarios Rust de motor 2, recursos y `manifest.json`; `candidate.ps1`, `beta.ps1` y NSIS ya no se distribuyen. `installer-cleanup.ps1` sigue siendo la excepción mínima y permanente para borrar el desinstalador después de que salga su proceso.

## Contrato de instalación

- `VantareSetup.exe` verifica el ZIP, el manifiesto y los hashes antes de escribir. Cada generación vive en `generations/<id>`; `state.json` liga activa y anterior a sus manifiestos por SHA-256. `data/` se conserva en actualización, rollback y desinstalación salvo elección expresa del usuario.
- La raíz contiene `Vantare.exe`, que se renueva al instalar, reparar y actualizar si difiere de la generación activa. El lanzador crea una sesión Rust para la generación activa. El Hub confirma una actualización pendiente mediante un token aleatorio de ese arranque. Un fallo de arranque restaura la generación anterior de motor 2 y ofrece Reparar. No se vuelve automáticamente a motor 1.
- Feed, Check, Apply, Confirm, rollback, Register y SetStartup son Rust. `shell::sync` proyecta registro y accesos de Windows; los valores o accesos ajenos se conservan. La preferencia de inicio de instalaciones anteriores se migra una vez.
- Uninstall retira solo los miembros de manifiestos ligados por SHA. Una generación huérfana se conserva y se diagnostica; su retención se decide en el paso 8 de #1840.
- El indicador de arranque se retiró tras medir cinco aperturas del Hub release bajo QA: mediana 343 ms desde proceso hasta ventana visible.

## Construir y publicar

`build-candidate.ps1` es herramienta del repositorio, no parte de la instalación. Construye los binarios mediante `native/scripts/compilar.ps1` con CRT estático, verifica sus versiones y dependencias, genera el manifiesto y los ZIP de paquete y portable. `build-installer.ps1` empaqueta Setup/Uninstall; `sign-beta-manifest.ps1` y `publish-beta.ps1` preparan el feed. Esas herramientas no publican una release por sí solas y exigen un checkout limpio salvo `-AllowDirty` explícito.

El inventario público cerrado está en `public-inventory.json`: diez EXE y 97 recursos aprobados, sin `ui/fixtures/layouts/` ni `telemetry-real/`. Cada artefacto publicable, incluido Setup, exige su `.sha256`. `build-tooling-tests.ps1 -QaRoot <raíz QA>` verifica la entrada UTF-8, el inventario, los sidecars y el manifiesto; con `-Verifier <matrix-verifier.exe>` comprueba además la firma de ida y vuelta con acentos. Tras una actualización confirmada no hay rollback manual: una versión nueva requiere otro paquete firmado.

Antes de **publicar** cualquier release con motor 2 sin LegacyRunner, Isaac debe probar el Setup con los bytes distribuidos sobre raíces 0.0.975 y 0.0.988 reales en una VM o cuenta aislada y registrar la evidencia en [#1840](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1840). La prueba es condición de publicación, no de programación ni de apertura del PR.

## QA

La [matriz](matrix/README.md) ejecuta las 88 combinaciones de ocho raíces y once operaciones, conserva los 45 rechazos por motivo, prueba la cadena real lanzador → sesión → Hub y verifica que los datos no cambian. Todo producto de prueba usa raíces bajo `D:/VantareServer/qa` o `RUNNER_TEMP` en CI, HKCU y carpetas inyectadas. Nunca se ejecutan Setup, Uninstall, beta.ps1 ni candidate.ps1 contra una instalación real.

Compilar únicamente con `pwsh -NoProfile -File native/scripts/compilar.ps1`, target propio y la cola del repositorio. El workflow `branch-channel-gates.yml` construye los fixtures y ejecuta el guard antes de la matriz. La evidencia histórica de los pasos 3–5b permanece en `matrix/evidence-1840-*.md`; el contrato de arquitectura está en [ADR 0103](../../docs/adr/0103-instalacion-nativa.md) y [installer-design](../../docs/vantare-program/installer-design.md).
