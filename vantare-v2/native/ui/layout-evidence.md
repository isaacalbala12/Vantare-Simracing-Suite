# ISA-1427 — ajustes y layout nativo

Entrega local del 2026-09-30 para [GitHub #1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427), que habilita la infraestructura de #1430. Proyecto técnico: arquitectura Rust nativa, ADR 0099 y plan del 2026-09-29. Rama `vantareapp/isa-1427-w-layout`, base recibida `c9606a287672936689d6d48db1445956267c2a48`. Primer hito: `30fd5d8881826b02bd50cbb620e7d7fd8709ae17`. El segundo hito contiene las correcciones encontradas al probar la ventana real y esta evidencia; su SHA queda en el handoff del worker.

Notion no estaba disponible; Isaac autorizó expresamente este encargo solo con GitHub. No hay estado, proyecto ni última actualización verificados en Notion. El orquestador debe reconciliar el seguimiento. No se hizo push, PR, merge, promoción ni release. Se preservó la base asignada; `origin/nightly` se consultó tras fetch (`f29b5fee04022756f9ae59f19bf153f91eebe4ed`), sin incorporarlo a este worktree.

## Alcance entregado

- Settings serde junto a los 18 widgets registrados, enum etiquetado por `kind`, valores por defecto del manifest y normalización. Las structs sin opciones son unidades Rust; se convierten a un objeto vacío para admitir el etiquetado interno de serde. Las dimensiones calculadas no se persisten.
- `Layout` versión 1, fixture congelada, posiciones globales, ID, orden de pintado, visibilidad y opacidad. `Document::save` compara los bytes leídos, limita el documento a 1 MiB, usa bloqueo cooperativo, temporal en el mismo directorio, `write_all`/`sync_all`, copia `.bak` y `rename` de reemplazo sin borrar el anterior.
- Recarga cada 500 ms: conserva el último documento válido ante JSON roto y reintenta lecturas parciales aunque mantengan mtime. Recrea las vistas, re-ingiere la última foto y conserva el HWND por monitor ocupado. Las instancias ocultas mantienen su monitor ocupado. El proceso sigue vivo también con cero instancias y cero ventanas.
- CLI sin número: layout de `%LOCALAPPDATA%\Vantare\native\layout.json`; `--layout <ruta>` permite pruebas. Un número explícito 1/4/22 conserva la campaña existente.

Archivos: `ui/Cargo.toml`, `ui/src/{registry,app,lib,layout}.rs`, `ui/src/bin/vantare-overlays.rs`, Settings y constructor de cada uno de los 18 módulos, `ui/fixtures/layout.json`, `ui/README.md` y este expediente. No se modifican domain, IPC, adaptadores, núcleo runtime, launcher ni `ui/src/source.rs`.

`serde` y `serde_json` pasan a dependencias directas de UI; ambas ya estaban en el lock, sin paquetes ni versiones nuevos. Cargo añade únicamente esas dos aristas en la entrada `vantare-ui` del lock. **El lock está fuera de las rutas autorizadas y no forma parte de los commits:** el orquestador debe regenerarlo al integrar antes de usar `--locked`.

## Gates y regresiones

Ejecutados desde `native/`, con un máximo de dos jobs por compilación:

```text
cargo fmt --check                                      exit 0
cargo clippy --workspace --all-targets -j 2 -- -D warnings exit 0
cargo test --workspace -j 2                            exit 0
```

Resultado: 387 tests del harness estándar y 7 de lifecycle aprobados, 0 fallidos, 4 ignorados; UI 88, CLI overlays 3 y CLI Workshop 4 aprobados. Los cuatro ignorados requieren juego/telemetría físicos; no se forzó su ejecución. También se revisó rustfmt en registry y módulos declarados por macro, que Cargo fmt no descubre.

Tests añadidos: roundtrip de fixture y Settings, opciones parciales y normalización, límites/versiones/IDs/JSON inválido, conflicto entre editores, backup y fallo simulado previo a rename conservando el fichero original; relectura tras JSON parcial con el mismo mtime; reconstrucción del widget con la última foto; decisiones de reutilización/cierre de ventanas y ocupación con todas las instancias ocultas. La regresión de mtime falló antes de la corrección y pasó después (`partial-red.log`).

## Píxeles con opciones por defecto

Capturas de escritorio Windows, un monitor 1920 × 1080, DPI 100 %, bajo el mutex global `Global\VantareParityCapture`. Se ejecutó una copia temporal exacta de `compare.ps1` cambiando solo `-j 4` por `-j 2`; el script original permanece intacto. Antes: código de la base recibida. Después: renderer con Settings por defecto y host de opacidad corregido. Se mantuvieron las mismas fixtures congeladas y referencias Wails.

Comparación Wails: RGBA premultiplicado, umbral por canal 8 y límite 4 %, sin máscaras. Comparación nativa antes/después: el mismo `diff.py`, umbral 0 y límite 0 %, sin máscaras. **Los 18 widgets conservan exactamente todos los píxeles nativos.** Esto no elimina la deuda de paridad Wails de la base.

| Widget | Tamaño nativo | Wails antes % | Wails después % | Píxeles nativos cambiados |
| --- | --- | ---: | ---: | ---: |
| standings | 474 × 364 | tamaño distinto | tamaño distinto | 0 |
| radar | 220 × 220 | 2,1839 | 2,1839 | 0 |
| pedals | 120 × 160 | 3,9323 | 3,9323 | 0 |
| delta | 280 × 96 | 3,7388 | 3,7388 | 0 |
| car-damage-visual | 150 × 191 | 3,9511 | 3,9511 | 0 |
| input-telemetry | 360 × 140 | 13,0040 | 13,0040 | 0 |
| multiclass-relative | 420 × 155 | 4,6636 | 4,6636 | 0 |
| broadcast-tower | 1920 × 71 | 3,3891 | 3,3891 | 0 |
| delta-trace | 1000 × 278 | 3,0662 | 3,0662 | 0 |
| track-map | 320 × 248 | 1,8838 | 1,8838 | 0 |
| track-weather | 240 × 150 | 3,9861 | 3,9861 | 0 |
| car-damage-numbers | 140 × 149 | 6,0355 | 6,0355 | 0 |
| head-to-head | 360 × 128 | 1,3780 | 1,3780 | 0 |
| fuel-strategy | 680 × 204 | 4,5992 | 4,5992 | 0 |
| pedals-telemetry | 300 × 112 | 9,2857 | 9,2857 | 0 |
| relative | 304 × 285 | 8,3772 | 8,3772 | 0 |
| racing-flags | 280 × 88 | 3,5227 | 3,5227 | 0 |
| fastest-lap | 480 × 104 | 4,7015 | 4,7015 | 0 |

Standings Wails mide 440 × 664 (20 filas); la base nativa mantiene 474 × 364. `compare.ps1` sale con 2 para ese tamaño distinto, con 1 para los siete widgets que exceden 4 % y con 0 para los otros diez. El gate nativo antes/después sale con 0 para los 18. No se cambian las referencias para obtener un resultado verde.

## Aplicación en el proceso real

Build dev de `vantare-overlays`, fuente explícita `local` con `VANTARE_FUENTE=quieta` (demo sintética, sin LMU). El script de QA enumera ventanas Win32 del PID, edita un layout temporal, espera el log de cada aplicación y comprueba HWND/proceso. Última secuencia aprobada:

```text
PID 2932: HWND 31002260, monitor 0,0 / 1920×1080
opacity 1 -> 0.35: mismo HWND
posición 100,100 -> 300,200: mismo HWND
pedals -> standings, showSessionFooter=false: mismo HWND
JSON inválido: último layout, mismo HWND, proceso vivo
visible=false en todas: mismo HWND, proceso vivo
instances=[]: cero ventanas, proceso vivo
restaurar: HWND 31461012, mismo proceso
PASS runtime layout reload
```

La opacidad cambió 19180 de los 19200 píxeles de la zona de pedales; muestra RGB `(5,80)` de `[17,17,20]` a `[22,17,24]`. Se demuestra el efecto visual del host, sin inferir una proporción de alpha a partir de una captura ya compuesta. La QA descubrió dos problemas y verificó las correcciones: GPUI ignoraba opacity en el estilo de una vista cacheada (ahora la aplica el contenedor `div`); su modo por defecto cerraba el proceso al desaparecer la última ventana (ahora `QuitMode::Explicit`).

Artefactos locales: `%LOCALAPPDATA%\Temp\vantare-layout-1427\`, `before/<widget>/<widget>.png`, `after/<widget>/<widget>.png`, `<widget>-after.log`, `<widget>-unchanged.json`, `baseline.json`, `qa.py`, `qa-delivery.log`, `runtime.stderr.log`, `opacity.txt`, `partial-red.log`, `clippy-delivery.log` y `tests-delivery.log`. Son evidencia de esta máquina, no fixtures de telemetría real ni una validación de OBS. El script temporal de compare se elimina del worktree tras verificar.

Para repetir manualmente desde `native/`:

```powershell
$layoutQA = Join-Path $env:TEMP 'vantare-layout-manual.json'
Copy-Item -LiteralPath ui/fixtures/layout.json -Destination $layoutQA
cargo run -p vantare-ui --bin vantare-overlays -j 2 -- --layout $layoutQA --fuente local
```

Editar ese fichero en otro terminal: mover `x/y`, bajar `opacity`, alternar `visible`, cambiar `settings.kind` o `showSessionFooter` de Standings. El log debe indicar ventanas reutilizadas; escribir `{` debe conservar el último estado. Guardar `{"version":1,"instances":[]}` debe mantener vivo el proceso y restaurar la fixture debe recuperar una ventana. Para el flujo normal omitir `--fuente local` y ejecutar el núcleo: eso requiere una verificación aparte con datos reales.

## Límites y continuidad para el orquestador

Standings aplica cabecera, pie, `brandVisible` y métricas `none/track/estimatedLaps`. Las opciones que requieren cambiar ingest/paint se guardan y normalizan, pero se avisa al aplicar una variante todavía sin portar: delta capsule, fondo transparente de pedales, carrusel, volante alternativo, color de banderas, head-to-head behind, template broadcast y métricas/header legacy/footerSlots/showBrand adicionales de Standings. **No ofrecer estas variantes como funcionales en #1430.** Este encargo restringía cada módulo a Settings y constructor; completar esas variantes requiere ampliar ese alcance.

No incluye decisión 4 del Hub, canal de control, importación Overlay V4, escala por instancia ni cambios al launcher/DTO. No se verificaron OBS, LMU/ACC vivos, varios monitores físicos, DPI mixto, hotplug ni rendimiento bajo carga. La partición con coordenadas negativas y la política de ocupación se cubren con tests puros; la continuidad de HWND se comprobó en un monitor físico. El conflicto es optimista y el lock cooperativo: un editor externo que no use esta API puede escribir en la ventana entre la última comparación y rename. No se afirma exclusión transaccional frente a esos escritores.

Pregunta de continuidad, sin bloquear esta entrega: ¿se asignan los portes de variantes pendientes antes de exponer esos ajustes en el Hub, ampliando explícitamente el alcance a ingest/paint? El orquestador debe revisar el diff completo, regenerar las dos aristas del lock en su checkout e integrar únicamente con la autorización del canal correspondiente.
