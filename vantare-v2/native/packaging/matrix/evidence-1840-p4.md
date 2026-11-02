# #1840 / VANTA-127 · paso 4, escritura Rust

Estado: implementación y gates locales completos; pendiente revisión del orquestador.
Base nightly
`399b0e9e7bf5badd02fae8dfb1a44c17f3e58151` (#1861 integrado por el
orquestador, CI5/5 verde confirmada por él). Rama
`vantareapp/isa-1840-paso4-motor-escritura`, worktree isa-1840-paso4,
target exclusivo `D:/VantareServer/targets/isa-1840-p4`.

## Alcance y frontera autorizada

Revisión previa a integrar #1866: el exit code del finalizador es la autoridad;
stdout no JSON se guarda como diagnóstico, y sus Write-Warning van a stderr.
Exit0 conserva la instalación aunque emita un aviso; exit distinto de cero
mantiene el rollback. No cambia el contrato transitorio ni adelanta shell::sync.

Setup/Uninstall usan operaciones Rust en el proceso actual: ZIP, SHA,
generaciones, commit state v1, copia de datos, reparación y retirada reanudable.
Context::probe resuelve raíz/registro/opciones en Rust. El catálogo pertenece
a members.rs; build.rs ya no interpreta texto PowerShell. El perfil Verified
reutiliza el lector y autentica binarios activos para las mutaciones; Probe y
Hub conservan sus perfiles existentes.
La comparación de propiedad conserva la equivalencia Windows de mayúsculas y
separadores, incluida Unicode, mediante la dependencia windows ya aprobada.
La regresión acepta la misma raíz y rechaza una vecina; no usa canonicalización
de enlaces ni una identidad nueva de instalación.
Retire conserva las comprobaciones estructurales de Uninstall-Beta mediante
Installation::read; operations no interpreta otra copia del estado. La versión
numérica para retained-data.json también la lee el módulo común, con el contrato
heredado (no acredita una versión instalada ni autoriza una activación).

