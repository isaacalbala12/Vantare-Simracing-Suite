# ISA-819 — reconciliación de catálogo y progreso

Base `bb266977`, rama `vantareapp/isa-819-catalog-reconciliation`, worktree
`C:/tmp/vantare-isa819-reconcile`. Ejecución personal autorizada. El corte
anterior de #819 permanece intacto.

1. RED de progreso adelantado al catálogo restaurado, progreso atrasado,
   rechazo preservado y fallo al consultar el catálogo.
2. Comparar locators con sesiones autorizadas; no deducir autorización del
   discovery ni de igualdad de nombres/ID. El store valida la procedencia.
3. Registrar pérdida como fallo reintentable sin reimportación automática.
   Al importar, omitir los candidatos que ya están autorizados y almacenados.
4. Preservar decisiones y errores, tests del servicio y Go completo, build
   de assets, revisión personal, evidencia, handoff y roadmap/digest.

Archivos: service.go, helper de reconciliación y tests; sin nueva interfaz,
schema, dependencia o cambios de originales. Wails es un gate separado.
