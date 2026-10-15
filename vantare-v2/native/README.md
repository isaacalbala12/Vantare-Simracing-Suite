# native — aplicación Rust (ADR 0099)

Los ejemplos Cargo muestran el comando interior: ejecutarlo siempre por la
cola de `AGENTS.md`: `native/scripts/compilar.ps1` desde `vantare-v2/`. Usar target aislado y `-j 2` (o `CARGO_BUILD_JOBS` de la máquina, ver «Workers»).

El workspace tiene 13 crates; `default-members` excluye storage y admin.

| Crate | Contiene |
| --- | --- |
| `domain` | Modelo neutral, Adapter, proyecciones/ViewModels y formato; puro, sin I/O ni GPUI. |
| `ipc` | Fotos DTO v10, demanda, transporte, derechos/control v4, contratos Engineer/Services y versión de producto. |
| `runtime` | Adapters LMU/ACC privados, núcleo, flujos y supervisor `vantare`. |
| `engineer` | Eventos, radio, spotter y voz local bajo demanda. |
| `storage` | Propietario único de series DuckDB (`SeriesChunk`, contrato independiente del DTO de fotos). |
| `services` | Cuenta Clerk, licencia, billing Polar, calendario/roadmap/reportes; protocolo v9, sin UI. |
| `ui` | 18 widgets, hosts de overlays/Workshop GPUI, kits Eficiencia y Vantare. |
| `hub` | Hub, Studio, presentación del Launcher, análisis, Testing Center y páginas de producto GPUI. |
| `launcher` | Motor de perfiles, discovery, procesos y archivos locales; sin GPUI. |
| `profiling` | Contadores compartidos por proceso, sin dependencias externas. |
| `build-support` | Recurso Win32 compartido; icono en `native/assets/icon.ico`. |
| `strategy` | Documento JSON y solver; miembro del mismo workspace. |
| `admin` | Herramienta privada del owner, fuera del instalador público. |

`packaging/` contiene scripts de distribución; versión y contratos viven en ipc,
el recurso Win32 vive en build-support. No es un crate.

## Dependencias permitidas

```text
runtime → domain, ipc      ipc → domain, profiling      ui → domain, ipc
engineer → domain, ipc, runtime (flujos neutrales y cierre; sin adaptadores)
```

`domain` no depende de nada del workspace; `domain` y `ui` **nunca** dependen de
`runtime`, ni transitivamente. Lo comprueba `domain/tests/architecture.rs`
(`cargo tree`) dentro de `cargo test`.

La estructura de Studio vive en [hub/README.md](hub/README.md).
`hub/tests/architecture.rs` vigila los techos de tamaño del Hub; subir un techo
exige un plan de partición en el mismo PR.

## Contrato de fotos y datos guardados

