# ISA-1038 — cierre del saneamiento local

Fecha: 2026-09-08. Revisión personal, sin subagentes, con Ponytail y code review.
Código candidato: `5a5feb44`; base de revisión inicial: `286f99e8` / código
`4ce96ded`. Rama documental `vantareapp/isa-1038-review-closeout`.

## Veredicto

Los siete hallazgos conocidos tienen corrección local, regresiones y límites
registrados. La revisión por flujos inicial y esta revalidación están realizadas.
Esto permite preparar contratos y propuestas del editor. **No acredita todavía
el editor completo, filtros calibrados, óptimo global ni aceptación real Wails.**

No es una garantía de ausencia de otros bugs. La cobertura inicial está en
[README.md](README.md); se conserva y no se sustituye por revisar solo este diff.
La revalidación cubre cambios de cálculo/replay, horizontes, calidad de boxes,
catálogo/progreso, deadline, composición de confianza, clientes y superficies
existentes. No se crean secciones nuevas ni se alteran umbrales empíricos.

## Resolución y evidencia

| Hallazgo | Corte local | Resultado y límite |
|---|---|---|
| R1/R3, #1041 | `b7991919` | Plan final valida cargas Fuel/VE, reserva y costes mediante replay. Diferencia factibilidad de optimalidad. [Evidencia](../isa-1041-final-evaluation.md). |
| R2, #1042 | `1ac45d69`, `5a5feb44` | Horizonte del plan normal incluye boxes y reloj final; ciclos devuelven error. Weather declara comparación a distancia fija con vueltas del plan evaluado. [Reloj](../isa-1042-timed-horizon.md), [clima](../isa-1042-weather-comparison-scope.md). |
| R4, #1043 | `bb266977` | Visitas completas a boxes dentro de una vuelta se etiquetan; conservan uso para boxes y se excluyen de ritmo. [Evidencia](../isa-1043-pit-overlap.md). |
| R5, #819 | `b85fa5f4` | Catálogo autorizado manda sobre progreso: pérdidas reintentables, sin duplicación ni cambio de consentimiento al consultar. [Evidencia](../isa-819-catalog-reconciliation.md). |
| R7, #821 | `b1211c99` | Deadline por candidato propagado; éxito tardío descartado. Cancelación cooperativa, no interrupción forzosa de todo I/O/CPU. [Evidencia](../isa-821-candidate-deadline.md). |
| R6, #445 | `686b1c23` | Producción sin fixture/clave TEST; caché TEST rechazada y aplicación solo a combinación canónica exacta. Publicación real pendiente. [Evidencia](../isa-445-reference-boundary.md). |

Puntos de entrada actuales: `orbit_final_evaluation.go:15`,
`orbit_timed_horizon.go:14`, `lapvalidity.go:456`,
`coldstart/reconciliation.go:15`, `coldstart/service.go:209` y
`cmd/vantare/main.go:4216`. Los paths completos están en el inventario final.

## Revisión de calidad

- Corrección: cada fallo reproducible pasó de RED a GREEN. No se quitaron
  verificaciones para ocultarlo; el golden temporal cambió a 136 vueltas y
  cuatro paradas, con llegada evaluada de cuatro horas.
- Sencillez: se reutiliza replay/reserva, se eliminan dos cálculos duplicados,
  y no se crea otro lector, motor o framework de edición.
- Arquitectura: Analysis conserva observaciones/calidad; Strategy mantiene
  reglas/planes y el solver. No hay nuevas dependencias ni scripts/hooks globales.
- Seguridad: confianza TEST retirada de composición; no se concede autorización
  por discovery, nombres o respuestas tardías. No se accede a secretos.
- Rendimiento: no se afirma una mejora medida. Persisten acumulación de páginas,
  hasta cuatro candidatos concurrentes y reescritura de catálogo+backup; requieren
  medición antes de ampliar corpus/escala. Deadline no sustituye presupuesto de RAM.

## Checks y alcance de la evidencia

Cada corte Go ejecutó `go test ./...` después de construir assets. Los cortes
frontend ejecutaron build, typecheck real, lint y suite global. Sobre el último
candidato `5a5feb44`: **Go completo PASS; frontend 416 archivos / 3256 tests PASS,
275.55 s, exit 0; build/typecheck/lint/digest/diff check PASS.**

Logs locales: `C:/tmp/vantare-isa1042-weather-go-final.log`,
`C:/tmp/vantare-isa1042-weather-frontend-final.log` y logs separados de
build/typecheck/lint. Happy DOM emite AbortError durante teardown; la suite
termina correctamente. El trabajo documental no repite tests de código idéntico.

No ejecutado: Wails físico, prueba de fallo eléctrico real, nuevo benchmark,
lectura de holdout, predicción de una carrera completa independiente o integración
física del helper en estos últimos cortes. Tests y trazas no sustituyen esas pruebas.

## Qué falta y orden de continuación

1. **#1033 documental:** contrato/ADR de correcciones y microplanes, con originales
   intactos, revisiones y conflictos. Puede prepararse sin inventar umbrales.
2. **#1030 empírico:** anotación independiente de preparación, métricas por familia,
   criterios revisados con Isaac y carreras completas nuevas reservadas. Las 19
   carreras largas conocidas ya se habían observado; las cuatro reservadas tienen
   solo 1–4 vueltas. Se solicitó una ruta adicional; no se asume respuesta.
3. **Wails y reader:** perfil aislado, runtime confiado, recuperación/cancelación y
   recorrido visible. Conservar el perfil real, originales y LMU.
