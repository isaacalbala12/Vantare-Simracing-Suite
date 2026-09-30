# ISA-1246 — orden fijo y selección libre

## Resultado

La variante de CalculateOrbit acepta `driverOrderMode`. Ausente o `fixed`
conserva la rotación cíclica anterior. `free` conserva `order` como conjunto de
candidatos y transporta sus perfiles, pero no crea `DriverSequence`: SolverV2
elige pilotos y puede omitirlos salvo que una restricción explícita exija su uso.

La publicación usa el piloto resuelto antes de calcular su ritmo y distribución.
El modo libre no fuerza una parada por candidato. Un modo desconocido, candidatos
duplicados o cualquier override de stint libre fallan de forma explícita.

## Evidencia

- RED: el contrato no representaba el modo y el test Go no compilaba.
- GREEN: con cuatro vueltas y dos candidatos, libre elige al rápido en un stint;
  incluso situado segundo, y publica su ritmo; ausente y `fixed` conservan dos
  stints. `minLaps` obliga al lento cuando aplica.
- El mismo roster libre atraviesa el cálculo meteorológico completo sin recuperar
  una secuencia ni una parada artificial.
- El mapper conserva dos perfiles y omite la secuencia sólo en libre.
- El cliente TypeScript transporta `driverOrderMode: free` sin alterar el evento.
- Frontend completo: 448 archivos y 3820 pruebas; typecheck, lint, auditoría
  i18n y build pasan. El build conserva sólo el aviso heredado de chunks grandes.
- `go test ./...` y el vet focal de Strategy, Analysis y `cmd/vantare` pasan.
- Los 21 tests del contrato de roadmap pasan; digest estable y diff-check limpio.
- Astra encontró y cerró tres falsos seguros en horizonte temporal, overrides y
  publicación. La revisión final no encuentra P0-P2 y recomienda este límite.

## Límites

El selector recorded y el soporte libre para carreras temporales se conectan en
T15. El resolvedor temporal actual valida cada horizonte provisional como una
distancia final; por eso `free` falla explícitamente en vez de publicar falsos
inviables con límites por vuelta. #1247 conserva ese trabajo. No cambia
`document.Variant` ni SolverV2. No se
abrió app/Wails/LMU ni se tocaron DuckDB.
