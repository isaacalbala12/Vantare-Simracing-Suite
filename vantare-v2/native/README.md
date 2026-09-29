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
implementa `merge(previous: Option<&Snapshot>, Observation, epoch: u64) -> Snapshot`
(fusión, derivaciones, numeración); ver `domain/src/adapter.rs`. Los widgets solo
ven `standings::project(&Snapshot, Preferences)`, `radar::project(&Snapshot)` y
`pedals::project(&Snapshot, Preferences)`.

## Compilar y probar

```powershell
cd vantare-v2/native
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

`rust-toolchain.toml` fija 1.95.0. El workflow `native.yml` ejecuta lo mismo en
Windows para los PR que tocan `vantare-v2/native/**`.
