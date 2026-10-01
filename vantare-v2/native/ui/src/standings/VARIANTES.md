# Variantes Eficiencia — worker A, GitHub #1427

Entrega aislada para revisión de Claude Opus 5.5. Solo se modifican los módulos
Standings, Relative, MulticlassRelative, HeadToHead y BroadcastTower, y sus
escenas. Notion no está disponible; Isaac autorizó expresamente trabajar con
GitHub. No se declara actualizado el seguimiento de Notion.

## Alcance implementado

| Widget | Ajustes aplicados a proyección/render |
|---|---|
| Standings | Signature/broadcast; cabecera y pie; marca inyectada y banda de marca sin cabecera; todas las métricas vigentes de SessionInfo; hasta nueve slots; 1–30 filas; columnas activas, orden, ancho, alineación, nombre full/initial/surname/truncate y vuelta compact/full con 0–3 decimales; PIT; clase del jugador/todas; clasificación normal/multiclase; podio y ventana del jugador |
| Relative | Delante/detrás independientes 0–8; filtro de clase por identidad canónica; siete métricas de columnas, orden, ancho, alineación y formato del nombre; última vuelta y calidad stale; hasta nueve slots |
| MulticlassRelative | 3–7 filas, all/same/other y divisores de clase |
| HeadToHead | Rival ahead/behind seleccionado por la proyección existente |
| BroadcastTower | 3–10 pilotos, mostrar/ocultar clima y carrusel continuo de 30 s con dos grupos contiguos; solo solicita frames mientras hay datos listos y carrusel activo |

`brandVisible` sigue siendo la decisión pura inyectada: prevalece sobre
`showBrand`. No se leen permisos, persistencia, Wails, SSE ni telemetría desde
las funciones de pintado. No se añade ninguna dependencia ni unsafe.
Los pies reciben celdas puras; las dos tablas comparten su pintado de slots.

## Opciones que deben seguir deshabilitadas

Cada Settings publica `UNSUPPORTED` con clave y motivo:

- Standings: `headerFirst/headerSecond`, banda legacy retirada por el productivo;
  `columns.tireCompound`, sin señal en Snapshot y vacío en el VM v2 productivo.
- Relative: `includePlayer`, parseRelativeContent conserva true y el inspector
  productivo no ofrece ocultar al jugador (la proyección pura sí admite false);
  `rowHeightMode`, el TSX no aplica fill, mantiene filas de 28 px;
  `columns.format.display/decimals`, el VM productivo devuelve vuelta completa
  con tres decimales y no aplica esos formatos.
- HeadToHead: `showSectors`, el TSX productivo no dibuja sectores.
- BroadcastTower: `showSof`, normalizado false también por el productivo y sin
  rating canónico para calcular SOF.

Fuera del alcance: `ui/src/app.rs::settings_limit` conserva avisos antiguos
sobre broadcast, target, marca y slots. `hub/src/inspector.rs` sigue marcando
campos como pendientes. El orquestador debe conectar la capacidad declarada
por Settings y retirar únicamente los avisos obsoletos; este worker no toca
registro, layout, kit ni Hub. La entrega no demuestra habilitación en Studio.

## Escenas y evidencia

Cada uno de los cinco módulos contiene `scenes.json` y `evidence/`.
Son 30 escenas declaradas sobre los DTO v4 reconstruidos existentes en
`ui/fixtures`. `*.native.png` es el Overlay GPUI real compuesto sobre negro,
`*.product.png` usa WidgetVisualHost/WidgetVisualViewport y el TSX/CSS
productivos con los mismos ajustes. No son goldens nuevos ni se incorporan a
un gate de referencia congelada. El escenario negro no pertenece al widget.
`fill` documenta explícitamente una opción inerte, no una variante soportada.

La comparación a ojo comprueba contenido, selección, filas, bandas, plantillas,
marca, slots y columnas. Hay diferencias de rasterización/gradientes heredadas
del porte GPUI. Relative sameClass dispara datos de Workshop distintos en el
montaje productivo; sus nombres/gaps no demuestran paridad de datos con el DTO
nativo. El filtro nativo se verifica por ClassId y gaps relativos canónicos en
los tests. El carrusel se captura en movimiento: la posición depende del
instante de captura, y su fase de 15 s se verifica sin reloj real en el test.
El DTO existente de Standings no transporta clima ni vueltas totales: esas
métricas muestran «—». El montaje TSX de Workshop sí publica clima; los tests
de proyección comprueban temperaturas, unidades, lluvia y humedad disponibles,
stale y ausentes. No se han completado las capturas con datos inventados.
Los slots numerosos ajustan texto y filas con medidas de GPUI; su salto de
línea no demuestra equivalencia píxel a píxel con el motor de fuentes web.
Estas escenas no demuestran LMU live, OBS ni paridad de todas las transiciones.

