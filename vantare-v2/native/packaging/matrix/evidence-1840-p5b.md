# #1840 / VANTA-127 — poda del paso 5b

Base inicial/mediciones por bloque: nightly `e8637bb68b8d8232921564acd44f1328c5024f13`, con #1883 integrado.
Relevo rebasado sin conflictos a `9d4982e290c3538d8bd2980c3f23c2d8b76b4183`.
Actualización de base sin conflictos a `7e92e1a9e52d57db17263234ec62efc5774794cb`
(3-nov-2026). El nuevo nightly cambió código de Hub ajeno al instalador:
base 11875 Rust + 2305 PowerShell = 14180; árbol final 10662 Rust + 2109
PowerShell = **12771/12800**. La diferencia de 14 líneas afecta a ambos
extremos. Medición `lines-final-7e92e1a9e.json` en la evidencia QA. Fuera
de producción: tests Rust +233, tests/tooling PowerShell −37, tooling QA
Rust +318, tooling Python +5, build Rust −18, fixtures +559, CI −6 y
documentación +487. Son categorías separadas del tope.
Ambas bases miden 14194 líneas de producción en el mismo perímetro.
Rama: `vantareapp/isa-1840-paso5b-poda`. No incluye el paso 6.

## Medición reproducible

`python native/scripts/installer-lines.py --base e8637bb68 --projection`
lee el árbol de trabajo; añadir `--head SHA` reproduce un commit publicado.
Cuenta líneas físicas, incluidos comentarios y blancos, y separa los elementos
Rust de tests de la producción. El perímetro ampliado es el mismo para ambos
extremos. No se cuentan carpetas de compilación ni evidencia generada.

Los bloques de la propuesta de Opus se aplicaron en el orden autorizado,
con rustfmt antes de cada medición:

| Corte | Rust de producción | PowerShell de producto | Total |
| --- | ---: | ---: | ---: |
| Base antes de 5b | 11889 | 2305 | 14194 |
| WIP antes de la poda adicional | 11059 | 2109 | 13168 |
| Bloque 5: shell y registro | 10928 | 2109 | 13037 |
| Bloque 3: host | 10845 | 2109 | 12954 |
| Bloque 1: lector | 10798 | 2109 | 12907 |
| Bloque 4: escritor | 10773 | 2109 | 12882 |
| Bloque 2: contexto | 10752 | 2109 | 12861 |
| Bloque 6: reserva Windows | 10678 | 2109 | 12787 |

El log static-02 declaró 13162; lines-stop.json y el primer corte heredado de
la poda recogen 13168. Se conservan ambas evidencias; esas seis líneas no se
atribuyen al relevo. Los JSON de cada bloque y la medición final son la fuente
reproducible de los números de esta entrega.

El corte de los cinco primeros bloques seguía 61 líneas por encima del tope;
se usó la reserva después de comprobar la compilación Linux. La cifra antes
del último rebase es **12785/12800**: Rust10676 + PS2109.
Reducción de1409, incluidas519 líneas reclasificadas; margen15.
Logs y JSON de cada corte: `D:/VantareServer/qa/isa-1840/p5b-logs/poda-*.json`.

La revisión completa encontró CI que llamaba al driver retirado. Se conserva
su fuente exacta de 196 líneas solo en `matrix/legacy/` para el catálogo histórico
bajo guard (SHA-256 b102e9226eef7bd1e12005ec362c44677aaccefad01229929390facc6030e7f3).
Es otra reclasificación de 196 líneas a tooling, no código eliminado; el producto
no lo embebe ni tiene una ruta de ejecución hacia él.

Los dos arneses CI del driver antiguo usaban carpetas Windows resueltas sin el
contexto nuevo. Se retiran esas dos invocaciones del mismo job; sus invariantes
se validan en los gates actuales, sin eliminar ni relajar las aserciones de los
tests de producto: Probe/argumentos en contract e installation_read; propiedad,
registro y rollback en shell/installation_write; Cleanup en host y cleanup-tests;
MinAnimate, fallos y exclusión en writer-boundary; Register/Startup heredados en
registration-boot y startup-tests. Las fuentes candidate/beta y las aserciones
históricas quedan intactas, disponibles desde su checkout histórico. No se
ejecutan esos arneses antiguos en este servidor ni se presenta su antiguo
perímetro como QA local aislada. El catálogo histórico sí conserva HKCU y todas
las carpetas inyectadas bajo el guard actual.

`batch.rs` pasa a tooling: sus 323 líneas anteriores dejan de ser producción;
el archivo de tooling contiene 318. Esa reclasificación se muestra por separado
y no se presenta como código eliminado. Los tests, scripts QA, documentos,
fixtures, build y CI se publican en categorías propias del mismo recuento.

## Alcance e invariantes

