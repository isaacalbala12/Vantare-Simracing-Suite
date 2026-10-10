# Vantare — expediente canónico del programa

> **Seguimiento vigente (#1503): GitHub Issues de este repositorio y GitHub
> Project Vantare.** Leer la issue y actualizarla junto con el handoff tras
> cada cambio material; registrar PR, checks, SHA y canal real. Los enlaces y
> estados de trackers anteriores son evidencia histórica, no instrucciones.


Estado: vigente desde ISA-120; revisado el 2026-08-05.

Este directorio concentra las decisiones confirmadas por Isaac y el contexto
mínimo para continuar Vantare sin depender de conversaciones anteriores. No
reemplaza las especificaciones técnicas detalladas: las enlaza, indica cuál
sigue vigente y conserva evidencia técnica. El estado operativo vive en GitHub Issues.

## Orden de lectura obligatorio

1. AGENTS de `origin/nightly` actualizado, issue GitHub y GitHub Project Vantare.
2. Contrato de producto y políticas aplicables; canales si hay Git/CI/releases.
3. `native/README.md`, README del crate y ADR/plan adoptado por la issue.
4. Único handoff del área, contrastado con la issue y el código.

Si dos documentos se contradicen:

1. prevalecen las decisiones más recientes de este directorio;
2. después, la evidencia comprobable del código y del runtime;
3. después, ADR y planes vigentes;
4. GitHub Issues decide alcance, prioridades, dependencias y estado; GitHub demuestra integración;
5. los documentos históricos se conservan como contexto, no como orden de
   ejecución.

No se usa la skill `vantare-core`: está desactualizada y no es fuente de verdad.

## Documentos

- `product-contract.md`: alcance, experiencia, licencias, privacidad e idiomas.
- `project-map.md`: módulos, fronteras y caminos de datos; el estado operativo vive en GitHub Issues.
- `execution-policy.md`: flujo GitHub Issues/Git, autonomía, reviews y promoción.
- `../roadmap-maintenance.md`: actualización por Codex y publicación del roadmap gráfico.
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
- `handoffs/testing-center.md`: continuidad del Testing Center y sus workflows inertes.

## Reglas de continuidad

- Cada proyecto mantiene un único handoff vivo.
- Todo worker lo actualiza si cambia estado, arquitectura, decisiones, tests,
  riesgos o siguiente acción.
- El orquestador lo actualiza inmediatamente despues de revisar cada worker o
  tomar una decision material; no se espera al final de una fase larga.
- Los workers no crean subagentes por defecto. La delegacion anidada requiere
  autorizacion expresa y acotada del orquestador.
- La entrega en la issue GitHub enlaza el handoff y enumera evidencia real.
  Actualizar al empezar, bloquear, entregar y verificar merge; releer la escritura.
- Mocks, capturas y tests no pueden presentarse como prueba de runtime real.
- Los hallazgos fuera del lote de cierre se capturan en GitHub Issues como pendientes,
  según la issue vigente; no se ejecutan ni amplian el lote automaticamente.
- Contenido pertenece a Isaac y queda fuera de la ejecución autónoma. Los
  agentes solo preparan borradores cuando se les solicita.

## Situacion operativa vigente

- El flujo fisico es `rama de issue -> nightly -> testers -> master`.
- El checkout principal se usa para ejecutar el conjunto de `nightly`; cada
  issue conserva rama y worktree propios.
- `develop` y `refactor` son historia y no reciben trabajo nuevo. Los checkouts
  historicos sucios se preservan hasta una limpieza trazada.
- Los handoffs de este directorio y GitHub Issues contienen la continuidad técnica y
  el estado operativo; Codex actualiza el roadmap público cuando Isaac lo solicita.
- Testing Center es un proyecto independiente y no se mezcla con la
  orquestacion de los modulos de producto salvo que una issue lo indique.

## Histórico del tracker

Retirado con autorización en #1561: [transición](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/notion-transition.md) y [auditoría](https://github.com/isaacalbala12/Vantare-Simracing-Suite/blob/ca17545f607b85f5d47dc9d060721b69e6a6a158/vantare-v2/docs/vantare-program/notion-document-audit.md). GitHub Issues es la autoridad operativa.
