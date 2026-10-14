## #1608 · Ronda 6 local · R5-P3-1 (14/10/2026)

`storage.buckets.owner uuid` y `owner_id text` reciben la barrera común:
propietarios UUID/Clerk, OLD/NEW e inmutabilidad, INSERT/UPDATE tras tombstone
rechazados; DELETE autorizado sigue permitido. Buckets globales sin propietario
conservan configuración. Inventario real con ambas columnas y trigger activo.
RED exacto INSERT de supabase_storage_admin permitido → GREEN 17 checks.
Objetos/uploads/partes heredan el propietario del bucket y rechazan padre
invisible; el borrado encola también objetos/uploads con owner propio NULL.
Bootstrap reproduce owner/owner_id reales; cinco nuevas rutas de carreras,
102 rutas/603 checks, sin debilitar el gate de cobertura FK.
Runner `--storage-buckets --storage-schema <dump local>`; RED con
`--before-storage-buckets`. Evidencia `~/evidence/1608/r6/buckets-{red-exact,inherited-green}/`.
Dump del stack real elimina solo triggers/policy de la app para cargarlos después
mediante las migraciones originales; errores de preparación conservados.
No se afirma API de buckets de usuario ni se borran buckets/datos instalados.
R5-P1-1 sigue en preparación; solo local, sin push/merge/promoción/deploy/release.

## #1608 · Ronda 6 local · R5-P2-1 (14/10/2026)

Inicio autorizado `0a8e794f`, rama/worktree indicados, review r5 completa.
`native_admin_execute` toma actor+objetivo ordenados antes del primer lock de
fila (incluido reporter en get/set report); helper Owner cubre native_admin_begin.
RED exacto wrapper→borrado `40P01` → GREEN cuatro carreras actor/objetivo,
ambos órdenes, espera advisory y `28000` para administración tras tombstone.
24 checks; llamadas/guardas productivas reales, prefijo de pg_proc sin sustituirlas.
Auditoría de callers de las 14 RPC en catálogo completo: cinco funciones;
reconciliation/lifecycle/expire ya protegidas en r5, refresh thin SQL sin filas,
admin era el wrapper omitido. Evidencia `~/evidence/1608/r6/rpc-callers.json` y
`admin-{red,green}/`; pendientes R5-P1-1 y R5-P3-1. Solo local, sin push,
subagentes, GitHub, merge/promoción/deploy/release ni servicios/datos reales.

## #1608 · Ronda 5 · Entrega local para revisión (14/10/2026)

Correcciones de los cuatro hallazgos de la review r4 y evidencia final en el
[informe](../../analysis/review-cuentas-pagos-2026-10.md). **Queda pendiente el
abort NULL-manifest por preflight Storage v1.70.3; no se declara cierre completo.**
Barrera: 77 tablas protegidas/97 rutas/577 checks; multipart ocho carreras/64
checks; locks 17; aliases40, pgTAP317, upgrades18+4+26, Edge553/1 ignored,
lint/fmt nueve TS, surface y 456 huellas PASS. SQL, PostgREST y Storage HTTP
locales reales. Disputas borrada+viva y outage SQL también PASS; interacción
con el lock temprano corregida con RED→GREEN.
Commits por hallazgo `21e3f262`, `3758ff12`, `f86fafb6`, `c9f0c727`; reintento
API/ACK perdido `d2a96ce5`. HEAD final y cierre en `~/orq/1608.buzon.md`.
Evidencia `~/evidence/1608-r5/`, errores originales conservados, sin bypass ni
dependencias nuevas. Locks siempre UUID→fila; 40001 requiere rollback/retry
completo. Metadata ajena sin identidad de cuenta y configuración Storage no
se presentan como nuevas raíces de producto cubiertas por el bootstrap.
Sin Rust ni gates nativos (sin cambios native/runtime/domain/ipc/testdata),
GUI/servicios gestionados/partes con bytes. Sin datos reales, .env/secretos,
subagentes, push, trackers/GitHub, merge, promoción, deploy o release.
Siguiente: orquestador revisa diff/SHAs y acota la corrección del servicio
Storage para abort sin upsert de permisos sobre la cuenta ya borrada.
Seguimiento remoto #1608/#1622/VANTA-16/17/15 reservado al orquestador.

## #1608 · Ronda 5 · Reintento de abort y validación real (14/10/2026)

R4-P1-1, mismo alcance: si la API aborta y se pierde ACK SQL, la siguiente
entrega admite únicamente 404 XML `NoSuchUpload`; otros 404/403/500 siguen
fallando y conservan cola. Respuesta limitada a 8 KiB, sin mensajes/PII.
RED exacto del reintento → GREEN siete Edge, y API HTTP real dos veces con
Storage v1.70.3: abort inicial elimina upload, reintento NoSuchUpload permite
ACK y deja cero pendientes. Firmante validado también por SignatureV4 de la
imagen distribuida. No se afirma subida de partes/bytes ni S3 gestionado.
Reconciliador con error SQL 42501 real sigue abortando la página; restores de
ACL del fixture local verificados. Upgrades identidad18/conflicto4/refunds26
PASS. Evidencia `~/evidence/1608-r5/storage-http-{probe,retry}.log`,
`abort-retry-{red,green}.log`, `reconcile-outage.log` y `upgrade-*`.
Sigue abierto el abort NULL-manifest por preflight Storage; no hay bypass.

## #1608 · Ronda 5 local · R4-P2-2 (14/10/2026)

