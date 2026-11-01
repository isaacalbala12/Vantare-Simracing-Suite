# Simplificación del recorrido de licencias — #1827 / VANTA-126

Base de A: `056ec9d9487353a24b017c11eed287b57f3cf149` (pasos 0–10 integrados).
Rama `vantareapp/isa-1827-simplificar-rights`. Target aislado
`D:/VantareServer/targets/isa-1827-s`. Logs fuera del repo en
`D:/VantareServer/evidence/isa-1827-s-*`.

## Medición reproducible

Desde la raíz Git:

```powershell
python vantare-v2/native/scripts/license-production-lines.py --ref 056ec9d9487353a24b017c11eed287b57f3cf149 > antes.json
python vantare-v2/native/scripts/license-production-lines.py > despues.json
```

El JSON conserva el número por fichero y por crate, y dos totales independientes:
todos los fuentes de services/runtime/hub/ipc y un perímetro fijo del recorrido
(constante `LICENSE` del script). Cuenta líneas físicas, incluidos comentarios y
blancos, de fuentes Rust rastreados bajo `src`; excluye directorios y archivos de
tests/fixtures, módulos externos exclusivos de test y elementos `cfg(test)` o
`cfg(all(test, ...))`. Conserva variantes de plataforma y features de producción.
No cuenta ejemplos, tests de integración, documentación ni este script.
No equivale a líneas compiladas ni a las estimaciones parciales anteriores:
no se atribuye todo un crate al recorrido de licencias. Los movimientos entre
crates se comparan también por el total conjunto, para no aparentar reducción.

Resultado A (mismo script y perímetro en ambos árboles):

- Services: **11.349 → 11.161** (−188).
- Runtime: **18.392 → 18.370** (−22).
- Hub: **73.482 → 73.482**; IPC: **6.316 → 6.316**.
- Total de los cuatro crates: **109.539 → 109.329** (−210).
- Perímetro del recorrido, incluido Store y sus consumidores:
  **15.077 → 14.867** (−210). Por crate: services 6.823 → 6.635,
  runtime 1.892 → 1.870, hub 5.104 → 5.104, ipc 1.258 → 1.258.
- Ficheros productivos reducidos: `rights/mod.rs` 518 → 496;
  `license.rs` 416 → 295; `license/authority.rs` 563 → 554;
  `license/installation.rs` 83 → 25. El resto permanece igual según el JSON.

Los JSON completos, incluidos todos los ficheros, están en
`isa-1827-s-base.json` y `isa-1827-s-after-a.json` bajo el directorio externo
de evidencia. El script se comprobó con cuatro muestras: módulo test,
cfg test/plataforma, feature también productiva y campo test dentro de struct.

## Corte A — v1 como único formato

Decisión 5 de ADR 0102: se retiran JWS/v2, la clave privada de instalación,
su generación y prueba de enrollment y el vencimiento del sobre v2. La huella
v1 continúa igual. No se borra ningún archivo de una instalación anterior.
Los formatos v1 de binding/authority, las guardas, firmas y plazos de los grants
permanecen. El contrato v1 puede mantener una sesión Gratis sin fecha; caducan
los grants temporales, no un sobre adicional.

El criterio de cadencia es `signed_until_ms == None` después de verificar v1:
arranque y 24 horas desde el éxito. Founders y módulos perpetuos no heredan
ahora un `exp` artificial. Owner con lease conserva su fecha firmada.
La prueba de reconexión/helper y 24 h usa Founders v1 firmado, sin modificar
Policy a mano (P3 del paso 10).

La matriz de caracterización del núcleo y las matrices de servicios no cambian.
Se convierten fixtures JWS de runtime/Engineer a v1; el test del vencimiento
del sobre durante pausa se retira porque solo existía en v2. La frontera de
gracia v1 durante pausa sigue cubierta por `long_pause_and_resume_keep_the_original_hour_and_expire_during_pause`.
La matriz auxiliar de capacidades usa v1 y comprueba su contrato real: módulos
perpetuos y Gratis siguen después de diez segundos; grants operativos y Pro
caducan sin inventar un vencimiento del sobre. Un rechazo posterior conserva
la licencia ya verificada. Se añade rechazo explícito de JWS y JSON versión 2,
y cuarentena de binding JWS con recuperación v1 y autoridad conservada.

Mutaciones A: omitir firma, aceptar una emisión exactamente en la lápida y
añadir una fecha a una licencia perpetua fallan por aserciones. La primera
exploración de lápida alteraba solo el guard de `install_online` y sobrevivió
porque `install` repite la barrera. Se conservan ese log/resultado y la repetición
que cambia ambas barreras: la matriz detecta `TombstoneEqual`. No se cambia
ningún test para conseguir ese fallo. Cada mutación restaura todos los fuentes
Rust de services/runtime/engineer por SHA-256 antes de la siguiente.

