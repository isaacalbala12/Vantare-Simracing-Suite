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
No se modifican archivos de otros workers. Test workspace pendiente.
Los logs se conservan en `C:/tmp/acc-f6-*.log`;
la evidencia resumida y límites quedarán aquí y en `adapter/acc/REVIEW.md`.
