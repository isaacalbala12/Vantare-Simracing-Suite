# ISA-821 — deadline real de importación

Base `b85fa5f4`, rama `vantareapp/isa-821-candidate-deadline`, ejecución personal.

- Reproducir deadline ausente y resultado tardío, cancelación padre, reintento.
- `context.WithTimeout` por candidato, propagado por el importer al reader/helper.
  Esperar su terminación antes de permitir otro lote; descartar éxito tras cancelar.
- Límite operativo inicial de 29 minutos, menor que los 30 de la UI existentes.
  Conserva el presupuesto previo para carreras largas: no es un SLO empírico.
  Tests usan un límite corto. No introducir otro protocolo ni goroutine abandonada.
- Código estable `candidate_timeout` y traducción visible; traducir también
  `catalog_entry_missing` de #819 en el mismo mapa de causas del banner.
- Archivos: service.go y tests; banner, test y cuatro locales; comentario del
  timeout de cliente. Revisar propagación existente en reader/helper.
- Checks: Go completo, frontend focal y completo, build/typecheck/lint, revisión
  personal, evidencia, handoff y roadmap/digest. Runtime real es evidencia separada.
