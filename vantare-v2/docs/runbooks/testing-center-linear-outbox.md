# Testing Center — outbox Linear en dry-run

> **Deprecado.** Linear fue retirado el 2026-08-20; los issues viven en GitHub Issues de este repositorio. Documento conservado como historico.

Estado: ISA-239 / TAU-07E implementado y validado localmente. No hay red,
credencial Linear, webhook, UI, Codex, Discord, deploy, merge ni promoción.

## Frontera del corte

Supabase continúa siendo la autoridad canónica. Este corte sustituye la
reserva operativa GitHub por un único efecto durable `linear_issue_create`,
pero solo persiste una proyección sanitizada: nunca llama a Linear.

- `testing_center_issue_destinations` selecciona exactamente un destino por
  issue, incluso si el efecto ya es terminal.
- `testing_center_effect_supersessions` conserva el estado GitHub previo para
  un rollback exacto.
- `testing_center_build_identities` resuelve canal y versión a un SHA de
  candidato registrado server-side.
- `testing_center_linear_projection_snapshots` congela fuente, ocurrencias,
  marker, proyección y digests.

Las tablas fuerzan RLS. `anon` y `authenticated` no reciben acceso. El rol de
servicio puede registrar identidades de build y utilizar las RPC cerradas, pero
no reescribir directamente destinos, supersesiones o snapshots.

## Cutover desde GitHub

La migración toma locks sobre pausas y outbox. Si existen efectos previos exige
una pausa global activa y rechaza cualquier efecto GitHub `claimed`, aunque su
lease haya expirado. Primero revoca las RPC GitHub; después:

1. conserva sin cambios los efectos GitHub `completed` y los deja en
   `github_legacy:needs_owner`;
2. fotografía exactamente los efectos `pending` o `failed`;
3. crea su efecto Linear nuevo;
4. marca el efecto GitHub como `superseded`;
5. selecciona Linear como único destino activo.

No renombra ni recicla un efecto GitHub. No existe dual-write ni fallback.

## Preparación y ejecución dry-run

`testing_center_prepare_linear_projection(effect_id)` congela el reporte
primario, número de ocurrencias y SHA exacto. Cero o más de una identidad de
build activa llevan el efecto a `needs_owner`; no se autocorrige.

El worker reclama mediante `testing_center_claim_linear_effect` con owner de
lease y fencing monotónico. La proyección se compone una sola vez en
TypeScript usando `testing-center.linear-issue.v1`: texto libre redactado y
delimitado, metadata y labels server-owned, sin assignee, priority, delegate,
rama, comandos, logs ni URL de replay.

`testing_center_complete_linear_dry_run` exige:

- lease vigente, worker y fencing exactos;
- ausencia de pausa global o del flujo;
- source digest y marker preparados;
- conjunto exacto de claves y metadata fija;
- JSON canónico cuyos bytes producen el projection digest recibido.

Solo entonces persiste la proyección y termina en `dry_run_completed`, siempre
con identificador externo nulo. Una respuesta futura ambigua termina en
`needs_owner`; nunca se reintenta ni se reconcilia automáticamente.

## Verificación

Los tests TypeScript cubren contrato, sanitización, manipulación e idempotencia.
El gate PostgreSQL obligatorio es:

```powershell
& .\supabase\tests\run-testing-center-linear-outbox-postgres.ps1
```

El runner crea un contenedor y bases desechables. Prueba instalación limpia,
pausa obligatoria, claims activos y expirados, upgrade, 43 aserciones pgTAP,
rollback exacto, reaplicación y carrera real entre dos procesos. Debe lanzarse
manualmente solo cuando Docker tenga recursos suficientes. No usar una base
compartida ni `supabase db reset`.

Evidencia ISA-239: instalación limpia, guards de pausa/claim, 43/43, rollback
exacto, reaplicación 43/43 y carrera real de dos procesos PASS.

## Rollback

El rollback exige pausa global y falla si existe un efecto Linear claimed,
completado, ambiguo o creado después del cutover sin supersesión. Si sigue
siendo reversible, restaura estado, intentos, error, backoff, lease y timestamp
GitHub exactos; recupera la definición y grants previos de triage y elimina
solo las estructuras TAU-07E.
