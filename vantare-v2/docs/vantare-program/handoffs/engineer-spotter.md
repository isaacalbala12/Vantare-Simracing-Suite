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
ISA-158 / ENG-05 introduce la policy y el scheduler determinista. ISA-167 /
ENG-06 cablea entrega productiva y preempción. ISA-177 / ENG-07 fija la
presentación multilingüe. ISA-178 / ENG-08 añade salida visual productiva,
routing por categoría y el widget funcional Vantare Crystal, actualmente en
revisión sin promoción. ENG-06 mantiene una única policy y un transporte
cancelable con ACK; ENG-07 aporta una única presentación para visual y futura
voz; ENG-08 no duplica ninguna de estas autoridades.
ISA-180 / ENG-09 cierra el primer gate técnico de voz: no autoriza TTS
productivo, deja `whisper.cpp` como STT condicionado y conserva la salida
visual como fallback. No cambia runtime ni dependencias de producto.
ISA-181 / ENG-10 añade corpus humano genérico y compara Whisper `tiny/base`.
`base` queda candidato condicionado, pero commands/FAR/FRR/wake word continúan
NO-GO hasta capturar un corpus humano consentido del catálogo real. No cambia
runtime, dependencias ni producto.
ISA-182 / ENG-11 añade un package manager y un voice-host estrictamente
test-only. El manifest, descarga, almacenamiento, ownership del hijo y teardown
quedan demostrados; no existe inferencia, micrófono, wiring o nueva autoridad
de voz. Commands, FAR/FRR, wake word y TTS dinámico siguen NO-GO.
TC-05A conserva la autoridad transversal sobre envelope, versionado,
ownership, fan-out y puertos. El código legacy contiene lógica y fixtures
caracterizables. ISA-111 retiró su adquisición de telemetría e ISA-112 conectó
la ruta productiva al único Telemetry Core. ENG-06 demuestra la preempción del
transporte existente; Pit transaccional todavía no está demostrado, por lo que
Engineer sigue sin ser confiable como beta completa. TC-08 migra la entrada;
el producto vive aparte.

ISA-109 / TC-08B compone esos contratos aprobados sobre la base canónica más
reciente y amplía la observación a sesión, parrilla, fuel, gaps y geometría.
No convierte a `telemetry.Frame`, porque perdería missing e identidades
generacionales. ISA-110 ha añadido un bridge exclusivamente de replay y
fail-closed: solo seis escenarios acotados pueden atravesarlo; no existe
conversión general. ISA-112 conecta ya esa entrada pura al único runtime LMU
productivo sin crear un segundo reader.

- Rama activa:
  `vantareapp/isa-182-eng-11-package-manager-y-voice-host-test-only`.
- Base: `46a7320d33c7ebb47bbcae44eac0f4fa01ed3ca9` (ISA-181 / ENG-10).
- Composición: ENG-02 a ENG-10 ya están en la base exacta. ENG-11 añade solo
  tooling, tests, contrato y evidencia test-only; no modifica producto.
- Promoción: ninguna.
- Evidencia ENG-11: manifest cerrado bajo Git; descargas con hash/tamaño,
  límites, cancelación y promoción segura; rutas y delete reparse-safe;
  controller con PID/protocolo/nonce/loopback, timeouts acotados y teardown
  total. Harness sintético 200 probes, 349,598 ms start, p95 20,445 ms, cero
  leases. 31/31 focal y 48/48 histórico x3 PASS. No inference, micrófono,
  modelo/binario/raw en Git, dependencia o wiring. Contrato:
  `docs/engineer/voice-package-host-isa-182.md`.
- Evidencia ENG-10: FLEURS original CC BY 4.0 fijado, cinco grabaciones por
  idioma en clean/ruido determinista, comparación `tiny/base`, WER/CER,
  latencia/CPU/RAM/cancelación y capture/import consentido. `base` es candidato
  lingüístico condicionado; commands, FAR/FRR y wake word permanecen NO-GO.
  No hay speaker IDs estables ni diversidad demostrable; `pt_br` solo tiene
  categoría `MALE`. Contrato: `docs/engineer/human-corpus-voice-host-isa-181.md`.
- Evidencia ENG-09: matriz por capa de runtime/modelo/voz/G2P, hashes,
  benchmark Windows CPU/DirectML, STT residente, WER sintético transparente y
  cancelación aislada. Kokoro medido es NO-GO; Whisper queda condicionado.
  `docs/engineer/tts-stt-selection-isa-180.md` conserva la decisión y
  `docs/evidence/isa-180/` los resultados sanitizados.