Excepción autorizada por el orquestador el 2-nov: no adelantar shell::sync ni
portar la transacción Windows. Una llamada PowerShell por FinalizeInstall,
FinalizeUninstall y Cleanup, marcadas TODO(#1840 p5). Conserva la lógica actual
de registro, accesos propios/ajenos, Run, opciones y restauración por bytes.
Cleanup mantiene padre/plazo30s/hash/marker/instalación renovada/autolimpieza;
sin cmd, trucos de autoborrado ni contrato nuevo de vida. Diseño y ADR0103
documentan entrada <=64KiB, progreso JSON/stdout, diagnóstico/stderr y exit.
El finalizador rechaza state.json presente al desinstalar, para no ejecutar
el escritor legado por error. El driver no se usa para escribir por el núcleo.
Feed y Register heredados siguen PowerShell hasta sus pasos previstos.

DisplayVersion deja de suministrar la versión de Uninstall: usa el manifiesto
ligado por SHA si sobrevive; si ya falta o está dañado, versión ausente y retirada
todavía utilizable. No deduce otra versión del binario ni de retained-data.json.
Abrir conserva el bootstrap PowerShell vigente y su guarda de SID QA hasta
el paso 6. Esta accion de lanzamiento queda fuera del motor de escritura; no
se adelanta el lanzador nativo ni se cambia la compatibilidad de 0.0.975.

## Confianza y datos

Paquete con el mismo handle entre SHA y extracción; límites128MiB comprimido,
256MiB por miembro y512MiB total. Miembros exactos y manifest.files, hash/PE/
sidecar cerrados. Se comprueban registros centrales crudos para detectar
duplicados que un índice por nombre ocultaría y atributos Unix/Windows de enlace.
Rechazo de .env/reparse/traversal/ADS y volumen local NTFS antes de escribir.
La copia opaca verifica índice antes/después y conserva directorios vacíos y
mtime de archivos. Una imagen viva o lock bloquea la operación; no se mata app.
Cancelación solo antes de copiar. Estado y restauración de bytes del estado
usan el mismo reemplazo atómico; errores de shell restauran metadatos y retiran
solo generaciones nuevas no referenciadas. Nunca se retiran datos preexistentes.

zip6.0.0 y windows0.62.2 aprobados: solo dos aristas en la lista del instalador
del lock. Ningún paquete, versión ni checksum nuevo; sin otras dependencias.
Hub sigue con el lector sin defaults. Writer sin GPUI mediante write-engine;
transport habilita la finalización Windows. Ambos árboles normales se comprueban.

## Verificación preparada

- Tanda única por compilar.ps1: fmt/check, Clippy de núcleo sin GPUI,
  transporte y Installer/Hub all-targets -D warnings, Nextest completos,
  biblioteca de lectura sin defaults, árboles normales, ejemplos QA y helper
  storage con DuckDB oficial1.5.5; contrato TEST separado.
- Tests Rust: datos opacos/vacíos/mtime, actualización, reparación de activa
  dañada, cancelación, bloqueos/imágenes vivas, downgrade/boot pendiente,
  restauración exacta tras fallo de finalización, retirada interrumpida,
  datos retenidos ambiguos, SHA/ZIP inválidos y contexto QA cerrado.
- Un test padre ejecuta helper de subprocess antes/después del commit,
  exige exit90 y estado íntegro. El helper ignorado no es omisión de cobertura;
  solo lo invoca ese test padre. Interoperabilidad Rust→PS→Rust con data exacta,
  HKCU/carpetas inyectados y guard antes de cargar biblioteca.
- Matriz prevista: mismo baseline, sin Record ni nuevo normalizador; WriteEngine
  sustituye Probe/Install/Repair/Update/Uninstall/Cleanup por Session/operaciones
  reales. Feed/rollback/arranque restantes permanecen heredados. Se conservan
  el diferencial Probe p3 y sus45 rechazos; se añade contraste del contexto Rust.

QA solo D:/VantareServer/qa (o RUNNER_TEMP aislado en CI); jamás instalación ni
registro reales. No Setup/Uninstall interactivos, Downloads, secretos, merge,
release ni CI watch. La QA física queda para VM/cuenta separada.

## Resultados y medición

Modelo/lectura c15223a27: fmt/check, Clippy del núcleo, transporte e Installer/Hub
all-targets -D warnings PASS; Nextest652/652 PASS (606 Hub+46 Installer),5 omitidos.
Ejecución228.894 s. Contrato TEST8/8, árboles normales sin GPUI y auxiliares PASS.
Último escritor b380a10d7: fmt/check y tres Clippy PASS; Nextest47/47 Installer
PASS en22.778 s, un helper omitido que ejecuta su padre; contrato TEST8/8 PASS.
Este último corte solo limita la copia ZIP; el modelo/lector/Hub no cambian.
Regresión Deflate con tamaño subdeclarado: SHA externo válido, fallo antes de
activar y archivo parcial de como máximo dos bytes para un tamaño declarado uno.
Los ejemplos QA se reconstruyen juntos con transport; el check del lector y
los árboles normales separados prueban que el motor no depende de GPUI. Los
dev-dependencies de ejemplos/tests sí compilan el soporte GPUI ya existente.

Campaña matrix-p4-04 completa PASS:88/88 idénticos al baseline,45 rechazos
por invariantes y cinco raíces nightly del lector común;128 campos del lector
y64 del contexto de escritura iguales. Auxiliares25 biblioteca+24 contexto+
14 seguridad+18 capturas de scripts+54 inventario+42 registro/arranque+
48 Startup+20 frontera de escritura PASS. Guard7+5 PASS. Sin Record.
Startup184.2317409 s, exit0, medido por StartTime/ExitTime con handle retenido;
presupuesto exterior480 s y deadlines30 s intactos. Campaña1284.188109 s.
final-proof.json verifica resultados contra baseline, copias QA, fuentes
candidate/beta/driver/baseline/snapshot intactas y las dos aristas del lock.
Calidad/retirada468/468 y parser PS/diff PASS. Telemetría/lifecycle global no
se repiten: no cambia runtime/domain/ipc/ui/testdata; procesos propios,
checkpoints y matriz cubren la vida del instalador. QA física/paquete distribuido
pendientes en VM/cuenta separada. Sin CI watch, merge, promoción ni release.
Logs locales D:/VantareServer/qa/isa-1840/p4-logs;
arnés copiado p4-harness/packaging.
Reproducir conteo con:

```powershell
python native/scripts/installer-lines.py --base 399b0e9e7 --head <SHA>
```

Perímetro fijo sobre ambos lados: producción/tests Rust, fixtures, PS producto/
tests, docs (incluida ADR0103), build, Python y CI. Líneas físicas, comentarios y
vacías incluidos; clasificador Rust existente. No se afirma ahorro global ni
cinco lectores/reglas a uno mientras queden adaptadores heredados.

| Categoría | Antes | Después | Diferencia |
| --- | ---: | ---: | ---: |
| Rust producción | 7787 | 9785 | +1998 |
| Rust tests y ejemplos QA | 1089 | 2365 | +1276 |
| Fixtures versionadas | 6 | 6 | +0 |
| PowerShell producto | 2252 | 2366 | +114 |
| PowerShell tests/tooling | 5926 | 6072 | +146 |
| Rust build tooling | 155 | 79 | -76 |
| Python tooling | 98 | 100 | +2 |
| CI | 471 | 477 | +6 |
| Documentación | 10279 | 10718 | +439 |

El aumento es real: se conserva PS heredado y se añade el motor Rust. La retirada
global y el ahorro neto no se adelantan al paso7.

### Lectores y reglas que quedan

| Pieza | Uso tras p4 | Retirada |
| --- | --- | --- |
| Installation::read / Manifest::read | Único lector Rust de Setup/Hub y operaciones; perfiles Probe, Hub, Verified, Uninstall y Retire | Vigente |
| Context::probe / options | Descubrimiento, HKCU y opciones en Rust; versión desde manifiesto ligado por SHA | Vigente |
| Driver PS / complete_probe | Oráculo de matriz y rutas heredadas; fuera del motor de escritura de Setup/Uninstall | Producto PS, p7 |
| Read-NativeState / Read-NativeManifest | Feed, Register y compatibilidad de generaciones antiguas | Consumidores p5–6; PS p7 |
| Get-NativeLaunchTarget | Proyección de accesos de las tres llamadas transitorias | p5, shell::sync |
| Uninstall-Beta | Oráculo y desinstaladores antiguos; Setup/Uninstall actuales usan Rust | PS p7 |
| validation::{package_version,hub_version,setup_version} | Perfiles comunes conservados, con límites distintos según consumidor | Vigentes |
| Parsers PS de versión | Oráculos, feed y registro heredados; sin autoridad para escribir desde Rust | Consumidores p5–6; PS p7 |
| Parser del catálogo en build.rs | Retirado: members.rs es el catálogo Rust explícito | Cerrado en p4 |
| DisplayVersion de Uninstall | Retirado del producto actual; queda en el oráculo PS | Cerrado en p4; oráculo p7 |

No se cuentan como unificación global los lectores heredados que siguen vivos.

### Ensayos conservados

- batch-01: fmt y fmt-check PASS. Clippy del núcleo compiló y se detuvo en
  cinco avisos de estilo (if-not-else, doc-markdown, dos collapsible-if y paso
  por valor de un error Win32). Se corrigen sin bajar -D warnings. Archivo
  clippy-core-attempt-01.log conservado; no se ejecutaron los gates posteriores.
  Cola liberada mientras se corrige y documenta.

- batch-02: fmt/check y núcleo sin GPUI Clippy PASS. Transporte se detuvo por
  FromUtf16Error del SID (distinto de windows::core::Error). Se corrige la
  conversión sin suprimir lint; clippy-transport-attempt-02.log conservado.
  No llegaron a ejecutarse los tests ni la matriz.

- batch-03: núcleo PASS; nueve avisos del transporte corregidos: raw pointers
  explícitos, if colapsado, valores QA sin literales vacíos, clone_into y
  despacho separado de preparación (sin suprimir too_many_lines). Registro
  clippy-transport-attempt-03.log.
- batch-04: fmt/check, núcleo y transporte PASS. Clippy all-targets llegó a
  tests y señaló cuatro detalles de estilo; se corrigen sin bajar lint ni
  aserciones. clippy-attempt-04.log conservado; todavía no se ejecutó Nextest.

- batch-05: fmt/check y los tres Clippy PASS. Nextest18/650:16 PASS/2 FAIL,
  632 no ejecutados por fail-fast,5 omisiones (incluido helper invocado por padre).
  Los dos fallos del Hub son precondición: no se había construido storage.exe
  antes del smoke. Se corrige el orden del arnés, con DuckDB oficial1.5.5; no
  cambia producto ni se debilitan tests. nextest-attempt-05.log conservado.

- batch-06: espera de cola de 440 s, después fmt PASS y fmt-check FAIL por el
  formato de la aserción nueva de cancelación, editada mientras acababa fmt.
  Se conserva fmt-check-attempt-06.log. Fuente congelada antes de batch-07;
  este vuelve a ejecutar fmt/check y todos los Clippy, sin omitir el fallo.

- batch-07: fmt/check, tres Clippy -D warnings, storage, Nextest650/650 PASS
  (223.043 s de ejecución;774.813 s con build;5 omisiones), check/árboles sin
  GPUI y auxiliares QA PASS. Contrato TEST8/8 PASS. Logs *-attempt-07.log.
  La revisión posterior centraliza también la interpretación estructural de
  Uninstall y la versión de retención en el lector común: nuevo perfil Retire,
  sin ampliar/restringir el contrato de Uninstall-Beta. Se añade regresión de
  referencias inválidas antes de borrar/finalizar. Estos650 son evidencia
  intermedia; se repiten todos los gates sobre la fuente final.
  Un aviso dead_code del helper de retención en el build de solo lectura se
  corrige delimitándolo con write-engine; no se suprime el lint.

- boundary-smoke-01:20/20 PASS en raíz QA nueva y HKCU/carpetas inyectados,
  usando el writer de batch-07 anterior a Retire. Comprueba restauración exacta,
  reanudación, Run ajena y tres guardas de Cleanup. No sustituye la campaña final.
- batch-08: fmt/check PASS; snapshot88fc94d00. Clippy del núcleo se detiene por
  doc-markdown: Context::probe sin backticks en un comentario. Se corrige sin
  suprimir lint; clippy-core-attempt-08.log conservado. No ejecutó tests finales.

- batch-09 / c15223a27: repetición completa PASS. Incluye Retire y equivalencia
  de raíz Windows/Unicode;652 tests (606 Hub+46 Installer),5 omisiones. Los logs
  *-attempt-09 conservan esta fuente y las cuatro pruebas lentas que terminaron.
- batch-10 / b380a10d7: cambio solo del escritor ZIP tras comprobar el código
  de zip6.0.0: Deflate no limita su salida al tamaño declarado. Se corta la copia
  y se añade la regresión con ambas cabeceras subdeclaradas. Fmt/check, tres
  Clippy,47/47 Installer, check/árboles, ejemplos reconstruidos y TEST8/8 PASS.
  No se repite Hub porque no cambia su modelo/lector ni se compila package.rs
  en su dependencia sin defaults. Su gate completo sigue siendo batch-09.
- matrix-01: guard7+5 PASS; copia QA incompleta, faltaban los dos scripts
  usados por history-safety. Falla antes de comparar filas y antes de Startup.
- matrix-02: auxiliares previos PASS; primera fila detenida por readContext
  ausente en el PSObject del comparador p3. Worker53a162fa7 aporta false para
  el oráculo completo. Sin cambios de producto ni de baseline/normalizador.
- matrix-03:11 filas clean idénticas; el test de canal no beta reutilizaba una
  petición completa en lugar de pedir contexto. Helper83a173934 lo hace explícito.
  probe-smoke-01 aislado PASS: nueve pares por invariantes y lector común nightly.
  matrix-04 repite la campaña íntegra sobre raíz nueva, sin Record.

### Correcciones de revisión de #1866

Fuente Rust congelada 0bffdad11f54add889556922e63b2d388c7a8bd1:

- Finalizador inyectado con Write-Warning, progreso válido y salida no válida:
  exit0 aceptado y exit7 rechazado; diagnóstico conservado en ambos casos.
- Un prefijo QA vacío no acepta rutas. El guard se embebe solo con
  test-installer; producto rechaza contexto aislado antes de preparar archivos.
  Binarios públicos Setup/Uninstall inspeccionados tras build normal: guard
  ausente; ejemplo QA inspeccionado después: guard presente. Hashes en
  public-guard-proof.json y source-proof.json.
- Fallar replace retira los temporales propios de estado y update-status;
  se conservan los bytes de los destinos bloqueados. Catálogo actual y retirado
  pasan por la misma validación require, incluidos duplicados entre listas.
- El duplicado ZIP alcanza validate_central: segunda entrada consumida antes
  del rechazo. El finalizador de fallo sustituye UI y Uninstall.exe antes de
  fallar; la regresión exige restaurar ambos y state.json por bytes exactos.
- MinAnimate lee String y REG_DWORD, sin ampliar los tipos de raíz/registro.
  La frontera QA añade los cuatro casos String/DWord por 0/1 frente al PS real.

Una tanda por compilar.ps1, target propio: fmt/check, Clippy del núcleo,
transporte, Installer all-targets y TEST all-targets con -D warnings PASS;
Nextest Installer52/52 (42.378 s) y TEST49/49 (38.541 s) PASS, un helper omitido
por suite que ejecuta el test padre. Builds de producto y ejemplos QA PASS.
Cola liberada antes de la matriz. Hub no se repite: no cambian su integración,
perfiles ni dependencias; la validación del catálogo común se cubre en Installer.
Conserva la evidencia completa del modelo anterior.
Calidad/retirada468/468 PASS. No se relajan aserciones ni se omiten fallos:
review-attempt-01 falló por semicolon_if_nothing_returned; review-attempt-02
por items_after_test_module. Ambos logs se conservan y se repiten los gates
completos sobre la fuente congelada. Logs locales p4-review-logs y
p4-review-batch.log bajo D:/VantareServer/qa/isa-1840.

Campaña nueva matrix-p4-review-01:48/48 filas de Probe/Install/Update/Repair/
Uninstall/Cleanup idénticas al baseline;45 pares de rechazos por invariantes y
cinco raíces no beta PASS. Auxiliares25+24+14+18+54+42+48+24 y guard7+5 PASS.
Los cuatro casos MinAnimate String/DWord por 0/1 coinciden con PowerShell.
Startup256.0824531 s, exit0, medido con handle retenido; presupuesto480 s y
deadlines30 s intactos. Campaña906.4026532 s. Sin Record ni cambios de baseline,
normalizador, candidate/beta/driver o lock de la entrega revisada.
matrix-proof.json confirma filas, rechazos y copias de código ejecutado idénticas.
El verificador adicional señaló primero esta evidencia documental editada durante
la campaña; se acotó a PS/Python/JSON, sin cambiar ni repetir la matriz aprobada.
Las filas de feed heredado conservan la campaña completa88/88 anterior.
