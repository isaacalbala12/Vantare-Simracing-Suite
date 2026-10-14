## #1620 / PR #1621 · correcciones de sandbox (14/10/2026)

Encargo explícito al worker Codex macOS, sin subagentes ni acceso GitHub/Plane,
sin servicios reales ni push. Base local `92e383d3`, nightly ya incorporado
`953f041c`; rama `vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
VANTA-N omitido por autorización anterior: el orquestador actualiza trackers y
recoge los commits locales. No se hereda CI ni se afirma integración de estos fixes.

Arreglo 1: tokens de organización como único modo soportado; POST de productos,
descuentos y enlaces sin `organization_id`. GET de organización siempre valida
el ID esperado; guarda del portal conservada. Dos regresiones RED (payload e
identidad sin creador) antes del cambio; GREEN del catálogo registrado en
`~/evidence/1620/sandbox-fix/01-green.log`. La prueba recorre draft, publicación
simulada, enlace y rerun sin escrituras. No acredita ejecución contra Polar.
Siguiente: salida recuperable tras fallo y diagnóstico 4xx, suite Deno completa,
revisión del orquestador y sandbox real por su vía autorizada.

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

## #1620 / PR #1621 · merge local de nightly (14/10/2026)

Encargo del orquestador al worker Codex en macOS arm64: incorporar nightly
mediante merge, sin rebase ni push. Padres: versión revisada
`27caa91e1470032da2bc577d85b1377f8dd56d0f` y `origin/nightly` obtenido por
fetch `953f041c5034d12648c4e23463dd953dc04a0e19`; base común `8194c949`.
Rama `vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
Issue/PR y estado remoto conservan la última referencia de ronda 5;
no hay acceso GitHub desde este worker ni verificación remota de CI actual.
Falta VANTA-N conforme a la omisión anterior: avisado en buzón al orquestador,
que recoge la rama y actualiza issue/Plane después de revisar.

Dos conflictos resueltos conservando ambos lados:
`supabase/functions/billing-webhook/process.test.ts` concatena los tests de
Pro anual/lanzamiento de #1620 y los de reembolsos/atribución de nightly,
con cierre independiente de cada test; formateado el bloque entrante de
binding, sin cambiar aserciones. Este handoff conserva las entradas de
#1620 y #1612, además de las entradas #1608/#1609 fusionadas automáticamente.
Los otros 76 archivos modificados respecto a la base común coinciden byte
a byte con su padre correspondiente. Lógica revisada de catálogo/mapping
intacta; sin modificaciones propias de Rust/SQL ni dependencias declaradas.

Gates del merge: Deno completo **577 PASS, 0 FAIL, 1 ignored** (PostgREST
local sin configurar); check de 8 TS y JSON, lint de 8 TS con la regla
existente `no-import-prefix` excluida, fmt de 9 archivos PASS. Integridad y
retirada **456 huellas**, superficie deploy y planes offline sandbox/production
PASS. Tests ejecutados con entorno vacío, sin permiso de red;
`--node-modules-dir=none`, sin artefactos node_modules en el checkout.
Primera suite `--cached-only` bloqueada por standardwebhooks ya declarado
sin caché; se descargó esa dependencia de tests existente sin cambiar
manifiestos. Fallo inicial de fmt conservado y corregido solo en el test.

Evidencia `~/evidence/1620/`, HEAD final y resumen por conflicto en
`~/orq/1620.buzon.md`. pgTAP/PostgREST/Rust/UI/telemetría nativa omitidos:
el encargo pide Deno y gates del área; cambios entrantes Rust/SQL idénticos
a nightly, sin resolución propia. El merge no acredita esos gates ni el
sandbox Polar real. Siguiente: orquestador revisa diff/evidencia y recoge
commit local; promoción a nightly requiere su circuito autorizado.
Sin push, deploy, servicios reales, secretos, release, pagos ni gasto.
Canal alcanzado: rama de issue local, con nightly incorporada como padre.

## #1620 · respuesta ronda 5 independiente (14/10/2026)

Informes `C:/tmp/polar-loop/r5-sol-a.md` y `r5-sol-b.md`: SIN HALLAZGOS,
VEREDICTO APTO. No enumeran defectos que reproducir ni corregir. Muse no
completa revisión: usa otro checkout y sus lecturas de informes/issue/PR
son rechazadas; no aporta hallazgos ni veredicto y no cuenta como aprobación.
Sin fixes ni RED→GREEN nuevos; este cierre solo actualiza el handoff.

