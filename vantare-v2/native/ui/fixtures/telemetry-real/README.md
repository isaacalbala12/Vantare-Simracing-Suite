# Fotos reales para el contrato de demanda (#1474)

Copias exactas, sin LF final ni cambios de campos, de los goldens congelados de
#1463. No son escenas de diseño ni telemetría live. `telemetry_golden.rs` compara
estas copias contra el replay real, además de conservar los goldens originales.

| Foto | Origen | Corte | SHA-256 de la copia |
| --- | --- | --- | --- |
| `lmu47.snapshot.json` | `runtime/tests/golden/lmu47.jsonl.gz` | 1 de 3839 | `2ba8ff6f23361d00b8b25fb5b177cbb51d424fd2d9840796d27378a0aa327447` |
| `acc.snapshot.json` | `runtime/tests/golden/acc.jsonl.gz` | 8, observación 190308 | `85f560b2c14bb9c79d2035cc373fddb785dfc92af281b688744f63efb1d69b59` |
| `lmu-stale.snapshot.json` | `runtime/tests/golden/lmu.jsonl.gz` | 2: fixture real de 44 coches degradado a 500 ms | `d8e42c880a9d74bd112aa80738f77701b38b7c0badcd87e0e1e8b93612cfba7a` |
| `lmu-menu.snapshot.json` | `runtime/tests/golden/lmu.jsonl.gz` | 3: menú real sin parrilla | `735783a7cdd1cd3fd9c5bb49af31caf7721ab7f8039bedfd9ef43ceece455e5a` |

Corpus originales y hashes: `runtime/tests/golden/README.md`. Extracción desde
`native/`, con Python de la biblioteca estándar:

```python
import gzip
from pathlib import Path

for name, golden, cut in [("lmu47", "lmu47", 1), ("acc", "acc", 8),
                          ("lmu-stale", "lmu", 2), ("lmu-menu", "lmu", 3)]:
    with gzip.open(Path("runtime/tests/golden") / f"{golden}.jsonl.gz", "rb") as source:
        photo = source.readlines()[cut - 1].rstrip(b"\n")
    assert photo == (Path("ui/fixtures/telemetry-real") / f"{name}.snapshot.json").read_bytes()
```

LMU47 conserva 47 coches y ACC 32. El jugador no tiene mejor vuelta válida en
estas capturas: `relative_s` está ausente, mientras que `relative_laps` aporta
datos reales. La regresión H2H prueba la entrega de la familia Relative y su
demanda; no acredita un gap positivo conduciendo. Los vectores de presentación
existentes cubren el signo y el formato por separado.

Relative contrasta los slots `track`, `ambient` y `time` con ACC fresco y LMU
stale: seis casos por pipe solicitado, sin modificar las fotos. Protege la
temperatura del slot y el reloj/clima del pie común cuando la fuente está stale.

## Input #1468

`lmu47-input.sequence.json` contiene las primeras doce observaciones del
corpus `testdata/rust-port/lmu47-high-rate-60s.tar.gz`, pasando por el adaptador
LMU real y Core (epoch 1463), con reloj de replay que avanza de 20 en 20 ms.
La regresión temporal regenera y compara el array completo byte a byte.
No modifica valores, secuencias ni identidad de las fotos obtenidas del núcleo.
El golden anterior entregaba todos los eventos a 61 s, por lo que no servía
para dibujar el histórico temporal. El tramo observado muestra el jugador
detenido (freno 100 %, acelerador y embrague 0 %); no acredita conducción live.
ACC se contrasta además con la foto real existente. La ausencia de embrague
se prueba como vector de degradación explícito, no como captura real.
