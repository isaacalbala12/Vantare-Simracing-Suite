# AGENTS.md

Guia obligatoria para agentes que trabajen en este repo.

## Contexto del usuario

- El usuario no revisa codigo complejo linea por linea.
- El usuario si sabe dirigir agentes, modelos, prompts, revisiones y verificaciones.
- El repo debe protegerse con cambios pequenos, tests, builds, documentacion viva y checklists claras.
- Explica los resultados en espanol sencillo: que cambio, que archivos tocaste, que checks pasaron y como puede verificarlo manualmente.

Regla central: hacer el cambio seguro mas pequeno posible.

## Reglas generales

- Lee este archivo antes de editar.
- Lee `docs/current-plan.md` antes de empezar cualquier tarea.
- Overlay Studio V3 es un único editor de layout, contenido, comportamiento y apariencia. Mantén separadas sus capas internas: el canvas solo gestiona interacción espacial; el inspector edita el documento; los renderizadores visuales reciben ViewModels puros y nunca acceden a persistencia, permisos, Wails/SSE ni posición. Consulta ADR 0003 y el plan maestro V3.
- Si tocas drag/resize del canvas V3, lee primero `docs/overlays-studio/canvas-drag-imperative-preview.md` (preview DOM imperativa; no reintroducir posición transitoria vía React state).
- No hagas features, refactors o limpieza general si no están en el alcance.
- No redisenes arquitectura sin aprobacion explicita.
- No anadas dependencias sin justificarlo y sin aprobacion.
- No mezcles documentacion, feature, bugfix y refactor en un mismo cambio salvo que sea imprescindible.
- No toques archivos no relacionados.
- No borres documentacion util. Si algo parece obsoleto, marcalo o pregunta.
- No ocultes errores de tests, build o lint.
- No debilites tests para hacer pasar el build.
- Si hay cambios sin commit antes de empezar, identificalos y no los mezcles con tu tarea.

## Flujo esperado

1. Revisa `git status --short`.
2. Lee los docs relevantes.
3. Declara objetivo, alcance y archivos esperados.
4. Haz un cambio pequeno.
5. Anade o actualiza tests si cambia comportamiento.
6. Ejecuta los checks aplicables.
7. Resume evidencia y verificacion manual.
8. Actualiza `docs/current-plan.md` si cambia el estado del proyecto.

## Stop conditions

Para y pide revision si:

- Necesitas tocar muchos mas archivos de los previstos.
- Necesitas una dependencia nueva.
- Necesitas cambiar arquitectura.
- Los tests fallan por una causa que no entiendes.
- Encuentras cambios previos que chocan con tu tarea.
- No sabes como verificar el resultado.
- Hay contradicciones entre documentos.

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

## Evidencia final obligatoria

Al terminar, informa:

- Archivos creados/modificados/movidos.
- Tests o checks ejecutados y resultado.
- Checks no ejecutados y motivo.
- Riesgos restantes.
- Como verificar manualmente.
