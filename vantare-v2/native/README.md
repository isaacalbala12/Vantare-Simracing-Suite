# native — aplicación Rust (ADR 0099)

| Crate | Contiene |
| --- | --- |
| `domain` | Modelo común (`Snapshot`, `State`, `Quality`, capacidades, banderas), contrato del adaptador (`Adapter`, `Observation`), ViewModels (`standings`, `radar`, `pedals`) y formateador. Puro: sin simuladores, GPUI ni I/O; `unsafe` prohibido. |
| `runtime` | Adaptadores de simulador (módulos privados), núcleo, flujos y ciclo de vida. |
| `ipc` | DTO versionados (serde) y transporte entre procesos. |
| `engineer` | Consumidor de fotos/eventos y voz local bajo demanda, proceso separado. |
| `ui` | Biblioteca visual y binarios de overlays y Hub. |

## Dependencias permitidas

```text
runtime → domain, ipc      ipc → domain      ui → domain, ipc
engineer → domain, ipc, runtime (flujos neutrales y cierre; sin adaptadores)
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
supervisa. `--engineer <checkpoint>` añade `vantare-engineer` bajo demanda:
mismo supervisor/Job, reinicios independientes y cierre antes de overlays.
No nace sin esa opción. El checkpoint tiene un único dueño; no compartirlo
entre instancias. Véase [`engineer/README.md`](engineer/README.md).

```powershell
vantare [--core-bin R] [--overlays-bin R] [--engineer CURSOR] [--engineer-bin R] `
        [--plazo MS] [--reinicios N] [--instancia S] `
        [-- ARGS-DEL-NÚCLEO [-- ARGS-DE-OVERLAYS [-- ARGS-DE-ENGINEER]]]
vantare --parar        # pide el cierre ordenado a la instancia en marcha
```

Los binarios hijos se buscan junto a `vantare.exe` salvo `--core-bin` /
`--overlays-bin`. Los argumentos tras el primer `--` son del núcleo y los tras
el segundo, de overlays (`vantare -- --replay carrera.jsonl -- 4 --fuente pipe`).
El tercer grupo es de Engineer (requiere `--engineer`). Pipe e imágenes se
comparten automáticamente para autenticar ambos extremos del canal de eventos.
Ejemplo sin audio, desde `native/` con los binarios compilados:

```powershell
target/debug/vantare.exe --engineer C:/tmp/vantare-cursor.json -- `
    --replay ../testdata/lmu-fixture.bin --build 1.3.0.0 -- 4
```

`vantare-core --recording <JSONL>` activa recording al arrancar; sin opción
no abre fichero. Foto y eventos usan pipes distintos, misma ACL/primitivos:
`<pipe>-events` sirve cursor, hecho o hueco y ACK; su dueño I/O confirma disco
fuera de adquisición. El servicio mantiene ambos ciclos hasta cancelación.

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
  Engineer habilitado, overlays y después el núcleo. A cada hijo se le pide que termine
  (`WM_CLOSE` a sus ventanas y fin de su stdin) y, si sigue vivo pasado
  `--plazo` (3 s), se le mata. **Contrato para procesos sin ventana:** leer
  stdin hasta EOF y terminar.

Las pruebas de caída (`runtime/tests/lifecycle.rs`, procesos de verdad sobre un
pipe real) cubren: núcleo muerto (overlays sigue vivo, reconecta y acepta la
época nueva), overlays muerto o colgado (el núcleo sigue publicando), segunda
instancia, orden de cierre, presupuesto agotado y muerte conjunta, también
para Engineer: caída aislada, presupuesto exacto, colgado y cierre por Job.

## Topología

Núcleo y overlays en procesos separados unidos por el pipe (topología B de la
ADR 0099). La variante con todo en un proceso (A) se midió en la fase 0 y se
retiró: ver `docs/analysis/fase0-medicion-2026-09-29.md`.

## Desarrollar en Linux y macOS

