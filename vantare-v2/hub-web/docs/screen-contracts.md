# Contrato por pantalla 路 VANTA-138

Cada pantalla mantiene su contrato en
`native/hub-host/src/protocol/modules/<id>/`. Los ids reservados `contract` y `validators` se rechazan. El identificador usa solo letras min煤sculas y
guiones bajos entre palabras (`testing`, `roadmap`, `studio`). El build descubre
las carpetas por orden alfab茅tico. No hay un registro que editar a mano.

## Archivos propios

| Archivo                 | Responsabilidad                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire.rs`               | Enums `Request`, `Reply`, `HostError`, `Topic`, `Event` que aporte la pantalla. Omitir los que no aporte. Derivar serde y, en tests/feature `bindings`, `TS`. Mantener el formato de rustfmt.                                                                                |
| `bindings.rs`           | `pub(crate) fn typescript() -> String` para DTO y constantes; `pub(crate) fn corpus() -> serde_json::Value` con `{host, ui}`, serializando variantes Rust reales. Los aliases de los cinco enums y las listas de m茅todos/temas se exportan autom谩ticamente.                  |
| `dispatch.rs`           | `pub(super) fn dispatch(session: &mut Session, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()>`. Solo recibe solicitudes de sus variantes, por tabla cerrada. Tests de la pantalla en este archivo o en un subm贸dulo propio.                                  |
| `state.inc`, `init.inc` | Opcionales: campos e inicializadores Rust de la sesi贸n. Para estado nuevo, preferir un campo `<id>_state` con un tipo concreto de la pantalla. El constructor aporta `args`, `core`, `settings`, `confirmation`, `privacy`. No usar estado global ni `Any`.                  |
| `remote.inc`            | Opcional: variantes de la operaci贸n pendiente. Si existe, `dispatch.rs` aporta `complete(&mut Session, Option<(u32, RemoteKind)>, u32, Result<services_protocol::Reply, HostError>) -> Result<Reply, HostError>`. Validar ID y tipo de respuesta antes de actualizar estado. |
| `tick.rs`               | Opcional: `pub(super) fn tick(&mut Session, &mut Pipe) -> io::Result<()>`, sin bloqueos ni esperas.                                                                                                                                                                          |
| `model.rs`              | Opcional: modelo p煤blico como `crate::<id>`. `model.path` conserva la ruta de los modelos anteriores; no duplicarlos.                                                                                                                                                        |

Los fragmentos `.inc` son tokens Rust insertados en el tipo/constructor concretos;
el compilador comprueba campos, tipos e inicializaci贸n. Los nombres de variantes
y de campos deben ser 煤nicos. Los m茅todos llevan `#[serde(rename = "pantalla.accion")]`
en una l铆nea; los temas usan variantes unitarias con `camelCase`. No introducir
renombres de temas excepcionales ni literales escapados en los nombres del wire.
Los enums mantienen `deny_unknown_fields` donde corresponde. No hay JSON abierto
ni mecanismo para ejecutar m茅todos no registrados.

En TypeScript la pantalla mantiene:

- `src/contract/modules/<id>.ts`: exporta `methods` desde su fichero generado y
  `isRequest`, `isReply`, `isError`, `isEvent`, todos con
  `(value: Record<string, unknown>) => boolean`. Un caso no admitido devuelve
  `false`; comprobar claves exactas, rangos y revisiones. La agregaci贸n exige
  coincidencia exacta entre m贸dulos y validadores.
- `src/mock/modules/<id>.ts`: `create(context: MockContext): MockHandler`.
  Mantener su estado en el cierre de esa sesi贸n; `undefined` significa que el
  mensaje pertenece a otra pantalla y `null` es una ausencia de respuesta
  simulada expresamente. Los datos, permisos y errores son locales de QA.
- El cuerpo del PR incluye una secci贸n `Handoff`: estado, SHA/checks, evidencia
  y siguiente paso. No editar los archivos del handoff compartido en los PR.

Si el m贸dulo declara `Topic`, `dispatch.rs` aporta tambi茅n
`subscribe(&mut Session, &mut Pipe, Topic) -> io::Result<()>` para publicar
el estado inicial. La tabla y la retirada de la suscripci贸n se agregan sin editar
el receptor central.

El registro visual `screens/<id>/entry.tsx` y `SectionChrome` sigue igual;
v茅ase [screen-registration.md](screen-registration.md).

## Generaci贸n y comprobaci贸n

Usar la cola y el target propio definidos en `native/README.md`:

```powershell
pwsh -NoProfile -File native/scripts/compilar.ps1 pwsh -NoProfile -File native/hub-host/regenerate-and-check.ps1
```

Esto exporta y comprueba `src/contract/generated/<id>.ts` y
`src/contract/generated/corpus/<id>.json`. **Versionar solo esos archivos propios.**
Un test Rust rechaza m贸dulos generados sobrantes o ausentes, compara cada archivo
con Rust y exige muestras de todas las variantes del wire. Un test por m贸dulo ejecuta todas sus muestras de solicitud contra el `dispatch.rs`
real, con pipe en memoria, ficheros temporales y servicios desconectados. Corre en
Windows y Linux; detecta un brazo omitido aunque exista el handler en la tabla.
Las suscripciones mantienen adem谩s la comprobaci贸n de ruta 煤nica.

```text
cd hub-web
bun run contract:index
bun run typecheck
bun run lint
bun run test
bun run build
```

Los 铆ndices `generated/contract.ts`, `generated/corpus.json`,
`generated/validators.ts` y `generated/mocks/` se reconstruyen y est谩n ignorados
por Git. Los consumidores conservan el import `generated/contract`.
`typecheck`, los builds Vite y Vitest generan sus 铆ndices antes de usarlos;
no hace falta Rust para trabajar en la interfaz con los m贸dulos ya exportados.
Los tests del 铆ndice comprueban la incorporaci贸n de otro m贸dulo, la uni贸n cerrada
y que los m贸dulos anteriores no cambian. Los aliases se extraen 煤nicamente de los
cinco enums de cada m贸dulo, no de otros DTO con nombres parecidos.

Cada `wire.rs` debe terminar exactamente con:

```rust
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
```

`wire.rs`, `dispatch.rs`, `bindings.rs` y `tick.rs` no son recorridos por
`cargo fmt`, porque los m贸dulos se incluyen desde `OUT_DIR`. Formatearlos
expl铆citamente con `rustfmt --edition 2024 --config skip_children=true <archivos>`.
Un test invoca `rustfmt --check` sobre todos ellos y falla si no est谩n formateados.
El build rechaza variantes/renombres en la misma l铆nea, temas agrupados y nombres
serializados duplicados entre solicitudes o entre respuestas de distintos m贸dulos.

El exportador Rust escribe exclusivamente m贸dulos y corpus propios. El 煤nico
generador del 铆ndice agregado es `scripts/contract-index.ts`; tras ejecutar el
exportador, usar `bun run contract:index` antes de consumir el 铆ndice.
No editar los 铆ndices, `protocol.rs`, `protocol/bindings.rs`, `lib.rs` ni
`ui_process.rs` para a帽adir una pantalla. Un cambio del transporte compartido
(versi贸n, autenticaci贸n, cierre, cola de servicios) sigue requiriendo coordinaci贸n.

## Migrar un PR ya abierto

Rebasar con `--onto` sobre el nightly que integre esta separaci贸n. Portar sus
variantes, DTO/constantes/muestras, estado y handlers al m贸dulo de la pantalla,
y sus validadores y mock a los archivos propios. Regenerar y revisar el diff:
los otros m贸dulos no deben cambiar. No recuperar los antiguos 铆ndices versionados
al resolver conflictos. Las 煤nicas respuestas de error aceptadas siguen siendo
las declaradas por Rust; mantener CAS y las comprobaciones de permisos existentes.

La migraci贸n conserva el wire v6, sus l铆mites, la autenticaci贸n y el guard de
cierre. La apariencia no cambia. Se eliminan dos muestras duplicadas de un mismo
evento `updates`; permanece la cobertura de todas sus variantes.

### Respuestas diferidas

Un m骴ulo con `deferred.reply` puede devolver `Result<Option<Reply>, HostError>`
desde `complete`: `None` retiene la petici髇 mientras llega la confirmaci髇 de
una segunda operaci髇 del n鷆leo. Los m骴ulos sin ese archivo conservan su
firma y el generador envuelve su respuesta en `Some`, sin cambiar su wire.
El m骴ulo registra `(id, Instant)` en `session.deferred` 鷑icamente despu閟 de
que la segunda operaci髇 se acepte. El receptor env韆 la respuesta final o el
error; una desconexi髇, el plazo del protocolo o un cierre responde
`CoreUnavailable` antes de retirar la petici髇. Las respuestas tard韆s de esa
petici髇 cancelada se descartan. No se introducen variantes en el wire v6.
