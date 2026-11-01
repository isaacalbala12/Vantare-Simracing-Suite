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


## Rebase de B tras #1842 y #1845

Base actual `0a241fc2e927cf925166c86c072b1d43d30044d4`. El único conflicto
estaba en el handoff: se conservan completas sus entradas de nightly y el bloque
B previo. Al terminar el rebase, los demás ficheros de B tienen los mismos blobs que
`4483a78ed2b9a28a42db6c35964db3cf37c154b1`. Después solo se añaden notas
a este documento y al handoff. Todos los ficheros añadidos o
modificados por #1842/#1845 permanecen idénticos a nightly. El ejemplo nuevo
matrix-verifier es de firma de fixtures del instalador, independiente del
verificador de licencias trasladado. El test comercial 14 ya está corregido
por #1845; no se modifica desde este PR.

Integridad y range-diff revisados; certificado externo
isa-1827-s-rebase-integrity.json. Medición repetida con --ref 0a241fc2e y árbol
actual: 109.329 → 109.321 (−8), recorrido/Store 14.867 → 14.858 (−9).
JSON por fichero: isa-1827-s-base-b-rebased.json y -after-b-rebased.json.
Fmt y Clippy all-targets -D warnings posteriores al rebase PASS
(logs isa-1827-s-rebase-fmt.log y -clippy.log); Nextest 1138/1138 con telemetría,
lifecycle 13/13 + 5/5 y siete mutaciones conservan validez sobre el mismo código
de licencias (src/tests idénticos). No se repiten por una resolución documental. CI a cargo del orquestador.


## Corte C — Store tipado y clases por documento

Base `cd9282ccca01bd2522c3e53481c25f360df85c66`, B integrado. Rama
vantareapp/isa-1827-simplificar-store. Una lectura sin efectos devuelve
Value/Missing/Damaged; E/S sigue siendo error. Class declara la política de
cada documento. required mantiene la lectura estricta; recover valida y solo
permite reconstrucción de cachés/secretos de sesión. El núcleo conserva su
reparación explícita de autoridad, con marcador durable previo al apartado.
No cambian nombres activos, contextos, ACL, DPAPI, tamaños ni structs guardados.

Se retiran load/load_cache/restore_cache/load_for_restore y
quarantine/quarantine_preserving. El único quarantine_dated no borra primero
copias anteriores, conserva originales si falla el rename y recorta a tres
(después del rename, limpieza best-effort con diagnóstico). Las copias aparte
normalizan su nombre al formato fechado existente; restores sin reloj pasan
0 como fecha desconocida, sin convertirla en pared firmada. Las guardas de
Pilot, compra y borrador/imágenes conservan su política; no se recuperan como
perfiles o informes vacíos. Gestión mantiene su política estricta de metadata.

