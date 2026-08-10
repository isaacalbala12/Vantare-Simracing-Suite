# AGENTS.md

Guia obligatoria para agentes que trabajen en este repo.

## Contexto del usuario

- El usuario no revisa codigo complejo linea por linea.
- El usuario si sabe dirigir agentes, modelos, prompts, revisiones y verificaciones.
- El repo debe protegerse con cambios pequenos, tests, builds, documentacion viva y checklists claras.
- Explica los resultados en espanol sencillo: que cambio, que archivos tocaste, que checks pasaron y como puede verificarlo manualmente.

Regla central: implementar la solucion correcta mas sencilla, legible y segura.
Menos codigo es preferible cuando mantiene o mejora claridad, seguridad,
pruebas y rendimiento. Si la complejidad supera claramente al problema, revisa
y simplifica antes de ampliarla.

## Fuentes de verdad y lectura obligatoria

Antes de interpretar o ejecutar una tarea:

1. Verifica raiz Git, rama, HEAD, worktree y `git status --short`.
2. Lee este archivo.
3. Identifica y lee la issue de Linear asignada, sus dependencias, rama, base
   esperada y destino. Sin issue verificada puedes investigar en solo lectura,
   pero no editar.
4. Usa `docs/README.md` como router y lee solo el handoff, contratos, ADR o
   plan aplicables.
5. Lee `docs/agent-workflow.md` y `docs/branch-channels.md` si la tarea afecta
   Git, Linear, CI, releases o estados.
6. Lee el codigo y los tests que demuestran el comportamiento actual.

Antes de editar, completa y contrasta este sobre:

```text
Issue:
Proyecto:
Rama Linear:
Base esperada:
Worktree:
Destino PR:
```

Linear posee el estado esperado; Git/GitHub y el runtime demuestran el estado
observado. El contrato completo vive en
`docs/vantare-program/source-ownership.md`. Si no coinciden, para antes de
editar. Los documentos historicos nunca autorizan una rama o una base. No uses
la skill `vantare-core`: esta desactualizada.

## Reglas generales

- El flujo canónico es `rama de issue -> nightly -> testers -> master`.
  Isaac revisa y acepta primero la entrega aislada; `nightly` recibe esa
  implementacion para pruebas Pro Plus/Owner; `testers` recibe el conjunto
  corregido; solo Isaac puede autorizar la promocion final a `master`.
- El checkout principal de ejecucion e integracion debe seguir `nightly`, pero
  nunca se desarrolla directamente sobre el. Cada issue usa rama y worktree
  aislados. `develop` y `refactor` son referencias historicas, no canales
  actuales de integracion; preserva sus cambios locales y no los limpies.
- Ninguna rama de issue puede saltarse un canal o integrarse directamente en
  `testers` o `master`.
- Terminado, integrado, promocionado y publicado son estados distintos. Nunca
  afirmes uno sin verificar la rama/SHA remota, PR, CI y release aplicables.
- Cada proyecto mantiene un unico handoff vivo. Actualizalo despues de cada
  worker, decision o cambio material de arquitectura, evidencia, riesgos o
  recomendacion tecnica. Linear posee el estado, la siguiente accion
  autorizada y el plan ejecutable; no se mantiene un tracker paralelo en el
  handoff.
- Todo trabajo nuevo debe estar cubierto por una issue de Linear antes de
  editar. Los hallazgos fuera de alcance se documentan como issues y no se
  incorporan silenciosamente.
- La delegacion tiene un solo nivel por defecto: el orquestador puede crear
  workers, pero un worker no puede crear subagentes ni delegar su tarea salvo
  autorizacion expresa y acotada del orquestador. No ejecutes dos agentes en
  paralelo sobre el mismo worktree o rama.
- No delegues una tarea trivial cuando ejecutarla directamente sea mas clara y
  barata. El orquestador sigue siendo responsable de revisar el diff, la
  evidencia y el handoff; el reporte del worker no basta por si solo.
- Overlay Studio V3 es un único editor de layout, contenido, comportamiento y apariencia. Mantén separadas sus capas internas: el canvas solo gestiona interacción espacial; el inspector edita el documento; los renderizadores visuales reciben ViewModels puros y nunca acceden a persistencia, permisos, Wails/SSE ni posición. Consulta `docs/adr/0003-overlay-studio-v3-rebuild.md` y `docs/overlays-studio/README.md`.
- `WidgetVisualHost` es la frontera compartida de renderizado para Studio,
  Desktop, OBS y Workshop. En el flujo aprobado de autoria visual se edita el
  TSX/CSS productivo y Workshop debe reflejarlo mediante HMR: no crees un renderer duplicado, DSL,
  compilador HTML, scaffolder o registro generico salvo una decision nueva.
  Los HTML son contratos visuales; el fondo del escenario no forma parte del
  widget ni de sus capturas de paridad.
- Si tocas drag/resize del canvas V3, lee primero `docs/overlays-studio/canvas-drag-imperative-preview.md` (preview DOM imperativa; no reintroducir posición transitoria vía React state).
- No hagas features, refactors o limpieza general si no están en el alcance.
- No redisenes arquitectura de forma oportunista. Un cambio arquitectónico solo
  se ejecuta dentro de una issue/plan aprobados, con ADR cuando corresponda,
  evidencia y review.
