# VANTA-137 / #1993 — compilación Rust

Mediciones iniciales sobre nightly `62dde8da4cdbec03604304d9253f016d924f4e26`, ADR 0107.
Rebase del tooling sobre nightly `db1aa706d`, con #1997 y #2007 ya fusionados.
Sin cambios de lógica ni dependencias de producto nuevas. No se modifica UI ni GPUI.
PR en orden: [#1997](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1997),
[#2003](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2003). El arreglo independiente
[#2007](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2007), para #2006,
ya está fusionado junto con #1997. #2003 y #2010 también están integrados: 479cca4bf y 2bde51160. El apartado de cierre al final reúne las cifras definitivas; los intentos previos se conservan como histórico.

## Alcance

El Hub GPUI queda congelado y se rehace en Electron fuera de `native/`.
Isaac canceló su partición: la extracción inicial de Orbit queda sin PR y sin
compilación validada en `D:/VantareServer/worktrees/isa-1993-orbit`, rama
`vantareapp/isa-1993-orbit`. No forma parte de estos PR.

`comprobar.ps1 <crate>` ejecuta Clippy y Nextest del crate y sus dependientes
directos, excluyendo Hub/Admin. Cargo compila sus dependencias. Los tests de
Runtime incluyen el ejecutable Services, requisito real entre procesos que no
representa una dependencia Cargo de binario. Los de Hub mantienen su requisito
Storage cuando se validan explícitamente. No se activan defaults de productos
ajenos a la selección.

## Resultados del servidor Windows

Ryzen 5 1500X, 16 GB, Rust 1.95.0. Mismo fichero privado de Runtime: inserción
temporal de `black_box(())`, restaurada byte a byte. Sccache desactivado en esta
comparación; antes: símbolos de líneas y dos jobs; después: debug=0 y cuatro jobs.
Había compilaciones ajenas, que no se detuvieron. Es una muestra, no una mediana
con el servidor en reposo. Todos los tiempos siguientes son segundos.

| Medición | Antes | Después |
|---|---:|---:|
| Recompilar vantare-core tras editar Runtime | 3,94 | 5,90 |
| Recompilar tests de biblioteca Runtime tras la edición | 14,78 | 8,91 |
| Preparar build del núcleo | 207,33* | 129,49 limpio |
| Preparar tests de biblioteca | 158,16* | 90,40 |
| Target de esta muestra núcleo + tests | 1,60 GiB | 1,36 GiB |
| PDB de esta muestra | 147,28 MiB | 109,51 MiB |
| Targets de workers | 7–10 GB por rama (dato inicial) | dos slots reutilizados |
| Build limpio de los ocho default-members, sin sccache | No medido equivalente | 267,74 s |
| Recompilar UI con dependencias calientes | No medido equivalente | 241,22 s |
| Cambio Runtime, build de los ocho default-members | No medido equivalente | 77,22 s |
| Caché sccache local | 15 GiB llena en C: (dato inicial) | máximo 30 GiB en D: |

*El target anterior conservaba dependencias de un intento interrumpido; esos
207,33 s no son un build limpio comparable. El único build limpio Windows de
núcleo comprobado en esta tanda es 129,49 s. La muestra no demuestra que el
build incremental sea más rápido: empeoró dos segundos; sí reduce tiempo de
compilar tests y unos 240 MiB de disco (14,7 %). La comprobación real por crate de Runtime y sus dependientes pasa: 930 tests,
14 exclusiones existentes, ejecución 52,99 s. La primera preparación de Services
añadió 3 min 50 s de build de tests; se conserva el fallo previo que detectó su
ejecutable ausente. La espera de cola se registra aparte (465 s), no como tiempo
de recompilación. No se compara un target de núcleo
con los 7–10 GB históricos de toda la app como si fueran el mismo trabajo.

## Mac M5: medido, no extrapolado

macOS ARM64, 10 núcleos, 16 GB; cuatro jobs, Rust 1.95.0, sin sccache para perfiles.
Mac autorizado por Isaac; el flujo local y CI no dependen de que esté encendido.
Mismo checkout y edición temporal, restaurada al finalizar. Ambos targets de
perfiles empiezan vacíos; dependencias descargadas antes de cronometrar.

| Medición M5 | Símbolos de líneas | debug=0 | debug=0, incremental=false |
|---|---:|---:|---:|
| Build limpio vantare-core | 21,68 s | 19,17 s | 18,43 s |
| Preparar tests Runtime --lib | 12,79 s | 12,20 s | 11,32 s |
| Editar Runtime: build | 1,02 s | 1,09 s | 3,34 s |
| Editar Runtime: compilar tests | 1,43 s | 1,52 s | 6,00 s |
| Target núcleo + tests | 1,15 GiB | 0,83 GiB | 0,31 GiB |

Se conserva incremental local por el coste observado al editar. CI lo desactiva
para cachear bibliotecas con sccache y porque cada VM empieza sin su target.

En una tanda nativa secuencial (dependencias progresivamente calientes):

| Crate | Build --lib | Compilar tests --lib | Ejecutar tests --lib | Resultado |
|---|---:|---:|---:|---|
| domain | 2,07 s | 5,21 s | 0,50 s | 190 PASS |
| ipc | 7,29 s | 8,06 s | 1,60 s | 100 PASS, 1 ignorado |
| strategy | 4,55 s | 4,34 s | 4,60 s | 43 PASS |
| runtime | 16,17 s | 12,04 s | 1,36 s | 301 PASS, 3 ignorados |

No se suman estos tiempos como cuatro builds limpios independientes ni se
promete esa velocidad para Windows. El binario vantare-core compila en macOS;
la suite de integración completa y lifecycle fallan en código Unix previo:
`runtime/src/bin/vantare/unix.rs:296`, `log` fuera de scope. Registrado aparte en
[#2004](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/2004).
No se modifica lógica para ocultarlo.

Mismo Rust 1.95, target Windows MSVC y SDK de xwin ya descargado: el M5
construyó Core limpio en 25,82 s; preparó tests Runtime --lib en 16,16 s.
Tras la misma edición privada: build 0,99 s y compilación de tests 1,71 s.
Estos binarios de tests no se ejecutaron en macOS: es compilación cruzada.

## Herramientas verificadas

| Prueba | Resultado y decisión |
|---|---|
| sccache 0.19 M5, incremental=0, dos targets vacíos | 18,97 → 11,18 s. Segundo target reutiliza compilador; no es un rebuild incremental. 109 aciertos acumulados, sin errores de caché. Windows conserva 0.18 y se mide aparte. |
| Nextest 0.9.146 archive, Runtime --lib M5 | Archivo con tests ya compilados: 0,72 s; extracción y ejecución: 1,76 / 1,52 s. PASS. En una máquina sola no mejora el target caliente; sirve para separar jobs de CI. |
| cargo-xwin 0.23.1 M5, Windows MSVC | domain/ipc/strategy --lib: PASS, 3,65 s con dependencias calientes. Runtime PASS con adaptador de recursos: 45,72 s incluyendo preparación. Script versionado del núcleo domain/ipc/strategy/runtime: PASS en 13,71 s con SDK descargado, target nuevo. Las rutas absolutas de llvm-rc requieren adaptación; no se modifica build-support. No sustituye ejecutar en Windows. |
| cargo-llvm-lines 0.4.48 Runtime | 297.803 líneas IR / 6.411 instancias; mayor función 1,6 %. No aparece una función enorme que justifique reescribir código dentro de esta tarea. |
| cargo-hakari 0.9.39, checkout desechable | Genera unión con GPUI/test-support, DuckDB bundled y serde_json/preserve_order. Reintroduciría coste y cambiaría features del núcleo. No se incorpora workspace-hack ni se toca UI. |
| Strategy opt-level=1 | 43 tests PASS, pero ejecución 6,68 s frente a 4,14 s con opt-level=3. Se conserva 3. |
| split-debuginfo Windows | Rust 1.95 MSVC solo ofrece packed. Con debug=0 no aporta ahorro adicional; no se cambia el formato. |
| Cargo build-dir 1.95, fixture mínima M5 | Default 1.067.279 bytes / 0,128 s; separado 1.067.529 bytes / 0,138 s. Mueve intermediarios, no elimina su espacio; no se añade otra carpeta por rama. |
| Frontend paralelo y Cranelift con 1.95 | -Zthreads es rechazado; componente Cranelift no disponible en el toolchain fijado. No se alteran defaults. |
| Nightly 1.102.0 del 9-nov-2026, M5 nativo | LLVM 19,50 s; -Zthreads=4: 17,25 s; Cranelift: 13,68 s. Targets vacíos, todos con panic=abort, solo build del núcleo. Opción experimental: no demuestra compatibilidad MSVC ni permite cambiar comportamiento/toolchain de producto. |

En compilación cruzada al target MSVC, con esa misma nightly y panic=abort:
LLVM 22,82 s; frontend paralelo 22,09 s; Cranelift 16,02 s. Son builds limpios
del núcleo desde el M5, no mediciones del host Windows ni pruebas funcionales
de esos binarios. Se mantienen como experimento; el producto conserva 1.95.0.

El informe investigador contiene propuestas, no mediciones equivalentes: se
verifican contra Cargo 1.95 y los comandos anteriores. No se adopta una opción
solo porque aparezca en la documentación de Rust más nuevo.

## Flujo y límites

Dos compilaciones como máximo, cuatro jobs por defecto en este servidor;
la memoria puede reducir la cola a un slot. Targets locales permanentes:
`D:/VantareServer/targets/slot-0` y `slot-1`. No se crean por rama. Limpieza bajo
mutex al superar 20 GB o tras 14 días sin uso; sin seguir enlaces ni limpiar
locks Cargo abiertos. Reserva de disco local: 15 GB. Comandos explícitos de
medición/distribución tienen mutex propio y target validado; no se borran targets
ajenos. Las reservas anidadas síncronas reutilizan la del ancestro.

Una prueba A → B → A detectó que Cargo reutilizaba un ejecutable obsoleto entre
checkouts con igual nombre de paquete. Al cambiar de raíz se invalidan paquetes
locales con cargo clean -p, conservando crates.io/git; dentro del mismo checkout
se conserva incremental. El test ejecuta los tres binarios reales.

## CI alojada en GitHub

Isaac corrigió la premisa inicial: CI corre en windows-latest de GitHub (4 vCPU),
no en este servidor. API verificada: cero runners registrados. No se registra
ninguno. Todas las rutas de CI parten de RUNNER_TEMP. Localmente se respeta
VANTARE_TARGET_ROOT y SCCACHE_DIR; el fallback es LocalApplicationData/Vantare.
En el servidor ambas variables de Machine apuntan a D:.
No debe presentarse el target efímero de GitHub como caché persistente del servidor.

Los checks obligatorios conservan nombre. Clippy cubre tipos y el banco bench de
Runtime. Build de tests archivado una vez; suite y telemetría usan el mismo archivo,
y lifecycle ejecuta los dos arneses originales (Engineer y Runtime), identificados
por paquete y empaquetados con overlays normal/QA. La primera CI detectó la
colisión de nombres; no se elige uno ni se pierde el otro. Los jobs
de ejecución no compilan. La preparación normal/QA de overlays va en un builder
paralelo; su artefacto tiene que coincidir con el SHA del archivo de tests.
El job de suite instala el Cargo 1.95 precompilado porque arquitectura invoca
una ruta absoluta de Cargo; no se cambia ni se omite esa prueba. Distribución/matriz siguen verificando los mismos
controles en paralelo cuando afectan al diff y siempre en integración.
El agregador exige éxito de todos los jobs aplicables, también si se cancelan.

PR a nightly: crates afectados y dependientes transitivos, sin Hub/Admin solo
cuando las rutas corresponden a crates conocidos (salvo cambios explícitos en
esos productos). Configuración global y rutas desconocidas fuerzan todo el
workspace, incluidos Hub/Admin. Runtime, services, domain, ipc y ui también
exigen instalación; solo strategy, engineer y storage son hojas para ese gate.
Los consumidores legacy que el filtro rápido retira de los tests se comprueban
con cargo check de biblioteca/binarios. Strategy/storage y los cambios en
domain/ipc/services/ui comprueban así Hub/Admin; los puentes del selector
también se aplican. No se ejecutan sus tests salvo alcance global o cambios
legacy explícitos. El flujo local conserva la exclusión de Hub/Admin.
Integración/promociones:
workspace completo. El Hub web y su workflow son independientes de native/.

Nextest es binario precompilado con fallback de compilación desactivado. Acciones
de terceros fijadas por SHA. Caché del repo: 10 GB compartidos; registro/git con
actions/cache (Cargo.lock/toolchain), sccache con backend GHA y versión fija.
No se guarda una segunda copia completa de targets. PR restaura caches de su base
nightly conforme al ámbito de GitHub; el archivo de tests es artefacto del mismo
SHA con retención de un día. Ningún secreto, ruleset ni auto-merge se modifica.

Primera ejecución real #2003, SHA 5d825f29f: Clippy 3 min 12 s, banco bench
44,70 s, captura 43,66 s, overlays normal 3 min 25 s y QA 14,32 s, build tests
6 min 40 s. Falló después al asumir un único lifecycle; se corrige para preservar
ambos paquetes. Caché GHA fría: 0 hits / 816 misses, 57 errores de escritura.
Esto no acredita el objetivo de 15 minutos ni un porcentaje de aciertos futuro.
Ejecución d06d906f1: build archivado PASS en 13 min 06 s; lifecycle PASS en
2 min y telemetría PASS en 4 min 20 s. Tramo Rust: 17 min 28 s desde el inicio
del builder. La suite detectó la ausencia de Cargo 1.95 en la segunda VM; se
añade su instalación precompilada y se paralelizan los 3 min 40 s de overlays.
Baseline real #1997, ejecución 42744850027: check obligatorio completo PASS,
57 min 24 s (02:45:35 → 03:42:59 UTC). No se compara este job con el agregador
de unos segundos: el cierre final se mide de inicio a fin de todos sus jobs.
La tabla definitiva y el HEAD verificado quedan en la descripción de #1993
y en el informe `D:/VantareServer/evidence/isa-1993/informe-final.md`.
No usar la duración del job agregador como si fuera la duración de CI completa.

## Evidencia y fuentes

Logs, JSON, scripts reproducibles y timings HTML: `D:/VantareServer/evidence/isa-1993`.
Histórico conservado en [#1465/#1654](1465-compilacion-historico.md).

Fuentes primarias consultadas: [Cargo performance](https://doc.rust-lang.org/nightly/cargo/guide/build-performance.html),
[sccache Rust 0.18](https://github.com/mozilla/sccache/blob/v0.18.0/docs/Rust.md),
[sccache GHA](https://github.com/mozilla/sccache/blob/v0.18.0/docs/GHA.md),
[Nextest archives](https://nexte.st/docs/ci-features/archiving/),
[Hakari](https://docs.rs/cargo-hakari/latest/cargo_hakari/about/index.html),
[cargo-xwin](https://github.com/rust-cross/cargo-xwin),
[Cranelift](https://github.com/rust-lang/rustc_codegen_cranelift),
[cargo-llvm-lines](https://github.com/dtolnay/cargo-llvm-lines).

## Fiabilidad adicional: #2006

La ruta de cada test Launcher ya es exclusiva (PID/contador). El fallo estaba
dentro de un test que abría una segunda cadena al recibir Done, antes de recoger
el worker de la primera. Reproducción Windows: 1/200 fallos con cuatro procesos,
mismo os error 32. PR #2007 añade Drop explícito y comprueba la retirada del lock:
200/200 PASS y 57/57 Launcher PASS. Fmt y Clippy MSVC all-targets PASS desde M5.
Los consumidores actuales esperan finished/shutdown; no se encontró una P1.
No se cambia producción, no se añaden retries, sleeps ni ignores. Evidencia
con ambos binarios y SHA-256: `D:/VantareServer/evidence/isa-2006`.

## Timeout de distribución de f4870d47f: bloqueo, no 60 minutos de Rust

La ejecución 42763471643 agotó 60 minutos, pero el primer control Release de
Core/Services había terminado en **46,40 s** (05:42:27 UTC). Después no hubo
otra compilación: el nuevo lease de target chocaba con el saneado del entorno.
Import-NativeBuildConfig eliminaba VANTARE_CARGO_QUEUE_OWNER/SLOT_TARGET y el
empaquetador anidado intentaba adquirir el target que retenía su padre.

Reproducción con proceso real y crate mínimo: bloqueado hasta el límite de
15 s con el import anterior; **2,34 s** y salida correcta conservando el
contexto de la cola. Las variables de cola siguen prohibidas en ConfigFile:
solo se preservan del proceso invocador. La regresión corre antes del gate.
Se separan distribución e instalación, se eliminan los -j 2 de empaquetado
para respetar Machine/proceso y se recogen tiempos/stats por cada fase.
El timeout de distribución es provisionalmente 90 min, con margen respecto
al baseline serial real de 57 min 24 s; no es un tiempo de build medido.

Los tres builds del gate son controles distintos: QA Release, candidato
limpio con CRT estático/DuckDB bundled y candidato con registro TEST que debe
rechazarse. El archivo Nextest contiene tests dev y fixtures; no sustituye
a los ejecutables Release cuya distribución se está verificando. No se
elimina ningún control para acortar el tiempo. Falta medir la ejecución sin
el bloqueo antes de atribuir un límite al hardware.

Pruebas de tooling: dos lifecycle homónimos archivados y ejecutados, transporte
entre jobs simulados sin disponer del target original, reserva anidada, limpieza
por edad con rechazo de locks/enlaces, rutas RUNNER_TEMP y A → B → A. Retirada:
471 huellas intactas. OpenCode 2.2.6 comprobado; no se lanzan nuevos delegates
porque T3 preparaba su worktree en C:. Se completa el trabajo directamente.

## Segunda tanda: enlazado, genéricos y caché de target

Rama de mediciones sobre #2003, sin modificar código Rust ni UI. Windows:
Core preparado sin sccache, tres relinks alternando el enlazador mediante
`cargo rustc`; se mide la invocación completa, no exclusivamente el linker.
M5: cuatro jobs, incremental=0, targets vacíos e independientes.

| Prueba | Antes | Después | Decisión |
|---|---:|---:|---|
| Windows Core, mediana de tres relinks | link.exe 2,40 s | rust-lld 1,98 s | Conservar rust-lld, que ya era el default. |
| M5 nightly, Core limpio | genéricos automático 18,71 s | share-generics=yes 15,16 s | Experimento; 1.95 rechaza -Z. Con no: 18,26 s. |
| M5, dos targets con CARGO_TARGET_DIR distinto | sccache frío 16,56 s | segundo 16,14 s | Cero hits Rust: esa variable separa sus claves. |
| M5, dos targets pasando --target-dir | sccache frío 16,08 s | segundo 10,80 s | Conservar la forma CLI ya adoptada; 85 hits Rust. |
| M5 Core, target propio sin sccache | limpio 19,65 s | caliente 0,31 s | Mantener target persistente local. |
| Mismo target restaurado desde zstd local | sin target 19,65 s | Cargo 0,17 s | Más 0,51 s empaquetar y 0,48 s extraer, sin red. |

El target de Core de esta prueba ocupa 264,34 MiB; su archivo zstd, 78,28 MiB.
La restauración prueba el mismo checkout y rutas, no una VM nueva de GitHub.
No se reemplaza sccache GHA por un target del workspace completo basándose
solo en este caso pequeño: faltan transporte real y presupuesto de los targets
con Hub/UI/release. Evitar duplicar ambos caches bajo los 10 GB del repo.

Prueba posterior real en **dos VMs windows-latest**, ejecución 42768131644,
HEAD 5e229d064, Rust 1.95, cuatro vCPU e incremental=0:

| Core Windows hosted | Segundos |
|---|---:|
| Target vacío, sin sccache | 118,85 |
| Primer target con sccache GHA frío | 151,56 |
| Segundo target con sccache GHA caliente | 88,91 |
| Target restaurado en otra VM, Cargo sin sccache | 34,87 |
| Descargar/restaurar ese target desde GitHub | 4 |
| Guardarlo en GitHub | 6 |

Target sin comprimir 594.888.857 bytes; caché GitHub 135.849.913 bytes. Sccache
del segundo build: 95 hits Rust; 24 misses nuevos, sin errores de escritura.
La caché fría de sccache añade coste de subida; no se oculta esa regresión.
La segunda VM recompila los crates locales por timestamps del checkout,
por lo que no se promete el 0,17 s observado en la restauración local del Mac.

La repetición 42775335100, HEAD 533be7369, confirma cuatro jobs efectivos,
pero cambia el resultado con sccache previamente caliente: sin caché 88,18 s;
primer target con sccache 27,21 s; segundo 23,38 s; target restaurado en otra
VM 49,31 s, antes de sumar descarga. Sccache acumula 208 hits Rust/30 misses,
aunque registra seis errores de escritura en la segunda pasada (ambos builds
PASS). No se trata esta repetición como caché fría ni se ocultan sus errores.

Por ello se retira la caché adicional de target del camino normal: su ventaja
no se sostiene frente a sccache caliente y duplica almacenamiento bajo el límite
de 10 GB. Se conserva el experimento aislado, con targets pequeños de Core,
para repetirlo si cambia la carga. El flujo normal conserva sccache GHA y la
caché de registro/git; localmente sí se reutiliza siempre el target del slot.

El árbol real de Core para Windows no contiene GPUI ni DuckDB. Ya limita image
a JPEG/PNG y ureq a rustls; url/default solo añade std. Retirar esos formatos,
TLS, IDNA o network quitaría funciones usadas, no solo tiempo de compilación.
No se recortan features sin una alternativa equivalente demostrada. El spike
de Hakari descrito arriba tampoco respeta esa equivalencia.

[Wild](https://github.com/wild-linker/wild#feature-support) todavía enumera
Windows como trabajo futuro y [mold](https://github.com/rui314/mold) es un
linker Unix; no sustituyen al linker MSVC de este producto. El flag
[share-generics de Rust 1.95](https://github.com/rust-lang/rust/blob/1.95.0/compiler/rustc_session/src/options.rs)
es inestable. No se usa RUSTC_BOOTSTRAP ni se cambia el toolchain fijado.

### Ejecución real adicional de CI: 42760109740

HEAD bbfff6c30, anterior a los reparos de Sonnet. Builder 9 min 33 s,
overlays paralelos 3 min 02 s; suite 1827 PASS/22 exclusiones, telemetría
34 PASS/1 exclusión y ambos lifecycle PASS. Desde inicio del builder de
overlays (05:08:22 UTC) hasta fin de telemetría (05:22:36): **14 min 14 s**.
Sccache del builder: 698 hits/86 misses, 89,03 %, sin errores de escritura.

Esto no es una CI completa verde ni un antes/después de idéntica cobertura:
el reparo P1 exige que los cambios globales también validen Hub/Admin.
Instalación seguía compilando Hub en release al cancelarse a los 20 min 30 s
por el push del arreglo. Su coste no desaparece por medir solo el tramo Rust.
El HEAD corregido requiere otra ejecución completa, que vigila el orquestador.

Los targets de la segunda tanda del Mac se eliminaron y quedaron 28 GiB
libres. Las carpetas de medición Windows se conservan por instrucción de Isaac.
Logs, scripts y JSON: evidence/isa-1993, incluidos linker-comparison.json,
mac/followup y ci-bbfff-times.json. No se copian caches de compilación a evidencia.

### Overlays macOS nativos

La primera prueba no compiló: faltaba Metal Toolchain. Se instaló el componente
de Xcode 27B47 (descarga 838,9 MB), sin modificar GPUI ni native/ui, y se repitió
con un target vacío. Rust 1.95, cuatro jobs, sin sccache: `vantare-overlays`
limpio **42,44 s**. Tras `cargo clean -p vantare-ui`, mismo binario y
dependencias calientes: **3,99 s**. Ambos builds PASS; no se abre la aplicación
ni se afirma paridad funcional con Windows. La prueba Windows de 241,22 s
construía todos los binarios por defecto; no es un antes/después equivalente
al único binario macOS. El target propio se eliminó y el checkout quedó limpio.

### Cierre real de #2003 y siguiente prueba de C++

#2003 a2ea8cab3, ejecución 42773878313: todos los jobs y agregado PASS.
Inicio de policy 07:14:19 UTC → cierre agregado 07:58:20: **44 min 01 s**;
baseline #1997: **57 min 59 s** desde primer job hasta cierre, de los cuales
57 min 24 s eran su job bloqueante. Desde run_started_at hasta updated_at de
GitHub, incluyendo arranque/cierre: **58 min 10 s → 44 min 04 s**. No se
alcanza todavía <15 min.
Instalación 18 min 50 s, builder archivado 12 min 03 s, suite 7 min 42 s;
distribución QA determina el final con 43 min 08 s. El orquestador fusionó
#2003 como 479cca4bf; este worker no hace merge.

Timings vivos Release con cuatro jobs y sccache: control QA 229,38 s;
candidato limpio 2005,79 s; candidato con registro TEST rechazado 239,43 s.
El mayor nodo del limpio es **libduckdb-sys, build-script C++: 1186,67 s**;
Hub 209,42 s, UI 135,98 s, GPUI 91,75 s. Son nodos que pueden solaparse:
no se suman sus duraciones como tiempo de reloj. El timeout de 90 min tiene
ahora una ejecución completa de 43 min 08 s como referencia y margen para
caché fría. El timeout anterior era un deadlock; no se confunden ambas causas.

La estadística de distribución solo tenía peticiones Rust. cc 1.5.1 no aplica
su fallback RUSTC_WRAPPER cuando ya ha detectado MSVC automáticamente. Se
prepara el entorno oficial de Visual Studio y CC/CXX explícitos con sccache,
sin cambiar compilador, flags ni CRT. Prueba C++ real en este servidor,
por compilar.ps1: primer objeto 2,28 s → segundo servido de caché 0,14 s,
SHA-256 idéntico; un daemon y puerto propios, sin parar el de otros workers.
Esta fixture no equivale todavía a medir DuckDB: se exige CI Release real
antes de atribuirle ahorro al candidato completo. Las mediciones Windows
se conservan para Isaac.

Sccache 0.19 real en Windows, ejecución 42778628365, versión comprobada:
Core sin caché 119,48 s; 0.18 primer/segundo target 30,41/28,47 s;
0.19 primer/segundo 140,84/70,33 s. Builds PASS, pero no gana en esta prueba:
se conserva 0.18 en el flujo normal. La primera tentativa 42777765416 estaba
sombreada por PATH y seguía ejecutando 0.18; queda excluida de la comparación.
El script corregido usa la ruta exacta y rechaza una versión equivocada.
[0.19](https://github.com/mozilla/sccache/releases/tag/v0.19.0) no incluye
el arreglo de reintentos GHA, integrado después en
[#2911](https://github.com/mozilla/sccache/pull/2911); no se atribuyen a 0.19
mejoras de red no probadas aquí.

La repetición de 42778628365 (attempt 2), ya con ambos backends calientes,
da Core 0.18 35,95/31,32 s y 0.19 25,75/25,14 s; hits Rust acumulados
206/207, misses 32/31. 0.19 gana esta muestra, pero tiene 31 errores de
escritura frente a cero en 0.18. La primera comparación no tenía el mismo
calentamiento: 0.19 partía de 119 misses y 0.18 de 104 hits/15 misses.
No se atribuye una regresión intrínseca a 0.19 ni se cambia la versión normal
con esa incertidumbre de almacenamiento. Los datos de ambas pasadas se conservan.

M5 adicional, mismo checkout 1828a61dc y cuatro jobs: Storage --lib Release
nativo limpio, DuckDB bundled, **186,94 s**; preparar tests 1,54 s y ejecutar
15/15 PASS en 2,78 s. Total de bibliotecas probado en el Mac: 649 PASS y
cuatro ignorados existentes. Limpiando solo libduckdb-sys, con las demás
dependencias calientes y sccache 0.19 local: **129,69 s → 22,83 s**;
277 hits C++ de 280 peticiones nuevas y tres hits Rust en la segunda pasada,
sin errores de escritura. Los 15 tests vuelven a pasar tras restaurar objetos.
Es compilación macOS/Apple Clang; no es un ratio equivalente al MSVC de Windows.
Los dos targets privados nuevos se eliminaron y el checkout quedó limpio.

La fixture C++ de CI usa un daemon y caché de disco privados. Una caída o
limitación de GHA no debe volver inestable este test de soporte del compilador.
Los contadores GHA del candidato Release completo se conservan por separado.

La primera CI de C++ (42781142655, da5a0db0f) falla: sccache 0.18 interpreta
mal el modo MSVC `-Tp` separado que cc-rs usa para fuentes .cc; cl intenta
abrir `/WX-` como fichero. No se presenta su duración parcial como CI verde.
La regresión local ahora usa .cc y exactamente `-Tp <fuente>`: 0.18 falla
con el mismo C1083; 0.19 pasa, restaura el mismo objeto y baja de 2,63 s a
0,15 s en esa fixture. Release necesita por ello el binario precompilado 0.19,
con daemon y namespace GHA propios `vanta137-release019-v1`. El resto de jobs
conserva 0.18; no se mezclan sus entradas. El namespace sigue siendo fijo,
independiente del Cargo.lock. El toolchain Rust permanece en 1.95.

## Cierre VANTA-137: alcance de las cifras y coste restante

#1997, #2007, #2003 y #2010 están integrados en nightly por el orquestador.
Este cierre parte de 2bde51160. `measure-rust-cache.yml` queda solo manual
(`workflow_dispatch`), sin referencia a una rama temporal ni ejecución automática.
El comportamiento de la app y los bytes que se distribuyen no cambian.

### CI: frío, caliente y el minuto restante

Medición completa real de #2010, HEAD 262defc01, en VMs nuevas windows-latest:
44 min 27 s en frío y 16 min 04 s en caliente, frente a 58 min 10 s del baseline
#1997. Es `run_started_at → updated_at`, no la duración del agregador.
Todos los jobs aplicables pasan; suite 2530 PASS/26 exclusiones existentes,
telemetría 34 PASS y ambos lifecycle. El objetivo estricto de quince minutos
queda a 64 segundos; no se presenta un límite físico absoluto del hardware.

En frío domina el candidato Release limpio: **2016,23 s**, de los que su nodo
C++ `libduckdb-sys` ocupa **1134,83 s**. Son duraciones solapadas, no sumables.
Los otros dos controles Release tardan 227,32 y 224,30 s. El job de distribución
termina en 43 min 16 s y determina el cierre frío. En caliente, el candidato
baja a **260,43 s** y el nodo C++ a **113,94 s**: 280 hits C++ MSVC, 48 C y
772 Rust, cero errores de escritura. Los tres controles se mantienen.

El camino crítico caliente ya es archivo de tests → suite: builder **8m17s**
y suite **6m39s**; desde iniciar el builder hasta acabar la suite son 14m58s.
El workflow completo añade arranque, policy y cierre. Dentro del job de suite,
checkout 24 s, restauración de fuentes Cargo 49 s, Nextest 8 s, descarga del
archivo 13 s y ejecución 4m57s (2530 tests: 284,249 s). Los tramos se tomaron de
los pasos del intento 2, sin sumar jobs que ya corren en paralelo.

**DuckDB precompilado ya está aplicado fuera de distribución**: setup instala
el oficial 1.5.5 con SHA-256 verificado; gates usa esa biblioteca y desactiva
solo el default bundled de storage, conservando los demás defaults. La matriz
de instalación usa los fixtures/binarios de desarrollo. No queda una recompilación
C++ bundled barata que quitar de esos jobs. El candidato público exige bundled
y CRT estático: sustituirlo por la DLL de desarrollo cambiaría lo distribuido y
el control de cobertura. No se hace.

Opciones para otro encargo, sin aplicar ajustes no medidos en este cierre:

- Solapar instalación de herramientas con restauración de caché puede recortar
  parte del minuto restante. Requiere comprobar errores/cancelación del proceso
  propio y medir el workflow entero; no se promete ahorrar los 64 s.
- Un artefacto estático DuckDB preconstruido podría evitar el coste frío, pero
  requiere productor mantenido, versión/flags/CRT/arquitectura y hash verificables,
  adaptación del builder y sus controles. No equivale a activar DUCKDB_LIB_DIR:
  el builder lo rechaza para proteger distribución. No es un cambio barato.
- La caché puede expulsarse bajo el presupuesto compartido de 10 GB. Nightly
  debe sembrar las mismas claves y namespaces; frío y caliente siguen siendo
  casos distintos, sin prometer 16m04s para cualquier ejecución.

No se suben jobs ni se cambian perfiles de Release sin medir, ni se recorta
cobertura para cruzar el umbral de quince minutos.

### Lo que nota un worker en este servidor

Nueva comparación controlada sobre el mismo código 2bde51160: Strategy,
50 tests, función usada `projection::presence` con una inserción temporal de
`black_box(())`, restaurada byte a byte. Ambos ajustes se preparan primero.
Antes reconstruido: dos jobs y line-tables-only propios; después: cuatro jobs
y debug=0. Incremental local activo, sccache desactivado en ambos casos,
mismo slot-0; los cronómetros no incluyen adquisición de la cola. No es una
medición del antiguo workspace completo ni una mediana con servidor en reposo.

| Trabajo local | Antes | Después |
|---|---:|---:|
| Strategy: Clippy (incluye check) después de editar función | 3,28 s | 4,21 s |
| Strategy: Nextest, compilar y ejecutar sus 50 tests | 32,16 s | 31,15 s |
| Ambos gates de ese crate | 35,44 s | 35,36 s |
| Runtime: solo compilar tests tras editar función (tanda anterior) | 14,78 s | 8,91 s |
| Runtime: build de Core tras editar función (tanda anterior) | 3,94 s | 5,90 s |
| Núcleo + overlays: build limpio de ocho default-members | Sin baseline limpio equivalente | 267,74 s, sin sccache |
| Target equivalente Core + tests preparados | 1,60 GiB | 1,36 GiB |
| Carpetas de build del worker | 7–10 GB por rama, dato inicial | slot-0/1 fijos reutilizados |

El flujo completo del crate pequeño queda por debajo de un minuto, pero esta
muestra **no acredita acelerar Clippy ni el conjunto check/test**: el total
queda igual y Clippy empeora. El ahorro al seleccionar crates y evitar Hub/Admin
localmente no se cuantifica como si se hubiese cronometrado el flujo antiguo.

Disco observado: slot-0 **3,46 GiB** al terminar esta comparación, con dependencias
retenidas de otros usos y ambos perfiles del experimento. El build limpio de los
ocho crates por defecto ocupó **2,76 GiB**, sin tests; Core + tests, **1,36 GiB**.
Son alcances distintos. No se vende 7–10 GB → 1,36 GiB como ahorro equivalente:
el primero incluía el Hub. La diferencia estructural es que cambiar de rama
reutiliza el slot, no añade otra carpeta de 7–10 GB. Dos slots, limpieza local
por 20 GiB/14 días y caché sccache compartida configurada a 30 GiB; esos límites
no son consumo medido ni garantía instantánea durante un build.

Fuente reproducible y resultados: `worker-used-function-compare.ps1/.json/.log`,
`closeout-slot-size.json`, `core-before.json`, `core-after.json`, `core-disk.json`
y `clean-default-members.json` en `D:/VantareServer/evidence/isa-1993`.
El primer sondeo con función sin lectores se conserva como exploratorio en
worker-crate-compare; la tabla usa la función realmente utilizada. Todos los
comandos pasaron por compilar.ps1, máximo dos compilaciones; los targets Windows
se dejan para Isaac. No queda ningún cambio Rust de las mediciones.
