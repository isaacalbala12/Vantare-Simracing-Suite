# #1840 / VANTA-127 — shell nativo y Cleanup permanente, paso 5

## Seguimiento 5a tras integrar #1875

### Revisión de #1883

Fuente aade963fbf5717c88716256672bd26e829ee08fb. Fmt/check y Clippy de Installer
normal/TEST -D warnings PASS; Nextest 62/62 y TEST 59/59 PASS, con 1 helper omitido
preexistente en cada variante. Los dos tests nuevos pasan también aislados:
una escritura interrumpida conserva InstallLocation antes de DisplayName y admite
reintentar; el .lnk conserva una variable en GetPath(4) y GetPath(0) la expande.
Hub solo cambia comentarios; sus gates no se repiten tras la campaña inicial.

- InstallLocation es el primer valor de la proyección. El test corta la segunda
  escritura real bajo HKCU inyectado y verifica propiedad, ausencia de metadatos
  y reintento completo. Una clave ajena sin ubicación continúa protegida.
- replace_temporary es el único dueño de retirar el temporal si falla replace;
  el llamador conserva solo la limpieza ante fallo de write_new.
- Los diez tests de Cleanup PS se ejecutan con o sin WriteEngine, antes de que
  un rechazo del baseline pueda abortar las filas. Ejecución directa sin motor:
  10/10 PASS en p5a-review-script-only-01.log.
- El código documenta las lecturas posteriores del marcador ACK y los errores
  de apertura/consulta que no se convierten en advertencias de registro.
- Cleanup ×8 con WriteEngine y Record PASS. Comparación posterior de las ocho
  capturas contra el baseline actualizado: 8/8 PASS. Solo cambia exit 1→0 en
  retained-no-marker-cleanup; el SHA ea1be050950c38c661cd24fe36a3121fd91199e93a4835b87302fd970308b160
  y el único archivo de datos quedan iguales. Diff exacto de 1 byte; otras 87 filas
  intactas. Baseline bc65408c7; auditoría en baseline-audit.json.
  Auxiliares 25/24/14/18/54/42/48/39/10 PASS; campaña 575,27 s, Startup 260,80 s
  de 480 s, exit 0, medido por handle. Las 48 aserciones/deadlines de 30 s siguen iguales.
  Normalizador intacto. El primer corte de 32 filas no ejecutó Cleanup y por
  eso no detectó que su baseline aún reflejaba el resultado anterior.

Logs de revisión: QA/isa-1840/p5a-review-logs; matriz nueva
QA/isa-1840/matrix-p5a-review-cleanup-01, Cleanup en las ocho raíces, con
WriteEngine y Record. El baseline versionado solo recibe la fila autorizada;
las ocho capturas se contrastan después con él, conservando las otras 87 filas.

Medición final de revisión: `python native/scripts/installer-lines.py --base ba8ea61af --head HEAD --projection`.

| Perímetro | Antes | Después | Saldo |
| --- | ---: | ---: | ---: |
| Rust de producción | 11734 | 11888 | +154 |
| PowerShell de producto | 2304 | 2305 | +1 |
| Producción ampliada | 14038 | 14193 | +155 |
| Tests Rust | 3131 | 3431 | +300 |
| PS tests/tooling | 6158 | 6280 | +122 |
| Documentación | 11273 | 11447 | +174 |

### Primera entrega (anterior a la revisión)

Base nightly `ba8ea61afa48bfc4e276823ab8f5ce39ff9aa14f`, CI 5/5 comunicada por
el orquestador. Los resultados siguientes del paso 5 son históricos; el 5a va
en rama/worktree propios isa-1840-paso5a-arreglos / isa-1840-paso5a.

- Cleanup vuelve a comprobar state.json y marcador/hash dentro del lock tras
  esperar al padre. Los diez tests directos incluyen rechazos de operación,
  contenido temporal, schema, hash, marcador ausente y renovación; dos casos
  tienen un hijo propio vivo, retenido por evento, con handle del EXE abierto.
  Una renovación durante esa espera debe impedir el borrado; ningún PID ajeno
  se mata. Los casos normales retiran el temporal completo.
