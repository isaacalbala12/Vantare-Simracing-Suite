# Consentimiento único: contrato de enganche · #1636 R2 / P2-3

La base `b0f79982` y el bare del Mac no contienen la rama onboarding #1637.
Este candidato no fusiona esa rama ni cambia sus pantallas. Deja desplegable el
servidor y ejercita el recorrido Request → OAuth/Clerk dobles → PostgreSQL real
→ espejo Brevo doble. El repo web es aparte y no se modifica desde este worktree.

## App: onboarding #1637 y ajustes

Endpoint HTTPS de servidor: `/functions/v1/native-mail-consent` (JWT gateway
apagado; OAuth nativo y correo primario verificado se comprueban en el handler).
POST con `Authorization: Bearer <OAuth nativo actual>` y
`Content-Type: application/json`. El token se obtiene de Account/Store y se usa
con `account.authorized(now, ...)`, como el resto de llamadas de servicios;
no generar otro token ni guardarlo en preferencias.

Al cargar Ajustes y después de restaurar la sesión:

```json
{"version":1,"action":"get"}
```

Respuesta inicial sin decisión: `{"version":1,"ok":true,"consent":false,
"locale":null,"revision":0}`. Nunca inferir permiso de analítica, plan,
registro, idioma del SO o existencia de una dirección en Clerk.

Enganche del callback de confirmación del paso de consentimiento de #1637:

```json
{"version":1,"action":"set","consent":true,"locale":"es","source":"onboarding"}
```

`consent` es el único checkbox de novedades **y** ofertas. Falso registra la
negativa; no convertirlo en dos permisos. `locale`: `es|en|it|pt-BR` (Brasil).
En el cambio del toggle de marketing de Ajustes, enviar la misma petición con
`source:"settings"`. En esta base el componente de privacidad vive en
`native/hub/src/settings/privacy.rs`; su `Store.save` guarda diagnóstico local,
NO es el lugar donde persistir marketing ni prueba de consentimiento remoto.
Añadir un control distinto que use el ACK de este endpoint. La capa HTTP de la
app pertenece a `native/services`, no a render/ui/domain. No se necesita el
endpoint de administración ni un rol Owner para cambiar el permiso propio.

Después de 200 actualizar la proyección con la respuesta:
`{"version":1,"ok":true,"consent":true,"locale":"es","revision":1}`.
No marcar éxito ni terminar el paso como guardado antes del ACK; en error ofrecer
reintento explícito, sin importar flags locales ni reenviar automáticamente una
decisión vieja tras otra más reciente. Volver a consultar al abrir Ajustes y
tras recuperar sesión. 401 limpia sesión; 403 `verified_email_required` exige
verificar el correo primario antes de reintentar; 409 `mail_erasure_pending`
espera al borrado anterior de Brevo; 429 espera al siguiente minuto; 503 conserva
el estado previo. El endpoint limita 60 llamadas/minuto por cuenta en SQL.

El cuerpo no acepta correo, UUID, ID Clerk, `evidence` ni fecha. El servidor
consulta Clerk, exige que el correo primario tenga `verification.status=verified`,
comprueba cuenta habilitada/identidad y resuelve su UUID; solo entonces llama a
`mail_consent_execute` → `mail_record_consent`. Evidencia fija por servidor:
`marketing.onboarding.v1` o `marketing.settings.v1`; el reloj es el de SQL.
Cuenta borrada/bloqueada no puede escribir ni recuperar el permiso.

## Web: lista de espera (repo aparte)

La página web no debe recibir service_role ni claves de Brevo. Su backend debe
validar su prueba de verificación de dirección (p. ej. doble opt-in, token de un
solo uso y expiración, vinculado al correo normalizado) **antes** de llamar a
Supabase. No basta con recibir `verified:true`, una dirección o una fecha del
navegador. Reutilizar las defensas de origen y rate limit de ese formulario.
El servidor web usa su cliente Supabase privado para invocar esta RPC existente:

```json
{
  "p_account": null,
  "p_email": "direccion-verificada-por-el-backend",
  "p_locale": "pt-BR",
  "p_consent": true,
  "p_evidence": "marketing.waitlist.web.v1",
  "p_waitlist": true
}
```

RPC: `mail_record_consent`. `p_consent` es la elección explícita de novedades y
ofertas, inicialmente sin marcar. `p_evidence` es esa constante del formulario,
no texto, IP o prueba suministrada por el navegador. `p_email` procede de la
prueba verificada y no puede sustituirse por otro campo de la petición. ACK
sin datos; no inscribir ni afirmar éxito si falla. `40001/mail_erasure_pending`
se trata como 409/reintento después de retirada del proveedor, sin crear contacto
ni volver a conceder permiso. Para bajas usar el enlace firmado; no publicar
esta RPC al cliente. El rol anon/authenticated carece de EXECUTE.

El POST del enlace firmado con `action=forget` llama, desde Edge y para su
propia dirección verificada por token, a `mail_forget_waitlist`; encola Brevo.
El POST RFC8058 `List-Unsubscribe=One-Click` solo retira el permiso. El GET
no muta, y la página permite escoger baja o borrado de espera.

## Verificación reproducible

`native-mail-consent/index.test.ts` prueba identidad/correo primario verificado,
campos cerrados, idiomas, bloqueo, tombstone y rate limit con dobles.
`marketing_mail_consent.test.sql` prueba el registro y la misma retirada en
Ajustes, evidencia fija, ACL y límite persistente.

```sh
python3 supabase/tests/run-admin-local.py --output <evidencia> --test marketing_mail_consent.test.sql --mail-e2e
```

Ejecutar bajo el lock Docker del encargo. El runner crea PostgreSQL desechable
`--network none`, carga migraciones y ejecuta `marketing-mail-e2e.ts`. El test
usa Request/handlers reales y las RPC SQL reales por un adaptador local psql;
no sustituye el registro SQL por un mock. Solo el transporte Supabase/PostgREST,
OAuth/Clerk y Brevo se sustituyen por adaptadores/dobles locales. Runtime Deno
sin permiso de red, con `--allow-run=docker` restringido. No acredita la UI de
#1637, el frontend web aparte ni Supabase/Clerk/Brevo remotos.
