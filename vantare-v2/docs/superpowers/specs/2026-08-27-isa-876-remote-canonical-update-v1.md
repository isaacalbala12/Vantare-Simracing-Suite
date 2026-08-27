# ISA-876 — SDD de `RemoteCanonicalUpdateV1`

Estado: aprobado para implementación en la rama de ISA-876. Depende de ADR
0010 / ISA-870 y no habilita telemetría remota.

## Objetivo

Definir un contrato JSON V1, compacto y autosuficiente, que un futuro worker
Windows podrá construir desde el `FinalState` ya aceptado por
`TelemetryEngine.Apply`. Este corte entrega tipos, proyección pura, validación,
codec y pruebas. No añade wiring, cola, goroutine, listener, red, pairing ni UI.

## Frontera

```text
EngineResult.State post-commit
          |
          v
remote/v1.Project (puro, sin I/O)
          |
          v
RemoteCanonicalUpdateV1 -- Encode/Decode -- golden JSON
```

La futura cola remota recibirá el snapshot post-commit y ejecutará proyección,
encoding y red fuera del camino de `WriteBatch`. ISA-876 no conecta esa cola:
ningún `.go` productivo del repositorio fuera del propio paquete importa
`remote/v1`.

## Envelope y continuidad

`RemoteCanonicalUpdateV1` declara:

- `version = 1`;
- `kind = "full"`;
- `canonicalVersion = 1`;
- `streamEpoch`, tomado de `Header.Cursor.Epoch`;
- `revision`, tomado de `Header.Cursor.Sequence`;
- `sessionId`;
- `capturedAt`, RFC3339 UTC, solo diagnóstico y orden humano;
- `session`, `player` y `vehicles` como payload allowlisted.

Cada mensaje es full. La revisión puede saltar porque la entrega futura será
latest-wins. Dentro del mismo epoch, `sessionId` es estable y se rechazan sus
cambios, duplicados y retrocesos. Un epoch nuevo acepta un full válido con una
sesión distinta y cualquier revisión no cero: latest-wins puede haber perdido
el primer full emitido. El primer mensaje observado también debe ser full.

El receptor de referencia mantiene solo
`(epoch, revision, sessionId, receivedAt)` y no retiene snapshots. `receivedAt`
lo aporta el caller desde su reloj monotónico; `capturedAt` nunca decide
liveness. Si `now` es anterior a `receivedAt`, devuelve `Waiting` porque no
puede acreditar una edad local válida. Así se puede demostrar continuidad sin
crear un runtime Mac ni un temporizador.

## Allowlist V1

Todos los números usan unidades SI declaradas en el nombre JSON. Cada valor
telemetría usa `QValue<T> = {"q": quality, "v": value?}` con quality
`fresh | stale | missing | invalid`; un cero fresh sigue siendo distinguible
de missing. Cada campo conserva su quality de forma independiente: en
particular, `deltaReference` puede seguir fresh mientras `deltaSeconds` está
missing o invalid durante boxes o una transición.

### Sesión

- circuito;
- tipo de sesión;
- segundos restantes derivados;
- máximo de vueltas.

### Jugador

- identidad de vehículo;
- velocidad m/s, RPM, marcha, throttle, brake y clutch;
- vuelta, vueltas completadas, sector y distancia de vuelta;
- estado de pit y número de paradas;
- combustible restante, capacidad y consumo canónico por vuelta;
- delta canónico y referencia;
- daño observado resumido: dents, overheating, detached y ruedas separadas.

### Grid

Por vehículo:

- identidad, nombre de piloto, nombre y clase del coche;
- posición, vuelta, vueltas completadas, sector y distancia de vuelta;
- pit y penalizaciones;
- gaps observados al líder y al siguiente;
- gaps derivados al jugador;
- posición X/Z en centímetros.

Quedan fuera a propósito: raw, facts, histories, voz, rutas, nombres de sesión
persistidos, orientación/velocidad 3D, grabación, replay y cualquier dato no
enumerado. Añadir un campo requiere una versión compatible o V2 y tests.

