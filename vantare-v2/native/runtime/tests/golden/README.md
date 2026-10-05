# Goldens de telemetría (#1463)

Salida congelada con el código productivo de
`0ad4052254f947f5234d30418d5f7b334ce4a55c`, antes de recuperar las
simplificaciones. Época fija 1463 y reloj del corpus, sin reloj de pared.
El test no tiene modo de regeneración: un cambio de salida falla.

- `lmu.jsonl.gz`: cinco capturas SHM reales de los builds admitidos, cada
  una con su DTO inicial y su DTO al vencer la frescura a 500 ms (10 cortes).
- `lmu47.jsonl.gz`: los 3.839 DTO completos del corpus temporal (3.600
  SHM + 239 REST), comparados byte a byte en bloques acotados.
- `acc.jsonl.gz`: ocho cortes completos de la sesión real de ACC.
- `acc-all.sha256`: SHA-256 de los bytes de **todos** los 190.308 DTO de
  ACC, separados por LF. Evita guardar gigabytes de JSON casi idéntico;
  no sustituye los ocho cortes legibles. El replay también debe descartar
  exactamente tres tramas y agotar el corpus.

Los gzip solo comprimen los bytes congelados, con mtime 0. No normalizan
campos, calidad, números, orden ni secuencia. Ausencia, truncado o diferencia
fallan; no se aceptan corpus vacíos ni parciales.

Corpus de origen (`testdata/`, SHA-256):

- LMU47: `c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c`.
- ACC: `422481dc88b1e7f9cb9ebaf025cc615d08453bea8fded36ca881b996ba386071`.

Estos goldens prueban conservación frente a la base Rust. Los oráculos y
tests de conformidad existentes siguen comprobando la semántica. Replay
no acredita rendimiento ni el ciclo de vida de los simuladores en vivo.
