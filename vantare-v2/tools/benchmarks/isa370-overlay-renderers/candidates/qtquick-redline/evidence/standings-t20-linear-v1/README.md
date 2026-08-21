# Qt Standings T20 linear overtake experiment v1

Evidencia rechazada de T20 para GitHub #693. El cambio `fca5d9d3`
reemplazó la búsqueda anidada de la primera pareja de adelantamiento por un
índice lineal por clase/posición. Conservó el contrato observable y pasó
Standings 8/8, fresh build Qt 6.10.2, CTest 4/4 y `qmllint`.

Se ejecutaron 10 repeticiones seriales nuevas de `stress104` con el binario
construido desde `30ad035b`. El resultado no mejoró T18 y permanece FAIL:

| Evidencia | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| T18 baseline | 8.8172 | 268.0703 | 1001.9299 |
| T20 linear | 9.2699 | 330.7235 | 1203.6608 |
| Delta | +5.13% | +23.37% | +20.13% |

Por tanto el cambio se revierte: no se conserva código adicional sin señal
física favorable. Esto no demuestra que el índice lineal sea intrínsecamente
más lento; demuestra que no reduce el gate end-to-end de este corpus y host.
El coste dominante permanece en la reconciliación QML síncrona.

Custodia externa:

- resumen: `133FC6D6F03915D43520A8C5DA4B23EF79A5C3787508DA55AC5CE98523D682A2`;
- manifest: `455E0C95745690D366EF9BA91804D4801C062D9E2B31E6CC4DF06F2BEEBE1736`;
- candidate EXE: `01e6238c57bcf58f44f4714bd90e3f016288fe23329ecc94e7400bae414a9951`;
- replay stress: `4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a`.

Las 10 trazas raw permanecen en
`C:\tmp\isa693-qt-standings-t20-linear-v1`; no se versionan. El manifest
incluye nombre, tamaño y SHA-256 de cada una.
