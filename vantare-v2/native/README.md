# native — núcleo y overlays Rust (ADR 0099 / 0107)

ADR 0107 congela el Hub GPUI; su reemplazo web vive fuera de `native/`.

ADR 0107 congela el Hub GPUI. #1996 migra mecánicamente todos los consumidores
existentes (ui, Hub congelado, Gestión e instalador) a la misma dependencia
publicada `gpui-kit`/`gpui-pre`, sin cambiar `default-members` ni los gates.
No incorpora trabajo de producto al Hub. No se compilan dos GPUI por defecto;
el test `ui/tests/gpui_dependency.rs` comprueba el grafo resuelto. El backend
Windows parcheado y sus instrucciones viven en `vendor/gpui-pre-windows`.

Los ejemplos Cargo muestran el comando interior: ejecutarlo siempre por la
cola de `AGENTS.md`: `native/scripts/compilar.ps1` desde `vantare-v2/`. La cola asigna un target persistente configurable (D: en el servidor); ver «Workers».

## Rutas locales — #1869, paso 3

`ipc::paths::Root` calcula las rutas con una sola política, sin leer, copiar ni
mover documentos. `VANTARE_NATIVE_DATA_ROOT` absoluto tiene prioridad en todas
las plataformas; vacío equivale a ausencia. Un valor relativo da error explícito.
Las bases de plataforma también deben ser absolutas.

| Plataforma | Base sin override |
| --- | --- |
| Windows | `LOCALAPPDATA` |
| Linux | `XDG_DATA_HOME`, o `HOME/.local/share` si está ausente o vacío |
| macOS | `HOME/Library/Application Support` |

Desde esa base, los documentos nativos siguen en `Vantare/native`, y el Hub de
desarrollo en `VantareNative/hub`. Los flags explícitos, incluido `--data-dir`
de la beta, conservan prioridad. Con override absoluto válido, las rutas Windows
no se mudan. Con override vacío, rights/owner, residente, freshness, Engineer y
Services pasan de CWD a LOCALAPPDATA; el override relativo ahora da error
explícito en todos. El paso 10
de raíz física única queda fuera de esta entrega.
En Linux, Services y Engineer dejan `XDG_CONFIG_HOME`: no se copia ni se lee
la carpeta anterior, que se conserva. Linux/macOS solo tienen desarrollo,
según decisión del orquestador; no hay migración de datos de usuarios allí.

En tests y con `ipc/test-support`, `Root::from_env()` exige override QA absoluto
y no permite fallback. Services/UI lo activan en dev-dependencies; Launcher,
Admin, Engineer y Runtime lo reciben de `services/test-support`. Hub ya usa
`ipc/test-support` en sus tests.
Los casos de fallback y errores se prueban con entorno/plataforma inyectados,
sin mutar el entorno global ni acceder al disco. Cada tanda conserva los tres
overrides QA de native/LocalAppData/AppData.

## Mapa de crates

El workspace tiene 14 crates. La selección `default-members` enumera ocho:
`domain`, `runtime`, `ipc`, `ui`, `engineer`, `services`, `strategy` y `launcher`.
Los demás pueden compilarse como dependencias; no estar en esa lista no los
excluye del grafo de compilación.

| Crate | Contiene |
| --- | --- |
| `domain` | Modelo neutral, Adapter, proyecciones/ViewModels y formato; puro, sin I/O ni GPUI. |
| `ipc` | Fotos DTO v11, demanda, transporte, derechos/control v7, contratos Engineer/Services y versión de producto. |
| `runtime` | Adapters LMU/ACC privados, núcleo, flujos y supervisor `vantare`. |
| `engineer` | Eventos, radio, spotter y voz local bajo demanda. |
| `storage` | Propietario único de series DuckDB (`SeriesChunk`, contrato independiente del DTO de fotos). |
| `services` | Cuenta Clerk, licencia, billing Polar, calendario/roadmap/reportes; protocolo v19, sin UI. |
| `ui` | 18 widgets, hosts de overlays/Workshop GPUI, kits Eficiencia y Vantare. |
| `hub` | Hub, Studio, presentación del Launcher, análisis, Testing Center y páginas de producto GPUI. |
| `launcher` | Motor de perfiles, discovery, procesos y archivos locales; sin GPUI. |
| `profiling` | Contadores compartidos por proceso, sin dependencias externas. |
| `build-support` | Recurso Win32 compartido; icono en `native/assets/icon.ico`. |
| `strategy` | Documento JSON y solver; miembro del mismo workspace. |
| `admin` | Herramienta privada del owner, fuera del instalador público. |
| `installer` | Lector compartido installer::engine sin GPUI; Setup/Uninstall con UI/payload opcionales. Escrituras de generaciones aún en packaging hasta #1840 pasos 4–7. |

