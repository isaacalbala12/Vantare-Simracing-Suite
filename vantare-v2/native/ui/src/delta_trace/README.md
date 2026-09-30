# Input Telemetry y Delta Trace: trazas cortas — ISA-1427

Worker Codex para revisión de Claude Opus 5.5. Issue [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427), abierta y leída el 2026-09-30; proyecto técnico ADR 0099, fase 2. Notion no disponible por excepción explícita del encargo: tarea/UUID, proyecto operativo y última actualización no verificados. Reconciliación pendiente del orquestador. Sin push, PR, CI remota, merge, release ni promoción.

Worktree `C:/tmp/vw2-wtrazas/vantare-v2`, rama `vantareapp/isa-1427-w-wtrazas`, base asignada `8bff26972d6046841cb4c191682d6cca75d07ca2`. El fetch de entrada observó `origin/nightly@f29b5fee04022756f9ae59f19bf153f91eebe4ed`; se conserva la base asignada sin incorporar otros workers.

Hito de implementación local: `2947286936a8a8cae019827576bbc032ecb158f7`. Este handoff y la evidencia constituyen un segundo hito local; el SHA de este documento se obtiene con `git log -1 -- native/ui/src/delta_trace/README.md`. La entrega sigue pendiente de review del orquestador y no se integra en ningún canal.

## Implementación

- `domain/src/input_telemetry.rs` y `domain/src/delta_trace.rs`: `Trace` pura, propiedad del widget, `push(&Snapshot) -> bool`, máximo 120 plazas y ventana por defecto de 4 s. Ningún historial se añade a Snapshot/DTO, ni al núcleo.
- Cadencia mínima de 20 ms en Input y 50 ms en Delta: corresponde a las secuencias congeladas de `tools/widget-reference/scene.tsx` y `authoring-v2-workshop-frame.ts`. El derivador Go de delta publica a 100 ms; este porte sigue la escena visual de 50 ms. Solo se conserva la composición por defecto; el selector de ventanas 1–8 s no se porta en este encargo.
- Reloj inyectado `origin.received_at` del núcleo, monotónico y común al DTO. No se consulta el reloj del navegador o de la UI, ni se fabrican puntos entre fotos. Instantes duplicados dentro de la cadencia no crean muestras; revisiones repetidas o antiguas tampoco.
- Se vacía por época, sesión, coche o desaparición del jugador; Delta también por vueltas completadas y mejor vuelta propia. El DTO no lleva ID de referencia: `player_car().best_lap_s` es la señal observable disponible. Un cambio no representado en esos datos no puede detectarse.
- Ausencia, NaN, infinito o calidad stale producen `None`, nunca cero. Un cero fiable se conserva. Hay corte ante ausencia (también entre dos muestras de la cadencia), salto de secuencia, silencio >500 ms y reanudación tras fuente stale. Un reloj que retrocede reinicia la serie. El pintor Delta comienza otro tramo tras el corte.
- Tendencia: medias de los últimos diez y los diez anteriores, umbral 0,01 s; desconocida sin veinte puntos contiguos válidos. Una regresión reproduce el empate flotante de 1,00 a 0,99: falló antes de corregirlo, y ahora respeta literalmente las comparaciones y el orden de suma del TSX. El valor actual sigue el último punto disponible, como el productivo, siempre que exista una lectura actual utilizable; una ausencia actual muestra guion.
- `state.source_state`: Waiting/Lost ocultan lecturas y vacían la serie; Stale conserva lecturas e historial con aviso visible y no inserta puntos nuevos. Se muestran SIN DATOS / DATOS ANTIGUOS / DESCONECTADO, también en inglés. Delta conserva valores stale en el readout como el TSX productivo.
- UI: barras de acelerador del historial de Input; curva roja, punto final y color de tendencia de Delta. Sin punto a cero inventado cuando no hay datos. Sin dependencias nuevas ni unsafe añadido.

## Escenas y Workshop

