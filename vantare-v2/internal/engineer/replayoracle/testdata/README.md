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

`radio/` fija los escenarios del laboratorio `radio.v1` (`radio_lab_test.go`),
que compone el producer del Spotter, el motor de familias y el bus de radio con
un reloj virtual y entregas con guion:

- `multi-cycle.golden.json` — varios ciclos con Spotter (car_left → still_there
  → all_clear degradado tras expirar el contexto iniciado, y clear_right dentro
  de su ventana) intercalado con la cascada de fuel, lap_completed y el
  cooldown de gap_report.
- `saturation.golden.json` — cola acotada llena con tráfico de familias,
  rechazos por presión, coalescing y un P0 que barre los pendientes no-P0 e
  interrumpe la entrega activa.
- `degradation.golden.json` — pérdida de capability spatial con entrega en
  vuelo (el started sobrevive), pérdida de fuel que purga el pendiente, corte
  de fuente y frontera de reconexión que exige snapshot estrictamente nuevo.

Cada golden registra la secuencia completa de eventos (submissions, drops,
coalescing, ACKs, resets) con reloj virtual; los tests reejecutan el guion 20
veces y exigen salida idéntica antes de comparar.

Un cambio deliberado del golden exige revisar el diff de estados, motivos,
mensajes y deadlines. No existe una actualización automática en producción ni
un flag que regenere baselines durante la suite normal.
