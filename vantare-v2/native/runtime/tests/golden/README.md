# Goldens de telemetría (#1463)

Salida congelada con el código productivo de
`0ad4052254f947f5234d30418d5f7b334ce4a55c`, antes de recuperar las
simplificaciones. Época fija 1463 y reloj del corpus, sin reloj de pared.
El test no tiene modo de regeneración: un cambio de salida falla.

- `lmu.jsonl.gz`: cinco capturas SHM reales de los builds admitidos, cada
  una con su DTO inicial y su DTO al vencer la frescura a 500 ms (10 cortes).
- `lmu47.jsonl.gz`: los 3.839 DTO completos del corpus temporal (3.600
  SHM + 239 REST), comparados byte a byte salvo el yaw de la pose (ver abajo).
- `acc.jsonl.gz`: ocho cortes completos de la sesión real de ACC.
- `acc-all.sha256`: SHA-256 de los bytes de **todos** los 190.308 DTO de
  ACC, separados por LF. Evita guardar gigabytes de JSON casi idéntico;
  no sustituye los ocho cortes legibles. El replay también debe descartar
  exactamente tres tramas y agotar el corpus.

Los gzip solo comprimen los bytes congelados, con mtime 0. No normalizan
campos, calidad, números, orden ni secuencia. Ausencia, truncado o diferencia
fallan; no se aceptan corpus vacíos ni parciales.

## Diferencia de atan2 entre plataformas (#1471)

Sobre `7be12174`, macOS arm64 reproduce el fallo del bloque 24. La comparación
de **todas las 3.839 fotos** encuentra 1.356 diferencias, exclusivamente en
`/state/cars/*/pose/reliable/yaw_rad`: máximo **1 ULP**, diferencia absoluta
máxima `4.440892098500626e-16` rad. La primera aparece en la foto 35, coche 44:
Windows `3.0903319694322935`, macOS `3.090331969432293`.
No hay diferencias en los demás valores, claves ni orden.

El adaptador calcula ese ángulo con [`f64::atan2`](https://doc.rust-lang.org/std/primitive.f64.html#method.atan2),
cuya precisión Rust declara dependiente de plataforma (actualmente usa libc).
Se permite **solo 1 ULP entre números finitos** en
ese campo del golden LMU47, en ambas plataformas. El comparador conserva los
demás bytes, separadores, orden y número de fotos; no usa tolerancia relativa
global. Su regresión rechaza dos ULP, valores no finitos y cambios en posición,
calidad, formato de otros números, campos o estructura.

No se redondea el DTO productivo ni se sustituye la biblioteca matemática:
eso cambiaría la precisión/salida del runtime y los goldens para resolver una
diferencia mínima del oráculo. Runtime, DTO, corpus y goldens permanecen intactos;
LMU estático y ACC siguen con comparación exacta. Evidencia completa externa:
`C:/tmp/1471-evidence/` (`measurement.txt`, `differences.csv`, logs de Mac).

Corpus de origen (`testdata/`, SHA-256):

- LMU47: `c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`.
- ACC: `422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071`.

Estos goldens prueban conservación frente a la base Rust. Los oráculos y
tests de conformidad existentes siguen comprobando la semántica. Replay
no acredita rendimiento ni el ciclo de vida de los simuladores en vivo.

## Relative: prioridad nativa y respaldo sin primera vuelta (#1496)

Feedback del 9 de octubre, base `e55a43b3`: `relative_s` actual del adaptador
conserva valor/calidad; el cálculo modular solo respalda su ausencia. Si
best/last faltan, se admite el periodo estimado actual de LMU, sin atribuir
al gap calculado calidad nativa. Véase la [investigación](../../../../docs/analysis/2026-10-09-relative-lmu.md).

Se regeneraron los 10 DTO estáticos, los 3839 LMU47 y las fixtures derivadas
con el runtime productivo: **ningún byte descomprimido cambia**. LMU47 tiene
los 47 coches confirmados en boxes durante todo el corpus; Relative sigue
ausente por esa protección. Por ello se conservan los gzip originales y
no se editan snapshots ni el oráculo. ACC conserva también sus goldens/hash
originales. No hay una captura positiva de los nuevos gaps nativos ni una
conexión certificada de estos: el SDK ofrece vecinos sin ID; sus cuatro
campos están a cero en todo LMU47. La regresión controlada comprueba el
respaldo antes de la primera vuelta y su ausencia en boxes/caducidad.
