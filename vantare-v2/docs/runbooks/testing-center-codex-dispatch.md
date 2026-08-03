# Testing Center — dispatch Codex firmado e inerte

Estado: TAU-07A / ISA-234 preparado sin ejecución. No existe caller, secreto,
API, trigger automático, checkout efectivo, escritura de repo, rama, commit, PR,
deploy, merge o promoción.

## Límite firmado

`testing-center.codex-dispatch.v1` es un envelope HMAC-SHA256 cerrado. Solo
transporta hechos server-owned:

- repo y base `nightly` fijos;
- `run_id`, `technical_issue_id`, request digest y proof digest;
- SHA exacto de análisis y head observado de `nightly`;
- fencing token, módulo allowlisted y operación `propose_patch`;
- versiones exactas de prompt, output, acción y CLI;
- emisión, expiración de 30–300 segundos y nonce de 256 bits.

No admite título/body/comentarios de GitHub, texto del tester, mensajes de log,
URLs, paths aportados, replay, media o instrucciones. Shape, enums, IDs, hashes,
TTL y campos extra fallan cerrados antes de verificar la firma. La serialización
HMAC reconstruye los campos en orden canónico explícito.

`consumeCodexDispatch(...)` exige un puerto de replay durable. La implementación
real debe reservar `signature + run_id` en servidor; un `Set` o estado del
proceso solo es válido para tests. Esta reserva complementa, no sustituye, el
`dispatch_count=1` y fencing de TAU-06F.

La clave se recibe como bytes, exige 32–256 bytes y nunca forma parte del
envelope, prompt, output o repositorio. TAU-07A no crea ni configura esa clave.

## Prompt y output

El prompt `testing-center.codex-fix-prompt.v1` es fijo y prohíbe obtener
instrucciones de issues, comentarios, commits, media o archivos posteriores a
la base fijada. Pide reproducción/caracterización, regresión observable, cambio
mínimo y salida JSON; cualquier scope insuficiente produce `needs_owner`.

El schema `testing-center.codex-fix-output.v1`:

- liga de vuelta request digest y analysis SHA;
- acepta `proposed`, `needs_owner` o `not_reproduced`;
- limita a cinco archivos y tres command IDs allowlisted;
- solo permite crear o reemplazar contenido textual; no delete/rename/binario;
- exige cero archivos/tests cuando no hay propuesta;
- cierra objetos y limita cada campo.

El límite agregado de 32 KiB, paths leaf-level, contenido, duplicados y
coherencia se validarán de nuevo en TAU-07C. El JSON Schema no sustituye ese
decoder privilegiado.

## Workflow inerte

`.github/workflows/testing-center-codex-inert.yml` solo declara
`workflow_call`; no tiene caller y su único job usa `if: ${{ false }}`. Además:

- `permissions: contents: read`;
- Linux y timeout de 15 minutos;
- checkout sin credenciales persistentes;
- `actions/checkout` pin a
  `11d5960a326750d5838078e36cf38b85af677262` (`v4` al verificar);
- `openai/codex-action` pin a
  `b11346a6fa031e2e164ab4b7c7ea201afffd7d59` (`v1` al verificar);
- Codex CLI pin `0.146.0`, sandbox `workspace-write`, safety `drop-sudo`;
- sin `openai-api-key`, secrets, bots o usuarios adicionales;
- Codex es el último paso del job.

Quitar el guard, añadir caller/secret o cambiar permisos no es configuración:
es un corte de activación nuevo que requiere tests y aprobación explícita.

La separación sigue la recomendación oficial de ejecutar Codex al final del
job no privilegiado y consumir su output desde un job nuevo. El futuro job que
materialice la propuesta no compartirá el runner ni el token con Codex.

Fuentes verificadas el 2026-08-03:

- [acción oficial Codex](https://github.com/openai/codex-action);
- [guía oficial de seguridad](https://github.com/openai/codex-action/blob/main/docs/security.md);
- [permisos de workflows de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).

## Reproducción

```powershell
deno test --config supabase/functions/deno.json --node-modules-dir=auto `
  --no-lock --allow-read `
  supabase/functions/_shared/testing-center-codex-dispatch.test.ts `
  supabase/tests/testing-center-codex-workflow-contract.test.ts
```

Verificación de pins:

```powershell
git ls-remote https://github.com/openai/codex-action.git refs/tags/v1
git ls-remote https://github.com/actions/checkout.git refs/tags/v4
npm view @openai/codex version --json
```

Siguiente gate: TAU-07B puede construir un caller read-only y un request
canónico efímero. No puede otorgar escritura ni ejecutar con un secreto real
hasta probar aislamiento, output y timeout ambiguo.
