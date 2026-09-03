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
8. La issue de GitHub, el ADR, `../roadmap/plan.md` y el plan o microplan activo.

Si dos documentos se contradicen:

1. prevalecen las decisiones más recientes de este directorio;
2. después, la evidencia comprobable del código y del runtime;
3. después, ADR y planes vigentes;
4. GitHub Issues decide estado, dependencias, rama y entrega;
5. los documentos históricos se conservan como contexto, no como orden de
   ejecución.

No se usa la skill `vantare-core`: está desactualizada y no es fuente de verdad.

## Documentos

- `product-contract.md`: alcance, experiencia, licencias, privacidad e idiomas.
- `project-map.md`: módulos, fronteras, dependencias y estado.
- `execution-policy.md`: flujo GitHub/Git, autonomía, reviews y promoción.
- `../roadmap/plan.md`: fuente manual del planning y del roadmap público.
- `research-policy.md`: investigación de productos, repositorios y apps.
- `handoff-template.md`: contrato común para los handoffs.
- `handoffs/telemetry-core.md`: núcleo live y continuidad del programa de retirada V1, auditoría integral V2 y optimización medida.
- `../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md`: único maestro operativo de ese programa; sustituye la secuencia Huella mínima A–J.
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
- El orquestador lo actualiza inmediatamente despues de revisar cada worker o
  tomar una decision material; no se espera al final de una fase larga.
- Los workers no crean subagentes por defecto. La delegacion anidada requiere
  autorizacion expresa y acotada del orquestador.
- El comentario final de la issue de GitHub enlaza el handoff y enumera evidencia real.
- Mocks, capturas y tests no pueden presentarse como prueba de runtime real.
- Los hallazgos fuera de alcance se registran como issues de GitHub.
- Contenido pertenece a Isaac y queda fuera de la ejecución autónoma. Los
  agentes solo preparan borradores cuando se les solicita.

## Situacion operativa vigente

- El flujo fisico es `rama de issue -> nightly -> testers -> master`.
- El checkout principal se usa para ejecutar el conjunto de `nightly`; cada
  issue conserva rama y worktree propios.
- `develop` y `refactor` son historia y no reciben trabajo nuevo. Los checkouts
  historicos sucios se preservan hasta una limpieza trazada.
- Los handoffs de este directorio, GitHub Issues y `../roadmap/plan.md` contienen
  respectivamente la continuidad técnica, el estado operativo y el planning
  público; este índice no duplica listas de issues que caducan.
- Testing Center es un proyecto independiente y no se mezcla con la
  orquestacion de los modulos de producto salvo que una issue lo indique.
