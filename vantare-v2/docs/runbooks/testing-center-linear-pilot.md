# Testing Center — piloto remoto Supabase → Linear

Estado: ISA-243 / TAU-07I desplegado exclusivamente en Supabase testing
`lbaxvpzexoferfvfkplz`. Schema completo y tres Edge Functions `ACTIVE` v1. El
webhook `Issue` existe y su signing secret está guardado en Supabase, pero su
firma aún no se ha verificado con un delivery real y no se ha creado ningún
issue. El primer efecto externo continúa pausado y requiere una prueba
presenciada.

## Qué demuestra este corte

Un reporte sintético creado desde la app puede pasar por triage server-side,
converger con ocurrencias repetidas y crear exactamente un issue de Linear. El
webhook firmado devuelve después una observación durable a Supabase. No hay
Codex, Discord, asignación, merge, release ni promoción de ramas.

La activación es deliberadamente manual: el worker acepta únicamente un
`reportId` generado por Supabase y un bearer secreto exclusivo del piloto. No
hay cron, cola automática ni llamada desde el cliente. Esto limita el primer
efecto real a una prueba presenciada y conserva la pausa como kill switch.

## Contrato de seguridad

- OAuth usa `client_credentials` y solicita solo `issues:create`.
- La mutación GraphQL es fija y el texto del tester viaja solo en variables.
- Team, proyecto, estado y cinco labels proceden de UUIDs server-side.
- Nunca se envían assignee, prioridad, delegate, comandos, logs o replay URL.
- Antes de la llamada se revalidan pausa, destino, lease, fencing, snapshot y
  ambos digests.
- Solo un fallo al obtener el token puede reintentarse. Cualquier incertidumbre
  después de enviar `issueCreate` termina en `needs_owner` y nunca se reenvía.
- La respuesta debe confirmar UUID, identificador, URL Vantare, team, proyecto,
  estado y conjunto exacto de labels antes del binding atómico.
- El webhook verifica los bytes crudos con HMAC-SHA256, los cuatro headers
  oficiales y una ventana de 60 segundos. No persiste body, firma ni texto.

Referencias oficiales:

- <https://linear.app/developers/oauth-2-0-authentication>
- <https://linear.app/developers/graphql?noRedirect=1>
- <https://linear.app/developers/webhooks>
- <https://supabase.com/docs/guides/functions/secrets>

## Gate manual previo al deploy

Isaac debe revisar y aprobar estas decisiones antes de ejecutar nada remoto:

1. Proyecto Supabase **de testing**, nunca producción.
2. OAuth app Linear con client credentials habilitado y acceso solo al team
   `My Live`; el worker pedirá `issues:create`.
3. UUIDs exactos de organización, team, proyecto
   `Testing Center — Feedback`, estado de entrada `Backlog` y labels revisadas.
4. Webhook `Issue` creado manualmente por un admin hacia la función de testing.
5. Reporte sintético concreto y confirmación de que la pausa global empieza
   activa.

No pegar valores de secretos en una issue, PR, terminal compartido o documento.
El wrapper rechaza además de forma explícita el project ref vinculado de
producción, aunque alguien confirme accidentalmente el comando del piloto.

## Secretos y configuración server-side

Guardar en Supabase Secrets del proyecto de testing:

- `LINEAR_CLIENT_ID`
- `LINEAR_CLIENT_SECRET`
- `LINEAR_ORGANIZATION_ID`
- `LINEAR_TEAM_ID`
- `LINEAR_PROJECT_ID`
- `LINEAR_TRIAGE_STATE_ID`
- `LINEAR_WORKSPACE_SLUG=vantareapp`
- `LINEAR_LABEL_IDS_JSON`
- `LINEAR_WEBHOOK_SECRET`
- `TESTING_CENTER_LINEAR_PILOT_SECRET` (aleatorio, mínimo 32 bytes)

`LINEAR_LABEL_IDS_JSON` es un objeto clave lógica → UUID; las claves no son los
nombres visibles de Linear. Debe contener, como mínimo, `testing-center`,
`needs-triage`, `channel:nightly`, `channel:testers`, `status:needs-triage` y
cada `module:<módulo>` que pueda entrar al piloto. Esto permite usar grupos
visibles válidos (`Canal`, `Módulo`, `Flujo`) sin depender de la sintaxis
`grupo:label` ni de nombres reservados. La ausencia de cualquier UUID necesario
falla cerrada antes de crear el issue.

