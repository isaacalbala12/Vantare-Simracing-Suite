# ISA-1840 · Paso 6, lanzador y sesión

Base medida: `aae9c2cec` de `origin/nightly` (rebase sin conflictos).
Rama: `vantareapp/isa-1840-paso6-lanzador-sesion`. QA exclusivamente bajo
`D:/VantareServer/qa/isa-1840`, con HKCU y carpetas inyectadas. No se
ejecutó Setup, Uninstall, beta.ps1 ni candidate.ps1 en una instalación real.

## Producción

`python native/scripts/installer-lines.py --base aae9c2cec --projection`
da 11 756 líneas en su perímetro fijo. La producción Rust de los módulos
afectados fuera de ese perímetro suma 702; total 12 458. El exceso de 148
sobre 12 310 queda dentro del margen autorizado de 150. El tope compensado
del paso 7 es 10 082; objetivo final, 10 110.

## Tests y herramientas

El perímetro fijo reduce los tests Rust en 198 líneas y el tooling/tests
PowerShell en 1 521. Fuera del perímetro, los tests Rust suman 67 líneas
(incluye `interaction_tests.rs`) y los ejemplos/tests QA Rust restan 201.
Saldo: tests Rust −131 y tooling/tests QA −1 722. Los fixtures no cambian.

La matriz conserva Run, Check, Apply y Confirm, los mismos invariantes de
seguridad y 45 rechazos por motivo. Se quitaron las pruebas que solo
ejercitaban el PowerShell retirado. Los casos de renovación de `Vantare.exe`,
feed, descarga parcial, reinicio y rollback tienen tests Rust.

## Apertura del Hub

Hub release compilado con `compilar.ps1` en target propio y ejecutado con
fixtures en QA. Cinco aperturas desde inicio de proceso hasta ventana visible:
2 402,4 / 343,7 / 331,4 / 329,9 / 342,7 ms. Mediana 342,7 ms; se retiró el
indicador. Evidencia local:
`D:/VantareServer/qa/isa-1840/p6-logs/hub-open-80a11162af4e43c4823c0a28640fd5f3/results.json`.

## Verificación

- `check --all-targets` y Clippy `-D warnings` de Installer, Hub, Runtime,
  IPC y Services: PASS.
- Nextest CI de esos cinco crates: 1 668 tests; 1 665 PASS y tres que exigen
  `TEMP` bajo QA fallaron con el entorno incompleto. Sus tres ejecuciones
  individuales con `TEMP`/`TMP` inyectados pasaron. Otros cinco casos de
  fixtures antiguas o binario storage faltante pasaron tras ajustar la
  fixture y construir el binario storage oficial.
- Matriz completa con los binarios QA finales: **88 filas PASS**, incluidos
  los 45 rechazos por motivo; además, 9 checks de lanzador y 38 de límites
  de escritura PASS. Evidencia:
  `D:/VantareServer/qa/isa-1840/p6-matrix-final-20261103-04/results.json`.
  `boot-update` rechaza el arranque pendiente con código 1 en el motor Rust;
  el PowerShell anterior devolvía 0 sin actualizar. Los datos permanecen
  intactos y el baseline registra la diferencia explícita.

Gate de publicación: Isaac debe pasar el Setup distribuido sobre raíces reales
975 y 988 en VM o cuenta aislada antes de publicar motor 2 sin LegacyRunner.

## Revisión de seguridad de #1908

La CI de Windows ejecutaba `Confirm-BetaBoot` tras su retirada. El histórico
conserva sus comprobaciones de lectura y rollback; la llamada huérfana se
retiró y el gate aislado volvió a pasar (14 inventarios y 142 checks históricos).
Las otras llamadas al PowerShell retirado están en scripts manuales huérfanos
reservados para la limpieza del paso 7.

El lanzador descarta un pending obsoleto y continúa si Apply falla; tras
spawn, readiness o confirmación fallidos recoge al hijo y hace rollback o
ofrece Reparar. `Vantare.exe` en uso se renombra a `.old` antes de renovarlo,
y los backups propios se retiran en el arranque siguiente. El rollback
restaura el lanzador, conserva la versión rechazada en `update-status.json`,
y Stage la excluye. Un ZIP alterado se borra antes de descargarlo otra vez.
La lectura del arranque admite enlaces del usuario dentro de `data/`; la copia
de actualización los rechaza. La confirmación del Hub dispone de 60 s.

La matriz lifecycle usa `session.rs` y `restart.rs` para sus tres escenarios
que dependían de `Run-BetaHub`; el gate `cargo test --workspace --test lifecycle`
pasó con 5 + 25 escenarios. Hay regresiones para renovación del ejecutable
en uso, rollback del lanzador, versión rechazada, rechazo de oferta y
descarga, enlace en datos, solicitud de reinicio y plazo del Hub.
El build autónomo del lanzador QA activa la feature `network` de Services,
necesaria para verificar el feed firmado sin depender de la unificación de
features que sucede en el workspace.
El Hub reconoce `rejectedVersion` en el estado firmado por el instalador y
conserva el rechazo de campos desconocidos; su test cubre ambos casos.
La matriz repetida tras estos arreglos pasó 88 filas, incluidos los 45 rechazos,
9 checks del lanzador y 38 de límites de escritura. Evidencia:
`D:/VantareServer/qa/isa-1840/p6-matrix-security-20261103-01`.

