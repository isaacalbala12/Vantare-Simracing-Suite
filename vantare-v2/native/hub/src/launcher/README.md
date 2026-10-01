# Launcher nativo del sim-rig — ISA-1430 (#1430)

## Ronda de usabilidad — 2026-10-01

Worker en `vantareapp/isa-1430-w-launcher-usabilidad`, base asignada
`1aa08d5dd588cd431a50ca17e3eb3b2d492fe74c`. Excepción expresa del encargo:
Notion no disponible; seguimiento pendiente del orquestador. Solo commits
locales, sin push, PR, merge ni release. Evidencia externa:
`C:/tmp/launcher-usabilidad-evidence/`.

Migración de primer arranque productivo: `launcher.json` existente prevalece
(también si está corrupto; no se sustituye). Si falta, se busca
`app-settings.json` con el orden Wails: `configs` junto al Hub, `configs` en
CWD, `vantare-v2/configs` en CWD, `%APPDATA%/Vantare/configs`. La primera
carpeta existente manda, incluso si no tiene ajustes: no mezclar instalaciones.
La importación valida y guarda atómicamente; un fallo no crea datos parciales
ni altera Wails. Una vez creado el nativo, no se vuelve a importar. Un
`--launcher-file` aislado y las capturas demo no importan datos del usuario.

Se conservan IDs, nombres, favoritos, rutas, tokens de argumentos con el
contrato de Go (sin shell), pasos, delays, descripción, notas, historial y
preferencias. Las claves Launcher originales quedan archivadas en
`wails_import`, excluyendo otros ajustes. Los delays ya no se limitan a una
hora; siguen siendo segundos enteros no negativos. Los documentos v1 siguen
siendo legibles. Políticas/hotkeys/autostart importados se conservan para los
hitos siguientes; esta sección se actualiza con su ejecución real.

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

La entrega original no declaró paridad visual Orbit ni fase 5 completa y usó
los tokens Eficiencia. El porte de presentación Orbit se registra debajo.
Selección de texto por teclado, sin selección precisa
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

## Presentación Orbit — worker B, 2026-09-30 (#1430)

Rama `vantareapp/isa-1430-w-orbit-b`, worktree `C:/tmp/vw3-orbit-b`, base
asignada `0e40f2a9ef12ff71ccc4e6cdeac7b41e7c6451ce`. Notion no disponible:
excepción expresa del encargo; seguimiento pendiente del orquestador.

`view.rs` compone exclusivamente tarjetas, cuerpos, filas, botones, toggles,
selects, notas y texto del kit `hub/src/orbit.rs`. Catálogo y perfiles se
distribuyen en columnas; aplicaciones, perfiles y pasos conservan sus acciones.
`input.rs` conserva su entrada/IME y usa un select Orbit como superficie de
campo con rol TextInput, foco carmín y selección visible. No se modifica el
kit, la shell, otras secciones ni el sistema Eficiencia. Sin dependencias nuevas.

La misma entrega presenta Strategy con el kit Orbit: documento, selección de
eventos/variantes, tarjetas de evento, variante, ritmo/recursos y boxes/reservas,
resultado y paradas. Conserva sus 24 campos, procedencia, edición, acciones y
límites del solver escalar. Los tests existentes permanecen intactos. Los
cuerpos de lógica anteriores a la presentación se compararon con la base y
son idénticos; solo se recolocan los handlers de presentación.

Capturas de ventanas reales, con PowerShell/System.Drawing y PID exclusivo,
en `C:/tmp/vw3-orbit-b-evidence/`: `launcher.png`, `launcher-1280.png`,
`launcher-profile-edited.png`, `launcher-step.png`, `strategy.png`,
`strategy-1280.png`, `strategy-fields.png` y `strategy-typing.png`.
Revisión a 1600×1000 y 1280×900. Datos y archivos de revisión aislados en ese
directorio: discovery real; el perfil de revisión y los campos de Strategy
son ediciones manuales para comprobar controles, no evidencia de una carrera.
No se inicia ninguna aplicación ni se presenta telemetría simulada como real.

Piezas propuestas para el kit, sin crearlas: campo de texto editable común
(aquí se compone con select), botones compactos/iconos para las acciones del
catálogo y chips de procedencia. La tarjeta de resultado usa filas hasta que
el kit incorpore la timeline de stints del Hub Wails. No se afirma paridad por
píxeles, DPI mixto, OBS, IME físico ni paridad funcional completa de fase 5.

