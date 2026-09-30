# Launcher nativo del sim-rig — ISA-1430 (#1430)

Entrega aislada para revisión de Claude Opus 5.5. Referencia:
[GitHub #1430](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1430),
fase 5 de ADR 0099. Base asignada `a6cd70ab8c7abdcc700c74105fee5ffa2fd36a69`,
rama `vantareapp/isa-1430-w-launcher`, worktree `C:/tmp/vw3-launcher`.
Notion no disponible: excepción expresa del encargo; no se declara leído,
actualizado ni completado su seguimiento. Sin push, PR, merge ni release.
El orquestador incorpora esta evidencia al handoff canónico; el worker solo
puede editar `native/hub/src/`.

## Qué contiene

- Los siete IDs/ejecutables oficiales de `internal/app/launcher/catalog.go`.
  Apps manuales, nombre, ruta elegida, argumentos y favoritos. Eliminar una
  manual referenciada por un perfil se rechaza; las oficiales permanecen.
- Crear/editar/duplicar/eliminar perfiles, favoritos y pasos ordenados,
  argumentos por paso, espera inicial y entre pasos, parar/continuar ante
  fallo, reutilizar por ruta de ejecutable y 0..3 reintentos por paso.
- Discovery fuera del hilo UI: rutas conocidas, desinstalación HKLM en ambas
  vistas y HKCU, SteamPath HKCU, `libraryfolders.vdf` y manifest LMU. Árboles
  limitados a profundidad 3 y 20000 entradas; claves limitadas a 4096 por
  vista, VDF a 1 MiB. Los errores/truncamientos se muestran. Ninguna llamada
  HTTP ni descarga; se rechazan rutas UNC de red sin abrirlas. Una ruta manual
  desaparecida nunca cambia a otra ruta.
- Disponibilidad separada: catálogo/encontrada/instalada/lanzable. Un manifest
  Steam sin ejecutable verificable puede estar instalado y no ser lanzable.
- Procesos `std::process::Command`, cwd del ejecutable, argumentos como vector
  (editor JSON), sin shell añadida. Sondeo de 3 s para ejecutables; salida 0
  se acepta, no cero falla. Discord Update usa `--processStart Discord.exe`
  si no se han configurado argumentos. Steam `-applaunch 2399420` espera hasta
  2 min a observar el ejecutable real del juego; el éxito del dispatcher no
  demuestra que el juego haya arrancado.
- Progreso real, una cadena a la vez, cancelación de esperas/sondeo/reintentos
  y join al cerrar el Hub. Cancelar deja abiertas las apps iniciadas; ningún
  PID o nombre concede autoridad de cierre. Trigger LMU optativo por flanco,
  consultado mientras el Hub vive. Es independiente de su flanco IPC de cierre.
- `%LOCALAPPDATA%/Vantare/native/launcher.json`, versión 1 y límite 5 MiB.
  `files::save` existente: temporal, sync, lock y reemplazo, conflicto por
  bytes observados; memoria se confirma después del disco. Recargar permite
  resolver un conflicto y descarta borradores explícitamente. Datos Wails
  intactos. Un documento corrupto se conserva y el preflight falla.
- Win32 en `windows.rs`: ABI mínima de registro, Toolhelp y ruta de proceso;
  handles con único propietario. `unsafe` se permite solo en ese módulo,
  con comentarios SAFETY. No se añadieron crates ni dependencias.

## Verificación

Desde `native/`, antes del commit:

```powershell
cargo fmt --check
cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings
cargo test --workspace --offline -j 2
```

Pruebas del módulo: árboles exclusivos reales para rutas/Steam/registro como
fuente de instalaciones, mayúsculas, Steam instalado sin exe, manifest que
intenta salir de la biblioteca, override desaparecido, persistencia y conflicto
reales en Windows, JSON corrupto/validación, procesos `cmd.exe` reales copiados
al árbol del test con salida 0/7, PE inválido, desaparición entre scan y arranque,
presupuesto de reintentos, parar/continuar, reutilización de proceso real,
cancelación durante espera/sondeo y consulta Win32 real (registro solo lectura).
Regresiones de exe raíz frente a copia anidada, rechazo UNC sin acceso y
lanzamiento temporal con los 128 slots de perfiles guardados ocupados.
Los archivos `.exe` de discovery son fixtures de rutas, no prueba de ejecución;
las cadenas usan procesos reales. Tests de trigger y offsets Unicode/UTF-16.

Gates verificados el 2026-09-30, 04:42 UTC, sobre el código final:

- `cargo fmt --check`: exit 0, sin diferencias.
- Clippy workspace/all-targets con `-j 2 -D warnings`: exit 0, sin advertencias.
- Tests workspace con `-j 2`: exit 0; 557 tests estándar + 11 del harness
  lifecycle = 568 pasados, 0 fallidos y 4 ignorados explícitos que requieren
  LMU/ACC reales. Hub lib: 32 pasados (15 Launcher); Hub CLI: 2 pasados.
- `git diff --check` y `git diff --cached --check`: exit 0.

La suite completa se repitió después de las últimas correcciones; su log local
está en `%TEMP%/vw3-launcher-final-tests.log`. El primer Clippy detectó
estilo/longitud en código nuevo y se corrigió. La primera compilación del
workspace tardó 56 min por DuckDB bundled existente; no se añadió dependencia.
No se ejecutaron Go/frontend (no modificados), QA de ventana física, Steam/LMU
live ni CI remoto (sin push/PR). Los cuatro tests live ignorados no son evidencia
física ni se presentan como ejecutados.

Verificación manual aislada, sin iniciar ninguna app hasta pulsar Abrir/Iniciar:

```powershell
cargo run --offline -j 2 -p vantare-hub -- --launcher `
  --data-dir C:/tmp/launcher-review/hub `
  --layout C:/tmp/launcher-review/layout.json `
  --launcher-file C:/tmp/launcher-review/launcher.json
```

Comprobar catálogo y errores reales del scan; añadir un ejecutable propio,
editar argumentos JSON, crear/guardar/reabrir perfil, ordenar pasos y cancelar
una espera de 60 s. Reabrir Hub y comprobar favoritos/rutas/perfil. Abrir LMU
con Steam requiere instalación real y aceptación física del orquestador.

## Límites y siguientes decisiones

No declara paridad visual Orbit ni fase 5 completa. UI funcional usa los tokens
Eficiencia existentes; selección de texto por teclado, sin selección precisa
con ratón ni movimiento por grafemas compuestos. Ediciones son borradores hasta
Guardar; cerrar Hub descarta borradores. Paridad visual, DPI, IME físico y
LMU/OBS quedan para validación del orquestador, no demostrados por tests.

Fuera de este corte: iconos extraídos/overrides, recomendaciones de delay,
merge manual→catálogo, atajos globales, arranque Windows, decisiones `ask`,
reiniciar/cerrar apps o árboles de procesos, retry de toda la cadena, telemetría
histórica de intentos, listas de todas las apps ajenas al catálogo desde el
registro, shortcuts y policies del producto Wails no implementadas aquí.
Reintentos fallidos solo se aplican por paso; no se guardan policies sin efecto.

No se tocó `runtime/src/bin/vantare/`, widgets, kit ni núcleo. Preguntas para
continuidad: ¿qué corte incorpora las policies pendientes? ¿cuándo valida el
orquestador esta vista y un arranque Steam físico sobre el SHA entregado?

La política existente de Hub cierra por flanco IPC Live; ese cierre también
cancela esta cadena. Si un perfil pone apps después del juego, pueden quedar
pendientes al entrar en Live. El perfil recomendado coloca el simulador al
final. Decisión de continuidad: ¿se aplaza ese cierre hasta terminar la cadena?
No se cambió el contrato de cierre ni se creó un supervisor paralelo.
