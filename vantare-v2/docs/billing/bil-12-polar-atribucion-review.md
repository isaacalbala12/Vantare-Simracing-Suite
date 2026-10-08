# ISA-1506 — revisión Polar y runbook de desbloqueo

Fecha: 2026-10-08. Estado: **implementación bloqueada; venta no validada**.
Issue: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1506.

## Alcance y bases comprobadas

- Worktree aislado: `C:/tmp/vantare-isa1506`; rama
  `vantareapp/isa-1506-polar-atribucion`.
- Base #1500 abierta/draft: `9e041ab8713fa40f0e06be0cf6e0c416b8768b4a`, sobre
  Nightly `988662e6b2ddffc6fd7683dd1a414e0a2fad9622`.
- App nativa leída, sin modificar: candidato #1470,
  `a8f9bdc3b69561e007e656f270de95fa41fba54b`.
- Web localizada en `isaacalbala12/vantare-simracing-suite-web`, no en este
  checkout. #1502/#1504: PR draft 1, rama `vantareapp/isa-1502-web-lanzamiento`,
  SHA `65433a43382f781ff549329d5e93f3e5eb18b2ef`. No se editó ese repositorio.
- Se leyeron #1506, #1499, PR #1500, #1501 y #1502 y sus estados/comentarios.
  Las instrucciones explícitas de Isaac prevalecen sobre Notion en los docs
  históricos. `docs/roadmap/plan.md` no existe en esta base: no se recrea un
  roadmap retirado ni se publica un estado inventado.

## Hallazgos priorizados

Las rutas `supabase/...` corresponden a la base #1500; las indicadas como
**candidato nativo** corresponden al SHA #1470 anterior.

1. **Bloqueante — Clerk no autentica el checkout de esta base.**
   `_shared/auth.ts:29,56` usa `supabase.auth.getUser(token)`;
   `billing-checkout/index.ts:56,58` exige esa identidad y un UUID.
   `supabase/config.toml:7` mantiene `verify_jwt=true`. Un session JWT de Clerk
   no se convierte por sí solo en usuario Supabase Auth. El candidato nativo usa
   OAuth y `native_resolve_account` (candidato: `_shared/native-auth.ts:179`),
   un mecanismo ausente de #1500. `native-account-authorize/index.ts:25,117`
   emite un token de datos después de verificar OAuth; no demuestra que
   `auth.getUser` acepte ese token ni que un JWT web sea un access token OAuth.
   Hace falta acordar/reutilizar la resolución de identidad verificada antes de
   la página B. No enviar `user_*` como UUID, no decodificar claims sin
   verificar, no cambiar a auth por email.

2. **Bloqueante — enlace directo de desconocido no concede licencia.**
   `billing-webhook/process.ts:116,205,504,651`: si faltan identidad externa y
   cliente existente, no hay cuenta a la que conceder derechos. Corrección del
   diagnóstico inicial: `process.ts:870,943` transforma ese resultado en
   **cuarentena durable**; `billing-webhook/index.ts:261` emite señal crítica.
   Se conserva evidencia para soporte, pero el comprador sigue sin licencia.

