# STR-06 — Inventario físico de neumáticos

Fecha: 2026-08-02

Issue: ISA-141

Base exacta: `ISA-140@2d0af853fc729755487d8c4ff0e0459cf642d53a`

## Resultado

STR-06 incorpora un dominio Go puro para el inventario físico de neumáticos de
Strategy Planner. Cada elemento representa un neumático individual, no un
juego, y conserva identidad, compuesto, origen, condición, estado, stints y
esquina persistente.

El corte no incluye UI, drag and drop, persistencia nueva, lectura de
telemetría, edición de stints ni optimización de estrategia.

## Contrato

El paquete `internal/strategy/tyres` define:

- `TyreID`: identidad estable de un neumático físico.
- `Compound`: Soft, Medium, Hard o Wet.
- `Condition`: porcentaje restante exacto o intervalo, siempre con procedencia
  y confianza canónicas de `strategy.v1`.
- `Origin`: asignación nueva del evento, clasificación o procedencia
  desconocida.
- `State`: libre, montado, usado o descartado.
- `Corner`: delantera izquierda/derecha o trasera izquierda/derecha.
- `Inventory`: colección inmutable con máximo de neumáticos individuales.
- `FitmentRequest` y `Fitment`: selección determinista de cuatro unidades
  físicas sin alterar el inventario.

Las operaciones devuelven un inventario nuevo. Las slices expuestas son copias;
modificar un resultado no cambia snapshots anteriores.

## Reglas cerradas

### Condición y procedencia

- Un neumático nuevo de la asignación del evento parte de 100 % exacto porque
  esa condición es conocida.
- Un neumático usado en clasificación sin dato exacto conserva el intervalo
  80–90 %.
- Si tampoco existe dato medido o manual, se conserva el intervalo 40–70 %.
- Un valor estimado no puede declararse exacto.
- Un valor exacto requiere procedencia observada, corregida, manual o derivada.
- Todos los porcentajes son finitos y permanecen entre 0 y 100.

El dominio no calcula desgaste. STR-08 podrá aportar observaciones; STR-06 solo
protege la identidad y la evidencia del valor recibido.

### Esquina física

- Montar antes del primer uso es reversible.
- El primer uso registrado fija `LockedCorner`.
- Cualquier uso posterior solo puede ocurrir en esa misma esquina.
- Descartar no borra el historial ni la esquina fijada.
- Dos neumáticos no pueden estar montados simultáneamente en la misma esquina.

### Compuestos e inventario

- Las combinaciones mixtas son válidas; el dominio no fuerza pares o juegos.
- Una selección excluye neumáticos descartados y respeta las esquinas fijadas.
- La selección usa backtracking acotado a cuatro esquinas, con orden estable y
  preferencia por la unidad ya ligada a esa esquina.
- Si falta stock, `InventoryError` publica código estable, compuesto, esquina y
  cantidades requeridas/disponibles cuando aplican. La UI no necesita comparar
  strings ni inventar la causa.

## Errores estables

Los fallos usan `InventoryError` y códigos como:

- `duplicate_tyre`
- `capacity_exceeded`
- `invalid_condition`
- `corner_locked`
- `corner_occupied`
- `invalid_transition`
- `insufficient_inventory`

El texto es diagnóstico; consumidores deben decidir mediante `ErrorCode`.

## TDD y regresiones

Las pruebas cubren:

- identidad duplicada y límite máximo;
- los cuatro compuestos y combinaciones mixtas;
- intervalos 80–90 % y 40–70 % sin convertirlos en un punto exacto;
- valor manual exacto de clasificación;
- rechazo de NaN, infinito, rangos invertidos y estimación exacta;
- movimiento antes del primer uso y bloqueo irreversible después;
- remonte en la esquina correcta y conteo de stints;
- snapshots inmutables;
- neumáticos descartados;
- escasez total y escasez causada por esquina persistente.

## Evidencia de ejecución

| Check | Resultado |
| --- | --- |
| `go test ./internal/strategy/tyres` | PASS |
| `go test -count=100 ./internal/strategy/tyres` | PASS |
| `go test -race -count=10 ./internal/strategy/tyres` con UCRT64 | PASS |
| `go vet ./internal/strategy/...` | PASS |
| `go test ./internal/strategy/...` | PASS |
| `go test -p 1 ./... -count=1` | PASS; todos los paquetes Go |
| `pnpm --dir frontend build` | PASS; generó `frontend/dist` ignorado requerido por Go embed |
| `git diff --check` | PASS |

La primera suite Go global paralela agotó seis minutos sin salida y sin fallo
observable. El worktree no tenía dependencias frontend ni `frontend/dist`; se
instalaron desde el lockfile y se construyó el artefacto ignorado. La repetición
global serial terminó completamente verde en 157,7 s, incluido
`internal/app.TestConcurrentSavesDontCorruptFile`.

La primera compilación race con una ruta absoluta a `gcc.exe` falló durante el
link. Al anteponer UCRT64 al `PATH`, el mismo gate pasó y la repetición x10 quedó
verde. No se cambió código ni configuración para ocultar el fallo ambiental.

## Fuera de alcance y siguiente corte

STR-07 / ISA-142 posee la UI de tres columnas, el drag and drop y los flujos de
edición que consumirán este dominio. STR-08 conectará datos históricos de
telemetría. Ninguno debe duplicar las reglas físicas de STR-06.

No se realizó merge ni promoción a `nightly`, `testers` o `master`.