- remove_projection usa las opciones capturadas; una clave sin InstallLocation
  es ajena. El bootstrap se escribe con temporal y replace, conservando el
  anterior si Windows bloquea el destino. GetPath usa flags 0; un MTA ajeno se reutiliza
  y nunca se desinicializa. El test verifica el apartamento después del Drop.
- La retirada heredada sin marcador conserva el EXE y registra el residuo sin
  fallar. Un estado renovado sigue siendo error, incluso sin marcador.
- El ACK de arranque conserva un handle de atributos del marcador desde antes
  de publicar hub-ready. Un AccessDenied solo equivale a borrado si el kernel
  confirma DeletePending en ese handle; los demás errores se propagan.
  [Contrato FILE_STANDARD_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_standard_info).
  Se libera la referencia al confirmar la solicitud de borrado: no hay un
  bucle que ignore permisos ni se amplían los plazos de 10/30 s existentes.
- En este Windows, DeleteFileW permite desaparición inmediata del nombre. La
  regresión fuerza la disposición clásica con SetFileInformationByHandle,
  mantiene un lector propio abierto y exige el error 5 real y DeletePending.
  La inyección negativa comprueba error 5 sin borrado y error 32 aun con borrado.
  No se reemplaza la condición por un sleep ni por «cualquier error es ausencia».
- QA: 32 filas Install/Update/Repair/Uninstall sobre las 8 raíces; Cleanup se
  verifica por sus invariantes nuevas en tests directos/nativos y frontera,
  porque «sin marcador ya desinstalado» cambia legítimamente exit 1→0.
  En ese corte se conservó el baseline y se omitió Cleanup. La revisión de arriba
  corrige exclusivamente su fila autorizada; Probe y normalizador no cambian.
  Registro/arranque, Startup y frontera se ejecutan por el arnés existente.

Rust probado en a07d2a8fe992bfa941f7d638c1fafc58768b49a0: fmt/check y Clippy
all-targets -D warnings (Installer/Hub y variante TEST) PASS; Nextest 668/668
con 5 omitidos y TEST 57/57 con 1 omitido preexistente. La regresión de opciones
capturadas también pasa de forma aislada. Auxiliares nuevos construidos.
Matriz en a2b169b1cc7578dcf4fb7841cc8d3a002992f803: PASS, 32 filas y auxiliares.
Guardas 7+5, biblioteca 25, contexto 24, historia 14, snapshots 18, inventario 54,
registro/arranque 42, Startup 48, frontera 39 y Cleanup 10. Campaña: 746,16 s;
Startup: 217,35 s (handle propio; startup-duration-01.json), exit0, presupuesto
exterior 480 s sin cambiar sus 48 aserciones ni plazos internos. Probe y sus
45 rechazos no se repiten: el lector no cambia. Integridad retirada 468/468 PASS.
Desde la fuente
Rust probada solo cambian dos comentarios sobre el buffer BOOLEAN del test;
el resto de ese commit incorpora Cleanup al arnés y documenta su cobertura.
Target propio D:/VantareServer/targets/isa-1840-p5a; logs en QA/isa-1840/p5a-logs.

Medición reproducible: `python native/scripts/installer-lines.py --base ba8ea61af --head eb975199c --projection`.
Líneas físicas; elementos Rust exclusivos de tests separados de producción.

| Perímetro | Antes | Después | Saldo |
| --- | ---: | ---: | ---: |
| Rust de producción | 11734 | 11873 | +139 |
| PowerShell de producto | 2304 | 2305 | +1 |
| Producción ampliada total | 14038 | 14178 | +140 |
| Tests Rust | 3131 | 3321 | +190 |
| PowerShell tests/tooling | 6158 | 6279 | +121 |
| Documentación | 11273 | 11380 | +107 |

Fixtures, tooling Rust/Python, C# y CI no cambian. El techo 12800 se aplica al
paso 5b posterior, incluyendo estos arreglos en su base.