Para reproducir el montaje nativo desde native/:

```powershell
cargo build -p vantare-ui -j 2
$uiLib = (Get-ChildItem target/debug/deps -Filter 'libvantare_ui*.rlib' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
$flumeLib = (Get-ChildItem target/debug/deps -Filter 'libflume*.rlib' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
$gpuiLib = (Get-ChildItem target/debug/build -Filter 'gpui.lib' -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1).DirectoryName
rustc --edition 2024 -C codegen-units=1 ui/src/standings/scenes.rs -L dependency=target/debug/deps -L "native=$gpuiLib" --extern "vantare_ui=$uiLib" --extern "flume=$flumeLib" -o "$env:TEMP/vantare-variants.exe"
& ui/src/standings/capture-scenes.ps1 -Exe "$env:TEMP/vantare-variants.exe"
```

El helper usa `run_layout_with_rights(..., None)` y los renderizadores productivos.
El script exige DPI 96, serializa con `Global\VantareParityCapture`, espera que
se pinte el panel y cierra sus procesos. Las imágenes temporales se recortan al
widget sobre el fondo negro; no se versiona el escritorio.
El montaje TSX fue temporal, con dependencias ya instaladas, cache/envDir
externos y Playwright. No se modificó frontend ni se instalaron paquetes.

## Verificación y estado

Gates de native/, sin más de dos jobs:

| Comando | Resultado |
|---|---|
| `cargo fmt --check` | PASS |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASS |
| `cargo test --workspace -j 2` | PASS; 630 tests pasados, 4 ignorados heredados |
| `cargo test --workspace -j 2 -- --test-threads=2` | PASS previo, suite completa |
| Parser PowerShell y compilación rustc del helper | PASS |
| `git diff --check` | PASS |

Dos ejecuciones iniciales de la suite estándar fallaron en el test IPC ajeno
`latest::tests::put_wakes_a_waiting_reader_and_close_releases_it`, que coordina
el lector con sleeps sin barrera. No se modificó IPC. La suite completa pasó
después tanto con dos hilos de tests como con el comando estándar. Dos errores
propios de selección de fixture (Tower con solo cinco coches y confundir CarId
con posición) se corrigieron usando las identidades y fixtures existentes;
se conservaron las expectativas de diez tarjetas y la ventana P7–P9.

Comparación antes/después con `compare.ps1`, umbral RGBA **0**, sin máscaras:

| Widget | Dimensiones | Píxeles diferentes |
|---|---|---|
| Standings | 440 × 664 | 0 / 292.160 |
| Relative | 304 × 285 | 0 / 86.640 |
| MulticlassRelative | 420 × 155 | 0 / 65.100 |
| HeadToHead | 360 × 128 | 0 / 46.080 |
| BroadcastTower | 1920 × 71 | 0 / 136.320 |

Total: **0 / 626.300**; delta máximo por canal 0. Se usó una copia temporal del
script para sustituir su `-j 4` por `-j 2`, sin tocar el original. El baseline
Standings anterior al cambio ya difería del golden TSX heredado en 10.705
píxeles (3,6641 %, umbral 8); cero regresión respecto al baseline no significa
paridad exacta con el productivo. `default.before.png`, `default.after.png` y
`default.diff.json` se conservan en cada módulo. Los logs y hashes de las
escenas están en evidence/ de este módulo.

No se ejecutaron frontend tests/build/lint/typecheck: no hay cambios frontend.
No se ejecutó CI remota, prueba LMU física ni integración en el Hub. Para
verificar visualmente, abrir cada pareja `*.native.png` / `*.product.png` y
reproducir el layout de scenes.json con el helper anterior. Las opciones
deshabilitadas requieren primero una decisión sobre su contrato productivo.

Base de la rama suministrada: `63a59d0762f33b7e20455a0bc14dee073be175a6`.
Rama: `vantareapp/isa-1427-w-variantes-a`. Se obtuvo origin/nightly
`f29b5fee04022756f9ae59f19bf153f91eebe4ed`, sin rebase ni modificación de otros
worktrees. Es entrega local; no push, PR, CI remota, merge, promoción o release.
La issue GitHub #1427 es el puente técnico existente, no se creó otra tarea.

Decisión pendiente para el orquestador: mantener deshabilitadas las opciones
inertes del productivo, o resolverlas primero en su contrato y renderer TSX.
