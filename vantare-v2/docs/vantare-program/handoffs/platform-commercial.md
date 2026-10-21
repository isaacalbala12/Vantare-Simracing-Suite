## VANTA-96 / #1713 · Reconstrucción staging autorizada, espera de custodia

El orquestador autoriza copia completa en evidence/supabase-staging, descarte
controlado del historial divergente y reconstrucción97/97 desde el canon.
También autoriza las cinco funciones desde SHA1b732b67d605298f3056c8ca78d692f132217e2d,
solo tras esquema/claves/TPA; después catálogo/webhook sandbox y parada antes de
checkout. Producción intacta. No se repite la solicitud de esas autorizaciones.
Las dos versiones antiguas de roadmap y su ajuste de permisos están exportadas
como sentencias originales y documentadas en INFORME.md externo antes de descarte.
Scripts de backup verificable y reconstrucción transaccional preparados; checkout
pinned independiente. Sin contraseña aún no se ha hecho dump, reset, migración,
importación/rotación QA, TPA ni despliegue. Las claves QA propias sí están listas.
Token presente sigue siendo el antiguo16-oct; webhook sandbox nuevo ausente.
Espera de archivos en secrets, sin imprimir valores ni probar password productivo.
Retorno técnico QA propuesto https://sandbox.polar.sh/, fuera de vantare.app.

## VANTA-96 / #1713 · Preparación QA autorizada, deploy pendiente

Isaac aprueba reactivar/preparar staging y producto sandbox Pro mensual 5,99 EUR
sin trial; correo sintético Owner excluido. Ref rilwmlbnucbbayaulnxw, ya
ACTIVE_HEALTHY. Preflight solo lectura: 14 versiones, dos ajenas al canon
(20260926153706/20260926153853), faltan 85; parar antes de aplicar SQL.
Datos agregados: visual_roadmap=2; solo auth.schema_migrations=82 además de
eso, resto de tablas public/private/auth vacías; cero TPA. No borrar ni
reparar historial sin copia y plan revisado. Objetivo productivo: 97 migraciones.
Contraseña staging ausente; backup/esquema pendientes de acceso. Claves QA
ES256/Ed25519/reconcile generadas protegidas, firma/verificación de ambos pares
PASS, configuración QA separada y SQL issuer enabled=false preparados offline.
TPA/importación de clave/issuer esperan preflight de staging, sin cambios en prod.
Lista pedida antes de deploy: native-account-authorize, native-billing-checkout,
billing-webhook, native-license, billing-reconcile; cinco verify_jwt=false desde
SHA 1b732b67d605298f3056c8ca78d692f132217e2d. No ejecutar hasta autorización.
STAGING-PREPARACION.md y EJECUCION.md externos guardan estado y bloqueos.
No se lee el token/webhook sandbox mientras Isaac los prepara, ni se despliega,
compra, devuelve o cambia flags. Producción intacta y #1732 no desplegado allí.

## VANTA-96 / #1713 · Ensayo elegido: Polar sandbox (21-oct-2026)

Isaac descarta la compra real con devolución. Runbook reescrito para propuesta
Supabase vantare-staging separado (rilwmlbnucbbayaulnxw), todavía pausado según
último inventario; reactivación/despliegue/migraciones/ensayo pendientes de
aprobación explícita. Ninguna variable sandbox se instala en producción.
Producto pro_monthly a 5,99 EUR/mes simulado, sin trial ni descuento; IDs del
mapa sandbox históricos pendientes de validar. Token sandbox en custodia,
GET de producto 403; hace falta ampliar/reemplazar sus permisos.
Ruta app QA → webhook → ledger positivo → licencia QA → refund sandbox y
revocación; correo Owner solo sintético opcional, no aviso por pago correcto.
Claves ES256/Ed25519/HMAC de QA propias; configuración de app y secretos
separados. Lista única para Isaac en docs/billing/runbook-compra-prueba.md.
No se ha reactivado, desplegado, cobrado, hecho refund ni cambiado flags.
#1732 sigue sin desplegar en producción; P3 DeepSeek siguen en #1733.

## VANTA-96 / #1713 · Configuración y ensayo pendientes (21-oct-2026)

Base nightly a2e46c0d8, #1732 integrado pero NO desplegado. No hay nuevas
migraciones, deploys, compras, refunds ni flags cambiados en este tramo.
Cloudflare auditado por nombres: beta sirve vantare.app con ASSETS/WAITLIST_DB;
no le falta ningún secreto obligatorio al master publicado con venta cerrada.
Segundo Worker sin bindings/secretos ni dominio propio asociado; cero Pages.
No se cargan claves privilegiadas de web-compra en una landing que no las usa.
Fuentes web master d9f040ae5 y web-compra 33e27b2ff; faltantes futuros y
custodia por nombre en docs/billing/cloudflare-inventario-20261021.md.

Propuesta de ensayo pro_monthly a 0 EUR, con cuenta QA y descuento/control QA
aprobados, en docs/billing/runbook-compra-prueba.md. No valida devolución de
dinero a importe cero; además el ledger rechaza net_amount=0, por lo que hoy
no valida tampoco el E2E completo de derechos. No se debilita esa regla.
Tampoco promete email Owner por pago correcto: el receptor
actual avisa de incidencias. Se necesita autorizar la vía QA antes de probarla.
Catálogo GET preparado en docs/billing/polar-lectura-pendiente.md: seis productos,
siete precios y cuatro descuentos; token de lectura pendiente, no consultado.
Reconcile cron ya sano (última muestra 18:07:27Z HTTP200), distinto del bloqueo
de lectura de catálogo. Marketing/venta/compensación siguen apagados.
Tres P3 DeepSeek de #1732 añadidos a #1733, incluido el await de hasta 250 ms
dentro del timeout de 8 s y su efecto en reject/uncertain. Diagnóstico solo se
desplegará con autorización separada. Evidencia completa en EJECUCION.md.

## VANTA-105 / #1726 · RC3: consola, reapertura y controles (21-oct-2026)

Encargo urgente de Isaac. Base origin/nightly `946d14fc5`; worktree propio
`C:/VantareServer/wt/isa-1726`, rama `vantareapp/isa-1726-rc3-arranque`.
Código revisado en r2: `073f696241f09dda9e689a70f5281cdc316a85c0`.
Sincronizado con nightly `0b0a8c03d` en `fd08ae5568ac9aba29c4365e9b36284bb0f377cc`.
Esta corrección posterior del handoff solo modifica documentación.
Diagnóstico comunicado antes de editar: los diez PE de RC3 usan consola;
la bandeja reabre Hub sin pipe beta ni rutas y busca un título obsoleto;
la pantalla de acceso retorna antes del chrome con controles Win32.
Services RC3 sí responde Status/AccountPoll/Shutdown con exit0 y permanece
vivo36s en arranque completo sobre escritorio privado (sin SwitchDesktop).
No se ha demostrado un fallo de DuckDB/Supabase ni se ha iniciado sesión real.

Fix: entrada GUI del supervisor `--beta -Root`, motor PowerShell sin consola,
subsistema Windows en procesos automáticos/GUI, contexto de bandeja conservado,
controles comunes en acceso/privacidad/asistente y presupuesto total45s por
respuesta con cancelación, descarte de respuesta tardía y reintento nuevo.
Stderr de runtime/Services/Hub queda en logs de arranque. Sin dependencias nuevas.
Regresiones de PE, destino de acceso, contexto y timeout con reloj inyectado.
PR listo para revisión: https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1729.
Review DeepSeek de7140: NO APTO. Correcciones de esa review: Register tolera
raíz sin estado o sin generación activa (bootstrap anterior); conserva también
la prueba con generación completa. El destino se resuelve una vez por registro,
sin volver a verificar los bytes por cada acceso. NSIS abre el mismo .lnk GUI.
El test llama retry_access real con respuesta IPC; Hub tiene título distinto
al instalador; errores del bootstrap también quedan en bootstrap.log.
Gates locales de `ba762444d`: Clippy PASS1m53, fmt PASS, Nextest2081/2081
PASS (350,5s; incluye telemetría),19 omitidos según perfil; Lifecycle PASS
(Engineer5 + runtime13). Shell30/30 y registro68/68 PASS en usuarios temporales
retirados, con los mismos scripts del código revisado. Clippy del merge
`073f69624` PASS49,18s. Estos resultados no acreditan la suite del HEAD final.
Medición serial de sincronizar tres accesos sobre payload RC3 real, cinco
muestras por versión: mediana3670,89ms en7140 →60,79ms actual (49,03–69,95ms).
Mide la fase de sincronización añadida, no el arranque total ni la validación
previa común de Register. Bytes se validan una sola vez por Register.
QA Win32 en escritorio privado no acredita los controles físicos: Isaac los
comprobará en RC4; la comparación RC3 devuelve regiones cliente sin chrome.
Evidencia: C:/VantareServer/evidence/rc3-bugs/INFORME.md. Procesos de Isaac
intactos y ninguna ventana en su escritorio. La CI del HEAD final está pendiente
de terminar y de verificación por el orquestador, incluidos Nextest y Lifecycle.
El fallo previo de owner-alert-receiver lo corrige nightly #1738/74a508222,
incluido en la sincronización. RC4 espera integración y autorización posterior.
Sin merge, firma, publicación ni promoción.

## VANTA-96 / #1725 · Activación Owner en producción (21-oct-2026)

Autorización expresa del orquestador tras r2 APTO y merge #1727 en nightly
21b1f80129e2ba6a76ec2a8d8d4eab960f9b4056. Única migración pendiente
20261021151230 aplicada de forma incremental, historial atómico: 97/97.
RLS y denegación de acceso directo a inbox/RPC autenticada comprobadas.
Desplegados owner-alert-receiver v1 y billing-reconcile v6 en ese orden;
verify_jwt=false, autenticación HMAC/clave interna conservada.
Variables URL/HMAC/destinatario cargadas por env-file protegido, sin valores
ni dirección personal en documentación. Custodia secrets/owner-alert-prod.

Un aviso sintético con code synthetic_test_vanta96_20261021: receptor 200,
fila sent, attempts=1; replay 200 sin incrementar intentos. El primer Brevo
201 se infiere del código: email_key nuevo y aceptación con messageId;
no hay observación directa del status upstream. No se fuerza otro POST SMTP
para provocar duplicate_parameter; su status real queda pendiente.
Existe además un aviso operativo previo web_erasure_worker_stale: su correo
es real, independiente del único fixture sintético. No se borra ni oculta.
Venta, marketing y compensación siguen cerrados. Cron y estado definitivo
se documentan en evidence/supabase-reconstruccion/EJECUCION.md y #1725.
P3 r2/r1 abiertos en #1733; no implementados dentro de esta activación.
Reversión: retirar BILLING_OWNER_ALERT_URL; conserva outbox/inbox y HMAC,
sin revertir ni borrar datos. El emisor puede seguir reconciliando sin correo.
Este PR de evidencia no hace otro despliegue ni promociona canales.

## VANTA-96 / #1730 · Diagnóstico seguro de checkout (21-oct-2026)

Actualización de PR #1732: merge de nightly21b1f8012 (#1727) sobre el HEAD
revisado060340019. Conflictos del arnés y de este handoff resueltos conservando
ambas suites y ambas entregas; sin cambiar la lógica de checkout. CI y HEAD
definitivos se verifican en #1730; no se fusiona el PR ni se despliega.
Validación local tras resolver: 80 tests Deno PASS (Polar/checkout/portal y
Owner/reconcile), AST Python, quality y diff check PASS. Ensayo PostgreSQL
completo LF/CRLF pendiente de la CI del nuevo HEAD.

Rama propia vantareapp/isa-1730-polar-checkout-diagnostic desde nightly946d14fc5.
Se añade log de rechazo con status, clave lógica, error/type y detail loc/type/msg,
listas cerradas contra PII y límites de lectura/tiempo/tamaño. No se registra
input/ctx/cuerpo/email/customer ni se devuelve el diagnóstico al cliente.
5 regresiones nuevas, incluidas privacidad y payload real standard con/sin email.
El arnés comercial las incorpora sin modificar workflows ni checks requeridos.
Contrato API2026-10 revisado: products:[id] y demás campos standard admitidos;
no se detecta campo obsoleto y no se cambia payload por una hipótesis.
Catálogo draft/archived aún no comprobado; token de lectura pendiente.
Sin deploy, migración, compra real, flags, merge ni publicación. Resultados
finales de CI, SHA y PR se verifican en #1730. Runbook polar-checkout-diagnostic.md.

## VANTA-96 / #1725 · Avisos Owner por email (21-oct-2026)

Base nightly946d14fc5, rama propia vantareapp/isa-1725-owner-alert-email.
Receptor HMAC/timestamp, inbox privada durable antes de email/ACK, dedupe por
entorno/tipo/hash, leases y ACK cercado; Brevo transaccional sin PII compradora.
Reintentos del reconcile existente; errores no confirman ni pierden la outbox.
Corrección de review #1727: hash de incidente con código e intento financiero
existente, expuesto por la RPC operativa; regex de código común a emisor/SQL.
Brevo 400 duplicate_parameter confirma el email_key ya aceptado, con finish
durable obligatorio. Tras TTL se acepta como mucho un duplicado excepcional
si se pierde el ACK, por decisión del orquestador para este correo interno.
Regresiones de incidente nuevo/repetido, código numérico, ACK perdido y finish
false; el arnés incluye SQL, carrera real y ensayo LF/CRLF. Resultados y SHA
definitivos se verifican en #1725; P3 restantes son seguimiento del PR.
Local: 15 tests Deno del receptor + 14 del emisor PASS; fmt, diff y quality PASS.
SQL Owner ampliado a 27 aserciones; su resultado LF/CRLF se verifica en la CI.
No workflows existentes modificados, no dependencias, Rust ni producto nativo.
No desplegar/configurar URL/secreto ni enviar email real antes de revisión.
Pasos de activación/reversión en docs/billing/owner-alert-email.md.
Operación Polar/Cloudflare y propuesta compra: evidencia externa EJECUCION.md,
issue #1713; no se mezcla con esta migración. Venta/marketing/compensación OFF.
PR #1727 a nightly; sin merge, release ni activacion productiva.

## VANTA-105 / #1723 · Dos P3 de review1721, separados de RC3 (19-oct-2026)

Base nightly997d6da68 con #1721 integrado. Rama/worktree propios
vantareapp/isa-1723-installer-rechazos / isa-1723; productor RC3 isa-1722 intacto.
Read-NativeManifest usa CmdletBinding: parámetros mal escritos fallan por binding.
Reject-History exige la causa concreta; valida mensajes exactos de los throws
sin tipo específico, y NamedParameterNotFound para el error de binding tipado.
Dos regresiones nuevas: -Instaled rechazado y excepción ajena que no puede hacer
pasar un negativo. No se amplía la lista de versiones ni cambia el inventario.

AST PowerShell y diff sin errores comprobados. La build RC3 tiene prioridad;
pruebas locales de comportamiento tras ella, en serie. PR draft separado para CI;
estado/HEAD/checks y evidencia se verifican en #1723 y evidence/1723/INFORME.md.
No Rust/workflows/configuración/backend ni otros P3 de la review en este alcance.
Sin merge, firma ni publicación. El orquestador retira el target de RC3.

## VANTA-105 / #1720 · Compatibilidad de inventarios instalados (19-oct-2026)

Corrección autorizada tras el fallo RC2 #1719. Rama/worktree propios
vantareapp/isa-1720-upgrade-inventario-historico / C:/VantareServer/wt/isa-1720,
base nightlyc48b4847d. Sin merge, promoción, firma ni publicación.
RC2 y sus bytes no se modifican; RC3 solo tras revisión/merge del orquestador.

Read-NativeManifest admite -Installed solo en consumidores de generaciones
existentes: estado/previous, Probe de Setup, actualización, repair, rollback,
registro, feed y archivo de perfiles. Se admite la lista beta congelada de91
miembros para0.0.975–0.0.979, además de la actual. No cualquier subconjunto.
Expand-NativePackage/build conservan109 obligatorios; no cambian hashes,
sidecars, reglas de rutas/canal ni locks. ImportProfiles copia la lista del
manifiesto validado antes de bloquear los binarios, sin exigir recursos nuevos.

Fixture: manifiesto público real975, SHA4fc39c73a4660a3c859638d8078c97b30b732048f70ed72f5535d8ec12cc9219.
ZIP público372bcd60cf168cb6187be1c481b21c835268db1dbcc3e0a0aeb17246bede7066;
Setup públicoe0d1aafbbaf338b54709ed95c0dd6abf62ab352878dea24b770c8f7e114c61de.
La fixture conserva sus bytes CRLF por atributo específico, sin cambiar otras
políticas Git. Procedencia documentada en packaging/fixtures/README.md.
La nueva suite se ejecuta desde build-inventory-tests, ya en workflow requerido;
prueba inventarios dañados/desconocidos y rechazo del ZIP histórico entrante.
Modo offline con PE inertes; modo local opcional con todos los ficheros975 reales.
No ejecuta EXE de app ni acredita Hub/GPU/login.

Evidencia local C:/VantareServer/evidence/1720: baseline reproduce el rechazo
original; fmt PASS, registro66 y shell23 PASS en cuentas/escritorios privados.
La regresión ampliada del manifiesto/upgrade/import/rollback/reinstall/uninstall
pasa32 comprobaciones, incluidas las del payload público completo975.
SHA final, PR y checks se registran/verifican en la issue #1720.
Sin Rust modificado: check/Clippy/Nextest/lifecycle completos se verifican en CI.
Los fallos iniciales de aislamiento/harness se conservan, no se ocultan.
Sesión Codex con esfuerzo fijado por el harness; no permite seleccionar high.

Siguiente paso: revisar y fusionar solo con CI requerida verde; después RC3
y campañas reales OFF, ON y upgrade975 hasta desinstalar. El target1719-rc2
queda a cargo del orquestador; no se toca, tampoco target1694-hub ni #1698 draft.

## VANTA-96 / #1711 · account_id sin FK (19-oct-2026, en curso)