## Validación y codec

- JSON estándar, sin dependencia nueva.
- Límite V1: 128 KiB codificados. El contrato debe caber con 104 vehículos;
  superar el límite es error, no truncado.
- Antes del decode tipado, `Decode` recorre tokens y rechaza `null`, claves
  duplicadas y cualquier casing o tag fuera del vocabulario exacto V1.
  Después usa `DisallowUnknownFields`, exige un único valor JSON y rechaza
  trailing bytes.
- Campos envelope requeridos: versión exacta, kind full, canonical v1, epoch y
  revisión no cero, sesión no vacía y timestamp RFC3339 UTC válido.
- Quality solo admite los cuatro valores cerrados. `missing` no puede llevar
  valor; `fresh`/`stale` deben llevarlo. `invalid` no lleva valor.
- Se rechazan NaN/Inf, límites negativos imposibles y duplicados de VehicleID.
- El encoder valida antes de serializar y aplica el mismo límite.

## Diseño mínimo de código

Paquete único `internal/telemetry/projection/remote/v1`:

- `contract.go`: DTOs, constantes, qualities y errores tipados/sentinela;
- `project.go`: transformación pura desde
  `envelope.Snapshot[derive.FinalState]`;
- `codec.go`: `Validate`, `Encode` y `Decode`;
- `receiver.go`: validador de primer full, epoch/revisión y liveness monotónico
  sin goroutine ni reloj global;
- tests, fuzz seeds y `testdata/*.golden.json` en el mismo paquete.

No se crea interfaz, registry, factory, manager, transport abstraction ni
configuración productiva.

## Pruebas

1. Golden de sesión activa representativa y golden mínimo con datos missing.
2. Round-trip byte estable tras decode/encode.
3. Rechazo de versión/kind/canonical desconocidos, unknown fields, casing no
   exacto, claves duplicadas en cualquier objeto, `null`, required ausentes,
   trailing JSON, truncado y payload >128 KiB.
4. Rechazo de quality/value incoherentes, NaN/Inf y VehicleID duplicado;
   aceptación de quality independiente para delta y su referencia.
5. Receptor: primer full, salto de revisiones aceptado, duplicado/retroceso y
   cambio de sesión dentro del epoch rechazados; epoch nuevo acepta una sesión
   distinta y una primera revisión observada mayor que uno.
6. Liveness: `Live`/`Stale` depende solo de `receivedAt` monotónico inyectado;
   `now < receivedAt` falla seguro como `Waiting`.
7. Fuzz acotado de `Decode` sin panic.
8. Benchmark de project+encode y decode para 1, 44 y 104 vehículos, registrando
   tamaños sin convertirlos en una promesa de transporte.
9. Test arquitectónico: ningún `.go` productivo del repositorio fuera del
   propio paquete importa remote V1; se excluyen tests.

## Archivos esperados

- este SDD;
- `internal/telemetry/projection/remote/v1/*.go`;
- `internal/telemetry/projection/remote/v1/testdata/*.json`;
- `docs/telemetry-core/remote-canonical-update-v1.md` con tabla de allowlist y
  mediciones finales;
- `docs/vantare-program/handoffs/telemetry-core.md`.
- `docs/roadmap/plan.md` y su `roadmap.json` regenerado, modificando únicamente
  `milestones:telemetry-remote-v1`.

El hito permanece como `plan` y no aumenta progreso: solo registra que el
contrato wire está en desarrollo aislado y que la capacidad sigue no
disponible.

## Checks y cierre

- tests focales del paquete;
- fuzz acotado;
- `go test ./...`;
- `gofmt` y `git diff --check`;
- revisión independiente sin P0/P1 y con foco explícito en simplicidad;
- inspección del grafo de imports para demostrar cero wiring productivo.

Rollback: retirar el paquete y la documentación de ISA-876. Como no existe
wiring, el runtime y la telemetría local permanecen idénticos antes y después.