14 RPC de Billing/operacional adquieren todos sus UUID ordenados antes de
filas; incluye propietario previo y solicitado, batches y barrido de expiración.
La recolección checkout queda acotada a su cuenta; el barrido omite tombstones.
PostgreSQL puede tomar la fila antes de un BEFORE ROW: la barrera de DML usa
try-lock y aborta con 40001; nunca espera el UUID mientras conserva esa fila.
El contrato del caller es siempre UUID→fila, conjunto completo en orden UUID;
40001 exige rollback y reintento de toda la transacción. INSERT aplica la misma
regla porque puede seguir a escrituras previas de varios UUID. Sin bypass.
RED 40P01 exacto (prefijo operacional real) → GREEN writer-first/delete-first,
DML fila primero rechazado con 40001 y dos UUID en orden inverso, sin efectos
parciales y con reintento completo. 97 rutas/577 checks de escrituras PASS,
317 pgTAP y 40 aliases PASS. Evidencia `~/evidence/1608-r5/locks-*-final`,
`sql-full-3`, `writers-green-2`, `multipart-green-2`.
API Storage HTTP real: creación multipart y abort con owner UUID PASS usando
solo claves sintéticas locales. Abort owner NULL con manifest NO PASA:
canUpload hace upsert antes de abort y la barrera lo rechaza tras tombstone;
upload+cola permanecen (1+1), sin ACK. Se requiere revisión del servicio Storage
para permitir abort sin preflight de INSERT, sin abrir un bypass SQL. Este
límite impide afirmar limpieza multipart completa o cierre comercial total.
El orquestador revisa el diff y mantiene #1608/#1622/VANTA-16/17/15. Sin estado
remoto nuevo, push, merge, promoción, deploy, release ni producción.

## #1608 · Ronda 5 local · R4-P1-2 (14/10/2026)

Inbox verifica tombstone bajo UUID antes de escribir, relee enlaces y devuelve
receipt tipado `account_deleted` sin fila ni payload. El reconciliador aísla
ese resultado; cualquier error real o vínculo contradictorio sigue abortando.
Diagnóstico durable privado solo entorno+hash, idempotente, sin UUID/PII.
Disputas usan la misma clasificación por orden durable y entorno.
RED exacto 28000 con PostgreSQL/PostgREST/Supabase JS reales → GREEN cuenta
borrada seguida de viva, dos páginas y repetición: orden viva única, avance a
subscriptions, sin nuevo payload borrado; conflicto borrada/viva sigue fallando.
140 tests Edge billing/reconciliación PASS con tipos. Intentos sin permiso de
lectura y estrechamiento de receipt conservados, sin --no-check.
Evidencia `~/evidence/1608-r5/reconcile-{red,green-2}.log`; fixture local,
no Polar gestionado. Queda revisar locks y límite abort manifest Storage.
Seguimiento remoto exclusivamente por el orquestador.

## #1608 · Ronda 5 local · R4-P1-1 (14/10/2026)

Multipart/partes del esquema Storage real reciben la barrera propia, incluida
atribución por manifest y upload padre. RED reproducido → GREEN ocho escenarios
con dos transacciones, rol Storage real, SQLSTATE y commit verificados.
Uploads anteriores al tombstone se encolan para abort S3; ACK solo después de
éxito de API, sin SQL DELETE de Storage ni secretos nuevos. Cleanup Edge aborta
antes de borrar objetos; fallos mantienen cola y reentrega Svix.
El firmante S3 usa las credenciales existentes anon/service y WebCrypto;
STORAGE_S3_TENANT_ID es el tenant para local/custom domain y STORAGE_S3_REGION
la región (us-east-1 por defecto). Configuración y deploy reales fuera de alcance.
Límite bajo investigación: Storage v1.70.3 comprueba canUpload con un upsert
antes del abort, que puede ser rechazado para manifest tombstonado. No se
introduce un bypass de escritura para que una limpieza aparente pasar.
Evidencia `~/evidence/1608-r5/multipart-{red-2,green}`, seis Edge PASS.
Sigue reconciliación y locks; seguimiento reservado al orquestador.

## #1608 · Ronda 5 local · R4-P2-1 (14/10/2026)

Inicio autorizado `e66c6c90`, rama/worktree de #1608, sin trackers/GitHub/push.
Review r4 completa: dos P1 y dos P2; ningún P3 adicional confirmado.
R4-P2-1: migración aditiva resuelve `owner_id text` por UUID o identidad
Clerk durable sin casts arbitrarios, conserva owner histórico y manifest.
Subject ambiguo entre UUID se rechaza incluso con claims: Storage no conserva
issuer en la fila y no sería seguro atribuirla después. Cleanup encola sujetos
textuales solo cuando son inequívocos; no bloquea por owners ajenos desconocidos.
RED exacto 22P02 → GREEN INSERT/UPDATE/DELETE, borrado, cola y DELETE de
limpieza con el esquema Storage v1.70.3 y rol supabase_storage_admin.
Evidencia `~/evidence/1608-r5/owner-{red,green-3}`; primer intento PL/pgSQL
fallido conservado. Runner exige dump del stack local real, no el bootstrap UUID.
Pendientes en esta ronda: multipart, reconciliador y orden UUID→fila.
Seguimiento #1608/#1622/VANTA-16/17/15 exclusivamente por el orquestador;
no se afirma estado remoto nuevo, CI, merge, canal promovido ni producción.

