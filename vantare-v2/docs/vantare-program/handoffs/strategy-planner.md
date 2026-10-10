# Handoff vivo — Strategy Planner

Estado de la base indicada; releer la issue antes de ejecutar.
[Histórico completo por SHA](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/handoffs/strategy-planner.md): conserva IDs, decisiones, informes, fallos y evidencia de cada ronda. No copiar ese diario aquí.

## 1. Resultado

Documento único, preparación manual/asistida con procedencia y cálculo determinista con presupuestos explícitos. Strategy live mínimo está pospuesto tras beta (#1484); un plan factible no demuestra precisión ni optimalidad global.

## 2. Autoridad y lectura verificada

Leídos [#1459](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1459) y [#1458](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1458) con rondas/fallos, [#1484](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1484) y [Strategy/README](../../../native/strategy/README.md). GitHub/Project Vantare contiene prioridades; [ADR 0006](../../adr/0006-strategy-planner-unified-domain-and-ownership.md) conserva ownership y [ADR 0099](../../adr/0099-arquitectura-rust-nativa.md) el stack. #1561 registra/relee el cambio documental.

## 3. Estado real y canal

Base de código contrastada: `origin/nightly@ca17545f607b85f5d47dc9d060721b69e6a6a158`. Esta compactación vive en `vantareapp/isa-1561-docs`; no cambia producto ni acredita integración de las ramas de ola 2. SHA final y push en [#1561](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1561) y `C:/tmp/buzon/1561-docs.md`. Sin PR, merge, promoción ni release por este encargo. La base contiene solver nativo con semilla y tests; el antiguo «no entrega incumbent» de #1458 no describe todos los casos actuales. #1458 sigue abierta por calidad/estabilidad de búsqueda, #1459 por precisión. No ejecutar SDD Go/TS desde estados ISA-831/STR-09 antiguos.

## 4. Decisiones cerradas

- Documentos `strategy.v2`, esquemas 2.0.0/2.1.0; migración explícita sin inventar reglas.
- Fuel/VE, formación, neumáticos, pilotos, clima y reglas mantienen unidades, calidad/procedencia y límites separados.
- Revisión exacta y correcciones no destructivas; una selección no se sustituye por una fuente más reciente.
- `proven`/`no_solution` se refieren al ámbito/discretización del certificado. Agotar presupuesto puede devolver incumbent con `not_proven`; cancelación/input inválido no publica plan.
- Engineer propone, piloto acepta; LLM redacta, no resuelve. No solver paralelo ni imputación sintética de datos ausentes.

## 5. Arquitectura y ownership

[Crate Strategy](../../../native/strategy/README.md) posee documento/repositorio/solver, sin runtime/GPUI. [Hub Strategy](../../../native/hub/src/strategy.rs) presenta edición/cálculo; consultas y guardado síncronos fuera de render/adquisición. Analysis posee histórico y no recibe ownership del solver. La generación del repositorio no es exclusión entre escritores independientes.

## 6. Evidencia y límites

Evidencia registrada en la base, no reejecutada por esta entrega documental: integración #1531, fmt/check/Clippy `-D warnings`, Nextest 1574/1574 (7 skips heredados), lifecycle 18/18 y telemetría 25/25. No convierte fixtures/replays en prueba física LMU/ACC, OBS, DPI, audio ni latencia de entrada. #1459 ronda 4: 50 sesiones originales, 232 replays y tests de procedencia; precisión estricta 2/4 planificadas, cobertura 4/7. La hipótesis capacity-ve no tiene holdout independiente posterior a seleccionarla. #1458 conserva witness/entradas selladas y comparación 112; semilla nativa con deadline acotado (≤200 ms) no garantiza incumbent en todo input. Evidencia `C:/tmp/isa-1459-evidence/round4/` y `C:/tmp/isa-1458-evidence/round2/`, registrada, no repetida aquí.

## 7. Riesgos y deuda

- P1: carga/formato previos no certificados, consumo/ritmo transferidos y selección de hipótesis (#1459).
- P2: incumbent inferior Fuji, explosión de frontera y estabilidad bajo carga (#1458). Fallo Fuji23h con candidate_budget_exhausted y repetición PASS se conservan; causa no demostrada.
- No interpretar `not_proven` como inviabilidad ni aumentar presupuestos como arreglo.
- Datos de entrenamiento/calibración no sustituyen holdout ni carrera real con predicción sellada.

## 8. Issues terminadas, activas y pendientes

Activas abiertas: #1459 (banco/precisión), #1458 (búsqueda), #1484 (live tras beta). #1536/arreglos de integración cerrados en base. ISA-694, F0–F7b, T/STR y estados de revisiones antiguas permanecen por SHA, sin renumeración ni promoción inferida.

## 9. Siguiente acción exacta

#1459: obtener carga y condiciones previas certificadas, validar capacity-ve en holdout independiente y medir predicción sellada frente a carrera sin usar datos objetivo. #1458: reproducir el fallo de presupuesto bajo carga con la entrada exacta, medir tiempo a incumbent/calidad/frontera/memoria y preservar witness/contratos; no relajar aserciones. Ejecutar tests focales/oráculos y gates nativos en la rama de área. #1484 espera planificación posterior a beta.

## 10. Última actualización

2026-10-10 · GitHub #1561 · Codex. Código, README del área e issues leídos; seguimiento #1561 escrito y releído. Las siguientes acciones de área proceden de las issues abiertas, sin nuevas autorizaciones implícitas. El diario y los avances por ronda se escriben en la issue; aquí se sustituye el estado.
