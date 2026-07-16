# Verificación Manual — Vantare Ingeniero Go

> **Estado:** activo. Revisado 2026-06-27 (paths corregidos).
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/manual-verification.md`).

Estos checks están escritos para un usuario que dirige agentes pero no
inspecciona diffs grandes de código.

## Check básico del repo

1. Pide al worker que reporte `git status --short`.
2. Confirma que los archivos cambiados coinciden con la tarea.
3. Confirma que no se añadieron dependencias salvo aprobación.
4. Confirma que el worker ejecutó los comandos esperados.
5. Confirma que el worker dio pasos de verificación manual.

## Check mock del spotter

Ejecuta:

```powershell
go run ./cmd/lmu-debug -mock -once
```

Esperado:

- El comando termina sin panic.
- La salida incluye información de debug LMU/spotter.
- No aparece un error fatal inesperado.

## Check live del spotter (con LMU abierto)

Ejecuta:

```powershell
go run ./cmd/lmu-debug -hz 5
```

Después conduce u observa escenarios:

1. Coche claramente a la izquierda.
2. Coche claramente a la derecha.
3. Coches en ambos lados.
4. Coche deja libre el lado izquierdo.
5. Coche deja libre el lado derecho.
6. Side-by-side en curva.

Esperado:

- Los mensajes izquierda/derecha coinciden con la posición visual.
- No hay flicker repetido tipo
  `car_right → clear_right → car_right` mientras el coche sigue
  alongside.
- Los valores debug explican la decisión.

## Export JSONL del spotter

> **CORRECCIÓN 2026-06-27 (pase editorial):** `cmd/lmu-debug` no
> acepta `-jsonl` (sus flags reales son `-once -mock -hz`,
> `cmd/lmu-debug/main.go:24-27`). La captura JSONL del spotter debe
> hacerse con el futuro `cmd/spotter-debug -out <archivo>` (binario
> a crear, ver `current-plan.md` § 6 Tarea 1). Hasta que ese binario
> exista, **no** ejecutar `cmd/lmu-debug -jsonl ...` y **no**
> afirmar que produce JSONL.

Procedimiento previsto cuando `cmd/spotter-debug` exista:

```powershell
go run ./cmd/spotter-debug -hz 5 -out logs/spotter-live.jsonl
```

Durante la captura, intenta provocar escenarios claros:

1. Coche a la izquierda.
2. Coche a la derecha.
3. Ambos lados.
4. Salida a `clear`.
5. Curva side-by-side.

Esperado:

- Se crea el archivo JSONL.
- Cada línea es un JSON válido.
- Aparecen campos `opponentId`, `alignedX`, `alignedZ`, `side`,
  `inOverlap` y `rejectReason`.
- Si el spotter se equivoca, el JSONL permite ver qué fórmula o filtro
  tomó la decisión.

> Nota: el campo `inOverlap` del JSONL refleja geometría pura sin
> histéresis. `DebugRecords` es stateless y no conoce el
> `ActiveSides` de la máquina de estado. Para ver la decisión final
> del spotter (con debounce, clear delay y active sides), revisa los
> eventos de audio o añade logs de `Machine.Process`.

## Check replay

Cuando haya fixtures replay implicados:

```powershell
go test ./internal/engineer/replay ./internal/engineer/spotter -v
```

> **CORRECCIÓN 2026-06-27:** los paths correctos son
> `internal/engineer/{replay,spotter}/`, no
> `internal/{replay,spotter}/`. Estos últimos no existen en el
> worktree.

Esperado:

- Los replay files parsean.
- Aparecen los eventos spotter esperados.
- Eventos stale o incorrectos son rechazados por tests.

## Check build frontend

Ejecuta solo si cambian archivos frontend:

```powershell
cd frontend
npm run build
```

Esperado: el build TypeScript pasa y no se añadió una dependencia UI
sin aprobar.

## Verificación de mensaje stale

Con `cmd/lmu-debug` y un oponente claramente al lado derecho:

1. Espera `car_right` audible.
2. Observa el oponente unos 350-500 ms (debe permanecer en el lado).
3. Si se va `clear_right` sin razón visible, el bug es de stale
   message; revisa `ValidityRule` en
   [`voice-contract.md`](voice-contract.md).
4. Si reaparece el coche antes del delay, `clear_right` debe
   cancelarse.

## Verificación de min speed gate

Conduce hasta detenerte completamente:

1. Coche parado → no debería sonar spotter.
2. Acelera hasta >10 m/s → spotter vuelve a funcionar.
3. Verifica logs: deben mostrar razón de gate.

## Verificación de clear TTL

Con `cmd/spotter-debug -out logs/clear-ttl.jsonl`:

1. Provoca un `clear_right` con el coche visible.
2. Espera >2000 ms sin reaparición.
3. El mensaje debe expirarse antes de sonar.

> **CORRECCIÓN 2026-06-27:** `cmd/lmu-debug -jsonl` no existe. Se
> usa `cmd/spotter-debug` (binario a crear, ver
> [`current-plan.md`](current-plan.md) § 6 Tarea 1).

## Smoke test con LMU abierto

Con LMU en pista:

1. Conduce 3-5 minutos con tráfico mixto.
2. Captura JSONL de la sesión.
3. Revisa que no aparecen `clear_*` stale.
4. Revisa que el spotter coincide con tu percepción visual.
5. Si todo OK, el prealpha gate puede cerrarse.

## Cómo reportar

Si un check falla, reporta:

1. Comando exacto que ejecutaste.
2. Output esperado vs output observado.
3. Si parece relacionado con la tarea actual.
4. Próximo paso pequeño propuesto.