`packaging/` contiene scripts de distribución; versión y contratos viven en ipc,
el recurso Win32 vive en build-support. No es un crate.

En el recorrido de licencias, `runtime::rights` reúne Authority, catálogo y el
único verificador de acceso (ADR 0102, paso 11). Services conserva transporte v1
y persistencia genérica; no verifica ni usa claims antes del ACK del núcleo.

## Dependencias permitidas

```text
runtime → domain, ipc      ipc → domain, profiling      ui → domain, ipc
engineer → domain, ipc, runtime (flujos neutrales y cierre; sin adaptadores)
installer → build-support (build); GPUI fijado, sin runtime/domain/ipc
hub → installer (default-features=false: solo lectura, sin UI ni transporte/payload)
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
Servicios usa protocolo v19 (#1827, sin candidate/TransferRights y Session explícita; #1793, renovación automática; #1761, copia explícita del enlace PKCE; #1628, marketing verificado; #1631, login propio; #1661, Founders; #1634, Calendar.fallback; conserva #1610/#1594); derechos/control usa v7, independiente del DTO v11. Hub y services se recompilan juntos; se rechazan peers de servicios v18 o anteriores.
El Hub distingue errores de versión de servicios y conserva su aviso de conexión.
`snapshot_from_json` es estricto; `snapshot_from_saved_json` conserva escenas
Studio/Workshop/exportaciones v7/v8/v9/v10/v11 sin reescribir originales.
No usar esos lectores de compatibilidad en pipes live ni eventos live.
Fixtures activas del repo: DTO v11, leídas por el camino estricto; `.scene.json` contiene fases con fotos/captions,
no un protocolo alternativo. Ver [ui/README.md](ui/README.md).

## Contrato adaptador ↔ núcleo

`Adapter::poll(now) -> Result<Option<Observation>, AdapterError>` (sin bloquear,
reloj inyectado). Una `Observation` es `Origin` (simulador, reloj de origen y de
recepción) más `State`, con las capacidades que declara el adaptador. El núcleo
fusiona mediante `runtime::core::merge_validated` (validación, saneado,
derivaciones y numeración; recibe los trackers de combustible/delta/stint/
tendencia; la frescura la vigila `Core`); ver `domain/src/adapter.rs`.
`domain::Scope::of(Source, &State)` identifica fuente (simulador y live/replay), `session.id` y
coche del jugador. Core lo usa para retención en pausa y confirmación de
situación; las derivaciones con memoria también lo usan y reinician al cambiar
la fuente. El adaptador debe emitir un SessionId nuevo si cambia un valor
conocido de circuito o tipo; ausencia/calidad de metadatos no son otra sesión.
Época e hidratación del pipe conservan su Boundary propio. Journal conserva
la semántica de sus eventos; no se redefine SessionChanged por cambiar coche.
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
  se sale con 0. Diagnóstico es observer: se intenta arrancar una vez; ni su
  fallo ni su salida terminan la sesión o provocan reinicio. Durante el cierre
  comparte el plazo y un kill forzado suyo sí cuenta como defecto.
- **Cierre ordenado.** Ctrl+C, cierre de consola o `vantare --parar` inicia
  un único presupuesto `--plazo` P (3 s). Solicita EOF a Engineer habilitado,
  overlays y diagnóstico, en ese orden; no usa `WM_CLOSE`. Los consumidores
  pueden terminar en cualquier orden. El núcleo recibe EOF cuando todos los
  consumidores y workers han terminado, o al comenzar su reserva
  `min(1 s, P/2)`. Todos comparten el mismo vencimiento, sin sumar plazos.
  Overlays (`--control-stdin`) pide `cx.quit()` y ejecuta los ganchos GPUI,
  incluso con un layout vacío y `QuitMode::Explicit`.
  Resident y Host reciben cancelación y se consultan sin joins bloqueantes;
  sólo se recoge un hilo terminado. El camino normal conserva todo el cleanup
  y `finish()`. Agotado P, un hijo vivo se mata y recoge explícitamente también
  en Unix; un worker colgado se diagnostica y el supervisor sale con fallo.
  Al salir el proceso, el SO libera los locks de sus hilos. Las escrituras de
  documentos conservan temp+rename: un temporal incompleto no sustituye al
  documento anterior. Los archivos ancla `.lock` pueden persistir sin retener
  el bloqueo. El residente conserva los handles de apps propias para solicitar terminar
  las configuradas con cierre al salir incluso si su worker no responde.
  Si el registro de procesos está ocupado reintenta como máximo tres veces a
  20 ms (tolerancia de hasta 60 ms después de P, sin renovar el plazo). No espera
  la salida de esas apps; el cierre normal sí las recoge.
  Una salida no cero tras pedir cierre se registra sin fallar la sesión. La
  revocación de Engineer registra un fallo de cierre y conserva los demás hijos;
  sólo el shutdown final propaga ese fallo. Una salida natural en carrera con
  el kill es limpia (Windows: satisfactoria; Unix: código de salida presente).
  Un error de cierre no oculta el motivo de supervisión. La máquina pura
  `session::Session::paso` recibe el reloj y comparte el mismo conductor de E/S
  entre Windows y Unix. Engineer con permiso que sale con 0 sigue terminando
  la sesión; el cambio de política de Hub queda para el paso 4 de #1860.

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

> **CI de Linux retirada (#1654, ronda 9, opción C).** El producto es Windows; el job `native-linux`
> se ha eliminado de `quality.yml` (quedaban 27 tests `#[cfg(unix)]` frente a 1806 solo-Windows y ~18 min
> por PR). El desarrollo local en Linux/macOS sigue soportado por la base Unix (#1437) y este README, pero
> ya no lo verifica la CI: si se retoma, volver a añadir el job (histórico en el cuaderno de #1654).

La base Unix (#1437) cubre desarrollo en Linux y macOS. La medición actual
verifica las bibliotecas domain/ipc/strategy/runtime; la integración completa
está bloqueada por el fallo Unix de [#2004](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2004).
El soporte histórico incluye
los 14 crates listados arriba, incluido `strategy` en el mismo workspace. IPC usa los mismos DTO,
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

## Capturas sin ocupar la pantalla (#1655)

Compilar Hub y Workshop con `parity-capture`, por la cola y con target propio.
Solo Windows, sesión gráfica y **DPI 96 (escalado de Windows al 100 %)**.
Es un requisito operativo: a 125 % u otro DPI la herramienta falla con el HWND
todavía oculto; no genera una captura degradada. DPI mixto no está validado.
Mantener el checkout de compilación y sus fixtures: estos binarios QA usan
`CARGO_MANIFEST_DIR` y no son capturadores portátiles independientes del código.
Los binarios con `parity-capture` usan
el subsistema Windows para no crear una consola. En PowerShell, canalizar a
`Out-Host` (como abajo) espera también a estos ejecutables GUI. No se necesita
`VANTARE_CAPTURE_OFFSCREEN`: todos los modos de captura crean el HWND oculto,
fuera de **todos** los monitores y sin activar. El backend conserva esas
coordenadas desde `CreateWindowExW`; antes de presentar se verifica
`GetWindowRect`. Después de cada cambio de tamaño se sincroniza el viewport
de GPUI y se invalida el frame completo; un tamaño de pintura distinto al
cliente se rechaza. `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` evita foco/barra de tareas.
Un fallo de posición detiene el lote con la ventana oculta. No se usa el ratón,
el teclado, el escritorio ni un vigilante que mueva ventanas después de aparecer.

Un manifiesto JSON es una lista de entradas. Rutas relativas al directorio de
trabajo; las PNG y sus recibos deben quedar fuera del repo:

```json
[
  {"scene":"inicio-base","appearance":"vantare-dark","size":[1440,900],"output":"C:/tmp/capturas/inicio-dark.png"},
  {"scene":"inicio-base","appearance":"vantare-light","size":[1280,800],"output":"C:/tmp/capturas/inicio-light.png"},
  {"scene":"calendario-base","size":[1440,900],"output":"C:/tmp/capturas/calendario.png"}
]
```

```powershell
# Ejecutables ya compilados con parity-capture:
& C:/targets/mi-issue/debug/vantare-hub.exe --capture-batch C:/tmp/hub.json | Out-Host
& C:/targets/mi-issue/debug/vantare-workshop.exe --capture-batch C:/tmp/widgets.json | Out-Host
# vantare-overlays admite el mismo manifiesto de widgets.
```

Cada proceso reutiliza **una sola ventana** para el lote entero y la cierra al
terminar, también ante error. Al salir del lote se retiran las raíces aisladas
`%TEMP%/vantare-hub-parity/<pid>-...` del propio proceso; nunca los datos del
banco live-IPC ni rutas persistentes del usuario. Un error de limpieza se informa.
Si falla escribir o renombrar un recibo, se retira su `.tmp` sin tocar el destino.
El manifiesto del Hub admite `collapsed` y `zoom`
(90/100/110/125), además de escena, apariencia y tamaño. Los datos QA se vuelven
a cargar para cada entrada; la escena actual no depende de los argumentos del
proceso inicial. `parameters` admite la clave `calendar` en las escenas
`calendario-r6-*`: transporta su especificación a la demo, sin ejecutar comandos
ni modificar el entorno del proceso. Las claves no admitidas fallan. El adaptador
de #1634 ya está integrado en `hub/src/calendar/capture.rs`; no hay que aplicar
el parche histórico `calendar-batch-1634.patch`. La variable antigua
`VANTARE_CAPTURE_CALENDAR` se conserva como fallback para capturas sueltas.

En widgets, `scene` es el archivo de fotos existente (una foto o secuencia JSON),
`widget` es el nombre del registro y `settings`, opcional, contiene exactamente
los ajustes productivos con su campo `kind`. `until`, opcional, es el número de
fotos desde el principio que se alimentan antes de congelar la animación.
Sin `settings`, se conserva el aspecto histórico de la captura individual:
Eficiencia para Standings, Relative, Fuel, Delta y Pedals. Para comparar referencias
Vantare, indicar `settings` con `kind` y `designSystem: "vantare"` explícitos.
El lote de Workshop/overlays admite `parameters: {"language":"es"}` o `"en"`
para pintar con esas preferencias; por defecto usa español. Rechaza otros
idiomas o claves antes de crear el HWND. El idioma forma parte del recibo
incremental; no se comparte una captura entre idiomas. Hub mantiene sus propios
parámetros de escena.
`size` fija el cliente de captura (por defecto 2304×1440); la PNG conserva el
tamaño natural del widget. El alfa se recupera con las mismas dos pasadas
negro/blanco, ahora con `PrintWindow` del HWND. El Hub también usa `PrintWindow`;
GPUI no ofrece lectura de su textura en el binario normal de esta revisión.

```json
[
  {"widget":"pedals","scene":"ui/fixtures/pedals.snapshot.json","output":"C:/tmp/capturas/pedals.png"},
  {"widget":"standings","scene":"ui/fixtures/standings.snapshot.json","settings":{"kind":"standings","rowCount":7},"output":"C:/tmp/capturas/standings.png"}
]
```

`--capture ESCENA --out PNG` del Hub, `--captura PNG` del Workshop y
`--parity-capture PNG` de overlays siguen disponibles con la misma protección.
Los comparadores activos `hub/reference/capture-native.ps1`, `ui/compare.ps1`
y `ui/src/standings/capture-scenes.ps1` preparan manifiestos.
`hub/reference/compare.ps1` y `capture-alpha.ps1` son históricos inertes desde
#1929; sus bytes anteriores están en retirement. Los scripts externos deben invocar el lote una vez,
en lugar de un proceso por entrada. El mutex global y el turno `pantalla-ocupada` se comprueban dentro del proceso;
no envolver la invocación con otro mutex del mismo nombre.
El marcador es opcional; `VANTARE_CAPTURE_TURN_FILE` configura su ruta. Por
compatibilidad, si falta la variable se consulta `C:/tmp/fase2/pantalla-ocupada`.
Su contenido es el turno autorizado (`VANTARE_CAPTURE_TURN`). Un marcador ajeno
activo impide abrir la ventana. **Caduca a los 15 minutos desde su última
escritura** y la siguiente captura lo elimina bajo el mutex; así se recuperan
los marcadores huérfanos tras un cierre brusco. Quien lo gestione debe adquirir
`Global\VantareParityCapture` para escribirlo, renovarlo o borrarlo; renovar
antes de 15 minutos si la reserva debe durar más. No se crea un marcador por
captura: el mutex es quien serializa el trabajo real.
`hub/src/testing/capture.ps1` solo permite copiar un HWND QA ya fuera de los
monitores: rechaza teclas, clics y rueda; no lo activa ni lo recoloca.

El banco **`ui-quality` con política IPC live sigue disponible**. Compilar el
ejemplo con `parity-capture` y copiarlo como `vantare.exe` a una carpeta QA
externa, con su `replies.json` de contrato. `VANTARE_CAPTURE_POLICY=ipc` conserva
el lector real de derechos y sus cambios; el banco sin salida permanece vivo
con una sola ventana creada oculta, fuera de los monitores y sin foco. Copiar
ese HWND con `hub/src/testing/capture.ps1 -HubProcessId <PID> -ExpectedExecutable
<QA/vantare.exe> -OutputPath <PNG> -Width <ancho> -Height <alto>`.
`--control-stdin` permite cerrarlo ordenadamente por EOF, cancelando los lectores
y servidores QA. No usa recibos ni caché. Las capturas con salida (`--capture
... --out ...` y `--capture-batch`) exigen política congelada: quitar `ipc` o
proporcionar un archivo de política. Su error indica usar el banco vivo cuando
se necesitan cambios IPC. La regresión real de Windows compila el ejemplo y se
ejecuta con:

```powershell
python native/hub/src/testing/test_live_capture.py --exe C:/targets/mi-issue/debug/examples/ui-quality.exe --out C:/tmp/qa-live-nueva
```

Usa una carpeta nueva, datos sintéticos y un solo proceso; comprueba dos
revisiones IPC, dos PNG externas diferentes, cero ventanas en monitores/foco
y el cierre por EOF. No abre servicios reales ni usa credenciales personales.

El recibo `salida.png.capture.json` enlaza el contenido de la PNG con SHA-256 de
sus entradas: escena/datos, ajustes, tamaño, apariencia, ejecutable, DLL y
fixtures externos del Hub, más los controles QA heredados y el contenido de
`VANTARE_TESTING_CAPTURE_PREVIEW` cuando se proporciona. Los archivos grandes
se procesan en bloques de 1 MiB y se calcula SHA-256 de sus hashes concatenados.
Recompilar después de editar código o recursos embebidos. Si entradas y PNG
coinciden, no se abre ninguna ventana ni se reescribe el archivo; borrar/cambiar
la PNG o su recibo provoca recaptura. No se omite un PNG dañado. El resumen del
lote registra capturadas/omitidas, procesos de app, ventanas y tiempo.
La escena QA heredada `calendario-beta-prueba` usa el reloj real: también entra
en el hash, por lo que se vuelve a capturar cuando cambia. Las escenas con reloj
de demo congelado conservan el incremental habitual.

Mediciones completas, comparación de píxeles y límites de las referencias:
[informe de #1655](../docs/analysis/1655-capturas.md).

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
sola no desactiva `bundled`. Usa el target persistente que asigna `compilar.ps1`; Cargo distingue las features
y perfiles en sus huellas de compilación.
Restaura el entorno al terminar; los datos QA cuentan en el target del slot. Los ejecutables que usen
DuckDB necesitan esa DLL en `PATH` o junto al `.exe`. Para distribuir se sigue
usando `cargo build --workspace --bins --release -j 2`. Candidate y MSIX rechazan
un entorno con `DUCKDB_LIB_DIR` definida antes de compilar o crear artefactos;
retírala con `Remove-Item Env:DUCKDB_LIB_DIR` en la terminal de distribución.
En Linux/macOS, la biblioteca oficial equivalente debe estar también en la ruta
de bibliotecas del cargador de su sistema; esta variante se verificó en Windows.

## Workers: caché y limpieza (#1993)

Desde `vantare-v2/`:

```powershell
pwsh -NoProfile -File native/scripts/comprobar.ps1 runtime
# Un comando específico, siempre dentro de la cola:
pwsh -NoProfile -File native/scripts/compilar.ps1 cargo build --manifest-path native/Cargo.toml -p vantare-runtime --bin vantare-core -j 4
```

`comprobar` ejecuta Clippy (incluye tipos) y Nextest del crate y sus dependientes
directos, excluyendo siempre `vantare-hub` y `vantare-admin`. Un cambio en el
núcleo o en `ui` no los compila ni los prueba en local. Cargo resuelve sus
dependencias; no se activan defaults de paquetes ajenos a la selección. CI de PR a nightly añade los dependientes transitivos y excluye Hub/Admin, salvo
cambios explícitos en esos productos. Push a nightly/testers, promociones y
merge_group comprueban el workspace completo.
Cambios de configuración global o rutas nativas desconocidas fuerzan todo el
workspace, incluidos Hub/Admin; el filtro rápido solo excluye esos productos
cuando el diff pertenece a crates conocidos.
En CI, los consumidores legacy omitidos por el filtro rápido reciben `cargo
check` de biblioteca/binarios, sin sus tests: por ejemplo strategy y storage
comprueban Hub/Admin. También se comprueban ante cambios de domain/ipc/services/ui.
Esto conserva compatibilidad sin añadir Hub/Admin al flujo local de workers.
Los tests de procesos de Runtime preparan también el ejecutable Services.
El corpus de telemetría y lifecycle conservan sus gates cuando corresponden.
Nextest usa `--build-jobs`; `-j` controla hilos de test.

`VANTARE_TARGET_ROOT` configura la raíz de slots (proceso o Machine en Windows).
Sin ella se usa `LocalApplicationData/Vantare/targets`; GitHub usa RUNNER_TEMP.
Se respeta SCCACHE_DIR ya definido; sin él se consulta Machine y después
LocalApplicationData/Vantare/sccache. Este servidor tiene VANTARE_TARGET_ROOT=
`D:/VantareServer/targets` y SCCACHE_DIR=`D:/VantareServer/cache/sccache` en Machine.

La cola admite como máximo dos compilaciones. CARGO_BUILD_JOBS de Machine tiene
prioridad sobre el del proceso; en este servidor Machine fija 4. Usar `CARGO_BUILD_JOBS=4` en este
servidor. Cada mutex conserva `D:/VantareServer/targets/slot-0` o `slot-1` entre
ramas. Al cambiar de checkout se limpian únicamente los paquetes locales para
evitar ejecutables obsoletos; las dependencias se conservan. No crear targets por rama. Los comandos anidados síncronos reutilizan la
reserva del ancestro. Sccache local usa `D:/VantareServer/cache/sccache` (30 GB, puerto 4227) y es opcional;
Un CARGO_TARGET_DIR ya definido en el entorno se trata como target explícito:
se valida y reserva con su propio lease, en vez de usar slot-N. Es el caso de packaging.
`VANTARE_SCCACHE=0` permite repetir un fallo conservando su primera evidencia.

Antes de usar un slot, se limpia si lleva 14 días sin uso o supera 20 GB.
El tamaño se mide como máximo una vez por hora; entre medidas se usa su sello.
Los enlaces se comprueban antes de borrar. Solo
se limpia bajo el mutex correspondiente, sin enlaces ni locks Cargo abiertos;
menos de 15 GB libres en D: detiene la compilación local. El runner alojado
reserva 2 GB en el volumen temporal. Los targets explícitos se
reservan para mediciones o distribución, absolutos en el volumen configurado; no los limpia
el slot automáticamente. No se borran targets ajenos.

La CI usa exclusivamente `windows-latest` y rutas bajo `RUNNER_TEMP`. Instala
Nextest precompilado, ejecuta Clippy y construye un archivo de tests. Suite,
telemetría y los arneses lifecycle de Runtime/Engineer se ejecutan en jobs paralelos sin recompilar;
los overlays normal/QA se compilan en otro builder paralelo y
distribución/instalación corre en paralelo cuando el diff lo exige y siempre
en integración. El check obligatorio agrega todos sus resultados. El Hub web
no dispara Rust salvo cambios en `native/` o entradas globales del build.

La caché de GitHub comparte el límite de 10 GB del repo: registro/git con
actions/cache y artefactos de compilador con sccache GHA, sin duplicar targets.
El registro se indexa por Cargo.lock; sccache conserva una versión fija y decide
la reutilización por los inputs del compilador. Los PR pueden restaurar su base
nightly. CI desactiva incremental; local lo conserva. Los archivos de tests
son artefactos del mismo SHA, con retención de un día, no cachés de otra rama.

La cola PowerShell usa Win32 y no se ejecuta en macOS. Alternativa desde
`native/`, con target propio y cuatro jobs (Runtime y dependientes directos
Engineer/Storage; `python3 scripts/affected-crates.py --crate vantare-runtime`
calcula la selección, incluidos los puentes entre procesos):

```bash
export CARGO_TARGET_DIR="$HOME/target-<worker>" CARGO_BUILD_JOBS=4
export VANTARE_NATIVE_DATA_ROOT="$CARGO_TARGET_DIR/qa-data"
mkdir -p "$VANTARE_NATIVE_DATA_ROOT"
cargo clippy -p vantare-runtime -p vantare-engineer -p vantare-storage --lib --locked --offline -j 4 -- -D warnings
cargo test -p vantare-runtime -p vantare-engineer -p vantare-storage --lib --locked --offline -j 4
```

Esto comprueba bibliotecas, no sustituye los procesos y gates de Windows.
La integración Unix completa está bloqueada por #2004. Para eliminar targets
antiguos de Windows, `scripts/limpiar-targets.ps1 -Raiz <raíces> -Dias 7` simula
la limpieza; `-Aplicar` la ejecuta. Solo detecta targets con CACHEDIR.TAG:
`isa-1993-baseline`, que no tiene ese fichero, queda fuera. No usarlo sobre
targets ajenos. La tarea
del servidor `\Vantare\LimpiarTargets` conserva esa limpieza periódica;
la limpieza por slot es independiente. Los targets de medición de VANTA-137
se dejan para Isaac, conforme a su instrucción.

Opcional en Mac: con LLVM en PATH, cargo-xwin 0.23.1 y el target MSVC de Rust
1.95 instalados, `bash native/scripts/xwin-check-core.sh ~/target-<worker>`
comprueba bibliotecas del núcleo para Windows. Usa un target propio; bórralo al
terminar. No ejecuta Windows ni sustituye su CI. El build nativo macOS completo
conserva el fallo Unix registrado en #2004.

Las mediciones están en
[el expediente de #1993](../docs/analysis/1993-compilaciones.md). Release conserva
sus requisitos de distribución y DuckDB bundled. Los datos QA quedan bajo el
target de compilación; no se usan datos reales de usuarios.

## Build para probar con Isaac (#1465)

Desde `native/`, con la configuración pública real cargada por el mismo loader
del empaquetado (se valida como datos; nunca se ejecuta ni se imprimen valores):

```powershell
pwsh -NoProfile -File scripts/compilar.ps1 pwsh -NoProfile -File gates.ps1 -Gate prueba -BuildConfig C:/tmp/beta/build-config/beta-dev-public.cfg
```

Produce los once binarios públicos en `D:/VantareServer/targets/slot-N/prueba/`, excluye admin y
copia la DLL oficial de DuckDB junto a los ejecutables. Dev/test y prueba tienen
perfiles distintos; el target de gates sigue separado del Release de distribución.
El perfil hereda Release, sin LTO, con optimización baja e incremental en el código
propio; GPUI/dependencias y Strategy conservan optimización alta. El script restaura
configuración, PATH, target e incremental incluso si falla. Sccache es opcional;
su primera carga para este perfil no sustituye el build en frío.

Para arrancar el Hub, usa `D:/VantareServer/targets/slot-N/prueba/vantare-hub.exe`
(el comando imprime el slot elegido). Conserva esta copia
caliente para pruebas de producto. No distribuyas este perfil ni lo uses para
comparar CPU, memoria o fluidez: para ello sigue usando Release con DuckDB bundled.
Las reglas de herencia y overrides son las estándar de
[Cargo](https://doc.rust-lang.org/cargo/reference/profiles.html).

El job de distribución Release prepara MSVC x64 con el Developer PowerShell instalado y configura
`CC`/`CXX` con sccache, respetando valores previos. `RUSTC_WRAPPER` solo no
cubre el MSVC autodetectado por cc 1.5.1. El job usa sccache 0.19
precompilado y namespace propio por su soporte de `-Tp`; los demás conservan
0.18. El gate comprueba en disco privado un acierto C++ real y que el objeto
restaurado conserve su SHA-256, sin depender de la cuota o disponibilidad GHA; la distribución
Release conserva CRT estático y DuckDB bundled. No se habilita esta configuración
en el Mac ni se cambia el compilador de C++ del producto.
