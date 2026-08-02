# ENG-04 replay fixtures

Los escenarios de este directorio son sintéticos y sanitizados. No contienen
capturas de usuarios, rutas locales ni datos procedentes de una carrera real.

`v1/approved-families.golden.json` fija el resultado observable del oráculo
para las seis familias con paridad aprobada: Spotter, fuel, penalties, laps,
timings y pit entry/exit. El `oracleVersion` y `scenarioVersion` impiden aceptar
un cambio de contrato por accidente.

`v2/approved-families.golden.json` conserva esas decisiones y añade dos
fronteras observables por cada decisión aprobada: entrega al transporte e
inicio confirmado. El v1 permanece intacto como evidencia histórica; los
tests activos usan v2.

Una familia aprobada no convierte en válida cualquier salida de su monitor
legacy. Las decisiones fuera del escenario caracterizado se conservan en el
golden como `unavailable / decision_not_approved`; en particular, el contador
genérico no demuestra un drive-through y solo `entry`/`exit` están aprobados
para pits.

Un cambio deliberado del golden exige revisar el diff de estados, motivos,
mensajes y deadlines. No existe una actualización automática en producción ni
un flag que regenere baselines durante la suite normal.
