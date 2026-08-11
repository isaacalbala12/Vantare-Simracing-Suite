# Handoff vivo — Engineer/Spotter

Última revisión técnica: 2026-08-11.
Estado operativo: consultar Linear y Git; este documento no elige issue, rama
ni siguiente acción.

## Resultado y fronteras

Engineer acompaña al piloto en directo; Spotter se limita a seguridad,
proximidad y tráfico. Ambos consumen Telemetry Core, funcionan offline y nunca
inventan datos. Strategy posee la estrategia; Pit Manager no puede ejecutar
acciones sin contrato transaccional y confirmación.

## Autoridad técnica

- [ADR 0004](../../adr/0004-telemetry-core-modular-observation-architecture.md).
- [ADR 0005](../../adr/0005-engineer-projection-capability-contract.md).
- [Roadmap Engineer Beta](../../engineer/engineer-beta-roadmap.md).
- [Handoff de Telemetry Core](telemetry-core.md) y plan exacto enlazado por Linear.

## Estado técnico actual

El producto recibe observaciones canónicas; no posee un reader LMU. Policy,
scheduler, presentación multilingüe y transporte cancelable tienen una sola
autoridad. El canal visual y `engineer-radio` son productivos; Wails y SSE
comparten envelope de generación y secuencia.

El catálogo cerrado contiene 20 intents en cuatro locales. El diálogo textual
falla cerrado: las acciones requieren propuesta, readback, confirmación,
evidencia fresca y resultado. PTT detecta teclado, XInput y joystick compatible,
pero no abre micrófono. Raw HID genérico sigue no soportado.

STT productivo, wake word y TTS dinámico continúan NO-GO hasta disponer de
corpus humano consentido del catálogo real y superar los gates de voz. La
salida visual es el fallback seguro. Pit transaccional aún no está demostrado.

## Decisiones cerradas

- Una única proyección de Telemetry Core alimenta Engineer y Spotter.
- Missing, stale y unsupported bloquean la familia afectada; cero no significa
  ausencia.
- Spotter crítico puede preemptar Engineer no crítico.
- Presentación visual y futura voz comparten el mismo catálogo versionado.
- Replay, fixtures y voice-host de prueba no son evidencia de wiring real.
- Los modelos y binarios de voz no se versionan ni se descargan sin manifest,
  hash, límites, licencia y aprobación.

## Riesgos y bloqueos

- **P1:** ejecutar una acción de Pit sin confirmación o evidencia fresca.
- **P1:** presentar fixtures/replay como prueba de voz o telemetría real.
- **P1:** activar STT/wake word sin corpus consentido y métricas FAR/FRR.
- **P2:** divergencia entre texto, radio, Wails y SSE.
- **P2:** reintroducir adquisición LMU dentro de Engineer.

## Recomendación técnica

Resolver el corte que Linear autorice siguiendo el DAG del roadmap. Mantener
voz productiva bloqueada hasta su gate humano y probar cualquier acción de Pit
con puertos falsos, idempotencia, confirmación y cancelación antes de wiring.

## Evidencia

- [Contrato de proyección](../../engineer/projection-contract-and-legacy-consumers.md).
- [PTT ISA-185](../../engineer/ptt-input-isa-185.md).
- [Voice package host ISA-182](../../engineer/voice-package-host-isa-182.md).
- [Corpus humano ISA-181](../../engineer/human-corpus-voice-host-isa-181.md).
- [Selección TTS/STT ISA-180](../../engineer/tts-stt-selection-isa-180.md).
- [Cutover Engineer ISA-112](../../telemetry-core/engineer-cutover-isa-112.md).

## Historial

- [Cronología completa hasta 2026-08-10](../../archive/2026-08/handoffs/engineer-spotter-through-2026-08-10.md).
