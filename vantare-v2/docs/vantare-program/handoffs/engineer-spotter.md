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
- El paquete `docs/vantare-program/research/engineer-spotter/` contiene el
  informe clean-room, spec propuesta, matriz, fuentes, HTML y microplan.

## Estado

ISA-123 completó la investigación primaria y una auditoría read-only del
runtime. ISA-125 / ENG-02 está técnicamente cerrada tras review independiente
`ACCEPT` sin P0/P1/P2/P3: implementó el contrato específico de capabilities,
calidad y límites de cancelación, pero todavía no proyecta datos ni cambia
consumidores. TC-05A conserva la autoridad transversal sobre envelope,
versionado, ownership, fan-out y puertos; ENG-03 realizará la adaptación
explícita. El código legacy contiene lógica y
fixtures caracterizables, pero la ruta de producto arranca conectada al
simulador, no recibe aún la proyección de Telemetry Core y no garantiza
preempción de Spotter ni Pit transaccional. Por ello sigue sin ser confiable
como beta. TC-08 migra la entrada; el producto vive aparte.

- Rama activa: `vantareapp/isa-125-eng-02-contratos-engineerprojection-capabilities-y-envelope`.
- Base: `7a1cd702bc1f50e13a3f351360e6a018d0bd7423` (ENG-01).
- Promoción: ninguna.
- Evidencia: paquete ENG-01, ADR 0005, contrato x20, Telemetry/Engineer/global
  Go PASS, race x10, vet, frontend build para embed e inventario de 34
  consumidores productivos legacy. La auditoría G3 y matriz de rescate
  permanecen como historial, no como prueba de runtime. Una primera ejecución
  global expuso una intermitencia heredada del test de cancelación REST del
  driver LMU; focal x20 y repetición global pasaron.

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

- **P0 confirmado de honestidad:** servicio/UI arrancan conectados al simulador.
- **P0:** no existe garantía de preempción audible ni de mensajes no caducados.
- **P0:** Pit Manager carece de transacción y readback demostrados.
- **P1:** no existe aún la proyección Engineer de Telemetry Core.
- **P1:** licencias distintas entre código, modelos, voces y sound packs.
- **P1:** TTS/STT bloquea el hot path.
- **P2:** cobertura desigual en cuatro idiomas.

## Issues

| Estado | Issue |
|---|---|
| En revisión | ISA-123 / ENG-01, investigación aprobada técnicamente |
| Cerrada técnicamente | ISA-125 / ENG-02, ADR y contratos compilables; review independiente `ACCEPT` |
| Siguiente | ENG-03, payload y proyección pura desde Telemetry Core |
| Cutover | TC-08, sin absorber el proyecto de producto |

## Siguiente acción exacta

Entregar commit/push/PR/Linear de ENG-02. ENG-03 debe adaptar el contrato
transversal aprobado por TC-05A y añadir solo
el payload y projector demostrables desde el snapshot final de Telemetry Core,
con golden/replay y sin wiring productivo. No crear monitores antes de fijar
señales. Isaac decide la promoción posterior a `nightly`, no el inicio del
siguiente corte.

## Última actualización

2026-07-28, ISA-125 / ENG-02 cerrada técnicamente; review independiente
`ACCEPT` sin P0/P1/P2/P3 y límites incoherentes corregidos fail-closed.
