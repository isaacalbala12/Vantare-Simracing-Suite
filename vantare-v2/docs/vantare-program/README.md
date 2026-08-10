# Vantare — expediente canónico del programa

Estado: vigente desde ISA-120; revisado el 2026-08-05.

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
6. `../branch-channels.md` cuando haya ramas, promociones o releases.
7. El handoff del proyecto asignado en `handoffs/`.
8. La issue de Linear, el ADR y el plan o microplan activo.

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
- `research/engineer/crewchief-clean-room-brief-2026-08-10.md`: única salida
  de la auditoría competitiva destinada a implementadores de Engineer.
- `handoffs/strategy-planner.md`: producto unificado, sin A/B/C.
- `handoffs/overlays-launcher-hub.md`: Studio, widgets, Launcher y Hub.
- `handoffs/platform-commercial.md`: cuenta, Billing, calendario, ajustes,
  releases, roadmap y migración.

## Reglas de continuidad

- Cada proyecto mantiene un único handoff vivo.
- Todo worker lo actualiza si cambia estado, arquitectura, decisiones, tests,
  riesgos o siguiente acción.
- El orquestador lo actualiza inmediatamente despues de revisar cada worker o
  tomar una decision material; no se espera al final de una fase larga.
- Los workers no crean subagentes por defecto. La delegacion anidada requiere
  autorizacion expresa y acotada del orquestador.
- El comentario final de Linear enlaza el handoff y enumera evidencia real.
- Mocks, capturas y tests no pueden presentarse como prueba de runtime real.
- Los hallazgos fuera de alcance se registran en Linear.
- Contenido pertenece a Isaac y queda fuera de la ejecución autónoma. Los
  agentes solo preparan borradores cuando se les solicita.

## Situacion operativa vigente

- El flujo fisico es `rama de issue -> nightly -> testers -> master`.
- El checkout principal se usa para ejecutar el conjunto de `nightly`; cada
  issue conserva rama y worktree propios.
- `develop` y `refactor` son historia y no reciben trabajo nuevo. Los checkouts
  historicos sucios se preservan hasta una limpieza trazada.
- Los handoffs de este directorio, Linear y `docs/current-plan.md` contienen el
  estado por proyecto; este indice no duplica listas de issues que caducan.
- Testing Center es un proyecto independiente y no se mezcla con la
  orquestacion de los modulos de producto salvo que una issue lo indique.