Verificación local del worker sobre `5b1feb8c`: suite Deno 571 PASS,
0 FAIL, 1 ignorado (PostgREST local no configurado); catálogo 34 PASS.
Lint/fmt y superficie deploy PASS. Planes offline sandbox/production PASS
sin permisos de red/entorno; se usan dependencias ya cacheadas, sin añadirlas.
Logs `C:/tmp/polar-loop/r5-worker-*`. Diff documental revisado y diff check
PASS; commit/HEAD/push/checks remotos en `C:/tmp/polar-loop/r5-respuesta.md`
y comentario de entrega #1620/#1621.

PR #1621 OPEN draft a nightly; issue OPEN/state:in-review, area:licencias,
GitHub Project Vantare, sin milestone. Rama `vantareapp/isa-1620-precios-polar`,
base común `8194c949`; sin incorporar ni promocionar nightly.
Falta VANTA-N: aviso al orquestador; se conserva la omisión explícita anterior
y no se crea tarea. Siguiente: completar review independiente y sandbox
autorizado del runbook, incluidas facturas, trial, cambios de plan, atribución
y recuperación. No levanta no-go #1514/#1506. Rust/UI/lifecycle/telemetría y
pgTAP omitidos porque esta ronda no cambia producto ni SQL.
Sin API Polar, secretos, dependencias nuevas, deploy, merge/promoción,
auto-merge, release, venta, pagos ni gasto. Sin subagentes.

## #1620 · respuesta ronda 2 independiente (14/10/2026)

Sol A sin hallazgos. P2 Sol B confirmado: el Checkout Link compartido podía
añadir trial a Plus o sustituir siete días de Pro. `linkMatches` ahora exige
ambos campos de trial ausentes/null para heredar la configuración del producto;
rechaza drift antes de escribir y valida también la respuesta de creación.
Cuatro regresiones RED → GREEN: dos meses, siete días y cada campo aislado;
incluyen los cuatro productos y un PATCH pendiente que debe quedar intacto.
Control de campos ausentes/null e idempotencia PASS. Logs
`C:/tmp/polar-loop/r2-p2-trial-{red,green}.log`.
Muse no completa revisión ni aporta defectos nuevos/veredicto; no se cuenta
como aprobación. Suite Deno 571 PASS/0 FAIL/1 ignorado; catálogo 34 PASS.
Tipos/lint/fmt, quality 456 huellas, superficie deploy, planes offline sin
permisos de red/entorno y diff check PASS. Primeros intentos de tipos/suite
fallaron por flags/config/cwd/permisos; logs conservados y repetición correcta
PASS, sin cambiar tests existentes ni gates. Commit/HEAD/push y CI al cerrar
en `C:/tmp/polar-loop/r2-respuesta.md` y #1620/#1621. PR draft a nightly;
base común `8194c949`, nightly consultado `e5c90be5`. Sin VANTA-N, se avisa al
orquestador y no se crea tarea, conforme al encargo anterior.
Siguiente: review y sandbox autorizado, incluido enlace sin override de trial;
no levanta no-go #1514/#1506. Sin API Polar, secretos, dependencias nuevas,
deploy, merge/promoción, release ni gasto. Rust/UI/telemetría y pgTAP omitidos:
no se modifica código nativo ni SQL.

## #1620 · respuesta ronda 1 independiente (14/10/2026)

