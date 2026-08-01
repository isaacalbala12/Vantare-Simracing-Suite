# Handoff vivo — Engineer/Spotter

## Resultado

Engineer Beta acompaña al piloto en directo; Spotter se limita a seguridad,
proximidad y tráfico. Consumen Telemetry Core, funcionan offline y nunca
inventan datos. La beta incluye paridad funcional avanzada aplicable de
CrewChief, Pit Manager y wake word.

## Autoridad y lectura

- `docs/vantare-program/README.md`, `product-contract.md` y
  `research-policy.md`.
- Este handoff y el proyecto Linear del módulo.
- ADR 0004 y el handoff de Telemetry Core.
- `docs/telemetry-core/engineer-rescue-matrix.md` y
  `docs/engineer/audits/g3-parity-audit.md` son evidencia histórica.
- La investigación clean-room y su interfaz de referencia permanecen en la
  rama/PR de ISA-123; TC-08 incorpora solo los contratos necesarios, no sus
  assets ni su UI experimental.

## Estado

ISA-123 completó la investigación primaria y una auditoría read-only del
runtime. ISA-125 / ENG-02 está técnicamente cerrada tras review independiente
`ACCEPT` sin P0/P1/P2/P3. ISA-127 / ENG-03 integró ENG-02 sobre TC-05A y
añadió el adaptador puro hacia `ObservationV1`; quedó técnicamente cerrada tras
re-review independiente `ACCEPT` sin P0/P1/P2/P3. ISA-133 / ENG-04 añade el
runner y oráculo determinista test-only sobre la base final de Telemetry Core.
ISA-158 / ENG-05 introduce la policy y el scheduler determinista, todavía sin
wiring productivo y pendiente de review independiente.
TC-05A conserva la autoridad transversal sobre envelope, versionado,
ownership, fan-out y puertos. El código legacy contiene lógica y fixtures
caracterizables. ISA-111 retiró su adquisición de telemetría e ISA-112 conectó
la ruta productiva al único Telemetry Core. La preempción audible y Pit
transaccional todavía no están demostrados, por lo que Engineer sigue sin ser
confiable como beta completa. TC-08 migra la entrada; el producto vive aparte.

ISA-109 / TC-08B compone esos contratos aprobados sobre la base canónica más
reciente y amplía la observación a sesión, parrilla, fuel, gaps y geometría.
No convierte a `telemetry.Frame`, porque perdería missing e identidades
generacionales. ISA-110 ha añadido un bridge exclusivamente de replay y
fail-closed: solo seis escenarios acotados pueden atravesarlo; no existe
conversión general. ISA-112 conecta ya esa entrada pura al único runtime LMU
productivo sin crear un segundo reader.

- Rama activa:
  `vantareapp/isa-158-eng-05-policy-y-scheduler-determinista-de-mensajes`.
- Base: `6861bd1a1b3ae9f221e701c1db7396c8d8a07650` (ISA-133 / ENG-04 aceptada).
- Composición: ENG-03 ya está en la base; su única regresión test-only
  posterior se reaplica sin importar documentación o producto ajenos.
- Promoción: ninguna.
- Evidencia: paquete ENG-01, ADR 0005, contrato x20, Telemetry/Engineer/global
  Go PASS, race x10, vet, frontend build para embed e inventario de 34
  consumidores productivos legacy. La auditoría G3 y matriz de rescate
  permanecen como historial, no como prueba de runtime. Una primera ejecución
  global expuso una intermitencia heredada del test de cancelación REST del
  driver LMU; focal x20 y repetición global pasaron.
- Evidencia ENG-03: golden TC-05A + golden específico Engineer, contrato de
  consumidor, capabilities, calidad, contradicciones e identidad. Focal x20,
  projection, 31 paquetes Engineer, vet, race x10 y frontend build PASS.
  Global conserva la contención Windows conocida de settings. Telemetry hizo
  aflorar una ejecución load-sensitive heredada del teardown REST LMU; su test
  aislado x20 pasa y el driver no forma parte del cambio. El único P1 de
  review, capability standings ausente cuando solo `LapNumber` era usable,
  quedó corregido con una regresión de flujo completo. Re-review `ACCEPT`.
