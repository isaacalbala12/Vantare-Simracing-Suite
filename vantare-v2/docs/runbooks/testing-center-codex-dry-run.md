# Testing Center — contrato Codex dry-run, sin agente

Estado: TAU-06B / ISA-227 implementado en rama de issue. Este corte construye
y valida un sobre de análisis; no llama a OpenAI/Codex, no abre un checkout, no
lee o escribe el repo, no ejecuta comandos, no crea ramas/commits/PRs y no usa
red, credenciales, workflows o deploy.

## Fronteras del sobre

Las instrucciones y cinco objetivos son constantes compiladas. La evidencia
redactada del reporte viaja en `untrustedEvidence`, marcada como dato no
confiable, y no se interpola en instrucciones, rutas, comandos o budgets. El
digest sí la cubre para detectar cambios entre reserva y consumo.

La policy TAU-06A se recalcula antes de construir el sobre. Debe resultar
`eligible` y coincidir exactamente con decisión, reasons y digest recibidos. El
módulo server-side también debe coincidir con la superficie clasificada.

Allowlist inicial de módulos:

- Testing Center: presentación o estado local;
- Overlay Studio: solo presentación;
- Calendar: solo presentación.

Cada módulo produce prefijos de ruta fijos. El modelo no recibe rutas aportadas
por el tester. La base descriptiva es `nightly`, pero
`repositoryAccess=forbidden`: en este corte no se comprueba ni abre ese ref.

## Budgets

- evidencia: máximo 8 KiB, ya impuesto por TAU-06A;
- salida JSON: 32 KiB;
- análisis: 12.000 tokens y 600 segundos;
- máximo cinco archivos, además limitado por la estimación aprobada;
- máximo tres comandos de test por ID allowlisted;
- tool calls: cero;
- concurrency key global: `testing-center.codex.global`.

`InMemoryCodexDryRunRegistry` solo demuestra idempotencia y exclusión en tests
locales. No es un lock distribuido ni autoriza ejecución. Antes de conectar un
agente real se necesita un claim durable server-side con lease, pausa y
reconciliación equivalente al outbox GitHub.

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
