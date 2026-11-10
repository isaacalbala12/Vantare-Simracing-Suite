# VANTA-137 / #1993 — compilación Rust

Mediciones iniciales sobre nightly `62dde8da4cdbec03604304d9253f016d924f4e26`, ADR 0107.
Rebase del tooling sobre nightly `db1aa706d`, con #1997 y #2007 ya fusionados.
Sin cambios de lógica ni dependencias de producto nuevas. No se modifica UI ni GPUI.
PR en orden: [#1997](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1997),
[#2003](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2003). El arreglo independiente
[#2007](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/2007), para #2006,
ya está fusionado junto con #1997. #2003 sigue como draft a nightly.

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
