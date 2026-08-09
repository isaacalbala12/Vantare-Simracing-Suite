# Testing Center — contrato Codex dry-run, sin agente

Estado: TAU-06B / ISA-227 implementado en rama de issue. Este corte construye
y valida un sobre de análisis; no llama a OpenAI/Codex, no abre un checkout, no
lee o escribe el repo, no ejecuta comandos, no crea ramas/commits/PRs y no usa
red, credenciales, workflows o deploy.

## Fronteras del sobre

Las instrucciones y cinco objetivos son constantes compiladas. Desde TAU-06D,
`untrustedEvidence` contiene únicamente una proyección estructurada verificada:
no recibe texto libre, mensajes o códigos del reporte. No se interpola en
instrucciones, rutas, comandos o budgets. El digest la cubre para detectar
cambios entre reserva y consumo.

La policy TAU-06A se recalcula antes de construir el sobre. Debe resultar
`eligible` y coincidir exactamente con decisión, reasons y digest recibidos. El
módulo server-side también debe coincidir con la superficie clasificada.

Allowlist inicial de módulos:

- Testing Center: presentación o estado local;
- Overlay Studio: solo presentación;
- Calendar: solo presentación.

Cada módulo produce prefijos y reglas leaf-level fijas. Testing Center acepta
solo Page/preview/translations/validation; Overlay Studio solo components,
inspector y cuatro roots visuales; Calendar solo archivos flat catalogados.
Access, clients, state, canvas, bridge, workflows y cualquier ruta no
catalogada fallan cerrados. El modelo no recibe rutas del tester.

La base descriptiva `nightly` incluye un SHA exacto de 40 hex ligado al request
digest. `repositoryAccess=forbidden`: este corte no abre el ref. TAU-06F valida
un snapshot cerrado de head y ancestros aportado por un puerto server-owned y
liga el proof digest a la reserva durable. La implementación futura que obtiene
ese snapshot real de Git/GitHub continúa desconectada.

## Budgets

- evidencia: máximo 8 KiB, ya impuesto por TAU-06A;
- salida JSON: 32 KiB;
- análisis: 12.000 tokens y 600 segundos;
- máximo cinco archivos, además limitado por la estimación aprobada;
- máximo tres comandos de test por ID allowlisted;
- tool calls: cero;
- concurrency key global: `testing-center.codex.global`.

`InMemoryCodexDryRunRegistry` queda solo como caracterización local. TAU-06F
añade la autoridad real en PostgreSQL: una reserva por issue, claim global,
lease, fencing monotónico, recheck de pausa y un único permiso de dispatch. Una
respuesta ambigua o caída posterior al permiso no se reintenta: exige owner.

## Salida cerrada

La respuesta admite únicamente `proposed`, `needs_owner` o `not_reproduced` y
un objeto JSON exacto. No acepta Markdown envolvente, campos extra, shell libre,
rutas absolutas/Windows, `..`, prefijos fuera de módulo, extensiones ajenas,
duplicados o comandos distintos de:

- `frontend.test.focal`;
- `frontend.test.global`;
- `frontend.build`;
- `frontend.lint.focal`.

Una propuesta requiere al menos un archivo, un test y checklist humano. Los
otros estados no pueden sugerir archivos o comandos. El decoder revalida el
digest y toda la configuración fija del request antes de mirar la respuesta.

## Verificación y siguiente gate

```powershell
deno fmt --check `
  supabase/functions/_shared/testing-center-codex-dry-run.ts `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts

deno lint `
  supabase/functions/_shared/testing-center-codex-dry-run.ts `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts

deno check --all --no-lock `
  supabase/functions/_shared/testing-center-codex-dry-run.ts `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts

deno test --no-lock `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts
```

TAU-06C debe atacar policy, request, prompt injection, paths, commands,
budgets, concurrencia y respuesta. Hasta un GO explícito, TAU-07 no puede
conectar Codex ni otorgar acceso de lectura/escritura. Rollback local: revertir
el commit; no existe estado remoto que deshacer.