Medición tras seguridad: perímetro fijo 11 790 líneas de producción y 818
fuera (se excluye una línea de test que el script externo clasifica como
producción); **12 608 total**, exactamente +150 sobre el cierre anterior.
El paso 7 absorbe esas 150 líneas: tope compensado **9 932**; objetivo final
≤ 10 110. Tests Rust +94 frente a la base del PR; tests/tooling QA −1 737;
se informan por separado de producción.

## Segunda revisión de seguridad de #1908

`Vantare.exe` se copia a un temporal sincronizado y se intenta sustituir con
`ReplaceFileW` y backup. La ruta compatible con el ejecutable en uso conserva
`.old` y comprueba el hash tras colocar el nuevo. En el arranque se recupera
`.old` si falta el lanzador o su hash no coincide con la generación activa;
solo después de validar el lanzador se limpian `.old` y `launcher-*.tmp`
propios. Un test simula el corte entre renombrar y colocar.

Tras confirmar el estado de rollback se quita `boot-pending.json` antes de
renovar el lanzador. Si esa renovación falla, queda un aviso y el siguiente
arranque no repite el rollback; hay un test con fallo inyectado. El plazo de
readiness del lanzador es 60 s como el Hub. Un timeout con el hijo aún vivo
permite reofrecer la versión; solo un fallo determinista conserva
`rejectedVersion`. El lanzador aborta si no puede retirar `hub-ready` antes de
spawn. La tercera revisión sustituyó la comparación de PIDs por un token nuevo
en cada arranque, porque el Hub es nieto del lanzador.

Producción proyectada: 11 884 líneas del perímetro fijo y 849 fuera
(corrección de una línea de test clasificada como producción por el script
externo): **12 733 total**, +125 sobre la revisión anterior. El paso 7 absorbe
125 líneas y queda con tope **9 807**; objetivo final ≤ 10 110. Tests Rust
+194 líneas netas; tooling/tests QA −1 737, separados de producción.

Verificación final de esta revisión: tres tests de lanzador/rollback, tres de
readiness y limpieza, Installer integration 29 PASS (uno ignorado), lifecycle
`cargo test --workspace --test lifecycle` PASS, fmt y Clippy de los cinco
crates con `-D warnings` PASS. Matriz repetida con binarios QA recompilados:
**88 filas PASS**, incluidos 45 rechazos, 9 checks de lanzador y 38 de escritura.
Evidencia `D:/VantareServer/qa/isa-1840/p6-matrix-safety2-20261103-01`.

## Tercera revisión de seguridad de #1908

El lanzador crea un token aleatorio distinto para cada arranque y lo pasa a la
sesión Rust, que lo entrega al Hub. El Hub publica ese token en `hub-ready` al
abrir la ventana; el lanzador solo confirma la generación si coincide. La
matriz ejercita los tres procesos con `boot-pending` y un token incorrecto que
debe provocar rollback. Antes de iniciar, el lanzador retira un marker de
`boot-pending` que quedó después de un rollback ya confirmado en `state.json`,
incluso cuando el manifiesto de la generación fallida está dañado. Una vez
restaurado el estado, un fallo al publicar `update-status.json` es un aviso.
Si `recover_launcher` deja `Vantare.exe` válido, limpia el aviso de Reparar.

La prueba aislada de la cadena pasó **11 checks**: la nueva versión 990 se
confirma con el token propagado por tres procesos y el token distinto fuerza
rollback a 989. La matriz completa pasó **88 filas**, incluidos los 45
rechazos por motivo, además de 11 checks de lanzador y 38 de escritura.
Un test del `Service::spawn` de la sesión comprueba que entrega el token al
proceso Hub, además de la cadena QA con los tres procesos vivos.
Evidencia: `D:/VantareServer/qa/isa-1840/p6-token-chain-20261103-04` y
`D:/VantareServer/qa/isa-1840/p6-matrix-token-20261103-01`.

Producción proyectada: 11 944 líneas del perímetro fijo y 876 fuera
(corregida la línea de test que el script externo clasifica como producción):
**12 820 total**, +87 sobre la segunda revisión. El tope compensado del paso
7 pasa a **9 720**; el objetivo final permanece ≤ 10 110. Tests Rust +296
líneas netas y tooling/tests QA −1 688 frente a nightly `5f440c094`, medidos
por separado. `cargo test -p vantare-installer --test installation_write`:
31 PASS y 1 fixture ignorado; incluye el marker obsoleto y el fallo real de
publicación de estado después del commit.
El test de `Service::spawn` pasó en el binario Runtime. Fmt y Clippy de los
cinco crates afectados con `-D warnings` PASS; lifecycle del workspace PASS.
La batería completa de Installer pasó con `TEMP` y `TMP` inyectados bajo la
raíz QA para su test de acceso directo de Windows.
