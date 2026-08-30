# ISA-944 · coste marginal del sensor

- SHA: 155476198f16c4b0c9cc76be325bb945c7f78738
- Escena: LMU abierto; misma sesión durante OFF y ON.
- Nivel fijo: 5 mediante VANTARE_PERF_LEVEL; el log ON se valida sin niveles 1/2/3/4.
- Muestras: 60 ventanas de CPU de 1 s por condición, tras 10 s de calentamiento; el tiempo de pared incluye el inventario del árbol entre ventanas.

| Condición | CPU media (%) | CPU p95 (%) | Private MB media |
| --- | ---: | ---: | ---: |
| Sensor OFF | 1.8917 | 2.7364 | 267.36 |
| Sensor ON | 2.0637 | 2.8979 | 275.32 |

CPU incluye el árbol completo de la app; ON incluye su PresentMon propio. Datos crudos: samples.csv.

Delta ON − OFF: 0.1720 puntos de CPU media (+9.09 % relativo), 0.1615 puntos de CPU p95 (+5.90 %) y 7.96 MiB privados (+2.98 %). El log ON contiene 109 decisiones, todas en nivel 5; 108 incluyen frametime LMU y la primera declara `unavailable` durante el arranque de PresentMon.

Al cerrar no quedó ningún `vantare-*.exe` ni sesión `VantareSensor-*`. El único PresentMon restante es el de Radeon (`RSXTraceSession`), que no fue tocado.
