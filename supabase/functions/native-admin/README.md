# native-admin · gestión privada r1 (#1627)

OAuth Clerk y Owner vigente comprobados en Edge y otra vez en SQL. Cuenta
bloqueada: 403. JSON cerrado de 8 KiB, bearer limitado, solo POST, `no-store`,
presupuesto persistente de 60 peticiones/minuto por actor. El cliente no recibe
secretos ni tiene acceso directo a tablas. No se crea Owner automáticamente.

VANTA-132 / #1910, paso 3, revisión del orquestador:

- **Gestión inactiva (por defecto)**: mientras `CLERK_ADMIN_AUTH_ENABLED` no sea
  exactamente `true`, sigue el cliente del Hub y su introspección opaca. El
  contador global de 120/minuto precede a Clerk como red de seguridad. No cambia
  el login actual ni se infiere activación por tener un ID configurado. El orquestador acepta explícitamente que basura agote temporalmente el cupo de admin: prefiere proteger el cupo de Clerk de todo el producto aunque el owner reciba 429.
- **Gestión activa**: exige `CLERK_ADMIN_CLIENT_ID` distinto del Hub. Solo JWT
  OAuth RS256, tipo `at+jwt`/`application/at+jwt`, firma JWKS, issuer exacto,
  `client_id`, audiencia o `azp` del cliente configurado, y `exp`/`nbf` válidos con 60 segundos de tolerancia de reloj.
  No acepta JWT de sesión, del Hub ni tokens opacos. La firma se comprueba ANTES
  del contador y de la introspección: basura o firma falsa → 401, sin gastar
  cupo ni llamadas de la API de Clerk. Después de la firma, native_admin_preflight busca una identidad ya existente y exige owner vigente mediante native_admin_require_owner, antes del cupo global y de Clerk. No crea cuentas; el modo activo nunca llama a native_resolve_account. Se mantiene la introspección posterior y
  el owner sigue decidiéndose en SQL. Revocar el refresh no invalida un access
  JWT ya emitido: vive hasta `exp`. Isaac configurará TTL de **cinco minutos**
  al crear Gestión; no hay registro de revocación ni de `jti`.