## #1608 · Cierre comercial ronda 4 local · Mac arm64 (14/10/2026)

Review `~/orq/review-1622-sol-r3.md` entera, R3-P1-1: reset concurrente
reinserta dispositivo. Encargo recibido de Claude/Isaac, sin subagentes ni
GitHub/push. Inicio limpio `3ce0eadc`, misma rama
`vantareapp/isa-1608-cierre-comercial`, worktree
`/Users/isaacalbala/vw-isa-1608-cierre-comercial`, base local `e5c90be5`.

Migración nueva `20261014140000_isa_1608_account_write_barrier.sql`:
helper único lock UUID→tombstone y trigger en **74 tablas**, incluidas rutas
FK indirectas/composites, aliases, PII, devices, grants, Storage/manifest,
Testing, admin e inbox vinculado. OLD/NEW, propietarios ordenados y releídos,
identidad durable, snapshots antiguos rechazados. Cleanup bajo UUID y marca
final en misma transacción; sin bypass. Grants/entitlements/operacional solo
revocados; los otros writers tardíos se rechazan. Reset adquiere UUID antes
de fila, claim antes de conflicto; resolvers nativos/bootstrap releen.
No se reescriben migraciones históricas ni se activa infraestructura.

Inventario completo de **87 tablas / 50 migraciones y entradas Edge**, con
protegida sí/no y test, en [informe](../../analysis/review-cuentas-pagos-2026-10.md).
94 rutas con dos transacciones reales y control válido observado por tabla:
**RED189 → GREEN559**; 74 tablas con cobertura real, catálogo/FK y ACL verificados.
Regresión anterior aliases **40/40 PASS**; Edge con tipos **551 PASS/1 ignored**;
retirada456 PASS. Evidencia `~/evidence/1608-r4/checked-{red,green}/`,
`aliases-green/`, `deno-functions.log`, manifest final y logs de intentos.
Runner `--writers` sin pgTAP; integrado también al final del gate normal.

Límites nuevos expresos: pgTAP317/upgrades48 no repetidos por extensión ausente
(0A000 conservado); HTTP/PostgREST/Ed25519→SQL no repetido por binario ausente.
Invocación extra con todos los tests históricos Supabase falla TS2353 ajeno al
diff; suite Edge551 con tipos sí pasa, sin --no-check. Sin Rust/TS modificados:
gates nativos/telemetría/lint TS omitidos. No instalar dependencias nuevas;
solo caché de paquetes Deno ya declarados. Sin herramientas nuevas.

Última lectura es la **copia de review r3**, 12:13 UTC: #1608 OPEN/in-review,
area:plataforma/Project Vantare/sin milestone, updatedAt11:40:15Z;
VANTA-16/17/15 Por revisar y draft#1622 a nightly en `3ce0eadc`.
No consultado ni actualizado desde este Mac; sin CI del nuevo HEAD.
Commit/SHA final local en `~/orq/1608.buzon.md`; orquestador recoge la rama,
revisa, repite pgTAP/upgrades/HTTP, y actualiza seguimiento. Canal: rama de issue.
Sin merge/promoción/release/deploy/producción/servicios/cuentas/datos reales.
Activación y esquema/Storage gestionado requieren revisión separada; no venta.
Política conservadora de rechazo de writers tardíos; filas/advisory pueden
abortar por deadlock bajo otro orden DML. No se promete ausencia global de
contención: nunca se acepta el writer omitiendo la relectura. Perfil remoto
apagado; registry/reconciliación inertes; historial previo privado conservado.

## #1608 · Cierre comercial ronda 3 local (14/10/2026)

Review `C:/tmp/ola2/review-1622-sol-r2.md` entera: R2-P1-1 único hallazgo,
sin P2/P3 adicional confirmado. Inicio limpio `c30e7c4c`, misma rama/worktree
`vantareapp/isa-1608-cierre-comercial` / `C:/tmp/1608-cierre-comercial`, base
`e5c90be5`. Dos transacciones SQL reales: update de alias bloqueado por el UUID,
borrado confirma primero y update restaura email aun con evento anterior;
retry de borrado no reparaba. RED16/40, cuatro casos (ambos subjects y tiempos).
B03 relee identidad FOR UPDATE bajo lock del UUID y comprueba tombstones antes
de escribir: GREEN40/40, PII/versiones/tombstones y trazabilidad/Storage intactos.
Regresión Python en runner normal y `--concurrency`, sin dependencia nueva.

Gates nuevos: pgTAP317 + upgrades48 + concurrencia40 = 405 PASS; JWT/PostgREST
y Ed25519/SQL real PASS; Deno551 PASS/1 ignored; calidad456, deploy surface,
check scripts y diff--check PASS. Logs `C:/tmp/1608-comercial-r3/`; primer gate
HTTP con ruta Deno inexistente conservado y corregido solo en invocación.
Sin native/TS nuevos: gates Rust/telemetría/lint TS omitidos por alcance.
Detalle y comando en [informe](../../analysis/review-cuentas-pagos-2026-10.md).

