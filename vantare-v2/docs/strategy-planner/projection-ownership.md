# Strategy Planner — ownership y blockers de proyecciones

**Fecha:** 2026-08-13
**Autoridad:** ADR 0006 y Linear

## Regla

Strategy tiene dos entradas distintas. Ninguna puede producirse dentro de
Strategy y ninguna comparte almacenamiento interno con el consumidor.

| Contrato | Productor/owner | Issue productora | Consumidor | Issue consumidora |
| --- | --- | --- | --- | --- |
| `StrategyInputProjection v1` | Telemetry Analysis | ISA-159 / TA-05 | Adapter histórico Strategy | ISA-145 / STR-10 |
| `StrategyLiveProjection v1` | Telemetry Core | ISA-160 / TC-10A + ISA-161 / TC-10B | `internal/strategy/live` mediante el adaptador in-process de `internal/app` | ISA-152 / STR-17 + ISA-340 / STR-17A |

## Proyección histórica

ISA-159 está bloqueada por ISA-132 / TA-04. Produce desde el modelo público de
Analysis, no desde DuckDB ni rutas de archivos expuestas al consumidor.

Debe publicar por familia:

- identidad/compatibilidad de sesión;
- vueltas incluidas/excluidas;
- ritmo y rangos;
- Fuel y Virtual Energy;
- neumáticos/desgaste por posición y compuesto;
- pit loss y condiciones;
- procedencia, confianza, unidad y versión de cálculo.

Una familia ausente queda `unsupported` o `missing`; no bloquea las familias
demostradas. ISA-145 está bloqueada explícitamente por ISA-159 y solo adapta el
contrato al draft.

## Proyección live

ISA-160 / TC-10A está integrada en `nightly@8880a88` y fija el inventario
ejecutable: Fuel, pit y progreso están soportados; Virtual Energy, identidad,
compound, wear/corner de tyres y weather permanecen unsupported/missing.

ISA-161 se construyó originalmente desde esa integración de ISA-160. Su primer
rebase local fue sobre `origin/nightly@234794d`; su base y merge-base actuales
son `origin/nightly@b6df494`.

ISA-161 / TC-10B convierte el contrato compile-only anterior en un productor
live dentro de su rama de issue. Reutiliza el único driver/pipeline de
Telemetry Core y proyecta desde el mismo `FinalState` que Overlay. Publica:

- sesión: source time, end time, remaining y maximum laps;
- progreso: vuelta, sector y distancia de vuelta;
- pit;
- Fuel amount/capacity obtenidos atómicamente del mismo campo canónico;
- presencia, procedencia y freshness por campo;
- capabilities `session`, `progress`, `pit` y `fuel`.

Overlay conserva `Hub()` y Strategy usa `StrategyHub()` separado. Wails expone
status/projection namespaced y replay de status; SSE registra únicamente
`GET /telemetry/strategy/projection`, loopback-only. Los snapshots son latest
full/resync full y no se fabrica delta. Lifecycle, fail-stop y teardown poseen
ambos hubs. VE, tyres, weather y facts siguen ausentes sin fallback.

ISA-161 fue aceptada por Isaac e integrada mediante squash del PR
[#212](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/212) en
`nightly@b2e4067809d31152fdcf374875179e577d483c03`. El
[gate post-promoción](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31708164123)
pasó completo. ISA-152 / STR-17 se implementó sobre una rama aislada desde ese
SHA y se integró mediante squash del PR
[#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219) en
`nightly@8de4f511972757476d96d6a525b69c8917f4ca56`. El
[gate post-promoción](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/31748815965)
pasó completo. El motor puro importa solo el contrato Strategy público y el
adaptador consume una única suscripción del Hub ya creado. No abre Shared
Memory, REST, driver, transporte alternativo ni storage.

El read model conserva cursor, lifecycle, stint, Fuel y próxima acción con
estados explícitos `missing/fresh/stale/invalid/unsupported`. Solo
`present+fresh` bajo source live es usable. Los objetivos Fuel son entradas
exactas del plan: si no existe objetivo para la vuelta completada, la desviación
queda missing. Un reconnect incrementado degrada el snapshot anterior incluso
si el Hub coalesce estados intermedios y entrega `live -> live`.

La evidencia opt-in LMU recorre el único pipeline canónico hasta el motor y
observó cursor `1/3`, vuelta `0` y Fuel `98/115 L` fresh; sin objetivo, la
desviación permaneció missing.

ISA-340 / STR-17A resuelve la frontera de arranque sin añadir una segunda
fuente. Sobre `origin/nightly@d9e4bd352b62824b0e83a05b5c3c631fec1f0c73`,
el HEAD productivo local `668f54c3e87d9a26f41d593d71713e86b48a1134`:

- busca la referencia activa completa exacta y su hash entre las revisiones
  inmutables ya decodificadas por el repositorio;
- acepta solo `strategy.editor.v1` estricto y mapea únicamente ID y `lapCount`
  de cada stint; `FuelTargets` queda `nil`;
- abre un repositorio Strategy y comparte esa instancia entre el bridge y un
  único snapshot de startup; no hay hot-reload de una activación posterior;
- entrega el engine como consumer opcional al `TelemetryCoreRuntime`, que lo
  ejecuta una vez sobre su `StrategyHub` y lifecycle existentes;
- ante ausencia, mismatch, incompatibilidad o error de repositorio deshabilita
  solo Strategy live y registra una razón sanitizada.

No aparecen readers LMU, hubs, endpoints, transportes ni persistencia paralelos.
La prueba manual con LMU/Wails y reinicio sigue pendiente. ISA-153 / STR-18 queda
técnicamente desbloqueable, no terminada. La rama continúa local, Linear sigue
`In Progress` y no hubo push, PR, CI, merge, promoción ni release. Evidencia:
`docs/strategy-planner/evidence/isa-340-active-revision-live-wiring.md`.

## Dependencias ejecutables

```text
ISA-132 / TA-04
  -> ISA-159 / TA-05 StrategyInputProjection producer
      -> ISA-145 / STR-10 consumer
          -> ISA-146 / STR-11 derived planning inputs

ISA-117 / TC-09F
  -> ISA-160 / TC-10A signal audit/schema
      -> ISA-161 / TC-10B StrategyLiveProjection producer
          -> ISA-152 / STR-17 consumer
              -> ISA-340 / STR-17A active revision startup wiring
                  -> ISA-153 / STR-18 técnicamente desbloqueable
```

## Guards requeridos

- Strategy no importa `internal/telemetryanalysis` storage/SQL ni drivers LMU.
- Analysis no importa el dominio privado de Strategy.
- Core no contiene cálculo de planes.
- Contract tests prueban productor old/new contra consumidor old/new.
- Los valores stale/missing/invalid nunca se convierten en cero o estimación.
- La ausencia de una capability no habilita un fallback sintético.