P1 Sol A/B confirmado: `published` no existe. Enum y gate usan `public`/
`private`; draft sigue pendiente. Dos regresiones RED → GREEN y control de
activación parcial; catálogo 24 PASS. Logs `C:/tmp/polar-loop/r1-p1-*`.
P2 Sol A confirmado: Polar conserva descuento al cambiar producto. Preflight
exige `customer_portal_settings.subscription.update_plan: false` con GET de
organización; bloquea configuración habilitada/ausente/inválida/ajena antes
de escribir, también sin creador si hay descuentos existentes. No cambia
ajustes automáticamente. Runbook bloquea cambios administrativos/programados
mientras siga vigente el descuento; configuración/verificación real pendientes.
Tres regresiones RED→GREEN, logs `r1-p2-scope-*`.
P2 Sol B confirmado: antes de PATCH rechaza IDs observados no guardados en
entrada durable, para impedir perderlos tras timeout y GET sin archivados.
Runbook explica registro forward/inverse, validación y reintento; conserva
pruebas anteriores de histórico ampliadas con la guarda. Dos RED→GREEN
(normal/lanzamiento), timeout confirmado antes del reintento e histórico
resoluble; catálogo 29 PASS. Logs `r1-p2-history-*`.
Muse no completa review ni añade hallazgos. Gates finales: suite Deno
566 PASS/0 FAIL/1 ignorado; tipos/lint/fmt, quality 456 huellas, planes offline
sandbox/production y diff PASS. Deploy surface rechazó node_modules generado
por la suite; preview verificó solo esa ruta, retirada por Git tras rechazo
automático de Remove-Item; repetición PASS. Logs `C:/tmp/polar-loop/r1-*`.
Diff completo revisado; no dependencias nuevas ni cambios de jueces/ignores.
Rama/PR #1621 draft a nightly conservados; HEAD/push/checks remotos y detalle
por hallazgo en `C:/tmp/polar-loop/r1-respuesta.md` y comentarios de entrega.
Issue OPEN/state:in-review, area:licencias/Project Vantare, sin milestone.
Base común `8194c949`, nightly consultado `e5c90be5`. Plane sigue omitido
según encargo previo sin VANTA-N. pgTAP omitido sin Docker/psql y SQL intacto;
Rust/UI/telemetría omitidos sin cambios nativos. Siguiente: review y sandbox
autorizado con configuración del portal, cambios programados, facturas,
identidad/refund/derechos e idempotencia; producción requiere OK separado.
Sin API Polar, secretos, deploy, merge/promoción, release ni gasto.

## #1620 · ronda 3 P2-2 (14/10/2026)

Decisión del orquestador: productos propios de lanzamiento 3,99/39,90 y
6,99/69,90; anuales decididos, sin antiguo gate. Un código exacto por creador,
-20 % porcentual repeating/2 meses, solo sobre los cuatro productos de
lanzamiento. Mes 3 mensual vuelve a 3,99/6,99; renovación anual a 39,90/69,90.
Después del mes, la web retira sus ofertas y solo distribuye enlaces de
creador, conservando productos. Plane omitido por instrucción explícita del
encargo; no se crea VANTA-N ni se reutiliza Notion histórico.

Normales e históricos preservados; `polar_launch_product_id` opcional con
inverso estricto a la misma clave/derechos. Checkout app sigue normal. Un
descuento/enlace por creador; sin descuentos de lanzamiento ni sufijos.
Preflight conserva P1-1/P2-1/P2-3; rechaza drift, colisiones y descuentos v1
compuestos sin migrarlos automáticamente. Comisión contable: 30 % mes 1,
10 % meses 2–12 sobre lo pagado; luego renegociar. Sin payouts.

DUDA API concreta: servicio oficial rechaza Checkout Links con productos draft.
Alternativa mínima implementada: draft/descuento y
`creator_link_pending: publish_launch_products_then_rerun`; tras activar
productos en paso autorizado separado, rerun crea enlace, otro escribe cero.
No publica productos automáticamente. Exclusividad por enlace es distribución,
no impedir reenvíos; cambio/publicación web pendiente en su entrega.

Cuatro regresiones P2-2 RED→GREEN; catálogo 21 PASS y webhook con alta,
renovación/cancelación de los cuatro productos y mismos derechos. Logs
`C:/tmp/ola2/1620-r3-*`. Errores intermedios de types/ruta/encoding corregidos
sin omitir gates. Suite final 558 PASS/0 FAIL/1 ignorado; check/lint/fmt,
quality 456, deploy surface y diff PASS. node_modules generado retirado solo
por Git tras preview y rechazo automático de limpieza PowerShell; superficie
repetida PASS. HEAD final en comentario de PR #1621 y buzón; evita
SHA autorreferencial. [Comandos/runbook](../../billing/isa-1620-polar-launch-catalog.md).

