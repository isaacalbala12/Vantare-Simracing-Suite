# Handoff vivo — Strategy Planner

## Resultado

Un único producto que crea, compara, guarda, ejecuta y adapta planes para
minimizar tiempo total esperado y mostrar riesgos/alternativas. Product A/B/C
son fases históricas.

## Autoridad y lectura

- `docs/vantare-program/README.md` y `product-contract.md`.
- Este handoff y `Strategy Planner — Race Strategy Suite` en Linear.
- `docs/superpowers/specs/2026-07-13-strategy-planner-product-b-design.md` y
  `strategy-base.html` son referencias históricas que deben reauditarse.
- El próximo informe de rescate y plan unificado sustituirán los planes PB.

## Estado

El calculador manual está validado. Linear conserva proyectos B/C que deben
unificarse sin perder documentos, issues ni historial. La UI canónica usa
estrategias a la izquierda, stints al centro e inventario/entrada a la derecha.

Actualización ISA-120:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product C queda cancelado como contenedor histórico.
- Rama histórica Product A: `codex/strategy-product-a`; su SHA se reaudita.
- Base de nueva implementación: no fijada.
- Promoción: ninguna.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten compuestos mixtos.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- Correcciones no destructivas y tabla avanzada.
- Live explica cambio, impacto, propuesta y consecuencia.
- Engineer propone, piloto acepta, Strategy actualiza, Overlays leen.
- El LLM redacta voz/texto; no calcula la estrategia.

## Riesgos

- **P1:** escenarios históricos no auditados usados como autoridad.
- **P1:** duplicar Core o el almacenamiento de Analysis.
- **P2:** Monte Carlo opaco o innecesario; determinista es la base.
- **P2:** preservar contratos débiles por evitar un refactor pre-lanzamiento.

## Evidencia e issues

- Product A declaró frontend, build, Playwright y Go focal en verde, pero debe
  revalidarse desde la base integrada real.
- Backlog ISA-42–67 conserva nomenclatura PB y debe reauditarse.
- Issue activa: ninguna.

## Siguiente acción exacta

Unificar Linear, inventariar Product A/docs B/C, crear matriz de rescate y plan
único por fases sobre TC-06. Primera issue: STR-00, auditoría y replanificación
del backlog. Sin código hasta cerrar esa matriz.

## Última actualización

2026-07-27, ISA-120, Codex orquestador.
