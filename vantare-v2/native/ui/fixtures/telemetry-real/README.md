# Fotos reales para el contrato de demanda (#1474)

DTO v9 (#1530): solo se cambia la etiqueta de versión respecto a 5e1da3f6;
los datos, calidad, números y separadores originales se conservan byte a byte.

Copias exactas, sin LF final ni cambios de campos, de los goldens congelados de
#1463. No son escenas de diseño ni telemetría live. `telemetry_golden.rs` compara
estas copias contra el replay real, además de conservar los goldens originales.

| Foto | Origen | Corte | SHA-256 de la copia |
| --- | --- | --- | --- |
| `lmu47.snapshot.json` | `runtime/tests/golden/lmu47.jsonl.gz` | 1 de 3839 | `3fe5acef6f332dd01fd1afee64d419ec5250f415117fba71585a456e6fd92630` |
| `acc.snapshot.json` | `runtime/tests/golden/acc.jsonl.gz` | 8, observación 190308 | `11500cb34cbb795957de2a43171d5668f7fde6cfed1a258cad099f294f3638d1` |
| `lmu-stale.snapshot.json` | `runtime/tests/golden/lmu.jsonl.gz` | 2: fixture real de 44 coches degradado a 500 ms | `5a08189e04e16d82689075a324d5223ec7c7a7880dbd3bf4e4a635bd319a0ca9` |
| `lmu-menu.snapshot.json` | `runtime/tests/golden/lmu.jsonl.gz` | 3: menú real sin parrilla | `49df511d1ad8d53beae3ba7935b5ffa55d15ab2a58a0036c75f724dc6f5f9c9a` |

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

## Probar con — Studio nativo (#1496)

Boxes usa las doce fotos exactas de lmu47-input.sequence.json y la foto ACC.
Vuelta y foto elige un Snapshot completo: no altera vuelta, revisión, reloj,
identidad, datos ausentes ni estimados. Todos los widgets ven la misma foto.
El jugador permanece en vuelta0/en boxes en las trece fotos: no es una vuelta
cronometrada ni conducción. En vivo sigue exclusivamente IPC; Ejemplo general
sigue siendo la demostración visual explícita y no se rotula como corpus real.
Salida no está observada (Preparing ausente); Carrera tampoco (solo Practice);
Lluvia está registrada en0; no existe señal de noche/hora del día. Las cuatro
condiciones se dejan Próximamente, sin inferir noche de elapsed_s ni escoger
otro coche como jugador. Se inspeccionaron también los goldens de procedencia:
lmu47/acc tampoco contienen salida/carrera/lluvia/noche del jugador.
