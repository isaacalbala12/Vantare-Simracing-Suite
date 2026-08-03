# ISA-228 / TAU-06C — auditoría adversarial Codex

Fecha: 2026-08-02

Base exacta revisada: `a4239a45840f3f2c8d0f4f2fcae8bd83763a258f`

Alcance: `testing-center-codex-risk.ts` y
`testing-center-codex-dry-run.ts`, sin editar ambos módulos.

Veredicto para TAU-07: **NO-GO**.

## Resultado del gate

- P0 abiertos: 0.
- P1 abiertos: 3.
- P2 abiertos: 1.
- Falsos `eligible` con flags sensibles estructurados: 0/96.
- Falsos `needs_owner` en corpus benigno estructurado: 0/35.
- Outputs maliciosos fuera de prefijo/campos extra rechazados: 2/2.

La policy y el decoder cumplen sus contratos locales, pero el gate exige
también cero P1/P2. No se puede conectar un agente real todavía.

## Hallazgos

### P1 — La procedencia/redacción de evidencia es una afirmación, no un gate

`evidenceSanitization=testing-center.server-redacted.v1` se acepta como string,
pero este stack no posee un adaptador que produzca el texto desde el payload
sanitizado de TAU-03/04 ni verifica su digest. Email, bearer token sintético,
ruta local y teléfono del corpus entran íntegros en el sobre (4/4). Si TAU-07
enviara ese campo a un proveedor, podría exfiltrar PII/secretos.

Remediación: construir evidencia únicamente desde bytes sanitizados y
consentidos del diagnóstico, ligar digest/policy version al reporte persistido,
rechazar texto arbitrario y añadir un corpus PII/secretos con cero retenciones.

### P1 — Los prefijos de módulo incluyen fronteras sensibles

La allowlist por directorio aceptó 3/3 propuestas sobre:

- `overlay-studio/access/studio-access.ts`;
- `testing-center/wails-testing-center-client.ts`;
- `testing-center/report-submission-client.ts`.

Esos archivos caben bajo los prefijos de presentación/estado local, aunque
tocan acceso o clientes. Un flag correcto podría bloquearlos, pero el decoder
de salida debe aplicar su propia defensa.

Remediación: allowlist de leaf paths/patrones por módulo y denylist estructural
para access, auth, clients, bridge, persistencia, generated bindings y tests de
escape. Si Codex descubre que necesita otra ruta, debe devolver `needs_owner`.

### P1 — La exclusión global no existe fuera del proceso

Dos instancias de `InMemoryCodexDryRunRegistry` reservaron simultáneamente el
mismo request. Esto está documentado en TAU-06B, pero bloquea una ejecución
automática real: reinicio, scale-out o dos workers perderían exclusión y pausa.

Remediación: claim durable server-only con lease, fencing token, pausa
global/flujo revalidada justo antes de ejecutar, máximo un intento automático y
reconciliación de estado ambiguo.

### P2 — La base es `nightly` móvil, no un commit exacto

El sobre fija `analysisBaseRef=nightly` pero no contiene SHA. Entre reporte,
clasificación y ejecución el canal puede avanzar, haciendo que análisis, diff y
tests correspondan a árboles distintos.

Remediación: resolver server-side un SHA ancestro de `nightly`, ligarlo al
request digest y exigir ese mismo SHA para checkout, análisis y PR. Un drift
posterior requiere reclasificación, nunca rebase automático silencioso.

## Controles que sí resistieron

- todas las categorías sensibles individuales y mixtas produjeron
  `needs_owner` pese a Unicode, HTML y prompt injection;
- el corpus benigno de 35 casos mantuvo `eligible`;
- request digest/configuración, scope growth, traversal, workflow path, command
  IDs y campos extra fallaron cerrados;
- no hay `fetch`, endpoint, env, API, checkout o write en TAU-06A/B.

## Reproducción

```powershell
deno test --no-lock `
  supabase/tests/testing-center-codex-adversarial.test.ts
```

El harness es una fotografía NO-GO separada de la suite productiva. Los fixes
no deben modificar esta evidencia en su rama; una reauditoría posterior crea un
nuevo resultado y sustituye el gate solo cuando los cuatro hallazgos estén
cerrados.

## Decisión operativa

No crear TAU-07 ni activar Codex. Crear cortes de hardening para:

1. procedencia/redacción ligada al reporte;
2. scope leaf-level y SHA exacto;
3. lease/pausa durable;
4. reauditoría independiente con el mismo corpus y nuevos bypasses.

No se ha usado API, secreto, red, workflow, checkout, rama/PR automática,
Discord, deploy, merge o promoción.
