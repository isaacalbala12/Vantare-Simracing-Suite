# ISA-1208 — banco real de alineación temporal

Banco read-only ejecutado sobre S125 Imola, S266 Algarve y S026 Monza con el
runtime autorizado DuckDB v1.5.5, manifiesto
`700201f90266ae6b829372d9989408c6b0efd86725a50980d46fc05adfc24869`.
No se abrió Vantare, Wails ni LMU. Los catálogos completos quedaron fuera del
repositorio; `real-bank.json` conserva sólo el resumen necesario.

## Resultado

| Fuente | Puente | Límites nuevos | Fuel/VE | Boxes |
|---|---|---|---|---|
| S125 | alineado | `pit@2893.76` | 25/25 de 39 vueltas | 1 cerrado |
| S266 | alineado | `pit@13580.36` | 58/58 de 71 vueltas | 1 cerrado + 1 abierto |
| S026 | alineado | `pit@9149.8`, `pit@12158.9` | 53/53 de 61 vueltas | 1 cerrado + 1 abierto |

Frente a T19a, S125 pierde `fuel_jump@3022.54`; S266 pierde
`fuel_jump@13421.12` y `fuel_jump@16840.14`; S026 conserva sus dos límites
correctos. El banco detectó además que un repostaje dentro del estado inicial
`In Pits=true` aún producía un límite: la regresión falló primero y quedó
corregida para exigir una entrada a boxes observada.

S125 cubre toda la ventana de vueltas dentro de la tolerancia declarada. Los
huecos de S266 (118.533 s) y S026 (21.153 s) comienzan después de su último
evento `Lap`; son colas reales de grabación y no el desfase de origen de T19a.
Las visitas finales abiertas conservan inicio, final ausente, duración 0 como
no disponible y `open_pit_lane_interval`; no publican recursos ni tasas.

## Integridad y ejecución

Los tres hashes SHA-256 coinciden antes y después y ningún original creó
`.wal`; los valores completos están en `real-bank.json`. Los pases finales de
importación productiva y exportación saneada tardaron 5.57 s, 6.72 s y 5.16 s.
El banco reutiliza el modelo ya importado y admite `ISA1208_IMPORT_ONLY=1` para
separar esta prueba de la preparación del editor de correcciones.

Un segundo pase independiente produjo exactamente los mismos bytes de catálogo
para las tres fuentes: `caa49da1…d611` (S125), `d9e3230f…8d1f` (S266) y
`27cd47f…3421` (S026). El recorrido completo S125→S026 pasó en 65.41 s y
conservó la igualdad entre identidad importada y revisión nativa. Esta prueba
de replay cubre importación y derivaciones; no atribuye a S266 un roundtrip de
correcciones que su presupuesto actual impide.

La ruta completa de correcciones supera su presupuesto con S266 y el conjunto
actual de canales. No se relajó ese límite dentro de #1208; queda aislado en
#1210. No afecta al parser, al importador ni a la prueba temporal de este corte.

## Checks

- `go test ./internal/telemetryanalysis/... -count=1`: PASS.
- `go test ./internal/strategy/... -count=1`: PASS.
- `go test ./internal/... -count=1`: un fallo temporal ajeno en el presupuesto
  de commit SQLite; su repetición focal pasó en 0.25 s.
- `pnpm --dir frontend build`: PASS; se generó sólo el embed web, sin build de
  escritorio. Se mantiene el aviso conocido de chunks mayores de 500 kB.
- `go test ./... -count=1`: PASS en la repetición global con el embed presente.
- `go vet ./...`: los únicos tres fallos son avisos `unsafe.Pointer` heredados
  en `reader_windows.go:85`, `version_windows.go:433` e
  `icon_windows.go:553`; los paquetes modificados ya pasaron vet focal.
- Banco real final S125/S266/S026: PASS; hashes y WAL verificados.
