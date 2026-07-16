# Checklist de Revisión Go — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/go-review-checklist.md`).

Usa esto al revisar cambios Go.

## Correctness

- ¿Se manejan los errores?
- ¿Se manejan inputs inválidos?
- ¿Los valores `nil` o cero son seguros?
- ¿Hay tests para edge cases?
- ¿Los mensajes de error son útiles?
- ¿El comportamiento coincide con docs y tests?

## Simplicidad

- ¿Es el cambio seguro más pequeño posible?
- ¿La abstracción hace falta ahora?
- ¿Podría ser una función en vez de un tipo nuevo?
- ¿Hay una interfaz innecesaria?
- ¿Los nombres son concretos y del dominio?
- ¿Hay algún paquete `utils` genérico?

## Manejo de errores

- No hay errores ignorados sin motivo.
- No se comparan strings de error.
- Los errores devueltos incluyen contexto.
- Se usa `%w` al envolver errores.
- `panic` no se usa en flujo de producción.
- `log.Fatal` solo dentro de `main`.
- `context.Context` en I/O, red, DB, tareas cancelables.

## Concurrencia

- Toda goroutine tiene camino de cierre.
- Se usa context para trabajo largo o cancelable.
- No hay channels para código secuencial simple.
- No hay leaks probables de goroutines.
- Los tests no dependen de `time.Sleep` frágil salvo justificación.
- Mutex dedicado por responsabilidad (`rtValidatorMu` no se mezcla con
  otro mutex).
- `RWMutex` solo si hay lectores múltiples reales.

## Spotter

- La geometría sigue siendo pura (funciones sin estado, sin I/O).
- La convención de signos coincide con
  [`architecture/spotter-geometry-findings.md`](architecture/spotter-geometry-findings.md).
- No hay flip ad hoc de izquierda/derecha.
- `LapDistance` no se usa como geometría principal de overlap.
- Detección y mensajes audio siguen separados (paquetes distintos).
- Los mensajes stale se descartan en `Manager.queueLoop` antes de
  reproducir.
- `detectionHoldMS`, `clearDelayMS`, `stillThereRepeatMS`,
  `messageExpiryMS`, `clearExpiryMS` no cambian sin actualizar plan
  maestro.

## Suite del ingeniero (alpha 1+)

- Cada módulo evalúa a 20 Hz sobre `CrewChiefFrameContext`.
- Detección de flancos usa `previous` y `current`.
- Mensajes vía `render_template` o equivalente.
- Canal correcto (`Spotter` vs `Engineer`).
- TTL explícito en cada mensaje.
- `play_even_when_silenced` solo en mensajes críticos explícitos.
- `enable_*` flags respetados.

## Audio y TTS

- Cola con prioridad y expiración.
- `ValidityRule` validado antes de reproducir.
- Cache hit no llama al provider.
- Pre-cache de frases críticas en arranque.
- Provider fallback funciona.
- TTS provider errors no bloquean la cola permanentemente.
- Logs en debug, no en producción.

## Tests

- Los cambios de comportamiento tienen tests.
- Los bugfixes tienen tests de regresión.
- Se usan table-driven tests cuando ayuda.
- Los fixtures están en `testdata/` si hay datos externos.
- Los tests son deterministas.
- Los tests existentes no se debilitaron.
- Voice contract VC-* casos relevantes pasan.

## Dependencias

- No hay dependencia nueva sin aprobación.
- Se consideró primero la standard library.
- El riesgo de dependencia está explicado si se añadió.

## Alcance

- Los archivos tocados coinciden con la tarea.
- No cambiaron archivos generados inesperadamente.
- No hay refactor no relacionado.
- No se amplió el alcance de producto.
- No se modificaron archivos en otros worktrees (`vantare-v2`,
  `Vantare-Ingeniero`, etc.).

## Defaults Locked

- Si toca una constante del plan maestro § 5, ese plan debe actualizarse
  en el mismo PR.
- Tests asociados a la constante deben seguir pasando.
- Evidencia live (o fixtures) debe acompañar el cambio.

## Anti-fork

- Suite a 20 Hz (no batch 0.5 Hz).
- Ningún módulo importa `internal/llm` antes de beta.
- Ningún mensaje determinista se formatea por LLM.
- `commentary_end` no se emite con `speakOnly=true` y sin PTT.

## Wails / Frontend

- Bindings Wails no versionados en git (regenerados).
- Lógica de negocio fuera de componentes React.
- Sin librerías UI nuevas sin aprobación.
- TypeScript estricto según configuración existente.

## Documentación

- Si cambia comportamiento, docs actualizados en el mismo PR.
- `current-plan.md` actualizado si cambia estado del proyecto.
- `testing/spotter-bug-log.md` actualizado si se corrige bug.
- `voice-contract.md` actualizado si cambia VC-*.
- Defaults locked actualizados en plan maestro si aplica.
