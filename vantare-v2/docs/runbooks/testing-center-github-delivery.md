# Testing Center — GitHub delivery preparada, no activada

Estado: TAU-05C / ISA-224 implementado en rama de issue. No hay GitHub App
registrada, instalación, token, secreto real, endpoint desplegable, llamada de
red, migración remota ni issue externa creada.

## Arquitectura del corte

1. TAU-05A reserva un `effect_id` durable.
2. TAU-05B construye una proyección sanitizada con marker exacto.
3. `testing_center_claim_github_effect` concede un lease de 10–300 segundos,
   limita a cinco intentos y respeta pausa global/por flujo.
4. El servicio vuelve a consultar la pausa inmediatamente antes del POST.
5. Antes de crear, y tras cualquier respuesta ambigua, busca el marker entre
   issues creadas por la propia App en el repositorio exacto.
6. Si encuentra una, reconcilia su número/node ID; si no, falla con código
   cerrado y backoff. Nunca repite a ciegas.

`testing-center-github-service.ts` solo define puertos e invariantes. No usa
`fetch`, `Deno.serve` o variables de entorno y no aparece como función
desplegable. El transporte real y el adaptador Supabase se activarán únicamente
en un corte posterior autorizado, usando este contrato.

## GitHub App mínima

Configuración propuesta para revisión humana:

- App privada, instalada solo en `isaacalbala12/Vantare-Simracing-Suite`;
- Repository permissions: **Metadata read** y **Issues read/write**;
- Organization/account permissions: ninguna;
- sin Contents, Pull requests, Actions, Workflows, Administration o Members;
- evento webhook: `issues` únicamente;
- secreto webhook aleatorio independiente;
- installation token corto obtenido server-side, nunca en Vantare desktop.

GitHub recomienda pedir solo los permisos requeridos y documenta que los
permisos determinan endpoints y eventos disponibles:
https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app

## Firma, delivery ID y ausencia de timestamp

El receptor verifica los bytes UTF-8 exactos mediante HMAC-SHA256 y
`X-Hub-Signature-256`, con comparación constante, antes de parsear. Valida
`X-GitHub-Delivery`, `X-GitHub-Event=issues`, action allowlisted y número de
issue. Solo persiste delivery ID, evento, action, SHA-256 y número; no guarda
payload, firma ni secreto.

GitHub no incluye un timestamp firmado en sus headers oficiales. Inventar uno
rompería compatibilidad o confiaría en un proxy. La protección equivalente es:

- firma del body exacto;
- delivery ID único y ledger durable;
- `received_at` generado por PostgreSQL;
- un delivery ID con otro digest/evento falla como conflicto.

Autoridad oficial de headers/firma:
https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
y https://docs.github.com/en/webhooks/webhook-events-and-payloads

El webhook es una señal auditada, no autoridad para reconciliar markers. Un
usuario con permiso de crear issues podría copiar un marker. Solo el worker,
mediante el cliente GitHub autenticado como App, puede aceptar una coincidencia
que además sea app-authored y pertenezca al repositorio configurado.

## Rate limit, secretos y rotación

El outbox aplica backoff exponencial acotado (5, 10, 20, 40, 80 segundos;
máximo estructural 300) y cinco intentos. El futuro transporte debe mapear 403,
429, `Retry-After` y `X-RateLimit-Reset` a un error cerrado y no reintentar en
bucle dentro de una invocación.

Nombres previstos, no configurados:

- `TESTING_CENTER_GITHUB_APP_ID`;
- `TESTING_CENTER_GITHUB_INSTALLATION_ID`;
- `TESTING_CENTER_GITHUB_PRIVATE_KEY`;
- `TESTING_CENTER_GITHUB_WEBHOOK_SECRET`;
- owner/repo allowlisted en configuración server-side.

Rotación: pausar globalmente, esperar leases, sustituir una credencial, probar
firma/token en dry-run, reactivar y revocar la anterior. Nunca imprimir valores
ni copiarlos a GitHub Issues, Linear, logs o la app.

## Gates y verificación

```powershell
& .\supabase\tests\run-testing-center-github-delivery-postgres.ps1

deno test --no-lock `
  supabase/functions/_shared/testing-center-github-service.test.ts

deno test --config supabase/functions/deno.json `
  --allow-env --allow-read --no-lock --no-check supabase/functions

deno task --config supabase/functions/deno.json verify:deploy-surface
```

Evidencia del corte: PostgreSQL 28/28 + rollback + reapply 28/28; servicio 7/7,
incluido 100 replays y respuesta ambigua; suite Deno activa 208/208. La
superficie desplegable sigue limitada a Billing y `license-credential`.

## Activación y rollback

Activación futura, siempre humana: revisar App/permissions, crear secretos en
el entorno server, desplegar primero migración y después transporte en dry-run,
probar repositorio de pruebas, habilitar un único reporte y observar
reconciliación. No asignar Codex todavía.

Rollback local: revertir el commit. En una base aplicada, pausar primero,
reconciliar todos los estados `claimed/failed`, confirmar que no hay llamadas
en vuelo y ejecutar
`20260802170000_testing_center_github_delivery.down.sql`. El rollback elimina
el ledger de deliveries y metadata externa; nunca se ejecuta automáticamente.
