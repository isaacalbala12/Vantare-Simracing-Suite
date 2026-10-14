# native-admin · gestión privada r1 (#1627)

OAuth Clerk y Owner vigente comprobados en Edge y otra vez en SQL. Cuenta
bloqueada: 403. JSON cerrado de 8 KiB, bearer limitado, solo POST, `no-store`,
presupuesto persistente de 60 peticiones/minuto por actor. El cliente no recibe
secretos ni tiene acceso directo a tablas. No se crea Owner automáticamente.

Aplicar las migraciones existentes y `20261014010000_native_admin_r1.sql` antes
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
| `delete_account` | `account_id`, `confirm_email` | contrato preparado; borrado pendiente de #1622 |
| `list_creators` / `get_creator` | ninguno / `creator_id` | creadores, totales, líneas y `history_complete` |
| `create_creator` | `name` ≤120, `email` ≤320, `code` `[A-Z0-9]{3,32}` | reserva local y código Polar confirmado |
| `record_creator_payout` | `creator_id`, `amount_cents`, `paid_at?` | apunta pago manual, no transfiere dinero |

Búsquedas: solo cuentas ya vinculadas al issuer; no crea destinos ni une por
correo. Los filtros de Personas se aplican a la página cargada, con recuentos
SQL globales. Revocar acceso individual conserva acceso por plan, rol o rollout.

Informes: `submitted`, `in_review`, `validated`, `rejected`, `fixed` son los cinco
estados visibles nuevos; se conserva lectura de estados históricos. Draft no se
lista. Arreglado exige aceptación previa y versión de release. La actualización
usa los triggers y `testing_report_followup` existentes: avisos y descuentos de
testers conservan su flujo. Capturas privadas `ready`, firmadas durante 600 s.

## Efectos externos y recuperación

**Candidato limitado a sandbox.** Crear códigos, bloquear y preparar borrado
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
Incorrecto: 422. Correcto: `deletion_barrier_unavailable` sin efectos. La base
`b9ec75ed` carece de la barrera de #1622: el orquestador la conectará tras su
revisión. No se sustituye borrado por un ban.

Los códigos reservan identidad estable y se reconcilian tras perder un ACK.
Descuento 20 %, dos meses, exactamente los cuatro productos de lanzamiento.
Organización verificada mediante GET (OAT: no `organization_id` en POST), portal
sin cambio de plan. Se rechazan códigos ajenos o de alcance distinto. Se admite
adoptar un código anterior identificado por `vantare_offer_key: creator:CODE`.

## Recibos y comisiones

Proyección privada de órdenes/refunds firmados del webhook. Para cuentas sin
historia certificada se lee el historial completo de sandbox: páginas acotadas,
identidades existentes, sin crear cuentas. Una vez completo se usa el ledger,
sin volver a consultar Polar por caducidad de caché. La lectura histórica no
concede licencias ni sustituye los ledgers comerciales existentes. El espejo de
Launch Edition nunca consume su ruta BIL-07 de revocación tras reembolso.

Céntimos EUR enteros: total tras descuento e impuestos; refund incluye impuesto.
La fecha histórica es la fecha de factura (`created_at`), pues la API de órdenes
no ofrece `paid_at`; no demuestra fecha de liquidación bancaria. Las órdenes con
saldo aplicado, divisa/producto desconocido o campos incompletos dejan la cuenta
sin certificar y bloquean el pago manual. Pendientes de reembolso no se liquidan.
Motivo del refund y fecha de su confirmación, cuando existen, proceden del último estado verificado (`modified_at`), no de una liquidación bancaria. La primera compra pagada fija creador; cohortes por aniversario mensual UTC:
30 % mes 1, 10 % meses 2–12, 0 % desde mes 13. Igual para cobro anual, sin
prorratear. Redondeo half-up por línea. Los registros legacy netos se identifican
como tales, con fecha de registro; no se inventan impuestos ni enlace de cliente.

Solo se apunta saldo de meses UTC cerrados, >0 y ≤ disponible, con bloqueo
transaccional frente a recibos/refunds. Se distribuye el pago por antigüedad y
se protege exactamente la comisión pagada, incluso si una línea se pagó a medias.
Un refund posterior reduce solo lo aún no pagado. Payout append-only, auditoría
de antes/después; no se envía dinero. Esto no ejecuta un cierre automático ni
reconstruye la situación de un cierre histórico anterior al registro manual.

## Verificación local

Desde raíz Git, sin permisos de red y con cachés ya instaladas:

```sh
deno test --config supabase/functions/deno.json --cached-only --allow-env --allow-read --allow-write=/tmp supabase/functions
python3 supabase/tests/run-admin-local.py --output /ruta/fuera-del-repo --test native_admin.test.sql --test native_admin_reports_r1.test.sql --test native_admin_accounts_r1.test.sql --test native_admin_creators_r1.test.sql --test native_admin_payments_r1.test.sql --test native_admin_months_r1.test.sql --test native_admin_attribution_r1.test.sql
```

Runner: PostgreSQL Supabase desechable, Docker `--network none`, sin puertos,
todas las migraciones reales y bootstrap sintético auth/storage. Comprueba TAP,
no solo exit de psql. Fakes Clerk/Polar en Edge. RED y GREEN en
`~/evidence/1627/`. Variables existentes: configuración pública OAuth, secretos
Edge ya establecidos, `POLAR_ENVIRONMENT`, `POLAR_ACCESS_TOKEN`, mapa Polar;
solo se usan nombres, no valores reales. Despliegue, secretos, QA de OAuth y
webhooks reales quedan al orquestador tras revisión y autorización propias.

Referencias API: [órdenes](https://polar.sh/docs/api-reference/orders/list),
[orden e importes](https://polar.sh/docs/api-reference/orders/get),
[refunds](https://polar.sh/docs/api-reference/refunds/list).