- Evidencia ENG-04: reloj virtual, informe versionado, golden deliberado y
  fixtures sintéticas; determinismo x50, cinco estados observables, matriz
  21/21, boundaries de lifecycle y fail-closed por calidad/capability/versión.
  El reloj hace suma checked con headroom de deadlines, `session.started`
  cancela pendientes y el límite canónico de 104 vehículos se valida antes
  del bridge.
  Engineer, Telemetry, Go global serial, race focal x10, build de embed y
  aislamiento productivo PASS. El vet focal pasa; el vet amplio conserva dos
  avisos Win32 heredados fuera del diff. `docs/engineer/replay-oracle.md`
  conserva el contrato, comandos y hallazgos. Re-review independiente final:
  `ACCEPT`, P0/P1/P2/P3 = 0.
- Evidencia ENG-05: contratos v1, orden total estable, preempción P0,
  revalidación de TTL/evidencia/claim semántico, dedupe/coalescing/cooldowns,
  límites de memoria y diagnósticos, lifecycle sin evidencia reutilizable,
  protección contra starvation, soak y benchmark saturado. El golden ENG-04
  atraviesa la policy; sanciones son neutrales y pits sigue limitado a
  entry/exit. Focal, Engineer completo, race focal, vet focal y gate Go global
  PASS. Review independiente aún pendiente. El test heredado
  `cmd/vantare.TestHandleDiscoverAppsEmitsDetected` usa discovery real de
  Windows y es lento, pero pasa sin cambios; es deuda ajena, no bloqueo de
  ENG-05. Esta rama no toca Launcher ni `cmd/vantare`. El vet global conserva
  tres avisos Win32 heredados por `unsafe.Pointer`; vet focal pasa.

## Decisiones

- Clean-room: comportamiento/documentación como referencia; contratos, textos,
  audio, UI y código propios.
- Spotter/peligro interrumpe; lo demás espera o reemplaza pendientes.
- Prioridad: Spotter, banderas, daño, fuel/energía, pit/estrategia,
  penalizaciones, carrera, rendimiento/motivación.
- Código fija intención/dato/prioridad/acción; plantillas propias generan
  críticos; ningún LLM decide el camino crítico.
- Personalidades Profesional, Cercano y Exigente son perfiles declarativos.
- TTS/STT offline, multi-motor si Kokoro no cubre cuatro idiomas.
- PTT por teclado, volante, gamepad, button box e HID.
- Wake words traducidos: Ingeniero, Engineer, Ingegnere, Engenheiro.
- Confirmación de voz para acciones; dos fallos pasan a PTT/UI.
- Audio separado, hot-plug/fallback y cero grabación de micrófono por defecto.
- Pit Manager prepara, explica, confirma, envía, verifica y falla cerrado.
- Strategy solo cambia tras aceptación.
- Subtítulos y widget de radio Crystal forman parte del proyecto.
- Spotter p95 <150 ms desde decisión estable a inicio del audio.
- TC-05A define el envelope transversal; ENG-02 no duplica su versionado,
  clocks, ownership, fan-out ni puertos.
- La API visible por Engineer usa tipos de producto y no exige importar
  schema/envelope.
- Los snapshots son latest-wins: un salto entre versiones observadas no es un
  gap de hechos ni exige resync.
- Capability unknown, unsupported y degraded son diferentes. Solo un campo
  fresh con capability supported es utilizable sin decisión adicional.
- Reset de epoch y cambios de equipo, piloto, coche, sesión o evento cancelan
  decisiones pendientes de Engineer.

## Alcance Beta

Spotter carretera/multiclase; sesiones; banderas; rivales; fuel/Virtual Energy;
neumáticos/daños demostrables; pit/estrategia; motivación; PTT; wake word;
consultas; Pit Manager; cuatro idiomas; subtítulos, overlay, diagnóstico y
personalidades. Capabilities ausentes se documentan y no se simulan.

## Primera entrega

1. Auditoría CrewChief/DRE y licencias.
2. Auditoría read-only de Vantare.
3. Matriz conservar/endurecer/rehacer/eliminar.
4. Capabilities reales de Telemetry Core.
5. Bench TTS/STT y licencias comerciales.
6. HTML interactivo.
7. Arquitectura y microplan.
8. Implementación incremental con replays y review.

## Riesgos

- **Cerrado en ISA-111/112:** servicio/UI ya no arrancan conectados ni ofrecen
  simulator/replay como fuente productiva.
- **P0 reducido:** la policy garantiza preempción de decisiones pendientes y
  ausencia de mensajes caducados; la preempción audible se probará al cablear
  el transporte.
