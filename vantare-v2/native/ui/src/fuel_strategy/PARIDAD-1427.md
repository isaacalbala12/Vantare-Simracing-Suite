# ISA-1427 — Pedals Telemetry, Fuel Strategy, Broadcast Tower y fuente

Worker Codex para revisión completa de Claude Opus 5.5. Issue:
https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427.
Proyecto: arquitectura Rust nativa (ADR 0099), fase 2. Fecha: 2026-09-30.
Notion no disponible por instrucción expresa del encargo; su seguimiento y el
handoff general quedan pendientes del orquestador. No se simula ninguna escritura.

Base local asignada: `vantareapp/isa-1427-fase2`, incorporada por fast-forward de
`ecfbde31f5ec83f285f3e28882819f7a1f19c9d1` a
`7ad92c05c91bce9beb8c0e517880ec88d8ba81d7`. Rama: `vantareapp/isa-1427-w-wresto`.
Worktree: `C:/tmp/vw2-wresto/vantare-v2` (limpio al entrar).
`origin/nightly` actualizado y leído: `f29b5fee04022756f9ae59f19bf153f91eebe4ed`.
Se mantiene la base de integración indicada por el orquestador.

## Cambios y evidencia funcional

- Pedals Telemetry proyecta steering finito, limitado a −1..1, y pinta el SVG
  productivo rotado × 450°. Su ausencia conserva el volante neutro sin inventar
  una medida cero. Escena de referencia: steering fiable 0.08 (36°).
  El artwork rasterizado se guarda por instancia y solo se rehace al cambiar
  el ángulo o la atenuación; no hay caché creciente ni dependencias nuevas.
- Fuel Strategy lee las últimas cuatro filas del historial canónico (recientes
  primero), sin volver a calcular el consumo. Requerido = per_lap_l × vueltas
  restantes de sesión, con la peor calidad de ambos operandos. La autonomía del
  tanque nunca sustituye las vueltas de sesión para calcular el requerido.
  Estimación: fuel.laps_left, base `Fuel`/«combustible»; en su ausencia válida,
  session.laps_remaining, base `Session`/«sesión». La base está explícita en el
  ViewModel y tiene traducción; no se añade una etiqueta visual que el productivo
  no muestra. Cero válido se conserva; ausencias, consumo no positivo, NaN y
  overflow no producen combustible ficticio. Escena: 79.0 vueltas, 169.1 L y
  consumos 2.21/2.08/2.26/2.12 L de las vueltas 14–17.
- Broadcast Tower deriva la vuelta en curso del coche del jugador: laps + 1,
  conserva Reliable/Estimated/Stale y rechaza overflow. Solo las calidades
  actuales se imprimen; ausencia/obsoleto no se convierten en vuelta 1.
  La referencia congelada declara player.lapNumber missing y muestra VUELTA —.
  Por eso la escena de paridad marca las vueltas del jugador Unavailable.
  Un test UI separado introduce 127 y verifica 128, y Lost vuelve al guion.
  La captura con 128 contra esa referencia distinta dio 7.4046 %: queda
  conservada como comparación no equivalente, no como evidencia de paridad.
- Los trece widgets consultan source_state, incluso cuando los campos siguen
  siendo fiables. Textos tomados de Functional.tsx/labels.ts. Ninguna modificación
  del modelo común, núcleo, IPC, kit, dependencias ni widgets de otros workers.
  `radar.rs` y `pedals.rs` de UI son archivos planos preexistentes, equivalentes
  a las carpetas nombradas en el encargo; no se cambian sus ubicaciones.

## Estado de fuente

| Widget | Waiting/Lost | Stale |
| --- | --- | --- |
| Pedals Telemetry | DESCONECTADO; instrumentos ausentes y volante neutro | DATOS ANTIGUOS, conserva valores y atenúa al 55 % |
| Fuel Strategy | Aviso; oculta datos e historial | Solo aviso, como el productivo |
| Broadcast Tower | DESCONECTADO y cabecera sin datos | Aviso en lugar de tarjetas, sin bandera fresca |
| Standings | DESCONECTADO, sin filas | Aviso en cabecera y filas atenuadas |
| Radar | Sin posición espacial, sin coches | Mismo texto fijo, sin coches |
| Pedals | DESCONECTADO y barras vacías | Aviso, conserva pedales obsoletos |
| Delta | DESCONECTADO y guiones; sin eventos | Aviso y valores conservados |
| Car Damage Visual | Solo aviso | Solo aviso |
| Car Damage Numbers | Aviso y guiones | Aviso y daños conservados |
| Track Map | SIN TELEMETRÍA; sin trazado ni marcadores | Conserva mapa explícito y posiciones conocidas |
| Track Weather | Waiting conserva clima presente (SIN DATOS si ausente); Lost DESCONECTADO | DATOS ANTIGUOS si hay clima; SIN DATOS si no |
| Racing Flags | Waiting conserva bandera presente; Lost bandera desconocida, sin sectores | Conserva bandera conocida, sin añadir aviso |
| Fastest Lap | Borra aviso y referencia | Borra aviso y referencia; reconexión silenciosa |