F4 (#1822): se distingue daño de autoridad y de marcador. El segundo conserva
su presencia como barrera sin reescribir una autoridad sana ni entrar otra vez
en el bloque de diagnóstico. La prueba existente compara los bytes de ambos
documentos tras dos reinicios y sigue negando replay. El primer commit unifica
Store/F4; el segundo cambia expresamente DPAPI dañado de roadmap, perfil y
report-attempt a cuarentena + reconstrucción. La prueba reconstruye los tres,
comprueba una sola copia apartada y mantiene los bytes de la sesión válida.
El helper fixture es exclusivo de test/test-support: inspecciona valores vía
read.required y evita alterar los oráculos de las fixtures existentes.

La suite focal del primer hito pasa 18/18; la de cachés/guardas pasa 22/22.
Se detectan seis mutaciones por aserción: reescritura F4, E/S como daño, guarda
recuperada como caché, DPAPI que vuelve a bloquear cachés, rename ignorado y
cuatro copias. Los 241 fuentes Rust se restauran por SHA-256 en cada caso.
Arquitectura domain/ui y tres caracterizaciones tienen los mismos blobs que
la base (isa-1827-s-characterization-c.json). No se cambia una fila de licencia.

La primera suite completa pasó 1175/1176 con telemetría. El único fallo era una
expectativa de billing que protege su presentación CheckoutRecovery ante una
lectura bloqueada. Se conserva esa política del dueño, manteniendo E/S distinta
de daño en read: sin HTTP, sin otro UUID y sin descartar la guarda. La expectativa
original no se cambia. Se retira la prueba nueva redundante y se repite la
mutación de E/S sobre la versión final; los seis puntos mutados y sus pruebas
permanecen iguales. Logs iniciales preservados en isa-1827-s-c-initial-full-*.
Los primeros lints (imports, préstamos y tamaño de una fixture al migrarla)
también se conservan; fixture se mueve a su módulo exclusivo de pruebas.

Medición: los cuatro crates siguen teniendo el mismo perímetro del contador.
Para incluir el consumidor Gestión se añade --include-admin, sin cambiar los
valores por defecto ni el algoritmo. Comandos desde raíz Git:

```powershell
python vantare-v2/native/scripts/license-production-lines.py --ref cd9282ccca01bd2522c3e53481c25f360df85c66
python vantare-v2/native/scripts/license-production-lines.py
python vantare-v2/native/scripts/license-production-lines.py --ref cd9282ccca01bd2522c3e53481c25f360df85c66 --include-admin
python vantare-v2/native/scripts/license-production-lines.py --include-admin
```

| Crate | Antes | Después | Cambio |
|---|---:|---:|---:|
| services | 10376 | 10361 | -15 |
| runtime | 19141 | 19112 | -29 |
| hub | 73482 | 73482 | +0 |
| ipc | 6322 | 6322 | +0 |
| admin | 5846 | 5850 | +4 |
| Total cinco | 115167 | 115127 | -40 |

Cuatro crates habituales: 109321 → 109277 (−44); recorrido/Store 14858 → 14814 (−44). Con admin/session.rs: 15326 → 15286 (−40); ese fichero 468 → 472. JSON completos en isa-1827-s-base-c.json/-after-c.json y -with-admin.json.

La reducción neta es limitada; el objetivo general de adelgazamiento sigue
pendiente para D. No se atribuyen tests, documentos ni movimientos a reducción
productiva. D/E conservan su alcance. Sin cambios en instalaciones, producción,
secretos, Plane, merge ni release. CI y revisión a cargo del orquestador.
Gates finales después de restaurar fuentes: fmt PASS; Clippy services/runtime/
ipc/engineer/admin all-targets -D warnings PASS. Nextest ci de los cinco más
domain **1175/1175 con telemetría PASS**, 13 omisiones previas. Summary [ 139.553s] 1175 tests run: 1175 passed (1 slow), 13 skipped.
Lifecycle runtime 13/13 y Engineer 5/5 PASS. Calidad conserva 466 huellas;
prueba stdlib del contador PASS, --include-admin verificado contra los JSON.
Comandos/logs: isa-1827-s-final-c-gates.json y -final-c-*, -mutations-c y
-mutations-c-r2. Los 241 fuentes actuales coinciden con la restauración final.
No se ejecuta UI física ni instalación; Deno/PostgreSQL no cambian en este PR.

Rebase C sobre origin/nightly@f8ccb168931275708aeba05553f2046cd7c8bf61
tras #1846: todos los fuentes Rust y manifiestos conservan sus blobs frente
a b6c5b970f (arbol de los gates). Se preserva entero el handoff de nightly;
medicion base con --ref origin/nightly --include-admin: 115167, sin cambios.
Certificado: isa-1827-s-rebase-c-integrity.json. La suite completa y mutaciones
siguen validas para el mismo codigo de producto; se comprueba aparte windows_startup
porque usa el empaquetador actualizado por #1846.
windows_startup posterior al rebase: Nextest ci 7/7 PASS (log
isa-1827-s-c-rebased-startup.log), por compilar.ps1 y target propio.
PR draft: https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1849, target nightly; F4 implementado, pendiente de revision/integracion.

## Corte D0 — fecha real de cuarentena y soporte del informe incierto

Base origin/nightly@5bf636ef0d6bb0b121593d9a532bbcbabdd8da35, C (#1849)
integrado. Rama vantareapp/isa-1827-simplificar-d0. Se atienden solo los dos P3
de C autorizados; D1a/D1b/E siguen separados. D6/D7 y T1-T3 quedan aplazados:
RC9 0.0.988/services v15 puede publicarse y su downgrade sigue siendo plausible.
D5/protocolo y D3/gracia se descartan por riesgo.

Los restores de perfil, roadmap, report-attempt, Authority y metadata OAuth de
Gestión reciben la fecha de su dueño. Account propaga su at_millis; App usa su
clock inyectado, Owner usa la pared recibida y Gestión pasa su reloj de frontera.
Store no lee el reloj. Authority convierte i64 a u64 solo al apartar un documento
dañado, igual que binding: no añade rechazo de pared al restore sano. La fecha
solo nombra/ordena copias; no interviene en firmas, lápida, gracia o derechos.
No cambian formatos activos, cifrado, permisos ni la política de cada clase.

Se extienden los tests existentes para afirmar la fecha exacta (1700000000123)
en las tres cachés y Gestión; Owner exige 120000/110000 desde su reloj inyectado.
Cambian las expectativas authority-0 anteriores porque esa es la corrección
solicitada. Los oráculos de acceso/efectos y arquitectura conservan sus cuatro
blobs. F4/bytes en dos reinicios, E/S, rename y retención siguen protegidos.
Focales 6/6 PASS, incluida retención de tres con copias históricas. No se añaden
casos complacientes que reflejen solo la nueva firma de métodos.

Runbook: perder la respuesta tras aceptar el servidor, dañar DPAPI del intento
y editar el borrador puede rotar la clave y crear otro informe. Se documenta
conservar borrador/imágenes y comprobar recibo/listado o pedir revisión antes
de editar/reenviar; no se cambia automáticamente el flujo de informes. La nota
vive una vez en report-draft y report-submission enlaza a ella. La sección Wails
inferior del primero se identifica como histórica.

### Medición separada

Desde raíz, mismo contador que A-C:
`python vantare-v2/native/scripts/license-production-lines.py --include-admin`.
Base guardada antes de editar en isa-1827-s-base-d-with-admin.json; final en
isa-1827-s-after-d0-with-admin.json. Para repetir la base usar --ref
5bf636ef0d6bb0b121593d9a532bbcbabdd8da35. Omitir --include-admin para comparar
el perímetro habitual de cuatro crates.

| Crate | Antes | Después | Cambio |
|---|---:|---:|---:|
| services | 10361 | 10373 | +12 |
| runtime | 19112 | 19115 | +3 |
| hub | 73482 | 73482 | 0 |
| ipc | 6322 | 6322 | 0 |
| admin | 5850 | 5851 | +1 |
| Cinco crates | 115127 | 115143 | +16 |

Cuatro crates: 109277 -> 109292 (+15). Recorrido con Gestión: 15286 -> 15302
(+16). Es propagación de fecha/corrección P3, no ahorro de simplificación.
Pruebas/soporte Rust: +39 líneas físicas netas, separadas de las productivas.
Documentación .md afectada: 7831 -> 7963 (+132) líneas; pruebas/soporte afectadas: 7713 -> 7752 (+39).
La separación de Rust se obtiene del delta físico de .rs menos el delta del
contador productivo; documentación .md aparte, fragmento JSON aparte. Los
cambios de tests de llamadas/formatting no se presentan como nuevos casos.

Gates finales tras restauración de fuentes: fmt PASS, Clippy services/runtime/
ipc/engineer/admin all-targets -D warnings PASS; Nextest ci de esos cinco y
 domain 1175/1175 con telemetría PASS (13 omisiones previas). Lifecycle runtime
13/13 y Engineer 5/5 PASS. Cinco mutaciones detectan por aserción el retorno
a fecha cero en cada dueño; los 241 fuentes se restauran por SHA-256. El primer
runner terminó tras dos casos por buscar LF en report.rs CRLF; se reanudan los
tres restantes conservando ambos resultados, sin cambios de producto.
Logs/comandos: isa-1827-s-final-d0-gates.json, -final-d0-*, -mutations-d0,
-d0-focused.log, -d0-quality.log y -d0-characterization.json.

Compilación siempre por compilar.ps1 y target D:/VantareServer/targets/isa-1827-s,
jobs 2, locked/offline. Calidad 466 huellas PASS. Harness heredado medium;
sin nuevas delegaciones, UI física, instalación ni ejecución Deno/PostgreSQL
(no cambia servidor). Sin Plane, producción, datos reales, secretos, merge/release.
