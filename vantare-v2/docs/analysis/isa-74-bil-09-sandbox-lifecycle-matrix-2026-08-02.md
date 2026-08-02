# ISA-74 / BIL-09 — Informe de implementación

## Resultado

Se añadió una fixture sandbox completa y versionada que valida conjuntamente
Launch Edition, Pro, Pro Plus, trial, lifecycle de suscripción, Customer State,
beneficios, compras múltiples y refunds. El corte usa los motores productivos
existentes; no crea una segunda lógica comercial.

## Decisiones

1. Conservar `VALID_POLAR_PRODUCT_MAP_JSON` para tests unitarios históricos y
   añadir `FULL_SANDBOX_PRODUCT_MAP_JSON` para escenarios transversales.
2. Mantener la matriz de estados como JSON versionado, legible y sin lógica.
3. Ejecutar el resultado con `deriveSubscriptionTransition`,
   `buildReconciliationPlan`, `executeReconciliation` y
   `reconcileOrderRefundLedger` reales.
4. Considerar desconocidos y atribución incompleta como quarantine/revocación,
   nunca como acceso implícito.

## Alcance y seguridad

Solo se modifican fixtures, tests y documentación. Todos los identificadores son
sintéticos; no se consultó ni mutó Polar, Supabase o una cuenta. No hubo pagos,
refunds, deploys, secretos ni regeneración de fixtures productivas.

## Evidencia local

- Test focal BIL-09: 4/4 PASS.
- Suite Deno activa completa: 177/177 PASS en 19 archivos.
- `deno fmt --check` y `deno check`: PASS.
- Guard de superficie desplegable: PASS; solo las cuatro funciones aprobadas.
- `git diff --check`: PASS.

## Riesgos restantes

- La fixture demuestra la semántica local, no la forma exacta de eventos futuros
  del proveedor.
- Los smoke monetarios sandbox reales siguen requiriendo autorización y un
  entorno remoto controlado.
- La venta pública permanece **NO-GO** hasta completar los gates posteriores.
