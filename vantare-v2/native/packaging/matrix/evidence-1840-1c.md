> Revisión final sobre e747d4a9e (1b integrado), PASS. La sección inicial conserva
> resultados del diseño anterior al documento separado; los gates vigentes están
> en «Revisión posterior a 1b» y al final de este documento.

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

## Revisión posterior a 1b

Decisión del orquestador: registration-status.json solo lo escribe el Hub para
el resultado de Register. Ajustes muestra el aviso aparte. No hay lectura,
modificación ni escritura de update-status.json por este camino. Confirm emite
ACK antes de DisplayVersion; su mantenimiento fallido avisa en el log y continúa,
sin escribir un segundo estado de registro desde el supervisor.

El riesgo aceptado queda en README de packaging: hub-ready significa ventana
creada y proceso vivo; un fallo posterior mientras Register está pendiente no
provoca rollback. El bootstrap congelado 0.0.975 conserva Sync-BetaRegistration
sin try/catch: limitación preexistente, no corregida en este paso.

Se añade Run-BetaHub/Start-BetaHub/Stage reales, con feed TEST y runtime/Hub
inertes, guardas y registro/shell/TEMP inyectados: fallo rápido de Register y
fallo liberado cuando el primer Stage ya ha escrito ready. Se comparan bytes del
actualizador, aviso separado, datos, estado y procesos. Después de comprobar el
primer Stage se permite cerrar la app y el supervisor termina su flujo normal.
El PID del hijo bloqueado se comprueba ausente tras timeout y Drop.

matrix-1c-rebase-01 pasó 88+22+24+14+12+54+29 antes de esta revisión. La copia es
anterior al cambio de documento y se conserva con esa procedencia. Las primeras
órdenes de gates omitieron cargo y luego manifest-path; las dos esperas propias
incorrectas se cancelaron antes de compilar. Se relanzó con manifest explícito,
por la misma cola y target; nunca se saltó el límite ni se paró trabajo ajeno.

Gates finales de revisión PASS:
- matrix-1c-review-01: 88/88 +22 biblioteca +24 contexto +14 seguridad histórica
  +12 snapshots +54 inventario +42 arranque/registro. Cuatro scripts del gate
  iguales byte a byte a producto/driver/main; los 88 resultados iguales al baseline.
- boot-1c-review-01: los 42 checks repetidos con el helper final que exige también
  TEMP/TMP/LOCALAPPDATA QA antes de escribir. Candidate/beta/helper coinciden en bytes.
  El hook del recorrido completo solo carecía de esa comprobación previa adicional;
  ambos ejecutaron exactamente el mismo producto y los seis casos de arranque.
- Hub all-targets Nextest ci: 599/599, cuatro omisiones previas, cuatro lentos,
  216,000 s. Incluye lector de Ajustes, timeout/Drop y recogida real del PID.
- Clippy Hub all-targets -D warnings, fmt, build del ejemplo, parseo PS, YAML,
  fragmento, calidad/468 huellas, diff y límite ajeno del handoff PASS.
- Clippy intermedio rechazó unwrap en helper de PID (no anotado como test);
  se sustituyó por expect con contexto, sin omitir tests ni cambiar lints.

Único delta de las 88 filas respecto a nightly: SHA beta raíz en 52 filas.
Beta SHA256: 336ef053cf73dab70103fe51ab3118e259b4c36bd04adeaef120956748e24c4d.
Candidate conserva los bytes exactos de 1b. Sin nueva dependencia ni cambio propio
de runtime/domain/ipc/testdata; telemetría y lifecycle de runtime omitidos por ámbito.
QA física en otra cuenta/VM pendiente. Sin Setup/Uninstall EXE, instalación real,
CI watch, merge, release, Downloads ni cambio Plane por este worker.