- Lectura estructural con `Installation::read(root)` y comprobación explícita
  de integridad con `verify(root)`. El escritor reutiliza la vista y los
  manifiestos capturados bajo sus bloqueos; no relee el estado ni recalcula
  siete veces los hashes de las generaciones. Las comprobaciones de concurrencia
  de los datos del usuario y de la imagen de Cleanup conservan su propósito.
- El inventario procede del manifiesto ligado por SHA. Desaparece el catálogo
  manual de 111 miembros. Se mantienen los límites ZIP, duplicados del directorio
  central y del índice, rutas seguras, enlaces, `.env`, tamaños y hashes.
- Una identidad de producto con contexto QA inyectado; una frontera Windows y
  una regla numérica de versión. La frontera de Cleanup conserva su validación
  independiente bajo bloqueo: no se elimina una guarda entre procesos.
- Uninstall solo retira miembros de active y previous autenticados por SHA.
  Conserva los archivos ajenos en bin y todos los datos. Las generaciones sin
  referencia quedan con diagnóstico de ruta y motivo; su política se decide en
  el paso 8, según la autorización del orquestador.
- LegacyRunner y los consumidores Feed/Register/SetStartup permanecen. Su
  retirada sigue sujeta a los pasos 6–7 y, para LegacyRunner, a la VM real con
  975/988 y a la enmienda de la ADR. El indicador requiere medir ≤1,5 s.

La matriz contrasta resultados e invariantes, no igualdad de snapshots con
PowerShell. Conserva el baseline histórico sin regrabarlo y los snapshots como
artefactos de diagnóstico. Los 45 rechazos siguen siendo nueve mutaciones sobre
cinco raíces, comprobadas por motivo tipado: esquema/JSON de estado, referencia,
enlace SHA, inventario seguro, contrato/canal del manifiesto, previous ausente y
manifiesto ausente. JSON roto ahora tiene el motivo estable `state-contract`.
Cada fila conserva bytes de datos anteriores y resultado esperado; una
instalación correcta liga estado/manifiesto y una retirada correcta elimina
estado. Los tests adicionales cubren integridad, rollback, propiedad Windows,
concurrencia y residuos. No se rebaja una aserción por diferencias de código.

## Cambios observables autorizados

1. previous igual a active es `previous-corrupt`, sin rollback accionable.
   Regresión: `previous_equal_to_active_is_corrupt_and_never_an_actionable_rollback`.
2. REG_EXPAND_SZ en InstallLocation o Run se rechaza antes de crear el log o
   modificar la instalación; no se expande ni se acepta silenciosamente.
   Regresión: `expand_string_in_root_or_run_fails_before_installation_mutation`.
   MinAnimate conserva REG_DWORD y REG_SZ.
3. El Cleanup programado escribe también su salida normal en el log.
   Regresión: `scheduled_cleanup_records_normal_stdout_in_its_log`, sincronizada
   por un evento propio después de vaciar stdout, sin espera basada en PID.

La retirada opcional de un acceso que falla conserva el acceso tal como estaba,
sin una segunda proyección que lo reescriba. El desinstalador silencioso valida
la imagen propia igual que el interactivo. Ambos cambios conservadores están
incluidos en la propuesta autorizada y en los tests de propiedad e integridad.

## Dependencia y plataforma

`windows-registry = 0.6.1`, ya fijada, sustituye al acceso manual al registro;
único cambio de lock: arista del instalador a ese paquete. Ningún paquete,
versión, origen ni checksum nuevo. La comparación de las funciones de registro
anteriores con las nuevas da 172 → 68 líneas de producción (−104). La frontera
Windows completa, antes platform + shell_windows, pasa de 461 a 316 líneas en
el corte de la reserva (−145). No se atribuye todo ese ahorro a la dependencia.

El lector sigue siendo portable. El escritor es Windows; los binarios y el
ejemplo QA tienen entradas vacías en otras plataformas. `cargo check` Linux
con todos los targets y las features `write-engine,ui,test-installer,parity-capture`
pasó antes de contar la reserva. No se usa `--all-features` sin las entradas del
payload de Setup. Los jobs Linux actuales de CI son de política/calidad Python;
no se presenta ese check local como una CI Rust Linux que no existe.

## Validación

Base final `7e92e1a9e`; código de instalador `63fad3ff3`.
Gates por `compilar.ps1`, target exclusivo
`D:/VantareServer/targets/isa-1840-p5b`, locked/offline y jobs2, sin alterar
la cola ni sus límites. La tanda de cierre cedió a otros workers; una espera
registrada fue de1032s. El slot quedó liberado antes de empezar la matriz.

- Fmt/check y Clippy `-D warnings`: lector, escritor sin GPUI, normal
  Installer/Hub y TEST PASS. Check del crate para x86_64-unknown-linux-gnu,
  all-targets con write-engine/ui/test-installer/parity-capture PASS.
