# Entrada de regresión Imola (ISA-1089)

`recorded-imola-input.json` contiene el input de `calculate_orbit` capturado en
Wails durante ISA-1088, evento controlado de 120 minutos. La proyección procede
de la sesión real Imola ya expuesta del corpus de preparación; no es reserva
independiente ni prueba de precisión física. Parámetros de evento/piloto son
la configuración de ese ensayo. El nombre del piloto fue saneado; no incluye
ruta al original, credenciales ni telemetría cruda. Mantiene valores y contratos
para reproducir el timeout. Referencia de origen y hash del DuckDB en evidencia
ISA-1088/1090. La captura antecede a la selección fijada final de ISA-1090.

El test exige horizonte temporal correcto y reserva satisfecha dentro del
presupuesto existente; no afirma optimalidad física. Ejecutar sin suites CPU
pesadas concurrentes para que el deadline de producción tenga sentido.
