# ISA-1375 — primer corte de memoria de preparación registrada

Estado: mejora local acotada; la preparación de resistencia con memoria independiente de la duración sigue abierta. Rama `vantareapp/isa-1375-strategy-bounded-corrections`, sobre el presupuesto medido de #1210. No se abrió la aplicación ni se intervino LMU.

## Hallazgo y cambio

`ReadCorrectionInput` reúne páginas nuevas del parser y las conserva. `BuildTemporalAlignment` copiaba en profundidad todas esas páginas antes de alinear el reloj GPS y calcular la validez. El lector de correcciones ahora usa una variante interna que alinea sus páginas propias; el API público mantiene la copia profunda y su aislamiento. No cambian el conjunto de canales, las cuotas, las correcciones, los umbrales, la procedencia ni el DuckDB original.

El siguiente coste sigue presente: `ReadCorrectionInput` retiene las páginas completas; el puente GPS crea un mapa de todos sus índices; la derivación de una revisión vuelve a construir la alineación y `ApplyMixedCorrectionSnapshot` crea una vista corregida. Por ello este corte elimina una copia, pero **no** es procesamiento por streaming ni acredita una carrera de 24 h. La issue exige caracterizar esas dependencias y documentar una decisión arquitectónica antes de cambiar el pipeline.

## Banco real y memoria

Fuente S266 Algarve carrera, 187.297.792 bytes, SHA-256 `6b912640e5b68da087fbe86ce70401101edbdc89cb89cb93df30c9ef396d9362`; objetivo de clasificación S026 Monza, SHA-256 `08a1e626d7154becd493aa84addbf146cc7f0f229c8a7aa39664766813495538`. El banco opt-in Go usa el parser y las rutas productivas con authorizer de prueba y runtime confiado; no es una prueba Wails/distribución.

La misma prueba se compiló como binario de test en cada worktree y se ejecutó tres veces por versión, alternando versiones, con muestreo de `WorkingSet64` del proceso cada 200 ms. No hubo otras mediciones de rendimiento deliberadas. Picos observados en MiB:

| Pasada | Antes (#1210) | Con alineación propia |
| --- | ---: | ---: |
| 1 | 855,1 | 820,2 |
| 2 | 790,2 | 772,1 |
| 3 | 772,4 | 765,7 |

Las seis pruebas pasaron. La oscilación entre pasadas es grande y el proceso incluye importación, preparación, varias correcciones, proyección y cálculo; estos picos no aíslan el ahorro de la alineación ni justifican afirmar un porcentaje de mejora. Las dos versiones dieron ritmo seco válido 95,190 s (N=58), Fuel válido 2,135 L/vuelta (N=58), VE LMP2 no aplicable y 38 vueltas/0 paradas con `optimality=proven` para el **evento supuesto** del banco. Ambos originales mantuvieron sus hashes. Los archivos de salida de estas seis ejecuciones quedaron bajo `C:\tmp\isa1210-real-bank*.log` y `C:\tmp\isa1375-real-bank*.log`, fuera del repositorio.

## Gates y siguiente corte

Regresión focal de alineación pública/propia y lectura acotada: PASS. `go test -p 1 ./internal/telemetryanalysis ./internal/app -count=1`: PASS. Build frontend previo para assets Go embebidos: PASS. `go test -p 1 ./... -count=1`: PASS. No se tocaron archivos frontend. Falta prueba nativa, fuente de resistencia más larga, presupuesto de memoria que no crezca con la duración y paridad de correcciones/proyección bajo un lector realmente incremental. Sin push, PR, CI remota, merge, promoción ni release.
