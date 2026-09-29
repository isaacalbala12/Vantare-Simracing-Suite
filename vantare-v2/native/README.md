# native — aplicación Rust (ADR 0099)

| Crate | Contiene |
| --- | --- |
| `domain` | Modelo común (`Snapshot`, `State`, `Quality`, capacidades, banderas), contrato del adaptador (`Adapter`, `Observation`), ViewModels (`standings`, `radar`, `pedals`) y formateador. Puro: sin simuladores, GPUI ni I/O; `unsafe` prohibido. |
| `runtime` | Adaptadores de simulador (módulos privados), núcleo, flujos y ciclo de vida. |
| `ipc` | DTO versionados (serde) y transporte entre procesos. |
| `ui` | Biblioteca visual y binarios de overlays y Hub. |

## Dependencias permitidas

```text
runtime → domain, ipc      ipc → domain      ui → domain, ipc
```

`domain` no depende de nada del workspace; `domain` y `ui` **nunca** dependen de
`runtime`, ni transitivamente. Lo comprueba `domain/tests/architecture.rs`
(`cargo tree`) dentro de `cargo test`.

## Contrato adaptador ↔ núcleo

`Adapter::poll(now) -> Result<Option<Observation>, AdapterError>` (sin bloquear,
reloj inyectado). Una `Observation` es `Origin` (simulador, reloj de origen y de
recepción) más `State`, con las capacidades que declara el adaptador. El núcleo
implementa `merge(previous: Option<&Snapshot>, Observation, epoch: u64) ->
Result<Snapshot, Reject>` (validación, derivaciones, numeración; la frescura la
vigila `Core`); ver `domain/src/adapter.rs`. Los widgets solo
ven `standings::project(&Snapshot, Preferences)`, `radar::project(&Snapshot)` y
`pedals::project(&Snapshot, Preferences)`.

## Arrancar el esqueleto

Dos procesos, cada uno en su terminal (`cd vantare-v2/native`):

```powershell
# 1. Núcleo: reproduce el corpus real de 47 coches a tiempo real y lo sirve por
#    el pipe \\.\pipe\vantare-core-<SID del usuario>.
cargo run -p vantare-runtime --release --bin vantare-core -- --replay ../testdata/rust-port/lmu47-high-rate-60s.tar.gz

# 2. Overlays: se conectan a ese pipe (reintentan solos si el núcleo aún no está).
cargo run -p vantare-ui --release --bin vantare-overlays -- 4
```

`vantare-core (--replay <fixture.bin|corpus.tar.gz> [--build <versión LMU>]
[--velocidad 1.0] | --live) [--pipe <nombre>]`:

- `--replay` reproduce respetando las marcas de la captura. Un corpus `.tar.gz`
  trae su build; un fixture `.bin` (un solo frame) exige `--build`, p. ej.
  `--replay ../testdata/lmu-fixture.bin --build 1.3.0.0`. Con un frame único la
  fuente se queda parada y a los 500 ms la foto pasa a obsoleta (los overlays
  muestran guiones), como con un juego en pausa. `--velocidad` escala el reloj.
- `--live` lee Le Mans Ultimate en marcha (memoria compartida y REST local).
- `--pipe` cambia el nombre del pipe; el de por defecto lleva el SID del
  usuario. Cada arranque estrena época (milisegundos de reloj de pared): los
  overlays reconstruyen su estado al verla cambiar.
- Ctrl+C, Ctrl+Break o cerrar la consola paran el bucle, cierran el pipe y
  terminan; si no acaba en 4 s, sale por la fuerza.

`vantare-overlays [1|4|22] [--ventanas por-widget|una] [--fuente
local|pipe[:<nombre>]]`: `pipe` (por defecto, con el nombre por defecto del
núcleo) recibe del núcleo; `local` usa una carrera sintética, sin núcleo. Ver
[`ui/README.md`](ui/README.md).

## Compilar y probar

```powershell
cd vantare-v2/native
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

`runtime/tests/core_e2e.rs` arranca el binario `vantare-core` con el fixture de
44 coches y con el corpus de 47 y comprueba, con un `Subscriber` de `ipc`, que
llegan fotos con revisión creciente y el número de coches de la captura.

`rust-toolchain.toml` fija 1.95.0. El workflow `native.yml` ejecuta lo mismo en
Windows para los PR que tocan `vantare-v2/native/**`.
