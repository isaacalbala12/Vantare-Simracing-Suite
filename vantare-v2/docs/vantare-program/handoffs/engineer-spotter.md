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
- El futuro informe clean-room, spec, HTML, ADR y plan serán autoridad detallada.

## Estado

Existe código importado de DeepSeek/Engineer Release con monitores, audio,
comandos, SSE/Wails y UI. Se trata como no confiable hasta una auditoría.
La auditoría G3 y la matriz de rescate no demuestran funcionamiento. El
proyecto Linear `Engineer & Spotter — LMU Race Companion` ya existe. TC-08
migra la entrada; el producto vive aparte.

- Rama/base/SHA: aún no existen; la research issue debe fijarlos.
- Promoción: ninguna.
- Evidencia: auditoría G3 parcial y matriz de rescate; insuficientes.

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

- **P0 potencial:** falsos positivos del Spotter o mensajes caducados.
- **P0 potencial:** Pit Manager actúa sin verificación/fail-closed.
- **P1:** código importado cableado a mock/simulator.
- **P1:** licencias distintas entre código, modelos, voces y sound packs.
- **P1:** TTS/STT bloquea el hot path.
- **P2:** cobertura desigual en cuatro idiomas.

## Issues

| Estado | Issue |
|---|---|
| Activa | Ninguna |
| Siguiente | ENG-01, investigación clean-room y auditoría read-only |
| Cutover | TC-08, sin absorber el proyecto de producto |

## Siguiente acción exacta

Crear la issue de investigación; usar LMU, SimHub y replays sin modificar
producción. Base: GOV-01 publicado o la base limpia indicada en Linear.
Entregar matriz, capabilities, licencias, HTML, arquitectura, plan y handoff.
No crear monitores antes de demostrar wiring y señales.

## Última actualización

2026-07-27, ISA-120, Codex orquestador.