Gates completos sobre las fuentes finales, 2026-09-30, desde `native/`:

- `cargo fmt --check`: exit 0, sin diferencias.
- `cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings`:
  exit 0, sin advertencias.
- `cargo test --workspace --offline -j 2`: exit 0; 619 tests estándar y
  11 del harness de ciclo de vida pasados (630 total), 0 fallidos, 4 ignorados
  explícitos que requieren LMU/ACC reales. Hub lib: 53; Hub CLI: 2.
- `cargo build --offline -j 2 -p vantare-hub`: exit 0. Se repitieron las
  capturas principales y el formulario de perfil con el ejecutable final.
- `git diff --check`: exit 0. No se ejecutan Go/frontend, no modificados,
  ni CI remoto, porque no hay push ni PR.

Logs completos: `C:/tmp/vw3-orbit-b-evidence/{fmt,clippy,tests,build-final}.log`.
Hash del ejecutable de las capturas finales: `binary-final-hash.json` en ese
directorio. Los formularios editados/paso/campo en edición se capturaron antes
de la última extracción de metadatos y handlers (misma presentación); las
capturas principales, 1280 px y `launcher-profile.png` se repitieron al final.
No se añadió ningún test que copie el render: la lógica está intacta y la
presentación se verificó en ventanas reales. Sin push, PR, merge ni release.

## Sección Launcher — paridad, 2026-09-30 (#1430)

Worker Codex para revisión íntegra de Claude Opus 5.5. Worktree
`C:/tmp/vw3-sec-launcher/vantare-v2`, rama
`vantareapp/isa-1430-w-sec-launcher`, base asignada
`95c20ae2bb4efada1d2dfe0de1b160bb1b471c68`. Se obtuvo y leyó
`origin/nightly` `f29b5fee04022756f9ae59f19bf153f91eebe4ed`; se conserva
la integración nativa asignada, sin rebase. Notion no disponible: excepción
expresa del encargo; no se declara su seguimiento completado.

Referencias: fila Launcher de `docs/analysis/2026-09-30-hub-paridad.md`,
`frontend/src/hub/launcher-orbit/` y sus dos PNG congelados. La referencia
Wails usa una demo con perfiles/detecciones; el Hub nativo usa discovery
real y datos locales aislados. No se copia la demo al documento nativo.

- `presentation.rs`: contexto propio con búsqueda compartida por nombres,
  categorías y aplicaciones de los perfiles; perfiles/favoritas, catálogo,
  cuatro resúmenes, cadenas visuales y chips de políticas realmente ejecutadas.
- `editor.rs`: modal Orbit en el host de la ventana, borrador, pestañas Básico/Avanzado, desplegable por
  paso, esperas 0..3600 s, argumentos JSON, ordenar/quitar/añadir, checkbox de
  fallo/reutilización, reintentos 0..3, Guardar/Cancelar y cierre por Escape.
  Los campos y acciones principales participan en el foco del modal.
- `view.rs`: conserva escaneo, ejecución, progreso, trigger y confirmación
  atómica de datos. Descripción/notas se muestran como campos deshabilitados;
  no se persisten propiedades sin contrato. Apps manuales siguen eliminándose
  solo cuando ningún perfil las referencia.
- `shell.rs`: enlace de la columna contextual y del modal al host de ventana
  de Launcher. El host completo evita recortar la capa dentro del scroll de
  contenido.

Disponibilidad y capacidad de lanzamiento siguen siendo hechos distintos:
un manifest instalado sin ejecutable no habilita Abrir/Lanzar. Durante el scan
o una cadena activa tampoco se habilitan nuevas ejecuciones. La fecha de
detección procede del scan local terminado, no de la demo ni del guardado.

**Límites de paridad:** el kit ofrece modal centrado, no drawer lateral ni
cadena/monograma de aplicación equivalente a Wails. Se componen tarjetas,
avatares, filas y chips comunes, sin CSS/renderer alternativo ni extracción
inventada de iconos. Iconos reales/overrides: pendientes del contrato y pieza
compartida; los avatares solo muestran iniciales. El encabezado/topbar global
conserva el de la shell asignada. Calendario/perfil de overlay en el contexto,
historial, descripción/notas, atajo global, inicio Windows y policies
preguntar/reiniciar/cerrar aparecen pendientes; no se simulan sus servicios.