- Evidencia ENG-07: catálogo cerrado 20 × 4, presentación v1, roles/canales,
  penalty neutral, límites y fail-closed antes de `started`. Wails/SSE comparten
  bytes observables; el audio cache-only busca por texto de voz con fallback
  legacy solo de lectura. Tras review, el request de audio transporta el locale
  tipado de Presentation: caché y fallback se limitan a él, y cualquier
  mismatch queda visual-only. `all_clear` español no afirma pista global.
  Focal x20, fuzz 10 s / 2,24 M ejecuciones, benchmarks x5, Engineer,
  Server, Telemetry y Go global serial PASS. Vet focal PASS; vet global conserva
  tres warnings Win32 heredados. Race no disponible con `CGO_ENABLED=0`.
  Contrato: `docs/engineer/presentation-contract.md`.
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
  PASS. Review independiente aceptada en la base de ENG-06. El test heredado
  `cmd/vantare.TestHandleDiscoverAppsEmitsDetected` usa discovery real de
  Windows y es lento, pero pasa sin cambios; es deuda ajena, no bloqueo de
  ENG-05. Esta rama no toca Launcher ni `cmd/vantare`. El vet global conserva
  tres avisos Win32 heredados por `unsafe.Pointer`; vet focal pasa.
- Corrección de re-review: la cola poda hechos semánticamente invalidados antes
  de coalescing/presión. Con `MaxPending=1`, `car_left -> all_clear` conserva y
  emite el estado vigente; las transiciones P0 equivalentes y penalty neutral
  1 -> 2 tienen regresión y diagnóstico/orden reproducibles.
- Segunda corrección de re-review: `left/right -> three_wide` ya no pierde el
  aviso más específico aunque el lateral anterior siga siendo cierto. Una tabla
  tipada de cuatro estados Spotter define supersession, conserva el mejor aviso
  vigente con capacidades uno y mayores y rechaza degradaciones posteriores sin
  cambio de evidencia. No afecta fairness ni otras familias.
- Tercera corrección de re-review: los clears parciales son delivery-aware.
  ENG-05 los ligaba provisionalmente a `Next`; ENG-06 sustituye ese límite por
  `AcknowledgeStarted`. Un pendiente o una decisión solo seleccionada nunca
  cuentan como comunicación. Sin contexto se sustituyen por `car_left`, `car_right`,
  `three_wide` o `all_clear` según la Evidence actual. La matriz 1/4/64 cubre
  `both -> left/right`, cambios laterales, antecedente pending/selected,
  expiración, cancelación, transiciones intermedias y cambio de evidencia con
  el clear ya pendiente. Admisión y `Next` revalidan el mismo permiso. El
  estado histórico `dispatched` no era confirmación de audio; ENG-06 cierra esa
  frontera con un ACK contractual previo a la salida. Focal x50, fuzz 10 s, benchmarks
  x5, Engineer, Telemetry Core, Go global y vet focal pasan. El race no pudo
  repetirse tras esta corrección porque el entorno no dispone de toolchain C
  con headers Win32; el vet global conserva solo tres avisos heredados fuera
  del diff.
- Cuarta corrección de re-review: epoch/identidad válidos resetean la entrega
  Spotter antes de observar el estado del nuevo lifecycle; una transición de
  identidad inválida queda fail-closed. El contexto despachado conserva el
  `ExpiresAtMS` de su antecedente y se revalida justo antes de `Next`: válido
  antes del límite, inválido en y después del límite. `still_there` no renueva
  estado completo y las decisiones expiradas/canceladas no crean contexto. La
  matriz vuelve a cubrir capacidades 1/4/64.
- WIP ENG-06: `EngineerService` posee una única instancia de policy y convierte
  la salida aprobada del runtime desde la misma observación canónica. El puerto
  versionado confirma queued/started/terminal, revalida antes de start, cancela
  por source/lifecycle y une toda goroutine. Spotter P0 interrumpe audio
  Engineer ya iniciado; Engineer nunca interrumpe Spotter. Notificación visual
  y audio opcional comparten el transporte productivo. Métricas sanitizadas y
  replay v2 separan decisión, dispatch y start. Health añade contadores de
  policy y delivery sin IDs ni payloads. Engineer, Telemetry, Go global serial,
  race focal, vet focal, frontend build y benchmarks pasan; pendiente de review.
- Corrección de review ENG-06: el transporte productivo ya no llama al
  `AudioRouter.Resolve` capaz de sintetizar. Usa únicamente `ResolveCached`
  context-aware con timeout de 100 ms. El composition root instala el player
  cancelable existente y un router sin engine TTS, por lo que la preempción
  existe en el grafo real y un miss conserva la notificación visual. Tests
  adversariales cubren resolver bloqueado ante preempción, source loss y Stop.
  Replay v2 cubre disconnect/reconnect y exige snapshot fresco. Un benchmark
  end-to-end atraviesa Scheduler, queueLoop, transporte y ACK started con ocho
  submissions concurrentes y preempción Spotter. Pendiente de re-review.
