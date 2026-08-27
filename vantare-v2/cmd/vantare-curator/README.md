# vantare-curator

Predigiere directorios locales de `CurationBundle v1` en el JSON compacto y
determinista que recibe el análisis editorial. No publica, firma ni envía
bundles a un LLM.

## Uso

La entrada separa físicamente las tres procedencias canónicas del ADR 0009:

```text
bundles/
  test/
  controlled-capture/
  production-community/
```

Cada árbol puede contener subdirectorios, pero solo ficheros regulares `.json`.
Un fichero en la raíz, otra procedencia, un symlink o una extensión distinta se
registra como rechazo motivado. La salida debe quedar fuera de la entrada para
que una segunda ejecución no ingiera el resumen anterior.

```powershell
go run ./cmd/vantare-curator --in C:\curation\bundles --out C:\curation\resumen.json
```

El resultado `vantare.curator.summary.v2` no contiene la hora de ejecución, usa
arrays ordenados en vez de mapas JSON y, con los mismos bytes de entrada,
produce los mismos bytes de salida. Incluye los rechazos, el dedupe por digest
semántico normalizado, las cohortes separadas por entorno, `k=3`, los clusters
y la versión/hash del motor F4-9.

## Semántica del resumen

- El digest semántico excluye `admin` y los identificadores de transporte
  `bundleId`; normaliza el orden de agregados y estrategias. Si varias
  instalaciones entregan el mismo payload analítico, se conserva una sola
  muestra pero se mantienen las credenciales administrativas estables
  (`deleteHash`) para comprobar instalaciones distintas en `k`; sus valores
  nunca aparecen en el resumen.
- Dos estrategias se agrupan cuando tienen el mismo número de stints y
  compuestos, y cada vuelta de parada difiere como máximo en una vuelta.
- El score llama a `internal/strategy/backtest.RunRace`; no replica fórmulas.
  Como `CurationBundle v1` no contiene ritmo, la métrica se declara
  normalizada a `1 s/vuelta` y usa únicamente la duración de pit observada.
  Si faltan datos suficientes, el candidato queda sin score y con motivo.
- Una combinación con menos de tres instalaciones conserva únicamente la
  cuenta de cohorte y el motivo `minimum_cohort_not_met`: sus métricas, pit y
  estrategias quedan suprimidos.
- Un perfil publicable agrega Fuel y Virtual Energy como mediana ponderada por
  vueltas, rango y muestra. Publica también la muestra/calidad de canal y la
  duración típica de pit como mediana ponderada por observaciones.
- Pace y `CombinedStintPaceCurve` quedan explícitamente no disponibles porque
  no forman parte de `CurationBundle v1`; el curador no inventa esos datos. El
  destino contractual continúa siendo `pilotprofile.v1`, que una fase
  posterior solo podrá materializar cuando disponga de las señales exigidas.
