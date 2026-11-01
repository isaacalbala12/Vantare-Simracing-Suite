# Paso 1c · evidencia (1-nov-2026)

VANTA-127 / #1840. Base final nightly 5bf636ef0; sin merge/release. El orquestador
confirmó el paso 0 integrado en 216f9bda7 y su caracterización CI PASS.

El Hub publica readiness antes de crear Register. El hijo tiene 30 segundos y
se cancela/recoge al vencer o cerrar; fallar o no poder crearlo produce aviso,
sin cerrar la app. El aviso espera al ACK para que un bootstrap anterior no lo
sobrescriba. Se conservan versión y notas y un estado ready de actualización
posterior. Un fallo de escritura del aviso se registra y tampoco aborta el Hub.
El fallo de actualizar DisplayVersion durante Confirm se trata como aviso. El ACK
se publica antes de ese mantenimiento, para que tampoco lo retrase una escritura
de registro lenta. Si falta WINDIR, el Hub confirma igualmente y avisa.

- `boot-1c-04`: 21/21, tres casos entre procesos, con módulo Rust real y Confirm
  PowerShell de producto, datos de activa/anterior idénticos y estado sin rollback.
  Register es un comando controlado de test; sin Hub/Setup físicos ni producto
  registrado. TEMP/TMP/LOCALAPPDATA, registro y carpetas inyectados en QA.
- Nextest de Hub todos los targets: 596/596 PASS, cuatro omisiones previas,
  235,536 s. Incluye arquitectura, arranque y cierre; 29 focales pasaron antes.
  La primera ejecución ampliada se detuvo por faltar vantare-storage.exe en el
  target nuevo. Se compiló con DuckDB oficial ya cacheado y se repitió completa.
  No cambia storage/runtime ni se distribuye esa biblioteca de desarrollo.
- Clippy Hub todos los targets -D warnings PASS. Build del ejemplo por la cola,
  target propio D:/VantareServer/targets/isa-1840, jobs 2.

Primeros intentos del arnés corrigieron: reemplazo de manifest existente usando
la escritura atómica, diferencia de prefijo canónico Windows del ejecutable y
colisión de enlaces entre casos. Se conservaron como fallidos; la ejecución final
separa registro y carpetas por caso. No se cambió un gate para admitir el fallo.

Evidencia D:/VantareServer/qa/isa-1840. No acredita VM/cuenta de pruebas ni ventana
física. No cambia runtime/domain/ipc/testdata: telemetría no aplicable al diff.
CI y estados de Plane corresponden al orquestador; Plane intacto.

Repetición sobre nightly cd9282ccc tras la integración de licencias: Clippy
all-targets -D warnings y Hub completo **596/596**, cuatro omisiones previas,
214,273 s PASS. Tras integrar 1a en f8ccb1689 y añadir el caso WINDIR ausente,
compilación del ejemplo y **29/29** focales de instalación/arquitectura PASS.
La matriz final sobre f8ccb1689 incorpora también las 54 regresiones de inventario
integradas de 1a. Versión/notas y actualizaciones ya preparadas se conservan.

`matrix-1c-final-01`: **88/88 +54 inventario +29 registro/arranque PASS**. Cuatro
casos entre procesos: error, plazo real de30s, registro fallido durante Confirm
y WINDIR ausente. El ACK se observa antes del mantenimiento en Confirm. Producto,
driver, hook y resultados se compararon byte/objeto a objeto con el worktree y
baseline final, sin diferencias. Único delta de snapshots respecto a 1a: SHA de
beta.ps1 raíz en 52 filas por la confirmación modificada. Sin cambios de datos,
estado de generaciones, enlaces ni registro en las filas originales.

Rebase final a 5bf636ef0 sin cambios en los bytes probados de producto/driver/
hooks de matriz. Clippy final all-targets -D warnings y fmt PASS en esa base.
