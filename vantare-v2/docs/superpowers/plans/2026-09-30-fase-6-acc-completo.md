# Fase 6 — ACC completo dentro del DTO v4 (ISA-1431)

Fecha: 2026-09-30. Worker Codex; orquestador/reviewer: Claude Opus 5.5.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1431.
ADR: [0099](../../adr/0099-arquitectura-rust-nativa.md), aceptada.
Base recibida: `e172eb3fb0e92915468209d8c0cc46a30362a115`;
rama `vantareapp/isa-1431-fase6-acc-completo`, worktree limpio al entrar.
Notion indisponible: excepción expresa del encargo. No se afirma seguimiento
Notion ni lectura/escritura de la issue remota; la restricción de red permite
solo documentación pública. Sin fetch, push, PR, merge ni release.
`origin/nightly` es la referencia local; merge-base `5838de5a` (sin refresco remoto).

## Inventario mínimo del producto actual

Rutas relativas a `vantare-v2/`, líneas observadas en la base recibida:

| Responsabilidad | Evidencia Go/Wails | Decisión |
| --- | --- | --- |
| Selección de simulador | `internal/app/telemetry_simulators.go:44-81` registra LMU; `:84-129` SimX sintético; `:131-141` selección | No existe registro productivo ACC que portar; implementar sobre el adaptador Rust existente |
| Identificación ACC en diagnóstico | `internal/telemetry/diagnostics/catalog.go:715-716`, `frontend/src/hub/settings/diagnostics/contracts.ts:9` | Un nombre admitido no demuestra adquisición ACC |
| Contrato de fuente/calidad | `internal/telemetry/projection/overlayv2/frame.go:14-38`, `:83-126`; `internal/telemetry/driver/source_status.go:3-21` | Conservar ausencia, calidad y estados; usar modelo Rust y DTO v4 existentes |
| Sesión/clasificación | `internal/telemetry/projection/overlayv2/builder_session.go`, `builder_standings.go`; `frame.go:157` | No trasladar proyecciones ni lógica Wails; la traducción ACC produce `Observation` neutral |
| Combustible/gaps | `internal/telemetry/projection/overlayv2/builder_fuel.go:12-35`, `builder_relative.go` | Litros canónicos y derivaciones únicas en núcleo; no duplicar consumo/gaps en ACC |
| UI y frescura | `frontend/src/telemetry-transport/overlay-frame-v2-store.ts:89-102`, `:125-165` | No portar TypeScript; probar flujo común Rust sin tocar UI |
| Composición app | En esta base el shell vive en `internal/app/`, no existen `app.go`/`app_telemetry.go` en la raíz | No inventar una referencia Go ACC ni editar shell |

Dependencias de adquisición Go: LMU SHM/REST, no SDK ACC. Dependencias ACC
Rust actuales: Win32 mappings + carpeta Documentos, UDP v4 loopback,
serde_json, flate2, sha2. No hay dependencias nuevas propuestas.

## Objetivo y fronteras

Completar únicamente las señales que ACC expone con equivalencia demostrable
al modelo común. `native/domain/src/model.rs` y `native/ipc/src/dto.rs:13`
(versión 4) son contratos de lectura; núcleo, IPC, proyecciones y widgets
pertenecen a otros workers y no se editan. Rutas de escritura: adaptador ACC,
tests ACC, `testdata/acc/`, grabadora y este microplan explícitamente solicitado.
Un solo traductor live/replay. Sin ramas por simulador fuera del adaptador.

El título del plan dice Assetto Corsa; el encargo especifica ACC, el SDK y el
corpus son Competizione. Este trabajo **no añade soporte al Assetto Corsa original**.

## Cortes ordenados (un commit local por corte)

1. **Inventario y microplan (este documento).** Antes de implementar. Medir
   estado inicial con fmt/clippy/test workspace, siempre jobs=2 y offline.
2. **Fusión por señal y cobertura DTO.** Reproducir y corregir que SHM obsoleta
   sobrescribe datos UDP frescos del jugador. Admitir temperaturas nativas UDP
   cuando physics no aporta dato fresco; no refrescar otros campos. Gaps cero
   válidos; conservar vueltas/splits y ámbitos. Vectores explícitos por calidad,
   sentinels, pausa/OFF, clocks independientes. Corpus congelado obligatorio.
   Fuel: publicar `fuelXLap` (litros/vuelta) y `fuelEstimatedLaps` (Estimated);
   retirar la interpretación no demostrada de fuel/maxFuel como litros.