Intentos anteriores conservados: tres fallos Clippy,
ausencia inicial del auxiliar storage en el target nuevo, la diferencia de
DeleteFileW/POSIX frente a disposición clásica y una fixture sin .vantare-native.
Esta última se corrige con el marcador real, sin retirar su guarda. No se ocultan
estos intentos como resultados PASS.
El intento 7 abortó en Windows PowerShell 5 al tratar stderr normal de Cargo como
error; el intento 8 ejecuta el arnés con pwsh. Ese aborto no fue un fallo del compilador.
Sin pruebas en instalación/registro reales, VM o paquete distribuido firmado.

**Decisión posterior:** el orquestador acepta la opción3 como excepción permanente.
El ensayo fallido se conserva abajo como evidencia manual; no es el gate del paso5.
Cleanup PowerShell se reduce a espera/exclusión, raíz/marker/hash y borrado propio.
FinalizeInstall/FinalizeUninstall pasan a Rust con resincronización desde estado;
Feed/Register/SetStartup no se adelantan. La medición inicial +785 Rust/-67 PS
está aceptada expresamente; la final y la proyección6–8 se registran en la entrega.

Base nightly def6fbb0954df46340545d189830676b493c734b, con #1866 integrado.
Rama vantareapp/isa-1840-paso5-shell-sync. Ensayo autorizado por el orquestador
antes de implementar shell::sync; no cambia código de producto ni dependencias.

## Ensayo previo: vía no acreditada; implementación detenida entonces

Windows10.0.22631 (Windows11), volumen D: NTFS, archivo con atributo Archive,
sin ReadOnly. Helper QA compilado con el compilador .NET Framework existente;
invoca directamente CreateFileW y SetFileInformationByHandle, sin PowerShell
para la operación de borrado. No se ha compilado todavía un helper Rust nativo.

- Identidad incorrecta, SHA distinto y raíz distinta: rechazados antes de la
  API; cada copia conserva sus bytes y su carpeta.
- Caso normal, identidad/SHA/raíz propios válidos: abre el handle con DELETE y
  lectura, valida SHA mediante ese handle y llama FileDispositionInfoEx(21),
  flags DELETE|POSIX_SEMANTICS(3). Devuelve Win32 ERROR_ACCESS_DENIED(5).
  No se ha recogido NTSTATUS: no se afirma haber observado STATUS_CANNOT_DELETE.
- El nombre del EXE y la carpeta permanecen. Error explícito, salida1 y ruta
  del residuo registrada. Se detiene la campaña antes de ensayar más variantes,
  según la condición del orquestador. No se sustituye el fallo por otro método.

SHA de las copias: c821936b4e3027558193e9a10b53dc5a5872c01272620cf33e6c199702761d48.
Logs: D:/VantareServer/qa/isa-1840/p5-image-01.log,
p5-image-01/results.json y p5-image-environment.json. Raíz guardada:
D:/VantareServer/qa/isa-1840/p5-image-01. Conservados compiler y las cuatro
copias identity/hash/root/normal para inspección; ningún proceso queda vivo.
Consulta Get-Volume por D: no encontró MSFT_Volume; DriveInfo(D:).DriveFormat
confirmó NTFS. No hubo montaje, formato, escritura de registro o rutas reales.

## Condiciones adicionales y límites

- (a) IGNORE_READONLY_ATTRIBUTE(16) **no evaluado**: el caso normal ya falla sin
  ReadOnly; se detiene antes de probar flags19. No se concluye que el flag arregle
  la imagen mapeada ni que sea necesario para una imagen propia normal.
- (b) No se dispone de un volumen QA no NTFS ni de otro Windows que carezca de
  la API. No se simula su resultado como prueba física. La API fallida actual
  produce error/código/ruta de residuo explícitos; las otras plataformas quedan
  sin acreditar. El motor vigente conserva su exigencia de volumen local NTFS.
- (c) La comprobación de carpeta vacía y Directory.Delete está en el helper,
  después de desaparecer el nombre y cerrar el handle. **No alcanzada** porque
  la API falla; no se afirma que se haya borrado la carpeta con la imagen viva.
