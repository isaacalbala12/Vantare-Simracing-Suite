# Vantare — expediente canónico del programa

Estado: vigente desde ISA-120, 2026-07-27.

Este directorio concentra las decisiones confirmadas por Isaac y el contexto
mínimo para continuar Vantare sin depender de conversaciones anteriores. No
reemplaza las especificaciones técnicas detalladas: las enlaza, indica cuál
sigue vigente y registra el estado operativo.

## Orden de lectura obligatorio

1. `AGENTS.md`.
2. Este documento.
3. `product-contract.md`.
4. `project-map.md`.
5. `execution-policy.md`.
6. El handoff del proyecto asignado en `handoffs/`.
7. La issue de Linear, el ADR y el plan o microplan activo.

Si dos documentos se contradicen:

1. prevalecen las decisiones más recientes de este directorio;
2. después, la evidencia comprobable del código y del runtime;
3. después, ADR y planes vigentes;
4. Linear decide estado, dependencias, rama y entrega;
5. los documentos históricos se conservan como contexto, no como orden de
   ejecución.

No se usa la skill `vantare-core`: está desactualizada y no es fuente de verdad.

## Documentos

- `product-contract.md`: alcance, experiencia, licencias, privacidad e idiomas.
- `project-map.md`: módulos, fronteras, dependencias y estado.
- `execution-policy.md`: flujo Linear/Git, autonomía, reviews y promoción.
- `research-policy.md`: investigación de productos, repositorios y apps.
- `handoff-template.md`: contrato común para los handoffs.
- `handoffs/telemetry-core.md`: núcleo live y siguiente corte TC-04D.
- `handoffs/telemetry-analysis.md`: análisis post-sesión.
- `handoffs/engineer-spotter.md`: Engineer Beta, Spotter, voz y Pit Manager.
- `handoffs/strategy-planner.md`: producto unificado, sin A/B/C.
- `handoffs/overlays-launcher-hub.md`: Studio, widgets, Launcher y Hub.
- `handoffs/platform-commercial.md`: cuenta, Billing, calendario, ajustes,
  releases, roadmap y migración.

## Reglas de continuidad

- Cada proyecto mantiene un único handoff vivo.
- Todo worker lo actualiza si cambia estado, arquitectura, decisiones, tests,
  riesgos o siguiente acción.
- El comentario final de Linear enlaza el handoff y enumera evidencia real.
- Mocks, capturas y tests no pueden presentarse como prueba de runtime real.
- Los hallazgos fuera de alcance se registran en Linear.
- Contenido pertenece a Isaac y queda fuera de la ejecución autónoma. Los
  agentes solo preparan borradores cuando se les solicita.

## Situación al crear este expediente

- El checkout compartido `refactor` contiene cambios locales y no es una base
  segura para nuevos cortes.
- ISA-37 (`44c7513499f1ab88ebf1aedbc02d3b8e5feda99e`) es el último corte apilado
  de Telemetry Core y está en revisión.
- TC-04D y TC-05–TC-09 permanecen pendientes.
- Billing sigue en NO-GO comercial.
- ISA-120 consolidó Strategy en `Strategy Planner — Race Strategy Suite`,
  conservó Product C como proyecto histórico y creó proyectos propios para
  Telemetry Analysis y Engineer/Spotter.
