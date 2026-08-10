# Vantare — expediente canónico del programa

Estado: expediente estable del programa.

Este directorio concentra decisiones estables y el contexto mínimo para
continuar Vantare sin depender de conversaciones anteriores. No sustituye a
Linear como tracker ni a Git/GitHub como evidencia de entrega.

## Orden de lectura obligatorio

1. `AGENTS.md`.
2. La issue de Linear asignada, incluidas dependencias, rama, base y destino.
3. `docs/README.md`, que enruta al proyecto correcto.
4. El handoff y los contratos enlazados para esa issue.
5. `execution-policy.md` y `../branch-channels.md` cuando haya ramas,
   promociones o releases.
6. El código y los tests aplicables.

La propiedad no se resuelve por fecha o posición del texto:

1. Linear posee issue, alcance, dependencias, rama, base esperada y destino;
2. Git/GitHub y el runtime demuestran el estado observado;
3. ADR y contratos poseen decisiones técnicas estables;
4. el handoff conserva continuidad técnica, riesgos, evidencia y siguiente
   acción;
5. los documentos históricos son contexto, nunca orden de ejecución.

Consulta `source-ownership.md`. Una contradicción entre propietario esperado y
estado observado es una condición de parada, no una invitación a escoger el
documento más reciente.

No se usa la skill `vantare-core`: está desactualizada y no es fuente de verdad.

## Documentos

- `product-contract.md`: alcance, experiencia, licencias, privacidad e idiomas.
- `project-map.md`: módulos, fronteras, dependencias y estado.
- `execution-policy.md`: flujo Linear/Git, autonomía, reviews y promoción.
- `source-ownership.md`: propietario único de cada campo operativo.
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
- El handoff se actualiza si cambia arquitectura, decisiones, evidencia,
  riesgos o siguiente acción técnica. Estado, rama, base y destino pertenecen
  a Linear/Git y no se mantienen como tracker paralelo.
- El orquestador actualiza Linear después de cada cambio material y el handoff
  solo cuando cambia la continuidad técnica.
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
- Linear contiene el estado esperado por proyecto. Los handoffs resumen
  continuidad técnica y este índice no duplica listas de issues que caducan.
- `docs/current-plan.md` está retirado; el archivo acumulado solo conserva
  contexto histórico.
- Testing Center es un proyecto independiente y no se mezcla con la
  orquestacion de los modulos de producto salvo que una issue lo indique.