- No anadas dependencias sin justificarlo y sin aprobacion.
- No mezcles documentacion, feature, bugfix y refactor en un mismo cambio salvo que sea imprescindible.
- No toques archivos no relacionados.
- No borres documentacion util. Si algo parece obsoleto, marcalo o pregunta.
- No ocultes errores de tests, build o lint.
- No debilites tests para hacer pasar el build.
- Si hay cambios sin commit antes de empezar, identificalos y no los mezcles con tu tarea.
- No leas, imprimas, copies ni versionees secretos o archivos `.env*`. Trabaja
  solo con nombres de variables y procedimientos sanitizados.

## Autoridad y acciones externas

Dentro de una issue aprobada, los agentes pueden crear o actualizar Linear,
ramas, worktrees, commits, pushes, PRs draft, CI, documentacion y reviews.

Requieren autorizacion explicita de Isaac:

- promocionar a `nightly` y promocionar de `testers` a `master`;
- publicar una release o anuncio comercial publico;
- realizar pagos, refunds o acciones con gasto;
- exponer o rotar secretos;
- borrar masivamente datos de forma irreversible;
- eliminar cuentas o datos reales de usuarios.

## Flujo esperado

1. Revisa `git status --short`.
2. Lee los docs relevantes.
3. Declara objetivo, alcance y archivos esperados.
4. Haz un cambio pequeno.
5. Anade o actualiza tests si cambia comportamiento.
6. Ejecuta los checks aplicables.
7. Resume evidencia y verificacion manual.
8. Revisa el diff completo y la evidencia; no confies solo en el resumen de un worker.
9. Actualiza Linear y, solo si cambia la continuidad tecnica del proyecto, su
   handoff vivo. No dupliques el estado en un plan global.

## Stop conditions

Para y pide revision si:

- Necesitas tocar muchos mas archivos de los previstos.
- Necesitas una dependencia nueva.
- Necesitas cambiar arquitectura.
- Los tests fallan por una causa que no entiendes.
- Encuentras cambios previos que chocan con tu tarea.
- No sabes como verificar el resultado.
- Hay contradicciones entre documentos.
- La base, rama o SHA no coincide con la issue.
- La accion requiere una autorizacion reservada a Isaac.

## Go

- Usa Go simple e idiomatico.
- Ejecuta `gofmt` en archivos Go modificados.
- Ejecuta `go test ./...` si tocaste Go o contratos compartidos.
- Maneja errores siempre; no uses `_` para ignorarlos salvo justificacion clara.
- Envuelve errores con contexto usando `%w` cuando propagas errores.
- No uses `panic` salvo casos muy justificados o tests.
- No uses `log.Fatal` fuera de `main`.
- Usa `context.Context` en I/O, red, DB, procesos largos o tareas cancelables.
- Evita interfaces prematuras; define interfaces en el consumidor cuando hagan falta.
- Evita paquetes `utils` genericos.
- No metas goroutines/channels sin razon clara.
- Toda goroutine debe tener cancelacion o camino de cierre.
- Preferir tests table-driven para logica.
- Usa `testdata/` para fixtures reales.

## TypeScript / React

- Mantener TypeScript estricto segun la configuracion existente.
- Ejecuta `pnpm --dir frontend test` si tocaste frontend.
- Ejecuta `pnpm --dir frontend build` antes de cerrar cambios frontend relevantes.
- Ejecuta `pnpm --dir frontend lint` si tocaste patrones que ESLint cubre.
- No anadas librerias UI sin aprobacion.
- No dupliques estado si ya existe una fuente clara.
- Mantener logica de negocio fuera de componentes React cuando sea razonable.
- Componentes pequenos, con nombres claros.
- No mezcles UI con persistencia o logica core sin necesidad.
- No cambies configuracion de build salvo que la tarea lo pida.

## Testing

- Todo cambio de comportamiento necesita test o explicacion de por que no.
- Bugs corregidos necesitan test de regresion cuando sea viable.
- Antes de refactorizar comportamiento existente, crea o identifica tests que lo protejan.
- No escribas tests complacientes que solo prueban detalles internos del cambio.
- No uses `time.Sleep` en tests salvo justificacion.
- No compares strings de error si puedes usar errores tipados o comportamiento observable.

## Dependencias

- Preferir standard library en Go.
- Preferir herramientas ya instaladas en frontend.
- Si propones una dependencia, explica:
  - por que hace falta,
  - por que lo existente no basta,
  - riesgo que introduce,
  - alternativa mas simple.

## Patrones prohibidos

- Grandes rewrites.
- Microservicios prematuros.
- Rust como base principal sin decision explicita.
- Abstracciones enormes.
- Interfaces con una sola implementacion sin justificacion.
- Factories/providers/managers innecesarios.
- Estado global mutable.
- Goroutines sin cancelacion.
- Channels para trabajo secuencial.
- Mocks innecesarios.
- Secretos hardcodeados.
- "Mejoras generales" sin alcance.
- Renderizadores alternativos o pipelines paralelos que dupliquen una fuente de verdad.

## Evidencia final obligatoria

Al terminar, informa:

- Archivos creados/modificados/movidos.
- Tests o checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Como verificar manualmente.
- Rama, base, HEAD, commit, push, PR, CI y nivel de promocion realmente alcanzado.
- Confirmacion de que no hubo merge, release o accion externa fuera del alcance.