- Corrección final WIP ENG-06: el borde de desconexión conserva
  `epoch`/identidad/`sequence` de la última observación aceptada. Producto y
  replay rechazan el snapshot igual y cualquier cursor anterior tras recovery;
  un cursor posterior del mismo epoch o un epoch nuevo legítimo es el único que
  puede reconectar. El incremento de `ReconnectAttempt` también crea el borde
  aunque el estado siga en `live`. Replay no marca connected ni limpia el borde
  hasta aceptar cursor e identidad/lifecycle; un `>S` inválido deja `S`
  rechazado. Las regresiones focales service/replay x10 y las rutas exactas x20
  pasan. El benchmark
  ya no usa un transporte auxiliar: atraviesa
  `productDeliveryPort -> ResolveCached -> AudioPlayer.PlayContext`, con ocho
  submissions concurrentes y preempción; 20x pasa a 65.310 ns/op y detiene el
  reloj al entrar en `PlayContext`. Race no disponible con `CGO_ENABLED=0`;
  vet focal pasa. Go global no concluyó en 124 s; vet global solo repite tres
  avisos Win32 heredados fuera del diff. Sin commit, push, PR, Linear ni
  promoción; listo para re-review independiente.

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
- ENG-09 demuestra que Kokoro CPU no cubre la latencia dinámica y que su pila
  Python medida incluye G2P GPL. No se distribuye ni se cablea hasta resolver
  licencia, rendimiento y escucha humana.
- `whisper.cpp`/Whisper multilingual es el candidato STT primario condicionado;
  debe superar corpus humano de cuatro idiomas antes de release.
- ENG-10 selecciona `base` solo para el siguiente corpus de comandos por su
  mejor WER/CER humano genérico. No autoriza release, PTT ni wake word.
- La inferencia futura vive en un único host local hijo y cancelable. Spotter,
  ingesta, scheduler y visual nunca esperan al host.
- Micrófono y transcripciones son memoria-only por defecto; cero recording.
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
- **Cerrado en ENG-06:** la policy impide mensajes
  caducados y Spotter P0 cancela el audio Engineer no crítico ya iniciado.
- **P0:** Pit Manager carece de transacción y readback demostrados.
- **P1 reducido:** la proyección pura está cableada a seis familias aprobadas;
  las familias parciales siguen correctamente deshabilitadas.
- **Cerrado en ENG-05:** pits solo admite entry/exit y el contador genérico de
  sanción se expresa como `penalties.count_increased`, nunca drive-through.
- **P1:** licencias distintas entre código, modelos, voces y sound packs.
- **P1:** TTS/STT bloquea el hot path.
- **Reducido en ENG-09:** existe inventario por capa y el aislamiento de proceso
  conserva heartbeat/cancelación. Sigue abierto el G2P GPL de Kokoro y falta
  corpus humano; por ello no hay wiring de voz.
- **Reducido en ENG-07:** los 20 intents admitidos tienen cobertura simétrica
  en cuatro idiomas. La validación lingüística perceptual y el catálogo futuro
  de TTS permanecen en cortes posteriores.

## Issues

| Estado | Issue |
|---|---|
| En revisión | ISA-123 / ENG-01, investigación aprobada técnicamente |
| Cerrada técnicamente | ISA-125 / ENG-02, ADR y contratos compilables; review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-127 / ENG-03, adaptación pura TC-05A -> ENG-02; re-review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-133 / ENG-04, runner/oráculo determinista; review `ACCEPT` |
| Cerrada técnicamente | ISA-158 / ENG-05, policy/scheduler; base aceptada de ENG-06 |
| Cerrada técnicamente | ISA-167 / ENG-06, wiring productivo y transporte preemptivo |
| En revisión | ISA-177 / ENG-07, presentación canónica multilingüe |
| En revisión | ISA-178 / ENG-08, subtítulos y widget de radio Vantare Crystal; reconexión autoritativa y carrera disabled corregidas en re-review |
| En revisión | ISA-180 / ENG-09, gate TTS/STT offline; TTS NO-GO, Whisper condicionado y review `ACCEPT` |
| En revisión | ISA-181 / ENG-10, corpus humano genérico; `base` condicionado, commands/FAR/FRR/wake word NO-GO; review independiente sin findings abiertos |
| En revisión | ISA-182 / ENG-11, package manager y voice-host test-only; lifecycle demostrado, command readiness NO-GO |
| Cerrada técnicamente | ISA-109 / TC-08B, entrada pura completa sin wiring |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |

## Siguiente acción exacta

ISA-182 / ENG-11 queda en revisión, sin wiring ni promoción. No iniciar ENG-12
hasta review independiente. El siguiente corte debe conservar command
readiness NO-GO y no puede cablear PTT, comandos, wake word o TTS sin corpus
humano consentido y gates lingüísticos por idioma.

## Última actualización