- Nextest: lector17/17, Hub627/627 sobre la base final (4 omisiones preexistentes), Installer65/65
  y TEST67/67 (un helper ignorado por perfil, ejecutado por su padre) PASS.
  La tanda inicial de Hub pasó 622/622. El nuevo nightly cambió Hub, por lo que
  se repitieron su Clippy y Nextest completo: 627/627 PASS. El fallo inicial
  Installer por separadores de una fixture se conserva y se corrigió usando
  el mismo validador de rutas.
- Ejemplos lector/escritor/boot, parity tooling, Uninstall público y Setup con
  payload QA PASS. El Uninstall público no incluye el guard QA. No se ejecutan
  estos binarios contra la instalación real.
- Parser PowerShell, fragmento JSON, tests del workflow45 y calidad/retirada468
  PASS. Lock: solo installer→windows-registry; paquetes/versiones/checksums
  intactos. Candidate, beta, baseline y snapshot.py conservan sus bytes.
- Catálogo histórico con contexto inyectado:14 checks de build y156 históricos
  PASS, raíz `D:/VantareServer/qa/isa-1840/history-p5b-relevo-01`.

Logs `gates-relevo10.log (lector/Installer/TEST/builds finales), relevo5-nextest-product-01.log (Hub), gates-relevo*.log (intentos previos)` y `relevo-rust-proof.json`, `rebase2-clippy.log` y `rebase2-hub-nextest.log` (base final). Los fallos heredados de
contrato, sha2 sin dependencia, longitud del test Hub, aserciones read/verify
invertidas, fixture Cleanup con install/install y separadores de la ruta de
residuo se conservan. Sus arreglos mantienen o refuerzan las aserciones.
State mantiene la lectura informativa de una retirada antigua parcial. La
mutación de retirada exige previous presente y referencias SHA válidas
antes de borrar. Un estado antiguo sin SHA no autoriza retirar miembros; un
estado ligado reanuda la retirada aunque el manifiesto ya se haya eliminado.

La matriz01 se detuvo en retained-repair: el guard de Cleanup precedía a la
incompatibilidad de Reparar sin activa (2 frente al3 esperado). Se mueve la
comprobación existente antes de preparar Cleanup, aún bajo bloqueo; la regresión
exige mantener marcador y datos y no invocar la preparación/finalización.
Baseline y aserción de resultado conservados. Gates finales del escritor PASS.
La campaña03 falló en Startup porque `Get-Acl` no resuelve el HKCU remapeado;
la prueba pasó a abrir el handle exacto de la clave inyectada. La campaña04
detectó que restaurar una ACL sin marcarla como modificada conservaba la regla
de denegación. La regresión ahora retira explícitamente esa regla en `finally`.
Una ejecución focal de Startup pasó 48/48; los hives QA de intentos fallidos
se limpiaron por su prefijo exacto.

Matriz05 final y guard `guard-p5b-05`, siempre bajo `D:/VantareServer/qa`,
HKCU y carpetas inyectados, sin Record: **88/88 filas, 45 rechazos por motivo,
cinco raíces no beta, 52 inventario, 42 Register/arranque, 48 Startup y 39
frontera del escritor PASS**. Startup 159,99 s de 480; campaña completa
879,40 s, salida 0. También 24 biblioteca, 14 historia segura, 18 snapshots,
10 Cleanup y 7 rechazos de raíz + 4 controles de fuente PASS.
No hay prueba física del Setup distribuido ni VM975/988. Lifecycle y telemetría
globales no se repiten: runtime/domain/ipc/testdata no cambian; los procesos,
plazos, cancelación y Cleanup del instalador se validan con sus gates propios.
Sin merge, promoción, release ni instalación/registro reales.

La versión informativa de Uninstall también exige el enlace SHA al manifiesto.
Regresión CLI real sobre la misma fixture: antes mostraba0.0.988 desde un
manifiesto JSON válido cuyo hash no coincidía; después devuelve null, exit0 y
bytes de estado/manifiesto intactos (`binding-red.json`, `binding-green.json`).
La corrección reutiliza Manifest::authenticated. No añade un perfil ni modifica
la lectura informativa parcial necesaria durante los pasos6–7.

Se conserva también el intento9: Clippy detectó102 líneas en Uninstall. Se evita
el doble acceso previo a state.json usando el resultado opcional del mismo
decodificador; sin desactivar lint. Tanda10 completa PASS, tras1116s en cola.
Matriz02 se detuvo en retained-apply: Apply devuelve false (exit0 del arnés)
cuando no existe actualización pendiente, incluso sin activa. La nueva aserción
había confundido ese no-op con una activación. El arnés captura el resultado
real y exige hash del estado idéntico si no aplica; si aplica, exige el enlace
activo/manifiesto. Se mantienen resultado histórico y datos; beta.ps1 y baseline
no cambian. Tooling 3d6445a7d; campaña05 completa en raíz nueva, sin Record.
Los intentos01–04 y sus fallos se conservaron, sin cambiar baseline ni
normalizador.
