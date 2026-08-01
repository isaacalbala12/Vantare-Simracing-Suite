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
re-review independiente `ACCEPT` sin P0/P1/P2/P3. TC-05A conserva la autoridad transversal sobre envelope,
versionado, ownership, fan-out y puertos. El código legacy contiene lógica y
fixtures caracterizables. ISA-111 retiró su adquisición de telemetría e
ISA-112 conectó la ruta productiva al único Telemetry Core. La preempción
audible y Pit transaccional todavía no están demostrados, por lo que Engineer
sigue sin ser confiable como beta completa. TC-08 migra la entrada; el
producto vive aparte.

ISA-109 / TC-08B compone esos contratos aprobados sobre la base canónica más
reciente y amplía la observación a sesión, parrilla, fuel, gaps y geometría.
No convierte a `telemetry.Frame`, porque perdería missing e identidades
generacionales. ISA-110 ha añadido un bridge exclusivamente de replay y
fail-closed: solo seis escenarios acotados pueden atravesarlo; no existe
conversión general. ISA-112 conecta ya esa entrada pura al único runtime LMU
productivo sin crear un segundo reader.

- Rama activa:
  `vantareapp/isa-127-eng-03-adaptacion-del-payload-engineer-sobre-tc-05a`.
- Base: `efcc77c60f173a160e8c186f54ccfb43da5be692` (TC-05A).
- Composición: merge local `b5d69e7` incorpora ENG-02 `df0c202`.
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
- **P0:** no existe garantía de preempción audible ni de mensajes no caducados.
- **P0:** Pit Manager carece de transacción y readback demostrados.
- **P1 reducido:** la proyección pura está cableada a seis familias aprobadas;
  las familias parciales siguen correctamente deshabilitadas.
- **P1:** licencias distintas entre código, modelos, voces y sound packs.
- **P1:** TTS/STT bloquea el hot path.
- **P2:** cobertura desigual en cuatro idiomas.

## Issues

| Estado | Issue |
|---|---|
| En revisión | ISA-123 / ENG-01, investigación aprobada técnicamente |
| Cerrada técnicamente | ISA-125 / ENG-02, ADR y contratos compilables; review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-127 / ENG-03, adaptación pura TC-05A -> ENG-02; re-review independiente `ACCEPT` |
| Cerrada técnicamente | ISA-109 / TC-08B, entrada pura completa sin wiring |
| Cerradas técnicamente | ISA-110 / TC-08C, ISA-111 / TC-08D e ISA-112 / TC-08E |

## Siguiente acción exacta

Entregar ISA-112 con commit/push/PR draft y actualizar Linear. Después ISA-113
debe auditar consumidores alcanzables antes de que ISA-114/115 retiren el
backend y transporte legacy. No hay promoción en esta cadena.

## Última actualización

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
