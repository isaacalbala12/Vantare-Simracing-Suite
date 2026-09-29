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
- Ctrl+C, Ctrl+Break, cerrar la consola o que su stdin llegue a EOF (así lo pide
  el launcher) paran el bucle, cierran el pipe y terminan; si no acaba en 4 s,
  sale por la fuerza. Con stdin cerrado o nulo desde el arranque termina al
  instante. Al acabar un replay sigue sirviendo la última foto (obsoleta).

`vantare-overlays [1|4|22] [--fuente local|pipe[:<nombre>]]` (una ventana por
monitor con todos los widgets): `pipe` (por defecto, con el nombre por defecto
del núcleo) recibe del núcleo; `local` usa una carrera sintética, sin núcleo. Ver
[`ui/README.md`](ui/README.md).

Para desarrollar widgets sin núcleo, `ui/workshop.ps1` abre `vantare-workshop` con una
escena LMU fija y la recompila al guardar (ver `ui/README.md`, «Workshop»).

## Ciclo de vida: `vantare`

`vantare` (`runtime/src/bin/vantare/`) es el propietario del arranque y el
cierre: lanza `vantare-core` y `vantare-overlays` como procesos hijos y los
supervisa.

```powershell
vantare [--core-bin R] [--overlays-bin R] [--plazo MS] [--reinicios N] [--instancia S] `
        [-- ARGS-DEL-NÚCLEO [-- ARGS-DE-OVERLAYS]]
vantare --parar        # pide el cierre ordenado a la instancia en marcha
```

Los binarios hijos se buscan junto a `vantare.exe` salvo `--core-bin` /
`--overlays-bin`. Los argumentos tras el primer `--` son del núcleo y los tras
el segundo, de overlays (`vantare -- --replay carrera.jsonl -- 4 --fuente pipe`).

- **Muerte conjunta.** El launcher se mete en un Job Object con
  `KILL_ON_JOB_CLOSE` y los hijos nacen dentro: si el launcher muere (incluso
  abruptamente), el sistema mata a los hijos.
- **Instancia única.** Un mutex `Globalantare-launcher-<usuario>`; la segunda
  instancia registra el motivo, no arranca nada y sale con 0. `--instancia`
  añade un sufijo a los nombres (para aislar pruebas).
- **Supervisión.** Un hijo que cae (código distinto de 0, o muerto) se reinicia
  con espera de 250 ms que se duplica hasta 8 s y un presupuesto de
  `--reinicios` (5); aguantar 30 s en marcha lo restaura. Núcleo y overlays
  se reinician cada uno por su cuenta: reiniciar el núcleo lo hace publicar con
  una época nueva y overlays reconecta solo (`ipc`); reiniciar overlays no
  toca el núcleo. Agotado el presupuesto, el launcher registra el motivo en
  stderr, cierra todo y sale con 1. Un hijo que sale con 0 ha terminado a
  propósito (overlays cerrado por el usuario, replay acabado): se cierra todo y
  se sale con 0.
- **Cierre ordenado.** Ctrl+C, cierre de consola o `vantare --parar`: primero
  overlays y después el núcleo. A cada hijo se le pide que termine
  (`WM_CLOSE` a sus ventanas y fin de su stdin) y, si sigue vivo pasado
  `--plazo` (3 s), se le mata. **Contrato para procesos sin ventana:** leer
  stdin hasta EOF y terminar.

Las pruebas de caída (`runtime/tests/lifecycle.rs`, procesos de verdad sobre un
pipe real) cubren: núcleo muerto (overlays sigue vivo, reconecta y acepta la
época nueva), overlays muerto o colgado (el núcleo sigue publicando), segunda
instancia, orden de cierre, presupuesto agotado y muerte conjunta.

## Topología

Núcleo y overlays en procesos separados unidos por el pipe (topología B de la
ADR 0099). La variante con todo en un proceso (A) se midió en la fase 0 y se
retiró: ver `docs/analysis/fase0-medicion-2026-09-29.md`.

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