El pipe Core→Hub/overlays negocia solo DTO v11; rechaza peers v7/v8/v9/v10.
El host muestra una sola vez «Componentes incompatibles. Reinstala la misma
versión de Vantare», conserva el aviso durante los reintentos y lo retira al
recibir una foto compatible. No es una comprobación de versión de producto:
binarios distintos con el mismo contrato pueden interoperar.
Servicios usa protocolo v9 (#1610 y #1594, con vista previa de contexto); derechos/control conserva v4, independiente del DTO v11. Hub y services se recompilan juntos; los peers v7/v8 se rechazan.
El Hub distingue errores de versión de servicios y conserva su aviso de conexión.
`snapshot_from_json` es estricto; `snapshot_from_saved_json` conserva escenas
Studio/Workshop/exportaciones v7/v8/v9/v10/v11 sin reescribir originales.
`snapshot_from_fixture_json` es el helper explícito para fixtures históricas.
No usar esos lectores de compatibilidad en pipes live ni eventos live.
Fixtures archivadas: DTO v10; el lector explícito las migra a v11 en memoria; `.scene.json` contiene fases con fotos/captions,
no un protocolo alternativo. Ver [ui/README.md](ui/README.md).

## Contrato adaptador ↔ núcleo

`Adapter::poll(now) -> Result<Option<Observation>, AdapterError>` (sin bloquear,
reloj inyectado). Una `Observation` es `Origin` (simulador, reloj de origen y de
recepción) más `State`, con las capacidades que declara el adaptador. El núcleo
fusiona mediante `runtime::core::merge_validated` (validación, saneado,
derivaciones y numeración; recibe los trackers de combustible/delta/stint/
tendencia; la frescura la vigila `Core`); ver `domain/src/adapter.rs`.
Los widgets consumen las proyecciones puras de domain y pintan sus ViewModels.
La unificación de Standings, Relative, Delta y Fuel a una proyección/estado
por widget con N Looks está integrada (#1531); ambos pintores comparten Board y Motion.
La apariencia compartida vive en `ui::look::{Look, Tone, Accent}` (#1561 PR-3);
los nombres de los campos guardados no cambian.
Los 18 widgets reciben `frame(prefs, reduced)` mediante el registro generado;
el host decide movimiento reducido y cada widget lo aplica (#1561 PR-5).

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
los 13 crates listados arriba, incluido `strategy` en el mismo workspace. IPC usa los mismos DTO,
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

**Tests.** En nextest `-j` es `--test-threads`, no los jobs de compilación:
`gates.ps1` compila con los jobs de `CARGO_BUILD_JOBS` (2 si no está definida;
en nextest como `--build-jobs`) y ejecuta con los hilos de `.config/nextest.toml`
(4). `NEXTEST_TEST_THREADS` tiene prioridad sobre ese valor (CI lo fija en 2).
Los tests de triage lanzan `powershell.exe` con un plazo de 8 s que vence con la
CPU cargada; van de uno en uno (grupo `triage-powershell`) y los más largos
arrancan primero (`priority`). No subir hilos ni ese grupo sin medir. Para un
`cargo nextest` a mano, usa `--build-jobs`, no `-j`.

**Sccache.** `compilar.ps1` lo activa solo si está instalado (`VANTARE_SCCACHE=0`
lo apaga). Cada worktree conserva su target propio; sccache solo comparte las
dependencias de crates.io/git. Los crates del workspace y `vendor/gpui_windows`
son incrementales y no se cachean; tampoco binarios, proc macros ni build scripts.
En Windows las DLL de proc macros cambian en cada target (marca de tiempo y GUID
del PDB, también con `/Brepro`), así que los crates que usan derives fallan la
caché entre worktrees: en el servidor, ~75 % de hits en el primer build de un
worktree nuevo. La clave incluye las variables `CARGO_*`: no fijes
`CARGO_TARGET_DIR` ni `CARGO_INCREMENTAL` por worker (parten la caché). Pasa el
target con `--target-dir`, como hace gates con `target/gates`; así gates y los
targets propios comparten la caché
([implementación fijada](https://github.com/mozilla/sccache/blob/v0.18.0/src/compiler/rust.rs)).
Para editar widgets con el watcher de Workshop conserva incremental.

**Limpieza.** `scripts/limpiar-targets.ps1` borra los targets de Cargo (directorios
con su `CACHEDIR.TAG`) que no compilan desde hace más de `-Dias` días. Simula por
defecto; con `-Aplicar` borra. Nunca toca un target con un build en marcha
(`.cargo-lock` abierto), enlaces ni rutas fuera de `-Raiz`. Todo es regenerable.

```powershell
pwsh -NoProfile -File native/scripts/limpiar-targets.ps1 -Raiz C:\VantareServer\targets,C:\VantareServer\wt -Dias 7
```

### Configuración de máquina (servidor de workers)

En el servidor (`SapphireOS`) está aplicado:

- Variables de máquina `VANTARE_CARGO_SLOTS=2`, `VANTARE_CARGO_MIN_GB=4`,
  `CARGO_BUILD_JOBS=4` y `SCCACHE_CACHE_SIZE=5G`. Con dos workers compilando a la
  vez, 4 jobs por hueco tardan un 26 % menos que 2 sin bajar más la RAM libre
  mínima. Toda la caché de dev, test y prueba ocupó 1,5 GB; sccache expulsa lo
  más antiguo al llenarse (`%LOCALAPPDATA%\Mozilla\sccache`).
- Tarea `\Vantare\LimpiarTargets` (diaria 05:30, SYSTEM): ejecuta el script del
  checkout de integración con `-Raiz C:\VantareServer\targets,C:\VantareServer\wt
  -Dias 7 -Aplicar` y anexa la salida a `C:\VantareServer\logs\limpiar-targets.log`.
  El checkout de integración no se limpia.

Para replicarlo en otro PC Windows (PowerShell como administrador):

```powershell
[Environment]::SetEnvironmentVariable('VANTARE_CARGO_SLOTS', '2', 'Machine')
[Environment]::SetEnvironmentVariable('CARGO_BUILD_JOBS', '4', 'Machine') # 16 GB y 8 hilos
[Environment]::SetEnvironmentVariable('SCCACHE_CACHE_SIZE', '5G', 'Machine')
$script = '<checkout>\vantare-v2\native\scripts\limpiar-targets.ps1'
$arg = "-NoProfile -NonInteractive -Command `"& '$script' -Raiz <targets>,<worktrees> -Dias 7 -Aplicar`""
Register-ScheduledTask -TaskPath '\Vantare\' -TaskName LimpiarTargets -User SYSTEM `
    -Action (New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument $arg) `
    -Trigger (New-ScheduledTaskTrigger -Daily -At 05:30)
```

En macOS (sin `compilar.ps1`): `export SCCACHE_CACHE_SIZE=5G`, `CARGO_BUILD_JOBS`
según núcleos y RAM, y
`export RUSTC_WRAPPER=sccache` en `~/.zprofile`, y la limpieza con PowerShell
(`brew install powershell`) desde `crontab -e`:
`30 5 * * * pwsh -NoProfile -File <checkout>/vantare-v2/native/scripts/limpiar-targets.ps1 -Raiz <targets> -Dias 7 -Aplicar`.

### Medidas en el servidor (4 núcleos/8 hilos, 16 GB)

Un worker con el servidor libre, comandos de gates con DuckDB oficial. «Antes»:
nightly 79a1ace66 sin sccache (`-j 2` de nextest = 2 hilos de test y compilación
con los 8 hilos). «Después»: esta configuración, caché sccache ya llena por otro
worktree y `CARGO_BUILD_JOBS=4`.

| Medida | Antes | Después |
| --- | --- | --- |
| Worktree nuevo → `check --workspace --all-targets` | 272 s | 129 s |
| `clippy` tras ese check | 79 s | 55 s |
| Worktree nuevo → nextest en verde | 765 s | 614 s |
| … de ellos, ejecutar la suite | 461–482 s | 343 s |
| Gate `telemetria` (ejecución) | 1190 s | 531 s |
| Editar `ui` → `check` incremental | 16 s | 11 s |
| Editar `ui` → recompilar tests | 44 s | 30 s |
| `vantare-hub`, perfil `prueba`, worktree nuevo | 626 s | 351 s |
| Dos workers a la vez, build de tests en frío (sin caché) | 842 s | 625 s |
| Disco: check + clippy + nextest | 7,6 GB | 7,6 GB |

Lo que más pesa es la suite: los tests de triage (~350 s lanzando
`powershell.exe`, de uno en uno) y la paridad del solver (60 s solo, 190 s con
carga). En `telemetria`, un solo test (`acc_real_corpus_matches_frozen_dtos`)
marca el tiempo.

Medido y no aplicado: `[profile.test] incremental = false` ahorra 2,2 GB y 20 s
en frío pero recompilar tests tras editar pasa de 48 s a 78 s; `debug = 0` en los
crates propios ahorra 0,9 GB y 5 s pero quita fichero/línea de las trazas.
`cargo build -p vantare-hub` recompila ~25 crates frente a `--workspace` porque
cambian las features unificadas (`resolver.feature-unification` aún es inestable).

## Build para probar con Isaac (#1465)

Desde `native/`, con la configuración pública real cargada por el mismo loader
del empaquetado (se valida como datos; nunca se ejecuta ni se imprimen valores):

```powershell
.\gates.ps1 prueba -BuildConfig C:/tmp/beta/build-config/beta-dev-clerk.env
```

Produce los once binarios públicos en `target/gates/prueba/`, excluye admin y
copia la DLL oficial de DuckDB junto a los ejecutables. Dev/test y prueba tienen
perfiles distintos; el target de gates sigue separado del Release de distribución.
El perfil hereda Release, sin LTO, con optimización baja e incremental en el código
propio; GPUI/dependencias y Strategy conservan optimización alta. El script restaura
configuración, PATH, target e incremental incluso si falla. Sccache es opcional;
su primera carga para este perfil no sustituye el build en frío.

Para arrancar el Hub: `./target/gates/prueba/vantare-hub.exe`. Conserva esta copia
caliente para pruebas de producto. No distribuyas este perfil ni lo uses para
comparar CPU, memoria o fluidez: para ello sigue usando Release con DuckDB bundled.
Las reglas de herencia y overrides son las estándar de
[Cargo](https://doc.rust-lang.org/cargo/reference/profiles.html).
