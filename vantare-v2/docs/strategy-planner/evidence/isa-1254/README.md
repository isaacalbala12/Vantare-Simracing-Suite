# ISA-1254 — entrada exacta en la revisión Orbit

## Problema reproducido

`calculate_orbit` recibía la proyección, los overrides, sus referencias de
fuente y los escenarios meteorológicos, pero `save_revision` sólo conservaba
evento, variante y resultado. La prueba de página falló antes del cambio porque
el payload guardado no contenía `calculationInput`.

## Solución mínima

El payload Orbit existente añade un campo opcional `calculationInput` y guarda
directamente la petición asociada al resultado vigente. No reconstruye datos
desde el catálogo ni cambia repositorio, hashes, activación, solver o formato de
los snapshots anteriores.

La prueba de ciclo de vida parte de una revisión guardada con referencias A y acredita que
al cambiar sólo esas referencias a B ya no se reconoce A como la revisión
visible guardada.

## Límite

T14 sigue abierto para consultar una revisión antigua cuando la fuente ya no
está disponible y para recuperar comandos duraderos tras reiniciar. Esta entrega
no abre app/Wails/LMU ni toca DuckDB.
