# ENG-02 — contrato de capabilities e inventario legacy

## Objetivo y alcance

Este documento explica el contrato compilable de
`internal/telemetry/projection/engineer` y delimita la migración posterior.
ENG-02 no proyecta datos reales, no cambia monitores y no conecta producción.

La decisión arquitectónica está en
`docs/adr/0005-engineer-projection-capability-contract.md`.

## División de responsabilidades con TC-05A

TC-05A es la autoridad para el envelope transversal, versionado, ownership,
fan-out y puertos de proyección. ENG-02 no replica esas piezas.

Cuando ambos cortes se integren, ENG-03:

1. recibirá el snapshot final de Telemetry Core a través del puerto aprobado;
2. adaptará su metadata transversal a `engineer.Context`;
3. declarará un `Manifest` con capabilities demostradas;
4. construirá internamente cada `Field`;
5. publicará un payload Engineer sin exponer tipos de schema/envelope a los
   consumidores de producto.

Engineer lee el estado y la capability antes del valor. Solo `Field.Usable()`
puede entrar directamente en una regla. `Stale`, `Invalid`, `Missing`,
`Unsupported` y `Degraded` se silencian o se tratan expresamente; nunca se
convierten en cero.

## Qué demuestra ENG-02

- `0` fresh sigue siendo un valor presente y utilizable si la capability está
  soportada;
- missing no contiene valor;
- stale e invalid pueden conservar el valor observado para diagnóstico, pero
  no son utilizables;
- unsupported es explícito y no contiene valor;
- unknown/ausente no puede acompañar un valor presente;
- degraded puede conservar un valor fresh, pero `Usable()` es false;
- el manifiesto posee su almacenamiento y devuelve copias;
- los tipos visibles por Engineer no requieren importar schema/envelope;
- los snapshots son latest-wins: saltarse snapshots intermedios es legítimo;
- un epoch regresivo o cero se rechaza;
- cambios de driver/team y resets de epoch cancelan trabajo pendiente;
- un cambio de evento, sesión o vehículo en el mismo epoch es incoherente.

Los hechos ordenados mantienen por separado su secuencia y política de resync en
Telemetry Core. ENG-02 no aplica esas reglas al snapshot de lectura.

## Inventario reproducible de consumidores legacy

Comando de auditoría:

```powershell
rg -l 'internal/engineer/telemetry' internal/engineer internal/app cmd `
  -g '*.go' -g '!*_test.go'
```

Resultado sobre la base `7a1cd702bc1f50e13a3f351360e6a018d0bd7423`:
**34 archivos productivos en 29 directorios**.

### Adquisición y composición

- `internal/app/lmu_enriched_source.go`
- `internal/engineer/lmu/parser.go`
- `internal/engineer/telemetry/service/service.go`
- `internal/engineer/service/engineer_service.go`
- `internal/engineer/core/runtime.go`
- `cmd/spotter-debug/main.go`

Estos forman la ruta paralela que ENG-03 debe caracterizar. Ninguno se elimina
hasta tener proyección canónica, replay parity y consumidores cero.

### Harnesses y adaptadores

- `internal/engineer/replay/jsonl.go`
- `internal/engineer/replay/source.go`
- `internal/engineer/simulator/scenario.go`
- `internal/engineer/simulator/source.go`
- `internal/engineer/service/overlays_live_adapter.go`

Replay y escenarios se conservan como herramientas explícitas de test. El
simulador no puede seguir siendo fallback de producto ni fuente `connected`.

### Spotter y monitores

- `conditions`
- `damage`
- `driverswaps`
- `engine`
- `flags`
- `fuel`
- `laps`
- `multiclass`
- `opponents`
- `pearls`
- `penalties`
- `pitstops`
- `position`
- `push`
- `racetime`
- `sessionend`
- `spotter`
- `strategy`
- `timings`
- `tyre`
- `watchedopponents`

Cada paquete importa el frame legacy en código productivo. La lista no implica
que su semántica sea válida: una familia solo se migra cuando sus señales,
freshness, capabilities y replay oracle estén demostrados.

## Orden de migración posterior

1. Integrar explícitamente el contrato transversal de TC-05A.
2. ENG-03 define el payload real y el projector puro.
3. Un replay oracle compara proyección canónica y frame legacy sin conectar
   producción.
4. El composition root inyecta el puerto de proyección; Engineer no abre un
   reader LMU.
5. Los monitores migran por familia con capability y silence policy explícita.
6. Solo tras demostrar consumidores cero se retiran frame, parser y readers
   paralelos en una issue propia.

## Límites pendientes

- ENG-02 no declara IDs de señales de beta.
- No demuestra ninguna capability LMU concreta.
- No implementa payload, projector ni adaptación a TC-05A.
- No mide runtime, audio ni UI.
- No implementa mensajes, scheduler, cancelación efectiva o wiring.
- No autoriza promoción a `nightly`.