Encargo **solo local/tests**: un commit por hallazgo; HEAD final en buzón1608.
No push ni cambio remoto de issue/PR/Plane/CI. Última lectura #1608 OPEN/
in-review, area:plataforma, Project Vantare/sin milestone, updatedAt11:40:15Z;
VANTA-16/17/15 Por revisar, draft#1622 a nightly/auto-merge OFF en `c30e7c4c`.
Siguiente: orquestador revisa nuevo HEAD y actualiza seguimiento; no atribuir
la CI antigua al arreglo local. Migración corregida aún no desplegada; no
actualiza automáticamente un esquema que ya hubiese aplicado el cuerpo viejo.
Sin producción, datos/cuentas/compras reales, merge/promoción/release/deploy;
activación/confianza y aceptación comercial real siguen pendientes separadas.

## #1608 · Cierre comercial ronda 2 (14/10/2026)

Review independiente `C:/tmp/ola2/review-1622-sol.md` completa: dos P1 de
datos históricos, ningún P2/P3 adicional confirmado. Misma rama/PR draft
#1622 y base `e5c90be5`; inicio limpio `76c1b948`. VANTA-16/17/15 En curso
durante ejecución, Por revisar al cierre por escritura/lectura en issue/buzón.
P1-1 RED de upgrade: 10/18 aserciones fallan (UUID/compras/PII/tombstone/Storage)
y la migración acepta aliases de UUID distintos. B03 añade el vínculo canónico
al UUID original sin borrar aliases; conflicto 23505 aborta toda la transacción.
Pruebas pre-B03 reproducibles por `run-commercial-local.py --upgrade identity`
y `--upgrade identity-conflict`. Evidencia `C:/tmp/1608-comercial-r2/`.
GREEN 18/18 y conflicto/rollback 4/4 sobre PostgreSQL18 desechable.
P1-1 commit `a0db4d98`. P1-2 RED 14/26: partial/pending/agregado anteriores
conservaban grant y read model activos. B02 proyecta cada agregado/refund
persistido con UUID/entorno/fuente/versión reales y refresca usuarios bloqueados
en la misma transacción, con writers serializados. No reescribe grants ni ledger;
otra compra/suscripción/entorno y failed/canceled permanecen. Regresión
`run-commercial-local.py --upgrade refunds`. Solo local/tests; sin prod/servicios reales,
secretos/dependencias/promoción. SHAs y gates finales se verificarán en issue/buzón.
GREEN P1-2 26/26 con estado insertado antes de las tres migraciones comerciales.
P1-2 commit/código probado `d6e3caf57dc9ca1ce7dc4771df1405a11b3f8d1b`.
Gates nuevos: 551 Deno PASS/1 ignored, 317 SQL existentes + 48 upgrade = 365,
JWT/PostgREST y Ed25519/SQL real PASS; calidad456, superficies deploy,
check scripts HTTP y diff--check PASS. Sin fuente TS/nativa nueva: lint TS,
fmt/check/Clippy/Nextest/lifecycle/telemetría omitidos por alcance.
Riesgos: B03 aborta con aliases contradictorios; B02 bloquea writers durante
backfill (volumen/duración reales no medidos). No infiere enlaces de suscripción
ausentes del ledger. Informe actualizado con comandos y fallos iniciales
conservados. Entrega en la misma draft #1622; siguiente: review/CI del nuevo SHA;
activación/confianza/despliegue/aceptación real siguen separados.

## #1608 · Cierre comercial B03 → B01 → B02 (14/10/2026)

Encargo explícito de Isaac: implementar los tres planes en rama nueva, solo
local/tests. Worktree `C:/tmp/1608-cierre-comercial`, rama
`vantareapp/isa-1608-cierre-comercial`, arranque #1615 `7aab0699`.
#1615 entró en nightly `e5c90be5`; rebase de **solo los commits de cierre** a
esa base antes del push. El HEAD/PR/checks finales están en issue/buzón.

B03/B01/B02 implementados con RED→GREEN por bloqueo; detalle/decisiones/riesgos
en `docs/analysis/review-cuentas-pagos-2026-10.md`. 551 Deno PASS/1 ignored,
317 pgTAP PASS + JWT/PostgREST real y emisión nativa Ed25519 sobre SQL real.
Se preservan los fixes de #1615; nuevo registry/trust y reconciliador vacíos/
inertes. Sin Rust nuevo. Queda review/CI y activación/aceptación real separadas,
sin producción/secretos/precios/datos reales/merge/promoción/release.
Código probado `05e79d1a1cb68c48f07213aaa89a7d0a69e2b43a`, base `e5c90be5f63347fa4d50b4110e1946201c1957c0`.
HEAD/PR/estados verificados finales en issue/buzón. Siguiente: review del cierre.

## #1608 · Integración de nightly (14/10/2026)

Encargo explícito tras review r3 APTA: nightly → rama de issue, con merge,
sin rebase ni promoción. Worktree limpio `8fecf307`, fast-forward al remoto
`812ed8ec` conservado. Merge probado `eca5155f6a51aad620e5af5d4ad51368edcaaa83`,
padres `812ed8ec` + `origin/nightly@5b781964`, incluye #1611/#1617/#1618.
Conflicto único `native/services/src/app.rs`: rechazo definitivo conserva
revocación/ACK y éxito conserva analytics consentido tras transferir derechos.
Los otros 66 archivos entrantes son idénticos a nightly. Sin política nueva,
UI nueva, dependencias o tests relajados; B01/B02/B03 permanecen No-Go comercial.

