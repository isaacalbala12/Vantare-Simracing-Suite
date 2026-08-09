# ISA-232 / TAU-06G — reauditoría adversarial Codex v2

Fecha: 2026-08-02

Base exacta revisada: `e9546d917bf52889320e1a6eeb93b64c97ec74b0`

Alcance: controles TAU-06D/E/F de evidencia, policy, scope, SHA y ejecución
durable. Los módulos revisados no se han editado; el único código nuevo es un
harness adversarial independiente.

Veredicto para iniciar TAU-07: **GO condicionado**.

Este GO permite diseñar y revisar el adaptador real. No autoriza activar Codex,
abrir repositorios, desplegar Supabase, distribuir builds, promover ramas ni
fusionar PRs.

## Resultado del gate

- P0 abiertos: 0.
- P1 abiertos: 0.
- P2 abiertos: 0.
- Falsos `eligible` con flags sensibles estructurados: 0/96.
- Falsos `needs_owner` en corpus benigno estructurado: 0/35.
- Retenciones de PII, secretos, rutas, URL, códigos, versión o prompt
  injection: 0/48 comprobaciones.
- Evidencia forjada o reproducida con otra identidad rechazada: 4/4.
- Alias sensibles y escapes de scope aceptados: 0/12.
- Drift de request y snapshots SHA incompletos, duplicados, inconsistentes o
  no canónicos rechazados: 5/5.
- Reserva del adaptador válido: un único comando exacto; recibo ambiguo
  rechazado antes de producir un resultado.
- PostgreSQL: 61/61, rollback/reapply, carrera entre dos workers y pausa tardía
  concurrente, todo PASS.

## Cierre de los hallazgos de TAU-06C

1. **Procedencia y redacción:** el loader `service_role` deriva una proyección
   cerrada desde el reporte persistido. Mensajes, códigos, versión y texto libre
   no llegan al sobre; digest, tamaño e identidad se verifican de nuevo.
2. **Scope sensible:** las reglas leaf-level rechazan access, clients, bridge,
   canvas, workflows, aliases de mayúsculas, traversal y rutas desconocidas.
3. **Exclusión durable:** una fila automática por issue, claim global, lease,
   fencing monotónico, máximo un dispatch y pausa revalidada justo antes del
   permiso sustituyen el registro in-memory.
4. **Base exacta:** request, cola y permiso quedan ligados a un SHA exacto y a
   una prueba cerrada head+ancestros de `nightly`; mutaciones posteriores
   invalidan el contrato.

## Controles adicionales que resistieron

- una proyección falsa con digest recalculado no se convierte en evidencia;
- una evidencia válida no puede reproducirse sobre otra issue;
- un snapshot de ancestry autoafirmado, incompleto o no canónico falla cerrado;
- issue cerrada/no encolada y pausa global/por flujo impiden autorizar dispatch;
- dos workers no pueden obtener permisos simultáneos;
- tras autorizar dispatch no hay retry automático: respuesta ambigua va a
  `needs_owner` y una caída queda pendiente de reconciliación humana;
- no existen `fetch`, endpoint, variables de entorno, checkout, escritura de
  repo, API Codex ni ejecución de comandos en el alcance revisado.

## Precondiciones obligatorias de TAU-07

1. El adaptador server-side debe obtener el head y ancestry reales del repo
   `isaacalbala12/Vantare-Simracing-Suite`; nunca aceptar el snapshot del
   cliente, del issue o del propio modelo.
2. Debe usar la reserva, claim, lease, fencing y permiso de dispatch existentes.
   La clave idempotente y el SHA exacto deben acompañar toda llamada.
3. No debe reintentar automáticamente después de un permiso de dispatch. Un
   timeout o resultado ilegible pasa a `needs_owner`/reconciliación.
4. La pausa del owner debe persistirse server-side y pasar por el mismo lock que
   el permiso. El Testing Center solo muestra el estado derivado del servidor.
5. Codex empieza en análisis/propuesta con scope y command IDs cerrados. La
   escritura de repo, rama y PR requiere un corte posterior específico, PR
   draft y revisión humana.
6. Un rechazo de tester, un flag sensible o una ampliación de alcance desactiva
   la automatización para esa issue; nunca reasigna ni reinicia el bucle.

## Reproducción

```powershell
deno test --config supabase/functions/deno.json --node-modules-dir=auto `
  --no-lock --allow-env --allow-read `
  supabase/tests/testing-center-codex-adversarial-v2.test.ts

powershell -ExecutionPolicy Bypass -File `
  supabase/tests/run-testing-center-codex-control-postgres.ps1
```

## Decisión operativa

Se puede crear TAU-07 como una serie de microcortes revisables. El primer corte
debe ser el adaptador read-only de ancestry y ejecución en dry-run, con fakes y
sin credenciales reales. Activación, repo write, PR automática, Discord,
Supabase remoto, merge y promoción continúan apagados hasta gates separados y
aprobación explícita de Isaac.