Logs de mutaciones: `isa-1827-s-mutations-a` (firma y exploración conservada)
y `isa-1827-s-mutations-a-r2` (lápida completa y fecha perpetua).
La primera suite detectó dos expectativas de sobre v2 aún presentes en el test
auxiliar de pausa; se corrigieron a `None` después de la gracia, como exige v1.
La siguiente suite pasó **1040/1040 con telemetría**, 13 omisiones previas;
la suite final posterior a mutaciones repite **1040/1040 PASS**, 13 omisiones,
un lento de ACC, 126,962 s. Fmt y Clippy de services/runtime/engineer,
todos los targets con `-D warnings`, también PASS. Los comandos/resultados
finales quedan en `isa-1827-s-final-a-gates.json` y sus logs `isa-1827-s-final-a-*`.
Lifecycle final: runtime **13/13 PASS** y Engineer **5/5 PASS**. Código validado
`3463ac0c595d5750b3af6c83a2d57e8c68ea9ba3`; los commits posteriores solo documentan.
PR draft [#1841](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1841),
a nightly, enlazado en T3, sin integrar. CI a cargo del orquestador.
Los lints iniciales (import y detalles de tests) también se conservan en logs.
La invocación inicial de fmt desde vantare-v2 sin manifest no encontró Cargo.toml;
se corrigió con `--manifest-path native/Cargo.toml`.

Una lectura DeepSeek de la base inventarió las conversiones v2; no revisó cada
byte final ni ejecutó gates. El ejecutor contrastó el mapa, el diff y los tests.
No se consultó una instalación/backend real: retirar v2 es la decisión expresa
5 de ADR 0102 y del encargo. Los restos Installation quedan inertes, sin leerlos
ni borrarlos. No hay compatibilidad de lectura JWS después de este corte.

## Secuencia aprobada por el orquestador

A retira v2; B mueve Authority/catalog/Verifier a runtime::rights y elimina el
verificador duplicado de services; C unifica lectura y clases de Store por
documento; D limpia duplicados y contratos README; E trata un 401 de emisión
automática como NeedsSignIn sin bloquear ni revocar derechos. B debe preservar
los resultados tipados actuales de rechazo del núcleo y services no usará
claims sin ACK verificado para presentación o decisiones. Cada corte tiene
su PR y gates propios. No se modifica Plane ni se integra/publica desde el worker.


## Corte B — un solo dueño de verificación

Base `6fbbfaa6ad96d187877043786fc999a369d268b3`, integración de A (#1841)
confirmada por el orquestador. Rama `vantareapp/isa-1827-simplificar-owner`.
Authority, catálogo, verificador y sus pruebas se trasladan a runtime::rights.
Owner/host siguen limitados a Windows; los módulos puros conservan pruebas en
Unix. Base64/Ed25519 pasan de dependencias de test a producción en runtime,
con las mismas versiones ya fijadas. Tras revisión, IPC añade sha2 solo como
dependencia de test para verificar el lector congelado; el lock registra esa
arista sin añadir paquetes ni versiones. Services conserva
los tipos v1 y Store; no hay dependencia services→runtime.

La renovación HTTP deja de verificar dos veces. Services no guarda ni utiliza
claims recibidos para presentación o decisiones antes del ACK durable. La
categoría cerrada rights-credential-invalid conserva Error::Version/Transient
para firma/subject/device; lápida sigue Rejected y iat futuro Unavailable/Clock.
No cambia el sobre control v7 ni el disco. Una copia congelada del lector v7
anterior consume el error nuevo como UnknownLegacy; la matriz existente fija
su resultado Transient. Seis casos recorren HTTP→services→núcleo real y
comprueban mensajes literales anteriores, forma manual/automática, aviso y
reintento. No se sustituyen las matrices por esas pruebas.

P3 de A: comentario v2/Installation retirado de Store; tres inventarios del
diseño marcados como superados por decisión 5; bloque suelto eliminado. El test
de identidad usa ahora huella real y v1 firmado, con un core-installation-v1
corrupto que permanece intacto y no afecta a la instalación. La prueba de E/S
bloqueada de Authority se mueve a su dueño, conservando los bytes y la prueba
de recuperación tras desbloqueo. El JSON recovery-v1 se mueve sin cambiar su
contenido a runtime/testdata; Rust y Deno siguen compartiendo una sola fixture.
Deno no está instalado en este entorno: no se afirma ejecutar su prueba.

Medición, con el mismo comando anterior cambiando --ref por `6fbbfaa6a`:

| Crate | Antes | Después | Diferencia |
|---|---:|---:|---:|
| services | 11.161 | 10.376 | −785 |
| runtime | 18.370 | 19.141 | +771 |
| ipc | 6.316 | 6.322 | +6 |
| hub | 73.482 | 73.482 | 0 |
| Total | 109.329 | 109.321 | −8 |

Perímetro fijo recorrido/Store: 14.867 → 14.858 (−9); services 6.635 → 5.848,
runtime 1.870 → 2.642, ipc 1.258 → 1.264, hub 5.104 igual. Fuera del perímetro
se retira una línea cfg en lib.rs y se añaden dos separadores en diagnostics.rs
para la captura exclusiva de test: diferencia neta +1, total −8. Frente al HEAD
03d08d776 anterior a los P3: 109.319 → 109.321 (+2); el perímetro
recorrido/Store permanece en 14.858. Los JSON completos por
fichero son isa-1827-s-base-b.json e isa-1827-s-after-b-review.json (tras los P3). Los movimientos no
se presentan como reducción; B retira una ejecución duplicada por renovación.
El contador falla explícitamente si falta un fuente rastreado: exige registrar
el borrado o restaurarlo, con la ruta en el error. Un test de stdlib comprueba
que una desaparición no reduce el conteo en silencio.

La primera suite pasó 1136/1138. Dos fixtures requerían ajuste al recorrido
HTTP→núcleo: la lápida conserva LicenseFailure manual y una clave desconocida
ahora debe llegar al núcleo, que responde con la categoría nueva. Las dos
pruebas pasan después del ajuste; se conservan los logs inicial y focalizado.
La matriz de núcleo, las matrices de services y el test de arquitectura
domain/ui tienen los mismos blobs que la base.

Gates finales después de restaurar las mutaciones: fmt y Clippy de services,
runtime, ipc y Engineer (todos los targets, -D warnings) PASS. Nextest ci
services/runtime/ipc/Engineer/domain **1138/1138 con telemetría PASS**,
13 omisiones previas. Summary [ 137.308s] 1138 tests run: 1138 passed (1 slow), 13 skipped. Lifecycle runtime 13/13 y
Engineer 5/5 PASS. Calidad conserva las 466 huellas. Todas las restricciones
del esquema del fragmento ISA-1827 se comprueban con stdlib; jsonschema no está
instalado. Los comandos y códigos quedan en isa-1827-s-final-b-gates.json.

Las tres mutaciones (firma omitida, error inválido convertido en definitivo,
traducción Error::Version perdida) fallan por aserción. Se restauran 223 fuentes
Rust de services/runtime/ipc/Engineer por SHA-256. Tras Clippy, la prueba nueva
se divide en preparación y aserción manual sin relajar expectativas, y las tres
mutaciones vuelven a detectarse: logs en isa-1827-s-mutations-b y -b-r2.
Se conserva también el lint too_many_lines que motivó esa división.
C/D/E quedan pendientes de sus PRs y de la integración de B.

PR draft [#1843](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1843), enlazado en T3, a nightly y sin integrar.
Validación inicial de B: `910edc04311b845ee21b0408a307e412a10ffafd`; la revisión P3 posterior tiene sus gates arriba.
CI/revisión del orquestador. C comienza tras integrar B en nightly.


Revisión profunda de #1843 (sin P0–P2): los seis casos distinguen subject mal
formado (InvalidCredential/Version/Transient) de UUID válido de otra cuenta
(Denied/REJECTED/Definitive con binding anterior intacto). La analítica comercial
se ejecuta solo tras ACK correcto: el fallback Rejected→Read(ClockBehind) no
observa claims rechazados. La regresión captura cero observaciones en ese caso
y ambas observaciones al recibir ACK. El test del lector v7 verifica el SHA-256
de la función congelada, normalizando CRLF y solo la indentación exterior.
Servicios/núcleo se actualizan juntos; nuevo-services/viejo-núcleo no se soporta.
La comprobación del lector anterior no amplía ese soporte.
Gates finales posteriores a los P3 y a restaurar las mutaciones: fmt y Clippy
services/runtime/ipc/Engineer all-targets -D warnings PASS. Nextest ci con
telemetría: **1138/1138 PASS**, 13 omisiones previas (Summary [ 131.035s] 1138 tests run: 1138 passed (1 slow), 13 skipped).
Lifecycle runtime 13/13 y Engineer 5/5 PASS. La prueba Python del contador pasa.
Se detectan seis mutaciones Rust (las tres originales, analítica tras rechazo,
cambio de cuenta y deriva del lector congelado), más omisión de fichero en
Python. Los 223 fuentes Rust y el contador se restauran por SHA-256.
Los cuatro blobs de arquitectura/caracterización siguen intactos. Logs y
comandos: isa-1827-s-review-b-gates.json, isa-1827-s-review-b-*,
isa-1827-s-mutations-b-review y isa-1827-s-b-review-focused.log.
La primera compilación de la revisión señaló un import tras sentencias; la
siguiente, el lifetime static de un helper de test. Corregidos, sin relajar lints.
El caso de fixture sin uso se sustituye por rechazo con bytes exactos.
Commercial PostgreSQL (test 14) es un fallo ajeno, confirmado por el orquestador;
lo investiga otro worker. No se modifica ni investiga ese harness aquí.

Código de los cuatro P3 validado: `17bef84a6b6480e68115066ae65ed03935e44673`.
Los commits posteriores solo actualizan documentación.
