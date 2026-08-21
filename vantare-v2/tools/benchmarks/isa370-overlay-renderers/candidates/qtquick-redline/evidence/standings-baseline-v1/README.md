# Qt Standings baseline v1

Baseline RED de T18 para GitHub #693. Se ejecutaron 10 repeticiones seriales
por escenario con Qt 6.10.2 x64 y el mismo binario candidate. `summary.json`
recalcula p50, p95 y máximo desde las 50 trazas raw y conserva el SHA-256 de
cada una.

| Escenario | Runs | Muestras | p50 ms | p95 ms | max ms | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| enter | 10 | 1090 | 1.40 | 3.28 | 61.27 | FAIL |
| full | 10 | 2500 | 1.60 | 37.69 | 80.75 | FAIL |
| overtake | 10 | 1150 | 1.68 | 38.65 | 56.41 | FAIL |
| retirement | 10 | 1090 | 1.31 | 2.98 | 50.12 | FAIL |
| stress | 10 | 2500 | 8.82 | 268.07 | 1001.93 | FAIL |

El perfil `stress` transforma de forma determinista `standings-full` a 104
filas y conserva los 250 snapshots y su cadencia. Dos generaciones separadas
produjeron el mismo replay SHA-256
`4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a`.
Es un gate fail-fast de Standings; no se presenta como el perfil simultáneo de
cuatro widgets, que sigue pendiente del sidecar integrado.

Custodia externa original:

- resumen 50 runs: `493D948DFA4886E330B12BCCE16C33D9BE22BDB62449CFA2BE3CB5A2940B6EBA`;
- manifest canonical: `C6B5174003C01EFDA1941EDDEB364970AE8FF86F93F9D945F1F2047FD1D65FDA`;
- manifest stress: `F302B7E427DD87A1B857539DB11B209F60D982C1431238C57F5B6A2BB96322C7`;
- candidate EXE: `755a84a5e8ead98b40206c510866527714e527d8d880c1a188e3f6bf40fcc00f`.

Las trazas raw permanecen en la custodia local indicada por ambos manifests;
no se versionan sus aproximadamente 9 MB. Los manifests versionados incluyen
nombre, tamaño y hash de cada trace, además de binario, corpus, Qt, entorno y
commit. El agregador independiente falla cerrado ante inventario, orden,
completitud o self-hash incorrectos.