JWKS del issuer configurado: caché privada del handler 5 minutos, una carga
concurrente, máximo 64 KiB/20 claves y backoff de 15 segundos si falla. Un `kid` desconocido fuerza una sola recarga compartida antes de rechazarlo; el total de recargas por kid desconocido se limita a una cada 15 segundos para evitar abuso de JWKS. Una rotación durante ese enfriamiento puede necesitar esperar esos 15 segundos. No se usa el issuer ni una URL de claves enviados por el token.
Crear el cliente Gestión con **tokens JWT**, comprobar con un token real que `typ` es `at+jwt`, comprobar sus claims y activar
configuración/cliente Rust corresponde exclusivamente a Isaac; aquí queda
inactivo. [Formato OAuth de Clerk](https://clerk.com/changelog/2026-01-08-jwt-oauth-access-tokens)
y [verificación](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens).

`native_admin_gate()` reserva una petición en un cupo global de **120/minuto**,
sin guardar identidad ni token. Agotado: 429; fallo RPC/no booleano: 503 sin
continuar. Su ventana nunca retrocede, incluso con transacciones bloqueadas.
El cupo por owner de 60/minuto sigue después de autenticar. Un token válido
puede agotar la red global; mientras Gestión esté inactiva también puede hacerlo
un token basura. El cierre de ese abuso requiere activar el modo JWT.
El mismo patrón en native-license queda pendiente del recorrido R3 (#1827);
este cambio no modifica licencias ni billing.

Preparación para Isaac, sin ejecutar aquí: aplicar
`20261103152000_isa_1910_admin_gate.sql` antes de desplegar la Edge revisada.
Para retirar: restaurar primero la Edge anterior y después ejecutar
`supabase/rollbacks/20261103152000_isa_1910_admin_gate.down.sql`.
Solo se pierde el contador efímero; ninguna cuenta, auditoría o permiso cambia.

### Emergencia: reset manual del contador (solo Isaac)

Si se necesita recuperar acceso, desde el editor SQL como propietario de la
base y con autorización de Isaac, inspeccionar primero el contador y ejecutar:

```sql
select window_start,requests from private.native_admin_gate_rate;
begin;
lock table private.native_admin_gate_rate in exclusive mode;
delete from private.native_admin_gate_rate where singleton=true;
commit;
```

La próxima petición reserva el primero de los 120 huecos. El lock serializa el
reset con peticiones en vuelo. Solo borra la fila efímera; no toca usuarios ni
permisos. No hay RPC pública para resetear ni excepción por token. Verificar
después el contador y el acceso del owner. No se ejecutó este procedimiento
contra ningún proyecto real.

Aplicar las migraciones existentes y las de gestión `20261014010000_native_admin_r1.sql` y
`20261015010000_native_admin_review_r3.sql`, `20261015120000_native_admin_final_decision_r4.sql`
y `20261015130000_native_admin_account_deletion_r4.sql` antes
de usar este cliente. Contrato v1 ampliado, conservando las acciones anteriores:

| Acción | Campos | Resultado |
| --- | --- | --- |
| `search_accounts` | `query` vacío o ≤200 bytes, `limit` 1–50, `cursor?` | cuentas, `counts` globales, `next_cursor` |
| `get_account` | `account_id` | cuenta, plan, bloqueo, permisos y pagos |
| `set_tester` | `account_id`, `enabled` | ACK; releer cuenta |
| `set_module` | `account_id`, `module`, `enabled` | modifica solo el acceso individual |
| `get_rollout` / `set_rollout` | ninguno / `module`, `enabled_for_all` | módulos, accesos individuales y total de cuentas |
| `list_reports` / `get_report` | `status?`, `limit?`, `cursor?` / `report_id` | informes actuales e históricos; detalle y capturas firmadas |
| `set_report_status` | `report_id`, `status`, `fixed_in_version?`, `reason?` | ACK; releer informe |
| `set_blocked` | `account_id`, `blocked`, `reason?` ≤200 caracteres | bloqueo local + Clerk + cancelación Polar |
| `delete_account` | `account_id`, `confirm_email` | barrera #1622, cancelación Polar, borrado Clerk y limpieza Storage; `deleted_at` |
| `list_creators` / `get_creator` | ninguno / `creator_id` | creadores, totales, líneas y `history_complete` |
| `create_creator` | `name` ≤120, `email` ≤320, `code` `[A-Z0-9]{3,32}` | reserva local y código Polar confirmado |
| `record_creator_payout` | `creator_id`, `amount_cents`, `paid_at?` | apunta pago manual, no transfiere dinero |

Búsquedas: solo cuentas ya vinculadas al issuer; no crea destinos ni une por
correo. Los filtros de Personas se aplican a la página cargada, con recuentos
SQL globales. Revocar acceso individual conserva acceso por plan, rol o rollout.

Informes: `submitted`, `in_review`, `validated`, `rejected`, `spam`, `fixed`;
se conserva lectura de estados históricos. Draft no se lista. Las decisiones de
contribuciones usan el mismo motor privado que `testing_contribution_review`
(#1594), con nota humana obligatoria (`reason`, ≤500 bytes en Edge), 1 aceptación
por día y 2 por semana UTC/cuenta. La revisión manual se identifica como `human`,
sin inventar una propuesta o confianza de modelo. La ruta pública anterior sigue
exigiendo propuesta y Owner autenticado; no se amplían permisos EXECUTE.
La decisión es inmutable como en #1594; un intento incompatible devuelve 409.

### Autoridad de revisión · costura con R6/#1925

`native_admin_require_owner` toma los mismos bloqueos de UUID y asignación,
pero `private.is_owner(uuid)` de R6 decide la autorización. La RPC pública
`testing_contribution_review` reutiliza ese helper, conservando su error
`testing_owner_required`, la propuesta obligatoria y sus permisos EXECUTE.
Un owner operativo sin membresía puede revisar; una membresía owner no autoriza
si falta la asignación operativa o está caducada/revocada. No se escriben roles
ni membresías. La RPC recoge actor y cuenta del informe antes de tomar filas,
bloquea los UUID ordenados y vuelve a comprobar la cuenta del informe.
Rechaza primero sin locks al no-owner; el helper vuelve a comprobar la autoridad
con los bloqueos adquiridos, para cubrir una revocación concurrente.

Instalar primero la migración owner de R6/#1925 y después
`20261104005000_isa_1910_admin_owner_authority.sql`, dentro del conjunto acordado
por el orquestador. Si falta `private.is_owner`, aborta con 55000 antes de cambiar
cuerpos. Revertir primero el `.down.sql` admin y después R6: restaura exactamente
los dos cuerpos anteriores y conserva ACL y datos. Esta costura no completa el
resto del paso 4 ni cambia el recorte de tablas legacy de #1924.

La purga existente usa `decided_at + 90 días` para logs y telemetría.
Arreglado exige aceptación previa y versión, y sigue consumiendo cupo. Las
contribuciones aceptadas/rechazadas/spam/arregladas no vuelven a Recibido ni En
revisión (409); tampoco las históricas sin fila de revisión. No hay acción de
reapertura. R4 restaura decisiones que el adaptador anterior había reabierto,
conservando nota y fecha originales. El cupo cuenta también revisiones aceptadas
si una versión anterior alteró el estado. Los informes antiguos admiten Spam,
conservan el motivo y tienen la misma decisión final: no se reabren ni se cambian
por otra decisión. Solo Aceptado/Arreglado permiten guardar la versión arreglada.
La reparación no reconstruye «Arreglado en X» si R3 ya borró esos metadatos;
el Owner debe volver a confirmar la versión desde una fuente comprobada.
Cada fila reparada deja auditoría `set_report_status`, marcador
`repair=native_admin_final_decision_r4`, con el reviewer de la decisión original.
No representa una revisión humana nueva. La reparación suspende en su transacción
el trigger de cupo y, para esa auditoría histórica, la barrera de cuentas de
`admin_audit_log` (el reviewer puede estar borrado). Los locks DDL excluyen otros
escritores y ambos triggers se restauran antes del commit; el resto sigue activo.
Capturas privadas `ready`, firmadas durante 600 s. Las lecturas se auditan con
actor, acción, fecha y objetivo; sin duplicar nombres, correos ni pagos.

## Efectos externos y recuperación

**Candidato limitado a sandbox.** Crear códigos, bloquear y borrar
rechazan `production` antes de escribir. El transporte nuevo fija el host
`sandbox-api.polar.sh`, rechaza redirects y no reintenta escrituras. Sin pruebas
contra SaaS real ni despliegue en este encargo.

Bloquear persiste primero el bloqueo Vantare; el resolver común de identidad
rechaza nuevas autorizaciones/licencias. Después Clerk `ban` y cancelación
inmediata Polar de las suscripciones registradas. Se verifica el ACK y se acepta
una suscripción ya cancelada al repetir. Un fallo posterior al bloqueo devuelve
`account_change_incomplete`: actualizar y repetir para terminar; no se afirma
que Polar quedó cancelado. Desbloquear no reactiva suscripciones. Credenciales
ya emitidas conservan los límites de caducidad existentes.

Owner y propia cuenta protegidos en servidor. Borrar compara correo normalizado
con el correo actual obtenido de Clerk, no con un valor aportado por el cliente.
Incorrecto: 422 sin efectos. Correcto: una solicitud SQL privada aplica la barrera
#1622 (tombstone, revocación y anonimización) antes de cualquier escritura externa;
después cancela suscripciones Polar, borra en Clerk y drena la cola Storage con
el mismo limpiador de #1622. Se conserva el historial comercial según ese flujo.
La cuenta del dueño y la propia se rechazan otra vez en SQL bajo locks UUID.
La solicitud se audita en la misma transacción, sin PII ni hash en la auditoría.

`get_account_deletion` y `prepare_account_deletion` son acciones internas: el
cliente no puede solicitarlas. La tabla privada conserva UUID, issuer/subject,
fecha y SHA-256 del correo normalizado, nunca el correo en claro. Solo la primera
solicitud compara el correo actual de Clerk. Los reintentos exigen el mismo hash
y Owner vigente; no consultan un usuario Clerk que puede haber desaparecido.
Un 404 de DELETE se acepta únicamente tras recuperar esa solicitud duradera.
Un fallo posterior a la barrera devuelve `account_change_incomplete`; no afirma
que las cancelaciones, Clerk o Storage terminaron. Repetir explícitamente con el
mismo correo completa los ACK pendientes. No hay reembolsos ni reintento automático.
El webhook firmado puede llegar después: la barrera y las colas son idempotentes.

Los códigos reservan identidad estable y se reconcilian tras perder un ACK.
Descuento de renovación 20 %, configurado en `scripts/polar-launch-prices.json`:
11 meses mensuales / 12 meses para una renovación anual; dos cupones API-only,
scope de los productos normales de cada intervalo, sin código público Polar.
La reserva crea ambos y solo se activa tras confirmarlos; un ACK perdido se
reconcilia por metadata `creator:CODE:renewals-v4` / `creator:CODE:annual-renewals-v4`.
No adopta ni convierte silenciosamente cupones viejos de dos meses. Organización
verificada mediante GET, portal sin cambio de plan. Incorporar IDs mensuales y
anuales al mapa del checkout mediante el script de catálogo. El código atribuye
el primer pago aunque lleve cupón de lanzamiento: no recibe 20 % hasta renovar.
[Contrato completo](../../../vantare-v2/docs/billing/creator-renewals-1661.md).

## Recibos y comisiones

Proyección privada de órdenes/refunds firmados del webhook. La carga inicial
lee el historial completo de sandbox una sola vez por entorno: páginas acotadas,
identidades existentes, sin crear cuentas. Después se usa el ledger. El primer
pago de una cuenta tras el watermark inicial certifica su historia si no contiene
recibos anteriores al watermark; no fuerza otra lectura global. Un pago histórico
atrasado conserva historia incompleta hasta una reconciliación revisada.
Un refund mal formado con factura identificable o incompatible con el ledger
pone solo esa factura en cuarentena (`refund_pending`): comisión 0 salvo importes
ya liquidados. Las demás facturas siguen visibles. La cuarentena requiere una
reparación revisada; no se elimina automáticamente al recibir otro webhook.
Un refund sin identificador de factura no permite acotar el daño y mantiene el
fallo cerrado de la carga inicial. La lectura histórica no
concede licencias ni sustituye los ledgers comerciales existentes. El espejo de
Launch Edition nunca consume su ruta BIL-07 de revocación tras reembolso.

Céntimos EUR enteros: total tras descuento e impuestos; refund incluye impuesto.
La fecha histórica es la fecha de factura (`created_at`), pues la API de órdenes
no ofrece `paid_at`; no demuestra fecha de liquidación bancaria. Las órdenes con
saldo aplicado, divisa/producto desconocido o campos incompletos dejan la cuenta
sin certificar y bloquean el pago manual. Pendientes de reembolso no se liquidan.
Motivo del refund y fecha de su confirmación, cuando existen, proceden del último estado verificado (`modified_at`), no de una liquidación bancaria. La primera compra pagada fija creador; cohortes por aniversario mensual UTC:
la tasa vive solo en `private.native_admin_commission_rate`: 30 % mes 1,
10 % meses 2–12, 0 % desde mes 13. Decisión de Isaac del 15/10/2026:
anual = 30 % del pago anual completo, sin prorrateo; 100 € generan 30 €
en el mes 1. No autoriza pagos reales ni producción. Redondeo half-up por línea. Los registros legacy netos se identifican
como tales, con fecha de registro; no se inventan impuestos ni enlace de cliente.

Solo se apunta saldo de meses UTC cerrados, >0 y ≤ disponible, con bloqueo
transaccional frente a recibos/refunds. Se distribuye el pago por antigüedad y
se protege exactamente la comisión pagada, incluso si una línea se pagó a medias.
Un refund posterior reduce solo lo aún no pagado. Payout append-only, auditoría
de antes/después; no se envía dinero. Esto no ejecuta un cierre automático ni
reconstruye la situación de un cierre histórico anterior al registro manual.

## Suscripción ausente y recuperación manual del borrado

Tras confirmar el tombstone se releen las suscripciones: incluye compras que
terminaron entre la lectura inicial y la barrera #1622. Se consulta además el
estado del cliente en Polar por el UUID usado por checkout, para incluir compras
completadas cuyo webhook aún no llegó, y se deduplican ambas listas. Los escritores posteriores
quedan bloqueados por esa barrera. Un GET Polar 404 se considera ya cancelado y
registra `native_admin_subscription_missing` con entorno, sin IDs ni PII. Si aún
no existe el cliente remoto (404), registra `native_admin_customer_missing` y
conserva la cancelación de cualquier ID ya registrado en SQL. Un 401,
403, 429, 5xx, timeout o respuesta inválida sigue dejando la acción incompleta;
no autoriza borrar Clerk antes de resolver la cancelación.

Si la acción sigue incompleta, el Owner debe comprobar en el panel Polar del
mismo entorno la suscripción del usuario y su renovación. Si existe y sigue
activa, cancelarla manualmente en ese panel y comprobar su estado. Si hay una
discrepancia de IDs o permisos, resolverla con soporte Polar antes de continuar.
Después repetir Borrar con el mismo correo confirmado originalmente; la solicitud
privada permite el reintento aunque Clerk ya no tenga al usuario. El registro 404
no prueba un reembolso. No retirar el tombstone ni recrear la cuenta para reintentar.
Este candidato sigue limitado a sandbox; producción requiere su autorización propia.

## Verificación local

Desde raíz Git, sin permisos de red y con cachés ya instaladas (en macOS se permite escritura temporal a los tests de catálogo):

```sh
deno test --node-modules-dir=none --config supabase/functions/deno.json --cached-only --allow-env --allow-read --allow-write supabase/functions
python3 supabase/tests/run-admin-local.py --output /ruta/fuera-del-repo --test native_admin.test.sql --test native_admin_reports_r1.test.sql --test native_admin_accounts_r1.test.sql --test native_admin_creators_r1.test.sql --test native_admin_payments_r1.test.sql --test native_admin_months_r1.test.sql --test native_admin_attribution_r1.test.sql
```

Runner: PostgreSQL Supabase desechable, Docker `--network none`, sin puertos,
todas las migraciones reales y bootstrap sintético auth/storage. Comprueba TAP,
no solo exit de psql. Fakes Clerk/Polar en Edge. RED y GREEN en
`~/evidence/1627-r3/` (R1: `~/evidence/1627/`). Variables existentes: configuración pública OAuth, secretos
Edge ya establecidos, `POLAR_ENVIRONMENT`, `POLAR_ACCESS_TOKEN`, mapa Polar;
solo se usan nombres, no valores reales. Despliegue, secretos, QA de OAuth y
webhooks reales quedan al orquestador tras revisión y autorización propias.

Referencias API: [órdenes](https://polar.sh/docs/api-reference/orders/list),
[orden e importes](https://polar.sh/docs/api-reference/orders/get),
[refunds](https://polar.sh/docs/api-reference/refunds/list),
[borrado Clerk](https://clerk.com/docs/reference/backend/user/delete-user).

### Founders / VANTA-83

Founders se muestra como plan propio. El detalle de cliente incluye
`founders_transitions` (suscripción, política `end_period`, estado `pending` o
`completed`, fin pagado). Un fallo no retrasa el derecho y queda pendiente de
reintento. Launch Edition se conserva solo como etiqueta de compras históricas;
no se ofrece ni habilita nuevos checkouts. No cambiar migraciones históricas para
borrar esa compatibilidad. No hay reembolso automático al cambiar a Founders.

Ronda 5: activate_creator registra discount_id mensual y annual_discount_id UUID
anual juntos, tras verificar ambos cupones en Polar. Reintento exige mismos IDs;
no se rotan silenciosamente. billing_save_creator_attribution exige pertenencia
al creador, entorno e intervalo y revierte el claim si no coincide. Creador
activo anterior sin vínculo anual debe reconciliarse antes de aceptar anual.
Reembolso/revocación retira el cupón de creador por GET/PATCH/ACK; Owner distingue
retirada confirmada y pendiente por error. Cupones ajenos no se eliminan.

## Correos de marketing (#1636)

Contrato, consentimiento, cuota, bajas y configuración futura: [MAIL.md](MAIL.md).
Candidato local; ninguna clave ni despliegue se habilita por añadir el código.
# Auditoría de escrituras externas · VANTA-132, paso 5a

`set_blocked` y `delete_account` conservan su límite sandbox. Antes de cada
ban/unban/borrado en Clerk y de cada llamada al drenaje de Storage se confirma
una intención mediante `native_admin_record_effect`. Otra llamada registra
`succeeded` si la operación devuelve éxito o `unknown` si devuelve error: un
timeout no demuestra que el proveedor no haya aplicado la operación. No hay
reintento automático. El drenaje se registra como una operación completa;
este paso no cambia el algoritmo compartido ni sus escrituras internas.

El identificador aleatorio `X-Request-ID` de la respuesta coincide con el del
log de tiempos y agrupa los efectos. Cada efecto tiene otro UUID; los eventos
incluyen acción, tipo, actor interno y SHA-256 del subject, sin correo, subject,
URL, cuerpos ni errores de proveedor. Los UUID/hashes son seudónimos, no datos
anónimos. La RPC vuelve a exigir owner activo y rechaza campos adicionales.
El journal privado es de solo inserción; solo servicio puede leerlo/llamar RPC.

Un fallo al guardar la intención impide la llamada externa. Un fallo al guardar
el resultado devuelve 503 y deja la intención pendiente. Si el unban ya tuvo
éxito y falla el cambio de estado SQL, queda registrado y se devuelve
`account_change_incomplete`. El bloqueo local se conserva hasta confirmarlo.
La lápida de borrado sigue precediendo las llamadas externas.

Consulta manual de diagnóstico para Isaac (no se ejecuta contra producción
desde agentes); sustituir el UUID por el recibido en la respuesta:

```sql
select i.request_id, i.effect_id, i.action, i.effect, i.actor, i.target_hash,
       i.occurred_at, coalesce(r.outcome, 'pending') as outcome
from private.admin_effects i
left join private.admin_effects r
  on r.effect_id = i.effect_id and r.outcome <> 'started'
where i.outcome = 'started'
  and i.request_id = '<REQUEST_UUID>'::uuid
order by i.occurred_at;
```

`unknown`/`pending` requieren comprobar el estado externo antes de un reintento
manual. Un efecto sin intención no llegó a invocarse desde este camino; los
pasos posteriores tampoco se ejecutan tras un error. Si todas las escrituras
externas constan como exitosas y la respuesta fue 503, revisar el estado SQL.
No cambiar filas de auditoría para cerrar incidencias.

Despliegue reservado a Isaac: migración primero, Edge después. Para revertir,
Edge anterior primero y luego el `.down.sql`: elimina la RPC y conserva el
journal, sus permisos y la evidencia. Reaplicar conserva los eventos.
La auditoría de Polar/Brevo y su unificación/retención del paso 10 siguen
pendientes; este PR no cambia billing, licencias ni `_shared`/`clerk-webhook`.

## Auditoría y concurrencia · paso 5b (sustituye los detalles de 5a)

La consulta de diagnóstico vigente es `private.admin_pending_effects`, privada
y sin endpoint de lectura en la API:
incluye intenciones sin resultado y resultados `unknown` sin reconciliar.
`succeeded` cierra una operación; `failed` distingue rechazos definitivos HTTP
401/403/422; el número HTTP queda en `provider_status`. Un DELETE de Clerk con
404 tras lápida confirmada es `succeeded` con 404 explícito. Errores de transporte
o de servidor siguen siendo `unknown`. El journal registra también cada DELETE
de `cancelSubscriptions` de Polar, con hash del ID; lecturas y sus omisiones por
suscripción ausente/ya cancelada conservan el comportamiento anterior.

Los resultados coinciden exactamente con actor, petición, efecto y hash de la
intención; pueden registrarse aunque el owner haya caducado durante la llamada.
Crear otra intención sigue exigiendo owner activo. La RPC no permite cambiar el
resultado definitivo ni escribir después de una reconciliación.

Consulta y cierre manual para Isaac, tras comprobar el estado externo y que la
operación anterior ha terminado. No se ejecuta desde agentes ni modifica filas:

```sql
select * from private.admin_pending_effects
where request_id = '<REQUEST_UUID>'::uuid order by occurred_at;
select public.native_admin_reconcile_effect('<OWNER_REVISOR_UUID>'::uuid,
                                          '<EFFECT_UUID>'::uuid);
```

`reconciled` añade un evento con el UUID del reviewer y conserva toda la
evidencia original. No decide si repetir una escritura externa. La lectura
desde la app por el owner y la retención de `target_hash` pertenecen al paso 10;
no hay nuevo endpoint de lectura ni política de retención en este cambio.

Ban y unban adquieren un lease por cuenta de 480 segundos, sin renovación:
supera los [400 segundos máximos del worker hosted de Supabase](https://supabase.com/docs/guides/functions/limits)
con 80 segundos de margen. Una petición simultánea recibe 409 antes de escribir
estado o invocar Clerk. Se libera al terminar, incluso si falla, conservando
la referencia de petición con el vencimiento marcado. Sin efectos pendientes,
tras un crash puede retomarse al caducar, con otro token. Si hay `unknown` o una
intención sin cierre, `claim` devuelve 409 hasta reconciliar: caducar o liberar
el lease no basta. La comprobación usa la vista de pendientes y la petición
retenida; también hashes de identidades para los eventos Clerk anteriores al
lease. Así una llamada tardía del proveedor no permite un cambio contrario.
La escritura de estado requiere token, cuenta, actor y petición coincidentes,
lease vigente y owner activo; mantiene el bloqueo SQL hasta commit. Un token
anterior no puede escribir ni liberar el lease nuevo. Se conserva el orden de
bloqueos de UUID, owner y filas para evitar ciclos entre claim y finish.
El fencing protege Postgres; Clerk no acepta este token. La caducidad mayor que
el máximo del worker evita solapar sus llamadas externas en el hosting actual.

Cualquier error posterior a un cambio local/externo, incluidos 4xx SQL tras
unban, devuelve 503 `account_change_incomplete`. El estado no se presenta como
un conflicto seguro para repetir ciegamente. Migración antes de Edge;
rollback después de revertir/drain de Edge, mediante el `.down.sql` con psql:
restaura la RPC anterior y conserva journal, estados ampliados y filas de lease.
Reaplicar conserva evidencia. No cambia billing, licencias, `_shared` ni el
comportamiento de cancelación de Polar. Auditoría Brevo pendiente.

Reconciliar exige un resultado `unknown` o una intención de más de 480 segundos;
no permite cerrar una intención reciente aún en vuelo ni efectos ya exitosos o
rechazados. `p_reviewer` es una identidad que confía el `service_role`: este debe
validar quién realiza la revisión antes de enviar su UUID. La RPC comprueba que
ese UUID es owner activo, pero no demuestra por sí misma que el llamador sea
esa persona. No está disponible para `anon`/`authenticated`.

Si la cuenta está borrada, `release` respeta el resultado de la barrera y omite
escribir en la fila. Un error de liberación conserva el error de la operación
original. Quedan diferidos: proteger `set_blocked` sin token durante el solape
de despliegue, limpiar leases caducados (sin eliminar referencias de efectos
pendientes) y revisar el 503 cuando solo falla release tras un cambio correcto.

## Brevo DELETE · paso 5c

Los dos llamadores reales (`native-admin` y `mail-cleanup`) usan obligatoriamente
`native_admin_record_mail_erasure`, sin callback opcional ni journal nuevo.
Escribe en `private.admin_effects`: `mail_cleanup` / `brevo_delete`, intención
`started` antes de HTTP y resultado antes de `mail_erasure_finish`.
`native_admin_claim_mail_erasure` une claim + started en una transacción: un
rechazo/error del recorder revierte lease e incremento de attempts, dejando el
job pending. Edge no llama al claim legacy por separado; si falta la migración,
la nueva RPC falla antes de reclamar. Ambos llamadores devuelven 503 con código
`mail_cleanup_audit_unavailable` para esa indisponibilidad. La retención vigente
de 24 horas no cambia. El recorder debe confirmar `true` dentro de la
transacción; Edge exige un claim válido y un resultado confirmado. Si falta auditoría, no hay DELETE; si falla
el resultado, devuelve 503 sin finalizar la cola y conserva la intención.
204/404 son `succeeded` (404 explícito), 401/403/422 son `failed`; transporte y
el resto son `unknown`. Se conserva la política de reintentos DELETE de la cola.

El admin pasa actor verificado y UUID de petición; `started` revalida owner.
El worker prueba un job `processing` con lease vigente, mediante RPC exclusiva
de servicio. Su actor técnico es el UUID nulo reservado, no una cuenta ni un
owner inventado. La migración aborta si ya existe un perfil con ese UUID.
El resultado puede cerrar tras caducar owner/lease solo si coincide con su
intención. No puede cambiar un resultado definitivo ni reabrir un reconciliado.
El journal guarda SHA-256 de `brevo_delete:<job UUID>:<lease UUID>`, nunca correo,
URL, lease en claro, cuerpo ni excepciones. `X-Request-ID` correlaciona ambas rutas.
Los UUID y hashes siguen siendo seudónimos.

Usa la misma vista `private.admin_pending_effects` y
`native_admin_reconcile_effect` descritas arriba: revisar primero el estado
externo, y reconciliar como owner mediante servicio. No se crea endpoint de
lectura ni se cambia la retención del paso 10. SMTP y sincronización de contactos
Brevo siguen pendientes de auditoría; este corte cubre exclusivamente DELETE.

Operación reservada a Isaac: producción contiene datos desde octubre, nunca
hacer reset. Aplicar `20261104095000_isa_1910_brevo_erasure_journal.sql` antes de
ambas Edge. DDL transaccional con `lock_timeout=5s`: un timeout aborta y exige
reprogramar la operación, no borrar datos ni retirar el límite para forzarla.
La función nueva está escrita completa; no se parchean cuerpos desde el catálogo.
Para revertir, detener/revertir ambos llamadores primero. El down restaura los
dos checks anteriores y elimina las dos RPC nuevas, conservando eventos antiguos. Si hay
cualquier evidencia Brevo, el down ya no sirve: aborta atómicamente con
`brevo_journal_rollback_requires_retention`. La salida es revocar EXECUTE de las
dos RPC nuevas a service_role y revertir ambas Edge; conservar schema y evidencia.
La Edge anterior no usa esas RPC. Estas acciones son exclusivas de Isaac:

```sql
revoke execute on function public.native_admin_claim_mail_erasure(uuid,uuid,uuid)
  from service_role;
revoke execute on function public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)
  from service_role;
notify pgrst, 'reload schema';
```

Nunca borrar el journal para forzar un down. Los unknown de intentos anteriores
no se cierran automáticamente al completar otro intento del mismo job:
`reconciled` exige owner vigente. El vínculo explícito job/efecto y una posible
revisión por sistema quedan anotados para una decisión posterior; este PR no
cambia esa autoridad ni inventa un reviewer owner.
El gate prueba ese rechazo y el rollback exacto sobre datos antiguos no vacíos.

## Contactos Brevo · paso 5d

`mail_sync` registra en el journal existente cada POST de alta/supresión y cada
PUT de grupos: `brevo_contact_upsert` y `brevo_contact_update`. El actor y request
UUID proceden del contexto verificado de native-admin; no del cuerpo recibido.
Intención confirmada antes del HTTP, resultado antes del siguiente HTTP y antes
de `mail_sync_ack`. Sin auditoría devuelve503 `mail_sync_audit_unavailable` y no
avanza. El contacto queda dirty y puede volver a sincronizarse al caducar su
lease; no se añade contador ni límite de intentos. No se envían campañas aquí.

El recorder service-only exige owner vigente y lease real del contacto para
started. El resultado puede cerrar su intención exacta aunque el owner/lease
caduque o el contacto se borre. SHA-256 del UUID interno y lease, sin correo,
URL, lista de destinatarios, body ni errores. 2xx con respuesta válida succeeded;
400/401/403/404/422 failed; transporte, otros HTTP o respuesta ilegible unknown.
Esto clasifica los rechazos permanentes fuera de pendientes; no añade contador
ni elimina el contacto dirty: tras corregir la configuración se puede volver a
sincronizar al caducar el lease. Los unknown históricos se conservan sin reescribir. Los
unknown permanecen en la misma vista y se reconcilian como owner, sin cierre
por sistema. No cambia consentimiento, proyección, pertenencia a listas ni ACK.

Isaac: migración `20261104100000_isa_1910_brevo_sync_journal.sql` después de#1942,
antes de native-admin. Producción tiene datos: sin reset, lock_timeout5s y
BYPASSRLS comprobado. Down restaura checks anteriores y elimina solo la nueva
RPC si todavía no hay eventos sync; con evidencia aborta atómicamente. Backout
con evidencia: revocar EXECUTE de native_admin_record_mail_sync(uuid,uuid,uuid,
text,uuid,uuid,text,integer) a service_role y revertir Edge, conservando journal.
No se deshace#1942 ni su auditoría DELETE. Todo despliegue reservado a Isaac.

Las bajas también exigen auditoría: no hay excepción que omita el journal para
blacklist/supresión. El consentimiento local manda; mail_can_send lo revalida
antes de SMTP, por lo que no se envía nada al usuario dado de baja aunque una
caída de auditoría impida actualizar Brevo. Esto no altera la baja local.

Cada POST/PUT admite como máximo5s desde antes de solicitar started hasta
justo antes de HTTP, con reloj monotónico (incluye espera del recorder). A los
5s se omite HTTP, se registra failed sin provider_status (no despachado),
se devuelve503 mail_sync_intent_expired y no se confirma sync. Dirty permite
reintentar tras lease.5s+timeout HTTP4s=9s, por debajo del margen de borrado10s
tras lease. Las dos fases comprueban el plazo por separado; el reloj de test
es inyectado, sin sleeps. No se cambia el margen ni los locks de borrado.

La corrección posterior usa20261104103000_isa_1910_mail_sync_limits.sql antes de
Edge. Sustituye la función completa; down restaura exactamente el cuerpo previo
sin borrar eventos. Los límites de provider_status siguen100..599; failed/null
representa exclusivamente una intención cuyo HTTP se omitió por caducidad.
Antes de revertir#1942, **revertir primero esta corrección y después#1944**:
Edge anterior primero; deshacer SQL solo cuando lo permitan sus guards. Si hay
eventos sync o DELETE, revocar EXECUTE y conservar schema/evidencia según cada
runbook; no forzar los down borrando filas ni deshacer#1942 con#1944 aún activo.

SMTP queda cubierto por el corte5e descrito a continuación. No se declara cerrado el paso5 ni se
implementan aquí confirmaciones, errores generales o retención del paso10.

## SMTP Brevo · paso5e

`mail_send_batch` reserva cada entrega y graba started en una sola transacción
mediante native_admin_claim_mail_send. Si falla el journal, se revierten claim,
reserva de cuota y auditoría local: entrega pending, cupo intacto, cero HTTP.
RPC ausente no tiene fallback legacy. La Edge exige actor y entorno verificados.
Antes de SMTP conserva mail_can_send y el consentimiento local; una baja cierra
failed/HTTP NULL (no despachado), después confirma skipped, sin enviar.

El proveedor pasa por el mismo helper brevo, con registro obligatorio. Solo2xx
con messageId no vacío es succeeded;400/401/403/404/422 failed; timeout, otros
HTTP y respuesta/recibo inválidos unknown. Se confirma resultado antes de
mail_finish. Caída de recorder devuelve503 mail_send_audit_unavailable y no
ACK: una intención sin cierre permanece en admin_pending_effects. Mantiene
reconcile owner, sin journal nuevo, sin registrar correo, URL, contenido ni
messageId. El hash incluye entorno y UUID interno de entrega.

La reserva que llegó a confirmarse puede representar un envío incierto y nunca
se reutiliza ni reenvía automáticamente, incluso tras reconcile. Tras perder
el ACK de claim o resultado, revisar proveedor/estado manualmente antes de
cualquier reparación. Quedan las tandas manuales de3 y cuota300/día existentes.
Reconcile conserva evidencia y no autoriza reintento SMTP.

Migración20261104110000_isa_1910_smtp_effects.sql después de103000, luego Edge
native-admin del corte aprobado, solo Isaac. Producción con datos: sin reset,
lock_timeout5s y BYPASSRLS comprobado. Down exacto de checks/RPC con evidencia
antigua conservada; con SMTP retenido aborta atómicamente. Backout con eventos:
revocar EXECUTE de las dos RPC SMTP y revertir Edge; conservar schema/journal.
Antes de deshacer1942, revertir los cortes SMTP, límites103000 y1944 en orden
inverso, respetando guards. Ningún agente realiza esas acciones en producción.

## Raíz única de informes · coordinación R6/7b

Admin lista, consulta, cuenta y revisa únicamente `testing_contributions` y su
seguimiento existente. Conserva el JSON que consume Rust y el mapeo de estados
de contribución a estados de admin. Las cinco funciones modificadas mantienen
sus firmas/ACL y las capas de despacho; se retiran las ramas legacy del cuerpo
delegado, sin aplanar SQL ni cambiar acciones ajenas a informes. El trigger de
auditoría resuelve la cuenta de un informe desde la misma raíz nueva.

**Orden obligatorio, reservado a Isaac y coordinado con VANTA-131:**

1. R6 detiene los escritores legacy (#1926) y archiva, verifica y vacía el
   padre y sus siete hijas (#1930, migración `20261104014000`).
2. Aplicar `20261104024000_isa_1910_admin_report_root.sql`.
   Bajo SHARE en las ocho tablas, exige que no quede ninguna fila (55000),
   ni INSERT/UPDATE/DELETE/TRUNCATE para ningún grantee salvo el dueño y los
   superusuarios (55000). Inspecciona ACL de tabla y columna, incluido PUBLIC,
   y permisos efectivos heredados. Los siete nombres RPC de #1926 deben carecer
   de EXECUTE para cualquier otro grantee, en todas sus sobrecargas (55000).
   Exige también que sigan existiendo sus siete firmas canónicas.
   No escanea cuerpos de funciones ni revoca permisos. Exige current_user con
   BYPASSRLS o SUPERUSER (42501), por FORCE RLS. El fallo es atómico.
3. El paso final de R6 está en el PR #1949: retira las tablas/RPC exclusivas
   del informe, el archivo vacío y el parche de `apply_clerk_user_event` en
   una transacción. Conserva `technical_issues`/`agent_jobs`, reescribe sus
   barreras de cuenta v2 y deja Linear/outbox inertes. Aborta si queda una
   fila legacy o una referencia viva del catálogo. #1924 conserva las ocho
   tablas y sus FK hasta ese cierre; Clerk conserva EXECUTE service_role.

Para revertir admin antes de retirar esas tablas, usar el `.down.sql` con psql:
restaura las cinco definiciones y el trigger anteriores y quita el índice, sin
borrar contribuciones ni datos. Después de retirar las tablas, restaurar primero
el esquema y los datos de R6; el rollback lo exige explícitamente. El guard
conservador no interpreta copias todavía retenidas en el origen como prueba de
mapeo: cualquier futuro contrato que permita conservarlas lo define el
orquestador con R6.

El gate recorre todas las migraciones por orden, incluido el 7b2 real, antes
de aplicar admin; comprueba que Clerk sigue ejecutable por service_role.
No hay shutdown auxiliar ni fixture que revoque Clerk. Cubre las siete firmas
canónicas y sus sobrecargas, roles de API, PUBLIC y un rol arbitrario,
privilegios por tabla y columna, ocho relaciones no vacías y un ejecutor sin
BYPASSRLS. Los oráculos históricos corren en su estado
anterior mediante los rollbacks reales de R6, fuera del replay limpio.
El rollback de admin compara cinco digests originales, incluido
native_admin_reports; conserva intencionadamente una línea con un espacio para
restaurar el cuerpo byte a byte. La carrera del guard sigue diferida por review.

El fallback de `claim` por `target_hash` está cubierto sin una fila de lease.
Un índice parcial sobre ese hash para `outcome='started'` corresponde al
predicado de la vista de pendientes y evita recorrer intenciones de otras
cuentas. No cambia la retención ni expone lecturas al cliente. Segundo reconcile
es idempotente y conserva una sola fila; release en cuenta borrada conserva
`expires_at`. Los fallos de release se registran con `console.error`, sin datos
personales ni errores SQL. Distinguir los 409 sigue reservado al paso 10.

Los tests `native_admin_report_r5.test.sql` y
`native_admin_final_decision_r4.test.sql` son históricos: solo se ejecutan contra
su cadena anterior a `20261104024000`, nunca como gates del esquema final.
La cobertura vigente es `native_admin_report_root.test.sql` con el harness de
cutover y rollback. Los digests nuevos de `native_admin_characterization.test.sql`
solo se seleccionan cuando el runner aplicó esa migración; los modos `before_*`
conservan sus controles RED de barreras sin anticipar el nuevo esquema.

## Autoridad owner · paso 4 de VANTA-132

Tras R6 y #1927, `private.is_owner(uuid)` decide tanto el acceso del actor como
la protección del objetivo y el campo `owner` del resumen enviado al cliente.
La migración `20261104070000_isa_1910_admin_owner_policy.sql` conserva las capas
SQL y todos los bloqueos: solo cambia cuatro fragmentos, con rechazo atómico
55000 si su fuente ha cambiado. Normaliza CRLF/LF en fuente y fragmentos.

Un owner activo sigue protegido frente a bloqueo y borrado; se conserva la
protección de la propia cuenta. Un owner caducado o revocado y una membresía
legacy owner no conceden esa protección ni acceso admin. Los demás requisitos
de confirmación, identidad, sandbox y barrera de borrado siguen vigentes.
`set_tester` sobre un owner activo no modifica su asignación ni su membresía:
no crea ni reescribe `testing_center_memberships.role='owner'`. Los cambios de
tester ordinarios siguen sincronizando su membresía tester/primary_tester.
Se mantiene la salvaguarda previa que exige revocar expresamente una asignación
owner caducada antes de reemplazarla por tester; no es autoridad para acceder.

El rollback restaura exactamente los cuatro cuerpos anteriores y sus ACL.
Orden al revertir dependencias: policy de este paso, report_root si procede,
puente owner de #1927 y finalmente la autoridad R6. El gate conserva los
oráculos anteriores antes del corte o bajo sus rollbacks reales y prueba el
nuevo comportamiento en el esquema final. No cambia datos, permisos, billing,
licencias, tablas legacy ni FK; el paso 11 sigue reservado a la base R6/12.

### ACK explícito del tester sobre owner vigente

`20261104083000_isa_1910_admin_owner_ack.sql`, después de la policy del paso 4,
responde `{account_id, owner:true, unchanged:true}` cuando `set_tester` apunta
al owner vigente. No incluye `enabled`: tanto activar como desactivar son un
no-op de asignación/membresía. Para un tester ordinario se conserva
`{account_id, enabled}`. No cambia la auditoría existente ni la autorización.
El rollback restaura el ACK anterior; debe revertirse antes de owner_policy.

El cliente Rust no lee `enabled` del ACK: `State::accept` agenda `GetAccount`
para `SetTester` y relee la cuenta. Por eso no requiere adaptación ni cambios
nativos. La compatibilidad se apoya en ese comportamiento, no en conservar un
campo engañoso. Tests nuevos cubren ambos ACK, borrado propio rechazado y
preparación real del borrado de un owner caducado (solo SQL desechable).
El gate observa en pg_stat_activity dos sesiones reales: revocación del owner
objetivo confirmada permite set_blocked tras esperar; si revierte, sigue
protegido. Cada uno de los cuatro hunks de policy tiene una prueba de deriva
atómica independiente, además del rollback exacto y la reaplicación.

## Errores de admin · paso 7

`errors.ts` traduce una lista cerrada de nombres SQL completos a `NativeError`.
Cambio aprobado: `creator_coupon_mismatch`, `admin_report_owner_changed` y
`account_deleted` pasan de 503 a 409 `account_conflict`; Rust indica refrescar.
SQLSTATE `40001` también devuelve 409. Confirmación 422, permiso 403,
inexistente 404 e inválido 400 conservan sus contratos.

Un cambio parcial siempre devuelve 503 `account_change_incomplete`; los demás
`NativeError` se conservan. Desconocidos dan 503 y un diagnóstico fijo sin PII.
No se aceptan prefijos ni nombres genéricos de errores externos. Sin migración;
Isaac puede revertir la Edge al corte anterior.

### Review SMTP: claim y límites previos al envío

El claim conserva los errores SQL conocidos (revisión 409, permiso 403,
inexistente 404, inválido 400); los demás son 503 de auditoría. Si falla el
consentimiento o la firma de baja antes del HTTP, la intención se cierra como
`failed` sin estado HTTP antes del ACK. No se envía tras 5 s desde el inicio del
claim. El índice parcial único permite una sola intención por entrega y entorno,
incluso si ya se cerró: ninguna entrega SMTP se reenvía automáticamente.
`owner-alert-receiver` queda fuera de este journal: ya tiene su propia reserva
persistente e `idempotencyKey`.


## Contrato único de acciones · paso 9

`actions.ts` define validación y despacho de las 25 acciones, con ejemplos,
mutación y límites de entorno. Index y mail consumen esa tabla; SQL conserva
los permisos y el negocio. Exportar sin red ni claves:

```powershell
deno run --cached-only --no-lock --config supabase/functions/deno.json supabase/functions/native-admin/actions.ts > vantare-v2/native/admin/fixtures/admin-actions.json
```

Deno y Rust leen la fixture; Rust la carga una vez y cruza variantes, campos,
serialización, mutación y enums. paid_at sigue omitido por la vista. Sin migración.

## Borrado compartido · paso 8a

Admin y Clerk importan el mismo limpiador desde `_shared/account-erasure.ts`;
el admin deja de importar el punto de entrada del webhook. Abortos multipart,
objetos, límites de cinco tandas y ACK conservan su orden y sus reintentos.
Los errores de una cola de uploads no impiden drenar los objetos completados.
No cambia SQL, tampoco `apply_clerk_user_event`. Sin migración; Isaac despliega
las dos Edge del corte aprobado. El resto de lecturas puras sigue en el paso 8b.