Gates nuevos GREEN: fmt/check/Clippy; Nextest 1697 PASS/12 skips heredados
(cinco bancos manuales #1611 más los siete previos); lifecycle 18 PASS;
telemetría 25 PASS/0 skips (ACC 814.150 s); Deno534 PASS/1 ignored PostgREST;
SQL230 y followup35+F1/F1IP/F2/F3/F4/concurrencia/rollback PASS. Integridad456,
138 tests scripts GitHub, paneles8, followup4, snippet y guardas de superficie PASS.
Logs `C:/tmp/1608-merge/`, target propio, cola/dos jobs y QA aislada. Fuente Rust
sin cambios tras la prueba; cierre posterior documental. Fallos de entorno
Deno y sonda conservados/corregidos en invocación; cache anterior de Functions
apartada y conservada fuera del repo, sin editar dependencias. B01 RED separado.

Misma PR #1615 ready a nightly; auto-merge preexistente desactivado reversiblemente
antes del push porque no se autoriza promoción. HEAD final/push/CI y Plane
VANTA-16/17/15 Por revisar por escritura/lectura en issue/buzón al publicar;
no se hereda CI anterior. Informe actualizado. Siguiente: revisión del nuevo
SHA y decisión del orquestador sobre integración. Sin producción, compras,
datos reales, QA GUI física, promoción ni release.

## #1608 · Revisión cuentas y pagos (14/10/2026)

Ronda 3 sobre `b5be4303`, rama `vantareapp/isa-1608-cuentas-y-pagos`,
base nightly `69fa2d65`; misma PR draft [#1615](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1615).
Entrega para revisión de Plane VANTA-16/17/15; escritura/lectura final tras el push en issue/buzón; GitHub #1608 OPEN/in-review,
area:plataforma, Project Vantare y sin milestone. Sin merge, producción ni compras.

Review Sol r2 `C:/tmp/ola2/review-1615-sol-r2.md` leída completa. R2-N1
reproducido: dos RED en AccountPoll detached con candidato previo, con/sin
identidad restaurada. Arreglo mínimo: identidad distinta o ausente exige
`revoke_local` antes de guardar la sesión. Sin núcleo se rechaza el cambio y
se conserva la cuenta anterior; el reintento gestionado exige ACK durable.
Misma ruta de revocación que logout y rechazo definitivo de OAuth; services
no escribe el binding del núcleo. Fix `64e9eec5`, tests/código probado `04cfe8df`;
GREEN focal 49/49. fmt/check/Clippy PASS; Nextest nuevo 1654 PASS/7 exclusiones
existentes; lifecycle 18 PASS. Quality/retirada 456 huellas, canal 45 y notes 26
tests PASS; fragmento válido. Logs `C:/tmp/1608-r3/`, fallo inicial de tamaño
Clippy conservado y resuelto con callback común, sin allow ni tests relajados.
Login/candidato/ACK con fixture IPC; Owner real/Launch/reinicio Free se valida
por separado en la regresión existente. Sin promesa de login comercial real.
No hay consumidor nuevo de borrado: B03 conserva su plan y No-Go.
Deno/SQL/telemetría conservan evidencia de ronda 2, no repetida porque solo cambia
services/documentos. HEAD/push/PR/CI finales tras publicar en issue/buzón;
combinación con nightly actual/#1612/#1523 y aceptación comercial pendientes.

Los arreglos de las rondas anteriores se conservan:

- N1/F08/F02 `d6aec3ca`: auxiliar sin CoreLink no confirma logout ni inicia
  renovación HTTP; devuelve error y conserva estado para reintento gestionado.
  Con núcleo exige Invalidate ACK durable antes de retirar candidato/sesión.
  RED→GREEN con Owner real; Launch v1 perpetua reforzada con RED contrafactual,
  logout gestionado vía host y reapertura en Free. El almacén del núcleo sigue
  bajo su único propietario; no se promete revocación autónoma sin él.
- N2/F02 `381bee42`: HTTP 400 OAuth invalid_grant es Authentication. Refresh
  automático/explicito de licencia/cuenta/perfil comparte ACK, retirada del
  candidato y tombstone de sesión. 400 genérico/malformado y 429/503 conservan
  derechos. RED→GREEN 6 focales, sin userinfo/native-license después del rechazo.
- N3/F04 `5b5ab24c`: lectura/firma reciben el entorno del servidor; loader filtra
  grants por entorno sin relajar el normalizador ni perder soporte. RED 409 con
  production+sandbox → GREEN 67 tests emisor/handler.
- Atribución `71388711`: binding durable Polar/entorno/customer prevalece sobre
  external_customer_id contradictorio. RED→GREEN 52 tests procesador.

Evidencia anterior de ronda 2 `C:/tmp/1608-r2/`: fmt/check/Clippy PASS; Deno completo 524 PASS/
1 ignored PostgREST; SQL desechable 230 GREEN, B01 1 RED; B02 4 RED separados.
Nextest nuevo 1652 PASS/7 skips; lifecycle 18 PASS; telemetría 25 PASS. Cola y target propio, APPDATA/
LOCALAPPDATA aislados. Fallos iniciales de fixture/mtime/permisos/lint conservados.
Sin baselines recalibrados ni tests debilitados. Código de ronda 2 probado `03fb0dea`; cierre posterior documental. SHA/push/CI de esa ronda
verificados en issue/buzón, sin heredar verde de ba02b093. Nueve fixes de ronda 1 se
conservan; sus SHAs/evidencia y los planes actuales están en el
[informe](../../analysis/review-cuentas-pagos-2026-10.md).

No-Go comercial: B01 bearer/reset requiere corte JWT/RLS; B02 refunds
ordinario/Pro/parcial/agregado requiere ledger SQL/reconciliación; B03 requiere
retención/tombstones/guardas de datos. Plan por bloqueo con archivos, riesgos,
pruebas y decisiones de Isaac en el informe. #1523 OPEN/draft `33be660d` leído,
sin integrar ni trasplantar fragmentos. El fallback external ID sin binding
sigue bajo ese corte. Coordinar `account.rs` (Exchange) y `app.rs` (refresh/logout)
con #1612 al integrar. Aceptación comercial/GUI/servidor pendiente de autorización.

# Handoff vivo — Plataforma, cuenta, servicios y distribución

Estado de la base indicada; releer la issue antes de ejecutar.

## #1609 / VANTA-22 · Analítica consentida (14/10/2026)

Ronda 3 publicada para revisión desde `f56156e3`; review Sol r2 completa.
P2-1 `86fa6aa8`: RED A/B → GREEN, caché monotónica, admisión por generación,
cola revocable de 32 entradas y acumuladores descartados/revalidados al retirar/cerrar.
Callbacks try_lock sin I/O ni espera; worker persiste fuera del hilo UI.
P2-2 `6b177190` + `4357a6a5`: carga con consent.lock retenido, controles disponibles,
limpieza/importación Setup Busy diferidas en worker cancelable y revocación sin reiniciar.
Busy tipado, wrapper save_with String conservado; resultado al heartbeat por memoria.
Respuesta atrasada descartada si hubo decisión manual: test worker terminado →
revocación → recibir respuesta, sin sleeps. No borra otros avisos de Ajustes.
P3 `88ddc324`: error de decisión no confirmada/reintentar, sin afirmar que fallos
estén apagados. `beb68c4f` cierra Clippy y refuerza la barrera del test heredado:
la cancelación al cerrar no puede sustituir su comprobación final de consentimiento.
Gates finales: fmt/check/Clippy, Nextest 1675/1675 (7 skips), lifecycle 18/18,
services 130 + 2 procesos, Store 9 e integridad 456 huellas PASS. RED y errores
iniciales conservados en C:/tmp/1609-r3; [informe](../../analytics/informe-1609.md).
Código publicado `4357a6a58d66f5648a9d02befc8a0c5b9f5a4dbc`, base `69fa2d65`;
HEAD documental final y CI en issue/buzón. PR #1617 draft a nightly, sin auto-merge
ni merge; VANTA-22 Por revisar verificado el 14/10 a las 04:03:53 UTC.
Origin/nightly consultado `552c0d52`; sin integración con ese tip ni promoción.
**Criterio estricto pendiente:** la invalidación en otra UI depende del refresco
Privacy del worker (espera normal 250 ms, mayor con I/O ocupado). Descarte al
refrescar probado, sin garantía de retirada instantánea de memoria entre procesos.
DUDA al orquestador: frontera compartida requiere review; no se declara APTO ese
criterio. Próxima acción: revisar diff/evidencia y resolver ese límite antes de integrar.
Sin subagentes, diseño/dependencias nuevos, QA GUI física, PostHog real, producción,
datos/instalación reales de Isaac, merge ni release. Telemetría dedicada no requerida
(sin cambios runtime/domain/ipc/testdata); paneles/snippet sin cambios, no repetidos.
Pendientes iniciales de clave/panel real, Marketing/Setup, atribución y registro/pago
backend conservados en informe/contrato. Acciones externas autorizadas: commits,
push, actualización PR/issue y estado Plane. Última comprobación local: 04:03 UTC.

### Ronda 2 (evidencia anterior)

Ronda 2 completada por Codex CLI; review Sol leída completa, sin subagentes.
P1 `58d0a735`: RED A/B → GREEN. Generación persistida y cerrojo SO común
publicación/revocación/POST; con POST activo (8 s), guardar devuelve ocupado
sin éxito falso. P2 `f40bc343`: ID/marcadores borrados; UUID nuevo al reaceptar,
tiempos reiniciados por generación. P2 `55531cc4`: instrumentación GPUI solo
try_send (32 entradas); worker de services persiste, emisor HTTP en services.
Guardado manual del consentimiento conserva su ruta atómica existente.
Gates locales: services 127 + 2 procesos, Nextest 1666/1666 (7 skips), lifecycle
18/18, fmt/check/Clippy/quality PASS (456 huellas). RED y GREEN conservados en
`C:/tmp/1609-r2/`; detalle, límites y omisiones en [informe](../../analytics/informe-1609.md).
Base `69fa2d65`, código publicado `55531cc4`; HEAD documental en issue/buzón.
PR draft [#1617](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1617)
a nightly, sin auto-merge; VANTA-22 «Por revisar» verificado 14/10 02:36 UTC.
CI del nuevo HEAD pendiente; no afirmar integración/release. Nightly consultado
`0807fbd0`; esta entrega no integra ese tip ni promociona canales.
Catálogo/ID en `docs/analytics/eventos.md`; snippet/paneles preparados, sin --apply.
Pendientes: clave/panel real por vía privada del orquestador, Marketing/Setup
(#1591/PR #1600), atribución y registro/pago exactos backend, QA visual/review.
Telemetría dedicada omitida: no se toca runtime/domain/ipc/testdata. Sin diseño
nuevo, producción/PostHog real, datos/instalación reales de Isaac, dependencias,
merge ni release. Evidencia inicial y contratos conservados en el informe y Git.

## #1601 / VANTA-10 · Plane, fase de implementación (13/10/2026)

OK de Isaac/orquestador al plan `C:/tmp/ola2/plan-1601.md`: Plane → Supabase
cada 5 min, tres columnas; archivos antiguos retirados, JSON manual del Hub inerte.
Rama propia `vantareapp/isa-1601-roadmap-plane`, base inicial nightly `298abc33`, actualizada con #1599 (`bc89c8b8`).
Implementación inicial `076531ab`; merge documental `162ba486` preservando
reglas de orquestador/estados y autoridad del roadmap Plane. Corte de código `7edf33e6`; SHA final/CI en el PR
[#1603](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1603) a nightly.
Issue [#1601](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1601),
`area:plataforma`, añadida al GitHub Project Vantare; sin versión comprometida.

Implementación local: API v1 CE con páginas completas y memberships, filtro
Infraestructura/Negocio/canceladas, nombres literales, IDs estables y límites
40 tareas/40 KB sin truncar. Mismo documento/rol/RPC v2/v1; sin cambio de esquema.
Hub carga caché y refresca cada 300 s usando el heartbeat y worker IPC existentes;
acciones explícitas conservan prioridad. Tres columnas con later legado en Planeado.
Web preparada aquí; no se edita otro repo. Action/scripts ClickUp retirados localmente.

RED: test de tres columnas perdía later; los cinco tests web fallaban sin polling.
GREEN final: 18 Python, 6 web, 8 Hub + 6 services roadmap; 57 digest, 45 canal
y 26 release-notes; fragmento ISA-1601 validado; script Plane 9 tests PASS.
fmt/Clippy PASS; Nextest completo final 1646 PASS/7 skips; lifecycle 18 PASS;
telemetría 25 PASS (ACC 832 s). Regresión de reintento de caché RED→GREEN.
La repetición de Nextest chocó con el .exe de telemetría abierto; tras terminar
ACC se repitió en serie y pasó. Evidencia `C:/tmp/ola2/1601-*.log`.
SQL PostgreSQL 18.6 local desechable PASS: idempotencia, cambio único, lectura
v1/v2, vaciado/retirada rechazados. Unidades systemd verificadas en copia temporal
con ExecStart=/bin/true; no prueba despliegue. Quality 456 huellas PASS.
Runbook: [plane-roadmap-runbook.md](../../plane-roadmap-runbook.md).
Credenciales/token/roadmap.env, despliegue, timer y primera escritura NO autorizados
ni ejecutados. Cantidad/tamaño del tablero real pendientes de lectura autorizada;
exceso exige parar y preguntar. Cambio de IDs puede exigir aprobación exacta SQL.
Entrega: PR #1603 (`Closes #1601`), auto-merge desactivado por Isaac tras la
revisión independiente; no reactivarlo. CI remota del nuevo SHA pendiente.
VANTA-10 pasa a Por revisar con el
enlace del PR y FIN en buzón. No se afirma merge ni publicación. El orquestador revisa y gestiona #1582, sustituido por
este publicador. QA GUI y tablero real pendientes: las pruebas son locales con
fixtures/corpus; no hay publicación real, deploy ni release.

Corrección de revisión #1603: revisión Sol leída completa y tres regresiones
RED antes del arreglo. Privacidad: 10 subcasos fallaban; ahora exige recuento
`total_issues` entero y coherente en cada module, rechaza privados vacíos
incluso con cero declarado y conserva JSON/SQL anteriores al abortar.
Paginación: 8 subcasos aceptaban respuestas dudosas; ahora rechaza listas
desnudas y metadatos ausentes. Web: `pagehide` con `persisted=true` conserva
controlador/timer; test de dos restauraciones, sin intervalos duplicados,
y cierre definitivo que cancela y retira el listener.
GREEN de esta ronda: 21 Python, 7 web, check/Clippy/fmt, Nextest 1646 PASS
con 7 skips, lifecycle 18 PASS; SQL local, quality 456 huellas, canal 45,
release-notes 26, digest 57 y bash -n PASS. Telemetría no repetida: no se
tocan runtime/domain/ipc/testdata; los 25 PASS anteriores siguen siendo
evidencia de la implementación inicial. Bfcache probado con eventos simulados;
QA web real pendiente. Logs `C:/tmp/ola2/1603-*.log`, tabla RED→GREEN en
`C:/tmp/ola2/fix-1603-results.md`; SHA del push en issue/PR/buzón.
El runbook documenta estas guardas. Sin nuevas acciones de producción.

## 1. Resultado

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

Base incorporada mediante merge (sin rebase): `origin/nightly@b2186f82746424b4844a5909efd31530c5bbe5b3`,
que contiene #1570 (handoffs de estado), #1572 (#1563 pedales) y #1573 (#1568 acceso).
Rama `vantareapp/isa-1535-roadmap-testing`, entrega #1535 `3d762e8b`, PR
[#1578](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1578) a nightly.
SHA del merge/push y CI se registran en la issue y `C:/tmp/buzon/1535.md`.
Auto-merge activo por el orquestador; esta escritura no acredita fusion remota ni release.
Servicios IPC v6, DTO v10 y control/derechos v4 son contratos independientes.
#1568 conserva admision protegida, cancelacion serializada y revalidacion;
la correlacion del incidente humano sigue pendiente. SQL #1535 no aplicado.

#1565 (repo privado): rama `vantareapp/isa-1565-descargas-publicas` sobre
`origin/nightly@707514e2`; feed en seco a `Vantare-Downloads`, runners
`self-hosted` solo en privado y presupuesto de artifacts. PR, SHA y checks en la
issue y `C:/tmp/buzon/1565.md`. Sin release, firma ni cambio de visibilidad.

## 4. Decisiones cerradas

- Plane es la única fuente del roadmap desde #1601, publicado en Supabase con lectura anon y compatibilidad v1/v2; no depende del repositorio publico. Clerk identifica; Polar cobra; Supabase conserva UUID interno/datos. No atribuir compras por email, metadata editable o `sub` aislado; identidad ambigua se rechaza/cuarentena.
- DTO de fotos v10, servicios v6 y control/derechos v4 son contratos independientes en esta base.
- Account conserva recuperación aun con herramientas denegadas; negar derechos no inventa un login ni un pago.
- Venta pública exige matriz monetaria/reconciliación y autorización. Implementado, integrado, publicado y validado en producción son estados distintos.
- #1565: descargas y feed solo en el repo público `Vantare-Downloads`; sin feed doble ni renovación automática del bootstrap. La 0.0.976 se publica solo allí y cada instalación reinstala con Setup. Free privado: sin branch protection aplicada; deploy de Functions manual sin mover secretos ([repo-privado-1565](../../repo-privado-1565.md)).

## 5. Arquitectura y ownership

[Services](../../../native/services/README.md) posee red bajo demanda; [Hub](../../../native/hub/README.md) presenta cuenta/calendario/actualización y no autentica ni cobra. Supabase/Clerk/Polar se validan en sus entornos autorizados. Admin es privado y no entra en el instalador público. El mapa de procesos vive solo en [native/README](../../../native/README.md).

## 6. Evidencia y límites

#1535: fmt/Clippy PASS; Nextest 1579/1579 (7 skips), lifecycle 18/18 y
telemetria 25/25 en la entrega aislada. SQL corregido tras Sol+Opus: PostgreSQL
18.6/pgTAP 1.3.4 local 20+31 PASS, LOGIN adversarial, aislamiento de cuentas,
aprobaciones caducadas con dos sesiones y auditoria DEFINER EXECUTE+USAGE.
TLS CA/hostname y control de hostname real PASS sin auth/SQL; tres tests Python.
Quality 456 huellas PASS. Evidencia: `C:/tmp/ola2/1535-evidence/`.
El merge actual tuvo conflictos solo documentales; no repetidos gates Rust
por la condicion del encargo. No acredita esquema Supabase completo, CI remota,
configuracion del host de CI, OAuth, pagos, entorno fisico ni produccion.

#1565: QA aislada `TEST_INSTALLER` PASS (Setup 0.0.975 real → datos →
Setup 0.0.976 de la rama: 4/4 datos idénticos, bootstrap renovado, Check solo a
Downloads; instalación real intacta). Paquete QA = binarios 0.0.975 con
`manifest.version` 0.0.976. Evidencia: `C:/tmp/1565-qa/ev/`, `C:/tmp/1565-b/`.
Revisión Sol (`C:/tmp/ola2/review-1592-sol.md`): actualizador y datos OK;
P1 limpieza Windows (cwd bloqueado), P2 `actions: read` y P2 orden Linux
corregidos con regresión; tests de runner/budget/origen conectados a gates.

## 7. Riesgos y deuda

- P1: acceso al abrir LMU (#1568); no dar la causa real por confirmada solo con RED local.
- P1: readiness comercial, identidad y pagos (#1514/#1506/#1507/#1499/#1501); no abrir venta desde docs.
- P2: SQL #1535 corregido y probado localmente; esquema completo, aplicacion y activacion pendientes. P2-4 aceptado por Isaac en #1535.
- Login/logout físico, expiración, recuperación, instalación/upgrade y QA remota requieren evidencia propia.
- P2 #1565: instalaciones que no reinstalen con Setup 0.0.976 antes de privatizar se quedan sin feed; app Go retirada sin actualización.

## 8. Issues terminadas, activas y pendientes

#1530-#1534 y #1536 cerradas; #1570/#1572/#1573 fusionadas en la base indicada.
#1535 en PR #1578; #1568 mantiene correlacion humana pendiente. Abiertas
#1514/#1506/#1507/#1510/#1511/#1515 y gates comerciales: consultar su estado
antes de actuar. IDs migrados y evidencia previa permanecen en el historico.
#1565 abierta: PR de feed/CI a nightly en revisión; runners en #1583.

## 9. Siguiente acción exacta

Verificar CI/auto-merge de #1578. Cuando figure MERGED en nightly, ejecutar
SOLO LECTURA contra produccion la consulta previa (DEFINER alcanzables, ACL y
registro de migraciones) usando acceso ya configurado, sin imprimir secretos.
Escribir DUDA con resultado y comando exacto para las dos migraciones. Si falta
acceso, preparar pasos para Isaac. No aplicar nada hasta respuesta expresa.
P2-4 aceptado por Isaac en #1535; no implica configurar credenciales ni desplegar.

#1565: revisión independiente del PR. Tras integrarlo, Isaac sigue el runbook
(firma única, publicar solo en Downloads, reinstalar, avisar al tester) antes
de cambiar la visibilidad.

## 10. Última actualización

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.

2026-10-13 · GitHub #1565 · Claude. Feed en seco, CI privada y QA aislada;
PR a nightly sin merge ni release.