Configuración revisada para el primer piloto:

- Supabase testing ref: `lbaxvpzexoferfvfkplz`.
- Team `My Live`: `09b576f9-94e3-46b9-abc1-535c0fb2c72f`.
- Proyecto `Testing Center — Feedback`:
  `0278f602-9c35-4885-b5ca-368218f14c28`.
- Estado de entrada `Backlog`: `057df492-84d7-4d53-81ba-ce4f2efc155d`.
- Labels lógicas del piloto:
  - `testing-center` → `eb298f41-45a7-48b4-9713-ed44dd818ea7`.
  - `needs-triage` → `6ac9888b-e041-4792-aa52-e14de753ad90`.
  - `channel:nightly` → `0274d043-3a56-4c5d-95e5-d05dac450515`.
  - `channel:testers` → `7abb1830-f096-48a6-8897-e9a4ed095844`.
  - `module:testing_center` → `18326402-10b0-4a2b-8856-df0feba22f79`.
  - `status:needs-triage` → `c9a3af00-8ca8-41a0-8d18-2d8455be8e85`.

`LINEAR_ORGANIZATION_ID`, el client secret, el signing secret del webhook y el
bearer del piloto permanecen fuera del repositorio.

## Orden de activación aprobado

1. Crear snapshot/backup del proyecto de testing y confirmar pausa global.
2. Aplicar migraciones hasta
   `20260804100000_testing_center_linear_pilot.sql`; comprobar que no hay
   migraciones ajenas pendientes.
3. Cargar secretos con `supabase secrets set --project-ref <TESTING_REF>` sin
   imprimir valores.
4. Desplegar solo la superficie de testing con:

   ```powershell
   & .\supabase\functions\scripts\deploy-testing-center-pilot.ps1 `
     -ProjectRef <TESTING_REF> `
     -Confirmation DEPLOY-ISA-243-TESTING-PILOT
   ```

5. Crear/activar el webhook de Linear para `Issue` y guardar su signing secret.
6. Registrar la identidad exacta de la build sintética. Enviar desde la app un
   reporte sin evidencia privada y anotar el `reportId` devuelto.
7. Despausar solo ese flujo y llamar una vez al worker con:

   ```json
   {"contractVersion":"testing-center.linear-pilot.v1","reportId":"report_<sha256>"}
   ```

   usando `Authorization: Bearer <TESTING_CENTER_LINEAR_PILOT_SECRET>`.
8. Verificar un único issue Linear, sin assignee/prioridad, con marker, SHA,
   versión, SO y cinco labels exactas. El resultado del worker devuelve URL e
   identificador, nunca el secreto ni evidencia privada.
9. Repetir el mismo problema desde la app y confirmar una nueva ocurrencia pero
   ningún segundo issue/effect. Mantener el segundo efecto pausado como prueba
   del kill switch.
10. Cambiar el estado del issue en Linear y comprobar delivery firmado y vista
    observacional en Supabase. Un estado UUID no allowlisted debe quedar
    `needs_owner`.
11. Reactivar la pausa global al terminar y revocar el bearer del piloto si no
    habrá otra prueba inmediata.

## Criterio de parada y rollback

Parar sin reintentar si la respuesta es ambigua, el binding no se completa, un
UUID difiere, aparece un duplicado externo, falta una label o se observa
evidencia privada. Pausar globalmente, revocar el secreto/OAuth si corresponde
y reconciliar manualmente el marker en Linear antes de cualquier rollback.

El rollback `20260804100000_testing_center_linear_pilot.down.sql` solo acepta
cero bindings reales del piloto. Nunca elimina silenciosamente un issue Linear
ya creado; primero debe resolverse su trazabilidad con revisión humana.

## Verificación local

```powershell
$tests = (Get-ChildItem supabase/functions/_shared/testing-center-*.test.ts).FullName
deno test --no-lock $tests
deno test --allow-read supabase/functions/scripts/verify-deploy-surface.test.ts
deno check --no-config --node-modules-dir=none `
  supabase/functions/testing-center-linear-worker/index.ts `
  supabase/functions/testing-center-linear-webhook/index.ts
& .\supabase\tests\run-testing-center-linear-pilot-postgres.ps1
git diff --check
```

