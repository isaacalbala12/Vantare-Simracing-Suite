# Testing Center local — worker de #1430

Encargo: [GitHub #1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430),
fase 5 / ADR 0099. Worker Codex; revisión completa pendiente de Claude Opus 5.5.
Rama `vantareapp/isa-1430-w-tc-local`; base recibida
`63a59d0762f33b7e20455a0bc14dee073be175a6`. `origin/nightly` se obtuvo y se
leyeron sus instrucciones; esta base contiene la integración de fases autorizada
en la issue. No se cambia de base ni se mezclan worktrees de otros workers.

**Notion bloqueado:** Isaac autoriza expresamente trabajar solo con GitHub en
este encargo. No se ha leído/escrito Notion ni se declara seguimiento cerrado.
El orquestador debe reconciliar la entrega y actualizar el handoff canónico.
Este archivo es evidencia del worker, no otro handoff vivo del proyecto.

## Flujo y privacidad

- Navegación `Testing Center`: informe privado, diagnóstico y exportación JSON.
- Cuatro campos del informe y sección afectada. Guardado explícito y al cerrar
  normalmente el Hub si hay cambios. Recargar descarta las ediciones en memoria
  solo después de leer/validar el archivo. Vaciar formulario es una edición
  guardable; no borra archivos ajenos. Borrador inválido se conserva.
- `testing-center/report-draft.json` bajo el directorio Hub. Schema 1, campos
  cerrados, 2048/2048/2048/4096 bytes UTF-8, archivo de hasta 16 KiB. No se porta
  el idempotency key remoto: no hay operación de envío.
- Reutiliza `files::save_with_limit`: temporal exclusivo, `sync_all`, reemplazo
  atómico, lock cooperativo y comparación de bytes. Un editor externo debe
  respetar el lock; no se promete CAS frente a escritores que lo ignoran entre
  la comparación y el rename. Un lock tras un crash exige revisión manual.
- Diagnóstico bajo demanda, hashes fuera del hilo UI. Solo nueve nombres de
  binarios junto al Hub: Hub, supervisor, núcleo, overlays, Engineer, storage,
  Workshop y las grabadoras LMU/ACC.
  SHA-256 streaming mediante BCrypt de Windows, máximo 512 MiB/binario.
  Presencia/hash son del archivo observado, no prueba de un proceso en ejecución,
  firma, release, configuración o aceptación del canal. Versión del workspace
  actual: `0.0.0`; no se inventa un canal ni un SHA de release.
- IPC: última fuente/estado/época/revisión del Subscriber real del Hub; no se usa
  la escena del Workshop. Núcleo `unobserved`, `recent_messages` o `silent`
  (dos segundos sin actividad). Mensaje reciente no garantiza frescura de la
  fuente; el último estado publicado se conserva separado.
- Último código genérico y fecha de observación por sección con error accesible:
  Hub, Workshop, Launcher, Calendario, Strategy, Engineer, Notificaciones y
  Testing Center. Studio y Análisis no exponen error tipado y se declaran
  **no instrumentados**. No hay lectura/colección de logs, mensajes de error,
  memoria del juego, datos personales ni archivos de entorno.
- Rutas exportables: alias `<hub-data>` y ruta fija del borrador, más presencia.
  Nunca se exporta una ruta real, SID/pipe, nombre de piloto, identidad de sesión,
  campo de cuenta ni token. Se rechazan UNC/dispositivos y unidades de red
  mapeadas antes de I/O. No es un sandbox contra cambios de junctions/reparse
  points por otros procesos; se hereda la frontera de archivos locales del Hub.
- La vista previa es el JSON exportable. El archivo se crea exclusivamente en
  el destino local elegido; un archivo previo no se sobrescribe.
  **El JSON omite todo el texto libre privado**, con marcador explícito y cuatro
  indicadores de presencia. No existe un algoritmo que garantice quitar nombres
  arbitrarios de la prosa. El borrador completo sigue privado en el Hub; el
  usuario puede redactar su explicación por separado para adjuntarla a mano.
- Solo JSON: cumple la alternativa ZIP/JSON sin otra dependencia ni compresor.
  No hay red, cuenta, credenciales, consentimiento reutilizable, envío, historial
  remoto, automatización ni lanzamiento de procesos del producto.

## Reutilización y límites de UI

Todo aspecto visual sale de `orbit.rs`. El campo GPUI/IME de Launcher se carga
desde su archivo existente, sin copiarlo ni editar la sección ajena. La excepción
local de `duplicate_mod` documenta esta reutilización temporal mientras el
orquestador expone el campo desde Orbit. No hay dependencias nuevas.
Los campos son de una línea; conservan teclado, selección UTF-16 y composición
IME del campo existente. Selección por ratón/grafemas y multilinea quedan para
el campo común. IME físico, DPI mixto y paridad visual completa no se afirman.

## Verificación manual

1. Compilar desde `native/`: `cargo build --offline -j 2 -p vantare-hub`.
2. Abrir el Hub con `--data-dir` y `--layout` en un directorio de prueba local.
   Entrar a Testing Center y escribir/guardar. Cerrar y reabrir: texto recuperado.
3. Editar los bytes del borrador desde fuera antes de Guardar: conflicto,
   archivo externo intacto y edición en memoria conservada. Recargar es explícito.
4. Preparar diagnóstico: sin núcleo aparecen `unobserved` y fuente `null`;
   no debe aparecer telemetría del Workshop. Revisar hashes contra `Get-FileHash`.
5. Exportar a un nombre JSON nuevo. Revisarlo: alias de rutas, códigos cerrados,
   ausencia de todos los textos del formulario. Repetir destino: rechazo.
6. No debe haber acción de envío ni prompts de cuenta/credenciales.

Preguntas para Isaac/orquestador, sin ejecución dependiente: contrato y canal
del futuro envío; si se desea incluir prosa en un adjunto, política explícita
de revisión manual/consentimiento; exponer un campo Orbit común y errores tipados
de Studio/Análisis sin cambiar sus secciones en este worker.

## Gates y captura

Verificado el 2026-09-30, antes del commit local. Los gates se ejecutan
desde `native/`, con `-j 2` en Clippy/tests y sin cambiar perfiles versionados.
Se usan `CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`,
`CARGO_INCREMENTAL=0` solo en el entorno para limitar artefactos de compilación.
No se ejecutan Go/frontend (no modificados), CI remoto, promoción ni release.

| Check | Resultado | Salida |
| --- | --- | --- |
| `cargo fmt --check` | PASS, exit 0, sin salida | `evidence/fmt.log` |
| `cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings` | PASS, exit 0, sin warnings | `evidence/clippy.log` |
| `cargo test --workspace --offline -j 2` | PASS, exit 0: 628 tests estándar y 11 del harness de lifecycle; 0 fallos, 4 ignorados | `evidence/tests.log` |
| `cargo build --offline -j 2 -p vantare-hub` | PASS, exit 0 | `evidence/build.log` |
| AST PowerShell de `capture.ps1`; `git diff --check` | PASS | Revisión local |

Los ocho checks del módulo Testing incluyen siete nuevos tests de privacidad,
estado observado, borrador/conflicto, corrupción/límites, atomicidad/exportación,
rutas y BCrypt; el octavo es el test UTF-16 del campo reutilizado. Los cuatro
ignorados requieren LMU/ACC físicos; no se iniciaron juegos ni se aporta esa
prueba. El harness lifecycle usa sus procesos de prueba existentes.

Capturas reales del Hub propio de este worktree, 1600 × 1000:

- [Informe guardado](evidence/testing-report.png): cuatro textos de prueba
  introducidos manualmente; no representan un fallo real del producto.
- [Conflicto por bytes](evidence/testing-conflict.png): se añadió whitespace al
  borrador desde fuera; guardar rechaza, mantiene la edición en memoria y el
  archivo externo. Recargar recuperó los cuatro textos originales en la UI.
- [Diagnóstico](evidence/testing-diagnostic.png): núcleo no observado, fuente
  ausente, inventario real; no se usa una foto del Workshop como telemetría.
- [Exportación completada](evidence/testing-exported.png): acción local desde
  el selector de Windows. [JSON exportado](evidence/report-export.json) es una
  copia renombrada del archivo creado por la UI: `SendKeys` con el teclado
  español alteró la puntuación del nombre de destino durante la automatización.
  El contenido no se transformó.

[Hashes independientes](evidence/binary-hashes.json): nueve de nueve coinciden
con `Get-FileHash -Algorithm SHA256`. El Hub usado en la captura tiene hash
`35cbd57dfdc96393d1f41a8d3e73841c47dfacc57b39ed010fd358a4215ad3fe`.
Solo se abrió el Hub, con rutas de prueba aisladas y pipe sin núcleo.
Los procesos propios se cerraron normalmente. La captura adicional tras
reiniciar salió negra: se conserva solo entre artefactos ignorados y **no** se
declara recuperación visual tras reinicio. Roundtrip y recuperación del archivo
sí están cubiertos por tests; los bytes del borrador de prueba quedaron intactos.
IME físico, recuperación visual tras reinicio, DPI mixto y runtime con juego
siguen pendientes de verificación manual del orquestador.

`evidence/run/` y `session.json` están ignorados; no se versionan borradores
privados, configuraciones de prueba ni ejecutables. Toda modificación pertenece
a `testing/` o a la conexión mínima en `shell.rs`. Sin push, PR, merge, release
ni subagentes; revisión e integración pendientes del orquestador.