3. **Grabadora estable y reconexión acotada.** Reproducir discrepancia entre
   packet de cabecera y blob. Validar copia, separar recepción/reintento,
   tolerar silencio breve (10 s antes de renovar una conexión admitida),
   UNREGISTER v4 de un byte antes de registrar de nuevo/cerrar, limitar drenaje
   UDP para no ahogar SHM. Registro sin contraseña de comandos; no mostrar error
   devuelto por servidor que pueda contener secretos. Simplificar cursor del
   ACK sin sustituir corpus ni formato. Tests deterministas con reloj/vectores.
4. **Conformidad y entrega.** DTO v4 ida/vuelta, capacidades, derivaciones
   comunes y Waiting/Live/Stale por replay/corpus. Documentar huecos del modelo
   y capturas físicas concretas. Los gates locales no aceptan neutralidad física
   ni CPU/p99 del juego; mediciones de rendimiento a cargo del orquestador, en serie.

Antes de cada commit: `cargo fmt --check` (CARGO_BUILD_JOBS=2),
`cargo clippy --offline --workspace --all-targets -j 2 -- -D warnings`,
`cargo test --offline --workspace -j 2`. Sin cambios externos para arreglar gates.
Si hay deuda de base, registrar salida literal y continuar con lo verificable.
No crear tests complacientes ni modificar capturas reales.

## Bloqueos físicos y de contrato (no bloquean cortes independientes)

- **Fuel:** REVIEW existente usa litros, pero el PDF SHM denomina kg al campo.
  Los 62/120 con coche parado no prueban la unidad. La conversión está bloqueada:
  no inferir densidad ni presentar litros como demostrados. Level/capacity
  quedan Unavailable mientras se conserva consumo nativo y autonomía. Requiere captura de
  repostaje con cantidades visibles y consumo de al menos tres vueltas completas.
- **numberOfLaps:** el PDF Kunos 1.8.12 lo documenta como vueltas completadas,
  igual que completedLaps, no como duración total. Mantener `laps_total`
  ausente; capturar carrera por tiempo y configuración por vueltas, si ACC la
  permite, antes/tras salida, paso por meta y final. No derivar total del contador.
- **Modelo:** validez de vuelta, inlap/outlap, modelo GT3/GT4 (cup no lo es),
  temperatura/velocidad rivales y controles de carrera no tienen campos comunes
  adecuados. No extenderlos aquí; preguntar al orquestador si deben entrar en
  un corte de modelo. Daños sin escala, dirección del viento sin convención y
  presión sin señal siguen Unavailable/Unsupported, según REVIEW.
- **Fuente:** el núcleo establece Live en toda observación admitida; un OFF o
  una publicación solo de envejecimiento pueden verse Live con campos ausentes
  u obsoletos. No cambiar núcleo ni inventar reloj monotónico ACC; documentar si
  las pruebas requieren decisión del propietario de esa fase.
- **Prueba física:** aplazada por Isaac; no arrancar ACC ni abrir config real.
  Capturar jugador en movimiento (yaw, volante, delta ±), pit entry/service/exit,
  relevos/MP IDs altos, banderas combinadas por sector/coche, pausa/OFF/reanudación,
  cambio de sesión/pista, lluvia/viento no cero y registro durante >5 min con
  silencios/reinicio del juego. Guardar SHM+UDP, tiempos y hashes sin credenciales.

## Evidencia por hito

Documentación pública consultada: SDK Kunos v4 (copia de referencia)
https://github.com/nicholasxuu/ACC_broadcasting/blob/master/ksBroadcastingNetwork/BroadcastingNetworkProtocol.cs
y PDF Kunos 1.8.12
https://github.com/rrennoir/PyAccSharedMemory/blob/main/ACCSharedMemoryDocumentationV1.8.12.pdf.
SDK Disconnect escribe solo `[9]`; ACK readonly = byte 0. PDF graphics:
fuelXLap @1284 litros/vuelta, fuelEstimatedLaps @1412 vueltas;
gapAhead @1580 ms; numberOfLaps @172 vueltas completadas. Physics fuel
@12 documentado en kg; static maxFuel @416 no especifica unidad.