`ui/fixtures/input-telemetry.sequence.json`: 40 fotos a 20 ms con recta, frenada y tracción; última foto a igual instante para los instrumentos (4, 180 KPH, 7200 RPM, pedales 6/13/75). Resultan 40 muestras. Los porcentajes coinciden exactamente con los datos congelados.

`ui/fixtures/delta-trace.sequence.json`: 100 fotos a 50 ms, fórmula `0.5 - (i/99)*0.3 + sin(i/5)*0.07`; última foto conserva el escalar 0,214 a igual instante. La ventana de 4 s conserva 81 puntos; muestra +0.257 y PERDIENDO. Error máximo frente a los cien valores congelados: 2,78e-17 s.

Son demostraciones del Workshop, no capturas reales de LMU/ACC. Solo se rellenan señales leídas por cada widget. El DTO v4 exige las otras celdas: quedan unavailable, sin valores simulados adicionales; coches vacíos en Input y solo el jugador en Delta. Los instantes Unix de la referencia se expresan como tiempo monotónico relativo de la secuencia.

`ui/src/workshop.rs`, `ui/src/bin/vantare-workshop.rs` y `ui/src/capture.rs` admiten una foto JSON o un array no vacío del DTO vigente. Cada miembro pasa por el decodificador IPC; una foto inválida rechaza toda la escena. Se alimentan en orden antes de mostrar/capturar. Recargar una escena válida reconstruye el widget para evitar concatenar historiales del mismo epoch. Un archivo inválido conserva la última escena y widget válidos. Las escenas de una foto siguen funcionando. Se conservan sin cambios las dos `.snapshot.json` anteriores, porque el contrato de migración IPC las valida como fotos únicas. Las nuevas secuencias se descubren como `.sequence.json`; `--dev --widget` las prefiere como escena inicial.

## Evidencia

Antes, capturado de nuevo con el binario preexistente del worktree, sin máscaras y DPI 100 %:

| Widget | Antes | Después | Gate |
| --- | ---: | ---: | --- |
| Input Telemetry | 6554 / 50400 px, 13,0040 % | 1140 / 50400 px, 2,2619 % | <=4 % |
| Delta Trace | 8524 / 278000 px, 3,0662 % | 1911 / 278000 px, 0,6874 % | <=4 % |

Binario anterior SHA256 `0b5970d33c65cc29c7f9469f0848bd855b4f4fd97d7c500a662229fb628e0a1f`; no lleva SHA Git verificable, por lo que las cifras anteriores se atribuyen a ese binario, no a una compilación nueva del HEAD. RGBA premultiplicado, umbral por canal 8; referencias congeladas sin modificar. Artefactos en `C:/tmp/wtrazas-evidence/before/` y `after/`, PNG y diff por widget.

Binario final SHA256 `0ed3d14a87a3af6bdb072b9a8890f017badf266c4320f33ee6adfa645c900cd9`, compilado del código de esta entrega. Las dos capturas se repitieron después de la corrección de tendencia y mantienen las cifras de la tabla; inspección visual de ambos PNG y gate <=4 % aprobado, sin máscaras, DPI 96 y mutex global.

Gates finales: `cargo fmt --check`, rustfmt explícito de los dos módulos UI y Clippy de workspace/all-targets con `-D warnings`: aprobados. `cargo test --workspace -j 2`: 459 pruebas del harness Rust y 7 de ciclo de vida, cero fallos y seis omitidas. Con `parity-capture`, Clippy de todos los targets UI, 96/96 tests UI y build final aprobados. Logs en `C:/tmp/wtrazas-evidence/`. Go, frontend y analizadores anti-slop de Go/TS no se ejecutan: no se modifica ese código, y Rust no está en el scope de esos analizadores.

Hay seis omisiones heredadas: cuatro requieren LMU/ACC físicos y dos de ISA-1431 están bloqueadas por decisiones del Core (anchor común para gaps de clase, y fuente OFF/caducidad). No se cambian ni se cuentan como pruebas aprobadas. Una repetición tuvo un timeout al cerrar el launcher en `a_second_instance_starts_nothing`; log conservado en `workspace-tests-lifecycle-timeout.log`. El caso aislado pasó en 1,1 s y la repetición completa también pasó, sin tocar ese código. Se conserva como fallo intermitente observado, sin atribuir una causa ni afirmar un arreglo.

