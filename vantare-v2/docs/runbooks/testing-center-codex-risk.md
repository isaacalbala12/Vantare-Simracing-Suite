# Testing Center — política de riesgo Codex, sin ejecución

Estado: TAU-06A / ISA-226 implementado en rama de issue. Este corte solo
clasifica candidatos; no llama a Codex, no clona/escribe repositorios, no crea
ramas o PRs y no efectúa red, deploy, asignaciones ni promociones.

## Regla de autorización

`eligible` no significa «ejecutar». Solo significa que los hechos estructurados
y confiables cumplen la allowlist de esta primera fase. El worker posterior
debe exigir además un resultado válido de esta versión exacta de la política,
un gate operativo no pausado y los presupuestos de TAU-06B. Un error de parseo,
versión desconocida, excepción o resultado ausente nunca se convierte en
`eligible`.

El texto libre, logs y demás evidencia del tester son datos no confiables. Se
transportan como `untrustedEvidence` únicamente para análisis posterior y no
pueden añadir/quitar razones, cambiar la decisión ni alterar el digest. Los
campos `trustedSurface`, alcance, harness y flags sensibles deben ser calculados
server-side a partir de metadatos revisados; nunca se aceptan desde la app o el
GitHub Issue como autoridad.

## Allowlist inicial

Un candidato solo es `eligible` si simultáneamente:

- el reporte está completo y la reproducción es determinista;
- la superficie confiable es `frontend.presentation` o
  `frontend.local_state`;
- afecta exactamente a un módulo y se estiman entre uno y cinco archivos;
- ya existe un harness de regresión aplicable;
- no hubo intento automático previo ni rechazo de tester;
- todos los flags sensibles son falsos.

Cualquier incumplimiento produce `needs_owner` con reason codes ordenados. Son
sensibles seguridad, privacidad, auth, permisos, secretos, billing/licencias,
pérdida o corrupción de datos, migraciones, workflow/releases, dependencias,
arquitectura y edición masiva. Añadir una categoría o superficie requiere otra
versión de contrato y revisión humana.

`frontend.local_state` no autoriza persistencia, credenciales, identidad,
archivos del usuario ni migraciones: esas capacidades activan sus flags y
quedan fuera. Es solo una ruta server-side para estado efímero/local ya
allowlisted de forma expresa.

## Contrato y auditoría

El decoder rechaza campos extra, enums desconocidos, IDs inválidos, números no
enteros o fuera de rango y evidencia mayor de 8 KiB. El `policyDigest` usa
SHA-256 sobre IDs, versión, decisión, reasons y todos los hechos confiables en
orden canónico; excluye deliberadamente el texto no confiable.

La suite incluye una matriz de todas las categorías sensibles, límites de
alcance y retry, payloads con prompt injection, campos extra, orden distinto de
claves y cambios de evidencia. El corpus de flags sensibles debe mantener cero
falsos `eligible`.

## Verificación

```powershell
deno fmt --check `
  supabase/functions/_shared/testing-center-codex-risk.ts `
  supabase/functions/_shared/testing-center-codex-risk.test.ts

deno lint `
  supabase/functions/_shared/testing-center-codex-risk.ts `
  supabase/functions/_shared/testing-center-codex-risk.test.ts

deno check --all --no-lock `
  supabase/functions/_shared/testing-center-codex-risk.ts `
  supabase/functions/_shared/testing-center-codex-risk.test.ts

deno test --no-lock `
  supabase/functions/_shared/testing-center-codex-risk.test.ts
```

TAU-06B podrá consumir este resultado para producir un prompt fijo y JSON
limitado en dry-run. TAU-06C debe revisar adversarialmente el conjunto antes de
autorizar cualquier integración real. El rollback local es revertir el commit;
no existe estado remoto que deshacer.