Gates iniciales: fmt FAIL ajeno en `ui/src/app.rs:385`; clippy FAIL ajeno
E0425 en `ui/src/standings/mod.rs:55`, falta `standings::project_player_class`.
No se modifican archivos de otros workers. Test workspace inicial PASS (exit 0);
el símbolo sí existe en HEAD: el primer E0425 no se reproduce en test y requiere
relectura del siguiente clippy, sin atribuirlo a una edición de este worker.
Los logs se conservan en `C:/tmp/acc-f6-*.log`;
la evidencia resumida y límites quedarán aquí y en `adapter/acc/REVIEW.md`.

### Corte 1 — fusión y señales

Regresiones antes del arreglo: tres FAIL (SHM pisa posición UDP, kg publicados
como litros, temperatura UDP omitida), `acc-f6-cut1-red.log`; UDP sin cambio de
valor no publica nueva recepción, FAIL en `acc-f6-live-red.log`.
Después: 26 tests ACC PASS, incluidos cuatro nuevos, en `acc-f6-cut1-acc.log`.
Se conservan las señales UDP frescas frente a SHM ausente/obsoleta; native
fuelXLap y autonomía usan exclusivamente el reloj graphics; physics.fuel y
maxFuel ya no se publican como litros. Temperaturas UDP completan physics sin
rejuvenecer viento/entradas. `numberOfLaps` no se convierte en duración.
El corpus y el hash permanecen intactos. Gates: test workspace PASS; clippy
workspace PASS tras `cargo clean --offline -p vantare-domain` en el target
propio (artefacto anterior incompatible; cero cambios de fuentes ajenas).
Fmt workspace FAIL únicamente en `ui/src/app.rs:385`, ya presente al entrar;
rustfmt de todas las rutas Rust tocadas PASS. Logs `acc-f6-cut1-{fmt,test}.log`,
`acc-f6-cut1-clippy-rebuilt.log`. No se declara fmt global verde.

### Corte 2 — grabadora

Dos reproducciones rojas: copia con packet externo 17 y blob 18 admitida,
y renovación tras silencio de 3 s (`acc-f6-recorder-red.log`,
`acc-f6-recorder-silence-red.log`). Primer focal tras arreglo: 17 PASS.
La grabadora valida antes/blob/después con lectura volátil de mappings Win32,
no renueva una conexión admitida hasta 10 s de silencio, no considera una
petición enviada como recepción, y retira con `[9]` antes de renovar.
Un ACK nuevo no retira la suscripción recién admitida. Se conserva puerto
durante reintentos de handshake de 2 s; ninguna renovación periódica con feed activo.
Drenaje máximo 256 datagramas por vuelta; peer ajeno excluido. Registro
solo lectura, sin usar commandPassword; texto de error de ACK no se conserva
ni imprime. Parser fijo y acotado del ACK sustituye cursor propio.
UTF-16 truncado/inválido y puerto cero rechazados; formato temporal intacto.
Esto prueba la política de silencio con vectores, **no** demuestra la causa
física de los re-registros cada ~2 min ni su desaparición con ACC real.
Gates finales: clippy workspace PASS (2.34 s); test workspace PASS; fmt FAIL
solo por la deuda inicial de UI. Primer clippy detectó dos restas de Instant
en el vector, corregidas con checked_sub; no se debilitaron checks.
Logs `acc-f6-cut2-{fmt,clippy,test}-final.log`. Producción de grabadora:
1478 →1449 líneas (+63/-92, neto -29); tests 422 →500 (+90/-12).
Sin dependencias nuevas ni cambios de esquema/corpus.

### Corte 3 — conformidad y cierre verificable

Tiempo de vuelta actual UDP 0 reproducido como Unavailable (FAIL), corregido
solo en parser ACC; best/last cero siguen ausentes y MAX sigue siendo sentinel.
El gap jugador no se publica como cero de clasificación estando en boxes.
Nuevo vector atraviesa traductor → núcleo → DTO v4: gaps generales derivados,
fuel nativo preservado, historial ausente sin litros, banderas sesión/sector/
coche, Waiting inicial → Live → Stale por silencio y DTO stale. Ocho familias
de proyección conservan resultado al relabelar únicamente Source acc→lmu.
El corpus obligatorio también comprueba esas ocho familias y contrasta fuelXLap
y fuelEstimatedLaps con la última graphics cruda mediante lector independiente.

**Bloqueos compartidos reproducidos, sin editar núcleo/modelo:**

- `source_off_and_expiry_only_observations_require_shared_core_decision`:
  actual `[Live, Live]`, esperado `[Waiting, Stale]`. `core/merge.rs:49` impone
  Live a toda observación; `core/mod.rs:157` refresca avance cuando falta
  source_time. Un cambio solo de calidad/caducidad no es una recepción nueva.