La primera captura/build falló por disco lleno. Se restauraron los dos archivos propios cuya escritura quedó incompleta; no se perdieron cambios ajenos. La primera compilación completa de tests se interrumpió para trasladar el target propio a `E:/tmp/vw2-wtrazas-target`; la ruta original es una junction. Para que la identificación Win32 del ejecutable compare la ruta física correcta, los gates se ejecutan con `CARGO_TARGET_DIR=E:/tmp/vw2-wtrazas-target`. Es un artefacto local ignorado, sin cambiar manifiestos ni configuración de Cargo. Los intentos fallidos/interrumpidos se conservan y no se contabilizan como pruebas aprobadas.

`ui/diff.py --json` falla al serializar `numpy.int64`, fuera del alcance. Se obtiene la comparación textual sin `--json`, con su código de salida y PNG de diferencias. No se modifica el comparador ni las referencias.

## Reproducción y límites

Desde `native/`, siempre con un máximo de dos jobs:

```powershell
$env:CARGO_TARGET_DIR = 'E:/tmp/vw2-wtrazas-target' # solo este worktree
cargo fmt --check
rustfmt --check --edition 2024 ui/src/input_telemetry/mod.rs ui/src/delta_trace/mod.rs
cargo clippy --workspace --all-targets -j 2 -- -D warnings
cargo test --workspace -j 2
cargo build -p vantare-ui --features parity-capture --bin vantare-workshop -j 2
```

Para las capturas, invocar el binario ya construido con la escena `.sequence.json` y `ui/diff.py`. `ui/compare.ps1` también permite `-Scene`; su `-j 4` fijo exige una función cargo que lo sustituya por `-j 2`. Adquirir el mutex global `Global\VantareParityCapture` antes de abrir la ventana. No ejecutar dos capturas simultáneas. Capturar ambos widgets con sus escenas respectivas y `--max-percent 4 --threshold 8`, sin máscaras.

Para verificar el Workshop: `cargo run -p vantare-ui --bin vantare-workshop -j 2 -- --dev --widget input-telemetry`; repetir con delta-trace, cambiar de escena, guardar otra secuencia válida y comprobar que se reemplaza la historia. Guardar JSON inválido conserva el último widget válido y muestra el error.

No demuestra telemetría física, OBS, DPI mixto, multimonitor, consumo en carrera ni funcionamiento interactivo de todos los controles del Workshop. SectorDeltas, trackPath y turnInsight siguen sin señales canónicas; no se inventan. Sin preguntas necesarias para completar este alcance; quedan la revisión del orquestador, conciliación Notion y esas pruebas físicas.

## Procedencia histórica

El worker anterior de Delta (`fee79215ba0d15d77df9c6991ca46d1573a449ad`, `5cc8a525f7c6a8987e6fbbb6f4c87209d3e7444c`) omitía explícitamente la historia porque Snapshot no la incluía. Medía 3,0662 % y mostraba +0.214 / DESCONOCIDO. Esta entrega cambia esa decisión por el historial local aprobado, manteniendo geometría de 1000 × 277,71875 (PNG 1000 × 278), guía cero con cobertura por fila física, panel y marco existentes. La antigua medición de 290 pruebas y cuatro omitidas es histórica; no sustituye los gates de este SHA.

Se mantienen los límites visuales anteriores: sombra exterior fuera del PNG y efectos distintos de `noBlur` sin reproducir; brillo aproximado del panel (primer tramo CSS de 120°), borde superior 24 % y resto 12 %. Delta sigue sin animaciones, `Wake::Idle` y `animating() == false`; ahora repinta también cuando cambia su serie. Quedan como candidatos del propietario del kit, sin ejecutarlos aquí, compartir el formato de delta con signo/tres decimales, el brillo/borde del panel y la cobertura física de líneas SVG.