- **P0:** Pit Manager carece de transacción y readback demostrados.
- **P1 reducido:** la proyección pura está cableada a seis familias aprobadas;
  las familias parciales siguen correctamente deshabilitadas.
- **Cerrado en ENG-05:** pits solo admite entry/exit y el contador genérico de
  sanción se expresa como `penalties.count_increased`, nunca drive-through.
- **P1:** licencias distintas entre código, modelos, voces y sound packs.
- **P1:** TTS/STT bloquea el hot path.
- **P2:** cobertura desigual en cuatro idiomas.

## Issues

| Estado | Issue |
|---|---|
| En revisión | ISA-123 / ENG-01, investigación aprobada técnicamente |
| Cerrada técnicamente | ISA-125 / ENG-02, ADR y contratos compilables; review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-127 / ENG-03, adaptación pura TC-05A -> ENG-02; re-review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-133 / ENG-04, runner/oráculo determinista; review `ACCEPT` |
| En implementación | ISA-158 / ENG-05, policy/scheduler; review independiente pendiente |
| Cerrada técnicamente | ISA-109 / TC-08B, entrada pura completa sin wiring |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |

## Siguiente acción exacta

Revisar ISA-158 / ENG-05. Si queda aceptada, el siguiente corte puede cablear
decisiones al runtime/transporte sin añadir una fuente alternativa y deberá
probar la preempción audible. No hay promoción en esta cadena.

## Última actualización

2026-08-01, ISA-158 / ENG-05 añade una policy/scheduler síncrona, versionada y
acotada. Revalida evidencia y claims semánticos antes de encolar y emitir,
prioriza Spotter, evita starvation no crítico, coalesce duplicados, aplica
cooldowns, invalida evidencia en lifecycle y evita mensajes caducados. El
oráculo ENG-04 la prueba con Runtime real; pits solo admite entry/exit y la
sanción genérica ya no afirma drive-through. No hay wiring, audio, UI, fuente,
I/O, goroutine o dependencia nueva. Pendiente de review.

2026-08-01, ISA-133 / ENG-04 crea un runner test-only con reloj virtual,
fixtures sanitizadas y un oráculo v1 de emitted/suppressed/expired/cancelled/
unavailable. Recorre las seis familias aprobadas y bloquea toda familia o
decisión sin evidencia. El golden deja visibles dos deudas para ENG-05: pits
solo aprueba entry/exit y el contador de sanción no demuestra drive-through.
No existe wiring productivo, fuente, audio, I/O o goroutine nueva.

2026-08-01, ISA-114 retira el selector y adapters de fuente muertos, el parser
LMU paralelo y los readers experimentales sin instancia productiva. Se
conservan monitores, Spotter, audio/TTS, commands, Pit Manager, store, SSE y
replay explícito. Los monitores Extended mantienen únicamente un decoder puro
de buffer para tests: no puede abrir memoria compartida ni REST. La aplicación
solo los alimenta mediante la proyección canónica de ISA-112.

2026-08-01, ISA-112 / TC-08E conecta `EngineerService` al mismo lote canónico
que alimenta Overlay. El estado de fuente no se confunde con datos; un snapshot
usable completa la conexión y stale/error/stop resetean pendientes. La captura
real LMU 1.4 de 38 coches atraviesa driver, reducer, proyección y servicio con
una apertura dentro de ese runtime y silencio Spotter ante tráfico lejano.
ISA-113 detectó una segunda adquisición del shell legacy, que no alimenta
Engineer y se retira en ISA-114. El solape audible real se valida en el gate
manual final.

2026-08-01, ISA-111 / TC-08D elimina la adquisición propia de
`EngineerService`. El servicio consume observaciones/hechos, falla cerrado por
familia y mantiene simulator/replay únicamente como harness explícito. Health
ya no anuncia una conexión sintética. La raíz productiva se cablea en ISA-112.

2026-08-01, ISA-109 / TC-08B amplía y endurece ENG-03 sobre ISA-130. La entrada
de producto conserva full grid, fuel, gaps, geometría y calidad; sigue sin
wiring, sin retirada legacy y sin promoción.

2026-08-01, ISA-110 / TC-08C caracteriza Spotter + 20 monitores. Se aprueban
Spotter normal, fuel, penalties genéricas, laps, timings y pit entry/exit;
las familias parciales o sin capability quedan explícitamente bloqueadas. El
bridge temporal solo existe en replay y no puede alimentar el runtime entero.
