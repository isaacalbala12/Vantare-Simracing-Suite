# #1840 / VANTA-127 — shell nativo y Cleanup permanente, paso 5

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
PR draft: PENDIENTE_PR_05.
