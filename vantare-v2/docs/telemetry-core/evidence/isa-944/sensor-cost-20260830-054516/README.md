# ISA-944 Â· coste marginal del sensor

- SHA: 1940dfa0e6f98770599aff52f6a09405bab0b782
- SHA-256 del ejecutable: f8515d11db51f522d75985ce3e963ac6927c2fb7f88ccb86ef3983fbc16ff231
- Escena: LMU abierto; misma sesiÃ³n durante OFF y ON.
- Nivel fijo: 5 mediante VANTARE_PERF_LEVEL; el log ON se valida sin niveles 1/2/3/4.
- Muestras: 60 ventanas de CPU de 1 s por condiciÃ³n, tras 10 s de calentamiento; el tiempo de pared incluye el inventario del Ã¡rbol entre ventanas.

| CondiciÃ³n | CPU media (%) | CPU p95 (%) | Private MB media |
| --- | ---: | ---: | ---: |
| Sensor OFF | 1.9459 | 2.6849 | 272.28 |
| Sensor ON | 2.0896 | 2.9365 | 276.94 |

CPU incluye el Ã¡rbol completo de la app; ON incluye su PresentMon propio. Datos crudos: samples.csv.

Delta ON âˆ’ OFF: 0.1437 puntos de CPU media, 0.2516 puntos de CPU p95 y 4.66 MiB privados.