La matriz de regresión comprueba los cuatro estados, ambos idiomas y los trece
widgets con campos frescos: el cambio de fuente por sí solo debe gobernar la
presentación. Antes del arreglo: 101 tests de dominio pasaron y tres regresiones
fallaron (steering ignorado, estimación de sesión ausente, vuelta en curso ausente).
Después: 107 tests de dominio pasaron. Los tests físicos ignorados no se sustituyen
con esta escena de Workshop.

Correspondencia de lifecycle: Waiting representa espera/conexión, Lost pérdida
del enlace, Stale fuente obsoleta y Live fuente activa. Se conservan las decisiones
por widget de `frontend/src/overlay/widget-types/*/*view-model-v2.ts` y sus
`*Functional.tsx`, sin uniformarlas: Pedals/Pedals Telemetry/Delta/Broadcast Tower/
Standings llaman disconnected a la espera; Fuel/Damage usan missing. Weather y
Racing Flags solo descartan la señal cuando la fuente se pierde, como sus
ViewModels productivos. Radar y Track Map mantienen sus textos propios.

## Paridad

| Widget | Antes % (px) | Después % (px) | compare ≤ 4 % |
| --- | ---: | ---: | --- |
| Pedals Telemetry | 9.2857 (3120) | 3.5179 (1182) | PASA |
| Fuel Strategy | 4.5992 (6380) | 2.4048 (3336) | PASA |
| Broadcast Tower | 3.3891 (4620) | 3.3891 (4620) | PASA |
| Standings | 3.6641 (10705) | 3.6641 (10705) | PASA |
| Radar | 2.1839 (1057) | 2.1839 (1057) | PASA |
| Pedals | 3.9323 (755) | 3.9323 (755) | PASA |
| Delta | 3.7388 (1005) | 3.7388 (1005) | PASA |
| Car Damage Visual | 3.9511 (1132) | 3.9511 (1132) | PASA |
| Car Damage Numbers | 6.0355 (1259) | 6.0355 (1259) | FALLA, igual que antes |
| Track Map | 1.8838 (1495) | 1.8838 (1495) | PASA |
| Track Weather | 3.9861 (1435) | 3.9861 (1435) | PASA |
| Racing Flags | 3.5227 (868) | 3.5227 (868) | PASA |
| Fastest Lap | 4.7015 (2347) | 4.7015 (2347) | FALLA, igual que antes |

El criterio del encargo se cumple: los tres primeros ≤ 4 % y ninguno empeora.
Las dos comparaciones heredadas > 4 % devuelven código 1; las otras once, 0.

Método: compare.ps1, threshold=8, max-percent=4, capturas del renderer GPUI en
el escritorio con su mutex global. Copia temporal del script con exactamente dos
cambios operativos: PSScriptRoot resuelto a la ruta original y -j 4 → -j 2.
Script original, referencias y comparador intactos. El código nuevo cumple el
umbral en los tres primeros; Car Damage Numbers y Fastest Lap conservan su deuda
previa. Los diez restantes conservan exactamente el recuento previo.

Artefactos locales completos: `C:/tmp/vw2-wresto-evidence/`.
`before-<widget>.log`, `after-<widget>.log`, PNG candidato y diff en `before/` y
`after/`. `broadcast-tower-present-lap.log/png` conserva la escena no equivalente.
No se versionan imágenes ni se regeneran referencias.

## Gates, límites y revisión

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| `cargo fmt --check` | PASA, exit 0 | `fmt-final.log` |
| `cargo clippy --workspace --all-targets -j 2 -- -D warnings` | PASA, exit 0; cero warnings | `clippy-verified.log` |
| `cargo test -p vantare-domain -j 2` | PASA; 107 unitarios + 1 de arquitectura | `domain-final.log` |
| `cargo test --workspace -j 2` | FALLA, exit 101: expectativa de escenas vacías en IPC | `tests-workspace-final.log` |
| `cargo test -p vantare-ui --features parity-capture -j 2 --lib` | PASA, exit 0; 99 tests | `tests-ui-parity.log` |
| `cargo test --workspace --exclude vantare-ipc -j 2` (diagnóstico) | PASA, exit 0; 534 tests en salidas estándar, 4 físicos ignorados; UI normal 96/96 | `tests-workspace-rest-final.log` |
| `git diff --check` y JSON de las tres escenas | PASAN | revisión local |

Jobs de compilación limitados a dos en todos los comandos, también en la copia
operativa de compare.ps1. Tests completos con `RUST_TEST_THREADS=2`. La primera
compilación de Clippy, con DuckDB bundled existente, tardó 30m 39s bajo carga de
otros workers; la repetición final pasó en 19.41s. No se cambian los gates ni se
omiten paquetes por su coste.

