# Testing Center — evidencia mínima para Codex

Estado: TAU-06D / ISA-229 implementado como contrato puro. No hay consulta a
Supabase, API Codex, red, endpoint, credencial, checkout o write.

## Decisión de privacidad

El sobre Codex ya no acepta el texto de `riskInput.untrustedEvidence` ni una
etiqueta de «redactado». Exige una `VerifiedCodexEvidence` ligada a:

- `technicalIssueId` y `reportId` exactos;
- bytes JSON de `testing-center.diagnostic.v1`;
- SHA-256 y byte size exactos;
- consentimiento diagnóstico obligatorio y consentimiento de logs separado.

El payload se parsea con shape cerrada y límites del contrato local. La
proyección no conserva ningún string libre: omite mensajes, códigos, versión y
timestamp. Solo incluye canal/SO/arquitectura/módulo allowlisted, presencia de
error y, con consentimiento, offset/source/level de cada log. Así un email,
teléfono, token, URL, ruta o prompt injection contenido en mensajes o códigos
no puede salir aunque tenga un formato que el diagnóstico local acepte.

El digest de la proyección se revalida al construir el dry-run y las identidades
deben coincidir con la policy. El texto libre original puede seguir existiendo
en `riskInput` para clasificación/auditoría, pero queda fuera del request Codex.

## Frontera pendiente

Este corte valida un record server-side; todavía no implementa el loader que lo
obtendrá de PostgreSQL. TAU-06F debe cargar payload, digest y consentimientos de
la fila persistida bajo service role. La app, GitHub Issue o tester nunca pueden
proporcionar directamente `VerifiedCodexEvidence` a un endpoint.

## Gates

```powershell
deno test --no-lock `
  supabase/functions/_shared/testing-center-codex-evidence.test.ts `
  supabase/functions/_shared/testing-center-codex-dry-run.test.ts
```

El corpus focal usa solo valores sintéticos y exige cero retenciones de PII,
secretos, rutas, URLs y prompt injection. Tampering de bytes, digest, tamaño,
consentimiento, schema, evidencia o identidad falla cerrado. Rollback: revertir
el commit; no existe estado remoto.