El orquestador debe decidir/incorporar al kit un drawer y un monograma/chain
con icono resuelto si exige esa geometría. Esta entrega no certifica paridad
por píxeles, fase 5 completa, rendimiento ni arranque físico Steam/LMU/OBS.
El handoff canónico queda fuera de las rutas de este worker y corresponde al
orquestador incorporar la continuidad tras revisar el diff.

Pruebas nuevas: búsqueda por nombre/categoría sin distinguir mayúsculas,
disponibilidad sin confundir instalación con lanzamiento, orden y bordes de
pasos, límites de selección y herencia/override de argumentos JSON.

**Validación final:** `cargo fmt --check`, `cargo clippy --workspace
--all-targets -j 2 -- -D warnings`, `cargo test --workspace -j 2`,
`cargo build -p vantare-hub -j 2` y `git diff --check`: exit 0. La suite
completa informa 744 tests estándar y 11 checks del harness de ciclo de vida
pasados; 4 tests de conformidad que requieren simuladores reales están
ignorados explícitamente. Los 6 tests de Launcher añadidos están incluidos.
El primer intento de `cargo test` terminó mientras otro worktree poseía el
pipe de servicios del usuario y el bootstrap propio devolvió EOF; el mismo
gate pasó después cuando ese proceso liberó el pipe. Evidencia de proceso y
logs completos externos en `C:/tmp/isa-1430-sec-launcher-evidence/`.

Capturas finales a 1440 × 900 con el ejecutable del build final: comparar
`comparison.html` en `C:/tmp/isa-1430-sec-launcher-evidence/`. Incluye el
catálogo vacío de perfiles, creación/edición básica y avanzada, selección real
por teclado, perfil QA guardado, búsqueda y favorita. El archivo
`launcher-modal-final.json` conserva solo el perfil manual `QA ISA-1430` con
un paso `lmu` de 2 s y argumentos heredados, más la favorita local de LMU; no
se lanzó el juego ni otra aplicación. `persistence-summary.json` contiene el
resumen de esa verificación. El Hub de QA cerró limpiamente. El SHA-256 del
ejecutable es `8604230E76F624C593CD2EC7F800172B85FCEBA83D51BAF5C737E7F5303B0052`
y coincide con `binary-final-hash.json`.

**Pendiente del kit:** `Choice::Dropdown` cambió el paso al usar teclado; su
lista flotante no llegó a verse en la capa modal durante la prueba física.
Elevar la prioridad de menús anidados o proveer una composición modal/popover
compatible requiere revisar Orbit fuera del alcance de este worker. Tampoco
se certifica click de selección en esa lista, IME, DPI mixto, otras
resoluciones, paridad por píxeles, fase 5 completa, LMU/ACC/Steam/OBS físicos,
ni rendimiento. Notion no estaba disponible; no se actualizó ni se afirma
haber completado su seguimiento. No hubo push, PR, merge ni release.

## Hito 2 — políticas
Las políticas importadas ya gobiernan app abierta, fallo y cancelación. La salida
manual espera la decisión antes de cerrar el Hub. Respuestas con ID antiguo o
acción no ofrecida no resuelven la decisión; cancelar despierta esperas y sondeos.
Solo los hijos directos guardados con su handle original pueden cerrarse/reiniciarse.
Reutilizar una app externa no concede propiedad. Steam conserva observación sin
permiso de cierre sobre el juego. El cierre de hijos es forzado (Child::kill), no
un cierre de ventana con guardado de documentos: revisar UX con apps reales antes
de promocionar. La salida automática a Live conserva las apps con política Ask;
no abre un diálogo que impida el handoff automático al juego.

## Hito 3 — entradas de lanzamiento
La fila del perfil y su botón lanzan la misma cadena. Inicio lanza el primer
favorito (desempate por nombre); sin perfiles abre Launcher. La paleta contiene
acciones `Lanzar <nombre>` con el ID persistido, filtrado y permisos del Hub.
Las demás columnas de contexto incluyen los perfiles guardados. Todas las entradas
rechazan un lanzamiento si hay cadena/escaneo activo o pasos no disponibles.

## Hito 4 — cancelar y reintentar
El progreso ofrece cancelar la cadena en curso. Al terminar permite repetir los
pasos fallidos (con los índices originales) o la cadena entera. Reintentar en modo
Preguntar no dispara intentos automáticos; Fallidos limita reintentos por paso y
Entera limita el número de pasadas completas. El máximo continúa siendo 3.