### Bloqueo del gate global (fuera de rutas asignadas)

`cargo test --workspace -j 2` falla en
`vantare_ipc::tests::every_workshop_scene_is_migrated_with_new_signals_unavailable`
(`native/ipc/src/lib.rs:185`). Ese test recorre todas las escenas y exige steering
Unavailable e historial `[None; 10]`, una expectativa de la migración inicial que
es incompatible con el steering 0.08 y el historial expresamente pedidos ahora.
Resultado IPC: 27 pasan, 1 falla; el runner detiene el workspace en ese paquete.

No se edita IPC, no se quita el test y no se esconden los datos pedidos en otra
escena para eludirlo. El propietario de IPC/orquestador debe actualizar el test
para verificar el DTO v4 y el round-trip de las señales presentes, manteniendo
la validación de calidad y límites. La aceptación global queda bloqueada hasta
esa coordinación. Los tests del resto del workspace se ejecutan aparte como
diagnóstico; no sustituyen el gate completo ni lo convierten en verde.
Las nueve fallas iniciales de UI provenían de fixtures de datos frescos con
source Waiting por defecto: se declaran Live sin quitar las aserciones. Track
Map comprueba el primer repaint Waiting → Live y evita repintar una foto igual.
Las versiones normal y parity-capture pasan. Logs iniciales conservados en
`tests-ui-parity-initial.log` y `tests-workspace-rest.log`.

No se ejecutan Go/frontend ni el ratchet Go/TypeScript: no cambian esas capas y
native/ está fuera del alcance de sus analizadores. Se revisa el diff completo,
JSON de escenas y las referencias productivas. Solo archivos asignados.

Límites: el volante gira directamente al ángulo recibido; la transición CSS de
90 ms del rotor no se porta en este encargo. Las barras conservan su transición
existente de 60 ms. Las opciones de contenido siguen con los defaults del host
(cuatro filas de historial, proyección visible, cinco tarjetas). El kit dispone
hasta Inter W800; el historial productivo pide W900 para sus cifras. No se añade
una fuente ni se toca el kit para esa diferencia pequeña de rasterización.

Las comparaciones cubren las escenas congeladas de Workshop a DPI actual, no
conducción LMU/ACC, OBS, consumo conjunto, varios DPI/monitores ni paridad visual
con vuelta 128: falta una referencia equivalente que contenga esa vuelta.
Estados no-live cubiertos por tests de proyección, no por referencias PNG nuevas.
La disponibilidad de geometría live de Track Map sigue siendo el límite anterior.

## Ficheros y verificación manual

- `native/domain/src/`: los trece módulos del encargo, sin modificar `model.rs`.
- `native/ui/src/`: `pedals_telemetry/mod.rs`, `fuel_strategy/mod.rs`,
  `broadcast_tower/mod.rs`, `standings/model.rs`, `radar.rs`, `pedals.rs`,
  `track_map/mod.rs`, `fastest_lap/mod.rs`, `broadcast_tower/motion.rs`,
  `delta/mod.rs`, `delta/motion.rs`, `car_damage_numbers/mod.rs` y
  `car_damage_visual/mod.rs`. Los cambios adicionales de tests declaran Live en
  los fixtures que ejercitan datos frescos; no se debilitan sus aserciones.
- `native/ui/fixtures/`: `pedals-telemetry.snapshot.json`,
  `fuel-strategy.snapshot.json`, `broadcast-tower.snapshot.json`.
- Documentación: este informe y enlaces desde `pedals_telemetry/ENTREGA.md`,
  `fuel_strategy/HANDOFF.md` y `broadcast_tower/README.md`.

Para repetir una comparación en este PC, desde `native/`:

```powershell
pwsh -NoProfile -File C:/tmp/vw2-wresto-evidence/compare-j2.ps1 -Widget pedals-telemetry -Out C:/tmp/vw2-wresto-evidence/review/pedals-telemetry
```

Repetir con los IDs de la tabla. Abrir candidato, referencia y diff que escribe
el script. El volante debe estar girado 36°, Fuel debe mostrar las cuatro vueltas
17–14 y 169.1 L NEC., y Tower VUELTA — por ausencia en esta referencia.
Para comprobar la vuelta presente, ejecutar el test
`current_lap_uses_the_player_and_preserves_reference_absence` con
`cargo test -p vantare-ui --features parity-capture -j 2`.

Siguiente paso: Opus coordina el test de IPC, revisa todo el diff, reconcilia
Notion/handoff general y decide la aceptación. Sin preguntas bloqueantes.
Se entrega un hito local con el bloqueo de IPC explícito; no se declara aceptación
global. No hay push, PR, CI remoto, promoción,
release ni merge de entrega: solo la fusión local de base solicitada y commit local.
