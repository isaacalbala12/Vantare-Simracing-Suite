# Testing Center — proyección GitHub dry-run v1

Estado: TAU-05B / ISA-223 implementado en rama de issue. No existe llamada de
red, GitHub App, Edge Function desplegable, credencial, assignee, label Codex,
webhook, deploy ni mutación remota.

## Frontera del corte

`supabase/functions/_shared/testing-center-github-projection.ts` define un
contrato Deno puro para convertir un reporte ya validado por TAU-04A/05A en:

- una proyección de GitHub Issue;
- un comentario mínimo de nueva ocurrencia;
- un resultado dry-run idempotente por `effect_id`.

El decoder acepta exactamente `testing-center.github-projection.v1`. Rechaza
campos extra, IDs fuera del formato durable, `master`, módulos desconocidos,
contadores no enteros, otro sistema operativo y cualquier intento de pasar
logs, token, URL de replay o configuración de GitHub.

## Campos confiables y no confiables

Título, labels, marker e identificadores se derivan únicamente de enums e IDs
validados. La allowlist fija contiene:

```text
testing-center
needs-triage
module:<módulo permitido>
channel:nightly | channel:testers
```

No existe campo de assignee ni label que dispare Codex.

Acción, esperado, observado y contexto se consideran datos no confiables. La
proyección:

- normaliza Unicode y elimina controles/bidi;
- neutraliza menciones y fences Markdown;
- redacta patrones conocidos de email, URL, ruta Windows/UNC, JWT, tokens y
  asignaciones de secretos;
- trunca por bytes UTF-8 sin partir caracteres;
- encierra cada campo entre markers `vantare-untrusted-*` y un bloque `text`;
- avisa explícitamente que el contenido no son instrucciones.

Esta redacción no puede reconocer PII semántica arbitraria, por ejemplo un
nombre escrito en prosa. Por eso el body continúa siendo un artefacto privado
y revisable; TAU-05C deberá volver a aplicar la frontera antes del POST real.

El código genérico actual `tester.report`, además de `unknown` y `none`, nunca
se presenta como evidencia técnica.

## Replay, logs y referencia in-app

El contrato solo acepta `replayAvailable: boolean`. GitHub recibe “disponible
en Testing Center autenticado”, nunca una URL o token de PostHog. Los logs no
forman parte del input ni del body.

Vantare todavía no registra un deep link autenticado al reporte. La proyección
usa la referencia no clicable `testing-center/report/<report_id>` y lo declara
honestamente. No se inventa `vantare://` ni una URL web.

Los comentarios de ocurrencia publican únicamente IDs allowlisted, canal,
versión, módulo y contador. El texto y la evidencia permanecen en Supabase y
no se duplican en GitHub.

## Adaptador dry-run

`createTestingCenterGitHubDryRunAdapter()` no tiene transporte ni usa `fetch`.
Recalcula SHA-256 sobre la proyección antes de registrarla en memoria:

- primer efecto válido: `status=dry_run`, `idempotent=false`;
- retry idéntico: `status=dry_run`, `idempotent=true`;
- misma clave con otra proyección: `dry_run_idempotency_conflict`;
- body/digest alterado: `dry_run_projection_integrity_invalid`.

Nunca devuelve un ID externo ni confirma el outbox persistente. TAU-05C debe
añadir lease/claim durable, marcador idempotente de GitHub, reconciliación y
firma de webhook antes de cualquier efecto real.

## Verificación local

```powershell
deno fmt --check `
  supabase/functions/_shared/testing-center-github-projection.ts `
  supabase/functions/_shared/testing-center-github-projection.test.ts

deno check --all --no-lock `
  supabase/functions/_shared/testing-center-github-projection.ts `
  supabase/functions/_shared/testing-center-github-projection.test.ts

deno test --no-lock `
  supabase/functions/_shared/testing-center-github-projection.test.ts

deno test --config supabase/functions/deno.json `
  --allow-env --allow-read --no-lock --no-check supabase/functions

deno task --config supabase/functions/deno.json verify:deploy-surface
```

La evidencia válida es 20/20 pruebas focales, 201/201 pruebas Deno activas,
type-check, formato y deploy-surface verdes. Ningún test realiza una petición
GitHub.

## Rollback

Este corte no cambia schema ni datos. El rollback consiste en retirar los dos
archivos `_shared` y esta documentación mediante un revert del commit. TAU-05A
y sus reservas pendientes permanecen intactos.
