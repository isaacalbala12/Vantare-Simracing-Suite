# ISA-101 — evidencia cruda de almacenamiento

Artefactos generados el 2026-07-30 sobre
`4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`.

| Archivo | Contenido |
|---|---|
| `environment.txt` | host, toolchain, cache y fixture |
| `raw-{framing,sqlite,mcap}.csv` | repeticiones completas |
| `raw-aggregate.csv` | medianas/rangos derivados |
| `raw-faults-*.csv` | concurrent reader, tail, kill y bloqueos |
| `raw-builds.csv` | probe CGO y tamaños |
| `raw-wails-build.csv` | build base Wails CGO=0 |
| `raw-race.txt` | bloqueo exacto de race bajo CGO=0 |
| `raw-dependencies-*.txt` | módulos enlazados por tag |
| `raw-licenses.csv` | licencia y SHA-256 por módulo |
| `raw-mcap-cli-recover.txt` | bloqueo exacto del CLI recovery |

Los CSV separan la primera pasada de las posteriores; las medianas primarias
excluyen `first`. Los CSV de throughput usan un commit/cierre final.
`raw-faults-*.csv` contiene límites deterministas del backend y un manifest
experimental; no es evidencia del coordinator productivo ni de ACK durable.

No contienen PII, telemetría real, nombres, secretos ni rutas de usuario.
Observed y facts usan contratos v1 tipados; sus golden están en el módulo
aislado. Los faults separan `integrity_state`, `access_mode` y el estado de
integridad recuperado.
