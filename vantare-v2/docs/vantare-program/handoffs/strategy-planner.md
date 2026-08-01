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

STR-00 quedó aceptado tras review independiente. STR-01 rescata Product A solo
como oráculo histórico aislado; no integra su rama ni conecta sus contratos al
producto. La UI canónica usa estrategias a la izquierda, stints al centro e
inventario/entrada a la derecha.

Actualización ISA-134 / STR-00:

- Proyecto activo: `Strategy Planner — Race Strategy Suite`.
- Product A/B/C quedan como fases históricas de un único producto.
- Product A auditado: `codex/strategy-product-a@b9f1937`.
- Base aprobada: `ISA-117@170eaeb`.
- Divergencia: 371 commits de la base y 44 de Product A.
- Simulación: 94 paths = 87 auto-merged + 7 conflictos; 6.751 inserciones y 5
  eliminaciones.
- Veredicto: rescate selectivo; prohibido merge/cherry-pick por rango.
- Allowlist STR-01: un fixture exacto + 24 paths del dominio solo por port
  manual; los otros 69 paths están en denylist.
- Las 26 issues PB están `Canceled` como superseded, enlazadas al mapa y sin
  borrar historia. El backlog canónico son 24 cortes: ISA-136..157 más
  ISA-162/163.
- Productores: ISA-159 (Analysis histórico) e ISA-160/161 (Core live).
- Promoción: ninguna; ISA-136 está implementada en su rama y pendiente de
  review independiente.

## Decisiones

- Modos manual, asistido y live.
- Fuentes históricas, recording, live, inputs y reglas.
- Neumáticos individuales con ID, compuesto, desgaste, condición, stints,
  posición, origen y estado.
- Un neumático usado queda ligado a FL/FR/RL/RR; se permiten combinaciones
  mixtas de Soft/Medium/Hard/Wet cuando las reglas del evento lo permitan.
- Clasificación puede dejar 80–90 %; sin datos se usa manual o rango 40–70 %.
- Fuel y Virtual Energy son recursos separados.
- Objetivo: menor tiempo total con incertidumbre; rápida, robusta y conservadora.
- Safety Car/FCY/lluvia/daños/penalizaciones forman parte del producto final.
- Galerías separan Vantare, Comunidad y Mis planes; privado por defecto.
- STR-03/ISA-138 posee en exclusiva repositorio, atomicidad, migraciones,
  drafts, revisiones y recovery. STR-15A/ISA-150 solo posee queries/UI de `Mis
  planes` y paquetes import/export a través de ese repositorio; no duplica
  persistencia.
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

- Auditoría: `docs/strategy-planner/str-00-audit.md`.
- Matriz: `docs/strategy-planner/rescue-matrix.md`.
- Mapa: `docs/strategy-planner/pb-to-str-map.md`.
- ADR: `docs/adr/0006-strategy-planner-unified-domain-and-ownership.md`.
- Plan: `docs/superpowers/plans/2026-08-01-strategy-planner-unified-master.md`.
- Ownership: `docs/strategy-planner/projection-ownership.md`.
- Product A exacto: Go focal/vet, 25 tests frontend y build pasan; el smoke
  Playwright histórico se bloquea y debe reemplazarse en STR-07.
- Caracterización STR-01:
  `docs/strategy-planner/str-01-product-a-characterization.md`.
- Paquete histórico: `internal/strategy/producta`; 25/25 paths de la allowlist,
  fixture exacto y 24 blobs Go iguales salvo el namespace.
- Guard de entrega: denylist 69/69, manifiesto versionado del delta y discovery
  de raíz compatible con `-trimpath`.
- Issue activa: ISA-136 / STR-01, pendiente de review independiente.

## Siguiente acción exacta

Review independiente de ISA-136. Si queda `ACCEPT`, entregar commit/push/PR
draft y continuar ISA-137 / STR-02 sobre esta rama apilada. No convertir
`internal/strategy/producta` en contrato productivo ni tocar integraciones
transversales antes de sus cortes.

## Última actualización

2026-08-01, ISA-136 / STR-01, Codex.