La base Unix (#1437) permite compilar y probar en Linux y macOS el workspace
completo:
`domain`, `ipc`, `runtime`, `services`, `engineer`, `storage`, `ui` y `hub`.
`strategy` sigue siendo un workspace independiente. IPC usa los mismos DTO,
cursores, límites y nonce que Windows, mediante sockets de dominio Unix 0600 en
un directorio 0700 por UID dentro de `$XDG_RUNTIME_DIR` o del temporal (`/tmp`
en macOS, para no superar el límite de longitud del socket). Verifica UID, PID e
imagen del par; retira el socket al cerrar y recupera sockets huérfanos tras una
caída. Los ficheros `.lock` quedan para evitar carreras al reutilizar nombres.

En Ubuntu, además de Rust fijado por `rust-toolchain.toml`, instala las
herramientas y bibliotecas usadas por la revisión de GPUI y DuckDB:

```sh
sudo apt-get install build-essential clang cmake pkg-config libasound2-dev \
  libfontconfig-dev libgit2-dev libglib2.0-dev libssl-dev libva-dev libvulkan1 \
  libwayland-dev libx11-xcb-dev libxkbcommon-x11-dev libzstd-dev
cd vantare-v2/native
cargo fmt --check
cargo check --workspace --all-targets -j 4
cargo clippy --workspace --all-targets -j 4 -- -D warnings
cargo test --workspace --no-fail-fast -j 4
cargo test --workspace --test lifecycle -j 4
(cd strategy && cargo check --workspace --all-targets -j 4 && \
  cargo clippy --workspace --all-targets -j 4 -- -D warnings && cargo test --workspace -j 4)
# Workshop con escena grabada, sin núcleo ni telemetría live:
cargo run -p vantare-ui --bin vantare-workshop
```

La sesión gráfica es necesaria para abrir Hub, Studio o Workshop. Para comprobar
el arranque del núcleo con el Hub en modo demo sobre el mismo IPC Unix, desde
`native/` ejecuta `./scripts/smoke-linux-ipc.sh`. La prueba automatizada del
replay del núcleo usa `../testdata/lmu-fixture.bin` y un `Subscriber` real. El
smoke funciona en Linux y macOS; en macOS confirma la conexión con `lsof`.

GPUI necesita una sesión gráfica X11/Wayland y un driver Vulkan en Linux; en
macOS, las herramientas de desarrollo de Xcode. #1437 verifica el workspace
completo en ambos sistemas con esos gates y el smoke IPC. Las ventanas
Unix son de desarrollo: telemetría live LMU/ACC, overlays sobre juego/OBS, MSIX
y paridad por píxeles contra Wails siguen siendo exclusivamente Windows.

## Compilar y probar

```powershell
cd vantare-v2/native
cargo fmt --check
cargo clippy --workspace --all-targets --offline -j 2 -- -D warnings
cargo test --workspace --offline -j 2
```

`runtime/tests/core_e2e.rs` arranca el binario `vantare-core` con el fixture de
44 coches y con el corpus de 47 y comprueba, con un `Subscriber` de `ipc`, que
llegan fotos con revisión creciente y el número de coches de la captura.

`rust-toolchain.toml` fija 1.95.0. `.github/workflows/quality.yml` ejecuta los
gates del workspace en Ubuntu; #1437 no cambia los jobs ni el código de
Windows, cuya validación se ejecuta en el entorno Windows del orquestador.

## DuckDB precompilado para desarrollo (#1465)

El build habitual conserva `bundled-duckdb` por defecto: distribución no necesita
una DLL adicional. Para gates/workers se puede enlazar el binario oficial de
**DuckDB 1.5.5**, correspondiente a `duckdb = 1.10505.0`, sin compilar C++.
No se cambia la versión de la dependencia ni se descargan bibliotecas al compilar.

Desde `native/`, instala una vez por usuario el archivo oficial
[`libduckdb-windows-amd64.zip`](https://github.com/duckdb/duckdb/releases/tag/v1.5.5)
en el directorio compartido fuera del repo:

```powershell
.\setup-duckdb.ps1 # Una vez por usuario/PC; zip oficial y SHA-256 fijado.
.\gates.ps1 clippy
.\gates.ps1 test
.\gates.ps1 lifecycle
```

La ubicación compartida por defecto es `$env:LOCALAPPDATA/Vantare/duckdb-1.5.5`.
También admite un archivo oficial ya descargado con `setup-duckdb.ps1 -ArchivePath`;
siempre verifica el mismo hash antes de extraer únicamente la DLL y la biblioteca.
Para una ubicación distinta, usa `gates.ps1 -DuckDbDirectory` o `DUCKDB_LIB_DIR`.

El script reactiva `/default` de todos los miembros excepto storage, incluidos
los crates futuros: así no se apagan silenciosamente otros defaults. Si cambia
el default de storage, falla y pide revisar la selección. `DUCKDB_LIB_DIR` por sí
sola no desactiva `bundled`. Usa exclusivamente `native/target/gates`, dentro del
worktree, para no mezclar artefactos de features distintas con el build habitual.
Restaura el entorno al terminar; ese subdirectorio también cuenta en el disco del
worktree. Los ejecutables que usen
DuckDB necesitan esa DLL en `PATH` o junto al `.exe`. Para distribuir se sigue
usando `cargo build --workspace --bins --release -j 2`. Candidate y MSIX rechazan
un entorno con `DUCKDB_LIB_DIR` definida antes de compilar o crear artefactos;
retírala con `Remove-Item Env:DUCKDB_LIB_DIR` en la terminal de distribución.
En Linux/macOS, la biblioteca oficial equivalente debe estar también en la ruta
de bibliotecas del cargador de su sistema; esta variante se verificó en Windows.

## Workers: caché y limpieza (#1465)

Dev/test omiten símbolos de las dependencias (`profile.dev.package."*".debug = 0`).
Los crates propios conservan fichero y línea en sus trazas; depurar internamente
una dependencia requiere volver a activar sus símbolos. Release no cambia.

Sccache es opcional y se configura por terminal del worker, sin compartir `target/`
ni imponerlo al ciclo interactivo de Isaac. Cada worktree conserva su target propio;
la caché de sccache puede compartir resultados de dependencias. Gates usa la ruta
relativa estable `target/gates`: sccache 0.18 incluye `CARGO_TARGET_DIR` en su clave.

```powershell
$env:RUSTC_WRAPPER = (Get-Command sccache -ErrorAction Stop).Source
$env:CARGO_INCREMENTAL = '0'
sccache --show-stats
.\setup-duckdb.ps1 # Una vez por usuario/PC.
.\gates.ps1 clippy
.\gates.ps1 test
.\gates.ps1 lifecycle
sccache --show-stats
```

Los binarios, proc macros y build scripts no tienen por qué ser cacheables; cuenta
los hits reales. La primera compilación llena la caché. Para editar widgets con el
watcher de Workshop conserva incremental (`$env:CARGO_INCREMENTAL = '1'`): sccache
no cachea compilación incremental. No fijes `CARGO_TARGET_DIR` a un target común.

Para retirar artefactos antiguos del target del worker, desde **su** `native/`,
cuando no haya un build en curso:

```powershell
cargo sweep --time 7 --dry-run .
cargo sweep --time 7 .
```

Revisa primero el dry-run. Esto elimina artefactos regenerables, no reduce el
conjunto mínimo requerido por un build. No limpies targets de otros worktrees.