Encargo del orquestador para P2-1 de la review APTO de #1705. #1705 integrado
por el orquestador en nightly39a788238; esta rama parte de ese merge.
Rama propia `vantareapp/isa-1711-account-id-barriers`.
Después se integra nightly147372fa9 (#1708/B01): arnés automezclado; único
conflicto documental resuelto conservando ambas secciones. Repetir ensayo
sobre la unión real ES256/P2; el resultado anterior es previo a B01.
Inventario ampliado: account_id es raíz aunque no tenga FK; también se recorren
sus descendientes y se exige que la columna esté compilada en el guard.
Prueba negativa en transacción con tabla nueva sin FK y descendiente nuevo.
El primer ensayo descubre además lifetime_order_admissions,
founders_subscription_transitions y web_purchase_erasure_events. Se amplía #1711
con el hallazgo real: siete guards directos, incluida lifetime_order_admissions.
founders_subscription_transitions es deber de cancelación: el ACK tardío debe
seguir completando una orden ya enviada. Excepción exacta con prueba de ACK
tras borrado, fencing por revisión, imposibilidad de crear trabajo nuevo y ACL.
El stream web es deber creado después del tombstone, con ACL cerrada/pull
acotado/ACK con prueba independiente; excepción exacta y regresión real de
enqueue/pull/ACK/reintento tras borrado, sin excluir sus descendientes.
Sin cambios de ACL/FK, borrado de historiales ni parche del guard común.
Se añaden siete carreras reales, regresión de UPDATE/reasignación/historial y
las suites existentes de renovaciones e incidencias para los escritores reales.
Ensayo anterior PASS en run39175662567, implementación6872cfc48: LF y CRLF
exit0; 94 migraciones, 23 suites/758 pgTAP, 131 rutas/778 comprobaciones de
carreras, JWT/PostgREST y Ed25519. Artefactos descargados y bytes de las 94
fuentes comprobados en ambos formatos. Ese ensayo precede al ajuste del deber
de cancelación y a B01; evidencia definitiva del HEAD actual en PR/issue #1711.
PR #1712 a nightly: workflow comercial LF/CRLF y CI consultables en
https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1712.
Siguiente paso: revisión del orquestador tras validar el ensayo; sin producción,
sin cambios propios de B01, merge a nightly ni promoción de canal.
Evidencia: evidence/supabase-p2-account-id.

## 2026-10-19 - #1704 / VANTA-96: integrar workflow real de #1702

- Orquestador ordena merge origin/nightly 39a788238 en #1708 antes de #1710, sin rebase ni force-push.
- Se conservan ambos handoffs al resolver el unico conflicto documental; arnes combinado mantiene ES256/JWKS y las carreras/fixtures de #1702.
- Se admiten --docker y --migration-newlines en el modo aislado --b01; no se permiten controles historicos en ese modo.
- Siguiente gate: CI completa del merge, con PostgreSQL/PostgREST real LF y CRLF, legacy tester 200, aislamiento y tombstone. No declarar PASS antes del resultado.
- #1708 sigue draft hasta todos los checks verdes. No hay merge a nightly, produccion, importacion de clave, deploy ni release.

## #1704 / VANTA-96 - Bridge B01 ES256 (19-oct-2026)

Encargo explicito del orquestador: opcion (b), sin tocar produccion. Base
inicial origin/nightly 999d5950745f73be0e38a1763422f53b515c6866; worktree
C:/VantareServer/wt/b01-es256. Rama autorizada corregida:
vantareapp/isa-1704-b01-es256. #1706 cerrado, sustituto **PR draft #1708** a
nightly: GitHub no permite cambiar la rama origen del PR. Sin force-push.
Issue #1704, area:plataforma, Project Vantare, milestone Plataforma testers.

Authorize firma ES256/kid desde NATIVE_DATA_ES256_PRIVATE_JWK; report-submit
verifica solo la publica NATIVE_DATA_ES256_PUBLIC_JWK. Sin fallback HS256.
Claims B01/TTL, Rust y SQL/RLS conservados. Generador PowerShell CreateNew con
ACL protegida/modo0600 y publica separada. Par TEST generado -> firmador y
verificador reales PASS; archivos TEST eliminados. Runbook native-data-es256.md
explica importacion (requiere privada), autoridad de proyecto y reversion.

Codigo probado 53102e1dafe889664494d4f1d2b19c115939ed23; handoff99f08e74f.
Deno repetido en rama corregida: 79 PASS / 2 integraciones omitidas. Generador
protegido Windows PASS; fmt/lint/type-check del cambio y huellas462 PASS.
Tipos Deno globales existentes en #1707. El rechazo anterior de nombre queda
resuelto: la politica local acepta la rama con numero. CI nueva #1708 en curso;
no atribuirle los checks del PR cerrado aunque comparta SHA.

Orquestador indica esperar al workflow PostgreSQL/PostgREST real de #1702 en
nightly y entonces **mergear origin/nightly en esta rama**, sin cherry-pick ni
force-push. El Mac de Isaac esta dormido; no es requisito despertarlo. Arnes
--b01 preparado con JWKS publico ES256 efimero; todavia no ejecutado. Revisar
compatibilidad de sus opciones con el workflow al incorporarlo. La matriz
comercial general se conserva y tiene seguimiento #1702.

Review de seguridad C:/VantareServer/evidence/rev-1708/INFORME.md: APTO en
codigo sobre e24272eae, sin P1; no autoriza activacion ni ready. Correcciones
P2-1/P3 del mismo encargo: la RPC legacy testing_center_submit_report mantiene
EXECUTE authenticated + SECURITY DEFINER + membership tester. El test vuelve
a esperar 200 con justificacion SQL, comprueba reporte propio/aislamiento y el
arnes HTTP incluye envio y rechazo tras tombstone. Confirmacion real pendiente;
posible salto de admision legacy separado como investigacion #1709, sin cambiar
permisos del producto. README sin comandos antiguos de secretos/deploy y con
JWKS publico ES256; los dos documentos de contrato ya describen ES256/kid.
Deno repetido 79 PASS / 2 omitidos, lint/fmt TS, Python compile y huellas462 PASS.

Mantener #1708 draft hasta arnes real y CI verde sobre el HEAD definitivo;
entonces marcar listo, actualizar issue/handoff/Plane y avisar al orquestador.
T3 no permite watch desde subagente: el seguimiento persistente corresponde al
padre. VANTA-96 sigue En curso. Sin merge a nightly, promocion, release,
importacion/rotacion, deploy ni cambios productivos. Confianza gestionada aun
requiere autorizacion explicita y prueba real de Isaac.
## VANTA-96 / #1702 · Cierre de carreras comerciales (19-oct-2026)

Encargo del orquestador desde nightly999d59507 (#1703 integrado). Rama propia
`vantareapp/isa-1702-write-races`. Baseline reproducido: 633 PASS/9 FAIL.
Diagnóstico: las tres aserciones inbox-checkout usan una fixture sin dispatch
v2; cuatro tablas admin tienen guard pero no ruta en la matriz; once tablas
privadas posteriores necesitan guard y dos relaciones son excepciones legítimas
(cola de borrado tras tombstone y aprobador histórico de campañas).

PR #1705 a nightly: migración nueva, quince rutas reales y regresión SQL de continuidad
de campaña/borrado/ACL/transferencia de dirección; fuentes LF/CRLF explícitas.
Detalle por aserción y tabla en `docs/billing/write-races-1702.md`. No se elimina
el gate. Ensayo completo LF/CRLF exit0, run39172498786, implementación d47ecf94b:
93 migraciones, PostgreSQL17.6, 20 suites/588 pgTAP, 123 rutas/728 checks por
formato, borrado concurrente 4 escenarios/40 checks, JWT/PostgREST y Ed25519.
Control RED detecta 0/11 barreras sin la migración. Artefactos descargados;
bytes LF/CRLF comprobados para las 93 fuentes de cada formato.
Por encargo adicional, workflow NUEVO `supabase-commercial-gates.yml` para PR
a nightly con cambios supabase/**: imagen Supabase17 fijada, PostgREST, Deno,
control RED y arnés completo LF/CRLF con HTTP. Los workflows existentes y checks
requeridos quedan intactos. El Mac está dormido; ensayo en runner hospedado.
CI del HEAD final y revisión se consultan en
https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1705.
Siguiente paso: revisión del orquestador; no hay merge ni promoción de canal.
Evidencia externa en `C:/VantareServer/evidence/supabase-write-races/`.
Sin producción, secretos, proveedores, merge, release ni cambios nativos.

## VANTA-96 / #1701 · Ensayo de reconstrucción Supabase (18-oct-2026)

Isaac confirma que producción no contiene usuarios/compras reales y dispone de
copia diaria. El inventario agregado por Management API read-only encuentra 8
cuentas Auth, 8 perfiles, 3 clientes y 3 suscripciones; pedidos/refunds/inbox vacíos.
También hay 2 asignaciones operativas, 2 calendarios y 68 publicaciones roadmap.
Son datos que requieren backup y decisión de conservación/regeneración; el conteo
no identifica cuentas ni demuestra por sí solo su naturaleza de prueba.

Desde nightly `bf5dc5b6295c0a6d491f8ee53e9552f07d798c48`, las 92 migraciones
se aplican en Docker Supabase PG17.6.1.165. Se corrige un fallo limpio CRLF en
`20261015091000_isa_1608_admin_deleted_reads.sql`: la declaración de la variable
de bloqueo ya no depende de LF. Regresión real: original CRLF exit1; corregida
85 pgTAP PASS. Ensayo LF final: 434 pgTAP y E2E de correo con PostgreSQL real y
proveedores dobles PASS. Arneses comerciales completan 92 migraciones y 574
pgTAP, pero el gate posterior de carreras termina con 633 PASS / 9 FAIL;
seguimiento separado #1702, sin debilitarlo. No declarar producción lista.

Limpieza/reaplicación local: conserva 8 Auth sintéticas, aplica otras 92 y recupera
DDL/owners/ACL equivalentes; el generador canónico cambia el orden de operandos
UNION de las barreras, documentado en comparador. `db reset --linked` descartado:
trunca Auth y borra policies globalmente. Plan externo limita la limpieza a app,
retira por API los dos buckets de app tras guardar bytes y preserva internos.

Entrega: `C:/VantareServer/evidence/supabase-reconstruccion/INFORME.md` y `PLAN.md`,
inventario sin filas/PII/valores secretos, logs y SQL propuesto con guardas. B01
lo investiga otro worker. PR draft #1703 a nightly, registrado en el hilo; CI del
commit de código 35f6fe138 con cinco checks SUCCESS (18-oct 21:52 UTC). Pendiente
review del orquestador, resolución #1702, contraseña
DB y backup restaurado, secretos de Clerk/Brevo/operación, despliegue y schedulers
autorizados. Sin producción, merge, release, envíos, compras ni refunds reales.

## #1695 / VANTA-105 · Seguimiento activo desde nightly95c08834b

El orquestador confirma #1696 integrado en nightly95c08834b y ordena retomar
este PR separado. Rama vantareapp/isa-1695-installer-transaccion, worktree propio
isa-1695. PR #1699 READY, código8ecdde066 subido; CI remota pendiente, sin merge. WIP propio preservado en commit5c6121d61; merge949b4f5c7 de nightly,
sin rebase/force-push. Conflictos documentales conservan ambos expedientes.
#1698 sigue DRAFT e8cf16e6a hasta revisión con Isaac; no se toca su workflow.
Target1694-hub queda exclusivamente a cargo del orquestador, no se toca.

Rollback beta intenta cada archivo y registra fallos, conservando el error
original. Estado primero; limpieza conserva generaciones referenciadas o todas
si falla comprobar estado/enumeración. Snapshot inicial no legible aborta antes
de activar. Desinstalación mantiene beta-session.lock hasta registro y marker;
Cleanup lo adquiere para retirar EXE/marker, y Setup recupera huérfanos bajo lock.
Programs vacío falla con diagnóstico antes de Join-Path; ON con carpeta vacía
advierte sin abortar. Suite shell añadida al workflow Windows bloqueante.

MSIX se documenta fuera de RC1/beta26-oct, sin habilitar Store ni cambiar su
builder experimental. Setup/Uninstall usan la misma guarda real de imports
que el payload, incluida cabecera PE. CRT24 PASS: build/metadata satisfactorios
llegan a la guarda dentro del builder, rechazan PE dinámico antes de copiarlo;
builder de Setup real rechaza cada entrada dinámica y acepta ambas estáticas.
Compilación sustituida por PE C inertes, sin ejecutar esos binarios.

Primera campaña PS5.1 privada PASS: registro65, shell23; SID1029/perfil retirados.
Campaña final PASS: registro66 (incluye lock del driver real) y shell23; SID1030/perfil retirados, DACL restaurada. CRT24 e inventario14 finales PASS.
AST/YAML/diff/462 huellas PASS. No Rust/Cargo/toolchain alterados: gates Rust
los verificará la CI existente; las regresiones locales son scripts/procesos,
registro/COM/NTFS y PE reales. PR #1699 preparado; no declarar CI verde hasta comprobar los checks del HEAD final.
P2-1 real ya PASS con Setup nuevo de nightly7396, SHA bec8d3bb4394543169561cad07965987615e13914b6bdd00cd075dc80289e913;
OFF limpio, reinstalación ON y NSIS0.0.975→OFF, sin crear Startup en el actor.
Esta build histórica no contiene P2/P3 nuevos; no se mezclan sus resultados.
Informe C:/VantareServer/evidence/rc1/seguimiento-1691/INFORME.md.
Sin configuración beta: login/pagos sin probar. Sin firma/publicación/merge.

## #1694 y propuesta #1697 · Entrega a revisión (2026-10-17 08:57:27 UTC)

Verificación final 2026-10-17 08:57:27 UTC : PR #1696 READY, OPEN y MERGEABLE en e2fafdecbe4365acb86faf19915b4478f70df598. Cinco checks SUCCESS, incluidos los dos requeridos: Validate promotion path y Validate Vantare blocking gates. Run https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/39018399770 . Sin merge por el worker; listo para review del orquestador. Hub-ready sigue NO acreditado (DirectX0x8007000E en desktop privado), sin firma/publicación.

PR #1698 sigue DRAFT y MERGEABLE en e8cf16e6a5011b7deff0412313adc7d56f06e52a, también cinco checks SUCCESS (run39018263649). Estos checks existentes NO prueban el job propuesto ni hub-ready en hosted; la propuesta permanece omitida mientras draft y depende de #1694 integrado. No se cambia a ready.

## Ampliación autorizada tras review #1693 (17-oct, VANTA-105)

#1694 / PR #1696 sigue primero. Después, en este mismo PR de seguimiento de los puntos 2–4:

- CRT-P2-1: revisar native/packaging/msix/build.ps1:50, que aún compila sin target explícito/crt-static/guarda de imports. Alinearlo con candidate.ps1 o documentar explícitamente que MSIX no se usa en este lanzamiento; hoy es ruta local experimental, sin envío a Store.
- CRT-P3: añadir una regresión que recorra el builder con cargo satisfactorio y artefactos/metadata válidos, hasta la guarda real de imports. Debe detectar un EXE dinámico dentro del builder; el mock que siempre devuelve17 no cubre ese paso.
- CRT-P3: reutilizar la guarda de imports en Setup y Uninstall, además de la cabecera PE, con prueba que detecte un binario de entrada dinámico.

Referencia: C:/VantareServer/evidence/rev-1693/INFORME.md (review APTO). Este encargo no añade los demás P3 de la review ni cambios de toolchain. #1693 ya integrado en nightly64dc28446 por el orquestador. Al retomar, actualizar la base mediante merge sin rebase/force-push y preservar el WIP propio de esta rama. No se ejecutan aún estos cambios: primero #1694 y la propuesta draft de QA Windows #1698.

## #1694 / VANTA-105 · Recursos de arranque (17-oct-2026)

PR #1696, rama vantareapp/isa-1694-recursos-arranque. Base7396f65d0;
merge de nightly64dc28446 (CRT #1693 ya integrado por el orquestador), sin
rebase/force-push. Conflicto solo de handoff resuelto conservando ambos informes.
Inventario cerrado completo: 17 secuencias aprobadas y snapshot Session Alerts.
Release resuelve solo bin/fixtures, sin fallback al checkout; Debug lo conserva.
Workshop sigue siendo entidad de la shell: distribuir sus recursos públicos
versionados evita cambiar navegación/estado para resolver este bloqueo.
Auditoría sistemática en native/packaging/startup-resources.md.

Hub Release real recompilado; check y Clippy -D warnings PASS, fmt/inventario14,
AST/diff/462 huellas PASS. Nextest final: 522/522 PASS, 4 omisiones previas,
113,646s; Storage hermano real compilado con DuckDB de desarrollo tras detectar
su ausencia en el primer intento. Sin omitir ni debilitar el test afectado.
Setup QA productor91744adb4, SHA
1241f57869627e5f4959d3c90c30f64ffffb7151b187293ee2fb97b40ac6b54c.
Hub/Setup nuevos y otros nueve EXE f68e4a3db con Rust/lock idénticos verificados;
PROCEDENCIA.json distingue cada productor. No es build beta pública completa.
Artefactos y sidecars en share/rc1/hub-1694, RC1 original conservada.

Cuatro campañas con usuarios estándar privados: faltan escena/directorio → exit1
sin ready; paquete completo supera recursos y falla en DirectX resources:
0x8007000E, exit1/00000001, sin hub-ready ni terminación forzada. Stderr completo
conservado; cuentas/perfiles retirados y DACL restaurada. Sin ventanas ni procesos
alterados en la sesión de Isaac. Desactivar DirectComposition tampoco resuelve.
El orquestador autoriza entregar #1694 con este límite: probablemente entorno
GPU/memoria de escritorio del servidor; no es prueba de defecto del producto.
Hub-ready sigue pendiente. No hay otra VM/PC autorizado; propuesta aparte
#1697 / PR draft #1698 para Windows hosted y pasos físicos para Isaac.
Informe C:/VantareServer/evidence/rc1/hub-1694/INFORME.md.
Regresión final SID1028 valida también la causa de ambos negativos y captura
stderr UTF8; mismo fallo DirectX. Target D:/VantareServer/targets/1694-hub
sin compilación activa: borrado literal rechazado por revisión automática
(blocked by policy), pendiente de limpieza por el orquestador.
Sin configuración beta: login/pagos sin probar. Sin firma/publicación/merge.

P2-1 de #1695 ya acreditado con Setup nuevo de nightly7396f65d0, SHA
bec8d3bb4394543169561cad07965987615e13914b6bdd00cd075dc80289e913. Tres usuarios
sin Startup: OFF limpio, reinstalación ON (preferencia guardada) y NSIS0.0.975
→nuevo OFF; actor nunca crea Startup/Desktop, datos conservados y SID/perfiles
retirados. Informe seguimiento-1691/INFORME.md. La QA histórica de RC1 no acredita
el arreglo. P2/P3 de #1695 siguen WIP aislado, sin PR; se retoman después.

## #1692 / VANTA-105 · CRT de distribución (17-oct-2026)

Actualización de integración: el orquestador fusionó #1691 en nightly
`7396f65d0`; se incorpora mediante merge a #1693, sin rebase/force-push.
Se conservan las suites CRT y registro y ambos expedientes; CI del nuevo HEAD
pendiente. La evidencia del payload sigue ligada al productor f68e4a3db.
Tras el merge: CRT17 y registro42 PASS en PS5.1; AST/diff/462 huellas PASS.
Shell adicional bloqueado por acceso QA1492 preexistente en Startup: la guarda
lo conserva. No se borra ni se afirma PASS; log merge-shell-tests.log en crt/.
Seguimiento autorizado [#1695](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1695):
Setup nuevo desde nightly, Startup ausente OFF/ON sin crearla en el actor;
después rollback por fichero, lock de desinstalación y P3 en PR separado.
La QA histórica con Startup creada y Setup antiguo no acredita el arreglo.

Encargo posterior a #1690, cuyo PR #1691 quedó ready con cinco checks verdes
en `a99f560c1` (run39007794185), sin merge por el worker. #1692 usa rama/worktree
propios `vantareapp/isa-1692-crt-estatico`, isa-1692, base nightly `329520c20`.
La inspección nueva de RC1 confirma vcruntime140 en diez EXE; Storage añade
msvcp140 y vcruntime140_1. Inventario exacto y SHA en
`C:/VantareServer/evidence/rc1/crt/imports-rc1-rechecked.json`. No se incluye
redistribuible. Setup/Uninstall sí eran estáticos; el payload no lo era.

Propuesta acotada al builder: target Windows explícito, crt-static solo para
distribución y flags del llamador restaurados. DuckDB bundled conserva su
contrato y cc1.5.1 elige /MT; no se cambian toolchain/lock, configuración global,
dependencias ni DuckDB precompilado de desarrollo. Guarda dumpbin sobre cada
EXE distribuido, antes de ejecutar/copiar; imports normales y diferidos.
PR [#1693](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1693).
Productor limpio `f68e4a3db`: Release completo por cola MIN_GB=0/jobs2,
27m45s de Cargo; diez EXE reales pasan de importar CRT dinámico a cero.
Suma EXE 103.861.760 → 106.403.328 bytes; paquete SHA
`7402344778e5442dd8626eb2de2f0b629f157145ea8ee0cfe041dc4017548a3c`.
CSV por EXE con DLL exactas/SHA, dumpbin y parser PE independientes en
`C:/VantareServer/evidence/rc1/crt/`. Objeto DuckDB real acredita libcpmt/LIBCMT.
17 regresiones PS5.1 PASS; CI del productor cinco SUCCESS (run39009881804).
Storage distribuido escribe/cierra/reabre readonly y recupera mismos datos,
exit0. Nextest Release estático de Storage 19/19 PASS, cero omitidos, 15,943s;
WAL tras matar escritor, rollback y bloqueo entre procesos. Log en INFORME.md.
Target propio `D:/VantareServer/targets/crt-1692-payload` sin compilación activa:
su borrado literal fue rechazado por revisión automática (blocked by policy);
queda pendiente para el orquestador. Sin native/target ni caché en evidencia.

Dos usuarios estándar nuevos en escritorios privados: veinte --version exit0.
Hub original y estático salen1 por escena ausente
`standings-design-system.sequence.json`, sin marker. Hallazgo separado
[#1694](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1694),
pendiente de asignación por el orquestador, no corregido en este PR.
Supervisor detecta instancia existente; stop AccessDenied. Ningún proceso de
Isaac detenido. Ambos usuarios/perfiles retirados, escritorio/DACL restaurados.
El servidor ya tiene las DLL (14.51.36247.0): no equivale a Windows limpio.
UCRT es parte del Windows objetivo, diferente del redistribuible VC Runtime.
Referencias: Rust Reference linkage, docs de cc1.5.1 y Microsoft Universal CRT,
en `C:/VantareServer/evidence/rc1/crt/INFORME.md`. Configuración beta ausente:
build QA local sin servicios, login/pagos sin probar, no candidata publicable.
Sin nuevo Setup, firma/publicación/merge; share/rc1 histórico conservado.
HEAD documental final requiere CI propia antes de ready; no se confunde con
el productor del payload f68e4a3db, cuyos cinco checks ya pasaron.
## #1690 / VANTA-105 · Startup ausente y finalización de Setup (17/10/2026)

Hallazgo bloqueante de la QA local RC1 #1688; el orquestador confirma que
continúa bajo VANTA-105. Rama `vantareapp/isa-1690-startup-ausente`, worktree
propio isa-1690, base `origin/nightly@5e5c4d1854988604664c518c68beb31a27d2704c`.
PR separado [#1691](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1691),
implementación `67be3b9b55dea9ce7ba7c09d94eb65552ff7addb`. #1689 ya integrado
por el orquestador: merge de `origin/nightly@329520c20` a esta rama, sin rebase.
Conflictos solo en workflow/handoff: se conservan ambas suites con sus gates
y ambos expedientes completos. CI pendiente del nuevo HEAD, registrado en #1690.
CI `85f8777cd`/`25598a834` falla en el fixture: exit5, cancelación previa a copiar.
.NET Framework antepone BOM de Console.InputEncoding al crear stdin del hijo;
se reproduce localmente con UTF8-BOM. El harness selecciona UTF8 sin BOM solo
durante Process.Start y restaura la codificación del llamador, enviando los
mismos bytes ASCII de Rust. Regresión fuerza padre UTF8-BOM; no se relaja el
acuse exacto del motor ni se cambia producción para hacer pasar este fallo.
Sin merge del PR hacia nightly, firma ni publicación por el worker.

Desktop/Startup OFF no consultan carpetas ni COM. ON usa la ruta configurada
por Windows y crea la carpeta ausente; si no se puede, avisa y conserva lo
ajeno sin abortar. Apagar una opción antes activa retira solo el acceso propio
anterior; desinstalar no exige carpetas de opciones que nunca se activaron.
Setup finaliza el registro bajo beta-session.lock. Ante excepción posterior a
copiar/activar, restaura valores/tipos del registro, bytes de accesos y
metadatos/bootstrap y estado anterior; elimina solo la generación nueva.
Los datos originales y los datos conservados tras desinstalar se preservan.
No añade recuperación durable ante corte de energía ni puede garantizar
restauración si Windows impide también escribir los datos anteriores.

Regresiones PS 5.1 `installer-registration-tests.ps1`, llamadas por
`installer-tests.ps1` y por el gate Windows requerido: resolver que rechaza
consultas OFF, carpetas ausentes/bloqueadas, COM real y PE inertes no ejecutados.
Fallos reales de compartición después de activar/escribir para instalación
nueva, actualización y adopción de datos; driver real instala en silencio y
falla después al registrar una reparación con el bootstrap bloqueado, dejando
exactamente el estado anterior y sin marker de arranque pendiente.
Registro/driver: 42 PASS (incluida entrada UTF8-BOM); shell existente: 23 PASS; quality: 462 huellas PASS;
AST y diff PASS. Los avisos del driver van al log, dejando stdout solo para
eventos JSON. Los accesos opcionales se sincronizan tras la última escritura
obligatoria: ni su resolución ni su copia de seguridad pueden abortar Setup.
No cambia Rust/dependencias ni auth; no compila Rust localmente: la CI requerida
ejecuta sus gates. No se abren Hub ni UI en la sesión principal, no se crean
cuentas ni targets. Configuración beta, Hub, login, pagos y Windows limpio
conservan los límites del informe RC1; no se reconstruye una candidata pública.

## #1688 · VANTA-105 · Entrega local de mecánica (17-oct-2026)

**QA local condicional PASS; NO candidata beta publicable.** El orquestador
permitió probar sin config remota. BuildConfig ausente es soportado por Services;
no se inventan valores ni se usa producción. Login/pagos no probados, Hub no
acreditado en desktop privado y Windows limpio pendiente. Sin firma/release.

Productor limpio `67f74b6050a9453feb3aa04bb8c5629677e3d712`, base nightly
`5e5c4d1854988604664c518c68beb31a27d2704c`, rama
`vantareapp/isa-1688-candidata-rc1-buildfix`, worktree aislado
`C:/VantareServer/wt/isa-1688-rc1-build`. Release 0.0.979, designación
RC1-LOCAL-QA-MECHANICS-ONLY, sin configuración de servicios. Setup en
`C:/VantareServer/share/rc1/`, aviso SOLO-QA-LOCAL y sidecars verificados.
SHA Setup `5cd546de0c0f519d11f8f774a27d9270fd4873fabf7260171181d464c720ecbf`;
67.328.512 bytes. PROCEDENCIA.json e INFORME.md en `evidence/rc1/`.

Release inicial compila en28m14s pero packaging bloquea dos bins QA privados
no contemplados. Arreglo mínimo cerrado de inventario en PR draft
[#1689](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1689):
reconoce ambas herramientas al compilar y mantiene diez EXE públicos; bins
privados fuera de todos los canales. No admite desconocidos/ausentes/duplicados.
Regresión PS5.1 10, canales45 e integridad462 PASS; test en check Windows.
ZIP real verificado10 EXE, sin QA privada/admin/Workshop/instaladores.
CI del productor67f74b605: promotion path y blocking gates SUCCESS (run
39000132766), además quality/marketing/GitGuardian. HEAD documental final y
sus checks se registran por separado en issue/PR; ningún merge desde el worker.

Dos recorridos con SID/perfil nuevos y carpetas Windows inicializadas: limpio
0.0.979→reinstalar (generación distinta)→desinstalar, y NSIS público0.0.975→
Setup0.0.979→desinstalar PASS. Exit0, versiones/registro/Uninstall propios,
bytes opacos con hash idéntico, sin state/EXE/marker al terminar. Son pruebas
reales /S; no se simula hub-ready. El mismo Setup/hash se usa en ambos casos.
Evidencia `clean-VantareRC1_10bd01d`, `upgrade-VantareRC1_11ea3ff`,
`final-verification.json`; control NSIS separado también conserva datos.

Límites: sin Sandbox (Disabled/EXE ausente); W11Pro22631/SO/GPU/drivers
compartidos. Primera prueba sin Startup devuelve exit1 incluso con autostart
OFF: [#1690](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1690)
para triage, sin arreglo aquí. Crear la ruta devuelta por Windows permite
la mecánica, NO resuelve el defecto del producto. Hub nuevo no acreditado:
bootstrap termina sin marker nuevo; no se determina causa en este entorno.
Setup/Uninstall CRT estático y System32 PASS, pero diez EXE de app importan
VC Runtime; Windows limpio y sus prerequisitos siguen pendientes. Tampoco
se acredita feed firmado, navegador/SmartScreen, login, pagos ni DPI físicos.

Cuentas/perfiles propios y ambos targets D `rc1-1688-{payload,installer}`
retirados y verificados; logs/datos fixture preservados. Sin targets ajenos
borrados ni app visible en desktop principal. Siguiente del orquestador:
review #1689, triage #1690, config beta pública real y QA conectada/Hub en
Windows limpio antes de candidata pública. Lista de nombres requeridos en
CONFIG-PUBLICA-PENDIENTE.md; VANTA-104 conserva firma/publicación de Isaac.

## #1631 / VANTA-70 · Seguimiento P3 de login (#1684)

Encargo tras fusionar #1635 en nightly `95abdcc6e`. Rama nueva
`vantareapp/isa-1631-login-p3`, worktree propio isa-1631; base actualizada
`origin/nightly@32c3f3a14bd22e9bcedff9e21e1cb138f5cc5226`.
[PR #1684](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1684)
draft a nightly; implementación `c5e31139f`, pendiente de review y CI.

P3-5: un canje correcto retira el intento FAPI consumido. Si falla después
el guardado, vuelve al formulario con un mensaje de reinicio; «Autorizar»
no reutiliza la sesión cerrada. Regresión con HTTP local y fallo real del
reemplazo atómico: exige Error::Storage, Form, mensaje, ninguna identidad
y rechazo del reintento sin más llamadas a device authorization/token.
P3-1: cambio de identidad por email cancela triage igual que poll_account.
P3-2: changelog v11 ya corregido al integrar #1635, comprobado sin retocarlo.
P3-3/4: guía con services v11 y SHA base de este seguimiento.

Rustfmt aplicado a los fuentes y diff --check PASS. Gates locales omitidos
por cola ocupada (target1634), conforme al encargo; CI Windows de #1684 debe
ejecutar fmt/check/Clippy/Nextest/lifecycle, incluida la nueva regresión.
No se afirma test aprobado ni se reutiliza CI del PR anterior. Plane En curso
verificado al iniciar; cierre y SHA se registran en #1631 y el comentario del PR.
Sin cambios runtime/IPC/domain/testdata: no requiere telemetría adicional.
Sin SQL/Edge, capturas, Clerk real, merge de PR, promoción, release o despliegue.
La prueba manual con Clerk real y macOS conserva sus límites anteriores.

## #1682 / VANTA-117 · Seguimiento P3 de creador (16/10/2026)

PR #1681 integrado por el orquestador en nightly `f428dddbe`; review DeepSeek
APTO con cuatro P3. Isaac encarga este seguimiento aislado:
[#1682](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1682),
`area:licencias`, Project Vantare, sin milestone comprometido. Rama
`vantareapp/isa-1682-creador-importe-confirmado`, worktree propio isa-1682,
base `origin/nightly@f428dddbed674cc756aa0ff41a8ae8127c64bdfd`.
PR draft [#1683](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1683)
a nightly, sin auto-merge. Regresiones `2c9a5477d`, código `fdd116b59`;
SHA final y CI se registran en la issue y buzón polar-sandbox al cerrar.

Captura real sandbox anual: raw[220] GET3990 sobre base5999 y precio anual
`4f5216ce-9b71-438c-ae8b-e78d19be0520`; raw[226] PATCH4799 y [227] GET4799,
creador20 % repeating12. Fixture anual sustituido por estas formas con identidad
propia. Solo el caso anual normal5999 es variación explícita, no captura adicional.
Once llamadas solo sandbox, un PATCH de cupón a suscripción propia existente;
sin nuevas compras, productos, descuentos, refunds ni llamadas a producción.

El importe debe coincidir con el descuento gestionado incluido en la respuesta,
con ID ligado al permitido: fijo EUR o porcentaje con ahorro redondeado antes
de restarlo. Incoherencia falla cerrado y no confirma ACK; retry recupera con
GET coherente sin repetir PATCH. `prices` no único ya fallaba antes de escribir;
nueva prueba verifica también cero autorizaciones. P3-4: el producto histórico
de lanzamiento sigue bloqueado; solo documentación, sin ampliar su admisión.

RED contra nightly65 PASS/24 FAIL; GREEN completo Mac841 PASS/0 FAIL y dos
omisiones existentes. Fmt, lint producción/nuevos tests, superficie de deploy,
fragmento, quality y456 huellas PASS. polar.test.ts conserva13 require-await
heredados; demás reglas PASS. pgTAP/Rust omitidos: sin SQL/RPC ni nativo.
Informe y raw saneado en `C:/VantareServer/evidence/polar-sandbox/`; logs
isa-1682-*. Sin despliegue Supabase, merge ni promoción por el worker.
Pendientes expresos conservados: refund realmente pending, origen de ventana
repeating11/12 meses y webhook real a Edge aislada. No se persiguen aquí.
Siguiente: cierre de CI y revisión del orquestador; no activar campañas.

## #1680 / VANTA-117 · Importe descontado de creador (16/10/2026)

Arreglo autorizado por Isaac tras la investigación sandbox; issue
[#1680](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1680),
`area:licencias`, Project Vantare, sin milestone comprometido.
Rama `vantareapp/isa-1680-creador-importe-descontado`, worktree propio isa-1680,
base `origin/nightly@95abdcc6e8a87b909848131231dc3031356b4fb7`.
Regresiones iniciales `dcb5b027d`; implementación `4d1ae38dd`.
PR draft [#1681](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1681)
a nightly, sin auto-merge; CI remoto en curso al abrirlo. SHA final y resultado
de CI se verifican en la issue y el buzón polar-sandbox; sin integración ni deploy.

Polar devuelve `subscription.amount` descontado. La sincronización ahora valida
el precio base seleccionado contra IDs autorizados del mapa, producto, importe
normal, EUR e intervalo; conserva estado activo, allowlist, autorización durable,
ACK confirmado y reintento sin PATCH si ya está aplicado. Un precio/cupón ajeno
falla cerrado antes de escribir o al confirmar. No cambia contratos ni SQL.
Fixture proyectado desde raw[103], [106] y [168] del sandbox real; normal activo
corregido tras detectar que el primer fixture usaba una respuesta ya cancelada.
Anuales construidos sobre la misma forma con importes de la orden real, no se
atribuyen a una respuesta de suscripción anual observada.

RED final contra nightly: 24 PASS /30 FAIL; GREEN completo Mac: 812 PASS,
0 FAIL, 2 omisiones existentes. Fmt, lint de producción y nuevas regresiones,
superficie de despliegue, quality y456 huellas PASS. `polar.test.ts` conserva13
avisos require-await idénticos a nightly; las otras reglas pasan. Sin silenciar
reglas en el repo. Evidencia `C:/VantareServer/evidence/polar-sandbox/isa-1680-*`.
pgTAP omitido: sin cambio de migración/RPC/SQL; Rust/telemetría omitidos porque
solo cambia Edge. Sin llamadas nuevas a Polar, secretos, deploy, merge o release.

`INFORME.md` y `raw.json` saneado conservados fuera del repo. Pendientes por
decisión de Isaac: refund realmente pending; origen de ventana repeating11/12
meses; webhook real a Edge aislada. No se persiguen en este arreglo. Siguiente:
CI verde y revisión del orquestador antes de integrar; no activar campañas.

## #1631 / VANTA-70 · Integración con nightly (16/10/2026)

Encargo del orquestador: preparar #1635 para integrar antes del 23-oct.
Inicio `c69cb745d` limpio; nightly fijada `bcaa0e3f2de0278b329b94bd2095505d56c3ed1d`
incorporada mediante merge en la rama `vantareapp/isa-1631-login-propio`.
Cinco conflictos resueltos: cuenta, protocolo services, errores y dos documentos.
Se conserva el handoff de las dos ramas y toda la entrega nueva de nightly.

Services pasa a **v11**, combinación de login nativo y Founders (ambas ramas
usaban v10 con contratos distintos); control v5 y fotos v11 conservados.
Cuenta sigue dividida y usa las acciones/precios nuevos de Founders, con
«Iniciar sesión» hacia el formulario propio. Se conservan su catálogo perpetuo,
Nightly, los mensajes de recuperación de compras y los contratos de descuentos.
Regresiones: etiqueta Founders/logout y rechazo de services v9/v10/futuros.

Repaso DeepSeek R2 y límites: [guía](../../auth/login-propio.md#integración-con-nightly--16102026).
Se conservan los arreglos de caducidad, polling acotado, cancelación, cola,
transporte, cooldown, contraseña y cierre FAPI al logout. Clerk real y el
cierre remoto de mejor esfuerzo conservan sus límites, no se presentan como
pruebas nuevas. GitGuardian mantiene los incidentes 38177715/38177716 de
#1652; el orquestador confirma que no es check obligatorio ni bloquea la
fusión. Isaac los clasificará en el panel, sin exponer valores ni silenciarlos.

Código validado y subido: `d943992cf10c8f887370cad0d97242bf331ee629`.
[CI Windows run 38922353546](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/38922353546)
SUCCESS: fmt, check, Clippy `-D warnings`, Nextest workspace perfil ci con
telemetría **1888/1888 PASS**, **19 omisiones existentes**, y lifecycle PASS.
Pasan la regresión Founders/logout y el test de líneas: `view.rs` 1046,
`account.rs` 669, techo 1750 sin modificar. Ruta de promoción y marketing
PostgreSQL/E2E PASS. El fixture Founders omitía un permiso; corregido sin
cambiar producción. Se conservan el fallo previo de CI y los logs de Windows.

**gate local omitido: cubierto por CI Windows run 38922353546**, por encargo
expreso del orquestador. Cancelado solo el check propio PID7784 en cola;
la cadena termina y no inicia los gates siguientes. Fmt local había pasado;
primer check local falló por disco lleno antes de compilar. Cargo clean del
target propio recuperó 12 GiB y el orquestador liberó más espacio. Logs
`gates-1631-r3-*` conservados, incluido el log de CI. Ningún proceso ajeno parado.
No se hacen capturas hasta
#1675 en nightly. SQL/Edge no cambian frente a nightly; no se necesita un gate
Mac propio para código de servidor idéntico. `native-mail-consent` conserva
OAuth y correo primario verificado: no se incorpora consentimiento al login.
PR #1635 fuera de draft. El orquestador autoriza pasar VANTA-70 a Por revisar
y lanzará la review; el cierre se verifica en Plane y #1631. Sin merge del PR
ni promoción de canales, release o despliegue. Clerk real y macOS manual pendientes.

## #1636 · VANTA-72 · Reintentos del registro PostgreSQL de CI (16/10/2026)

Seguimiento pedido por el orquestador tras el límite público ECR de #1657.
#1657 ya integrado: nueva rama `vantareapp/isa-1636-postgres-ci-retry`, worktree
`~/wt-1636-ci-image`, base nightly `e3d69f828`. PR independiente draft
[#1678](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1678), publicado
desde el servidor por petición expresa; CI remoto pendiente, sin merge.
Solo adquisición de imagen y tests: tres rondas ECR/Docker Hub, esperas15/45s,
80s por pull +10s para matar el proceso; máximo6 pulls. Fallo explícito al agotar
registros o fallar tag; SQL/E2E no se omiten ni se cambian. Sin nuevas acciones,
dependencias, credenciales o caché grande; se usa la opción reintentos+mirror
permitida por el encargo («y/o»). Versión17.6.1.165 sin cambios.

Ambos registros oficiales publican el índice multiarch
`sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518`,
comprobado con imagetools inspect antes de fijarlo. Docker elige la arquitectura
del daemon; se etiqueta ese digest para el runner desechable existente.
Origen oficial: [publicación](https://github.com/supabase/postgres/blob/develop/.github/workflows/dockerhub-release-matrix.yml)
y [mirror](https://github.com/supabase/postgres/blob/develop/.github/workflows/mirror.yml).

Pruebas nuevas rojas con la adquisición anterior; **6 tests** del contrato CI
verdes en Ubuntu24.04/amd64:429,transitorio,timeout,ambos registros caídos,
éxito primario y tag fallido. Dobles de docker/sleep/timeout, esperas simuladas.
Adquisición real por digest PASS, **142 SQL +E2E1 PASS** con Deno2.7.13 y daemon
Docker del Mac (PostgreSQL nativo arm64), SaaS dobles y pruebas sin red.
Bajo lock, sin contenedores pendientes. YAML/Bash/diff y quality456 PASS.
Rust/Edge generales omitidos: no cambia producto nativo, handlers ni SQL.
Evidencia `~/evidence/1636-ci-image/`; publicación del PR solicitada desde el
servidor, nunca GitHub desde Mac. Sin merge, deploy, release ni SaaS real.
Plane/issue y aceptación al orquestador; CI remoto del nuevo PR pendiente.

## #1636 · VANTA-72 · Integración de compra web (16/10/2026)

Entrada limpia `dd7c3a895`; incorpora `nightly@8166277cb` (#1663) en #1657.
Conflicto único de handoff: se conservan ambas entregas íntegras. Código y
migraciones de compra web sin alteraciones. Merge `382c123f7`; `d44e9612` tipa
RequestInit en cinco dobles adicionales de Polar/compra/informes: Ubuntu24.04
Deno2.7.13 reproducía 21 TS2339 antes; **391 Edge PASS** después, sin no-check
ni quitar assertions. El commit del runner queda en el log de esta entrega.
Orquestador publica y fusiona, worker solo push al bare del Mac.

Combinados: **815 SQL + E2E1** de admin/Correos/Founders/informes y **741 SQL
+16 carreras reales** de compra web, con las 92 migraciones y PostgreSQL real.
E2E con RPC psql y SaaS dobles, tests sin red. Docker siempre bajo lock, limpio.
La carrera heredada D1 esperaba bloqueo de fila: Correos bloquea antes en
advisory(1636,300). El runner ahora comprueba esa clave exacta en el borrado
completo, la retirada de dos contactos y sus dos trabajos pendientes; prueba
aparte el contador web con bloqueo de fila para que Correos no enmascare una
regresión del cursor. Control deliberadamente roto con secuencia: **rojo** en
el contador aislado; implementación real: verde. Sin cambiar migraciones.

Windows servidor: fmt/check/Clippy -D warnings PASS; Nextest admin/services
**224 PASS, 2 ignorados existentes**. Cola serial, target propio, MIN_GB=0 solo
proceso. Native íntegro del snapshot validado `382c123f7`. Lifecycle/telemetría
omitidos: ningún cambio runtime/domain/ipc/testdata en esta sincronización.
CI marketing2 + diagnóstico1; scope nativo17; canales45; quality/retirement456
PASS. Diff revisado y sin whitespace. No gate ocultado o debilitado.

Evidencia Mac `~/evidence/1636-web-merge/`, servidor
`C:/VantareServer/evidence/1636-web-merge/`. Bare nightly sigue8166277cb al cierre.
VANTA-72/PR1657, estados y CI quedan al orquestador según cabecera; no se muta
Plane/GitHub. Sin integración a nightly desde el worker, deploy, release, gasto
ni servicios reales. Publicación/CI del nuevo SHA y activación siguen pendientes.

GitGuardian en dd7c3a895, check116948409973: mismos incidentes38177715/38177716
con las mismas ocurrencias304307121/304307118 del commit histórico2354cd416.
No identifica fixtures nuevos del arreglo75c40dc1. El check remoto sigue rojo
por el historial: requiere gestionar esos falsos positivos en el panel; no
se ignoran remotamente ni se amplían exclusiones desde esta entrega.

## #1636 · VANTA-72 · Corrección de CI Deno/GitGuardian (16/10/2026)

Entrada limpia `b1ad884ae`, PR #1657; run fallido 38891374186. Mac usaba Deno
2.9.6 (TS6.0.3), workflow fija 2.7.13 (TS5.9.2). Repro exacta en Ubuntu24.04
amd64/Deno2.7.13 bajo Docker del Mac: 18 errores de tipos offline y dos TS2339
del E2E antes de corregir. El run no tenía artefactos; runner ocultaba la salida.

Commit `75c40dc1`: RequestInit explícito en dobles fetch/fetchFn y forEach para
comparar Headers sin depender de dom.iterable; no quita checking ni assertions.
Runner imprime diagnóstico original; workflow conserva solo log E2E en fallo,
tres días, acción ya fijada/reutilizada. Regresión posterior comprueba salida
original, log persistido y limpieza de BD; roja con runner antiguo y verde
con el nuevo, también en Linux; test enganchado a policy.

GG38177715/38177716: PostgreSQL y Basic Auth sintéticos heredados de commit2354cd4,
rutas tools/triage/test_review_1602.py y native/services/src/triage/tests.rs.
Valores preparados por tests, psql/red con dobles; Basic codifica synthetic:fixture.
Se construyen ahora en ejecución manteniendo valor equivalente y cobertura de
redacción. No se amplía ninguna exclusión. .gitguardian.yaml aclara que la lista
existente es local de ggshield; no acredita la app verde ni cambia el panel.
**Resultado remoto de GitGuardian pendiente del nuevo push del orquestador**;
no se afirma escaneo local de ese proveedor ni se ignoraron incidentes remotos.

Verdes en Ubuntu24.04 amd64/Deno2.7.13: comandos exactos CI **88 Edge +142 SQL
+E2E1** con PostgreSQL real (daemon Docker del Mac, imagen fijada), sin red en
los tests, OAuth/Brevo/Clerk dobles. CI contrato **2**, diagnóstico **1**, formato
Deno PASS. Privacidad Python **9**; URI fixture idéntica en memoria comprobada.
Windows services: fmt y Clippy all-targets -D warnings PASS, **19** tests de
privacidad seleccionados PASS (174 no ejecutados/ignorados por el filtro).
Comandos seriales por cola y target propio. Quality/**456** huellas PASS.
Sin cambios de producto ni migraciones; lifecycle/telemetría no repetidos.

Evidencia ~/evidence/1636-ci/ y C:/VantareServer/evidence/1636-ci/. Log fallido GH
descargado; sin artefactos disponibles de aquel run. Handoff actualizado; SHA,
push bare y FIN al cierre. Orquestador publica y vigila CI; sin push GitHub,
configuración real, llamadas SaaS de producto, promoción, deploy o gasto.

## #1636 · VANTA-72 · Segunda sincronización nightly (16/10/2026)

Entrada limpia `7d873cdcf`; merge `3159e214` de `nightly@e8aa2077c` en la rama
`vantareapp/isa-1636-correos` / PR #1657, autorizado por el orquestador.
Solo conflicto de handoff: ambos bloques íntegros. Oferta inicial y programa por
informes apagado de #1673, avisos #1649, cola por comprometido #1674 y filtro
CI/telemetría #1676 preservados. Sin cambios adicionales de producto ni SQL/Rust.

Repetición completa del alcance: Mac **815 SQL** en 28 suites, **367 Edge** y
**E2E1** verdes con PostgreSQL real y RPC psql/OAuth/Brevo/Polar dobles. Incluye
launch_offer_sql y report_enrollment_policy nuevos. Docker bajo lock/trap y
contenedor retirado. Contratos CI marketing, scope nativo/telemetría y canales,
YAML/shell y quality/**456** huellas PASS. Nuevos contratos/migraciones/cola y
clasificador idénticos byte a byte a nightly; workflow combina ambos conjuntos.

Windows servidor, worktree aislado ya existente y target propio, comandos
seriales vía compilar.ps1 actualizado, MIN_GB=0 solo proceso: **fmt/check/Clippy
-D warnings PASS, Nextest admin/services 224 PASS y 2 ignorados existentes**.
Jobs2/tests1. Guard PS real PASS. Lifecycle/telemetría omitidos: no cambia código
runtime/domain/ipc/testdata; solo scripts/docs nativos llegan desde nightly.
No se cambian variables de máquina, checkout principal ni datos ajenos.

Evidencia `~/evidence/1636-nightly2/` y
`C:/VantareServer/evidence/1636-nightly2/`. SHA final/bare, base verificada y FIN
se registran al cierre. El orquestador publica y fusiona; worker solo push bare.
CI remoto tras publicación pendiente. Sin promoción a nightly, activación,
despliegue, SaaS real ni gasto; pendientes de activación anteriores conservados.

## #1636 · VANTA-72 · Sincronización con nightly (16/10/2026)

PR #1657 / rama `vantareapp/isa-1636-correos`, entrada `2de604cc2`. Merge
`8c6362f0` incorpora `nightly@9e48eb86f` autorizado por el orquestador; segundo
merge `d75fd2e3` incorpora avance `ceb999f5` de avisos/handoff durante los gates.
No se promociona la rama ni se publica en GitHub desde el worker.

25 conflictos resueltos conservando nightly actual en Founders/disputas/informes,
refunds, ledger y miniapp de creadores/personas; se reenganchan solo cambios de
Correos sobre esa base (delta comparado con miniapp `0ac70754`). Los seis archivos
críticos polar/webhook/creator-code/payment-sync/fixtures/people se conservan
idénticos a nightly. Handoff conserva ambas entregas. CI mantiene scope/cache y
gates de nightly junto al job SQL/E2E de Correos; el guard PS respeta scope nativo.

Fix `950aac58`: guard PowerShell reconoce también billing-report-promotion,
como candidato inerte (sin habilitarlo); ejecución Windows detectó el fallo y
regresión Deno fue roja/verde. Guard PS real Windows ya PASS tras corregirlo.

Checks combinados: Mac SQL **756/756** (26 suites admin/marketing/Founders/
renovaciones/informes) y E2E **1/1**, Edge **363/363**, CI marketing **2/2**,
clasificador nativo **11/11**, YAML/shell, fmt Deno y quality/**456** huellas PASS.
Docker bajo lock con contenedor limpio; PostgreSQL real, OAuth/Brevo/Polar dobles.
E2E usa adaptador RPC psql, no transporte PostgREST ni proyecto remoto.
Windows admin/services: **fmt, check, Clippy -D warnings PASS; Nextest 224 PASS,
2 ignorados existentes**, comandos seriales por compilar.ps1, jobs2 y tests1,
VANTARE_CARGO_MIN_GB=0 en proceso según encargo; sin cambiar variables de máquina.
Todo `native/` idéntico al snapshot de validación `8c6362f0` tras el segundo merge.
No se modifican runtime/domain/ipc/testdata frente a nightly: lifecycle/telemetría
no se repiten en este encargo de resolución; CI de producto sigue con sus gates.

Evidencia Mac `~/evidence/1636-nightly/`; Rust/guard Windows en
`C:/VantareServer/evidence/1636-nightly/`. Checkout de gates aislado
`C:/VantareServer/wt/isa-1636-sync`, target propio, sin tocar el checkout principal
ni su untracked ajeno. No se compila Rust en Mac en esta ronda por instrucción
expresa. Sin cambio visual adicional ni nueva QA física de UI.

Entrega local para publicación/revisión de CI por el orquestador. Push solo al
bare del Mac, SHA/FIN en `~/orq/1636.buzon.md`. Sin merge a nightly ni release,
despliegue, servicios reales o gasto. Se conservan pendientes de activación
#1637/web, QA visual/Windows, secretos/flags/tick y alarmas documentados en MAIL.md.

## #1636 · VANTA-72 · R3 menores de seguridad (15/10/2026)

PR #1657, rama `vantareapp/isa-1636-correos`, entrada limpia `3fcb0420a`, aprobada
por seguridad R2 y subida por el orquestador. Mismo Mac `~/wt-1636`, sin
subagentes ni SaaS real. Orquestador mantiene Plane/GitHub; worker solo bare.

- M1, `072462f6`: HMAC mediante subtle.verify antes de ambos presupuestos.
  601 firmas inválidas no gastan SQL ni impiden una baja válida (regresión roja/verde).
- M3, `d006335c`: recibo público idéntico para espera, ausencia o cuenta vinculada;
  mismo 200/cuerpo/cabeceras. No afirma borrar cuentas. Owner mantiene diagnóstico.
- M4, `e3671427`: DELETE espera lease previo +10 s, cubriendo PUT tardío. Test de
  plazo exacto rojo/verde; la migración de retención conserva ese margen.
- M2, `8f473514`: máximo ocho intentos o 24 h por trabajo; estado failed retira
  correo, deja recibo/huella privada y bloquea nuevas altas hasta ACK manual.
  Owner ve aviso y hasta 20 recibos sin dirección, motivo/intentos/HTTP. Expiración
  antes de flags/clave Brevo, en cada claim y lectura Owner. Runbook manual MAIL.md;
  requiere tick periódico independiente y alarma de fallos/scheduler antes de activar.
  No se pierde la obligación: failed no acredita borrado del proveedor.
- M5: SQL/E2E separado de policy/product en job alojado ubuntu-latest, con
  preflight Docker visible y pull explícito de imagen fijada. Público automático;
  privado requiere variable MARKETING_POSTGRES_CI=true tras autorización del
  presupuesto alojado. No se modifica configuración. Runbook #1565 excluye Docker
  del runner privado Linux; inspección read-only confirma runs públicos hosted.
  Prueba roja/verde y tres escenarios: Docker ausente, daemon denegado, disponible.

Evidencia `~/evidence/1636-r3/`: SQL **199/199** + E2E **1/1** (PostgreSQL real,
RPC mediante adaptador psql, OAuth/Brevo dobles), Edge/contratos **97/97** sin red,
Nextest admin **29/29**, Clippy all-targets -D warnings, fmt, build normal PASS.
CI contrato **2/2** con tres escenarios de capacidad; YAML/shell nuevos parseados.
Quality y **456** huellas PASS. Primer Clippy R3 rechazó dos lints, corregidos sin
suprimirlos. Diff completo revisado; sin dependencias ni manifiestos/locks nuevos.
La escena mail-cleanup abre ventana nativa; `Vantare1636R3QA.app` queda en evidencia.
Preflight de captura macOS sigue false: sin PNG ni QA visual/Windows. Target propio
se elimina al cierre. Lifecycle/telemetría omitidos: no cambia runtime/domain/ipc/testdata.

Antes de activar siguen pendientes CI remoto y QA visual/Windows, conexión UI
#1637/web, configuración de proveedor/secretos/flags/scheduler/alertas. M6/M7 del
informe siguen observaciones de escala/retención de hashes, fuera de estos cinco
arreglos. No se despliega ni activa, sin merge/promoción/release/gasto. SHA final,
commits/push bare y FIN en `~/orq/1636.buzon.md`; informe completo en evidencia.

## #1636 · VANTA-72 · R2 para revisión (15/10/2026)

PR #1657, rama `vantareapp/isa-1636-correos`, entrada `b0f799827`. Mismo worktree
Mac `~/wt-1636`; sin subagentes, credenciales ni push GitHub. El orquestador
mantiene Plane/issue/PR y sube del bare. Buzón `~/orq/1636.buzon.md`.

**P2-1, 5f9e3806:** #1622 encola DELETE Brevo de direcciones actuales/anteriores
antes de borrarlas localmente. Worker `mail-cleanup`, backoff 5 s–1 h, leases,
fencing y ACK 204/404 idempotente. Al confirmar retira también la PII temporal de
la cola y conserva resultado/intentos/fecha sin correo en auditoría. Sync anterior
vence antes de DELETE; un alta nueva espera al borrado pendiente. Worker inerte,
flag/secreto/scheduler no configurados. Owner puede drenar y ver lo pendiente.

**P2-2, b3fbe59c:** borrar espera sin cuenta desde gestión (correo exacto y
confirmación), RPC solo servidor o enlace firmado; misma cola Brevo. No permite
borrar una cuenta por esa vía. GET muestra confirmación, POST de formulario actúa,
POST RFC8058 de un clic conserva baja sin segunda pantalla.

**P2-3, 4a8527ba:** `native-mail-consent`, OAuth + correo primario verificado en
Clerk, UUID derivado en servidor, una decisión de novedades/ofertas y evidencia
fija. Get/set, bloqueo/tombstone y límite persistente por cuenta. #1637 no está en
esta base: servidor listo y enganche exacto documentado en
`supabase/functions/native-admin/CONSENT.md`, también llamada backend del repo web
tras su verificación de dirección. UI #1637/Ajustes y frontend web siguen en sus
ramas; no se afirma haberlos conectado aquí. E2E local prueba el servidor con SQL
real, no solo un mock de consentimiento.

**P3:** CHECK de locale y escape/fallback de lang; cursor UUID sin dirección.
La selección usa proyecciones pendientes por entorno, no límite de keyset: recoge
cambios detrás del cursor, durante HTTP y cambios/expiración de grupos. ACK viejo
no limpia datos nuevos. Reserva reevalúa como máximo 20 pendientes; el barrido
identificador de cambios de sync sigue comparando la proyección efectiva de la
cohorte. Rate de baja persistente global 600/min y token válido 20/min, hash con
retención acotada, 429/Retry-After. PS guard reconoce rutas/candidatos ya conocidos
por TS; wrapper permite desplegar cuatro rutas nuevas solo por nombre explícito,
sin cambiar el conjunto comercial por defecto. CI añade Deno offline, SQL y E2E
con Docker bajo lock, y ejecuta guard PS en Windows. Gates nativos --workspace
ya incluyen admin; CI remoto pendiente de que el orquestador suba esta ronda.

Evidencia `~/evidence/1636-r2/`: SQL **181/181**, E2E **1/1** con PostgreSQL real y
OAuth/Brevo dobles, Edge/contratos **95/95** sin permiso runtime de red; Clippy admin
`-D warnings`, Nextest **28/28**, build normal, fmt, quality/456 huellas PASS.
YAML y shell de los steps nuevos parseados. Seis escenas nativas demo abren;
`Vantare1636R2QA.app` privado debug conservado. **Capturas y revisión visual siguen
bloqueadas** por permiso macOS para SSH (preflight false comprobado en esta ronda).
No se afirma interacción física ni Windows/DPI. PowerShell solo se prueba por
contrato aquí; ejecución en el nuevo step Windows CI. Lifecycle/telemetría omitidos:
no cambia runtime/domain/ipc/testdata. Target aislado retirado al cerrar.

Contrato/configuración vigente consolidado en `supabase/functions/native-admin/MAIL.md`.
Antes de activar: review del orquestador, CI y QA visual/Windows, enganchar #1637/web,
configurar Brevo/DNS/listas/bajas/secreto y scheduler de limpieza, probar sandbox
con autorización y validar modelo/coste de Anthropic. El worker no configura nada
real ni envía correos. Sin merge, promoción, despliegue, release, anuncios o gasto.
Push únicamente al bare local del Mac; SHA final y verificación en el buzón.

## #1636 · VANTA-72 · Correos de gestión (15/10/2026, candidato local)

Worker Codex T3 por SSH en Mac, sin subagentes ni servicios reales. Rama
`vantareapp/isa-1636-correos`, base miniapp `0ac70754`, no nightly. Estado Plane
informado por el encargo: «En curso»; el worker no consulta ni modifica trackers.
Hitos locales: backend `8e3f4f30`; código integrado en esta rama `3ffc14f7`.
El orquestador revisa y mantiene Plane/GitHub. Buzón `~/orq/1636.buzon.md`.

Backend: ledger privado con consentimiento único, siete grupos desde derechos
comerciales efectivos/roles/creadores/espera, cuatro idiomas, aprobación de revisión
por Owner, cuota global de 300 reservas por ventana de 24 h y tandas manuales de
hasta tres. No reintenta respuestas inciertas. Bajas firmadas GET/POST globales y
webhook Brevo autenticado; se vuelven a comprobar permisos antes del HTTP.
Cambio de correo suprime el anterior; tombstone elimina direcciones actuales y
anteriores y sus entregas, conservando cuota anónima. IA solo devuelve borradores
(`claude-opus-5-5`, high), sin guardar/aprobar/enviar. Flags apagados por omisión.
El cliente conserva límite de 8 KiB para otras acciones y permite 128 KiB en mail,
sin duplicar el stream. Contrato/guía de Isaac en
`supabase/functions/native-admin/MAIL.md`.

UI GPUI: sección Correos, campañas, tres plantillas, editor ES/EN/IT/PT-BR con
vista previa segura, grupos y recuentos, confirmaciones, historial y estado. No
permite enviar cambios sin guardar; bloquea edición durante confirmación/petición.
Limpia borradores al perder autorización. No se cambia Hub ni runtime nativo.

Checks Mac: SQL Docker aislado **120/120** (42 correos + 57 admin + 21 borrado);
Edge/Deno **76/76**, sin permiso de red, con dobles Brevo/Anthropic; Clippy admin
`-D warnings` y Nextest **27/27**; fmt, build normal, quality y 456 huellas de
retirada PASS. Cuatro escenas demo abren ventana nativa de 1280 puntos de ancho.
Evidencia: `~/evidence/1636/`; app QA debug local en `Vantare1636QA.app`.

**Pendiente de QA visual:** las capturas físicas están bloqueadas por permiso de
macOS para SSH (`CGPreflightScreenCaptureAccess=false`; screencapture no pudo leer
la ventana). El intento de exportar el fotograma con test-support de GPUI exigía
cambiar Cargo.lock y se descartó por «sin dependencias nuevas»; no queda cambio de
features, lock ni captura en el producto. No se acredita revisión visual,
interacción física ni Windows/DPI. Escenas `mail-editor`, `mail-confirm`,
`mail-history` preparadas para capturar desde sesión Mac autorizada.

Antes de producción: conectar colectores verificados de consentimiento en
registro/cuenta/espera (no existe permiso histórico que importar), configurar
Brevo/dominio/listas/webhook/secretos y Anthropic con autorización de gasto,
validar modelo, entrega y bajas, y completar procedimiento de borrado externo en
Brevo. Las campañas viven en Vantare: envío individual SMTP API para reservar y
revalidar cada destinatario, listas Brevo como espejo; no se crean campañas
paralelas en su panel. El contador local no conoce correos enviados por otros
sistemas: usar cuenta Brevo dedicada. Historial «aceptado» no significa entregado.

Sin ejecución de lifecycle/telemetría: solo se toca la miniapp aislada y Edge/SQL,
no runtime/domain/ipc/testdata. Gates Windows y CI remotos no ejecutados. El bare
`~/vantare.git` recibe la rama por encargo; no es un canal de producto. Sin GitHub,
merge, promoción, despliegue, release, anuncios ni gasto. Revisión y capturas por
el orquestador antes de dar por cerrada la entrega.
## VANTA-42 / PR #1663 · R7 · Atribución de creador en compra web (16/10/2026)

Decisión de Isaac: primer pago solo atribuye la venta/comisión;20% cliente
desde segundo mes, aplicado por backend1661 después del primer pago.
La web acepta creatorCode exacto en lanzamiento y fuera; registro canónico
billing_save_creator_attribution tras claim y antes de begin/POST, ACKtrue
obligatorio; metadata.creator_code y binding del intento. Mensual usa
creator_discounts, anual creator_annual_discounts. Código/ID forman huella
inmutable del intento; no se cambia creador en reintento. Solo once de
lanzamiento en primer pago si corresponde, ningún descuento inicial de creador
y allow_discount_codes=false siempre. Sin contrato1661 desplegado cierra
antes de Polar; no se pierde atribución en un fallback sin código.

Backend financiero/renovación pertenece a1661: no copiado ni mergeado aquí.
Adaptador contrastado con contrato confirmado1661@39afa230, hashes y SHA en
r7-contract.json. Orquestador debe integrar/desplegar su RPC antes de abrir
códigos; sin ella falla sin cobro. Checkout anual aclara segunda anualidad.
Al integrar, conservar guard2/begin/marcador y barrera1622 en los helpers
compartidos. Repetir auditoría ACL del rol erasure tras sus RPC nuevas.
Condiciones de activar reembolsos R6 intactas; switch sigue apagado.

Textos4idiomas:20%desde segundo mes, primera factura solo atribución.
Founders incluye Nightly; CTA permanece apagado. Plus confirmado999/9990,
primer periodo699/6990, desde fuente única. Sin cambios de productos reales.
Checks web79NodeSQLite, ocho flujos(4planes con/sincódigo)->webhookreal/licencia,
48capturas Mac con códigoISAAC/dobleclick/CSP/backoff/descargas.
SQL/Edge/Rust no se repiten: este lote solo cambia docs de esta rama backend;
código conserva baseeb553c7fe y última verificación R6(662Edge/235pgTAP/13carreras).
Evidencia ~/evidence/web-compra/r7-*; SHA/estadofinal en buzónweb-compra.
Solo bares; orquestador publica/actualizaVANTA42/PR1663. SinAPIreal/deploy/release.

## VANTA-42 / PR #1663 · R9 · Registro SQL y catálogo aplicado (16/10/2026)

Merge de nightly@e8aa2077c7c6de0a7733a3f2fc616dc63fdf7456. Se conserva
#1673: registro privado billing_launch_offers, RPC pública billing_launch_checkout
con validación SQL y retirada de report_promotion_checkout; programa de informes
aplazado mediante su política de inscripción. #1649/#1674/#1676 se integran intactos.
El conflicto era solo de handoff; se conservaron ambas historias.

La migración pendiente de este PR adapta la liberación terminal al helper
privado cuando #1673 ya está instalado, sin sustituir el validador ni abrir
EXECUTE al helper. La misma migración sigue funcionando en instalación limpia.
SQL85migraciones/741pgTAP/15carreras PASS en ambas rutas; incluye pruebas de
registro y de la nueva política de inscripción. Compensación OFF y baja D1/ACK
firmado se conservan; el rol de pull sigue sin RPC adicionales.

Catálogo de Polar aplicado confirmado por el orquestador. El único mapa completo
vigente es scripts/polar-production-map.json (bajo supabase/functions), objeto
map exacto del resultado aprobado catalogo-1661-result-r5.json. Procedencia/hash
e instrucciones en docs/billing/production-purchase-configuration.md.
Registro SQL generado offline en r9-production-launch-offers.sql; no aplicado
en servicio real. El operador debe configurar el mismo POLAR_PRODUCT_MAP en
Supabase y Worker, registrar las ofertas y comprobar apertura/estado de productos.
No se inventan IDs de creador ni se reejecuta apply de Polar.

Web conserva la RPC pública y cierra antes de cobrar si el registro no está
disponible/no coincide. Tests usan las ofertas y IDs del mapa aprobado sin red.
La landing retira el anuncio de informes aplazados;regeneradas cuatro lenguas
y prueba de todas las fases. Edge731 PASS+2ignorados previos;NodeSQLite83;12E2E+controlsinbinding;48capturas.
Quality456/fmt/lint/surface PASS. Windows secuencial por cola nueva:
fmt/check/Clippy/Nextest1801/lifecycle/telemetría25 PASS;árbol native
afb553c158cc20ab1ce2a7d147f55f3d0067934b idéntico a nightly. Target propio
reutilizado de R8, sin intentar de nuevo el borrado rechazado por política.
Evidencia Mac ~/evidence/web-compra/r9-*;Windows checkout-web-r9.

Solo bares del Mac. Orquestador publica las ramas, revisa CI/PR1663 y actualiza
PlaneVANTA42. Sin deploy, API comercial real, cobro,refund,baja real ni merge de
canal/release. Dudas nuevas ninguna. Registro/configuración de servidor aún por
confirmar;compensación solo se habilita tras los tres requisitos formales de R6.

## VANTA-42 / PR #1663 · R8 · Integración nightly (16/10/2026)

Se fusiona nightly@9e48eb86f8d2cfc43b64010d2b1ac1c58768826a en
vantareapp/isa-1620-checkout-web. Se conserva la versión de nightly de
Founders, oferta once, atribución/renovación de creador, informes, lease común
y contracargos. Pro599/5999, Plus999/9990 y sus primeros periodos no cambian.
No se modifica Polar real. Compensación continúa apagada; activar exige
sandbox net/gross, inventario e inbox, y receptor privado Owner con ACK.

La migración de integración añade Founders al guard compartido sin saltar su
política de venta ni el bloqueo entre compras. La reserva de creador sigue
siendo atómica y devuelve guard2; begin y binding siguen obligatorios.
Un rechazo terminal canónico libera también la reserva de oferta de #1593,
conservando CAS y bloqueo de los intentos vivos. La web adopta sus RPC comunes
en lugar de guardar atribución por separado; una oferta ya consumida se
rechaza antes de cobrar un precio distinto del mostrado.

Reconciliación conserva reparación de facturas, disputas y reintentos de
nightly, además de observación de compensación por ítem. Baja D1 automática,
supresión, ACK firmado y permisos mínimos se vuelven a probar sobre la unión
real de migraciones. Código nativo exactamente igual a nightly: árbol
36cf87011d750968a1b57a5a4793410dbba294d3; gates Windows en worktree aislado
checkout-web-integration por compilar.ps1, secuenciales.

Evidencia Mac ~/evidence/web-compra/r8-*:83 migraciones,682 pgTAP,15 carreras
en instalación limpia y actualización desde nightly;
726 Edge PASS y2 ignorados preexistentes;81 tests Node/SQLite;8 recorridos
web→webhook real→licencia y control sin binding;48 capturas headless locales;
fmt/lint de archivos afectados, quality456 y superficie de deploy PASS.
Control RED sin migración reproduce promotion_checkout_pending tras rechazo
cierto. Rust Windows PASS:fmt/check/Clippy,Nextest1801,lifecycle ytelemetría25.
Evidencia en docs/billing/checkout-integration-r8.md;target conservado porque
la revisión automática rechazó el borrado con blocked by policy.
Solo ramas aisladas y pushes a bares del Mac; publicación/CI/merge a nightly
quedan al orquestador. Sin deploy, cobros, refunds, bajas reales ni release.
Para Plane VANTA-42: actualizar resumen/Por revisar desde el orquestador.

## VANTA-42 / PR #1663 · R6 · Acabado y actualización de base (16/10/2026)

Aprobación de seguridad R5 recibida por el orquestador; informe review-r5.md.
Fusionado origin/nightly eb553c7fe905c225d66ef8718eabb72fa84dbb49 en la rama
vantareapp/isa-1620-checkout-web, sin reescritura ni promoción de canal.
Único conflicto: handoff; se conservan completas las entradas VANTA-42 y1627.
Polar compartido conserva guard2/marcador y helper admin sandbox de nightly.
[Condición formal de activación](../../billing/checkout-review-r5.md):
refund apagado hasta sandbox net/gross, inventario de pedidos y receptor Owner
visible con ACK durable, con evidencia y decisión de Isaac por entorno.

Web: descuento sin archivar/sin código/duration_in_months=null, validación
estricta incluso si faltan campos. Sin versiónSetup, CTA sin href; before
permanece informativo/Discord. Prueba Chrome con JS desactivado y clic central:
cero pestañas nuevas. Retirados headers de launch-edition y textos fallback
de30EUR/snapshot/cierre; Founders usa la fuente común y permanece deshabilitado.

Checks sobre nueva base:77migraciones/235pgTAP/13carreras;662EdgePASS/2ignored
preexistentes;74NodeSQLite;E2E4suscripciones->webhookreal->licencia;48capturas;
125assets reproducibles;fmt/calidad456/superficie/diff PASS. Native sin cambios
propios respecto a nightly: no se repiten gates Rust/telemetría.
Evidencia ~/evidence/web-compra/r6-*, SHAs/bares en buzón web-compra.
Sin API real/GitHub push/CI remota/deploy/release ni merge de canal.
Orquestador publica backend y actualiza PR1663/PlaneVANTA-42; último estado
comunicado En curso. Descarga sigue sin versión, Founders apagado y venta
cerrada hasta configuración/QA/autorización de Isaac.

## VANTA-42 / #1620 · R5 · Compensación restringida y oferta web (16/10/2026)

Rama backend vantareapp/isa-1620-checkout-web, base nightly3f82af8, draft#1663.
[Contrato R5](../../billing/checkout-review-r5.md) prevalece sobre R4:
refund automático apagado por defecto; exige vínculo/marcador y resolución
terminal no aplicable, con consulta del inbox. Pendientes/cuarentenas genéricas/
enlaces de creador/históricos => incidencia Owner, nunca refund automático.
IVA net/gross configurable pendiente sandbox; lectura antes de reintentar,
avisos durables y sin doble refund. Expiración24h del no publicado sellado,
aislamiento de venenos por ítem. ACK D1 con hash/recuento y HMAC propio;
JWT1h/rotación30min; auditoría cero RPC PUBLIC extras para rol de erasure.
Barrera #1622 y cierre #1633 conservados.

Web: Launch Edition fuera de venta, derechos antiguos legibles; Founders50
para siempre/todo presente y futuro/sin fin, CTA y hueco apagados hasta integrar
1661 (contratoc846d7c6 requiere Supabase bearer, no Clerk directo).
Beta pública26oct-26nov: Pro399/3990 primer periodo y599/5999 renovación;
Plus opcional699/6990 y999/9990. Una fuente en céntimos también legales.
Checkout normal+polar_launch_discount_id del mapa común1661@c846d7c6,
nunca IDs de lanzamiento; validación servidor
de tarifa/importe/duración/producto y no combinación con creador. Informes
desde segundo mes. Downloads URL fijada por version en launch.json, null
pendienteIsaac, CTA desactivado hasta elegir versión; nunca releases/latest.

72migraciones/235pgTAP/13carreras,632EdgePASS/2ignored preexistentes;
73Node/SQLite, E2E cuatro suscripciones/webhook real,48capturas Chrome Mac,
CSP/backoff/429/precios/descarga PASS. Rust/telemetría omitidos: native intacto.
Evidencia ~/evidence/web-compra/r5-*. SHA final/ref en buzón web-compra.
Solo bares locales; sin GitHub/API real/deploy/merge/release.
Orquestador: revisar y actualizar VANTA-42/PR1663; último estado En curso.
Isaac: precios/once de catálogo1661 (Polar59,90 debe pasar59,99),
versiónSetup, privacidad/Clerk/mapa/cron/JWT/claves/receptor Owner y sandboxIVA
antes de abrir. Webhookrefund/uncanceled y localización activos según comunicación
del orquestador; no se verificaron contra producción.

## VANTA-42 / #1620 · R4 · Intentos, compensación y baja D1 (15/10/2026)

Rama/base/PR: `vantareapp/isa-1620-checkout-web`, nightly `3f82af8`, draft #1663.
[Contrato y despliegue](../../billing/checkout-web-shared.md): guard2, begin antes
de Polar, caducidad automática solo segura, nonce sellado para ACK perdido,
reembolso total automático de cobro sin licencia, ledger/outbox y retries.
No hay recuperación comercial por soporte ni cambio de identidad por metadata.
Pull D1 automático mínimo privilegio y cursor de commit; barrera #1622 intacta.
Sustituye expresamente el paso manual R3. Owner recibe avisos mediante
receptor privado firmado por configurar; no se añade pantalla Admin.

Web conserva master d9f040a sin prueba gratis; renovación Pro de una fuente
5,99/59,99 en cuatro idiomas, sin tocar Polar. Plus conserva renovación lanzamiento6,99/69,90; normal9,99/99,90.
71 migraciones /212pgTAP/13carreras PASS; F1 RED conductual sobre R3.
Edge630PASS/2ignored; web66PASS, SQLite y E2E real cinco planes con dobles;
Chrome40capturas/CSP/backoff/precios PASS. Calidad456/superficie/fmt/lintproducción
PASS. Native no cambia. Evidencia `~/evidence/web-compra/r4-*`.

Entrega solo a bares del Mac. SHA/commits/refs en buzón web-compra.
Venta cerrada #1633. Sin API real, GitHub push, despliegue, promoción ni release.
Siguiente: revisión conjunta y despliegue autorizado por etapas; configurar JWT
mínimo/salts, cron y receptor visible Owner, verificar precios Polar y sandbox.
Orquestador actualiza VANTA-42/issue/PR; último estado comunicado En curso.

## #1593 / VANTA-39 · decisión de Isaac P3-E y revisión P3-F/G/H · 16/10/2026

PR draft [#1673](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1673),
rama vantareapp/isa-1593-endurecer desde nightly 9e48eb86f; esta ronda continúa
bc631a839. Review de esa base APTO; cambios nuevos pendientes de CI del nuevo SHA.
SHA final y estado de CI se verifican en issue/evidencia/buzón al publicar.

- Isaac NO abre el programa por informes con el lanzamiento: queda apagado por
  defecto, sin fechas de inscripción y pendiente de un anuncio posterior.
  Sustituye la propuesta P3-E anterior, que ya no está pendiente de confirmar.
- SQL incorpora enrollment_enabled=false y fechas NULL en la política privada
  existente, solo para operador. Una ventana propia finita y ordenada es
  obligatoria antes de habilitar nuevas inscripciones. El flag Edge también
  arranca apagado si está ausente o false; encenderlo solo no inscribe.
- La observación solo usa esa política para nuevas inscripciones, sin derivar
  fechas del JSON de lanzamiento. El helper histórico de checkout conserva
  su ventana de #1661, sin cambios en precio/cupón inicial ni en su consumo.
  Se conservan hechos contables y observación de derechos ya concedidos.
- P3-F: generador imprime SELECT del registro tras commit; checklist exige
  comparar las claves activas, IDs, ventana y versión antes de desplegar Edge.
  P3-G: comentario histórico identifica la RPC retirada y su migración de baja.
  P3-H: begin/commit explícitos en la migración del registro; también en la nueva.
- Rojo inicial: suscripción de lanzamiento se inscribía sin configurar programa.
  Verde:24 comprobaciones nuevas de política y fechas futuras ficticias,
  además de183 informes,29 checkout,88 convivencia,89 creador y Founders43+36.
  Ambos órdenes de migración pasan; tests antiguos habilitan explícitamente
  su ventana ficticia. No se atribuyen esas fechas a un anuncio real.
- SQL completo81 suites,54PASS/27FAIL heredadas frente al PR anterior80/53/27;
  1885→1909 aserciones aprobadas, sin regresiones. Mutaciones de flag SQL y
  acoplamiento con lanzamiento detectadas. Edge711PASS/0FAIL/2ignored,
  frente a710/0/2. Fmt/lint, superficie, quality/retirada y diff-check PASS.
- SQL y Edge en Mac; Docker desechable sin red/puertos, actor sin superusuario,
  lock/trap liberado. Sin Rust tocado: fmt/clippy/nextest/lifecycle/telemetría
  nativos omitidos. Sin servicios reales, productos/cupones, deploy, merge,
  release o anuncio comercial. Activación futura requiere a Isaac.

Evidencia de esta ronda: ~/evidence/1673-programa-apagado y copia servidor.
Evidencia completa anterior: ~/evidence/1593-endurecer (no ~/evidence/*1673*),
incluida copia en C:/VantareServer/evidence/1593-endurecer. Próximo paso:
publicar el nuevo SHA en #1673, comprobar CI y entregar Por revisar al orquestador.

## #1593 / VANTA-39 · endurecimiento P3-D/P3-E · 16/10/2026

#1659 ya integrado por el orquestador en nightly9e48eb86f. Seguimiento aislado
vantareapp/isa-1593-endurecer, base exacta9e48eb86f; [PR draft #1673](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1673)
hacia nightly. Código30389aec; SHA final en issue/evidencia/buzón. Publicado
al bare Mac y a GitHub desde servidor; CI automático en curso al cerrar.
Plane Por revisar tras verificación final; integración reservada al orquestador.

- P3-D: retira report_promotion_checkout y fallback Edge. billing_launch_checkout
  valida SQL entorno/clave/producto/cupón/ventana/reloj finito contra registro
  privado exclusivo del operador. No reserva/consume ante oferta no registrada.
  Reserva/CAS/consumo por cuenta y B03 preservados en único core privado sin
  permisos API; owners explícitos, search_path vacío y RLS.
- Proyección SQL offline del único JSON #1661 y loadPolarProductMap.
  Registro inicialmente vacío: aplicar SQL revisado ANTES del checkout
  actualizado. Repetición conserva auditoría; deriva aborta/rollback, sin rotación
  silenciosa. Verificación remota de importe/duración once/ámbito por operador,
  no certificada por este generador. No activa ni consulta Polar.
- P3-E: inscripción de Pro/Plus mensual durante26oct→26nov19Madrid,
  apertura inclusiva/cierre exclusivo; 45 días individuales (1080h).
  Decisión operativa del orquestador PENDIENTE de confirmación de Isaac.
  Contrato/regla lo dicen expresamente; premio sigue desde segundo mes.
- SQL RED inicial0/3 confirma los fallos previos. Verde29 nuevas +183 informes
  +88 convivencia +89 creador en ambos órdenes; suites Founders43+36 verdes.
  Catálogo80/53PASS/27FAIL frente al baseline exacto79/52/27,
  1850→1885 checks y ninguna regresión. Fallas heredadas idénticas.
  Generación SQL real aplicada/repetida y deriva revertida en BD desechable.
- Edge710PASS/0FAIL/2ignored frente a nightly707/0/2.
  Tres mutantes detectados: cupón, intento y B03; los dos últimos eliminan
  ambos guards redundantes para comprobar la ausencia completa del control.
  La primera prueba P3-E chocó con cupo1/día: separadas cuentas sin debilitarlo.
  Rust/clippy/nextest/lifecycle/telemetría omitidos: ningún archivo nativo tocado.
- Mac Docker sin red/puertos, actor NOSUPERUSER BYPASSRLS y lock/trap liberado.
  Fmt/lint producción, superficie deploy, quality/retirada456huellas y diff-check PASS.
  Evidencia ~/evidence/1593-endurecer y C:/VantareServer/evidence/1593-endurecer.
  PR#1673 abierto draft y enlazado al hilo, CI en curso; estado final en issue.
  Sin merge, deploy,
  productos/cupones reales, pagos/refunds, release ni promoción desde este worker.
  Multi-cuenta aceptado y saldo ganado caduca6meses: sin cambios.

## #1593 / VANTA-39 · R7 terminada al bare, pendiente publicación · 16/10/2026

PR #1659, proyecto Vantare/area:licencias; misma rama. Base R7 b5378d166.
Merge autorizado8392038d desde nightly1f07e8e28 y ff079767 desde
nightly460c39e45 (#1661/#1672). Cierre posterior solo documentación y tooling;
SHA final en issue/evidencia/buzón. Sin promoción de esta rama hacia nightly.

- Conserva checkout/guards de #1661, compra Founders y renovación/retirada
  de creador, incluida cancelación definitiva por subscription.updated.
  Webhooks conservan ledger e incidencias de informes y pagos Owner.
- Un JSON canónico de #1661, sin copia parcial. Ventana única26oct→26nov19
  Madrid; primer periodo once por cuenta, recuperable tras TTL, consume desde
  SQL incluso sin flag de informes. Mensual/anual comparten el derecho,
  sin consumirlo por una compra vitalicia histórica. Reserva/CAS, identidad,
  huella de oferta/creador y claim/atribución transaccionales conservados.
- Mayor ahorro con selector original único; informes desde mes2. Conserva
  seis cobros totales, caducidad6meses, spam, traslados y barrera de borrados.
  Revocación PATCH→ACK: recibo durable, solo token propio/vivo, conflicto
  blando auditado y lease liberado; no completar creador ni falsa incidencia.
  Retirada de creador incluye remanentes verificados; preserva informes/manual.
  Refund inicial sigue perdiendo el premio y autoriza solo limpieza.
- SQL177+88+89+43+36 PASS en ambos órdenes sobre migraciones reales.
  Catálogo completo79/52PASS/27FAIL heredadas frente a nightly77/50/27:
  1585→1850 aserciones PASS,265 nuevas, cero regresiones y mismas fallas.
  #1672 no cambia ni un fichero SQL: baseline1f07 se conserva con prueba Git.
- Edge707PASS/0FAIL/2ignored frente a nightly460662/0/2. Conservadas593
  declaraciones literales de tests de nightly y sus casos dinámicos. La
  copia vieja superpuesta fue sustituida por archivo del árbol Git unido,
  que exige el ancestro460. Sin suites sustituidas por un fixture parcial.
- Diez controles SQL y siete Edge detectados: fecha, revocación/ACK y remanentes,
  comparación, locks/lease, total de meses, recuperación, borrados; guards,
  hooks/retirada/cancelación definitiva, once/fingerprint y configJWT.
  Primeras pruebas rojas de ventana y carrera ACK conservadas. Dos mutantes
  Edge iniciales solo rompían el tipado: corregidos para probar conducta.
- Windows serial MIN_GB0 por compilar.ps1:fmt/check/Clippy PASS, Nextestci
  1826PASS/14skips (telemetría incluida), lifecycle18PASS.24 entradas
  nativas Mac/Windows idénticas normalizandoLF; #1672 no toca Rust.
  Targets propios se limpian por Cargo al cerrar. Fmt/lint Edge, superficie,
  quality, retirada y diff-check PASS. Docker aislado sin red/puertos,
  SQL NOSUPERUSER BYPASSRLS, lock/trap liberado tras cada gate.
- Remanentes20%1..10 son requisito ANTES de activar convivencia. Runbook y
  fragmento ISA-1593 actualizados. Multi-cuenta aceptado; progreso en Hub
  sigue propuesta, Owner conserva bloque. Sin nuevos productos ni cupones,
  servicios reales, deploy, scheduler, pagos/refunds o release.

Estado al cierre:Plane Por revisar tras verificar entrega; publicación GitHub,
CI y re-review R7 por orquestador. PR remoto aún b5378d166, CI SUCCESS solo de
esa base; no acredita R7. Evidencia ~/evidence/1593-r7/RESULTADOS.md y copia
C:/VantareServer/evidence/1593-r7. FIN en ~/orq/1593.buzon.md al completar
seguimiento. Pendientes sandbox autorizado/QA visual y activación de catálogo.
Polar real:seis fijos Pro200c/Plus300c repeating1/3/6, creador #1661 y remanentes
mensuales20%1..10 validados; oferta inicial once solo del catálogo de #1661.
Isaac autoriza/crea; este worker no ha consultado ni escrito Polar real.

## #1593 / VANTA-39 · R7 incorpora retirada definitiva #1672 · 16/10/2026

Nightly460c39e45 añadido por encargo explícito del orquestador. Conserva la
retirada de creador por subscription.updated canceled definitivo, sin confundir
cancelación al fin pagado ni paused. Hooks originales y pruebas de #1672 unidos
con el ledger de informes. Edge707PASS/0FAIL/2ignored; baseline460 intacto
662PASS/0FAIL/2ignored. Mantiene todos los tests de ambas ramas, incluidos
creador-only/retirada. Cuatro conflictos de tests/handoff resueltos con la versión
más estricta y los casos de informes añadidos, no con stubs permisivos de Launch.
No hay cambios SQL ni Rust entre1f07e8e28 y460c39e45: baseline SQL y entradas
de los gates nativos conservan sus hashes. Rust sigue validándose serialmente
sobre fuentes nativas idénticas. Pendientes controles finales/evidencia/cierre.

## VANTA-83 / #1661 · seguimiento O1/O3 (16-oct-2026)

- #1666 integrado por el orquestador en nightly 1f07e8e28. Seguimiento aislado
  vantareapp/isa-1661-disputas desde esa base; no promoción de este seguimiento.
- O1: las disputas se reciben mediante revocación de suscripción o refund
  preventivo. Polar no enumera dispute.*; no añadir un evento inventado.
  Se acepta también status=canceled con cancel_at_period_end=false en updated;
  cancelación diferida no inicia retirada. Mismo lease/GET/PATCH/ACK durable,
  cupón persistido y fallo Owner. Contrato documenta ausencia de señal al abrir.
- O3 confirmado: refund confirmado de cualquier factura de esa suscripción,
  parcial incluido, retira permanentemente el 20 %. Sin afectar otras suscripciones.
- O2 sigue en sandbox: PATCH sobre suscripción ya revocada y payload/entrega reales.
  Fuentes oficiales y lista exacta de eventos en creator-renewals-1661.md.
- Rojo→verde: updated terminal omitía retirada. 484 Edge y 142 pgTAP PASS;
  quality/retirement PASS (456 huellas), Deno fmt PASS. Siete fixtures heredadas
  fallaban también en la base: actualizadas para llamadas sin operación creador
  y compras Launch históricas, conservando las comprobaciones comerciales.
  Logs Mac ~/orq/disputas-1661-evidence; copia servidor al cerrar.
- No cambia Rust/schema/dependencias: no repetir gates Rust/lifecycle/telemetría.
  PR nuevo y CI se anotan en issue/entrega; Plane Por revisar al cierre.
  Sin llamadas a Polar real, despliegues, dinero ni capturas (#1655).

## #1593 / VANTA-39 · ronda 7 en validación · 16/10/2026

Merge autorizado EN la rama de PR #1659 desde nightly1f07e8e28 (#1661/#1666).
Conserva guards de checkout, Founders, atribución y renovación/retirada de creador,
con los efectos Owner y ledger de informes. Catálogo JSON completo de #1661;
primer periodo once durante26-oct→26-nov19Madrid, derecho único por cuenta
independiente del flag de informes. RPC/consumo para mensual y anual, reserva,
recuperación/CAS y huella de creador conservadas. Premio mensual desde mes2.
Revocación entre PATCH/ACK: recibo confirmado durable con conflicto blando
fenced; retirada sigue pendiente, sin falsa incidencia ni completar creador.
Retirada incluye remanentes privados verificados y preserva cupones de informes;
revocar creador no congela el premio independiente. Remanentes1..10 obligatorios
antes de activar. SQL/Edge de ambas ramas en árbol unido real, sin overlay viejo.
Edge702PASS/0FAIL/2ignored; dirigidoSQL176+84+89+43+36PASS en primera pasada.
Catálogo completo, controles y gates Rust Windows pendientes en este checkpoint.
Nightlybaseline real: SQL50PASS/27FAIL; Edge651PASS/7FAIL/2ignored (dobles
antiguos de refunds, reproducidos sin cambios). Falta cerrar comparación final.
Plane En curso, proyecto Vantare/area:licencias; rama
vantareapp/isa-1593-descuento-informes, base ronda b5378d166. Sin push aGitHub,
deploy, Polar real, cupones/productos creados ni promoción de canal.
Evidencia y plan ~/evidence/1593-r7. Cierre posterior actualizará SHA/checks/FIN.

## #1593 / VANTA-39 · ronda 6, convivencia con #1661 · 16/10/2026

Entrega para revisión de PR [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659),
proyecto Vantare / area:licencias. Misma rama, base de ronda c99b306fd;
nightly ya integrado eb553c7fe. Código85614da0 y cierre documental posterior;
SHA final verificado en issue, evidencia y buzón. Contrato y código de #1661
leídos en271e20053. No se fusiona Founders ni se promociona un canal.

- Creador20 % desde primera renovación; informes desde segundo mes. Se retira
  la selección antigua de dos meses. Porcentaje/plazo en el catálogo común de
  #1661; su comparación en céntimos es única y empate favorece informes.
  Registra el perdedor para Owner.
- La campaña tiene un solo escritor externo. El webhook de creador guarda
  atribución/primer pago y delega sin rearmar una candidatura antigua. El
  worker calcula el saldo real y usa la selección, lease y ACK de #1661.
  Fuera de esta campaña, creador mantiene su flujo normal.
- Conserva saldo3/6 total, caducidad6meses, spam/refund y B03. Al volver al
  creador usa un cupón validado para el plazo restante, nunca once meses
  nuevos. El primer ciclo rebajado fija su reloj; una factura anterior
  reconciliada solo lo puede acortar. Sin remanente, incidencia Owner durable.
- Premio sigue cambios observados de plan/segunda alta, con auditoría.
  Limpieza conserva/restaura el creador de la anterior; canceled/paused no
  recibe PATCH. Refund solo autoriza retirada, nunca otro beneficio.
  Publisher/selector comparten B03, sin invertir el lock de checkout;
  regresión real de pg_locks y control que detecta la inversión.
- SQL169 de informes +70 de convivencia +58 originales de #1661 PASS.
  Catálogo aislado76suites/50PASS/26FAIL heredadas, frente a nightly74/48/26:
  1415→1589 aserciones, cero regresiones. Conjunto79/52/27 frente al
  #1661 intacto77/50/27:1551→1790, cero regresiones. La suite anual roja
  adicional ya falla en271e20053. Instalación en ambos órdenes PASS.
- Edge684PASS/0FAIL/2ignored. Conjunto675/5/2 frente al #1661 intacto645/5/2:
  mismos cinco tests comerciales de refund con dobles RPC antiguos.
  Precio de producto y periodos de factura sobreviven juntos a minimización,
  sin PII. Ocho controles SQL RED; regresiones rojas contra c99 confirmadas.
- Gates Mac con lock/trap liberado; SQL NOSUPERUSER BYPASSRLS, Docker sin red
  ni puertos. Fmt/lint, superficie, quality/retirada y diff-check PASS.
  Rust/clippy/nextest/lifecycle/telemetría omitidos: no hay código Rust tocado
  ni target creado; checkout Windows de integración sin cambios propios.

Integración prevista en runbook: combinar checkout once/atribución y catálogo
de #1661 con hooks/ledger de #1593. Conservar helper con managed_report_ids,
proyección de cuatro campos de línea y verify_jwt=false. El fixture Git no
acredita merge Git ni checkout final combinado. Si #1661 llega después, ejecutar
el instalador idempotente y exigir true. El cron de informes lleva también al
creador de estas cuentas; su flag detiene nuevas asociaciones de ambos, nunca
el ledger ni el calendario de cupones ya aplicados. No activar aún.

Polar pendiente de Isaac: seis cupones fijos Pro200c/Plus300c repeating1/3/6;
creador según #1661 (20 %, mensual11/anual12, solo API), sin ampliar históricos.
Para reanudación: remanentes mensuales20 % de1..10meses, validados con producto
y cupón original; pueden compartir ID si coinciden porcentaje/ámbito.
Nada creado en Polar, productos nuevos, servicios reales, deploy o release.

Evidencia ~/evidence/1593-r6/RESULTADOS.md, resumen.json y comparaciones completas;
copia servidor C:/VantareServer/evidence/1593-r6. FIN en ~/orq/1593.buzon.md.
Plane Por revisar al cerrar. Orquestador publica SHA y pide CI/re-review;
después integración final de checkout, sandbox/QA autorizado. CI SUCCESS
observado solo acredita c99b306fd. Sin promoción hacia nightly/testers/master.

## #1593 / VANTA-39 · merge de nightly entregado al bare · 16/10/2026

Encargo explícito del orquestador: merge de origin/nightly eb553c7fe sobre
53b1fdf29, misma rama de PR #1659. Nightly importado al bare mediante bundle
desde origin del servidor (el Mac no tiene credenciales GitHub).
Nueve conflictos resueltos: webhooks conservan sincronización de pagos/refunds
Owner y ledger de informes; dobles admiten solo las RPC esperadas de ambos.
La miniapp nueva se conserva y su ficha Persona muestra el progreso/incidencia
de informes. DTO combina promoción con plan/pagos/accesos/bloqueo de #1639;
fixture aprobado conservado, con ejemplo falso de Ana añadido. Históricos
de ambos handoffs preservados. Cola/optimización Rust y retirada CI Linux
exactamente de nightly, sin activar servicios ni cambiar reglas comerciales.
Edge combinado679PASS/0FAIL/2ignored. SQL75suites/49PASS/26FAIL: las74 suites
de nightly idénticas,169 comprobaciones de promoción (incluye contrato combinado
de detalle Owner) y0regresiones. Prueba nueva de una factura actualizando a la
vez promoción y pagos. Gates Mac fmt/lint/superficies/quality/retirada PASS.
Rust Windows PASS: fmt/check/Clippy, perfilci1818/1818 (14 skips de perfil),
incluida telemetría real congelada, y lifecycle18/18. Secuenciales por la cola
nueva con MIN_GB=0/jobs2.20 entradas nativas idénticas Mac/Windows al normalizar
LF. Targets propios se limpian con Cargo al cerrar.
Dos commits: merge2dd6761d (padres53b1fdf29+eb553c7fe) y cierre con formato,
prueba de coproyección y evidencia. SHA final/pushbare en issue y buzón.
Plane Por revisar al cerrar, PR1659 todavía en53b1fdf29 hasta publicación por
el orquestador; CI del nuevo SHA pendiente. No se promocionó hacia nightly,
testers o master; sin deploy, release, productos ni servicios reales.
Evidencia ~/evidence/1593-merge y C:/VantareServer/evidence/1593-merge.

## #1593 / VANTA-39 · ronda 5 entregada al bare · 16/10/2026

PR #1659, rama vantareapp/isa-1593-descuento-informes; base de ronda
011ca3cbe (R4 APTO), base de rama 3f82af867. Commits por punto:
c1402432 (P3-23 plazo real retry_at), b0974da6 (P3-24 desajuste dueño/producto
visible al Owner), 15bcd59f (P3-25 historia durable por elemento no-orden) y
6cc7e663 (P3-22 mensajes locales en app, conserva UUID y no muestra prosa remota).
Regresiones RED→GREEN de los cuatro puntos. SQL167/167, Edge648PASS/0FAIL y
dos ignores históricos. Dos controles SQL nuevos fallan al quitar las incidencias.
Catálogo contra base 3f82af867: 59→60 suites,33→34PASS,26rojas idénticas,
1266→1433 aserciones,0regresiones. Runner NOSUPERUSER BYPASSRLS, Docker/Edge
en Mac con lock/trap, sin servicios reales.

Nightly remoto ahora eb553c7fe, con miniapp #1639 y tooling. Comparación nueva
desde snapshot exacto: SQL74suites/48PASS/26FAIL; las59 comunes son idénticas a
esta rama (15 nuevas de miniapp no están en la base aislada). Edge643PASS/0FAIL/
2ignored. PR remoto sigue011ca3cbe y GitHub marca CONFLICTING; requiere
integración del conjunto y CI del SHA final por el orquestador, no se acredita
un candidato integrado con ese nightly.

Rust Windows: fmt/check/Clippy y Nextest servicios188PASS/2skips, incluidos
procesos reales con fixtures. Workspace completo: fmt/check/Clippy PASS,
Nextest1786/1786 (14 skips del perfil existente) y lifecycle18/18 PASS.
Ejecución secuencial por compilar.ps1,MIN_GB=0,jobs2 y targets propios que se
eliminan al cerrar. Sin cambios en runtime/domain/IPC/testdata; telemetría
no repetida. SHA final/pushbare y limpieza verificados en buzón e issue.
Plane pasa a Por revisar al cerrar desde servidor. Evidencia Mac
~/evidence/1593-r5 y servidor C:/VantareServer/evidence/1593-r5.
Campaña inerte; sin Polar/Clerk reales, productos, deploy, merge ni release.

## #1593 / VANTA-39 · Ronda 4 entregada al bare · 15/10/2026

Base de ronda d90b8ec04 ya publicada en PR draft #1659 por el orquestador.
Misma rama vantareapp/isa-1593-descuento-informes, Mac ~/wt-1593, nightly
3f82af867 verificada sin cambios. SHA final y siete commits en el buzón
~/orq/1593.buzon.md; pendiente publicar el SHA nuevo en GitHub.

- P2-8: cinco aceptados dan **seis cobros en total**, contando los ya consumidos
  con el tramo de tres. reward_granted_at conserva la primera concesión;
  reward_expires_at sigue el plazo del tramo nuevo. Regresión con cobro entre
  tramos, cinco restantes y corte tras seis totales.
- P2-9: creación creating/uncertain sin ID se libera a los30min, conservando
  el derecho por cuenta y admitiendo un intento nuevo/Plus. Marca durable de
  recuperación visible al Owner aunque aún no exista promoción/suscripción;
  el pago la resuelve y consume el derecho. IDs remotos conocidos mantienen
  GET y prueba terminal/CAS. Pro→Plus con Pro abierto espera con409 y mensaje
  claro, sin enlace de plan equivocado ni segundo checkout. Una creación remota
  sin respuesta puede dejar un checkout huérfano sin enlace entregado; esta
  recuperación es la decisión del orquestador R4, no atomicidad entre proveedores.
- P3-18: captura por elemento, continúa toda la página, intenta registrar el
  hueco y devuelve código saneado. Si falla conserva cursor para reintentar la
  página; los éxitos previos deduplican. Handler corta su bucle de páginas
  después de esa página y marca el fallo; no pierde facturas silenciosamente.
- P3-19: p_attempt obligatorio en SQL y helper; no existe concesión sin reserva.
- P3-20: resultado contable inseguro registra hueco antes de cuarentena, sin
  proyectar como factura la instantánea ambigua.
- P3-21: cuenta borrada fuera de la lista y cuenta viva dentro, con mutación
  accounts-deleted que rompe precisamente ese filtro. B03 se mantiene.

Evidencia Mac ~/evidence/1593-r4/RESULTADOS.md: **152/152 pgTAP** de promoción,
**24 controles SQL y3 Edge** detectados. Regresiones de los seis puntos
RED→GREEN con logs. Catálogo completo NOSUPERUSER BYPASSRLS: nightly59/33PASS,
rama60/34PASS, mismas26 suites rojas,1266→1418 aserciones,**cero regresiones**.
Baseline R2 mismo actor/runner y SHA nightly sin cambios. Edge completo
**644PASS/0FAIL/2ignored** históricos. Formato, lint producción/nuevos módulos,
superficies, quality, retirada y diff-check PASS. Ocho require-await del test
checkout siguen históricos. Sin Rust tocado: clippy/nextest/lifecycle/telemetría
omitidos; sin target propio creado. Docker/Edge con lock/trap, sin red real.

Issue #1593 y Plane VANTA-39 pasan a Por revisar al cerrar desde servidor.
Runbook actualizado sin las frases contradictorias de3+6 ni soporte obligatorio
para una reserva sinID ya caducada. Decisiones multi-cuenta aceptado y caducidad
configurable6meses permanecen. Sin Polar/Clerk reales, productos, secretos nuevos,
deploy, scheduler, merge, release ni promoción.

Siguiente: publicar SHA del bare a PR1659, ejecutar CI y re-review independiente
R4; sandbox autorizado y QA visual/Windows siguen pendientes. El check remoto
observado (GitGuardian SUCCESS) acredita d90b8ec04/R3, no R4. Seis descuentos
Polar Pro200/Plus300 EUR repeating1/3/6, sin productos nuevos; catálogo vacío
y campaña inactiva. #1620/#1639 conservan su coordinación pendiente.

## Histórico · #1593 / VANTA-39 · Ronda 3 entregada al bare · 15/10/2026

PR draft [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659),
todavía en el SHA de R2 d16f28426 hasta que publique el orquestador. Misma rama
vantareapp/isa-1593-descuento-informes, worktree Mac ~/wt-1593, base nightly
3f82af867. SHA final y commits separados por punto en ~/orq/1593.buzon.md.

- P1-2: derecho de primer mes por cuenta durante la semana, recuperable tras
  expirar el intento. GET remoto devuelve el enlace abierto sin duplicarlo;
  solo expired/failed permite otro. CAS y datos durables sobreviven GC, pago
  consume una sola vez; incierto sin ID devuelve 503 y requiere reconciliar.
  No continúa silenciosamente a precio normal. B03 y RPC solo servidor probados.
- P2-4: canceled/paused anteriores se dan por limpios con fecha/motivo durable,
  sin PATCH prohibido. Prueba de lote confirma el premio en la suscripción
  vigente en la siguiente pasada, incluyendo el fallo remoto real 422.
- P2-5: reconciliación alimenta el ledger por order ID aunque el inbox ya
  completó/quarantinó su efecto. Traza de origen/fecha y huecos durables por
  datos incompletos; incidencia Owner y sin rearme hasta reparar. Un refund
  inicial sigue siendo autoritativo aunque otra factura tenga datos incompletos.
- P3-9/10/13: ciclo después de trial incluido, factura inicial ausente visible
  y resolución automática; false o retirar el flag nunca apagan contabilidad.
- Decisiones de Isaac P3-11/12: multi-cuenta aceptado sin control ni más PII.
  Saldo pendiente caduca a seis meses de calendario Madrid desde la concesión,
  duración única en private.report_promotion_policy.reward_valid_months,
  guardada por tramo. No cambia tramos existentes al editar la configuración;
  bloques ya confirmados terminan naturalmente sin retirarlos por caducidad.
  Fechas de caducidad disponibles en payload Owner; no UI Rust nueva.

Evidencia ~/evidence/1593-r3/RESULTADOS.md: **133/133 pgTAP** de promoción,
**20 mutaciones SQL y 5 Edge** detectadas con fallo de comportamiento. Catálogo
completo NOSUPERUSER BYPASSRLS: nightly 59/33 PASS, rama 60/34 PASS, mismas
26 suites rojas del entorno, 1266→1399 aserciones, **cero regresiones**.
Baseline R2 reutilizado con mismo runner/actor y base nightly verificada sin
cambios; comparación final guardada. Edge completo **640 PASS / 0 FAIL /
2 ignored** históricos. Lint producción/nuevos módulos, formato, superficies,
quality, retirada y diff-check PASS. Dobles antiguos completan la RPC contable,
sin suprimir checks. Ocho require-await del test checkout siguen históricos.
No Rust modificado: clippy/nextest/lifecycle/telemetría omitidos esta ronda.

La mutación histórica de quitar solo el guard de prepare sobrevive por las
otras barreras y por ausencia de suscripción tras B03; se conserva su evidencia.
El control deleted ahora rompe la frontera nueva de recuperación y cae en la
aserción de cuenta borrada, sin desactivar defensas de producto.

Sin Polar/Clerk/Storage reales, productos, secretos nuevos, deploy, scheduler,
merge, release ni promoción. Lock huérfano del reinicio comprobado y liberado;
gates posteriores con lock y trap, sin contenedores propios pendientes. Sin
target Rust creado. QA visual/Windows y sandbox siguen pendientes. Polar no
cambia: seis cupones fijos EUR Pro200/Plus300, repeating1/3/6, sin productos.

Siguiente: el orquestador sube el SHA del bare al PR, ejecuta CI y pide revisión
independiente R3. El check remoto visto solo acredita R2 (GitGuardian SUCCESS).
Catálogo sigue vacío, campaña inactiva; integración #1620/#1639 y activación
requieren su coordinación/autorización. Runbook:
supabase/functions/billing-report-promotion/README.md.

## Histórico · #1593 / VANTA-39 · Ronda 2 · 15/10/2026

PR draft [#1659](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1659).
Revisión DeepSeek NO APTO leída y corregida; pendiente revisión independiente nueva.
Base de ronda `cc1989b0b`, nightly `3f82af867`, misma rama
`vantareapp/isa-1593-descuento-informes` y worktree Mac `~/wt-1593`.
SHA final y commits por punto, push al bare y FIN: `~/orq/1593.buzon.md`.
El PR remoto sigue en la entrega anterior hasta que lo suba el orquestador.

- P1: cierre 02/11/2026 **19:00 Europe/Madrid** exclusivo; bordes y DST probados.
- P2-1: el premio sigue el plan/suscripción activos; conserva alta/ventana y saldo,
  audita traslados, limpia el descuento anterior y soporta entregas fuera de orden.
  Este caso ya no lanza conflicto ni manda el webhook a cuarentena.
- P2-2: saldo por periodos de facturas pagadas con descuento, sin prorrateo; la
  factura inicial va separada. No se consume por el reloj del espejo. Cupón finito
  de 6/3/1 según saldo restante: un traslado/reparación no regala meses extra.
  Rearme de un mes solo tras factura real, con clear/attach y fase durable que
  recupera respuestas perdidas. PATCH tardío conserva los cobros pendientes.
- P2-3: error saneado durable por cuenta, visible al Owner; sigue el lote.
  Presupuesto 45 s y cursor del último cliente procesado.
- P3: porcentaje/duración/validación en allowlist; comparación del mayor ahorro y
  ciclo leído de Polar; conserva beneficios ajenos. RPC de checkout anterior a
  reservar intento, inyectable y probado con campaña encendida. Config gateway
  verify_jwt=false y gate obligatorio, sin activar deploy. Owners explícitos.
  Marca/reserva durable de primer mes; facturas e historial la consumen aun sin flag.
- Política: devolver la factura inicial pierde el premio; dos spams bloquean nuevos
  tramos **desde la segunda revisión**, conservando los ganados antes de ella,
  aunque el cron vaya tarde. El corte queda persistido. Miniapp refleja incidencia,
  devolución y conservación de meses tras spam.

**Evidencia `~/evidence/1593-r2/`:** 98 pgTAP de promoción PASS, 15 controles SQL
RED y tres controles Edge RED de comportamiento (lote, checkout, gateway).
SQL completo con el MISMO runner NOSUPERUSER BYPASSRLS: nightly 59 suites/33 PASS,
rama 60/34 PASS; 1266→1364 aserciones aprobadas y **0 regresiones**. Se conservan
26 suites rojas comunes; no se ocultan. Cuatro que pasaban con el superusuario de
R1 exponen requisitos de fixtures (dblink, schema extensions, SET ROLE); no se
presentan como regresiones de producto ni se elevan privilegios para taparlas.
Edge **632 PASS / 0 FAIL / 2 ignored**. Clippy admin PASS, Nextest **18/18**, fmt,
lint de producción/nuevos módulos, superficies deploy, calidad y retirada PASS.
El test de checkout conserva ocho require-await históricos, idénticos a nightly;
comparación JSON y fallo inicial de lint guardados. No cambian runtime/domain/ipc/
testdata: lifecycle y telemetría omitidos. QA visual/Windows siguen sin acreditar;
permiso de captura Mac ausente en R1, no se afirma captura nueva.

Sin Polar/Clerk/Storage reales, credenciales nuevas, productos, deploy, scheduler,
merge, release o promoción. Catálogo vacío y flag deshabilitado. Siguen haciendo
falta los seis descuentos fijos (Pro 200 / Plus 300 céntimos, repeating 1/3/6),
no productos nuevos; el de un mes sirve también saldos parciales. Reconciliar
historial de órdenes antes de activar/retomar si faltaron webhooks. Distribución y
atribución de creador frente a #1620 y fusión con la UI #1639 siguen al orquestador.
No se promete atomicidad entre una petición Polar ya enviada y un borrado B03.

Siguiente: revisar diff/controles, subir SHA del bare a PR #1659, ejecutar CI del
nuevo SHA y repetir revisión independiente. Después, sandbox autorizado para
facturas, traslados, rearmes, devoluciones y pausas; sin activación automática.
Contrato vigente: `supabase/functions/billing-report-promotion/README.md`.

## Histórico · #1593 / VANTA-39 · Entrega inicial · 15/10/2026

Implementación aislada desde nightly `3f82af867`, rama
`vantareapp/isa-1593-descuento-informes`, worktree Mac `~/wt-1593`.
Encargo aprobado del 15/10: Pro/Plus mensual, primer mes lanzamiento, siguientes
normales salvo 2 aceptados → 3 meses / 5 → 6. Un premio por cliente/entorno;
dos spams lo revocan. Consume decisiones finales #1594 y preserva B03/#1622.
SQL privado/RLS, operaciones con lease, GET/PATCH y recuperación de respuesta
perdida; cliente Polar abstracto probado con dobles. Owner recibe y muestra
aceptados, tramo y último descuento confirmado. Progreso en Hub queda propuesta.

Estado: preparado para revisión, no integrado ni activado. Catálogo vacío y
feature flag off. **Sin** Polar/Clerk/Storage reales, productos/descuentos reales,
secretos, deploy, scheduler, GitHub push/PR, merge, release ni promoción.
Hito backend `7c7583caa`; SHA final y commits entregados al bare local constan en `~/orq/1593.buzon.md`.

Evidencia local `~/evidence/1593/`: 46 pgTAP nuevos PASS; nueve mutaciones de reglas
reproducen RED; catálogo completo 59→60 suites, ninguna común empeora (22 suites
heredadas rojas conservadas, no se ocultan). Edge **613→624 PASS**, 0 FAIL,
2 ignored históricos. Clippy y build admin PASS, Nextest **18/18** (incluye
regresión nueva); fmt/lint, deploy surface, calidad/retirada PASS. SQL y Edge bajo
lock Docker, contenedores desechables sin red; Deno con caché y sin permiso de red.
No cambian runtime/domain/ipc/testdata: lifecycle y telemetría omitidos.
QA visual pendiente: GPUI demo arranca, pero macOS devuelve
`could not create image from window`; `CGPreflightScreenCaptureAccess()=false`.
No se presenta una captura ni se afirma QA visual o Windows.

Decisiones conservadoras para revisar antes de activar: fin de altas el
02/11 **00:00** exclusivo (hora final no especificada); 45 días son 1080 horas;
seis meses del tramo mayor empiezan en el siguiente cobro. #1620 conserva su
campaña de productos de lanzamiento a precio permanente: esta implementación
solo admite **normales** mensuales y no migra suscripciones. Códigos de esa
campaña no se importan; Isaac debe decidir su distribución/atribución en esta.
Prerrequisito de códigos: descuento 20 % / 2 meses con scope normal y atribución
conservada al aplicar lanzamiento; no hay entrada de códigos nueva en la app.

Crear después, con autorización: seis descuentos Polar EUR, Pro fijo 200 céntimos
repeating 1/3/6 meses y Plus fijo 300 repeating 1/3/6, cada uno limitado a su
producto normal mensual. No hace falta crear productos nuevos. Configurar IDs,
secreto de cron/flag y verificar facturas en sandbox antes de producción.
B03 se comprueba antes de PATCH y ACK; una petición ya enviada no tiene
atomicidad con el borrado de otro proveedor: reconciliar/cancelar tras esa carrera.
Integración de la UI nueva de #1639 pendiente de merge de dependencias; el campo
opcional está listo y su pequeño bloque debe conservarse en el detalle nuevo.

Siguiente acción del orquestador: revisar diff/evidencia y estas decisiones,
resolver integración con #1639, generar PR/CI y solo promover tras autorización.
Contrato/runbook completo y lista Polar:
`supabase/functions/billing-report-promotion/README.md` desde raíz Git.
## VANTA-83 / #1661 · ronda 5 terminada para revisión · 16-oct-2026

- Código validado d037f8f661083791c848ba7081452d3488b974c1; PR draft #1666
  hacia nightly. Re-review r3 APTO; esta ronda requiere revisión nueva.
- F1 definitivo: refund del origen o de factura de la suscripción, o revocación,
  retira el descuento de creador mediante GET/PATCH/ACK durable e idempotente.
  Fencing, marcador anterior al primer pago y cuenta borrada; fallo visible Owner.
  Founders conserva prioridad para detener renovación antes de limpiar creador.
- F2 riesgo aceptado por Isaac: puede usar el código cualquiera que lo conozca.
  F3 UUID y pertenencia por creador/entorno/intervalo; Owner registra ambos cupones.
  F4 runbook de rotación sin ampliar managedIds ni reiniciar repeating.
  F5 webhook real probado: initial solo desde billing_reason, nunca metadata.
- Consulta Polar real autorizada: solo GET con token de lectura por stdin SSH,
  nunca impreso ni guardado en Mac. Mapa real completo y plan online en
  C:/VantareServer/evidence/polar-auditoria/POLAR_PRODUCT_MAP.production.json
  y plan-catalogo-online.txt. Producción ready=true, writes=0, inventario
  0 clientes/0 subs activas/0 pedidos (2026-10-15T23:45:37.832Z).
  Se revalida al aplicar. aplicar-catalogo.txt contiene comando exacto para Isaac;
  Deno instalado en Mac, requiere otro token con escritura. Bundle conservado.
- Rojo→verde: online sin escrituras, initial falsificado, retirada ausente y
  pertenencia SQL. Final: 286 pgTAP, 260 Edge y 25 Owner Nextest PASS;
  check workspace, Clippy Owner -D warnings, fmt Rust/Deno y quality/retirement
  PASS (456 huellas). Logs C:/tmp/founders-1661-evidence y Mac ~/orq/founders-1661-evidence.
- No repetir Nextest global/lifecycle/telemetría: R5 Rust solo toca Owner;
  se conservan R4 1798 Nextest (14 omitidas), lifecycle y 25 telemetría PASS.
- Plane Por revisar al entregar; SHA final y CI verificados en PR/issue.
  Sin apply, dinero, deploy, merge de feature, release ni capturas (#1655).
  #1593 debe adoptar escritor común/preservar plazos y respetar revocación;
  #1624 debe rebasarse. Web intacta. IVA y renovaciones sandbox pendientes.

## VANTA-83 / #1661 · ronda 4 terminada para revisión · 16-oct-2026

- Pro Plus confirmado 9,99/99,90 EUR; primer periodo 6,99/69,90.
- Creador puede acompañar al lanzamiento: solo atribución en primer checkout,
  20 % desde renovación. Cupones API-only mensuales/anuales configurados en
  polar-launch-prices.json (11/12 meses). Comisión manual 30 % mes 1 y 10 % meses 2–12.
- Claim y atribución atómicos; primer pago obligatorio, lease/GET/PATCH/ACK,
  reintento sin reiniciar repeating y fallo visible en Owner. Informes puede
  reabrir selección tras el primer pago; mayor ahorro, empate informes,
  perdedor registrado. Founders añade Stable + Nightly vitalicios; refund retira ambos.
- [Contrato #1593](../../billing/creator-renewals-1661.md). Rama leída sin tocar;
  coordinación en issuecomment-6204073057 de #1593. **Pendiente en su integración**:
  adaptar el escritor al arbitraje/lease y preservar plazo/saldo al volver de
  informes; no activar dos escritores independientes ni afirmar prueba conjunta.
- Código 52fab00d6ad0e4932d434bd3ffab35613e79aa2b. PR draft #1666 → nightly;
  contiene merge autorizado eb553c7fe; sin integración de esta feature.
- RED creador + campaña y Nightly contra baseline; 252 Edge, 247 pgTAP,
  1798 Nextest PASS (14 omitidas por perfil), check/Clippy global/fmt,
  lifecycle y 25 telemetría PASS; quality/retirement PASS (456 huellas).
  Primer Nextest falló por fixture nueva desordenada; se corrigió el orden,
  conservando la validación estricta. Log del fallo y pasada verde conservados.
- Plan offline completo regenerado en C:/VantareServer/evidence/polar-auditoria/plan-catalogo.txt.
  Modelo válido; apply_ready=false hasta inventario vivo verificado. Comando
  de Isaac en aplicar-catalogo.txt vecino; no se ha ejecutado apply ni consultado Polar real.
- Plane se devuelve Por revisar con PR y resumen. CI remota del push final se
  comprueba en la entrega; no se afirma despliegue, merge ni release.
- Sin dinero, servicios comerciales reales ni capturas (#1655). Web intacta,
  contrato VANTA-42 actualizado; #1624 debe rebasarse sin tocar su rama.
  Validación de IVA/renovaciones reales y activación pendientes del operador.

## VANTA-83 / #1661 · ronda 3 de acabado (16/10/2026)

Re-review R2 **APTO**, informe `C:/VantareServer/evidence/ds-rev-1661/review-r2.md`.
N2: creador solo propiedad propia y UUID válido, rechazo anterior al claim.
N3: aplicación de producción exige inventario en vivo vacío antes de escribir:
cero clientes de organización y cero suscripciones activas/pedidos por producto
existente afectado. Consulta fallida/incompleta también aborta. Ready calculado:
modelo válido + inventario verificado; offline false, sin afirmar revisión real.
Merge autorizado de `origin/nightly eb553c7fe` sin conflictos; incluye cola nueva
y retirada de CI Linux. No se fusiona la rama de issue en nightly.
Regresiones R3 RED contra versión anterior; GREEN final: **181 Edge PASS**,
**1797 Nextest PASS**, 14 omitidas por perfil; **check y Clippy global PASS**,
fmt/quality/retirement PASS y **11 tests del alcance de gates PASS**. Rust serial
por cola nueva, MIN_GB=0; no ha hecho falta fallback de Clippy por crates en R3.
SQL/lifecycle/telemetría no se repiten en R3: no cambia schema ni su código;
evidencia de rondas anteriores conservada. Diff R3 y merge revisados.
PR #1666 draft a nightly; rama ya contiene eb553c7fe y no está BEHIND.
Plane Por revisar al cierre; CI remota pendiente. Sin promoción a nightly,
despliegue ni release. Evidencia en `C:/tmp/founders-1661-evidence` y Mac
`~/orq/founders-1661-evidence`; siguientes acciones: revisión R3/CI y operación
manual del catálogo con mapa completo, IVA sandbox y ventas cerradas durante corte.
Plan/bundle/comando se regeneran; ninguna consulta ni mutación contra Polar real.

## VANTA-83 / #1661 · ronda 2 de seguridad (15/10/2026)

Review R1 NO APTO: B1/I1 y M1–M4 corregidos. Admisión SQL persistente de
Founders por cuenta/entorno antes del grant; rechazo de Launch nueva con
cuarentena e incidencia crítica Owner, sin cortar replay/reembolso histórico.
Checkout bloqueado ante admisión o pago recibido pendiente con binding.
Venta separada por entorno, ACL verificadas, precio configurado e IVA coherente;
reactivar Pro vuelve a cancelar renovación con recibo por revisión remota.
Una confirmación vieja no completa una reactivación posterior. Reembolsar
Founders no reactiva Pro (decisión aceptada), ni hay refunds automáticos.

Decisión adicional de Isaac: campaña de beta pública con **descuento `once`**
sobre productos normales, sin productos recurrentes de lanzamiento nuevos.
Pro 599→399 / 5999→3990, Plus 999→699 / 9990→6990; renueva siempre al normal.
Ventana por entorno en JSON, producción 26-oct→26-nov 19:00 Madrid.
Checkout aplica descuento servidor, sin trial ni entrada libre de códigos;
rechaza creador + campaña, valida código exacto fuera de ella y cambia la
huella del intento al cambiar oferta. Los tests del modelo retirado de productos
separados se sustituyen por tests de precio normal, `once`, fechas, no acumulación,
historia, preflight, ownership, reintentos, token y salida exclusiva.

RED: cuatro regresiones webhook contra ec47efa5; SQL R2 sin columna de entorno;
cuatro regresiones de checkout once contra handler original. GREEN Mac:
188 pgTAP y 176 Edge PASS tras cambio de modelo. Check workspace y Clippy del
crate Owner PASS; Nextest Owner **25/25 PASS**. Clippy workspace falló por RAM dos
veces, evidencia conservada; alcance incremental de crate tocado, un job,
sin sccache, VANTARE_CARGO_MIN_GB=0. Sin repetir telemetría/lifecycle: runtime,
IPC y servicios Rust no cambian en R2; validación completa anterior conservada.

Plan completo regenerado sin token/--apply en servidor:
`C:/VantareServer/evidence/polar-auditoria/plan-catalogo.txt`,
`production_apply_ready: true`. Comando exacto (no ejecutado): fichero vecino
`aplicar-catalogo.txt`; bundle Mac `~/orq/polar-auditoria/isa-1661` fuera del
worktree desechable. Isaac debe aportar mapa completo, token en entorno,
verificar IVA en sandbox y revisar/publicar los nuevos productos draft.
No consultas ni cambios contra Polar real; web intacta, #1624 debe rebasarse.
Entrega R2 aislada: push y PR #1666 draft a nightly. Siguiente: orquestador revisa
R2/CI y coordina #1624/VANTA-42; Isaac verifica IVA en sandbox y decide aplicar
el catálogo con su mapa completo. Sin merge, deploy, release, capturas (#1655)
ni operaciones reales. fmt, quality y retirement PASS. Evidencia R2 conservada
en `C:/tmp/founders-1661-evidence` y Mac `~/orq/founders-1661-evidence`.

## VANTA-83 / #1661 · Plan Founders (15/10/2026)

Rama `vantareapp/isa-1661-founders`, base asignada
`28800654c5bb4ca425b49bd827d0ee8cbbeeb155`, worktree propio isa-1661.
Plane En curso; PR draft [#1666](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1666)
a nightly; Project Vantare, `area:licencias`, sin milestone asignado.

Decisión definitiva de Isaac: **Founders es un plan de 50 EUR una vez**,
todo el catálogo presente/futuro para siempre; desde la beta pública del
26-oct-2026 19:00 Madrid **sin fecha final**, con interruptor SQL de venta.
Pro/Pro Plus pueden comprar: derecho inmediato y cancelación de renovación al
final del periodo pagado, sin reembolso. Una única política `end_period`,
recibo persistente de cancelación y estado pendiente/completado visible en Owner;
los errores reintentan mediante el inbox existente. Alternativa proporcional
retirada con autorización de Isaac por simplicidad. Sin operaciones reales.

Launch Edition retirada del catálogo de compra y de los botones. Se conserva
la lectura de mappings, pagos y derechos históricos, migraciones y tests.
El script prepara Founders en español. El producto real ya existe según Isaac;
los IDs se centralizan en `supabase/functions/scripts/founders-production-config.json`,
fragmento para fusionar con `POLAR_PRODUCT_MAP`, sin aplicar cambios reales. El contrato incorpora primer periodo Pro
3,99/39,90 y renovación 5,99/59,99, extra Pro Plus, creador no combinable,
informes desde mes 2 y beta pública. El modelo recurrente antiguo de #1620
requiere reconciliación antes de aplicar catálogo en producción; se impide esa
aplicación. **#1624 debe rebasarse sobre este PR**, sin tocar su rama aquí.

Derecho `vantare.plan.founders`, servicios v10/control v5/fotos v10, textos de
cuenta ES/EN/IT/PT-BR. [Contrato y payload web para VANTA-42](../../billing/founders-1661.md).
Repo web intacto. Founders no concede roles ni canales privados.
Límites: credencial perpetua offline no revocable hasta reconexión; para cerrar
venta futura, desactivar también producto/enlaces entregados de Polar.

Validación final local: **152 pgTAP PASS** (42 Founders, 57 Owner,
34 reembolsos, 19 tombstones), **193 Edge PASS** en Mac con lock Docker.
**1795 Nextest PASS** (14 omitidos por perfil) y **494 pruebas incrementales
Hub/Owner PASS** (4 omitidas), check/Clippy/fmt PASS. Lifecycle PASS y
telemetría **25/25 PASS**. Gates de Windows seriales, target propio;
última fuente Rust validada `5f39b449880b7a637ecd29559b9e0e9a1fbb2bac`.
El cierre posterior solo añade compatibilidad SQL para una suscripción ya
cancelada, su test y evidencia/texto. Quality/retirement PASS (456 huellas).
Regresión de credencial RED con normalizador original. Diff completo revisado.
Logs en `C:/tmp/founders-1661-evidence` y Mac `~/orq/founders-1661-evidence`.
Conservados fallos previos de RAM/mmap y cortes del orquestador/T3; repetición
sin sccache con un job y VANTARE_CARGO_MIN_GB=0 autorizado.

Entrega aislada: PR #1666 draft a nightly, push autorizado; Plane pasa a
Por revisar con resumen. Última consulta CI: promoción, quality ratchet y
GitGuardian PASS; native-linux y agregado bloqueante en curso. No se afirma
CI completa ni integración. Sin captura (#1655), deploy, dinero, merge ni release.
Siguiente: orquestador revisa PR/CI y coordina rebase de #1624 y compra web
VANTA-42; Isaac incorpora el fragmento a la configuración y valida apertura cuando corresponda.

Actualización posterior: inventario real comunicado por Isaac documentado: Pro mensual
4,99 EUR, Launch Edition histórica 30 EUR y Founders 50 EUR. Pro anual, 5,99/59,99
y Pro Plus aún no existen en producción. 69 pruebas offline de mapping y catálogo PASS, incluida la regresión del fragmento de
Founders; sin repetir Rust/SQL porque no cambian código nativo ni schema.

## #1627 / PR #1639 · VANTA-21 · ronda 5 (15/10/2026)

Worker Codex macOS arm64, sin subagentes ni servicios reales. Seguimiento por
excepción explícita en `~/orq/1627.buzon.md`; sin Notion/Plane/GitHub.
Entrada `980649944`; worktree `~/wt-1627r5`, misma rama de issue.

R5 corrige reparación con cupo agotado (trigger de aceptación suspendido solo
para restaurar decisiones en la misma transacción), añade auditoría por fila con
reviewer original y marcador de reparación (también si fue borrado; barrera de
auditoría suspendida solo bajo lock DDL en esa transacción y restaurada antes
del commit), y repone `admin_report_owner_changed`
(40001) tras el lock tanto para informes antiguos como contribuciones.
Spam antiguo conserva motivo. Las decisiones de ambos orígenes son finales;
la UI ofrece Aceptado/No aceptado/Spam solo antes de decidir y permite guardar
versión desde Aceptado/Arreglado. **No se recupera «Arreglado en X» ya perdido
por R3**: el Owner debe confirmarlo de nuevo desde evidencia; los `fixed` aún
válidos se conservan.

El borrado relee suscripciones después del tombstone #1622 para incluir compras
anteriores a la barrera, y consulta Polar por el UUID del checkout para incluir
compras completadas cuyo webhook aún no llegó. Combina/deduplica ambos orígenes.
GET Polar 404 deja evento sanitizado y permite continuar;
los errores transitorios siguen siendo incompletos/reintentables. Procedimiento
manual del Owner en `supabase/functions/native-admin/README.md` (panel del mismo
entorno, comprobar/cancelar y repetir con la confirmación original). Sin retirar
barreras ni ampliar el candidato a producción.

| Check local | Nightly bf5eead43 | Rama R5 |
| --- | --- | --- |
| Catálogo SQL completo, Docker sin red | 59: 34 PASS / 25 FAIL | 74: 49 PASS / 25 FAIL |
| 59 suites SQL comunes | 1306 aserciones PASS | 1306 PASS; cero diferencias |
| Gestión pgTAP | 57 / 1 suite | 206 / 16 suites PASS |
| Seguimiento canónico | 35 PASS + concurrencia/rollback | 35 PASS + concurrencia/rollback |
| Edge/Deno sin red | 613 PASS / 2 omitidos | 643 PASS / 2 omitidos |
| Clippy admin/services `-D warnings` | PASS | PASS |
| Nextest admin/services Mac serial | 172 PASS | 178 PASS |

Rojo→verde conservado para reparación con cupo ocupado, auditoría con reviewer
borrado, dueño cambiado, motivo/finalidad de informes antiguos, UI, suscripción
tardía local y compra Polar con webhook retrasado/404. La reparación se prueba
reaplicando el fichero real y verificando idempotencia y barreras restauradas.
Los 25 fallos genéricos son heredados, idénticos en ambas ramas; no se declaran
verdes. Nightly tuvo un fallo intermitente inicial de login; repetición serial
completa 172/172. Fmt Rust/Deno, quality y 456 huellas de retirada PASS.

Evidencia y SHAs finales: `~/evidence/1627r5/RESULTADOS.md`, `TABLA-SQL.md` y buzón.
Rust 1.95 fijado, jobs=4 y target propio `~/target-1627r5` retirado al cerrar.
PowerShell no está instalado y el wrapper usa Win32: Cargo directo en este Mac.
Sin cambios runtime/domain/ipc/testdata; lifecycle/telemetría no se repiten.
No valida Windows/DPI/teclado, SaaS real, CI remoto ni despliegue/upgrade remoto.
Se han corregido migraciones del candidato R3/R4, sin aplicar nada a servicios
reales; un entorno que ya las registró requiere plan de upgrade del orquestador.
Pendiente revisión del orquestador; sin merge, promoción, deploy ni release.

## #1627 / PR #1639 · VANTA-21 · ronda 4 (15/10/2026)

Worker Codex macOS arm64, sin subagentes, GitHub ni servicios reales. Excepción
explícita del orquestador: sin Notion/Plane; seguimiento en `~/orq/1627.buzon.md`.
Rama `vantareapp/isa-1627-miniapp-gestion`, entrada `1ce7c0edd`.
Nightly `bf5eead43` (#1622 incluido) fusionado mediante merge `9a70cbc7`.
Código entregado por hitos, incluido borrado separado `83494734`; SHA final de
la entrega documental y copia al bare `~/vantare.git` en el buzón y la evidencia.
Pendiente de revisión del orquestador; sin promoción de canal, deploy ni release.

**Regla de informes:** una decisión de contribución es final. Aceptado,
rechazado, spam y arreglado no vuelven a Recibido/En revisión, tampoco los
históricos sin fila de revisión. SQL devuelve conflicto y la UI oculta esas
vueltas. No se añade una acción Reabrir. Arreglado sigue ocupando 1/día y
2/semana UTC/cuenta; también cuentan las revisiones aceptadas si un servidor
anterior alteró el estado. La migración restaura el estado de esas revisiones,
sin borrar su nota/fecha ni los arreglos que todavía conservan estado `fixed`.
No recupera «Arreglado en X» ya borrado al reabrir en R3; debe volver a confirmarse
con evidencia. R5 añade auditoría por fila reparada y evita consumir de nuevo el cupo. Los informes antiguos
`testing_center_reports` admiten Spam; sus títulos se alinean a la izquierda.

**Anual cerrado por Isaac el 15/10:** 30 % del pago anual completo, sin
prorrateo. 100,00 € → 30,00 € al pagar en el mes 1; renovación en mes 13 → 0 €.
No autoriza pagos reales ni producción.

**Borrado conectado a #1622:** Edge compara el correo actual de Clerk antes
de iniciar la solicitud; SQL vuelve a proteger dueño y actor bajo locks.
La barrera, anonimización y auditoría se confirman juntas antes de cancelar
Polar, borrar Clerk y drenar Storage con el limpiador común. Una solicitud
privada conserva solo hash del correo normalizado, UUID/issuer/subject y fecha.
Un fallo posterior exige repetir con el mismo correo; no necesita recuperar
PII ya borrada y acepta 404 de Clerk solo con esa solicitud previa. No hay
reembolso ni reintento automático. Sigue limitado a sandbox.

Compatibilidad del merge: se conservan locks UUID de #1622 y su identidad
Clerk; el resolver mantiene además el bloqueo de gestión. El espejo de
pagos/refunds acompaña al ledger comercial de nightly, sin saltarse la
revocación por reembolso. Fixtures de identidad y la prueba concurrente se
adaptan al dispatcher, sin ampliar permisos de producto.

| Check local | Nightly bf5eead43 | Rama R4 |
| --- | --- | --- |
| Catálogo SQL completo, Docker sin red | 59 suites: 34 PASS / 25 FAIL | 72: 47 PASS / 25 FAIL |
| Aserciones de suites SQL comunes | 1306 PASS | 1306 PASS; cero pérdidas |
| Gestión pgTAP | 57 checks / 1 suite | 178 checks / 14 suites, todas PASS |
| Triaje / seguimiento, runners canónicos | 83 / 35 PASS | 83 / 35 PASS |
| Locks de admin frente a borrado | 4 órdenes PASS | 4 órdenes PASS |
| Borrado miniapp frente a webhook | No existe | 2 órdenes PASS, espera observada |
| Edge/Deno sin red | 613 PASS / 2 omitidos | 638 PASS / 2 omitidos |
| Clippy admin/services `-D warnings` | PASS | PASS |
| Nextest admin/services Mac, serial | 172 PASS | 178 PASS |

Los 25 fallos del catálogo genérico se conservan en ambos árboles: no se
presentan como SQL verde. Las 13 suites exclusivas de gestión pasan. Los
runners canónicos cubren cuota concurrente, snapshot obsoleto, ACL y rollback.
La aserción comercial de auditoría ahora exige actor/acción/objetivo sin copiar
resultados de cuentas; conserva la comprobación en lugar de omitirla.
Fmt Rust/Deno, quality y retirada (456 huellas) PASS. Rust 1.95 fijado,
`CARGO_BUILD_JOBS=4`, target propio `~/target-1627r4`, retirado al cerrar.

Evidencia: `~/evidence/1627-r4/RESULTADOS.md` y `TABLA-SQL.md`, logs completos,
comparación por número de aserción y capturas GPUI demo `informes.png`,
`informe-decidido.png`, `borrado-confirmacion.png`. Se inspeccionaron títulos,
ausencia de reapertura y confirmación de correo; no son pruebas de SaaS real.

Límites: Windows/DPI/teclado físico, OAuth/Clerk/Polar/Storage reales, CI remota,
despliegue y actualización de un esquema remoto previo no se verifican.
SQL completo validado desde catálogo limpio; la intercalación de migraciones
R1/R3 con #1622 requiere revisar el orden de aplicación antes de un despliegue.
Sin cambios en runtime/domain/ipc/testdata: no se repiten lifecycle/telemetría.

## #1627 / PR #1639 · VANTA-21 · corrección R1 (15/10/2026)

Worker Codex macOS arm64, encargo del orquestador, sin subagentes ni servicios
reales. Excepción explícita: no Notion/Plane/GitHub; seguimiento en
`~/orq/1627.buzon.md`. Rama `vantareapp/isa-1627-miniapp-gestion`, entrada
`52b1d3c39`; nightly `64c493e4f` fusionado primero mediante merge `2354cd416`.
Se recoge mediante el bare local `~/vantare.git`; no promoción de canal,
despliegue, release ni CI remoto. SHAs finales en el buzón y la evidencia.

Las contribuciones ya pasan por el motor de revisión de #1594: nota humana,
aceptación 1/día y 2/semana UTC por cuenta, revisión duradera y purga a 90 días
de logs/telemetría. `human` identifica revisión manual sin fingir propuesta de
modelo; la ruta pública anterior conserva propuesta obligatoria y permisos.
Spam se lee, filtra y confirma en la miniapp. La decisión sigue siendo inmutable;
un cambio incompatible devuelve conflicto. El trigger compartido retira los metadatos de arreglo al salir de `fixed`;
R4 bloquea la reapertura de contribuciones decididas.

Personas usa resúmenes sin pagos y recuentos agregados. Creadores agrega las
líneas una sola vez. En Docker, con 3.000 cuentas, 36.000 pagos y 100 creadores:
Personas 16,8 ms y Creadores 958,7 ms; antes la búsqueda excede el límite sintético
de 6 s y se cancela. Las lecturas auditan quién/qué/cuándo/objetivo sin copiar PII
ni pagos. La primera compra posterior al watermark usa el ledger, sin releer todo
Polar. Un refund identificable pero inválido pone esa factura pendiente de
revisión y bloquea su comisión; el resto se muestra. Cuarentenas y pagos históricos
atrasados requieren reconciliación revisada, sin un nuevo barrido automático.

**Decisión de Isaac, 15/10/2026: anual = 30 % del pago anual completo.**
La tasa activa está centralizada en `private.native_admin_commission_rate`.
Un anual de **100,00 € genera 30,00 €** al pagar en el mes 1; renovación en
mes 13 genera 0 €. No se prorratea entre meses. Esta decisión fija el cálculo;
no autoriza pagar comisiones reales ni activar producción.

UI: «· anual», etiqueta «—», Owner y Tester simultáneos, tarjeta Clientes/Ventas,
fechas «2 sep» y nota obligatoria de revisión. Capturas GPUI demo frente al HTML
en `~/evidence/1627-r3/comparativa.html`; no representan acceso a SaaS real.

Verificación: Docker con todas las migraciones y 133 pgTAP de gestión; motor
compartido con runner canónico #1594, 83 pgTAP + concurrencia/ACL; seguimiento
#1610, 35 pgTAP + concurrencia/rollback. Edge completo 613 PASS / 2 omitidos.
Clippy `-D warnings` y fmt con Rust fijado 1.95 PASS; Nextest admin/services
177 PASS con tests seriales y `CARGO_BUILD_JOBS=4`. Dos ejecuciones paralelas
mostraron fallos intermitentes existentes de callback; logs conservados.
Comparación de todas las suites SQL comunes bajo el runner genérico: mismos
937 asserts válidos y 22 suites incompatibles en nightly y candidato, sin nuevos
fallos. Se usan los runners canónicos para triaje y seguimiento, que sí pasan.
Quality/retirada: 456 huellas PASS. Target propio `~/target-1627r3`, borrado al cerrar.

Límites: Windows/DPI/teclado físico y OAuth/Clerk/Polar reales pendientes;
en esta R1 histórica el borrado aún no estaba conectado; R4 lo sustituye.
Los efectos externos nuevos siguen limitados a sandbox. Falta revisión del
orquestador. La decisión anual queda cerrada el 15/10/2026. No hay activación en producción.
Evidencia anterior r1: `~/evidence/1627/RESUMEN.md` (histórica).

## #1608 · R11 · Guarda y permisos de triage (15/10/2026)

Base `1ac73ce20`; comparación con nightly `64c493e4f`. Solo cambian el fixture
de triage y este handoff. `run-triage-local.py` ejecutado en ambos árboles:
**83/83 PASS**, incluidos rollback, cap concurrente y login real del worker.
La versión anterior de la rama reproduce el aborto tras ocho checks.
Catálogo completo con B03: los dos checks de permisos pasan; triage queda en
**43/84** frente a **42/83** en nightly, con los fallos de admisión ya documentados.
Su ruta B03 de borrado sigue sin una ejecución completa en verde en este contexto;
la cobertura de identidad citada en R10 procede de la suite comercial.
Catálogo repetido: **48 suites nightly / 59 rama**, ninguna común empeora.
Evidencia y comparación por aserción: `~/evidence/1608-r11/RESULTADOS.md`.
Sin ejecución nueva de otros runners de checkpoint ni de Docker/PowerShell.
SHA y entrega al bare local en `~/orq/1608.buzon.md`; revisión del orquestador pendiente.

## #1608 · R10 · Fixtures Clerk y revocación de replay (15/10/2026)

Encargo del orquestador sobre PR #1622; base `28b71186f`, nightly comparada
`64c493e4f`. Worktrees propios `~/wt-1608-r10` y
`~/wt-1608-r10-nightly`. Commits: `07d80038` (revocación/P3), `0d79ae42`
(fixtures/runner). SHA de entrega documental y push local en
`~/orq/1608.buzon.md`. Sin GitHub, Notion, Plane ni subagentes, por excepción
expresa; el orquestador gestiona el seguimiento y revisa el diff.

**R9-P1-1 resuelto:** las 12 suites que se rompían con B03 vuelven a pasar
con sus archivos originales del repo, sobre el catálogo completo:
hardening **48/48**, Clerk bootstrap **31/31**, native bridge **28/28**,
checkout **20/20**, report submission **55/55**, screenshots **80/80**,
agent jobs **71/71**, closeout **45/45**, candidate feedback **45/45**,
triage outbox **40/40**, F2 **6/6**, F3 **8/8**. También se recuperan todas
las aserciones que la identidad rompía en las suites previamente rojas:
Codex **60/61**, privacidad **34/33** (plan antiguo desajustado), core **61/72**,
access **33/56** (aborta), participación **14/20**, followup **5/35** (aborta)
y triage **42/83**, igual número aprobado que en nightly. El test nativo de
concurrencia `.psql` también pasa **6/6** en ambos árboles.

Los fixtures crean perfil y binding Clerk antes de filas dependientes y usan
claims completos (`iss/sub/role/sid/azp`). La detección del registro B03 selecciona
la ruta de fixtures. R10 verificó el catálogo completo y el procedimiento de
hardening descrito abajo; eso no demuestra el resultado de cada runner de
checkpoint ni de la imagen Docker. El runner propio de triage se ejecutó en R11.
No se modifican ACL, RLS ni funciones de producto para satisfacer esos tests.

Cambios de significado explícitos por el modelo nuevo (no se eliminan checks):

- Bootstrap: Auth de Supabase y un `sub` UUID ya no crean/resuelven cuentas;
  se comprueba su rechazo. Un login Clerk hace bootstrap explícito antes del
  claim de dispositivo; se conservan UUID estable, separación por subject y
  ausencia de vinculación por correo. Identidad incompleta devuelve `28000`.
- Bridge nativo: el issuer debe coincidir exactamente con el registro. La
  barra final se rechaza y se comprueba que no crea un alias. El alias legado
  canónico se siembra como hace la migración B03; no se normaliza al leer.
  Una identidad exacta ya vinculada no se puede reasignar a otro UUID (`23505`).
  Son 28 checks en lugar de 27 por el rechazo explícito adicional de la barra.
  La carrera conserva dos sesiones que compiten por la MISMA identidad exacta.
- `native_account_data_upgrade`: el FK de validaciones continúa existiendo,
  ahora hacia `profiles` tras B03; antes del corte sigue hacia `auth.users`.
- Core: la misma promoción con SHA incoherente se rechaza por el guard previo
  de referencias (`23503`) en vez del CHECK posterior (`23514`).
- Triage (corregido en R11): con B03, `current_account()` debe ser la única
  función privada ejecutable por authenticated y no puede haber privilegios
  sobre tablas ni columnas privadas. Sin B03 se conserva exactamente el check
  de nightly: schema `private` cerrado. El borrado usa el webhook y conserva
  el UUID duradero del reviewer en auditoría privada; el borrado del autor sigue
  purgando contexto y reviews. La aserción de auditoría sigue exigiendo tres
  filas (en el catálogo completo falla por las mismas dos reviews que no llegan
  a crearse en nightly). Este cambio de etiqueta no se presenta como fallo
  literalmente idéntico; está detallado en `COMPARACION.json`.

**R9-P2-1 resuelto:** migración aditiva
`20261015110000_isa_1608_revoke_deleted_authorizer.sql`. Retirar replay puede
limpiar la referencia al Owner borrado. Conserva TODOS los locks de UUID en
orden; solo deja de atribuir el tombstone del autorizador retirado a esa limpieza.
El reporter sigue sujeto a la barrera. La excepción exige que los ocho campos
de replay/autorización queden vacíos/falsos y que TODOS los demás campos sean
idénticos. No permite cambiar report, diagnóstico ni propietario.
Regresión **RED 7/11 → GREEN 11/11**, con revocación real como authenticated,
limpieza de los ocho campos, auditoría y diagnóstico conservados; cambios
adicionales y reporter borrado siguen rechazados. El runner incluye
`--before-deleted-authorizer` para reproducir RED. P3: eliminado el segundo
`p_account is null` redundante en el helper de reports.

**Verificación nueva, no heredada de R9:** catálogo completo sin adaptar
fixtures: **48 suites nightly / 59 rama**, una DB clonada por suite; ninguna
suite compartida pierde checks aprobados ni pasa de PASS a FAIL. Los tests
nuevos de upgrade se ejecutan además con sus datos anteriores a la migración:
identidad **18**, conflicto **4** y refunds **26**, todos PASS. En el catálogo
completo esos tres salen rojos por no sembrar el estado anterior: no son
fallos compartidos con nightly (sus archivos no existen allí).

`run-supabase-hardening-postgres.ps1` reproducido con PostgreSQL **17.11**
instalado y pgTAP, sin pwsh/Docker: **1059 checks pgTAP PASS**, clean/upgrade/
restore, 8 pares de carreras y comprobaciones de resultados, sentinel/RLS/ACL,
archivos truncado/corrupto rechazados (**48 filas PASS** en el resumen).
El propio `.ps1` actualiza sus fixtures de carreras (sesión completa y hashes),
separa el checkpoint histórico del corte B03 y guarda dump antes de liberar
la DB clean y sus roles globales para el upgrade. No se reejecutan resolutores
antiguos después del corte. El intérprete local extrae sus SQL/heredocs y no
reescribe fixtures. La sintaxis PowerShell y la imagen Supabase no se han
ejecutado en este Mac; el procedimiento y sus diferencias están en RESULTADOS.
Nightly ejecutada con el mismo intérprete: clean hardening48/Clerk31 pasan,
projection42/43 falla y las carreras originales fallan por fingerprints no
válidos; no se afirma que el script entero pase en nightly.

Runner comercial: **19 suites / 574 pgTAP**, **108 rutas / 638 checks** de
carreras PASS. Edge desde raíz, con tipos y config del repo: **594 nightly /
613 rama PASS, 0 FAIL, 2 ignored**. Deno `supabase/tests`: mismo TS2353 en ambos;
sin check, **28 PASS / 5 FAIL**, mismos cinco nombres. Calidad: **456 PASS**.

**R9-P2-2 rectificado:** la tabla nueva enumera cada resultado rojo y enlaza
su salida nightly/rama. Solo se llaman idénticos los fallos contrastados por
aserción, SQLSTATE y salida normalizada. Codex60/61 y privacidad34/33 mantienen
planes desajustados en ambos. Quince suites rojas comunes conservan etiquetas y
abortos iguales. **No se presentan como abortos idénticos** estos tres casos:
Pilot11 pasa de `23503 pilot_profiles_account_id_fkey` a `42501 authentication
required`; GitHub delivery8 pasa de permiso denegado a `23503
account_owner_unresolved`; Linear outbox8 pasa de FK ausente a ese guard previo.
Los tres siguen rojos sin perder checks aprobados, pero su causa exacta cambia.
Triage42 se documenta arriba por su cambio explícito de contrato. No se califican las 12 regresiones
corregidas como fallos preexistentes. Evidencia completa:
`~/evidence/1608-r10/RESULTADOS.md` y `COMPARACION.json`.

Límites: PostgreSQL/Storage local sintético; ningún servicio, secreto ni dato
real; sin dependencias nuevas. Rust omitido: sin cambios propios en `native/`.
Sin CI remota, despliegue, merge, promoción, release ni autorización de venta.
Siguen pendientes staging gestionado e inventario real de buckets antes de vender.
Docker lock tomado y liberado; sin servidor PG ni stack propio al terminar.
Siguiente: review del orquestador; entrega únicamente al bare local.

## #1608 · R9 · Identidad de servidor y batería completa (15/10/2026)

Base autorizada `494f5c452`; nightly `64c493e4f` incorporada sin conflictos
mediante merge `18ff846c`. Cambios propios: `b9b06d33` (adaptadores), `f711fc2d`
(revocación de replay), `0d3da715` (llamadores de identidad) y `1cfe19da`
(fixtures vigentes). El merge conserva los handoffs de ambos proyectos. Worktree `~/wt-1608r8`, rama worker propia:
la rama original estaba ocupada por otro worktree limpio en el SHA inicial.
Entrega al bare local con el refspec explícito hacia
`vantareapp/isa-1608-cierre-comercial`; SHA final/push en el buzón del orquestador.

**R8-P1-1:** los adaptadores service-only ya no fabrican claims `{sub,role}`.
Pasan el UUID verificado a tres funciones privadas `…_for_account`; wrappers
antiguos usan la misma implementación con `private.current_account()` real.
No se concede EXECUTE de helpers a clientes, servicio, triage, Pilot o publicador.
Se conservan validación, consentimiento, membresía, hashes, cuotas, retries y
crédito. Cada helper bloquea el UUID y comprueba el tombstone antes de filas;
una cuenta borrada no puede enviar. `current_account()` y sus ACL no cambian.

RED F1IP 22/26 → GREEN **26/26** con todas las migraciones. Regresión ampliada
**52/52**: triage/adjunto, claims conservados, ACL, Owner humano, calendario,
resolutores de servicio, dispositivos, entitlements, JWT native-data y borrado.
La preview sintética exacta de #1594 pasa **27 checks** tras TODAS las migraciones,
sin grants de envío artificiales. Batería comercial final: **19 suites / 569 pgTAP**,
**108 rutas / 638 checks** de carreras, incluidas las nuevas tablas triage.

Fixtures actualizados sin relajar producto: ledger37 comprueba acceso efectivo
(B02 conserva la fuente financiera), canonical8 exige bootstrap/sesión completa,
admin57 usa registro/claims verificados y rechaza issuer no exacto, roadmap31
acepta que B03 haya retirado handle_new_user. Los cuatro pasan sobre el catálogo
completo y conservan sus pruebas anteriores a B03 (admin56 en ese contexto).

La batería completa encontró otra regresión real: retirar replay después de una
autorización Owner fallaba con `account_owner_is_immutable`. Corrección aditiva
limitada a borrar los campos de replay/autorización con el mismo `report_id`.
En R9 ambos UUID conservaban bloqueo y comprobación de tombstone; el test
6/6 fijaba incorrectamente como válido bloquear la revocación si el autorizador
estaba borrado. **Decisión del orquestador en R10: ese bloqueo es un bug**;
la corrección y el nuevo RED/GREEN figuran arriba. El cambio de report sigue
rechazado y no hay excepción general para cambios de propietario.

**Inventario de causa raíz:** todas las migraciones + catálogo instalado de
nightly/rama: solo dos fabricantes de claims, ambos corregidos; 33 funciones
leen identidad y 38 contando wrappers transitivos, revisadas individualmente.
Servicios nativos/admin/billing/jobs usan parámetros o bindings explícitos;
Storage usa propietarios persistidos/manifest/ruta y su preflight sin filas.
Inventario y evidencia: `~/evidence/1608-r9/inventario-identidad.md`;
tabla por TODAS las suites: `~/evidence/1608-r9/RESULTADOS.md`.

**Rectificación R10 de la entrega R9:** era incorrecto presentar las suites
rojas de la rama como fallos compartidos o solo como snapshots históricos.
La review R9 y la nueva ejecución R10 demuestran que **12 suites pasaban en
nightly y fallaban en la rama**. R10 corrige sus fixtures EN EL REPO y las doce
pasan sobre todas las migraciones, sin traducción externa de fixtures ni grants
adicionales. No se debe usar el informe R9 para afirmar paridad con nightly.
La comparación válida y sus fallos concretos están en
`~/evidence/1608-r10/RESULTADOS.md`, con logs separados de ambos árboles.
Los recuentos y checkpoints que preceden a esta rectificación son evidencia
histórica R9; la sección R10 de arriba fija el resultado y los límites vigentes.

**R8-P3-1 documentado:** son **11 policies TO public en 10 tablas distintas**,
no 11 tablas: profiles aporta SELECT y UPDATE. Son profiles, licenses, devices,
user_entitlements, billing_customers, billing_subscriptions, subscriptions,
license_events, license_validations y hwid_changes. Con SELECT de tabla como
los defaults de Supabase, anon recibe **42501** por no tener EXECUTE sobre
current_account, en lugar de 0 filas; sin fuga. Sonda local 12/12. No se abren
ACL anon. Los clientes vigentes usan authenticated o el servidor autorizado.

Sin Notion/Plane/subagentes/GitHub, por excepción explícita; ningún servicio,
secreto o dato real, ni dependencia nueva. PostgreSQL17/pgTAP local desechable y
schema Storage del fixture R6; no se usó Docker en R9, ni queda stack propio.
Rust no ejecutado: sin cambios propios en native frente al merge de nightly.
Storage/PostgREST HTTP no repetidos; evidencia anterior R8 sigue siendo histórica.
No CI remota, despliegue, promoción, release ni venta. Siguen siendo obligatorios
el staging gestionado y el inventario de buckets de producción antes de vender.
Siguiente: review del orquestador sobre el diff y los fallos compartidos del
informe; el seguimiento y los estados del tracker los gestiona el orquestador.

Reproducción mínima de R8-P1-1 (sin DSN ni servicios reales):

```sh
python3 supabase/tests/run-commercial-local.py --pg-bin <PG17/bin> \
  --storage-schema <schema-Storage-local.sql> --output <evidencia> --testing-identity
# RED: mismo comando con --before-testing-identity.
# Default, sin --testing-identity: 19 suites y todas las carreras.
# RED de privacidad: --testing-identity --before-posthog-consent-clear.
```

## #1608 · R8 · Entrega local para revisión (15/10/2026)

Inicio `d5796ad1a`; correcciones `9496d71d` (Pilot) y `54a605a3` (deriva de
parches, regresiones HTTP y requisitos comerciales). Cinco archivos de rama,
sin Rust ni dependencias nuevas. R7-P1-1 RED SQL42501/HTTP403→GREEN200 con JWT
emitido por handler real; tras borrar, el mismo JWT queda bloqueado (403).
R7-P3-3 cuatro RED→GREEN atómicos; P3-4 riesgo de escritor futuro documentado;
P3-1/P3-2 obligatorios antes de vender, pendientes del orquestador/Isaac.

63 migraciones; 12 suites/352 pgTAP PASS, histórico232, upgrades18/4/26,
Pilot90+10+concurrencia; 80 tablas/105 rutas/620 checks, aliases40,
owners10/multipart64/buckets17, locks17/admin24 PASS. PostgREST/JWT/Ed25519 y
reconciliación SQL/HTTP PASS. Edge609/0/1 ignored desde raíz, con tipos.
Storage original v1.70.3: RED retiene, restauración drena los mismos uploads;
readonly conserva cola con 503, RW200 drena: **0 uploads/partes/colas/archivos**.
Quality456, fmt, lint producción, compile Python, surface y diff PASS.
Lint adicional del fixture TS sin modificar detecta su import HTTPS histórico
(no-import-prefix); conservado, sin excluir regla ni cambiar dependencias.
Fallos iniciales de permisos TMP Deno/iat redondeado del fixture conservados y
corregidos en la ejecución. Evidencia `~/evidence/1608-r8/RESULTADOS.md`.

Stack propio r8stack/sidecar/proxy retirados, auth sintética retirada y lock
liberado; stack ajeno intacto. Árbol final/SHA/push al bare local en buzón e
informe. Sin Notion/Plane/GitHub/subagentes/servicios reales, CI remota, merge,
promoción, deploy, release o venta. Rust y QA física omitidos por alcance.
Siguiente: review del diff por el orquestador; sin aceptación comercial implícita.

## #1608 · R8 · Migración y requisitos previos a vender (15/10/2026)

R7-P3-3: cada uno de los cuatro reemplazos de texto Pilot comprueba su patrón
y lanza RAISE específico si falta. RED: los cuatro cambios de fuente se
aceptaban en silencio; GREEN: los cuatro se rechazan y revierten funciones y
trigger completos. Runner reproducible `--pilot-patch-drift
owner|deletion|objects|uploads`, evidencia `~/evidence/1608-r8/patch-{red,green}-*/`.

**Requisitos obligatorios antes de vender (R7-P3-1/P3-2):**

- Probar en staging gestionado `commercial_storage_cleanup.py` contra la versión
  Storage y backend S3 que se desplegarán, con NULL/UUID, abort, fallo real,
  recuperación y retries; acreditar 0 uploads/partes/bytes/colas. El test local
  v1.70.3 no lo sustituye. Si cambian GUC, version preflight o codificación del
  uploadId, la adaptación falla cerrado: 503 y cola conservada. Validación y
  despliegue gestionado siguen pendientes del orquestador/Isaac.
- Inventariar buckets de producción con `owner IS NOT NULL OR
  nullif(owner_id,'') IS NOT NULL`, con autorización separada y sin exportar PII.
  Si hay propietarios de usuario históricos, resolver su retirada mediante
  una entrega de purga por API y verificarla antes de vender. Este corte no
  purga esos owners ni demuestra su ausencia. Registrar también el contrato
  global sin PII de objetos sin owner/manifest, según `tools/storage/README.md`.

**R7-P3-4, riesgo aceptado en este alcance:** la excepción de auditoría de
lecturas identifica la acción por el texto de la fila. No demuestra por sí
sola la procedencia de una lectura. Hoy `admin_audit_log` no admite INSERT de
anon/authenticated/service_role/Pilot/publicador: el único escritor de aplicación
es `native_admin_execute`, SECURITY DEFINER con Owner vivo verificado, acciones
cerradas y campos de auditoría construidos por el servidor; no acepta una fila
arbitraria. Cambiar el texto en una petición tampoco permite omitir el actor
borrado ni mutar un target borrado. Por eso no hay un bypass alcanzable por
estos clientes. Un escritor DEFINER futuro podría etiquetar una mutación como
lectura: deberá revisar esta excepción antes de añadirlo o ampliar ACLs.
Un marcador GUC o un booleano en la fila tendría la misma autoridad que el
escritor; autenticar de verdad el origen requeriría separar el canal/rol de
auditoría, complejidad injustificada aquí. Se conserva el límite explícito;
no se afirma que PostgreSQL autentique el nombre de acción.

## #1608 · R8 · Identidad Pilot tras B03 (15/10/2026)

R7-P1-1: migración aditiva concede solo USAGE de `private` y EXECUTE de
`private.current_account()` a `pilot_profile_writer`; no accede a tablas de
identidad ni recibe el rol authenticated. Policy de recibos y RPC privada Pilot
usan ahora esa identidad validada, igual que perfil/foto y RPC públicas.
RED reproducido `42501 permission denied for function current_account`;
GREEN 20 pgTAP después de todas las migraciones. Incluye alta sin foto, cambio
con foto, replay, binding inválido y cuenta borrada; inventario de permisos de
owners de funciones/roles explícitos de policies. No otro rol sin BYPASSRLS
queda pendiente: el publicador de roadmap no usa este resolver ni recibe acceso.
PostgREST real con JWT emitido por handler nativo: 200 alta/replay/foto;
el mismo bearer después de borrar da 403. Evidencia `~/evidence/1608-r8/`.
Rama aislada desde `d5796ad1a`; seguimiento del orquestador por excepción,
sin Notion/Plane/GitHub/servicios reales. Resto de R8 en curso.

## #1608 · R7 · Cierre para revisión (15/10/2026)

Base `88051556` incorporada en merge `f59faf2b`. R6-P1-1/P2-1 resueltos con
Storage **original**: preflight sin filas, abort backend real, 200 tras recuperación;
0 uploads/partes/bytes/colas. P2-2: lecturas admin auditadas con targets borrados,
actor vivo obligatorio; mutaciones siguen bloqueadas. P3-2 merge resuelto;
P3-3 contrato global sin PII explícito. **DUDA P3-1**: propietarios de buckets
históricos no se purgan; inventario real pendiente de Isaac/orquestador.
Catálogo ampliado a #1612: purga perfiles/recibos y atribución de fotos por ruta.
Checks nuevos: SQL337 + histórico232 + upgrades18/4/26, Pilot90/10+concurrencia,
80 tablas/105 rutas/620 checks, aliases40, owners10, multipart64, buckets17,
locks17, admin24, JWT/RLS/Ed25519 PostgREST y reconciliación real. Edge609/0/1 ignored;
Storage HTTP signed, readonly→RW y retries; fmt/lint/surface/Python/diff/456 huellas PASS.
Evidencia `~/evidence/1608/r7/RESULTADOS.md` e
[informe R7](../../analysis/review-cuentas-pagos-2026-10.md). SHAs/push/FIN en buzón.
Origin bare Mac, sin GitHub/CI remota ni trackers; excepción sin Notion/Plane/subagentes.
No merge a nightly/promoción/deploy/release/venta ni producción. Review externa
pendiente. Los apartados R5/R6 siguientes son evidencia histórica, sustituidos
por este estado para Storage; no requieren activar ninguna imagen propia.

## #1608 · R7 · Barrera tras incorporar #1612 (15/10/2026)

El gate de catálogo detectó dos tablas nuevas desde nightly: pilot_profiles ya
hereda la barrera; pilot_private.operations queda cubierto por el mismo guard.
Añadidas tres carreras reales: perfil, recibo y foto sin owner atribuida por
UUID/hash.jpg. Borrado elimina perfil y recibos, y encola también esas fotos.
GREEN: 105 rutas / 620 checks, catálogo con pilot_private y cobertura completa;
cinco regresiones pgTAP de purga. No se rebaja el gate que detectó la omisión.
Las antiguas carreras de audit de lectura pasan a mutación set_tester: las
lecturas de borrados ahora tienen sus siete controles positivos/negativos propios.
Paquete #1612 original verificado aparte: 90 pgTAP, concurrencia y 10 rollback.
Evidencia `~/evidence/1608/r7/`; fuera de native, sin cambios Rust propios.

## #1608 · R7 · Storage gestionado (15/10/2026)

R6-P1-1/P2-1: imagen original v1.70.3, sin variante. El preflight abort
se descarta con RETURN NULL; nunca persiste INSERT/UPDATE tras tombstone.
Ruta/upload/rol/operación verificados; Storage original elimina backend y metadata.
RED 503 retenía upload/parte/bytes/cola → GREEN con originales NULL/UUID,
partes reales, PNG y dos entregas webhook firmadas. Fallo backend readonly
conserva 503 y pendientes; recuperación RW y replay convergen a 200 y 0/0/0/0.
Evidencia `~/evidence/1608/r7/`; procedimiento y límites en
[tools/storage](../../../../tools/storage/README.md). Imagen/parche propios retirados.
R6-P3-1 documentado como DUDA: buckets globales no tienen purga de owner
histórico; inventario prod no autorizado, pendiente del orquestador/Isaac.
R6-P3-3: configuración global sin owner/manifest debe excluir PII.
Sin despliegue, producción, venta ni actualización de trackers del orquestador.

## #1608 · R7 · Lecturas admin de borrados (15/10/2026)

R6-P2-2 corregido: el actor vivo mantiene el control Owner y las lecturas
search/get conservan el UUID borrado en su auditoría. Los targets borrados de
lectura no se tratan como mutación; actor y objetivos mantienen orden de locks.
RED real sin migración: search falla por audit y get por el lock exterior.
GREEN: siete regresiones pgTAP, mutación y actor borrados siguen rechazados.
Evidencia `~/evidence/1608/r7/admin-red/` y `sql-final/`.
Storage gestionado e integración #1612 siguen en validación; no producción.

## #1608 · Ronda 7 · Integración de base (15/10/2026)

Merge de origin/nightly conservando los handoffs de #1608 y las entregas
#1612/#1620. Conflicto exclusivamente documental resuelto sin eliminar secciones.
R6-P1-1/P2-1 y regresión admin en curso; no despliegue ni promoción.

## #1608 · Ronda 6 local · R5-P1-1 y cierre de worker (14/10/2026)

Entrega para review de Claude en la rama `vantareapp/isa-1608-cierre-comercial`,
inicio `0a8e794f`, base histórica `e5c90be5`. Tres hallazgos de r5 corregidos
con commits locales por hallazgo; HEAD completo y FIN en `~/orq/1608.buzon.md`.
GitHub #1608 / PR #1622 / proyecto Vantare: sin acceso ni estado remoto nuevo.
No hay push, CI del SHA nuevo, merge, promoción, deploy, release ni venta.
Seguimiento del orquestador conforme a la excepción del encargo; sin Notion,
Plane ni subagentes. VANTA-16/17/15 son referencias del contexto, no estados
consultados/actualizados por este worker.

**Abort:** SQL DELETE de metadata no sería seguro: el backend guarda metadata
incluso sin partes, y partes con bytes fuera de SQL. Se prepara una variante de
Storage v1.70.3 en `tools/storage/`: digest y hash de fuente fijados; parche
solo de abort para sesión de servicio verificada, validación bucket/key/upload,
sin upsert de prueba. Usuarios conservan autorización original. Backend real
se limpia antes del DELETE original de upload (cascade partes). Ningún INSERT
ni UPDATE obtiene bypass SQL por rol/GUC. Deriva/reaplicación del parche falla.
El limpiador Edge separa el drenaje de objetos; abort/list/ACK fallidos mantienen
upload en cola y HTTP 503 sin impedir limpiar objetos terminados independientes.

**RED→GREEN real:** imagen original y limpiador de `0a8e794f`: manifest NULL y
UUID, parte multipart con bytes y PNG privado de 68 bytes, dos retries; persistían
upload+parte+cola+PNG. Con solo limpiador corregido y Storage original, el PNG
se elimina y el upload sigue pendiente. Con variante preparada, upload/parte,
ambas colas y bytes desaparecen; dos retries idempotentes. Nueve rechazos HTTP
por ruta incorrecta, JWT no-service firmado y service JWT falsificado; INSERT
service tras tombstone sigue rechazado. Un fallo inyectado del abort conserva
upload/parte/cola, pero elimina PNG. Fallo **real** de backend readonly mantiene
1/1/1; al restaurar RW convergen también los mismos fixtures RED y todos los
pendientes: **0 uploads / 0 partes / 0 cola uploads / 0 cola objetos**, backend
sin archivos. La última entrada durable que no estaba en el listado de fixture
se recuperó desde la cola real y se drenó; intento anterior/errores conservados.

**Checks nuevos:** Storage HTTP local real anterior; admin 24 + locks r5 17;
buckets 17, inventario 78 tablas / 102 rutas / 603 checks; aliases 40;
56 migraciones del checkout y nueve suites pgTAP **317 PASS** con Storage real;
Edge **553 PASS / 0 FAIL / 1 ignored** con tipos; fmt/lint dos TS, deploy surface,
Python compile, diff check y **456 huellas PASS**. Evidencia `~/evidence/1608/r6/`.
Errores de preparación conservados: dump posterior a app tuvo triggers/policy
que necesitan private/public; se retiraron del dump solo esos objetos de app
para reinstalarlos mediante migraciones intactas. pgTAP del contenedor era
symlink Nix: copia dereferenciada temporal a Homebrew. Bootstrap amplía columnas
owner de buckets; coverage FK detectó la herencia omitida y se corrigió el guard,
no el gate. Estado/convergencia verificados antes de detener servicios propios.

**Límites:** la imagen original v1.70.3 no converge el abort de manifest;
la variante requiere review/decisión de integración del orquestador y activación
separada. Un proveedor que no admita esa imagen necesita alternativa validada;
no se promete compatibilidad gestionada ni despliegue automático. No hay
servicios/cuentas/pagos reales, lectura de .env o secretos instalados, nuevos
paquetes/dependencias ni cambios nativos. Rust/Nextest/lifecycle/telemetría,
upgrades históricos y GUI/OAuth/Clerk/Polar/S3 gestionados no se repiten: alcance
SQL/Edge/Storage local; se conserva evidencia histórica sin presentarla como nueva.

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
## #1620 / PR #1621 · lanzamiento sin trial, decisión B (14/10/2026)

Encargo explícito al worker Codex macOS arm64; base limpia `c6739de8`, rama
`vantareapp/isa-1620-precios-polar`, nightly `953f041c` ya incorporado.
Project Vantare/area:licencias; VANTA-N omitido conforme a autorización previa.
GitHub/Plane/PR/CI y última actualización remota no verificables desde este Mac:
el orquestador los actualiza al recoger/revisar el commit local.

Isaac decide B tras su compra sandbox: ningún producto de lanzamiento tiene
prueba gratis, tampoco por enlace/código de creador. Siete días solo para
Pro normal mensual/anual; Plus normal sigue sin trial. Sustituye la decisión
anterior de heredar trial Pro en lanzamiento. POST de lanzamiento sin campos
de trial; existentes con cualquier campo informado reciben PATCH separado
`trial_interval: null, trial_interval_count: null`, sin precios ni otros campos.
Se conservan IDs, precios activos/archivados, mapa, derechos y productos normales.

El preflight general conserva guardas y admite ese desvío reparable. El del
enlace exige los cuatro productos de lanzamiento sin trial tras reconciliar,
antes de crear descuento/enlace o devolver un enlace existente. Cada respuesta
de producto de lanzamiento debe quedar sin trial; el PATCH valida también ID y
organización. El enlace sigue rechazando cualquier override antes de escribir.
Mismo apply con/sin creador; reparación idempotente y reintento tras PATCH
confirmado con respuesta perdida. No se migran suscripciones/checkouts previos.
Runbook, contrato de producto y fragmento ISA-1620 actualizados.

Tres ciclos de comportamiento RED→GREEN: creación (44 PASS), reparación
(45 PASS), rechazo de respuesta con trial (46 PASS); catálogo final **47 PASS**
con identidad/reintento y enlaces nuevos/existentes, cuatro planes/configuración
parcial. Suite Deno completa **590 PASS/0 FAIL/1 ignored** (PostgREST no
configurado), tipos/lint/fmt, quality/retirada **456 huellas**, superficie deploy
y validador del fragmento PASS. Lint conserva exclusión existente no-import-prefix.
Primera suite lanzada desde subdirectorio: cuatro NotFound de fixtures .github;
log conservado, repetida correctamente desde raíz Git sin tocar tests ajenos.
Tests con entorno vacío, sin red, caché instalada y escritura solo en /tmp.
Rust/UI/telemetría/SQL omitidos: ningún cambio en esas áreas ni Edge desplegado.

Evidencia `~/evidence/1620/no-launch-trial/RESUMEN.md`; SHA final en
`~/orq/1620.buzon.md`. Solo rama local, sin push/merge/promoción/release/deploy,
servicios reales, secretos, dependencias nuevas o subagentes. Diff revisado.
Siguiente: revisión del orquestador y actualización de issue/PR; por su vía
autorizada aplicar en sandbox, confirmar cobro hoy en enlaces de creador y
siete días solo en Pro normal, revisar checkouts/compras previos por separado.

## #1631 / VANTA-70 · Reparación de la división de cuenta (15/10/2026)

Continuación autorizada sobre `c532f53a7`, con los commits recibidos intactos,
en `C:\VantareServer\wt\isa-1631`, rama `vantareapp/isa-1631-login-propio`.
Base ya incorporada `64c493e4f`; PR borrador
[#1635](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1635) a `nightly`.
Se eliminan importaciones obsoletas de helpers que ya viven en
`services/view/account.rs`, se importa `access` y el test de compra importa
`account_module_access` y `Section` directamente. Se conservan los helpers
privados y los tres compartidos con `pub(super)`. No cambia la lógica ni se
añaden dependencias. Comparados los cuerpos de las **24 funciones** extraídas
con el padre de `c532f53a7`: iguales salvo ruta relativa de `protocol` y espacios.
`services/view.rs`: **1039 líneas**; `view/account.rs`: **724 líneas**.
El techo de **1750** del test de arquitectura se conserva sin cambios.

Gates por `compilar.ps1`, target `C:\VantareServer\targets\1631`, Rust 1.95,
DuckDB oficial y defaults de los demás crates conservados:
fmt y Clippy `--workspace --all-targets -- -D warnings` **PASS**;
Nextest hub/services/ipc/runtime **1136/1136 PASS**, **8 omisiones** existentes,
**352,894 s**, incluido `hub_source_files_stay_within_their_line_budgets`.
El primer Clippy detectó además la importación perdida de `Section` en el test;
se corrigió sin cambiar aserciones y el gate completo pasó al repetirlo.
Logs `C:\VantareServer\logs\gates-1631-split-*.log`;
el fallo inicial se conserva en `gates-1631-final.log`.
Ciclo de vida no ejecutado: se cancela su espera en la cola tras varios minutos
con 3,5–3,7 GB libres frente a 4 GB mínimos, sin cargo/rustc activos al comprobar.
Se conserva el umbral; los tres gates pedidos en este relevo están aprobados.
Telemetría no repetida: este arreglo solo toca importaciones del Hub.
No se repiten capturas ni pruebas macOS/Clerk real; no cambia presentación ni
comportamiento. Las pruebas reales de R2 siguen pendientes de Isaac.
Siguiente: revisión del orquestador; SHA remoto, CI y estado en issue y PR.
Repetir ciclo de vida cuando la cola disponga de RAM.
Sin integración en canales, release ni despliegue.

## #1631 / VANTA-70 · R2 terminada para revisión en Windows (15/10/2026)

Relevo autorizado al worker GPT, worktree `C:\VantareServer\wt\isa-1631`,
rama `vantareapp/isa-1631-login-propio`, HEAD inicial `45581fe3c` (nightly
`64c493e4f` ya incorporada por el worker anterior). Se preservan los siete
archivos R2 recibidos sin commit. Código R2 consolidado en `fb5292c5b`,
con coautoría GPT. La entrega se publica en esa rama; el HEAD documental final
se verifica en el PR draft
[#1635](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1635),
base `nightly`; Plane VANTA-70 «En curso» verificado al empezar. Issue en
GitHub Project Vantare, `area:plataforma`; sin milestone comprometido.
Al cerrar este encargo VANTA-70 pasa a «Por revisar», con resumen y enlace al PR;
la issue y el PR registran el SHA remoto y la última verificación de estado.

R2 corrige caducidad/reinicio, cola llena, límite local y contraseñas rechazadas;
completa el canje pendiente con `AccountPoll`, reloj inyectado y máximo 30 s,
sin bloquear el servicio entre intentos. Conserva la sesión FAPI si se agota
el plazo y la cierra al canjear/cancelar/logout. No crea hilos ni dependencias.
Gates secuenciales con cola, target `C:\VantareServer\targets\1631`,
`CARGO_BUILD_JOBS=2`. Evidencia en `C:\VantareServer\evidence\1631-r2`.
Fmt/check/Clippy de producto PASS; Nextest Windows **1131/1131 PASS**, ocho
omitidos de la configuración existente; lifecycle **13/13 PASS**. Once
regresiones fallan al reproducir comportamientos R1 y pasan con R2 restaurada.
El build de capturas PASS; Clippy opcional `parity-capture` conserva 21 avisos
previos en tres archivos idénticos a nightly, registrado aparte en
[#1648](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1648).
No se relajan lints ni se amplía el arreglo a esos archivos.
Capturas GPUI **7/7** guardadas y revisadas, 1440×900, datos ficticios y
comandos remotos bloqueados; `capturar.ps1` y hashes junto a los PNG.
Telemetría **25/25 PASS**, sin omisiones ni corpus recortados: 722 s de suite,
incluidas las 190.308 fotos ACC (655,896 s en el caso completo).
Siguiente: revisión del orquestador y prueba real de Isaac con Clerk development,
según los comandos exactos de [la guía](../../auth/login-propio.md).
Clerk development queda como prueba manual de Isaac: no se llama a servicios
reales desde este encargo. Sin nueva integración, promoción ni release.
Nightly avanzó durante los gates a `bf5eead43` (#1622). Se conservan íntegras
sus 683 líneas nuevas de handoff y las secciones de login, sin otro merge de
ramas ni cambios de código: comprobación de contenido a tres vías PASS.
GitGuardian marcó seis alertas en `tools/triage/test_review_1602.py` y
`native/services/src/triage/tests.rs`, idénticos a la base `64c493e4f` y sin
cambios R2. Solo se consultaron metadatos; clasificación pendiente del
orquestador en [#1652](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1652).
No se asumen falsos positivos ni se silencian checks. El CI remoto se consulta
en el PR y no sustituye los gates locales aquí registrados.

## #1631 / VANTA-70 · Evidencia previa macOS (14/10/2026)

Encargo del orquestador al worker Codex macOS arm64, sin subagentes, GitHub,
push ni servicios de producto reales. Proyecto Vantare; issue
[#1631](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1631)
según el brief, estado/labels/PR/CI remotos no verificables desde este Mac.
Rama `vantareapp/isa-1631-login-propio`, base nightly local `b9ec75ed`; checkout
inicial limpio. Solo se autoriza el script específico `~/orq/plane-estado.py`:
VANTA-70 «En curso» verificado al retomar; resumen actualizado y «Por revisar»
verificado el 14/10/2026 a las 18:05 UTC. Sin búsquedas de trackers ni Notion.

Fase 1 `3f74eb58`: [investigación y diseño](../../auth/login-propio.md).
Google requiere navegador o sesión web del sistema; Discord no tiene vía
embebida confirmada. Ambos conservan el navegador. FAPI nativa mantiene el
client API token efímero; la aprobación explícita de Device Grant obtiene la
sesión OAuth v1 existente. Supabase/Polar, puente, licencia y almacén no cambian.
Native API y Device Grant del client público deben habilitarse en development;
no se ha configurado un servicio real ni probado compatibilidad en vivo.

Fase 2: checkpoint `b6844b4c`, correcciones verificadas en `e08e48f2`.
Servicios v9, cinco flujos email, código incorrecto, reenvío, cancelación,
recuperación y consentimiento en Orbit. MFA/tareas/requisitos adicionales
ofrecen el navegador. Los tokens FAPI no se guardan. El intercambio compara
identidad/generación antes de persistir OAuth y renovar licencia. Sin nuevas
dependencias. Se corrigen tipos/importaciones/fixtures, la exposición de la
contraseña por accesibilidad y los campos extra de acciones IPC sin datos.
La regresión de accesibilidad usa el constructor productivo sin AppKit.
Se mueven los pasos de email a login.rs; view.rs respeta el techo de 1750 líneas
sin elevarlo. Las expectativas de tests y los lints se conservan.

Autorización de continuación: Cargo directo, CARGO_BUILD_JOBS=2 y target
`~/target-1631`, --locked; sin pwsh ni compilar.ps1/cola Win32. Build de
services/ipc/runtime/hub PASS; el smoke de Análisis exige compilar también
storage (DuckDB bundled ya fijado, PASS). Clippy de los cuatro crates,
--all-targets y -D warnings PASS. Nextest compatible: **1072/1072 PASS**,
**53 omitidos** (49 AppKit + cuatro mediciones ignoradas por defecto).
Suite completa inicial: 1071 PASS/50 FAIL; 49 fallan antes de la lógica por
«Mac platform not created on main thread» y uno por tamaño, ya corregido.
El filtro local enumera solo esos 49: no se ignoran en el repo ni se declaran PASS.
Lifecycle macOS: **10/10 PASS**; tres escenarios Win32 no se compilan aquí.
Build final del código e08e48f2 PASS. Telemetría: **25/25 PASS**, incluidas
las 190.308 fotos ACC (959 s de suite; no se acorta ni altera el corpus).
Fmt/diff y retirada **456 huellas PASS**; fragmento ISA-1631 válido, sin publicar.

QA visual/interacción, esos 49 tests gráficos, Windows (DPAPI/lifecycle Win32)
y Clerk development real quedan al orquestador. macOS conserva JSON sin cifrar
con permisos 0600; máscara/Debug redactado no garantizan borrar todas las copias
transitorias de credenciales. No hay SQL/Edge nuevos ni cambios de contrato servidor.
Evidencia y fallos iniciales: `~/evidence/1631/`; comandos, inventario AppKit y
resultados en ESTADO.md. AVANCE/FIN en `~/orq/1631.buzon.md`.
Entrega local lista para review: FIN registra el HEAD documental final en el
buzón. Siguiente: el orquestador recoge los commits, revisa el diff y valida
development/Windows/QA antes de integrar. No se acredita ningún canal remoto.
Sin push, PR, merge, release, deploy, pagos ni promoción.

## #1620 / PR #1621 · nombres de cliente (14/10/2026)

Worker Codex macOS, encargo explícito sin subagentes, GitHub/Plane ni push.
Base local `0d03e6c0`, con nightly `953f041c` ya incorporado; rama
`vantareapp/isa-1620-precios-polar`, Project Vantare/area:licencias.
Se conserva la omisión autorizada de VANTA-N: trackers/PR/CI al orquestador.

Productos nuevos: Pro/Pro Plus y sufijo ` · Precio de lanzamiento`, con
Markdown del contrato y ciclo visible en el precio. Existentes: PATCH
idempotente solo name/description, separado de la lógica monetaria previa.
Launch Edition del mapa: mismo ID/precio/capabilities, nuevo texto que limita
la licencia a módulos existentes y mejoras, Engineer inicial, Testers sin
Nightly. Preflight rechaza edición ausente/ambigua/archivada/recurrente.
Sin i18n de producto documentado en Polar; ES sin duplicar productos.

RED cuatro tests fallidos por comportamiento → catálogo **42 PASS/0 FAIL**:
creación, reparación de nueve productos, precios archivados preservados,
mapa e IDs, cero escrituras al repetir, preflight, respuesta sin corrección
rechazada y reintento tras respuesta perdida. Evidencia en
`~/evidence/1620/checkout-names/01-red.log` y `01-green-final.log`.
Una primera ejecución GREEN falló por un UUID histórico inválido en el test;
se corrigió el dato sintético, conservando el log `01-green.log`.

Sin servicios reales, secretos, dependencias, push, merge, promoción o release.
Hito 1 local `b4605025`; hito 2 añade `theme=dark` a URLs nuevas/reutilizadas,
sin PATCH del enlace ni campo theme en POST. Query/fragmento/locale/ID/código
se conservan, cero writes en rerun: 1 RED → catálogo **43 PASS/0 FAIL**,
`02-red.log`/`02-green.log`. Investigación oficial del 14/10 en
[personalización Polar](../../billing/isa-1620-polar-checkout-personalizacion.md)
y `~/orq/polar-checkout-personalizacion.md`: logo/avatar, medias, tema,
color, textos, campos, idioma y dominio, con scopes y pasos del operador.
No hay controles de carmín/CSS/dominio alojado documentados; propuesta de
logo y medias con acento Orbit, y embed como entrega web separada.
Localización ES/EN del formulario exige feature beta; no traduce productos.
Gates finales de esta ronda: **586 PASS/0 FAIL/1 ignored** en la suite Deno
completa (PostgREST no configurado), incluyendo catálogo 43 PASS; tipos,
lint (exclusión no-import-prefix ya existente), fmt, quality/retirada456,
superficie deploy, fragmento ISA-1620 y planes offline sandbox/production PASS.
Tests con entorno vacío, sin permiso de red, ficheros solo /tmp.
Rust/UI/telemetría y SQL omitidos: ningún archivo de esas áreas cambia.
Informe/evidencia en `~/evidence/1620/checkout-names/RESUMEN.md`.
Diff completo revisado, sin nuevas dependencias ni cambios de precios de tabla,
gates o workflows. SHAs finales en
`~/orq/1620.buzon.md`. Siguiente: orquestador revisa diff y actualiza issue/PR,
aplica solo por su vía autorizada y verifica aspecto real en sandbox.

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
Arreglo 2: CLI exportada como `runCatalog` con fetch inyectable para probarla
sin red y con archivos temporales reales. RED: el 422 dejaba un archivo vacío;
GREEN: no hay salida durante HTTP ni tras fallar, reintento en la misma ruta
produce JSON completo y salida existente falla antes de HTTP sin sobrescribir.
Creación exclusiva al final, sync y retirada si falla escritura; preflight
requiere lectura de salida (comandos actualizados). Catálogo 37 PASS; logs
`02-red.log`/`02-green.log`. Sin garantía ante kill durante escritura.
Arreglo 3: diagnóstico 4xx proyecta solo `type`/`loc`/`msg` válidos, con token
de sesión redactado incluso dentro de esos campos. Nunca vuelca headers,
input, ctx ni cuerpo completo; 5xx/JSON ilegible/formato desconocido genéricos.
RED→GREEN con 400/401/403/422/429, validación directa y envoltorio detail,
ecos del token y respuestas inválidas; catálogo 38 PASS, `03-red.log` y
`03-green.log`.
Gates finales: suite Deno completa **581 PASS, 0 FAIL, 1 ignored** (PostgREST
no configurado); catálogo 38 PASS. Tipos, lint (exclusión existente
`no-import-prefix`), fmt del área, superficie deploy, planes offline
sandbox/production, quality y retirada **456 huellas** PASS. Entorno vacío,
sin permiso de red, escritura solo temporal `/tmp`; sin dependencias nuevas.
Rust/UI/telemetría y SQL omitidos: ningún cambio en native, runtime, domain,
IPC, testdata o SQL. Diff completo revisado; sin push, merge adicional,
promoción, release, deploy, pagos ni servicios reales. Solo rama local;
SHA final y lista de commits en `~/orq/1620.buzon.md` y resumen de evidencia.
Siguiente: revisión del diff por el orquestador, actualización GitHub/Plane
y repetición sandbox real por su vía autorizada.

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

## Servidor · VANTA-77 / ISA-1647c · 2026-10-15

Actualización 16/10 por encargo del orquestador: merge de `origin/nightly`
`9e48eb86f8d2cfc43b64010d2b1ac1c58768826a` en esta rama de issue.
Cuatro conflictos resueltos: vigilante ampliado y su instalador con manifiesto,
helper y hardening conservados; README con los avisos ampliados; CLI idéntica
a nightly, incluida la firma `[orquestador] ` de #1650. Vigilante/helper 54 y
CLI 10 PASS; calidad 456 huellas PASS. Suites Python activas de tools: 170 PASS
y 1 FAIL heredado de nightly, catálogo triage desalineado con ocho variantes
nuevas de services::Error (test_review_1602_r5). Reproducido el mismo fallo
en snapshot limpio de nightly; no se corrige fuera del encargo de merge.
SHA y resultados finales en #1647/#1649 y buzón 1647c.
No se despliega ni se envían pruebas reales en esta ronda; no fusiona la PR
ni promociona la rama a ningún canal. Las pruebas de runtime de abajo
corresponden al despliegue del 15/10, no se atribuyen a este merge.

Encargo del orquestador: revisión completa DeepSeek ds-rev1583-1649.
PR [#1649](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1649),
rama `vantareapp/isa-1647-vigilante-plane`, ahora incorpora la base #1583
`vantareapp/isa-1565-servidor@1d7e6edb5` mediante merge entre ramas de issue.
Se resolvió solo el instalador conservando hashes, helper y hardening.
P2-1: scripts ops/linux y todos los archivos del backup 1647b pasan de
svc Modify a RX; dueño Administrators; solo Administrators/SYSTEM escriben.
Backup con ACL propia y SHA256SUMS (integridad acreditada desde la revocación).
Instalación exige SHA-256 de instalador y ambos scripts en snapshot privado;
prueba de alteración abortó sin modificar el script instalado. Scripts Linux,
/etc/vantare y /var/lib/vantare son root, sin escritura de grupo/otros.
P3-6: tres intentos persistidos por campana, después abandono registrado;
ntfy sigue independiente. P3-8: cuerpos API no JSON omitidos con ID/clase.
P3-9: consulta desde última marca con solape 5 min, máximo 30 días al recuperar;
poda IDs antiguos, conserva pendientes. Fuera de esa ventana requiere revisión
manual. P3-10: lanzadores y despliegue reproducibles incluidos en el repo.

54 tests de vigilante/helper + 10 CLI PASS en Windows y Linux; quality
456 huellas PASS; bash -n de seis scripts y cuatro unidades systemd PASS.
Despliegue autorizado con backup root:700 sin secretos:
`/var/backups/vigilante/1647c-20261015T180814Z`, hashes verificados,
dry-run 0/0 y timer enabled/active. Pasada real success/0, 468 IDs, 41 bot,
colas 0/0, marca temporal persistida y código instalado idéntico al repo.
No se enviaron nuevas pruebas. La prueba histórica VANTA-73 queda intacta.
Hubo HTTP 502 transitorio tras recrear la stack; recuperación verificada a 200.
Evidencia saneada: `C:/VantareServer/evidence/1647c/`; permisos antes/después,
prueba de alteración, SQL solo lectura y final-runtime.txt. Sin capturas de app.
Rust y gates nativos omitidos por encargo explícito de tooling sin Rust.

[Runbook y reversión](../../../../tools/server/vigilante-plane.md).
La reversión mantiene ACL seguras y verifica hashes antes de restaurar; no
borra campanas ni comentario. Riesgo previo de ntfy ante pérdida de acuse
sigue documentado; no se afirma deduplicación del receptor. Conservar CLI
vigente de nightly al integrar esta pila antigua. SHA, push, CI y estados
verificados en #1647/#1649, Plane VANTA-77 y buzón 1647c.
Siguiente: revisión del orquestador; **registro de Plane anuncia habilitado**
(ENABLE_SIGNUP=1), pendiente de decisión en VANTA-47. Sin merge de PR,
promoción a nightly/testers/master ni release por el worker.

## 1. Resultado

### Servidor · VANTA-47 / revisión 1647c · 2026-10-15

Encargo de implementación del orquestador sobre PR #1583, rama
`vantareapp/isa-1565-servidor`, base previa `f385f7937` (merge-base nightly
`ee3725407`). Worktree `C:/VantareServer/wt/isa-1565`, inicialmente limpio.
P3-2: cuatro servicios root con NoNewPrivileges, ProtectSystem=strict,
ProtectHome y PrivateTmp, escritura limitada a rutas de copia/estado/latido.
Drop-ins aplicados en vivo con backup root:700 y SHA256SUMS en
`/var/backups/vantare-hardening/20261015T180427Z`; cuatro unidades verificadas,
Plane reiniciado y copia/supervisión/vigilante ejecutados satisfactoriamente.
P3-3: rustup-init 1.28.2 con SHA-256 fijado y contrastado con fuente oficial
y descarga local; sin ejecutar instalación Rust. Riesgos de plane.env en copias
y HTTP LAN documentados, sin cambiar secretos, datos ni red.
P3-5 **pendiente de decisión**: lectura pública enable_signup=True, BD
ENABLE_SIGNUP=1 y 5 cuentas activas/totales. No se acreditó registro cerrado,
no se intentó crear cuenta ni se cambió configuración; avisado en buzón 1647c.
Evidencia saneada `C:/VantareServer/evidence/1647c/`, detalle y reversión en
`tools/server/README.md`. Checks finales, SHA/push y CI se verifican en #1583,
#1565/#1571 y buzón. Siguiente: revisión del orquestador y decisión sobre alta.
Sin merge, promoción de canal ni release. VANTA-77/PR #1649 conserva el vigilante
ampliado encima de esta base y su propio runbook; integrar ambos sin perderlo.

Servicios remotos de cuenta/licencia, Billing, calendario, reportes y distribución; Hub presenta su estado. La existencia del cliente/backend no certifica apertura comercial, producción ni release.

## 2. Autoridad y lectura verificada

Leídos [#1568](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1568), [#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514) y [#1535](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1535) con sus decisiones/avances; Project Vantare y labels de la issue gobiernan cada entrega. Entradas: [servicios](../../../native/services/README.md), [ADR 0100](../../adr/0100-identidad-clerk-polar-supabase.md), [canales](../../branch-channels.md). #1561 registra esta compactación y su escritura verificada.

## 3. Estado real y canal

### #1591 / VANTA-103 — preparación para RC (16-oct-2026)

Isaac ha aprobado el instalador para la beta pública del 26-oct a las 19:00,
según el encargo del orquestador del 16-oct. Esta decisión sustituye el estado
«Isaac prueba y decide» de la entrega del 13-oct. Objetivo: PR #1600 lista para
review e integración en nightly antes del RC del 23-oct; el worker no mergea.

Entrada limpia `95bff4956`, rama `vantareapp/isa-1591-instalador-propio`, worktree
`C:/VantareServer/wt/isa-1591`. Merge local `d2184fc8a` de
`origin/nightly@bcaa0e3f2de0278b329b94bd2095505d56c3ed1d` (32 commits), sin
rebase. Único conflicto en gates.ps1: conserva `--target-dir` de nightly y
el parámetro de target propio, incluida la copia de DuckDB en el perfil prueba.

El publisher del PR ya construye GPUI por defecto; 0.0.976 y `-LegacyNsis`
conservan NSIS explícitamente. Se añade `publish-installer-tests.ps1` al check
Windows bloqueante: ejecuta el publisher real con build/firma inertes y prueba
selección GPUI sin NSIS instalado, ambas excepciones legacy, sidecars y rechazo
del fallo GPUI sin fallback. 13 checks PASS en PowerShell 5.1; shell aislado 23 PASS, canales 45 PASS e
integridad 456 PASS. Issue bajo `area:plataforma`, Project Vantare In Review y
milestone «Plataforma, CI y releases · testers». No crea binarios
distribuibles ni prueba una firma real. La CI no publica instaladores/releases;
la preparación manual autorizada sigue siendo `publish-beta.ps1`.

Código y CI propios de esta continuación: `a18ab4379010a4d0f1fb46c50154e9a5b9368828`,
push verificado. Gates Rust secuenciales por `native/scripts/compilar.ps1`,
`VANTARE_CARGO_MIN_GB=0`, jobs 2, locked/offline y target exclusivo
`native/target/gates`: fmt de workspace, check y Clippy (`-D warnings`, todos
los targets de installer/build-support), Nextest 8/8 sin omisiones y lifecycle
18/18 PASS. El único intento retirado antes de compilar fue una espera propia
para reagrupar los gates en un runner secuencial; no hubo errores del compilador.
Telemetría local omitida: el diff propio no cambia runtime/domain/ipc/testdata;
la CI aplica además el clasificador vigente al PR completo.
Evidencia: `C:/VantareServer/evidence/installer-1591/`, logs por gate y
`gates.ps1` reproducible; fmt esperó 581 s y el runner posterior 31 s en cola.
Sin recompilar un Setup distribuible: el cambio adicional es CI/documentación;
la QA Release 0.0.978 previa y sus límites no se atribuyen a este SHA.

Entrega autorizada: push y PR #1600 ready a nightly; SHA documental final y
resultados remotos de «Validate promotion path» y «Validate Vantare blocking
gates» se registran y releen en #1591/PR, separados de los gates locales.
Siguiente: orquestador revisa y decide el merge. Canal alcanzado: rama de issue,
ninguna integración en nightly. Sin tocar firma USB ni publicación; sin secretos,
`.env`, ventanas, subagentes, merge o release.
La aprobación no añade evidencia de Windows limpio, DPI o feed live; se
conservan los límites y la recuperación legacy aceptada en la entrega anterior.

### #1591 — instalador propio, FASE 2 autorizada (2026-10-13)

Plan aprobado: [plan versionado](../../superpowers/plans/2026-10-13-instalador-propio-1591.md), copia solicitada `C:/tmp/ola2/plan-1591.md`.
Issue [#1591](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1591), rama `vantareapp/isa-1591-instalador-propio`, worktree T3 propio,
base/HEAD de entrada `cec4364a5b4fc03f111dde6073c01e5fb36dad68` = origin/nightly obtenido.
Diseño aprobado `instalador-r3.html`, ventana #E; SHA-256 `ca1e9bd31ba76fda1031e1b93ba6a090ef889b911cf20d58f30e0181867ad841`.
Propuesta: crate `vantare-installer`, GPUI fijado y ZIP/scripts embebidos; motor PowerShell existente, sin dependencias externas nuevas.
Mantiene identidad VantareNativeBeta, QA TEST_INSTALLER, datos por generación, códigos 0–4 y bootstrap renovado solo por Setup.
#1565/PR #1592 ya está integrado en nightly al cierre. Se incorpora esa base
localmente (`298abc335da7d09d62917d3954bd63fb69e5389d`) conservando Downloads,
orígenes, sidecars y CI; 0.0.976 mantiene NSIS. No se publica desde #1591.
§4 cerrado: escritorio ON/autostart OFF en interactivo, ninguno nuevo en /S;
datos SIEMPRE conservados, sin casilla; Repair solo con igual versión; valores reales.
H1: crate/CLI/puente/payload/builder y recurso PE. Tests Rust 4/4, shell 9,
Clippy sin UI y comparación del lock PASS; solo nuevo paquete local, cero dependencias externas.
H2: Register conserva la UI propia, opciones/accesos exclusivos y limpieza
diferida validada por hash. Shell 23 PASS y uninstall interrumpido 2 PASS;
son fixtures, no acreditan instalación completa ni equipo limpio.
Sin instalación real, secretos, firma real, promoción ni release. Hitos/SHA en la issue.
H3: seis pantallas GPUI, controles, opciones y worker conectado al motor;
fuentes del HTML convertidas sin dependencias nuevas. Capturas nativas iniciales
de seis pantallas más opciones/desinstalado a 720x460, DPI 96, revisadas en
`C:/tmp/ola2/1591-qa/visual/gpui-h3/`; todavía usan un snapshot fixture 0.0.0.
Clippy UI y contratos Rust se registran con el SHA del hito en la issue.
H4: publisher construye Setup propio con CRT estático y firma de feed intacta;
0.0.976/`-LegacyNsis` conserva NSIS. Scripts de QA headless/interacción añadidos.
Paquetes reales 0.0.977/0.0.978; bootstrap refrescado conservando hashes de todos
los EXE de aplicación (QA-PROVENANCE.json). Regresión del fallback PowerShell
corregida: Beta 99 PASS, packaging 175 PASS, matriz propia 68 PASS, interacción
real 22 PASS, feed remoto simulado 9 PASS, shell 23 y uninstall 2 PASS.
Gates finales tras incorporar nightly: fmt/check/Clippy PASS; Nextest
1646/1646 (7 skips), lifecycle 18/18 (`1591-merge-*.log`). Matriz Release
68 PASS, feed remoto Downloads 9 PASS y origen exacto + 8 rechazos PASS.
Target de gates propio trasladado a E por disco lleno en C; parámetro de ruta
sin cambiar expectativas. Fallos previos y mapa de evidencia archivada conservados.
H5 local: NSIS actual→propio 50 PASS; interacción final 22 PASS y seis
comparativas HTML/GPUI revisadas, en `C:/tmp/ola2/1591-qa/visual/comparativa-1591.html`.
[Informe de QA y límites](../../reviews/2026-10-13-1591-instalador-qa.md).
PR draft [#1600](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1600)
a nightly, enlazado en T3. Implementación y base validadas en el merge local
`8389ca8d020eaf24b7c189f2f78a431d025bb7dd`; el HEAD documental de entrega
queda registrado en la issue y la PR. Setup/Uninstall Release construidos con payload
Debug QA, sin firma real ni publicación; no certifica una release completa.
**Siguiente paso #1591: revisión independiente y acreditar el entorno
live/Windows limpio; sin subagentes, sin integración.**
VM/cuenta con otro SID, arranque live, Windows limpio y DPI físicos siguen
pendientes de entorno; no se infieren de las capturas ni de los tests headless.
Push/PR draft a nightly y enlace T3 autorizados al finalizar; no integración antes de review independiente.
QA futura bajo `C:/tmp/ola2/1591-qa`; arranque live solo en cuenta/VM de prueba por el SID/instancia compartida, capturas con pantalla libre y mutex.

Cambio puntual aprobado por Isaac en #1591: bienvenida y Opciones muestran
«Vantare, creado por y para pilotos»; medición QA y comparativa actualizadas.
Gates Rust por cola: fmt/check/Clippy PASS, Nextest 1646/1646 (7 skips), lifecycle
18/18 (`1591-copy-*.log`, lifecycle-r2). SHA en issue/PR #1600; revisión en curso.

Correcciones de revisión #1600 autorizadas: P1 y P2-2 a P2-5. P1 reproduce
carga previa a Rust y pasa tras restringir imports estáticos a System32:
2 PE y 4 probes con DLL inocua (con/sin /S). [Evidencia de correcciones](../../reviews/2026-10-13-1600-correcciones.md).
P2-2 y P2-3: reparación e2e (2 casos/8 checks) y reintentos en 7 fronteras PASS,
manteniendo hashes/datos y retirando solo accesos propios. P2-4: contratos y
CLI real de /D y _?=, incluidos Unicode/espacios repetidos, PASS.
P2-5 RED con NSIS/base verdaderamente pre-PR `298abc33` limpia: Register de A
tras rollback vuelve a PowerShell. El orquestador acepta esa limitación y
resuelve la DUDA: no se reescribe A. Dos recuperaciones PASS: reinstalar B
tras rollback, y desinstalar desde la entrada antigua antes de reinstalar B
con metadatos huérfanos. Restauran GPUI/accesos/preferencias y datos exactos;
Register B es real, readiness es fixture. README y PR documentan el escenario.
Gates locales 1650/1650 (7 skips), lifecycle 18/18, fmt/check/Clippy, matriz
Release 68, shell 23 y beta 99 PASS. SHA/canal final en issue/PR; sigue draft
para revisión independiente, sin integración ni acreditación live/Windows limpio.
SHA por hito en la issue; no integrar, firmar ni publicar una release.

Ronda 2 sobre `5f53b34c`: revisión confirma P1/P2-2/3/4 y aceptación P2-5,
pero abre P2-6 (Cleanup retira EXE y deja marker huérfano). Regresión nueva
`installer-cleanup-recovery-tests.ps1`: handle real FileShare.Read e interrupción
sincronizada en copia privada del helper; ambos dejan datos exactos y Setup
público devuelve 2 al reinstalar (RED, hito `2fe91323`). Arreglo mínimo del
driver validado localmente: Setup reclama solo marker
sin EXE/state/registro, con raíz/identidad/metadatos válidos. Ambas variantes
GREEN (16 checks) restauran GPUI y datos exactos; rechazan raíces/identidades
ajenas, marker inválido y limpieza pendiente, y conservan instalación renovada
ante helper antiguo. Gates por cola: fmt/check/Clippy, Nextest 1650/1650 (7
skips), lifecycle 18/18, matriz 68, shell 23 e integridad 456 PASS. AST 25
scripts y lock sin dependencias nuevas; EXE Release TEST `review-b-r4` embeben
los scripts exactos, 2 PE con 0x800/CRT estático, paquete Debug de aplicación
idéntico. SHA/push final en issue/PR/buzón; sigue draft para revisión, sin live,
integración, firma ni release.

Ronda 3 de Sol: **APTO** sobre `ea7b782c`, sin P1/P2 abiertos, conforme a
`C:/tmp/ola2/review-1600-sol-r3.md`; no acredita Windows limpio/live/DPI.
Prueba manual de Isaac preparada en `C:/tmp/1591-prueba-isaac/`: Setup QA
0.0.978, paquete y ambos instaladores Release desde ese SHA **limpio**, con
`beta-dev-clerk.env` cargado por el validador público, sin mostrar/copiar sus
valores y sin USB/firma de feed. Target de paquete propio en C; installer en E.
SHA-256 del Setup: `5198a0a5aa81e8eae0463c4ab90c4034c282b6d18d2976526930a2aa68ef37a7`.
`PROCEDENCIA.json` identifica fuente/configuración/hash; 10 EXE de aplicación
reales, sin admin/installer ni imports VC Redist. Ambos instaladores mantienen
0x800/CRT estático y scripts/ZIP/Uninstall embebidos exactos; NotSigned y
probe --version exit 0. Evidencia `1591-manual-build-r2.log`/verify/version.
`PRUEBA.md` tiene 8 pasos para VM limpia, DPI 100/125/150, abrir, reparar,
desinstalar/reinstalar y conservación/borrado manual de datos solo en la VM.
`INSTALAR.cmd` pasa la raíz QA explícita; su helper bloquea el PC de origen y
otra instalación real existente. Bloqueo del origen comprobado sin abrir UI.
El producto sigue conservando siempre datos; no se añade borrado ni cambia
código. **Siguiente: Isaac prueba en VM y decide; no merge ni release.**

### Estado previo de plataforma (su base propia)

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

2026-10-13 · GitHub #1591 · Codex: hito de planificación y DUDA; no cambia
el estado remoto de las entregas anteriores. Plan/issue/metadata verificados al cerrar FASE 1.

2026-10-10 · GitHub #1535 · Codex. PR #1578, base nightly y cambios
#1570/#1572/#1573 contrastados. Estado sustituido segun plantilla; diario,
SHA, push y checks en la issue/buzon. Sin autorizacion de produccion.

2026-10-13 · GitHub #1565 · Claude. Feed en seco, CI privada y QA aislada;
PR a nightly sin merge ni release.
## #1695 / VANTA-105 · Seguimiento de la review de #1691 (17-oct-2026)

Rama/worktree propios `vantareapp/isa-1695-installer-transaccion`, isa-1695,
desde nightly `7396f65d0` con #1691 fusionado por el orquestador. CRT cerrado
en PR #1693 ready `f30ec08ef`, cinco checks SUCCESS (run39012555323), sin merge
por el worker. Su payload real f68e4a3db conserva su propia procedencia.

P2-1 acreditado con Setup/Uninstall Release nuevos desde nightly: builder
421,44s, SHA Setup `bec8d3bb4394543169561cad07965987615e13914b6bdd00cd075dc80289e913`.
App reutilizada f68e4a3db sin cambios Rust, bootstrap nuevo; manifest conserva
SHA de la app y PROCEDENCIA.json distingue ambos componentes. No se presenta
como build completa nueva del payload. Solo QA local, sin configuración beta.
Evidencia `C:/VantareServer/evidence/rc1/seguimiento-1691/INFORME.md`.

Tres usuarios estándar/escritorios privados: limpio OFF sin crear Startup;
limpio OFF→reinstalar ON con Startup ausente antes de ON (preferencia guardada,
Setup /S real, no GUI/limpio ON); NSIS público0.0.975→Setup nuevo OFF. Instalar,
reinstalar/actualizar y desinstalar exit0, bootstrap nuevo, datos conservados.
ON crea su carpeta/acceso, OFF conserva Startup ausente. Actor solo prepara
Programs, nunca Startup/Desktop. Cuentas/perfiles SID1021/1022/1023 retirados.
La QA RC1 histórica con Startup creada y Setup anterior NO acredita el arreglo.

P2-3/P2-2/P3 autorizados en PR separado: restauración por fichero con log/error
original, enumeración segura, lock hasta finalización/marker y durante Cleanup,
recuperación de Setup bajo lock, Programs vacío y ON+GetFolderPath vacío.
Suite shell añadida al workflow. Regresiones ampliadas en curso; no se afirman
CI verde ni PR ready hasta comprobar el HEAD final. Sin Rust/dependencias nuevos.
Windows limpio/login/pagos pendientes; Hub bloqueado por #1694. Sin ventanas
en sesión principal, firma/publicación ni merge por el worker.

## VANTA-96 / #1715 · Roles gestionados y preexistentes (19-oct-2026)

PR #1716, rama propia vantareapp/isa-1715-roadmap-role-gestionado desde bf7e21c619.
Las cuatro creaciones de roles en 42–94 validan pg_roles, rechazan atributos
peligrosos y reutilizan roles seguros; solo reparan diferencias permitidas, sin
cambiar contraseñas ni solicitar atributos privilegiados negativos redundantes.
Se editan las versiones históricas pendientes: una migración nueva posterior no
puede desbloquearlas. Primera parte ya aplicada (1–41) idéntica, canon 94.

Comprobación productiva adicional solo lectura por Management API: de los cuatro
roles propios, solo existe vantare_roadmap_publisher, seguro y temporalmente
NOLOGIN. Triage/Pilot/web_purchase_erasure no existen en esa observación.
Evidencia con fecha/query/atributos, sin contraseñas: ROLES-PRODUCCION.json en
C:/VantareServer/evidence/supabase-roadmap-role-gestionado/.

Regresiones de migración completa como postgres NOSUPERUSER: los cuatro roles
preexistentes, nuevas creaciones, cambios permitidos, rechazo de atributos
peligrosos, rollback y contraseñas preservadas. Triage mantiene sus ALTER ROLE
SET; Pilot conserva el propietario restringido de su función mediante la
concesión canónica; web conserva sus grants/COMMENT de rol. Los tres últimos
roles también preexisten en el replay normal, no solo en pruebas que revierten.
Los controles RED ejecutan los CREATE originales para demostrar duplicate_object.

Aceptación: CI completa LF/CRLF verde en HEAD final; resultados y SHA vivos en
#1715 y evidencia anterior. No se modifican workflows o checks requeridos.
Producción sigue en 41/94: esta revisión solo leyó pg_roles por API, sin aplicar
SQL, reparar historial, generar secretos, desplegar o rotar. Orquestador revisa y
fusiona; después continúa #1713 desde la 42, sin repetir limpieza a ciegas.

## VANTA-96 · #1717 · Estado interno del roadmap (19-oct-2026)

Por decisión del orquestador, «Para Isaac» se excluye expresamente del
roadmap público, aunque la tarea pertenezca a un module de producto. No se
asigna a «En marcha»; otros estados desconocidos siguen abortando sin
publicar. Regresión offline comprueba exclusión y normalización; se conserva
el test de estados desconocidos. Rama vantareapp/isa-1717-roadmap-estado-interno
desde origin/nightly 440f3f9a3. El documento respaldado del 15-oct permanece
publicado y esta entrega no bloquea la reconstrucción Supabase #1713.