2026-08-02, ISA-182 / ENG-11 crea un manifest v1 cerrado, package manager
test-only y un único voice-host hijo cancelable. Descarga, SHA-256/tamaño,
redirects, storage, reparse points, promoción, PID/protocolo/nonce, timeout,
shutdown y carreras concurrentes quedan cubiertos. La evidencia de lifecycle
usa un artefacto sintético externo y no hace inferencia. ENG-11 suma 31 tests;
la suite histórica completa pasa 48/48 tres veces seguidas. Sin modelos,
binarios, audio, raw, micrófono, dependencia, wiring o promoción. PTT, comandos,
wake word y TTS continúan NO-GO.

2026-08-02, ISA-181 / ENG-10 mide FLEURS humano en cuatro locales con clean y
ruido blanco determinista. Whisper `base` mejora la precisión general frente a
`tiny`, pero tarda aproximadamente el doble y usa más memoria. Se selecciona
solo como candidato del siguiente gate. El corpus no contiene comandos ni
speaker IDs estables: intent accuracy, FAR/FRR y wake word siguen NO-GO. El
tooling exige consentimiento explícito, preview/delete/cleanup y mantiene
audio/modelos/raw fuera de Git. Sin wiring, dependencia o promoción. Review
independiente cerrada sin findings P0-P3 razonables abiertos.

2026-08-02, ISA-180 / ENG-09 ejecuta un gate reproducible de licencias,
rendimiento y aislamiento. Kokoro ONNX CPU queda NO-GO para voz dinámica y su
stack Python NO-GO para bundle propietario por G2P GPL; DirectML falla en int8
y fp16. Whisper.cpp residente queda condicionado tras ~0,60 s por frase y
cancelación aislada, pero solo inglés supera el smoke literal. `es/it/pt-BR`
requieren corpus humano. No hay micrófono, modelos en Git, dependencia ni
wiring productivo; radio/subtítulos siguen siendo fallback.
El review independiente final cierra el guard de contaminación de puerto y el
lifecycle del worker con `ACCEPT`, sin P0/P1/P2/P3 razonables abiertos. La PR
permanece draft y ENG-10 no se ha iniciado.

2026-08-02, corrección completa de review ISA-178 / ENG-08: `engineer-radio`
forma parte del contrato persistente Go y pasa roundtrip. `disabled` se filtra
antes de policy/delivery y no preempta trabajo de otra familia. Wails y SSE usan
un envelope único `generation+sequence` con snapshot de reconexión exacto.
Subtítulos y radio son superficies independientes sobre el mismo ViewModel;
Studio muestra fixture marcada y Desktop/OBS solo runtime real. El historial
respeta rol, los renderers aplican `lang` y 12 capturas root-only se comparan
contra baselines fijos sin máscaras. Gates focales Go/TS y build pasan; pendiente
de gates globales finales y re-review, sin promoción.

2026-08-02, corrección de review ISA-177 / ENG-07: el locale tipado de la
presentación gobierna ambos lookups de audio. La voz configurada solo puede
usarse si coincide exactamente; `es`, `it` y `pt-BR` no leen assets ingleses
ni de otro locale, y los cuatro idiomas sí leen sus assets coincidentes. Un
mismatch queda visual-only. El resolver inyectable recibe locale, texto de voz,
canal e intent legacy; nunca recibe el intent como voz. `all_clear` español es
«Todo libre». Focal x20, Engineer/Server/Telemetry/global, fuzz, benchmarks y
vet focal pasan; race sigue indisponible con `CGO_ENABLED=0`.

2026-08-02, ISA-177 / ENG-07 añade un resolver puro y versionado con los 20
intents aprobados en español, inglés, italiano y portugués brasileño. La misma
presentación alimenta texto y futuro audio; rol, canal, severidad, prioridad y
TTL son canónicos. Un catálogo, locale o parámetro inválido falla antes del ACK
`started`. Wails/SSE conservan paridad exacta y el audio sigue cache-only,
ahora indexado por texto de voz con fallback legacy de solo lectura. Gates
focales, repetidos, fuzz, benchmarks y global serial PASS; pendiente de review
independiente y sin promoción.

2026-08-02, ISA-167 / ENG-06 conecta una sola policy al `EngineerService`
productivo y añade un puerto cancelable con lifecycle ACK. La revalidación
ocurre justo antes de `started`; contexto Spotter y cooldown no avanzan antes.
La notificación existente y el audio opcional usan el mismo transporte.
Spotter P0 preempta audio Engineer no crítico, lifecycle/source cancelan y el
servicio une sus goroutines. La ruta real usa player cancelable y resolución
cache-only acotada, nunca síntesis. Replay v2 añade reconnect con snapshot
fresco; el benchmark end-to-end cubre presión/preempción. Gates técnicos PASS;
WIP pendiente de re-review y sin promoción.

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
