# Contrato por pantalla · VANTA-138

Cada pantalla mantiene su contrato en
`native/hub-host/src/protocol/modules/<id>/`. Los ids reservados `contract` y `validators` se rechazan. El identificador usa solo letras minúsculas y
guiones bajos entre palabras (`testing`, `roadmap`, `studio`). El build descubre
las carpetas por orden alfabético. No hay un registro que editar a mano.

## Archivos propios

| Archivo                 | Responsabilidad                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire.rs`               | Enums `Request`, `Reply`, `HostError`, `Topic`, `Event` que aporte la pantalla. Omitir los que no aporte. Derivar serde y, en tests/feature `bindings`, `TS`. Mantener el formato de rustfmt.                                                                                |
| `bindings.rs`           | `pub(crate) fn typescript() -> String` para DTO y constantes; `pub(crate) fn corpus() -> serde_json::Value` con `{host, ui}`, serializando variantes Rust reales. Los aliases de los cinco enums y las listas de métodos/temas se exportan automáticamente.                  |
| `dispatch.rs`           | `pub(super) fn dispatch(session: &mut Session, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()>`. Solo recibe solicitudes de sus variantes, por tabla cerrada. Tests de la pantalla en este archivo o en un submódulo propio.                                  |
| `state.inc`, `init.inc` | Opcionales: campos e inicializadores Rust de la sesión. Para estado nuevo, preferir un campo `<id>_state` con un tipo concreto de la pantalla. El constructor aporta `args`, `core`, `settings`, `confirmation`, `privacy`. No usar estado global ni `Any`.                  |
| `remote.inc`            | Opcional: variantes de la operación pendiente. Si existe, `dispatch.rs` aporta `complete(&mut Session, Option<(u32, RemoteKind)>, u32, Result<services_protocol::Reply, HostError>) -> Result<Reply, HostError>`. Validar ID y tipo de respuesta antes de actualizar estado. |
| `tick.rs`               | Opcional: `pub(super) fn tick(&mut Session, &mut Pipe) -> io::Result<()>`, sin bloqueos ni esperas.                                                                                                                                                                          |
| `model.rs`              | Opcional: modelo público como `crate::<id>`. `model.path` conserva la ruta de los modelos anteriores; no duplicarlos.                                                                                                                                                        |

Los fragmentos `.inc` son tokens Rust insertados en el tipo/constructor concretos;
el compilador comprueba campos, tipos e inicialización. Los nombres de variantes
y de campos deben ser únicos. Los métodos llevan `#[serde(rename = "pantalla.accion")]`
en una línea; los temas usan variantes unitarias con `camelCase`. No introducir
renombres de temas excepcionales ni literales escapados en los nombres del wire.
Los enums mantienen `deny_unknown_fields` donde corresponde. No hay JSON abierto
ni mecanismo para ejecutar métodos no registrados.

En TypeScript la pantalla mantiene:

- `src/contract/modules/<id>.ts`: exporta `methods` desde su fichero generado y
  `isRequest`, `isReply`, `isError`, `isEvent`, todos con
  `(value: Record<string, unknown>) => boolean`. Un caso no admitido devuelve
  `false`; comprobar claves exactas, rangos y revisiones. La agregación exige
  coincidencia exacta entre módulos y validadores.
- `src/mock/modules/<id>.ts`: `create(context: MockContext): MockHandler`.
  Mantener su estado en el cierre de esa sesión; `undefined` significa que el
  mensaje pertenece a otra pantalla y `null` es una ausencia de respuesta
  simulada expresamente. Los datos, permisos y errores son locales de QA.
- El cuerpo del PR incluye una sección `Handoff`: estado, SHA/checks, evidencia
  y siguiente paso. No editar los archivos del handoff compartido en los PR.

Si el módulo declara `Topic`, `dispatch.rs` aporta también
`subscribe(&mut Session, &mut Pipe, Topic) -> io::Result<()>` para publicar
el estado inicial. La tabla y la retirada de la suscripción se agregan sin editar
el receptor central.

El registro visual `screens/<id>/entry.tsx` y `SectionChrome` sigue igual;
véase [screen-registration.md](screen-registration.md).

## Generación y comprobación

Usar la cola y el target propio definidos en `native/README.md`:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/hub-host/regenerate-and-check.ps1
```

Esto exporta y comprueba `src/contract/generated/<id>.ts` y
`src/contract/generated/corpus/<id>.json`. **Versionar solo esos archivos propios.**
Un test Rust rechaza módulos generados sobrantes o ausentes, compara cada archivo
con Rust y exige muestras de todas las variantes del wire. Un test por módulo ejecuta todas sus muestras de solicitud contra el `dispatch.rs`
real, con pipe en memoria, ficheros temporales y servicios desconectados. Corre en
Windows y Linux; detecta un brazo omitido aunque exista el handler en la tabla.
Las suscripciones mantienen además la comprobación de ruta única.

```text
cd hub-web
bun run contract:index
bun run typecheck
bun run lint
bun run test
bun run build
```

Los índices `generated/contract.ts`, `generated/corpus.json`,
`generated/validators.ts` y `generated/mocks/` se reconstruyen y están ignorados
por Git. Los consumidores conservan el import `generated/contract`.
`typecheck`, los builds Vite y Vitest generan sus índices antes de usarlos;
no hace falta Rust para trabajar en la interfaz con los módulos ya exportados.
Los tests del índice comprueban la incorporación de otro módulo, la unión cerrada
y que los módulos anteriores no cambian. Los aliases se extraen únicamente de los
cinco enums de cada módulo, no de otros DTO con nombres parecidos.

Cada `wire.rs` debe terminar exactamente con:

```rust
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
```

`wire.rs`, `dispatch.rs`, `bindings.rs` y `tick.rs` no son recorridos por
`cargo fmt`, porque los módulos se incluyen desde `OUT_DIR`. Formatearlos
explícitamente con `rustfmt --edition 2024 --config skip_children=true <archivos>`.
Un test invoca `rustfmt --check` sobre todos ellos y falla si no están formateados.
El build rechaza variantes/renombres en la misma línea, temas agrupados y nombres
serializados duplicados entre solicitudes o entre respuestas de distintos módulos.

El exportador Rust escribe exclusivamente módulos y corpus propios. El único
generador del índice agregado es `scripts/contract-index.ts`; tras ejecutar el
exportador, usar `bun run contract:index` antes de consumir el índice.
No editar los índices, `protocol.rs`, `protocol/bindings.rs`, `lib.rs` ni
`ui_process.rs` para añadir una pantalla. Un cambio del transporte compartido
(versión, autenticación, cierre, cola de servicios) sigue requiriendo coordinación.

## Migrar un PR ya abierto

Rebasar con `--onto` sobre el nightly que integre esta separación. Portar sus
variantes, DTO/constantes/muestras, estado y handlers al módulo de la pantalla,
y sus validadores y mock a los archivos propios. Regenerar y revisar el diff:
los otros módulos no deben cambiar. No recuperar los antiguos índices versionados
al resolver conflictos. Las únicas respuestas de error aceptadas siguen siendo
las declaradas por Rust; mantener CAS y las comprobaciones de permisos existentes.

La migración conserva el wire v6, sus límites, la autenticación y el guard de
cierre. La apariencia no cambia. Se eliminan dos muestras duplicadas de un mismo
evento `updates`; permanece la cobertura de todas sus variantes.

### Respuestas diferidas

Un módulo con `deferred.reply` puede devolver `Result<Option<Reply>, HostError>`
desde `complete`: `None` retiene la petición mientras llega la confirmación de
una segunda operación del núcleo. Los módulos sin ese archivo conservan su
firma y el generador envuelve su respuesta en `Some`, sin cambiar su wire.
El módulo registra `(id, Instant)` en `session.deferred` únicamente después de
que la segunda operación se acepte. El receptor envía la respuesta final o el
error; una desconexión, el plazo del protocolo o un cierre responde
`CoreUnavailable` antes de retirar la petición. Las respuestas tardías de esa
petición cancelada se descartan. No se introducen variantes en el wire v6.