- `class_gap_from_native_player_ahead_requires_common_leader_anchor`:
  actual Unavailable, esperado Estimated(Time 2.5 s). `core/derive.rs:120-150`
  utiliza cero del líder en cálculo local sin publicarlo; `:170-203` requiere
  ese gap publicado como base de los gaps de clase.

Ambas pruebas quedan `ignored` **con motivo explícito**, tras ejecutarlas y
conservar FAIL 0 passed / 2 failed en `acc-f6-core-blocked.log`; no son pruebas
físicas ni se cuentan como conformidad satisfecha. Reproducir:
`cargo test --offline -p vantare-runtime --lib -j 2 completion_tests -- --ignored --nocapture`.
Resolver con propietario de núcleo/fase 2, mantener neutralidad y activar
ambos tests antes de aceptar la fase 6. No añadir if ACC fuera del adaptador.

Estado: entrega local para revisión, **fase 6 bloqueada en aceptación completa**.
Nivel/capacidad en litros y prueba física siguen bloqueados; duración total
en vueltas no expuesta se deja ausente por contrato, no se inventa.
Notion/GitHub remoto y medidas CPU/p99/OBS no verificados por restricciones
del encargo. El orquestador mantiene seguimiento y mide en serie.

## Entrega y gates finales

Gates ejecutados desde `native/`, offline, CARGO_BUILD_JOBS=2 / `-j 2`:

| Gate | Salida final | Evidencia local |
| --- | --- | --- |
| rustfmt --check de todas las rutas Rust tocadas | exit 0 | `C:/tmp/acc-f6-final-scope-fmt.log` |
| cargo fmt --check | exit 1; único diff heredado `ui/src/app.rs:385` | `C:/tmp/acc-f6-final-fmt-verified.log` |
| cargo clippy --workspace --all-targets -- -D warnings | exit 0, Finished dev 2.26 s | `C:/tmp/acc-f6-final-clippy-verified.log` |
| cargo test --workspace | exit 0; 437 passed, 0 failed, 6 ignored en 21 resúmenes; otros 7 escenarios lifecycle PASS | `C:/tmp/acc-f6-final-test-verified.log` |
| Reproducciones compartidas, --ignored | exit 101; 0 passed / 2 failed, valores literales arriba | `C:/tmp/acc-f6-core-blocked.log` |

Los 6 ignored son 4 físicos heredados + 2 bloqueos compartidos nuevos; no se
afirma suite íntegra ni aceptación verde. Conformidad ACC real: 2 PASS (36.77 s);
190 308 observaciones, 32 identidades, 133 muestras neutrales; hash congelado
verificado de nuevo. Logs rojos se conservan; clippy final no tiene avisos.
El primer E0425 desapareció al regenerar artefactos domain del target propio.
No se tocó UI para resolverlo. La deuda de formato requiere al dueño de UI.

Cambios de producción frente a base: +173/-142 líneas (neto +31);
tests +498/-17; generado 0; dependencias nuevas 0. Grabadora producción -29.
No se midió compilación incremental UI ni CPU/frame time: pertenece al
orquestador, y la carga concurrente no permite comparación representativa.

Archivos: este microplan; `native/runtime/src/adapter/acc/{REVIEW.md,live.rs,
protocol.rs,translate.rs}`; `native/runtime/src/bin/vantare-grabar-acc.rs`;
`native/runtime/tests/acc/{completion.rs,live.rs,translation.rs,weather.rs}`;
`native/runtime/tests/acc_conformance.rs`; `testdata/acc/README.md`.
No se modificó el tar.gz, modelo, núcleo, IPC, widgets ni otros adaptadores.

Commits previos: plan `a76072033be7d0bc0b2b0168d190bb319dba0eb5`;
fusión `34f9ef4bcc75737240be2b0023ec5b1f56db8aba`;
grabadora `6365894961d554b2319986ed4355a70685132820`.
El commit de conformidad final se obtiene con `git log -1`; todos son locales
y llevan `(ISA-1431)` y el trailer solicitado. Rama/base no cambiadas.
Sin push, PR, CI remoto, merge, promoción, release ni escrituras externas.
Seguimiento Notion no disponible; GitHub #1431 es referencia del encargo, sin
actualización remota. Siguiente paso: Opus revisa diff completo y deriva los
dos fallos reproducidos al dueño de núcleo; Isaac captura las sesiones descritas
para resolver unidades y validar runtime/OBS antes de aceptar fase 6.