- El helper C# no sustituye una prueba con el EXE Rust de distribución. El
  resultado basta para parar esta vía experimental, sin deducir compatibilidad
  general del comportamiento de todas las imágenes PE o versiones de Windows.

## Reproducción manual aislada

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native/packaging/matrix/cleanup-image-tests.ps1 -Root D:/VantareServer/qa/isa-1840/p5-image-NUEVO
```

Exige raíz nueva bajo el guard del servidor. Compila únicamente el fixture
cleanup-image-probe.cs bajo QA y ejecuta copias propias por handle de proceso,
con límite30s. No invoca Setup/Uninstall de producto ni toca registro/carpetas
del usuario. Es un diagnóstico manual **que falla de forma explícita** en este
entorno; no se conecta como gate verde ni se altera la matriz/baseline vigente.
Si se elige otra vía, esta evidencia sigue conservada como ensayo descartado.

## Alternativas presentadas antes de la decisión permanente

Alternativas presentadas antes de escribir código de producto:

1. Conservar Uninstall.exe y un marcador ligado por hash junto a los datos
   conservados; Setup posterior los retira tras verificar propiedad y ausencia
   de proceso. No necesita trabajador ni deja EXE temporal, pero cambia el
   resultado observable de la desinstalación: queda ese residuo explícito.
2. Ejecutar una copia del mismo Uninstall en TEMP exclusivo, esperar al padre
   por handle y retirar el EXE raíz. Queda una copia completa del ejecutable en
   TEMP, con identidad/hash y política explícita de retirada posterior. No se
   promete que Windows la retire automáticamente; exige nuevo ciclo de vida.
3. Mantener excepcionalmente Cleanup PowerShell mientras se acuerda otra
   política. Conserva el resultado actual y cierra solo dos llamadas en este
   corte; incumple el objetivo de retirar las tres ahora y necesita autorización.

Ninguna alternativa aplicada. No se propone cmd, ADS, servicio, inyección,
desmapear la imagen, privilegios nuevos ni borrado al reiniciar con HKLM.
Producción sin cambios: no se anuncia una reducción de líneas del paso5.
Rust fmt/Clippy/Nextest y matriz completa no ejecutados: solo ensayo autorizado
de QA, fallido antes de implementar producto. Cola libre para VANTA-128.

## Paso5 posterior: implementación autorizada y proyección de simplificación

Las frases anteriores describen el ensayo detenido, anterior a la decisión
permanente. Después se implementa shell::sync nativo para Setup/Uninstall.
Cleanup es el único hijo PowerShell de ese recorrido; no tiene estado, registro,
accesos o datos. Los otros consumidores PS siguen pendientes en pasos6–7.
No se trasladan sus funciones a un puente ni se clasifican artificialmente
como pruebas para reducir producción.

Punto de partida del rework: nightly6fbbfaa6ad96d187877043786fc999a369d268b3,
padre de 216f9bda7 / #1842 (paso0). Mismo perímetro de installer-lines.py:
Rust producción7110 + PowerShell producto2082 = **9192 líneas**.
Líneas físicas con vacías/comentarios; Rust de tests separado por el clasificador
existente. El script añade el nombre del Cleanup a la misma categoría de producto
y cuenta C# del ensayo aparte. No modifica el criterio para los ficheros antiguos.
Son cortes reales de nightly; no se atribuye cada cambio concurrente al rework.

Para la **proyección6–8** se amplía ese perímetro de forma explícita y simétrica:
installation.rs y settings/windows.rs del Hub, y beta.rs/beta_indicator.rs de
runtime/src/bin/vantare. Son los hospedajes heredados que esos pasos retiran;
no sería honesto contar sus retiradas sin incluirlos antes. Producción conjunta:
918 líneas antes del paso0 y969 en la base de p5. Por tanto, el punto de partida
ampliado es **10110** (9192+918). Reproducción con el mismo clasificador:
`python native/scripts/installer-lines.py --base 6fbbfaa6a --head <SHA> --projection`.
El conteo acotado de p5 sigue disponible sin esa opción y no cambia sus cifras.

La tabla siguiente es una **estimación**, no una autorización para adelantar código
ni una cifra de ahorro logrado. Es deliberadamente conservadora: no presume que
una función PowerShell ocupe las mismas líneas al pasar a Rust/Win32.

| Paso | Qué se retira o migra entonces | Rust producción estimado | PowerShell producto estimado |
| --- | --- | ---: | ---: |
| 6 | Feed/Apply/confirmación/rollback y arranque pasan a lanzador/sesión; Register y SetStartup usan shell::sync; salen beta/indicador y partes de los hospedajes anteriores, y el bootstrap de Abrir | Nuevo450–900 (lanzador/sesión e integración) menos500–800 de hospedajes y20–80 del perímetro acotado: -430 a+380 | Retirar700–1100 de las2252 legacy actuales |
| 7 | Shell PS heredado ya sin consumidores, driver, compatibilidad NSIS/Wails/_?=, lectores/reglas e inventarios duplicados; Build pasa a tooling. LegacyRunner solo conserva scripts históricos condicionados por referencias motor1 | Retirar80–180 y añadir0–100 de adaptación final: -180 a+20 | Retirar el resto de2252 menos lo retirado en6; no sumar dos veces. Cleanup permanente52 se conserva |
| 8 | Retención solo de binarios no referenciados; datos siempre conservados. Los inventarios legacy de producto nuevo ya salen en7; no se vuelve a contar ese ahorro | Nuevo80–160 menos0–30: +50 a+160 | 0 |

Saldo estimado6–8: Rust **ampliado** del cierre de p5 **-560 a+560**, más el
Cleanup permanente (52 líneas medidas en este corte). El saldo final
contra10110 se calcula con la medición final de p5 en la entrega. Los450–900
incluyen código nuevo de sesión aunque se ubique fuera de los ficheros actuales;
cuando existan esos ficheros se incorporarán al perímetro de ambos lados, con
cero en el lado donde aún no existen. No se presumen retirables las969 líneas
de los cuatro hospedajes: conservan presentación de ventana, identidad,
preferencias y confirmación que aún necesitan código; se estima retirar500–800.
Los80–180 de compatibilidad del paso7 excluyen estos hospedajes para no duplicarlos.
Supone retirada de los
scripts del producto nuevo; las copias históricas LegacyRunner que aún deban
distribuirse o conservarse se contabilizarán aparte, empeorando ese saldo. Es,
por tanto, una estimación optimista para el ahorro global, no una garantía de
retirada completa de la compatibilidad instalada.
Con la implementación actual **no se proyecta una reducción clara al terminar8**;
el orquestador debe replantear la simplificación antes de iniciar6.

## Medición de producción y categorías separadas

Método reproducible: `python native/scripts/installer-lines.py --base def6fbb09
--head <HEAD-entregado>`. Cuenta líneas físicas, incluidas vacías y comentarios;
el clasificador existente separa los elementos Rust exclusivos de tests. No se
ocultan los consumidores pendientes ni se reclasifica PS de producto como tooling.
El detalle por fichero se guarda en el JSON generado; sin `--head` lee el worktree.

| Categoría | Base del paso 5 | Cierre del paso 5 | Saldo |
| --- | ---: | ---: | ---: |
| Rust producción | 9785 | 10765 | +980 |
| PowerShell producto | 2366 | 2304 | -62 |
| Producción conjunta | 12151 | 13069 | +918 |
| Rust tests | 2365 | 2667 | +302 |
| PowerShell tests/tooling | 6072 | 6158 | +86 |
| C# ensayo manual | 0 | 78 | +78 |
| Documentación | 10836 | 11235 | +399 |
| Fixtures JSON | 6 | 6 | 0 |
| Rust build tooling | 79 | 79 | 0 |
| Python tooling | 100 | 113 | +13 |
| CI | 477 | 477 | 0 |

El +785 Rust/-67 PS aprobado era la medición inicial, no la entrega final:
se añadieron validaciones y pruebas de propiedad, AppID real, conservación de
campos COM, exclusión, identidad, progreso y restauración de `previous`.
No se adelanta ningún consumidor. Se elimina installer-shell.ps1 (114 líneas),
se añade Cleanup mínimo (52) y permanecen 2252 líneas de consumidores PS heredados.

En el perímetro ampliado de proyección: Rust 11734 + PS 2304 = **14038** ahora,
contra **10110** antes del paso 0. Aplicando la estimación 6–8 anterior, el cierre
esperado sería **11226–12346** líneas (Rust 11174–12294 + Cleanup 52), es decir
**+1116 a +2236** frente al inicio del rework. **No da una reducción clara**,
incluso en el extremo optimista: debe replantearse antes de iniciar el paso 6.

## Fallos conservados durante la verificación

- `matrix-p5-01`: `nsis975-cleanup` detectó que faltaba el fichero vacío
  beta-session.lock. Se recupera la creación del lock antes de comprobar la
  renovación, igual que el recorrido previo; no cambia baseline ni normalizador.
- `matrix-p5-02`: `boot-install` detectó que se perdía `state.previous` al
  restaurar una actualización rechazada por arranque pendiente. El perfil
  Uninstall lo omite deliberadamente y no sirve como captura de restauración.
  La captura pasa a documento JSON lógico completo dentro del lector común;
  no se guardan bytes de enlaces, registro, UI ni ejecutables. Test específico
  de actualización pendiente con referencia anterior no nula.
- Nextest detectó una carga COM de acceso directo en modo solo lectura:
  guardar AppUserModelID daba acceso denegado. Se carga con STGM_READWRITE;
  el test comprueba el AppID real, descripción conservada y repetición idempotente.

Cada intento fallido queda en `D:/VantareServer/qa/isa-1840/p5-logs` y su raíz
QA correspondiente. No se registra una campaña fallida como evidencia verde.

## Campaña 03 y gates anteriores a la última regresión

Fuente `8eb57d76b0945fd94dc6ac373b2962eefbde8af6`, base `def6fbb095`:
fmt/check PASS; Clippy -D warnings de núcleo write-engine y transport sin GPUI,
default all-targets y TEST all-targets PASS. Nextest default **57/57**, TEST
**54/54**, PASS; cada suite omite un helper que ejecuta y recoge el test padre.
Tiempo de ejecución Nextest31.955s/39.992s, respectivamente; con construcción,
272.266s/131.762s. Builds públicos y ejemplos QA PASS. En los dos EXE públicos
se comprueban bytes completos: Cleanup mínimo presente y guard QA ausente;
el escritor TEST contiene el guard. No se intercambia la prueba por un producto.

Toda compilación pasó por compilar.ps1 en una tanda, jobs2, target privado
D:/VantareServer/targets/isa-1840-p5, locked/offline. Esperó775s para ceder la
cola compartida y la liberó antes de ejecutar la matriz. Log p5-batch-12.log
y logs por gate en D:/VantareServer/qa/isa-1840/p5-logs.
Calidad y retirada468/468 PASS. Cargo.lock sin cambios, sin paquetes nuevos.

Campaña completa nueva `matrix-p5-03`, QA guardada: **88/88 PASS**, JSON de
resultados idéntico al baseline inmutable. Los45 pares de rechazo PS/Rust coinciden
en las8 invariantes concretas: contrato de manifiesto10; inventario, JSON, ausente,
previous ausente, referencia, contrato de estado y vínculo SHA5 cada una.
También5 raíces de lector común con canal no beta. No se compara texto de error.

Auxiliares PASS: biblioteca25, contexto24, historia14, snapshot de scripts18,
crecimiento de inventario54, registro/arranque42, Startup48 y frontera37.
Guard:7 rechazos de raíz/reparse y5 comprobaciones de bytes; centinela intacto.
Startup tarda **197.9432604s**, exit0, medido por StartTime/ExitTime del SO con
handle del proceso retenido. Conserva480s exteriores,30s por operación y48
aserciones. Campaña completa1255.2614889s, sin contar el guard previo.
No cambia baseline, normalizador, arnés principal ni pruebas de Startup.

Verificación local de resultados/copias/invariantes/binarios:
`python D:/VantareServer/qa/isa-1840/p5-proof.py 03`; guarda final-proof.json
junto a matrix-03.log bajo D:/VantareServer/qa/isa-1840/p5-logs.
Escritor QA SHA25660737bfee61c026c31ee5a1af4778e23b1e2c6598102311464ac14456be1ff97.
Lectores/escritor de p5 reconstruidos en su target propio; TestVerifier y BootProbe
se reutilizan desde el target propio de p4, con fuentes de esos ejemplos iguales
a la base. No se comparten targets con otros workers ni se copia caché de Cargo.

No se acredita Windows limpio, clic físico ni paquete distribuido firmado. No
se toca runtime/domain/ipc/testdata: no se repiten sus gates globales de lifecycle
y telemetría. Los procesos del recorrido quedan cubiertos por Installer/matriz.
No se ejecuta instalación ni registro reales; sin merge, release o Downloads.

La revisión posterior detecta que `.ok()` al capturar metadatos JSON corruptos
los convertía en ausentes y podía borrar un marcador al fallar Setup. Se corrige
sin copiar bytes: los tres documentos auxiliares corruptos/ilegibles se rechazan
antes de modificar la instalación, sin añadir límite de tamaño. Es un cambio
intencionado del caso de error para conservar el fichero original. La regresión
prueba boot-pending, update-status y retained-data corruptos, estado sin cambios
y bytes originales intactos. Los resultados anteriores no se atribuyen a esta
regresión nueva; se repiten gates y campaña completa antes de la entrega final.

## Código final y verificación posterior a la regresión

Fuente `5f85074818aee0d3243b19311c5cfc22ad21c95c`: fmt/check y cinco perfiles
Clippy -D warnings PASS (lectura sin features, núcleo write-engine, transport,
default y TEST). Nextest lectura **20/20**, Installer **58/58**, TEST **55/55**
PASS; los dos últimos omiten un helper ejecutado y recogido por el padre.
Ejecución Nextest0.124s/34.425s/46.882s; Installer/TEST con construcción
194.224s/147.945s. Builds públicos y auxiliares QA PASS, sin paquetes/lock nuevos.
La captura de restauración queda detrás de write-engine; el perfil normal de
lectura no activa GPUI. All-targets utiliza el dev-dependency GPUI de tests ya
existente; no se confunde ese banco con el grafo de producción del lector.

Una tanda por compilar.ps1 para lectura y escritura, con el mismo SHA; esperó
2646s por el slot compartido y liberó la cola al terminar. Log
p5-readonly-batch.log y logs por gate bajo QA/isa-1840/p5-logs. La prueba de
bytes de los EXE públicos se hace tras build-public, antes de construir TEST:
Cleanup mínimo presente y guard ausente. El escritor TEST contiene el guard.
Campaña04 final PASS; la03 conserva su raíz/log. Sus gates/proofs se
conservan además en attempt-12, sin atribuirlos al último código.

### Entrega final de la campaña 04

Resultado04: **88/88 PASS**, JSON idéntico al baseline;45 rechazos diferenciales por8 invariantes y5 raíces no beta. Auxiliares25/24/14/18/54/42/48/37 y guard7+5 PASS.
Startup04: **191.9965275s**, exit0,48 aserciones;480s exteriores y30s por operación intactos; tiempo total de campaña: **1060.8239226s**, guard previo aparte.
Prueba final: `python D:/VantareServer/qa/isa-1840/p5-proof.py 04`; final-proof.json y matrix-04.log en QA/isa-1840/p5-logs; escritor SHA2566e20b51b5923f22079b2071d7bc3bd290e37fca802a6b3810461d720568ffd4c.
PR draft: [#1875](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1875).