Evidencia local del corte: Testing Center 120/120, webhook endpoint 4/4 y
deploy guard 4/4 PASS; typecheck, lint y formato PASS. PostgreSQL: instalación
limpia, 18/18, rollback exacto y reaplicación 18/18 PASS. La ejecución usó tres
bases temporales dentro del contenedor Supabase local ya activo; todas quedaron
eliminadas y la base de desarrollo no se modificó.

Tras fijar los UUID y nombres reales de Linear, Deno 120/120, guard 4/4,
typecheck, formato y `git diff --check` volvieron a pasar. PostgreSQL pasó de
nuevo instalación limpia, 18/18, rollback y reaplicación 18/18 usando el
contenedor Supabase ya activo, sin crear otro; las bases temporales se
eliminaron al terminar.

El preflight remoto detectó una colisión histórica entre Billing y Testing
Center en `20260802130000`. Como TAU-02B nunca había sido desplegado, su
migración y rollback pasan a `20260802130100`; Billing conserva intacto su
timestamp. El dry-run remoto debe mostrar cada versión una sola vez antes de
aplicar el schema.

El primer push hosted se detuvo transaccionalmente en
`20260802100000_billing_commercial_projection.sql`: Supabase gestiona
`pgcrypto` bajo `extensions`, mientras el harness histórico exponía `digest`
en `public`. La migración previa `20260802095000_pgcrypto_public_compatibility`
crea únicamente los dos wrappers `public.digest` ausentes y delega en
`extensions.digest`; nunca relocaliza ni reemplaza la extensión gestionada.
La simulación con `pgcrypto` instalado solo en `extensions` y el harness local
completo 18/18 + rollback/reapply pasan.

El primer intento del wrapper se detuvo antes de red porque comprobaba el
`$LASTEXITCODE` residual tras ejecutar un guard PowerShell que ya falla mediante
excepciones. El wrapper deja de reutilizar ese estado nativo; el test de la
superficie cubre la regresión.

El segundo intento desplegó únicamente `testing-center-feedback`,
`testing-center-linear-webhook` y `testing-center-linear-worker`. Probes sin
credenciales devolvieron respectivamente `401`, `400` y `401`; no crearon datos
ni efectos. Después se creó el webhook `Issue` para team `My Live` y su signing
secret se guardó directamente en Supabase. El siguiente gate manual es registrar
la identidad sintética y la build Nightly exacta; el webhook solo quedará
verificado tras el primer delivery real firmado.

## Preparación de la build sintética Nightly

La cuenta autorizada está registrada server-side como `primary_tester`. La
pausa global `isa243-testing-pilot-global` permanece activa. Su acceso Nightly
es un grant local de sandbox `isa243-nightly-pilot-584c2b85`, explícitamente
sintético y revocable, que expira el `2026-08-05T19:17:05Z`; no representa una
compra ni modifica producción.

El emisor `license-credential` está `ACTIVE` v1 en el mismo proyecto de testing.
Usa la clave exclusiva `testing-isa243-20260804`; su fingerprint público es
`3f520a864fec01d953edd60b88433ad52f63f2fbb5d4d9ad0bc77b425397ea27`. La
privada solo existe en Supabase Secrets. El registro público que debe confiar la
build del piloto es:

```text
testing-isa243-20260804:UoXwaCjyOf0IgZDrpfeuq5L5p-g6PFY1u19CIW9ORPE
```

La configuración pública Supabase y este registro se incorporan mediante
`tools/generate_supabase_config.ps1`. No deben viajar en `BUILD_FLAGS`: Task usa
ese valor para nombres de caché y Windows rechaza caracteres de URL, además de
exponer configuración pública innecesariamente en logs. `ldflags` conserva solo
versión y canal.

Para no reemplazar la sesión protegida de una instalación habitual, las builds
`nightly` y `testers` usan targets de Credential Manager derivados de canal y
backend. `master` conserva `Vantare/LicenseClock` y `Vantare/SupabaseAuth`. El
piloto se distribuye además con un directorio `configs` contiguo al ejecutable,
de modo que caché de licencia, draft y configuración permanecen dentro del
paquete portable.
