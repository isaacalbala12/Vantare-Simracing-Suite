# STR-00 — Matriz de rescate de Product A

**Fuente:** `codex/strategy-product-a@b9f193720b80484150691512a3fb1e09da9db41f`
**Destino:** Strategy Planner unificado sobre `ISA-117@170eaeb`
**Regla:** rescatar ideas y archivos permitidos de forma selectiva; nunca hacer
merge completo ni cherry-pick por rango.

## Leyenda

- **KEEP:** evidencia que puede conservarse sin convertirla en autoridad.
- **HARDEN:** recuperar con contrato, implementación o tests nuevos.
- **REWRITE:** conservar la intención y rehacer la implementación.
- **REIMPLEMENT:** no copiar el archivo; implementar de nuevo en la base actual.
- **DEFER:** no entra todavía en el corte indicado.
- **DELETE-LATER:** retirar solo tras probar consumidores cero y rollback.

## Dominio y aplicación

| Pieza | Acción | Motivo | Corte |
| --- | --- | --- | --- |
| `canonical-cases.json` y test de 10.000 seeds | KEEP | Oráculo histórico útil, no verdad física | STR-01 |
| Tipos de unidades | HARDEN | Buena intención; Fuel y VE deben ser dominios incompatibles | STR-02 |
| Draft histórico | REWRITE | Falta versionado, objetivo y procedencia | STR-02 |
| Validaciones básicas | HARDEN | Reutilizar casos, ampliar invariantes y errores tipados | STR-02 |
| Cálculo por vueltas | HARDEN | Aritmética útil; validar redondeo y casos límite | STR-05 |
| Cálculo por tiempo | HARDEN | Validar vuelta final y semántica LMU/evento | STR-05 |
| Modelo Fuel | HARDEN | Separar capacidad, start, reserve y save | STR-05 |
| Modelo Virtual Energy | REWRITE | No puede compartir magnitudes ni margen con Fuel | STR-05 |
| Descomposición de pit | HARDEN | Mantener componentes; presets versionados por simulador | STR-05 |
| TyreUnit y esquina persistente | HARDEN | Pilar correcto; separar inventario de estimación | STR-06 |
| Curvas de desgaste | HARDEN | Procedencia/confianza y manual/estimado/medido | STR-06/11 |
| Stints | HARDEN | Convertir a entidades del PlanRevision | STR-08 |
| Comparación | HARDEN | Comparar tiempo, riesgo, rango y confianza | STR-13 |
| Sensibilidad | HARDEN | Útil para robustez, requiere unidades y escenarios | STR-13 |
| Solver Product A | REWRITE | No integra degradación y mezcla recursos | STR-12 |
| `strategy_service.go` | REIMPLEMENT | La persistencia y lifecycle actuales cambiaron | STR-03/04 |
| `strategy_bridge.go` | REIMPLEMENT | Debe exponer comandos/snapshots versionados actuales | STR-04 |
| `strategy_export.go` | REIMPLEMENT | `mustJSON` en el commit exacto y paquete futuro distinto | STR-15 |
| Cambios en settings | REIMPLEMENT | Integrar sobre Settings actual, no mezclar diff antiguo | STR-03 |

## Frontend

| Pieza | Acción | Motivo | Corte |
| --- | --- | --- | --- |
| Tests de inputs/warnings/timeline | KEEP/HARDEN | Caracterizan flujos manuales útiles | STR-01/07 |
| Store histórico | REWRITE | Debe separar draft, revisión, activo y ejecución | STR-04 |
| Contrato TypeScript | REWRITE | Debe generarse/espejar el contrato versionado | STR-02/04 |
| `StrategyInputs` | REIMPLEMENT | Recuperar comportamiento, no diseño antiguo | STR-07/09 |
| `StrategyAdvancedTable` | REIMPLEMENT | Entrada avanzada, sin duplicar Analysis | STR-09/10 |
| `StrategyTimeline` | REIMPLEMENT | Evoluciona a tarjetas de stint centrales | STR-07/08 |
| `StrategyTyreInventory` | REIMPLEMENT | Inventario derecho y DnD explícito | STR-07/08 |
| `StrategyComparison` | REIMPLEMENT | Tres variantes principales y riesgos | STR-13 |
| Plan manager/export/print | REIMPLEMENT | Galerías y paquetes unificados | STR-03/15 |
| Calendar import | DEFER | Consumir evento versionado, no acoplar UI de Calendar | STR-14 |
| Onboarding | DEFER | Después de estabilizar el workspace | STR-21 |
| Harness histórico | REWRITE | Smoke se bloquea y no cubre el HTML final | STR-07 |
| `HubApp`, Topbar, navigation | REIMPLEMENT | Rutas actuales son autoridad | STR-07 |
| Locales | REIMPLEMENT | Añadir claves sobre catálogos actuales | Por corte UI |
| `index.css` | REIMPLEMENT | No importar estilos globales antiguos | STR-07 |
| Access policy | REIMPLEMENT | Aplicar catálogo gratuito/Pro vigente | STR-07/21 |
| Calendar pages/dock | NO RESCUE | Fuera del módulo; usar contratos públicos | — |

## Documentación

| Documento | Acción | Motivo |
| --- | --- | --- |
| Investigación TinyPedal | KEEP histórico | Inspiración funcional, no fuente legal/técnica |
| Arquitectura Product A | SUPERSEDE | Sustituida por ADR unificado |
| Manual Product A | KEEP histórico | Ayuda a caracterizar UX validada |
| Bridge decision | SUPERSEDE | Cambiaron Telemetry Core y Analysis |
| Plan Product A | KEEP histórico | Evidencia de implementación |
| Guías Product B/C | SUPERSEDE | Ya no existen como productos separados |
| Spec Product B 2026-07-13 | KEEP histórico | Conserva UI/reglas útiles; ownership parcial obsoleto |
| Planes PB de ISA-21 | KEEP histórico | El mapa PB -> STR preserva trazabilidad |

## Integraciones externas

| Integración | Owner | Contrato permitido | Prohibido |
| --- | --- | --- | --- |
| Telemetry Core | Core | `StrategyProjection` live versionada | Leer Shared Memory/REST desde Strategy |
| Telemetry Analysis | Analysis | Proyección histórica/estadística versionada | Abrir DuckDB/archivos privados desde Strategy |
| Engineer | Engineer | Propuesta y comando de aceptación | Mutar tablas privadas de Strategy |
| Overlays | Overlays | Read model de ejecución | Escribir plan o draft |
| Calendar | Calendar | Evento/reglas versionados | Importar store/UI del calendario |
| Billing | Billing | Capability de acceso | Lógica comercial dentro del solver |

## Condiciones de retirada

Ningún archivo histórico marcado `DELETE-LATER` se elimina hasta que:

1. búsqueda estática y dinámica demuestre consumidores cero;
2. el reemplazo tenga tests y evidencia visual/funcional;
3. exista migración o compatibilidad para documentos persistidos;
4. el rollback sea un commit/revert claro;
5. el corte STR-22 haya pasado revisión independiente.