Rama `vantareapp/isa-1620-precios-polar`; base común `8194c949` incorporada en
`ce143d6f`, tip nightly consultado `e5c90be5`. PR draft a nightly. Issue en
GitHub Project Vantare/area:licencias. Siguiente: review independiente, sandbox
autorizado con facturas/trial/refund/identidad/derechos/enlaces/idempotencia y
pgTAP con PostgreSQL desechable (Docker/psql ausentes aquí). Rust/UI y telemetría
nativa omitidos sin cambios. Sin API Polar, secretos, deploy, merge/promoción,
release ni gasto.

## #1620 · ronda 2 (histórica, sustituida por ronda 3)

P1-1 `4ae058f0`, P2-1 `c25fc327`, P2-3 `5f85e868`, P3 `c80fb148`, docs `35a721fd`.
549 PASS/0 FAIL/1 ignorado; check/lint/fmt/quality 456/deploy surface PASS.
P2-2 pendiente entonces por códigos compuestos; decisión ronda 3 anterior
lo resuelve. Logs `C:/tmp/ola2/1620-r2-*`. Sin API/secretos/pgTAP.

## #1620 / VAN-782 · entrega inicial (histórica, sustituida por ronda 2)

[Tarea Notion](https://app.notion.com/p/3f9e51695c6581229de0e11deabcd9ab), proyecto
Billing y licencias. Rama `vantareapp/isa-1620-precios-polar`, heredada de
#1500@9e041ab8; merge de origin/nightly@8194c949 en `ce143d6f`, preservando la
regla vigente del trial anual de Pro. Checkout fuente dirty no modificado.
#1500/#1499 quedan sustituidos por este catálogo completo; no integrados por ello.

Tabla Pro 5,99/59,90 y lanzamiento 3,99/39,90; Plus 9,99/99,90 y
6,99/69,90. Anuales de lanzamiento pendientes con gate explícito. Código de
creador por plan: descuento fijo compuesto equivalente a 20 % extra sobre
lanzamiento (3,19/31,92/5,59/55,92); duración y comisión corregidas en ronda 2.
Script Deno idempotente por API, offline por defecto, duplicados/paginación y
drift rechazados, entorno/organización validados, producción con confirmación.
Productos nuevos draft; mapa generado conserva IDs/precios históricos y trials
Pro; no se inventan IDs en el snapshot sandbox. Pro Plus anual comparte derechos
con mensual; migración de checkout y pgTAP preparados.

[Runbook y comandos exactos](../../billing/isa-1620-polar-launch-catalog.md).
Tests Deno vigentes 544 PASS / 1 ignorado; sin dependencias nuevas, tests focales,
formato/check/lint y plan offline. PostgreSQL omitido: no Docker/psql; Rust/UI
omitidos sin cambios nativos. Evidencia local C:/tmp/buzon/1620-deno-tests-final.log.
Siguiente: revisar PR draft a nightly y después Isaac ejecutar con token privado
sandbox, confirmar anuales, comprobar renovaciones/creadores y autorizar producción.
No hay token, llamadas Polar, deploy, campaña activa, payouts, merge a canal,
release ni publicación. El checkout de la app aún no autoaplica los descuentos;
usar Checkout Links/API de Polar tras la validación autorizada. `plan.md` retirado
por #1601: no recreado, sin cambio público de disponibilidad.

Entrega publicada: [PR draft #1621](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1621)
a nightly; código `83da120e`, runbook `97db909a`. #1500 cerrada como sustituida,
sin merge. Push de rama verificado; CI del candidato se consulta en #1621.
Notion VAN-782 pasa a En revisión con evidencia y anuales/sandbox/pgTAP pendientes.

## #1612 / VANTA-9 · Perfil privado y Ajustes (14/10/2026)

Ronda 7 terminada en rama, fix/código validado `376181f2885f032126264a2f27584d0466dca9be`,
base integrada `e5c90be5`, PR draft #1619. Review R6 completa: P2-1 local
(editar durante primera carga conservaba controles vacíos y borraba campos guardados).
RED exacto nombre/simuladores; GREEN con editor GPUI real, Local protegido y reapertura,
sin sleeps. Guardar bloqueado hasta primera carga, incluso tras error/logout/Descartar;
mezcla por campo conserva datos no tocados y respeta borrados explícitos.
Caso adicional Descartar antes de cargar también RED→GREEN; conserva el bloqueo inicial.
Sin P3 nuevos en R6; P2/P3 de R5 siguen inertes y pendientes antes de reactivar sync.

Gates de `376181f2`: fmt/check/Clippy -D warnings PASS; Nextest **1751/1751**,
12 skips existentes (paridad 96,547 s); lifecycle **18/18**. QA con TMP/TEMP
exclusivos `C:/tmp/1612-r7-final-tests`, target propio native/target/gates, cola/dos jobs.
Se conserva el fallo de la primera pasada final en Strategy: fixture por PID sin
limpieza colisiona con un destino anterior. Reproducción controlada exit101 y
caso aislado PASS; [#1623](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1623)
registra el hallazgo, sin cambiar Strategy ni debilitar tests. La primera pasada
amplia anterior sobre `95aee8a2` también pasó 1751/1751 y lifecycle18.
Quality/456 huellas y fragmento PASS. Telemetría/SQL/Deno omitidos en r7:
solo Hub/documentos, sin runtime/domain/IPC/testdata ni SQL.

Evidencia `C:/tmp/ola7/1612/report.md`, RED/GREEN y fallos iniciales conservados.
Cierre posterior solo documental; HEAD/push/CI y Plane Por revisar verificados
al publicar en issue/PR y FIN del buzón. Sin merge/promoción/release/producción,
dependencias nuevas, subagentes, capturas nuevas ni instalación/datos reales tocados.
Siguiente: review del nuevo SHA y QA física del recorrido worker/IPC con primera
carga retenida, guardar/reabrir y Descartar. La ventana oculta prueba editor y
persistencia, no toda la app instalada. Sync sigue APAGADA.

La decisión de perfil local y evidencia de la entrega anterior se conservan debajo.

Decisión recibida de Isaac el 14/10: entrega de perfil guardado en el PC y
arreglos de Ajustes; **sync de perfil apagada y pendiente**. Un único interruptor
`PILOT_SYNC_ENABLED = false` en `native/services/src/app/pilot.rs` corta tanto
la preparación OAuth como las llamadas al puente/RPC/Storage desde los tres
comandos de perfil. Backend y pruebas preparados, sin activar ni borrar.
P2-1 y P3-1 de review r5 quedan inertes; deben resolverse antes de reactivar.
RED: PilotLoad abre conexión. GREEN: guardar texto multilínea/foto, cargar,
PilotSync y reabrir conservan la copia local y no abren conexiones, con/sin
identidad restaurada. Evidencia `C:/tmp/1612-local-sync-off`.
Entrega local validada sobre `414474ca39dac7532d6b5d115e0002c8263f9658`.
Corte cliente `6fab68b8`; primera integración nightly8194c949 en `685d4d63`
(gates completos verdes), seguida de nightly@`e5c90be5f63347fa4d50b4110e1946201c1957c0`
con #1608 en `db52700e`. Conflictos iniciales conservan ambos bloques del handoff,
todos los tests de privacidad y Services v8 + DTO piloto aditivo. Segundo merge
sin conflictos, con arreglos de cuenta intactos. La fixture de sync preparada
falló al no adjuntar CoreLink (final-test.log); se comparte el helper existente
solo cfg(test), sin relajar producción. fixture-green 2/2 PASS, incluido perfil
local sin red; fallo y explicación conservados.

Gates finales de `414474ca`: fmt/check/Clippy -D warnings PASS; Nextest
**1747/1747** (12 skips, paridad lenta 91 s), lifecycle **18/18** y telemetría
**25/25** (ACC 773 s; suite 818 s) PASS. quality/456 huellas y fragmento PASS.
Target propio native/target/gates, CARGO_BUILD_JOBS=2, datos aislados y plazo
1800 s por gate. pnpm no aplica (Rust/GPUI); sin cambios propios nuevos en SQL,
sin repetir pgTAP/Deno ni consultar producción. Cierre posterior solo documental.
HEAD/push, CI y VANTA-9 Por revisar se verifican en issue/PR y FIN del buzón.
Sin merge de PR #1619, auto-merge, promoción ni release. Únicos merges del worker:
nightly hacia esta rama de issue, autorizados por Isaac.
Siguiente: review de entrega local y QA física en portable aislado (guardar y
reabrir nombre/descripción con Enter/foto; Guardar/Descartar). Integración nativa
#1608 compilada; API OAuth/Storage reales y colocación de bandera pendientes.
Reactivar sync exige otra decisión y resolver P2-1/P3-1 r5 antes del cambio.

El roadmap público sigue en Plane; plan.md está retirado y el estado público
del encargo sigue En marcha (no Entregado). Las rondas siguientes son historia
de la preparación de sync, no el comportamiento activo de esta entrega.

Rama `vantareapp/isa-1612-perfil-y-ajustes`, base `origin/nightly@0807fbd0`.
[Issue #1612](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1612),
[PR draft #1619 a nightly](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1619),
Plane VANTA-9 / GitHub Project Vantare / area:plataforma.

Ronda 5 CLI: fixes publicados en `82c8340fb05f013381b8da00d0c3f7b7f9de7b0b`,
tras review r4 de `37ced450` (P2=3/P3=1). Base aprobada conservada.

| Hallazgo | Commit | RED y GREEN |
|---|---|---|
| P2-1 recibo histórico | `f00f3607` | RED R1 != R2; una llamada carga C/R2, la siguiente edición usa CAS R2; B pendiente conserva la negativa |
| P2-2 rechazo definitivo | `11a5511c` | RED A retenido tras 22023 y presupuesto incompatible; preflight impide nueva A, retiro durable conserva borrador/reancla y B corregido confirma tras reinicio |
| P2-3 conflicto HTTP | `c50a7b5f` | RED HTTP500/40001 => Offline y SQLSTATE40001 != PT409; GREEN PT409 y compatibilidad anterior, App muestra conflicto, R2 durable sin reenviar B al reiniciar |
| P3-1 duplicado de foto | `f63c9fc1` | POST duplicado -> GET JPEG/SHA -> recibo A -> B/CAS1 -> reapertura sin pendiente, con/sin reinicio |

HTTP incierto y recibos ilegibles/distintos conservan A. El pendiente sin
operación exige revisar/corregir y guardar; solo formatos locales anteriores
crean una operación durante su conversión. Un rechazo retira A antes del
refresco: si este falla, conserva la última revisión conocida y no resucita A.
Una sola llamada PilotLoad de App carga C/R2 tras recibo o muestra conflicto
real, con borrador/revisión persistidos. Preparación de tests compartida en
`ddda32dc`/`82c8340f` para cumplir Clippy sin reducir comprobaciones.

17/17 piloto PASS; fmt/check/Clippy -D warnings, quality/456 huellas y fragmento
PASS. Nextest 1681/1681 (7 skips existentes, paridad lenta 101 s) y lifecycle
18/18 PASS sobre `82c8340f`, con target propio native/target/gates, dos jobs,
datos aislados y plazo 1800 s por comando. Telemetría omitida en r5: sin cambios
en runtime/domain/IPC/testdata. Cierre posterior solo documental.
SQL 90 pgTAP, concurrencia/PT409 y retirada 10 postchecks/cuatro negativas PASS,
también sin SUPERUSER. PostgreSQL 18.6 y pgTAP 1.3.4 instalados desde Ubuntu
oficial en WSL; cluster nuevo 18/main detenido y arranque manual verificado.
Las pruebas se ejecutaron únicamente en bases desechables de loopback.
Evidencia `C:/tmp/ola5/1612`; fallos iniciales conservados y explicados allí.
Backend solo preparado, sin producción. P3 cerrado, sin cambios visuales,
login/Storage reales, QA física, integración #1608, merge/promoción/release.
PR draft a nightly DIRTY; CI solo GitGuardian PASS visible, sin CI completa
verde. Cierre/push final, estado Por revisar de VANTA-9 y última actualización
verificada constan en issue/PR y buzón. Sin merge/rebase, promoción ni release.
Siguiente: review del SHA final e integración compilada con #1608 por el
orquestador; API login/Storage y QA física pendientes. Activar el backend
requiere autorización separada de Isaac.

Ronda 4 CLI terminada en rama tras review r3 `8eadf36e` NO APTO (P2-1=1).
Corte Rust/SQL validado y publicado `d9df6b17256f31bc9499772b3aafe3069fe134fa`.
RED exacto: A aún en curso, load ve R, B reemplaza el intento y termina en
Conflict. GREEN: UUID v4 durable con contenido/foto y CAS inmutables; B conserva
su copia local y solo recibe otra clave después de confirmar A. Eliminadas
huellas y reconciliación por SELECT. Servidor preparado: `last_op_id`, recibos
privados por cuenta/op_id y lock transaccional; duplicado devuelve el resultado
original incluso después de un guardado de otro dispositivo.

fmt/check/Clippy `-D warnings` PASS; Nextest 1679/1679 (7 skips existentes,
paridad lenta 125 s), lifecycle 18/18 PASS. Los 15 tests de piloto pasan:
texto/foto, reinicio, confirmación de A/B perdida, edición intermedia, dos
dispositivos y negativas de documento/hash/revisión. Ambos formatos locales
anteriores preservan el pendiente; no recuperan retroactivamente confirmaciones
sin op_id. SQL 90 pgTAP, concurrencia real por barreras, aborto/reintento con la
misma clave, diez postchecks y cuatro negativas de retirada PASS también sin
SUPERUSER. Quality/456 huellas y fragmento PASS. Telemetría no repetida: no hay
cambios en runtime/domain/IPC/testdata. Datos de pruebas aislados, target propio
`native/target/gates`, dos jobs y plazo de 1800 s por gate.

PR draft #1619 actualizada, push d9df6b17 y VANTA-9 Por revisar verificados
14/10/2026 06:27 CEST. Cierre posterior solo handoff/changelog; HEAD final y CI en
issue/PR y buzón. No se declara CI completa verde. Origin/nightly `5a796e89`,
base aprobada `0807fbd0`, PR DIRTY: falta review del SHA nuevo e integración
compilada con #1608 por el orquestador. Sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola4/1612`: RED Conflict y GREEN, gates y SQL; conserva también
un primer fixture RED que devolvía Protocol y un fixture antiguo con load extra,
corregidos antes de los gates finales. No son fallos omitidos del gate final.

Backend solo preparado, sin consulta/aplicación de Supabase real. Recibos sin
poda automática: cualquier retención futura debe conservar idempotencia.
Sin diseño/capturas nuevas, login/Storage HTTP reales, juego físico ni validación
integrada. Las fotos del fixture no certifican la API completa de Storage.
Bandera sigue pendiente de colocación diseñada. Sin instalación/datos reales
tocados, herramientas/dependencias nuevas ni subagentes. Siguiente: review del
orquestador; activación backend requiere autorización separada de Isaac.

Histórico ronda 3 CLI tras review r2 `daa2ca20` NO APTO (P2=1/P3=1):
P2-1 reproducido: A confirmado sin respuesta, Guardar B antes de reconciliar
y reiniciar devuelve Conflict. Arreglo `98429184` + `c2a59c4e` (Clippy), GREEN 11/11 servicios:
huella durable del CAS enviado separada del pendiente, reconciliación de R+1
antes de enviar B con revisión real; documento/hash distintos siguen Conflict.
La matriz cubre texto/foto, con/sin reinicio y conflicto real; se prueba también
lectura/edición/reapertura del formato local previo. P3-1 `db7a3783` RED al
cambiar las coordenadas ya enviadas, GREEN 11/11 Hub: zoom/nudge y arrastre
congelados durante busy; respuesta libera la edición. Sin diseño nuevo.
Rust `c2a59c4e`: fmt/check/Clippy -D warnings PASS; Nextest 1675/1675
(7 skips existentes, paridad lenta 114 s), lifecycle 18/18 PASS. Quality y
456 huellas, más fragmento de changelog PASS. Telemetría y pgTAP no repetidos:
esta ronda solo modifica servicios/Hub, sin runtime/domain/IPC/testdata ni SQL;
la evidencia de ronda 2 se conserva como histórica. Datos de tests aislados,
target propio `native/target/gates`, dos jobs y plazo de 1800 s por comando.
Push `c2a59c4e` y PR draft a nightly verificados. VANTA-9 Por revisar verificado
14/10/2026 05:48 CEST. El cierre posterior solo cambia handoff/changelog;
HEAD final y CI constan en issue/PR y buzón. CI final pendiente de ejecución.
Nightly remoto `5a796e89` ha avanzado; GitHub marca DIRTY/conflicto de integración.
La base aprobada permanece `0807fbd0`: review e integración del conjunto con
#1608 pendientes del orquestador, sin merge/rebase, promoción ni release.
Evidencia `C:/tmp/ola3/1612`: también conserva el fallo del test Hub sin
network y el intento de ventana incompatible con Windows headless. La prueba
final ejercita los puntos del modelo que comparten las entradas; no acredita
interacción física ni un worker UI real. No hay capturas nuevas.

Diseño Opus `3aaa3961` conservado: perfil privado local primero, DPAPI por
issuer/subject, foto JPEG 256×256 ≤24 KiB y recorte circular. Puente UUID
existente y CAS; sin cambios en account.rs/account/*, login, pagos ni licencias.
Revisión de ocho páginas en [matriz](../../pilot-settings-review.md). El painter
compartido de bandera/fallback ISO está preparado; falta diseño aprobado de
colocación por widget. No se inventa composición.

Ronda 2 CLI corrige la review Sol (0 P1/4 P2):

| Hallazgo | Commit | Resultado probado |
|---|---|---|
| H1 confirmación perdida | `9a3d3b3f` + `03068639` | Reintento tras HTTP ilegible y reinicio; recupera solo documento/hash idénticos en R+1, otro hash conserva Conflict |
| H2 SQL acepta perfil ilegible | `ae586434` | Tipos/límites/controles/ISO/simuladores y campos futuros legibles; máximos válidos conservados |
| H3 DML elude CAS | `4db253ad` + `5e380ef0` | DML directo denegado; RPC pública INVOKER y escritor CAS privado NOLOGIN/NOBYPASSRLS, sujeto a RLS |
| H4 descripción con Enter | `b487e334` | Guardado/reapertura de dos líneas; UI normaliza CRLF/CR a LF y rechaza otros controles en IPC/SQL |
| H5 cancelar recorte ocupado | `27133332` | Guardia de acciones y botón deshabilitan Cancelar mientras procesa; regresión de la guardia, sin prueba física de worker UI |
| H6 fotos inmutables | `b28cdb4c` + `4e92dbd2` | UPDATE/movimientos y DELETE+INSERT denegados ante policy global adversarial |
| H7 retirada QA | `df21f8c6` + `63b232bc` | Niega falta de consentimiento/perfiles/fotos; retira paquete vacío y conserva cuentas/policies ajenas |

RED→GREEN y logs de esta ronda en `C:/tmp/ola2/1612`. Rust validado
`03068639`: fmt/check/Clippy PASS, Nextest 1672/1672 (7 skips existentes, una
paridad lenta de 123 s), lifecycle 18/18 PASS. Telemetría 25/25 PASS
(corpus largo ACC 898 s, tres tests lentos esperados). Quality y 456 huellas
PASS. SQL `5e380ef0`: 68/68 pgTAP + 9 postchecks de retirada y tres negativas
PASS, PostgreSQL desechable loopback con administrador habitual y con
CREATEROLE sin SUPERUSER. El grant del escritor al administrador permite
transferir ownership; retirada QA con el mismo grantor. [Runbook](../../pilot-profile-backend.md).
Paquete solo preparado, sin aplicar en Supabase. Presupuesto SQL conservador
reserva el máximo de foto dentro de 48 KiB; puede rechazar extensiones cerca del
límite aunque una foto pequeña cupiera, preservando la copia local.

Capturas anteriores y QA de las ocho páginas: `C:/tmp/1612-evidence` (código
`6a5fb75a`); no acreditan el estado ocupado nuevo ni son capturas del HEAD
actual. Sin login/Storage HTTP real, Run/toasts, upgrade ni LMU/ACC físicos;
sin validación compilada del conjunto con #1608. Conserva la separación de
`services/view.rs` y su techo 1750 al integrar ambos PR.

Histórico de ronda 2: push `5e380ef0` verificado; VANTA-9 Por revisar verificado el 14/10/2026
a las 05:10 CEST. El commit de cierre solo cambia handoff/changelog; SHA final
en la issue/PR y buzón `C:/tmp/buzon/1612.md`.
CI se consulta por HEAD final: no se declara verde completa. Nightly remoto
ha avanzado a `552c0d52` por #1607; esta rama conserva la base aprobada
`0807fbd0`, sin merge/rebase ni validación del conjunto nuevo.
Canal alcanzado: rama de issue y PR draft. Sin merge, promoción, release,
producción, instalación/datos reales modificados, herramientas nuevas ni
subagentes. Siguiente: revisión del orquestador; integración y activación backend requieren su
validación/autorización correspondiente de Isaac.
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