3. **Bloqueante — reembolsos reales de Launch no encajan con el parser.**
   `process.ts:444,452` exige `data.payment_id`; el objeto oficial Refund no
   incluye ese campo (solo un dispute opcional puede tenerlo). Un refund normal
   se queda en `missing_payment_id`, incluso si es `succeeded`. También
   `modified_at` admite null en Polar, mientras `process.ts:456` requiere una
   versión válida. Los fixtures propios con payment_id no demuestran paridad con
   Polar. Referencias:
   [SDK Refund](https://github.com/polarsource/polar-js/blob/main/src/models/components/refund.ts),
   [payload refund.updated](https://github.com/polarsource/polar-js/blob/main/src/models/components/webhookrefundupdatedpayload.ts).

4. **Bloqueante — reembolso de Pro no retira Pro.** `process.ts:512` excluye
   órdenes de suscripción del ledger; `process.test.ts:781` demuestra refund en
   cuarentena y grant todavía activo. Polar separa refund y revocación de
   suscripción; no basta emitir refund ni `revoke_benefits` para una
   suscripción.
   [Contrato Polar](https://polar.sh/docs/api-reference/refunds/create). Isaac
   confirmó durante esta revisión: **la licencia se retira al emitir el
   reembolso**. Ejecutar cancelación/revocación inmediata de la suscripción
   coordinada con el refund, o implementar retirada por webhook de refund.
   Cancelar al fin de periodo no cumple esa decisión. Preservar las otras
   concesiones independientes del usuario.

5. **Alto — catálogo sandbox aún anterior a #1499.** Inventario vivo abajo:
   mensual 500 céntimos, anual inexistente, trial predeterminado null,
   `tax_behavior=null`. No demuestra precios 599/5990 con IVA incluido.
   `scripts/polar-pro-prices.ts` está preparado, pero no se ejecutó en esta
   revisión para no alterar el trabajo de #1499 tras la condición de parada.

6. **Alto — portales de alta/reset del nativo solo admiten desarrollo.**
   Candidato `native/hub/src/services/access.rs:245` exige
   `.clerk.accounts.dev`. Un issuer productivo devuelve None para esos enlaces.
   Esto confirma una limitación de código, **no** el issuer de la build
   instalada: no se leyeron sus secretos/config ni se inspeccionó su binario.
   [Clerk](https://clerk.com/docs/guides/development/managing-environments)
   distingue dominios de desarrollo y producción. Deben coincidir instancia
   web/nativa/backend y conservarse la relación issuer+subject→UUID.

7. **Alto — reconciliación no descubre compradores sin atribuir.**
   `scripts/reconcile-polar-customer-state.ts:55` enumera únicamente
   `billing_customers`; un desconocido en cuarentena no está en esa tabla.
   `reconciliation.ts:194` preserva órdenes. El helper
   `order-refund-reconciliation.ts:56` sí existe, pero no tiene un consumidor
   operativo en la base (solo tests). No se verificó scheduler desplegado. Un
   refund perdido de Launch no queda reparado por Customer State.

8. **Medio — límite offline de Launch confirmado por Isaac.**
   `license-credential/index.ts:291,306` emite Launch/Testers perpetuos;
   `docs/billing/bil-08-offline-credential-runbook.md` reconoce que un cliente
   permanentemente offline no recibe revocaciones. El servidor puede retirar el
   grant y la siguiente renovación online reemplaza la credencial, pero un
   envelope ya emitido no desaparece del dispositivo por un webhook. Pro queda
   limitado a paid_through. Isaac confirmó que el reembolso Launch se aplica
   cuando la app vuelve a conectarse. La matriz debe probar ambos estados y no
   prometer revocación inmediata a un equipo desconectado.

9. **Medio — trial soportado, activación real sin demostrar.**
   `_shared/mapping.ts:209,256,354` solo permite siete días para Pro mensual y
   exige `POLAR_TRIAL_ANTI_ABUSE_CONFIRMED`; ejemplo de config tiene trial
   desactivado. `_shared/polar.ts:317,332` pasa allow_trial y duración si están
   habilitados. `subscription-lifecycle.ts:42` concede trialing hasta
   current_period_end, con expiración estricta y retirada al revocar. Tests de
   creación, extensión, igualdad al vencer e incomplete_expired pasan.
   [Polar](https://polar.sh/docs/features/subscriptions/trials) recoge método de
   pago y puede enviar recordatorio; flags, antiabuso y correo de la
   organización no se verificaron. Trial predeterminado null en producto no
   impide un override de Checkout Session, pero no prueba que esté activado.

10. **Medio — Launch bloquea módulos nuevos, pero alcance inicial sin validar.**
    Mapping `mapping.ts:102` concede launch_v1 perpetuo + Testers, nunca
    Nightly. Candidato `native/runtime/src/rights/mod.rs:299` autoriza módulos
    solo por capability propia/rol operativo. Su test `rights/tests.rs:666` deja
    los cuatro módulos cerrados con Launch solo. `module_rollout` puede abrir
    módulos para todos (candidato `_shared/license-credential.ts:456`). Esto
    protege módulos nuevos cerrados, pero no demuestra que Engineer incluido en
    el contrato inicial esté disponible para un comprador Launch. Falta matriz
    real con credencial comprada, rollout y build testers.

11. **Medio — identidad del webhook no se contrasta con checkout registrado.**
    `process.ts:210` confía en external_customer_id/metadata.user_id del payload
    firmado y no valida UUID ni conflicto con billing_customers/checkout_id
    antes de resolver. La firma prueba origen Polar, no quién introdujo metadata
    en un enlace antiguo. Revisar el contrato de metadata de links y confrontar
    el checkout/cliente autorizado antes de recuperación. No se ha demostrado
    una explotación; no atribuir automáticamente por email o metadata editable.

12. **Bajo — etiquetas heredadas de auditoría.** `_shared/polar.ts:326` etiqueta
    source como desktop aun si el consumidor fuera web; `process.ts:797` usa
    action updated_monthly_bundle también para anual. No cambia los derechos.

## Controles que sí están implementados y pasan tests

- Checkout: catálogo controlado en servidor, campos de usuario/producto/precio
  prohibidos en cliente, attemptId UUID y estado durable reused/conflict/busy/
  uncertain. No reintenta a ciegas una creación incierta en Polar.
- Mapping v2: entorno obligatorio, producto/precio e inversos coherentes;
  mensual/anual tienen las mismas capabilities Pro/stable. Annual no activa
  trial.
- Firma: cuerpo UTF-8 exacto, HMAC Standard Webhooks, timestamp ±300 s, límite
  de 1 MiB antes de persistir. Test contra standardwebhooks independiente pasa.
- Inbox: hash, lease, efectos reanudables, retry, límite/cuarentena, replay
  auditado restringido a service_role. Proyección monotónica: antiguos no
  restauran grants; conflictos de versión fallan cerrados.
- Cancelación: cancel_at_period_end conserva acceso hasta paidThrough;
  revocación inmediata y fin de periodo cierran acceso. Past_due tiene
  recuperación online máxima de 72 h sin ampliar la credencial offline.
- Ledger Launch: suma solo refunds succeeded atribuidos; parciales conservan
  acceso, total lo retira; pending/failed/canceled no lo retiran. Ese
  comportamiento actual debe contrastarse con la decisión de Isaac de retirar al
  emitir el reembolso, incluidos los estados iniciales pending y los reembolsos
  parciales; no convertir la política actual del ledger en aceptación comercial
  automática.
- Credencial BIL-08: firma Ed25519, identidad/dispositivo, entorno, paidThrough,
  alcance launch_v1; no confía en rows legacy. No se probó emisión remota.

## Decisión de atribución y recuperación

**B recomendada, pendiente de implementación.** La web está localizada y permite
una página de compra independiente sin cambiar index/style/translations de
#1502. El flujo mínimo correcto: login Clerk verificado → resolver el mismo UUID
que el nativo → billing-checkout con productKey/attemptId → checkout Polar
atribuido → webhook → renovación nativa. La página nunca envía userId ni
construye un enlace Polar con identidad en query. Ni success redirect ni pago
informado por cliente conceden licencia. A no elimina el desacople del backend y
pertenece también a #1501; no se modificó la app.

Isaac ordenó parar si el código contradice la issue o exige arquitectura nueva.
La afirmación de que basta la página Clerk no coincide con auth de esta base. No
se implementó un segundo sistema de identidad, no se importó el candidato nativo
entero, ni se entregó una página que inicie pagos sin completar la licencia.

Enlaces antiguos: mantener cuarentena existente y alertas; dejar de publicarlos
cuando B funcione. Recuperación solo tras login verificado y prueba de propiedad
de la compra revisada por soporte. Guardar relación customer/checkout→UUID con
entorno, auditoría y protección de conflictos; después replay auditado del
inbox. Si no puede verificarse propiedad, resolver por soporte/reembolso
autorizado. No hay nueva ruta automática de vinculación. **No vincular solo por
email.**

## Sandbox observado (CLI oficial 2.0.2)

La primera consulta dijo Not logged in. Tras el aviso del orquestador se repitió
whoami y confirmó sandbox: organización Vantare, slug vantare,
`71f1b902-c29a-421b-aeb7-7861d8bbc08d`. No se consultó Polar producción.

| Caso                               | Evidencia real                                                                                                                   | Resultado de aceptación                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pro mensual                        | producto `41cffd72-bd41-4904-a0e4-9083243d26d7`, precio `f7738390-15c1-4fe3-86dc-fa64fb46ab17`, 500 céntimos                     | Pendiente: 599 + compra nueva → licencia                                                                       |
| Pro anual                          | no existe entre los dos productos observados                                                                                     | Bloqueado por catálogo #1499                                                                                   |
| Launch Edition                     | producto `fd15a961-ed86-4cbc-9ffa-f8c16716b22f`, precio `a6a594ea-8275-4922-b1ac-e48ca64003da`, 3000 céntimos                    | Pendiente: compra nueva → licencia perpetua                                                                    |
| Trial Pro                          | producto con trial_interval/count null                                                                                           | Pendiente: configuración, alta y expiración reales                                                             |
| Refund Pro → retirada              | refunds list: cero; test actual conserva Pro                                                                                     | No ejecutado; emitir refund + cancelar inmediatamente, o webhook que retire. Confirmar sin esperar paidThrough |
| Refund Launch offline → reconexión | refunds list: cero; envelope perpetuo en código                                                                                  | No ejecutado; offline puede conservar acceso; tras reconectar/renovar debe retirarse                           |
| Cancelación → fin de periodo       | suscripción histórica activa `78209fdd-b5b0-4a3f-9874-b50a52d838f1`, cancel_at_period_end=false, fin 2026-10-09T18:00:17.753642Z | No se canceló; licencia no consultada                                                                          |

Inventario adicional: checkout_links=0; orders=5, todos paid con identidad
externa presente y refunded_amount=0; subscriptions=1. Orden mensual observada
`ef98bec6-05bb-4e5c-b873-847e7c956263`; orden Launch observada
`5431e809-72e2-420e-80fc-dc65e2950f07`. **Son recursos históricos, no compras
ejecutadas por #1506 ni prueba de licencia Supabase.** No se fabricaron IDs.
Checkouts solo se inspeccionó con --help: no se volcaron sesiones/client_secret.
La CLI expone checkouts get/list, pero no create en esta versión; productos y
refunds sí tienen operaciones de escritura. No se extrajo su token de sesión.

## Checks y límites

- Deno completo: **398 passed, 0 failed**. Comando desde raíz:

```powershell
deno test --node-modules-dir=auto --allow-env --allow-read=.github,supabase/functions/scripts,supabase/functions/billing-webhook/testdata,vantare-v2/build,vantare-v2/cmd/vantare/main.go,vantare-v2/tools/generate_supabase_config.ps1 --config supabase/functions/deno.json supabase/functions
```

- Intentos previos: resolución npm sin auto-install, scope _deprecated sin
  config, y permisos de lectura insuficientes. Se corrigió solo la invocación;
  no se alteraron tests/config ni se usó --no-check. Log final:
  `C:/tmp/evidence-isa1506/deno-tests.log`.
- No hay tests de regresión nuevos: se detuvo el cambio de comportamiento. La
  suite existente demuestra los límites, incluido Pro refund activo.
- pgTAP no ejecutado: Docker ausente. Frontend/Go/Rust/build/visual no
  ejecutados: ningún cambio de código y ninguna página implementada. Sin prueba
  física.
- No se consultó Supabase remoto ni se desplegó. Variables ausentes en la sesión
  de este worker (solo comprobada existencia): POLAR_ACCESS_TOKEN,
  POLAR_PRODUCT_MAP, POLAR_WEBHOOK_SECRET, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, OFFLINE_LICENSE_ED25519_PRIVATE_KEY, CLERK_ISSUER,
  CLERK_SECRET_KEY. Esto no afirma que falten en un servidor.

## Qué debe hacer Isaac para desbloquear

1. Revisar/autorizar el ajuste de alcance/base: conectar auth web y nativa con
   la misma resolución verificada de cuenta. Definir issuer Clerk productivo,
   claves públicas, origen web y portal explícito; valorar migración de cuentas
   de desarrollo. No cambiar el subject por email ni resetear cuentas reales.
2. Aportar el identificador del proyecto **sandbox** Supabase y confirmar qué
   funciones/migraciones del candidato nativo están desplegadas allí. Configurar
   de forma administrativa las variables anteriores y SUPABASE_ANON_KEY,
   OFFLINE_LICENSE_KEY_ID, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL,
   POLAR_ENVIRONMENT=sandbox y, si se verifica antiabuso,
   POLAR_TRIAL_ANTI_ABUSE_CONFIRMED. Para puente nativo: CLERK_NATIVE_CLIENT_ID;
   para página web: CLERK_PUBLISHABLE_KEY (pública). Nunca pegar valores en
   chat/issue ni leer .env.
3. Coordinar catálogo #1499 y corregir refunds antes de activar botones de
   venta. Login CLI ya funciona; no necesita repetirse. Comandos de lectura
   exactos:

```powershell
npx -y @polar-sh/cli@2.0.2 auth whoami
npx -y @polar-sh/cli@2.0.2 products list --organization-id 71f1b902-c29a-421b-aeb7-7861d8bbc08d --limit 100
npx -y @polar-sh/cli@2.0.2 checkout_links list --organization-id 71f1b902-c29a-421b-aeb7-7861d8bbc08d --limit 100
```

4. Con POLAR_ACCESS_TOKEN sandbox cargado de forma segura, #1499 puede ejecutar:

```powershell
deno run --allow-env=POLAR_ACCESS_TOKEN,POLAR_ENVIRONMENT --allow-net=sandbox-api.polar.sh supabase/functions/scripts/polar-pro-prices.ts --organization-id 71f1b902-c29a-421b-aeb7-7861d8bbc08d --pro-monthly-product-id 41cffd72-bd41-4904-a0e4-9083243d26d7
```

5. Tras acordar auth y configurar exclusivamente sandbox, aplicar migraciones y
   deploy por la ruta aprobada. SANDBOX_PROJECT_REF es un nombre de variable a
   cargar por Isaac; no usar el project_id productivo del config del repo.

```powershell
supabase link --project-ref $env:SANDBOX_PROJECT_REF
supabase db push
pwsh -File supabase/functions/scripts/deploy-approved-functions.ps1 -ProjectRef $env:SANDBOX_PROJECT_REF
# Con Docker instalado, gate de checkout aislado:
pwsh -File supabase/tests/run-billing-checkout-postgres.ps1
```

El wrapper de esta base no despliega native-account-authorize/native-license;
los comandos anteriores no solucionan el bloqueo de identidad. El deploy del
puente debe proceder de su base aprobada, no copiar funciones silenciosamente.

6. Ejecutar compras con cuenta de prueba verificada y método de pago de sandbox,
   guardar solo checkout/order/subscription/refund/inbox IDs sanitizados. Para
   cada caso contrastar Polar, inbox/grants y credencial emitida al mismo UUID;
   renovar nativo y comprobar candados. Cancelar sin refund conserva periodo
   pagado. Al emitir refund Pro, cancelar/revocar inmediatamente a la vez, o
   verificar la retirada automática por webhook; una cancelación al final del
   periodo no sirve. Para refund Launch: emitir con app desconectada, comprobar
   el límite offline documentado, reconectar/renovar y comprobar retirada. No
   retirar concesiones independientes; comprobar refund anterior a order,
   duplicados y reconciliación, además de pending/failed/partial/total.
   Reconciliar dos veces y comprobar que la segunda no cambia grants.

Para reconciliación sandbox, una vez configuradas sus variables y corregidas las
rutas, sin imprimirlas:

```powershell
deno run --allow-env --allow-net=$env:SANDBOX_NETWORK_ALLOWLIST supabase/functions/scripts/reconcile-polar-customer-state.ts --environment sandbox
```

SANDBOX_NETWORK_ALLOWLIST debe contener únicamente sandbox-api.polar.sh, esm.sh
y el host del proyecto sandbox Supabase. La primera ejecución es dry-run; no
añadir --apply hasta revisar el resultado. Este script no repara por sí solo
órdenes/refunds ni compradores sin atribuir.

## Estado de entrega

Entrega únicamente documental, en rama propia y PR draft apilado sobre #1500.
Implementación B y matriz completa pendientes; no se cierra #1506. Riesgo de
venta sin licencia/reembolso sin retirada permanece. Sin modificaciones nativas,
web, secretos, datos, catálogo Polar, instalaciones ni checkouts ajenos; sin
merge, promoción, release o despliegue. El comentario de estado de #1506 y la PR
registran el HEAD final y el resultado de CI que exista realmente.
