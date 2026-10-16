# R5 F6 · valores cerrados y huellas derivadas · #1594

Alcance: solo F6 de `C:/tmp/ola2/review-1602-sol-r5.md`. F7 pendiente de decisión de Isaac.

La fixture exacta reproduce la fuga anterior:

```json
{"level":"ERROR","error_code":"sk-proj-FixtureOpaqueCredential","module":"192.168.12.7","error_type":"aa:bb:cc:dd:ee:ff"}
```

Ahora conserva ERROR y sustituye los otros tres valores por `otro`. También prueba
la clave sintética, IP, MAC, UUID y nombre en error_code/error_type/module/version,
y errores SQL válidos con type o fingerprint privados por separado. Todo es sintético.

`structured-catalog.json` es la fuente común Python/Rust. Incluye los 21 tipos
reales del enum services y ServicesCommandFailure producido por triage; módulos
de los 13 crates nativos y seis niveles. Test de procedencia compara catálogo
con enum/crates actuales. Otros errores y módulos son `otro`, no una cadena libre.

Versiones: subconjunto estricto de SemVer de tres números 0..999999 sin ceros
iniciales, etiqueta prerelease cerrada (nightly/testers/alpha/beta/rc), sufijos
numéricos y build numérico; máximo 64 caracteres. Se rechaza texto arbitrario en
prerelease/build. Contadores enteros 0..1.000.000.000; bool/float/negativo/fuera de
rango → otro. Ausencia de un campo no crea un dato nuevo.

Fingerprint: SHA256 de `vantare.triage.error.v1:` + JSON de la proyección cerrada
con claves ordenadas, sin espacios. Message/first_line/fingerprint del origen no
participan. `error-f6-cases.json` contiene hashes esperados independientes; los
dos lenguajes los comprueban. La propuesta solo puede referirse a hashes derivados
presentes en el extracto; ni texto privado ni un hash suministrado son referencias.

Las propuestas nuevas se marcan desde el worker con evidence_contract cerrado,
después de validar. No se copia ninguna afirmación del informe/modelo. Replay de
spools anteriores elimina referencias de error, incluso de aspecto hexadecimal,
sin modelo nuevo y manteniendo ACK independientes. Versiones pasan por la misma
validación al entregar a T3 y directamente en Intake.

Pruebas de salidas: seis recorridos extract → modelo mock → propuesta y cuerpo
HTTP T3 mock → POST Intake mock, con eco de valores que recibió el modelo, más
replay y referencias forjadas. Sockets prohibidos. No se ejecuta el proveedor ni
se envían informes reales. Se mantienen corpus/regresiones r1–r4; fixtures de
versiones cambian 1.0 a 1.0.0 y refs simuladas usan huellas derivadas, sin quitar
ninguna aserción de privacidad, recuperación o autoridad.

RED conservado: Python cuatro tests iniciales, 25 fallos de subcasos; Rust falla
exactamente en F6-exact sobre la implementación anterior. GREEN y gates finales:
consultar el cierre R5 del único handoff Testing Center y el FIN del buzón 1594.
Logs y comandos: E:/tmp/isa1594-r5-evidence/. Timeout 3600 s, cola versionada,
CARGO_BUILD_JOBS=2 y target exclusivo E:/tmp/isa1594-native-gates. El wrapper de
DuckDB se compara con gates.ps1: solo cambian cwd y target; defaults restantes
se conservan.

Límites: tipos desconocidos y errores del mismo tipo pueden perder precisión;
spools anteriores pierden refs de error. Versiones antiguas incompletas quedan
como otro y no acreditan trazabilidad. F7 y sus escapes/texto libre no se corrigen
ni se certifican seguros. Sin cambios SQL/runtime/domain/ipc/testdata, dependencias,
diseño, despliegue, activación, merge, promoción o release. Sin prueba física,
proveedor, servidor, SQL/pgTAP o telemetría nueva por ámbito.

Primera suite completa: 53 tests, un fallo de fixture antigua que esperaba 1.0 en Intake. Corregida a SemVer 1.0.0 manteniendo la aserción de versión exacta. Suite final 54/54 PASS con sockets bloqueados; no se oculta el fallo inicial. Los intentos documentales previos detectaron encoding histórico mixto del handoff; se añadió la sección R5 preservando bytes anteriores.
