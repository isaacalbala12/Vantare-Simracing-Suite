# ISA-1514 — Clerk + Polar + Supabase: revisión y plan

Fecha: 2026-10-08. **Propuesta para revisar; no migración implementada.**
Seguimiento:
[#1514](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1514).
Decisión autorizada por Isaac: Clerk identifica; Polar cobra como Merchant of
Record; Supabase conserva datos/backend. Supabase Auth deja de ser proveedor de
identidad. No autoriza tocar producción ni contratar servicios en esta fase.

**Última fecha de Isaac:** intentar venta el lunes **12-oct-2026 a las 10:00,
Europe/Madrid (08:00 UTC)**; Go/No-Go a las **09:00 (07:00 UTC)**. Si no llega,
venta el **19-oct**, incluyendo Microsoft Store como objetivo separado. Ninguna
fecha sustituye el gate monetario. Hoy: **NO-GO para cobrar**, por evidencia
incompleta y bloqueos existentes, no porque la arquitectura elegida sea
inviable.

## Documentos y autoridad

- [Inventario completo de código y referencias](bil-13-supabase-auth-inventario.md).
- [ADR propuesta 0100](../adr/0100-proposed-clerk-identity-polar-supabase.md).
- [Revisión BIL-12 / #1506 / PR #1513](bil-12-polar-atribucion-review.md).
- [Precios #1499 / PR #1500](bil-11-polar-precios-pro-runbook.md).
- [Credenciales BIL-08](bil-08-offline-credential-runbook.md).
- [#885](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/885)
  caracteriza session JWT → TPA en desarrollo; no demuestra OAuth nativo → TPA.
- [#909](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/909)
  propone el mapping seguro a UUID. Está presente en el candidato nativo leído,
  ausente de la base #1506. No se presupone desplegado.
- [#875](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/875)
  fija el límite de proveedor y offline;
  [#291](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/291) es
  el programa monetario histórico. Su frase «Supabase identidad KEEP» queda
  sustituida por la decisión del 08-oct; no sustituye el gate de venta.

Las instrucciones de raíz y `vantare-v2/AGENTS.md` en esta base aún exigen
Notion; Isaac ordena GitHub para este encargo. Se usa GitHub. El archivo
`docs/roadmap/plan.md` y `.github/scripts/roadmap_digest.py` no existen en esta
base; el handoff de #1377 documenta su retirada. No se recrea ni regenera un
roadmap histórico, ni se publica contenido en Supabase. Este documento conserva
el plan pendiente dentro del mismo PR. Esa divergencia queda para revisión de
Isaac; no se modifican las reglas globales del repo oportunistamente.

## Modelo elegido

**UUID interno independiente**, usando `public.profiles.id` como cuenta actual;
no crear una segunda tabla `accounts` solo para renombrarlo. Reutilizar
`account_identities(issuer text, subject text, account_id uuid)` del candidato.
Clave única `(issuer, subject)`; creación de perfil + mapping en una transacción
con el control de concurrencia existente. Normalizar issuer con regla única,
comparar con una lista exacta de emisores autorizados por entorno. Prohibir
autoprovisionar desde un JWT no verificado o desde metadata/email del cliente.

| Identificador                         | Tipo y uso                                                     | Autoridad                         |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Cuenta Vantare                        | UUID; perfil, dispositivos, grants, ledger, credencial offline | Backend Vantare                   |
| Clerk `sub`                           | Texto `user_*`; identidad externa, no cast UUID                | Token Clerk verificado            |
| Clerk `iss`                           | Texto normalizado; distingue desarrollo/producción             | Config del entorno + verificación |
| Polar `external_customer_id`          | UUID interno serializado como string                           | Checkout del servidor             |
| Polar customer/order/subscription IDs | IDs externos con entorno/proveedor                             | Polar verificado                  |

**No convertir las claves de negocio de UUID a text.** La conversión necesaria
es que la identidad externa y cualquier campo que almacene `sub` sean text; el
mapping ya lo es. Sustituir las FKs `auth.users` por `profiles(id)`, manteniendo
UUID y semántica de borrado tras revisar cada caso. RLS usa el UUID resuelto
desde `auth.jwt()->>'iss'` y `auth.jwt()->>'sub'`, nunca `auth.uid()` sobre
`user_*`. Preferir una lectura de mapping sin efectos para RLS: una identidad
desconocida devuelve denegación; el bootstrap explícito autenticado crea cuenta.
El resolver actual crea cuentas; no llamar ese camino mutante por cada fila de
una policy. Funciones privadas con `search_path` vacío, privilegios mínimos y
ejecución restringida; comprobar plan/índices y no exponer mapping a clientes.

El ejemplo oficial de Clerk con `user_id text = auth.jwt()->>'sub'` sirve para
una tabla nueva sin dominio previo. Vantare conserva UUID porque ya firma
cuentas/dispositivos offline y tiene claves comerciales. Esto cumple TPA sin
reescribir todo el schema. Las sesiones de Clerk y las licencias Vantare son dos
autoridades distintas: estar autenticado no concede Pro ni Launch.

## Checkout y recuperación segura

Objetivo completo: web con login Clerk de la **misma instancia** que el nativo;
botón en la app abre esa compra. Web obtiene session token fresco; servidor
valida TPA/JWKS por la frontera acordada, resuelve UUID y crea Checkout Session.
El cliente solo envía `productKey` y `attemptId`. Mantener allowlist servidor,
idempotencia durable e incertidumbre sin reintento a ciegas.

Antes de devolver URL de pago: perfil/mapping comprometidos, catálogo/env
consistentes, intento persistido y checkout registrado. Registrar el vínculo
`environment + checkout_id + customer_id + account_id`; al procesar webhook
verificado comprobarlo contra `external_customer_id`. Conflicto o identidad
ausente → cuarentena + alarma, jamás elegir por email ni aceptar
`metadata.user_id` como única autoridad. Un redirect success no concede nada.

Para pagos huérfanos: mantener inbox y ledger, cerrar enlaces anónimos/antiguos,
no borrar evidencia. Soporte pide login Clerk reciente y prueba independiente de
compra. Un vínculo ya registrado por servidor basta si no hay conflicto; para
pago antiguo, revisión autorizada con la transacción Polar y prueba de posesión
de la cuenta anterior o procedimiento de reclamación fuerte. Un email verificado
por sí solo sigue sin demostrar propiedad de una orden histórica. Enlace
auditado transaccional con unicidad; después replay auditado e idempotente. Si
no hay prueba, caso abierto o reembolso autorizado, nunca grant por semejanza.

## Reglas comerciales que el corte debe respetar

- **Reembolso:** retirar el derecho comercial afectado desde su emisión,
  conservando grants independientes. El parser actual exige `payment_id` que el
  Refund oficial no garantiza, y Pro mantiene grant tras refund: bloqueos
  BIL-12. Pro requiere revocación inmediata coordinada o proyección por refund,
  no cancelación al fin del periodo. Launch mantiene offline perpetuo hasta
  reconectar y sustituir su credencial. La política ante refund parcial/pending
  y fallo posterior se propone en la pregunta 4; no asumir que el ledger actual
  (solo total succeeded) expresa la decisión nueva.
- **Contracargo:** suspender el derecho afectado mientras la disputa dure;
  cierre favorable lo restaura solo si la concesión sigue válida, cierre
  desfavorable la retira. Nunca restaurar por un evento antiguo. No se encontró
  handler dispute/chargeback en `billing-webhook/process.ts`; se necesita fuente
  de eventos/API Polar comprobada o runbook operativo vigilado. No simular un
  webhook inventado. La suspensión offline Launch tiene el mismo límite físico.
- **Cancelación ordinaria Pro:** acceso hasta `paid_through`; revocación
  inmediata y refund son caminos diferentes. Mensual/anual, mismas capabilities.
- **Launch:** perpetua offline para módulos de la edición inicial y mejoras;
  nuevos módulos fuera del alcance. Engineer incluido en el contrato inicial:
  probar candados reales, no solo `launch_v1` en el mapping.
- **Trial Pro:** siete días, con método de pago, recordatorio y antiabuso;
  expiración estricta, sin gracia que extienda trial. El corte actual de #1499
  solo configura trial mensual; no anunciar anual con trial sin decisión nueva.
  Si el lunes no se ofrece Pro, no anunciar prueba de Pro activa. Aplazarla no
  equivale a implementarla ni a cambiar su duración.

## Retirada: borrar ya / tras migrar / mantener

«Ya» describe el primer corte de implementación aprobado; **este PR no borra
ningún código, migración, provider, email, cuenta ni fila**.

| Momento                | Retirada o conservación                                                                                                                    | Condición                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Borrar/retirar ya      | Publicación de enlaces Polar anónimos y recomendaciones de sustituir Discord por URL directa en `web-1502/checkout-config.js:1`            | Cerrar entrada de pago; no retirar evidencias de links previos                                     |
| Borrar/retirar ya      | `auth.getUser` exclusivamente de la nueva ruta de compra Clerk; duplicación Supabase login en esa compra                                   | Sustitución verificada; no cambiar el wrapper de cuatro consumidores de golpe                      |
| Borrar/retirar ya      | Autoasignación por `metadata.user_id` sin vínculo durable; promociones basadas en email                                                    | Tests negativos y cuarentena operativa                                                             |
| Borrar tras migrar     | Login/signup/reset/OAuth Supabase del frontend Wails y Electron antiguo; sesiones/refresh Supabase en OS/browser                           | Beta nativa aceptada y ningún consumidor soportado; limpieza local voluntaria por usuario          |
| Borrar tras migrar     | `_shared/auth.ts` actual, `_deprecated/validate-license`, rama legacy `/auth/v1` del resolver y joins de email a Auth                      | Todos los consumidores migrados; compatibilidad archivada y rollback acotado                       |
| Borrar tras migrar     | FKs de tablas productivas a `auth.users`; trigger `on_auth_user_created`/`handle_new_user`; altas/backfill Auth ejecutables                | Reemplazos validados, borrado Clerk funcional, catálogo remoto comprobado                          |
| Borrar tras migrar     | Providers de login Supabase email/password, social, magic-link, phone, signup/hooks/SMTP y plantillas de autenticación antiguas si existen | Isaac inventaría config remota; cerrar sesiones legacy y comprobar cero consumidores               |
| Borrar tras migrar     | Usuarios/sesiones de Supabase Auth que sean datos personales                                                                               | Política de retención, exportación y autorización expresa; no usar `DROP SCHEMA auth CASCADE`      |
| Mantener               | Postgres, Storage, Realtime, Edge, RLS y helpers `auth.jwt()`/roles `authenticated`, `anon`, `service_role`; integración TPA               | `auth` contiene infraestructura usada por TPA aunque GoTrue deje de identificar                    |
| Mantener               | UUID perfiles, dispositivos, entitlements, capabilities, grants por fuente, ledger/inbox/attempts/reconciliación y auditoría               | Prohibido perder derechos/evidencia al borrar una identidad                                        |
| Mantener               | Polar MoR, catálogo controlado, env separado, firma webhook, kill switch, replay y soporte                                                 | Ningún secreto en cliente ni creación de pagos desde un link público sin sesión                    |
| Mantener               | Ed25519 BIL-08, claves públicas anteriores, envelope offline, HWID/clock/canal/scope                                                       | Cambiar issuer no cambia el sujeto UUID ni rota la firma offline                                   |
| Mantener               | Migraciones históricas aplicadas y tests/rollbacks útiles                                                                                  | Añadir migración forward para retirar; no reescribir historia SQL ni borrar todo Auth de los tests |
| Mantener temporalmente | Tablas legacy `licenses/subscriptions/license_validations/hwid_changes/rate_limits` y Stripe histórico                                     | Solo retirar tras demostrar cero consumidores y reconciliar derechos, no por esta decisión         |

No confundir «eliminar una migración pendiente inválida» con borrar un archivo
SQL ya aplicado. Un bootstrap limpio seguirá reproduciendo historia y luego
aplicará el cutover; pruebas de upgrade y restore protegen ambos caminos.

## Clerk y Supabase: configuración propuesta

1. **Instancia producción antes de cobros públicos.** Elegir dominio real de
   web, FAPI y Account Portal; DNS/CNAME según Dashboard, HTTPS, orígenes
   exactos, retorno de compra fijo y OAuth native client + PKCE + redirect
   loopback soportado. No inventar portal productivo a partir del issuer.
   Candidato `native/hub/src/services/access.rs:245` solo reconoce
   `.clerk.accounts.dev`; requiere URLs explícitas de alta/reset para producción
   y build comprobada. El endpoint público de desarrollo
   `enabled-lionfish-1336.clerk.accounts.dev/v1/environment` respondió el 08-oct
   (config display presente; longitud mínima password 8). Esto prueba existencia
   de ese development, **no** issuer/config de la build instalada ni
   inexistencia de una instancia producción.
2. Web y native deben usar esa instancia y el mismo mapping. DNS puede tardar
   hasta 48 h. Development usa credenciales sociales compartidas; producción
   requiere propias. El mínimo puede usar email verificado sin habilitar social
   aún; no habilitar opciones de pago por copiar toda la config development.
3. **Integración oficial TPA**, no template Supabase con secreto JWT compartido.
   Activar integración Supabase en Clerk; registrar dominio Clerk en Supabase
   Authentication → Sign In / Providers → Third-party Clerk. Local:
   `[auth.third_party.clerk]` con `enabled` y `domain` según docs/CLI instalada.
   Tokens asimétricos/JWKS; session JWT web fresco mediante `session.getToken()`
   y `accessToken` del cliente Supabase, sin `supabase.auth.setSession` ni
   refresh de Clerk desde Supabase. No entregar secret/service_role a web.
4. Claims: `sub` permanece el Clerk user ID; `iss`, expiración/firma/issuer y
   audiencia/authorized party del flujo se validan por la autoridad adecuada.
   `role: authenticated` es rol de Postgres, **no Owner, Pro ni derecho de
   pago**. Comprobar que la integración lo añade a cada sesión. Nunca emitir
   `service_role`/Owner/capabilities desde datos editables. No sobrescribir
   `sub` con UUID interno. Metadata pública para presentación; `unsafe_metadata`
   nunca autoriza. Metadata privada/external_id solo auxiliar server-side y
   nunca reemplaza `account_identities` como autoridad del vínculo.
5. **OAuth nativo no es el session JWT web.** Conservar verificación oficial
   `verifyNativeOAuth` del candidato y reutilizar su resolver UUID. El bridge
   `native-account-authorize/index.ts:25,117` firma un token HS256 de datos por
   hasta cinco minutos con issuer Supabase y UUID: no es Supabase login ni TPA,
   y `getUser()` no lo acepta por obligación. Mantenerlo provisional solo para
   consumidores existentes; retirarlo al cerrar esos consumidores con una
   decisión probada. TPA oficial cubre web; retirar toda emisión local nativa
   exige caracterizar un token soportado por Clerk para native o mantener las
   RPC nativas verificadas como vía server-side. No diseñar un conversor JWT
   paralelo ni pretender que el OAuth token es `session.getToken()`.
6. Edge gateway: no bajar `verify_jwt` globalmente. Una ruta Clerk que use
   `verify_jwt=false` debe verificar identidad antes de toda consulta
   privilegiada o efecto. Para sesión web, reutilizar PostgREST/TPA que devuelve
   mapping/RPC después de verificación; para native, Clerk OAuth API. Rechazar
   bearer ausente, inválido, revocado o wrong client; 401/403 nunca usa cache
   offline como éxito. Probar gateway desplegado. `_shared/auth.ts:56` no sirve
   como fallback Clerk.
7. Webhooks `user.created`, `user.updated`, `user.deleted` → Edge Supabase:
   firma Standard Webhooks verificada sobre cuerpo exacto, tolerancia timestamp,
   deduplicación, issuer/instancia, inbox/retry/tombstone. Creación y primer
   login usan el mismo bootstrap idempotente; webhook puede llegar tarde.
   Actualizar contacto/presentación, jamás capabilities. Borrado invalida
   identidad y bloquea nueva provisión tardía; no restituir con un viejo
   `user.created`. No basar una decisión de compra en que llegó el webhook de
   creación.
8. Configurar emails de autenticación en Clerk producción, remitente/dominio y
   traducciones. Emails monetarios/trial en Polar; borrado/exportación y soporte
   en Vantare. No retirar plantillas Auth Supabase hasta finalizar transición.

Documentación oficial verificada el 08-oct-2026:

- [Supabase: Clerk TPA, claims, cliente y template obsoleto](https://supabase.com/docs/guides/auth/third-party/clerk).
- [Clerk: integración Supabase; no sincroniza usuarios automáticamente](https://clerk.com/docs/guides/development/integrations/databases/supabase).
- [Supabase: TPA y verificación asimétrica](https://supabase.com/docs/guides/auth/third-party/overview).
- [Clerk: deploy productivo, DNS, credenciales sociales, webhooks](https://clerk.com/docs/guides/development/deployment/production).
- [Clerk: Development no apto para producción; límite y aislamiento](https://clerk.com/docs/guides/development/managing-environments).
- [Clerk: webhooks eventualmente consistentes](https://clerk.com/docs/guides/development/webhooks/syncing).
- [Clerk: migración; no traslado directo Development → Production](https://clerk.com/docs/guides/development/migrating/overview).

No se replica una guía completa: enlaces para implementación y resumen de las
decisiones propias de Vantare. No se configuró ninguno de estos proveedores.

## Política de cuentas, borrado y RGPD

Una identidad puede desvincularse; la cuenta UUID no se reutiliza para otra
persona. Cambio de email no mueve compras. Vincular una identidad nueva a un
UUID existente exige prueba reciente de ambas identidades o revisión de
recuperación fuerte; guardar responsable, método y motivo sanitizado.

Propuesta: borrado solicitado con reautenticación, aviso de efecto sobre
suscripción/licencia, cierre de renovación cuando proceda y proceso reanudable.
Tombstone mínimo bloquea login/bootstrap y eventos tardíos; borrar datos de
perfil, archivos y tokens, separar libros monetarios necesarios y minimizar/
seudonimizar los datos conservados. No hacer cascada que elimine facturas,
grants/auditoría de pagos sin cumplir las obligaciones aplicables. Notificar al
usuario fin o excepción de conservación. Exportación autenticada de datos
propios con alcance y caducidad; sesiones revocadas no pueden exportar.

El borrado de un usuario Clerk no revoca una suscripción Polar automáticamente;
un webhook no debe dejar renovando una cuenta inaccesible. Tampoco borra una
credencial Launch perpetua ya offline. Política de cuenta borrada +
reinstalación y plazo legal de retención pendientes de Isaac/asesoría; no fijar
un plazo fiscal inventado. Revisar encargados/DPA, transferencias, privacidad y
consentimiento separado para marketing/lista de espera.
[RGPD, arts. 5, 17 y 20](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).

## Cuántos usuarios existen: desconocido, consulta segura para Isaac

No se consultó producción. Cero usuarios **no** es un resultado inferible de
fixtures ni de cinco órdenes sandbox históricas de BIL-12. Isaac ejecuta en SQL
Editor del proyecto correcto, copiando solo agregados/esquema, nunca emails, IDs
de persona, hashes, tokens o filas JSON. La siguiente consulta no muta nada:

```sql
begin transaction read only;
select 'auth_users' as metric, count(*) as n from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'auth_without_profile', count(*) from auth.users u
  where not exists (select 1 from public.profiles p where p.id=u.id)
union all select 'profile_without_auth', count(*) from public.profiles p
  where not exists (select 1 from auth.users u where u.id=p.id)
union all select 'devices', count(*) from public.devices
union all select 'entitlements', count(*) from public.user_entitlements
union all select 'billing_customers', count(*) from public.billing_customers
union all select 'billing_access_grants', count(*) from public.billing_access_grants;
select provider, environment, count(*) as customers
from public.billing_customers group by provider, environment;
select status, product_key, count(*) as entitlements
from public.user_entitlements group by status, product_key;
select to_regclass('public.account_identities') as mapping_table;
-- Solo si mapping_table no es null:
-- select case when issuer like '%.accounts.dev%' then 'development'
--   when issuer like '%/auth/v1%' then 'legacy' else 'other' end as identity_kind,
--   count(*) as mappings, count(distinct account_id) as accounts
-- from public.account_identities group by 1;
select c.conrelid::regclass as dependent_table, c.conname,
       pg_get_constraintdef(c.oid) as fk
from pg_constraint c
where c.contype='f' and c.confrelid='auth.users'::regclass;
select schemaname, tablename, policyname, qual, with_check
from pg_policies
where coalesce(qual,'') || coalesce(with_check,'') ~ 'auth\.(uid|jwt|role)';
select t.tgrelid::regclass as relation, t.tgname,
       t.tgfoid::regprocedure as handler
from pg_trigger t where not t.tgisinternal and t.tgrelid='auth.users'::regclass;
rollback;
```

Si falta alguna tabla, aborta esa consulta y registra «tabla ausente», sin
inventar count=0; ejecutar bloques por separado. Revisar también catálogo de
funciones con dependencia de Auth y Storage policies en Dashboard sin exportar
cuerpos que pudieran contener secretos. Para número Clerk, Isaac consulta los
totales de Users de cada instancia; no exporta usuarios. Para config remota,
registrar solo nombres de providers habilitados, signup/mailer/hooks,
dominios/instancia y nombres de funciones desplegadas, sin claves ni plantillas
que contengan valores privados. Estos son los datos necesarios para ajustar
estimaciones y demostrar qué se elimina.

## Migración y vuelta atrás

1. Fijar matriz de SHA/schema/deploy por entorno; snapshot bajo custodia de
   Isaac y ensayo restore aislado. No copiar el dump a Git ni a este worktree.
2. Añadir mapping/FKs alternativas, bootstrap y estado de cuenta bloqueada; no
   borrar Auth aún. Conservar UUID de derechos existentes. No recrear usuarios
   en `auth.users` para contentar una FK.
3. Cuentas nuevas: Clerk producción y UUID nuevo. Cuentas sin valor económico:
   preferir alta nueva, migrar contenido solo si Isaac identifica necesidad.
   Cuentas con derechos: preservar UUID/grants/device; usuario demuestra
   posesión legacy y Clerk producción, o soporte fuerte. Vincular en transacción
   con bloqueo y unicidad. No autoenlazar por email. Para Development →
   Production, alta/autenticación nueva y vinculación segura; no prometer
   traslado de sub, password o sesión. Importar hashes/passwords queda fuera de
   este encargo.
4. Canary, comparación de counts/derechos y renovación de la misma credencial
   UUID. Sesiones antiguas caducan/reautentican; el offline firmado no se
   altera.
5. Migrar superficies activas y policies/FKs restantes. Cerrar altas legacy,
   observar cero llamadas legacy, probar user.deleted y recuperación. Solo
   entonces retirar providers/branch legacy/Auth personal bajo autorización.

Rollback antes de borrar Auth: cerrar checkout, mantener recepción/replay de
webhooks y pagos existentes, volver al binario/handler compatible **con mapping
actual**, no al de antes de #909. Conservar UUID nuevos, ledger e inbox; no
restaurar un snapshot antiguo sobre compras posteriores. Restaurar triggers/
policies legacy solo donde corresponda; usuarios Clerk-only necesitan seguir
resolviendo su cuenta o soporte, no volverlos anónimos. El rollback de #909 que
recrea FK a Auth exige cero perfiles sin Auth: será inválido tras primer
comprador Clerk-only. Pasado el borrado real, rollback técnico a Auth no es
seguro: usar forward fix/restore ensayado con reejecución del inbox y
reconciliación aprobada.

## (a) Mínimo absoluto para intentar cobrar el 12-oct

**Candidato más corto: Launch Edition únicamente, desde app nativa autenticada,
cohorte acotada; compra web independiente y Pro cerrados.** Requiere aceptación
de Isaac del alcance comercial reducido. La web informa/dirige a descargar y
abrir app; no ofrece URL de pago anónima. App tiene login Clerk producción y
botón Comprar; su servicio usa OAuth actual, sin guardar token en URL/browser.
La sesión sigue siendo Clerk. Si una compra se ofrece en web, también exige
login Clerk y el corte TPA; no usar esta excepción para cobrar sin sesión.

No añadir otro proveedor ni adaptar todo `_shared/auth.ts`: adaptar solo la ruta
checkout nativa con `verifyNativeOAuth` + usuario no bloqueado + resolver común
del candidato, contrato `productKey/attemptId` existente y catálogo servidor.
Preferir parametrizar el handler actual en su composición, con autenticación
única explícita, evitando copiar un segundo billing pipeline. Reapuntar FK
`billing_checkout_attempts.user_id` a profiles y las FKs legacy que realmente
use esa ruta. El candidato `native_resolve_account` ya devuelve el mismo UUID
que `native-license`; la mezcla de bases se revisa antes de tocar.

Imprescindible, incluso para Launch solo:

1. Clerk producción/domino/client native funcionando, emails/login/alta/reset,
   retorno PKCE y UUID estable en app. Resolver y schema desplegados
   comprobados. No vender desde `accounts.dev` para ahorrar ese trabajo.
2. Checkout atribuido durable, metadata contrastada, cliente sin identidad
   suministrada, entorno/catalog/version correctos y enlaces antiguos cerrados.
3. Webhook real nuevo → grant Launch → emisión Ed25519 nativa → candados,
   Engineer/scope inicial, reinicio offline y reconexión. Un dispositivo activo.
4. Refund compatible con payload real y retirada al reconectar; suspensión de
   contracargo con fuente/runbook verificado y monitorización; replay de eventos
   perdidos; soportar cierre de checkout sin cerrar procesamiento de pagos.
5. Preflight previo a pago: resolver cuenta, confirmar dispositivo y capacidad
   de renovar credencial base válida en build instalada; signer/db/inbox sanos,
   operador y alertas listos. Ningún pago como experimento sin gate.
6. Aviso de alcance/soporte/refund, privacidad/borrado mínimo seguro, términos,
   precio 30 EUR autorizado, producción Polar/config MoR, checkout/retorno y
   dominios revisados. Producción, cobro de prueba y release requieren
   autorización.

**No hay atomicidad entre cobro Polar y disponibilidad de Supabase.** No se
puede prometer riesgo matemáticamente cero ante una caída después del pago. Este
corte elimina pago sin atribución y exige entrega/reparación comprobadas:
pendiente visible y sin invitar a pagar otra vez, inbox durable, alarma y
reconciliación; si no puede entregar dentro del umbral operativo aceptado,
cerrar nuevas compras y ejecutar soporte/reembolso autorizado. Si «sin riesgo»
significa entrega inmediata garantizada incluso ante caída total, **No-Go**:
ningún puente de login demuestra eso. Isaac debe aprobar el umbral de entrega.

Estimación propia, una persona experimentada y entornos disponibles:

| Trabajo mínimo                                                        | Esfuerzo                   | Dependencia / evidencia de salida                                   |
| --------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Fijar deploy/base + producción Clerk/DNS + cuentas de prueba          | 0,5–1 día + hasta 48 h DNS | Isaac acceso/config/coste; OAuth real                               |
| Checkout native acotado + FKs necesarias + botón #1501                | 1–1,5 días                 | Resolver común y candidate compilable; tests negativos/idempotencia |
| Refund Launch + disputa/runbook + recuperación operativa              | 0,5–1 día                  | Payload/API real, soporte y política aprobada                       |
| Matriz sandbox completa, gates, build, aceptación y canary autorizado | 0,5–1 día                  | Todo lo anterior; prueba física en cliente                          |

Total **2,5–4,5 días de trabajo**, más latencias externas, sin promesa de llegar
en cuatro días naturales desde el jueves 8. Ruta crítica: identidad producción →
UUID común/schema → checkout durable → grant/credencial real → QA/aceptación. No
empezar compras mientras otro tramo sigue rojo. Empezar DNS antes para solapar
espera; no crear agentes paralelos sobre una rama ni dar por autorizada la
implementación desde esta revisión.

Qué se deshace después: restricción Launch/cohorte, entrada exclusiva app,
runbook manual de disputa si tuvo que ser provisional y allowlist de oferta
reducida. Se conserva handler/catalog/inbox/UUID; al añadir web se compone auth
web validada sobre mismo resolver. No tirar pagos/grants ni cambiar UUID. El
bridge HS256 de datos nativos no se amplía para cobrar y su retirada tiene su
propio gate; no es el camino corto de checkout recomendado.

## Gate del lunes 09:00 y apertura 10:00

Isaac decide sobre SHA exacto de app/handlers/schema y entorno **producción**,
con evidencia sandbox y canary autorizado. A las 09:00 cada fila es PASS con
evidencia o bloquea. «Lo haremos entre 09 y 10» no cuenta.

| Gate                 | Prueba obligatoria                                                                                   | No-Go                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Identidad/producción | Nuevo usuario + usuario ya enlazado, wrong issuer/client/revoked, dos logins mismo UUID              | Development, duplicación o rechazo que cae a cache                 |
| Venta/atribución     | Checkout registrado antes de URL, nuevo pago env correcto → mismo UUID nativo                        | Solo mock, orden histórica, URL directa o mapping por email        |
| Entrega              | Launch real firmado, candados/scope, Engineer, restart offline, device reset autorizado              | Pago sin licencia o módulo incluido cerrado                        |
| Recuperación         | Timeout/doble click/duplicado/desorden/webhook perdido y replay; cierre servidor de nuevas compras   | Reintento incierto cobra dos veces o operador no puede reconciliar |
| Retirada             | Refund real → retirada online; offline Launch/reconexión; disputa abre/cierra sin resurrección vieja | Parser falso o suspensión sin mecanismo operativo                  |
| Operación/autoridad  | Alertas, soporte, kill switch en servidor, autorizaciones productivas, políticas y CI/build exactos  | Checkout queda abierto en backend aunque botón desaparezca         |

Si PASS: 09–10 congelación, verificación de configuración/env, Isaac autoriza
apertura acotada a las 10. Si falla una fila: **ventas al 19-oct** y bloqueo de
checkout en servidor. Beta gratis + lista de espera el 12 es viable como
fallback si también pasa calidad/distribución/auth y privacidad/consentimiento
de la lista; **no incluye tarjeta, trial que cobre luego ni enlaces de pago**.
No prometer capacidades pagadas ni venta el 19 como confirmada. Si login público
productivo no llega, lista pública sin cuenta + beta cerrada con cupo/control;
`accounts.dev` no es solución para una beta pública ilimitada.

## (b) Completar migración para el 19-oct + Store

| Fase                                                              | Estimación                    | Criterio imprescindible para el 19                                                                                 |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| B1: sesión web Clerk + TPA + checkout/portal compartidos          | 1–2 días                      | Cuenta web/app idéntica, gateway/RLS negativos, retorno seguro; sin API nueva en el repo web sin su revisión       |
| B2: Pro mensual/anual #1499, trial y lifecycle #1506              | 1–2 días                      | Precios 5,99/59,90 IVA, mismas capabilities, siete días mensual, renewal/cancel/refund/disputa reales              |
| B3: FKs/RLS/functions restantes + user webhooks/borrado           | 1–2 días                      | Ninguna superficie activa exige Supabase login; policies Storage/Testing Center completas; deleted no reprovisiona |
| B4: enlace de usuarios valiosos + cierre legacy + ensayo rollback | 0,5–2 días según counts       | Cero pérdida/duplicación de derechos; Auth providers retirables y counts reconciliados                             |
| B5: matriz real, reviews, build/certificación Store y canary      | 1–2 días + latencia Microsoft | Instalación/login/compra/licencia/updates de paquete exacto; ficha y clasificación aceptadas                       |

**4,5–10 días de esfuerzo adicional**, no calendario garantizado; latencia
Store, DNS, acceso, conteo y recuperación de identidades dominan. Priorizar
B1/B2/B3 y envío Store mientras se ensaya B4; no desactivar Auth para ocultar
consumidores. Completar migración funcional no exige borrar de inmediato datos
Auth retenidos legalmente. El frontend Wails se retira tras beta: no migrar
pantallas muertas por simetría; cerrar sus accesos en despliegue soportado y
retirar consumidores.

Store es distribución, no autoridad de licencia. El objetivo encaja con Polar
solo si Microsoft clasifica Vantare como aplicación no juego en PC. Si exige IAP
de juego, contradice la ruta Polar: **parar y elevar a Isaac**, no construir
segundo billing ni anunciar aprobación. Verificar tipo de cuenta/identidad
editor, Partner Center, empaquetado/firma, privacy, disclosures de precios,
tercero Polar, cuenta de prueba y actualización. La certificación tiene duración
variable; no afirmar que pagar el 19 implica estar publicado en Store ese día.
[Políticas Store 10.8](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
y
[certificación MSI/EXE](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-certification-process).

## (c) Posterior

- Purga irreversible de filas/sesiones legacy y retirada de código
  Wails/Electron confirmando cero consumidores; conservar historia SQL y
  retención monetaria.
- Retirada del token de datos HS256 si hay vía Clerk native oficialmente
  soportada y probada para cada consumidor; no bloquear venta por una conversión
  imaginaria, ni conservar compatibilidad insegura sin revisión.
- Automatizar recuperación/disputas, exportación RGPD y enlaces de cuentas si el
  mínimo fue asistido; revisar rate limits, volumen y costes. **1–3 días** de
  hardening operativo inicial; migración de muchos usuarios se reestima.
- Ningún plan superior nuevo, Clerk Billing, nueva arquitectura o dependencias
  de pago incluidas silenciosamente.

## Riesgos, costes y preguntas para Isaac

Bloqueos comprobados en código: wrapper Auth, FK attempts→Auth, Refund/Pro,
ausencia de handler disputa, portal native development y mezcla de bases.
Desconocidos: schema/deploy productivo, totales/cuentas valiosas, issuer de
build, catálogo Polar vigente, dominio/DNS, features Clerk de pago y
certificación Store. La consulta pública de development no valida ninguna de
esas incógnitas.

Coste: no se contrató ni activó nada. Clerk puede exigir plan de pago al pasar
features development a producción; seleccionar mínimo gratuito sujeto a la
cuenta real. [Precios Clerk](https://clerk.com/pricing). Supabase cobra TP-MAU
por exceso de cuota; revisar plan/Spend Cap sin apagarlo.
[Cuotas TP-MAU](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party).
Dominio, Partner Center/firma o proveedor email pueden añadir coste. Si un paso
requiere gasto, permanece detenido hasta aprobación expresa; esta revisión no
concluye que haga falta contratar un plan concreto.

1. ¿Aceptas intentar el 12 con **Launch únicamente desde app, cohorte
   limitada**, y Pro/web independiente el 19? Si exiges los tres planes el
   lunes, B1/B2 y toda su matriz pasan a la ruta crítica y la estimación deja de
   ser el mínimo.
2. ¿Cuál es el dominio/instancia Clerk **producción**, proyecto Supabase y
   estado Store reales? Facilitar solo nombres/estado y agregados del SQL; no
   secretos.
3. ¿Hay usuarios/pagos con valor que debamos conservar? Ejecutar counts; decidir
   cómo verificar su posesión cuando Development no puede trasladarse
   directamente.
4. ¿«Retirar al emitir refund» abarca también parciales y pending? Propuesta:
   suspender grant afectado al emitir, finalizar retirada al succeeded; failed/
   canceled restaura solo sin otra revocación. Confirmar alcance Launch/Pro y
   soporte de la fuente de disputa antes de activar venta.
5. ¿Qué umbral de entrega y resolución aceptas ante pago confirmado + caída
   posterior (propuesta para discutir: alarma inmediata, cierre de nuevas
   compras, resolución asistida sin segundo pago)? No existe garantía
   transaccional cero riesgo entre Polar y Supabase. Autorizar aparte
   canary/cobro/refund productivo, despliegues, coste si existe y promociones
   necesarias.

## Evidencia y verificación de esta entrega

Revisión estática de blobs de base/nativo, issues/PRs y código público web;
documentación oficial abierta y endpoint público development leído con salida
sanitizada. Inventario por referencia, no conteo de personas. Tests actuales de
seguridad/SQL/BIL-08 identificados por archivo en el inventario; **no se
ejecutaron suites productivas**, porque el diff es documental. Verificación:
releer ADR/plan e inventario al SHA indicado, validar localizadores,
diff/formato y enlace/estado del PR; para datos vivos Isaac usa SQL agregado
anterior.

Sin código/schema productivo cambiado, sin secretos/.env, sin subagentes, sin
producción, cobro, refund, deploy, merge, promoción, release ni anuncio.