4. **Propuesta visual:** asistente + pantalla editable; revisión de Isaac previa a
   implementación según la spec aprobada. No está entregada por estos fixes.
5. **F1–F5 por issues:** fuente original/copia opcional, correcciones, resultados
   parciales, reglas/inventario/perfiles al solver, revisiones reproducibles y
   contraste con enumeración acotada. El adapter actual aún no demuestra óptimo
   global después de restricciones y asignaciones de pilotos.
6. **Después de aceptación:** investigación OSS y diseño live/Monte Carlo.
   La optimización temporal multiescenario avanzada permanece aplazada.

La evidencia insuficiente impide cerrar aceptación o fijar filtros definitivos;
no impide preparar el contrato documental. No se rebaja ese gate por tener tests
verdes. No se ha implementado el rediseño completo de la edición manual.

## Verificación manual y estado Git

En un perfil de prueba: recuperar catálogo/progreso y reintentar pérdidas; revisar
causa de timeout; comprobar referencias vacías y aviso de comparación a distancia
fija; recalcular el caso de cuatro horas y revisar cargas/reserva. Los microplanes
contienen las regresiones deterministas. Estas instrucciones no afirman ejecución.

Stack local desde `nightly@d6d0992f` con ramas por issue. Código final `5a5feb44`,
base inmediata `686b1c23`; este cierre solo modifica documentos. Sin push, PR,
CI remota, merge, promoción, release ni cambios de datos originales. Las únicas
acciones externas fueron actualizaciones autorizadas de issues del trabajo.

## Archivos del saneamiento

`A` creado, `M` modificado; ninguno movido o eliminado. Inventario contra la
base documental de auditoría `286f99e8`, hasta `5a5feb44`:

```text
M	vantare-v2/cmd/vantare/main.go
A	vantare-v2/cmd/vantare/strategy_reference_catalog_test.go
M	vantare-v2/docs/roadmap/plan.md
M	vantare-v2/docs/roadmap/roadmap.json
A	vantare-v2/docs/strategy-planner/evidence/isa-1041-final-evaluation.md
A	vantare-v2/docs/strategy-planner/evidence/isa-1042-timed-horizon.md
A	vantare-v2/docs/strategy-planner/evidence/isa-1042-weather-comparison-scope.md
A	vantare-v2/docs/strategy-planner/evidence/isa-1043-pit-overlap.md
A	vantare-v2/docs/strategy-planner/evidence/isa-445-reference-boundary.md
A	vantare-v2/docs/strategy-planner/evidence/isa-819-catalog-reconciliation.md
A	vantare-v2/docs/strategy-planner/evidence/isa-821-candidate-deadline.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-candidate-deadline.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-catalog-reconciliation.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-final-evaluation.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-pit-overlap.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-reference-boundary.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-timed-horizon.md
A	vantare-v2/docs/superpowers/plans/2026-09-08-strategy-weather-comparison-scope.md
M	vantare-v2/docs/vantare-program/handoffs/strategy-planner.md
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyAnalysisPanel.test.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyAnalysisPanel.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyColdStartBanner.test.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyColdStartBanner.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyOrbitPage.wiring.test.tsx
A	vantare-v2/frontend/src/hub/strategy-orbit/StrategyReferencePanel.test.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyReferencePanel.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyWeatherPanel.test.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/StrategyWeatherPanel.tsx
M	vantare-v2/frontend/src/hub/strategy-orbit/strategy-cold-start.ts
M	vantare-v2/frontend/src/hub/strategy-orbit/strategy-orbit-bridge.test.ts
M	vantare-v2/frontend/src/hub/strategy-orbit/strategy-reference-catalog.test.ts
M	vantare-v2/frontend/src/hub/strategy-orbit/strategy-reference-catalog.ts
M	vantare-v2/frontend/src/hub/strategy-orbit/testdata/orbit-go-golden.json
M	vantare-v2/frontend/src/i18n/locales/strategy-orbit/en.ts
M	vantare-v2/frontend/src/i18n/locales/strategy-orbit/es.ts
M	vantare-v2/frontend/src/i18n/locales/strategy-orbit/it.ts
M	vantare-v2/frontend/src/i18n/locales/strategy-orbit/pt.ts
M	vantare-v2/frontend/src/strategy/strategy-application-client.test.ts
M	vantare-v2/frontend/src/strategy/strategy-application-client.ts
M	vantare-v2/internal/strategy/application/orbit_calculation.go
M	vantare-v2/internal/strategy/application/orbit_calculation_test.go
A	vantare-v2/internal/strategy/application/orbit_final_evaluation.go
A	vantare-v2/internal/strategy/application/orbit_final_evaluation_test.go
A	vantare-v2/internal/strategy/application/orbit_timed_horizon.go
A	vantare-v2/internal/strategy/application/orbit_timed_horizon_test.go
M	vantare-v2/internal/strategy/application/types.go
M	vantare-v2/internal/strategy/catalog/consumer.go
A	vantare-v2/internal/strategy/coldstart/deadline_test.go
A	vantare-v2/internal/strategy/coldstart/reconciliation.go
A	vantare-v2/internal/strategy/coldstart/reconciliation_test.go
M	vantare-v2/internal/strategy/coldstart/service.go
M	vantare-v2/internal/strategy/coldstart/service_test.go
M	vantare-v2/internal/strategy/solver/replay_v2.go
M	vantare-v2/internal/strategy/solver/replay_v2_test.go
M	vantare-v2/internal/strategy/solver/reserve.go
M	vantare-v2/internal/telemetryanalysis/lapvalidity.go
A	vantare-v2/internal/telemetryanalysis/lapvalidity_pit_overlap_test.go
```
