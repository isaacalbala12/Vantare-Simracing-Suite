# TA-04E — evidencia sanitizada de reconstrucción local

Estado: pase pre-registrado cerrado el 2026-08-12. Resultado: **`NO-GO` para
mapa local técnico** por repetibilidad rígida insuficiente. El análisis lateral
exploratorio también queda `NO-GO`. No hubo superficie visual.

## Método y custodia

El protocolo de
`ta04e-local-track-reconstruction-plan.md` se congeló antes del pase final. Se
usó discovery autorizado y la pila productiva privada/read-only. La selección
se detuvo en el primer grupo compatible; no se buscaron recordings con un
resultado más favorable después de calcular los gates.

- discovery: 347 artifacts; 318 estables;
- recordings inspeccionados: 6;
- recordings con al menos tres vueltas completas: 5;
- primer grupo compatible: 2 recordings, con 58 + 23 = 81 vueltas;
- cobertura exacta de los cinco canales requeridos: 100 %.

No se conservaron ni versionaron bases, rutas, nombres, identificadores,
timestamps, coordenadas, valores por muestra o metadata sensible. Integridad
PRE/POST, lectura read-only, Close→Cleanup, eliminación de staging/temporales y
auditoría de privacidad: **PASS**.

## Pase confirmatorio pre-registrado

| Gate | Resultado sanitizado | Umbral | Decisión |
|---|---:|---:|---|
| `Total Dist` frente a `Lap Dist` | error relativo p50/p95/p99 = 0,00000168 / 0,00000677 / 0,00000799; 100 % `<= 0,003` | 100 % `<= 0,003` | PASS |
| Dispersión robusta de escala | 0,000405 | compatibilidad con longitud TA-04A | PASS |
| Error leave-one-out de longitud | p50/p95/p99 = 0,000287 / 0,001701 / 0,002577; 100 % `<= 1 %` | 100 % `<= 1 %` | PASS |
| Residual rígido | recording p95 = 7,11 / 6,03 m; p99 = 13,75 / 8,14 m; 50/81 vueltas (61,73 %) cumplen conjuntamente p95 `<= 5 m` y p99 `<= 10 m` | `>= 80 %` de vueltas y al menos 3 por recording cumplen ambos límites | **FAIL** |
| Cierre | p50/p95/p99 = 7,77 / 14,27 / 16,85 m; thresholds dinámicos = 18,83 / 18,89 / 18,89 m; 100 % dentro | 100 % dentro | PASS |

El pase confirmatorio es conjuntivo. Cuatro familias compatibles no compensan
el 61,73 % de vueltas del gate rígido conjunto frente al mínimo pre-registrado
de 80 %. El cierre
dentro de su threshold dinámico demuestra bucles cerrados bajo esa métrica,
pero no prueba repetibilidad local a 5 m. Por tanto el resultado técnico sigue
siendo `NO-GO`; no se recalibra el umbral después de observar los residuales.

## Exploración lateral descriptiva

Esta sección se ejecutó y evaluó separadamente del pase confirmatorio. Sus
números son descriptivos, no evidencia confirmatoria ni un camino alternativo
a `GO`.

- recordings observados: 9;
- recordings elegibles: 8;
- vueltas incluidas: 269;
- bins con observaciones en ambos lados: 86,125 % (requerido `>= 95 %`):
  **FAIL**;
- mínimo de observaciones por lado: 1 (requerido `>= 5`): **FAIL**.

El envelope lateral empírico no alcanza cobertura ni densidad mínimas. Además,
TA-04C no demuestra que estas señales sean bordes físicos. Resultado:
`NO-GO` para envelope/anchura; no se produce curva, borde, polígono ni ancho.

## Decisión y capacidades

| Capacidad | Estado tras TA-04E | Consecuencia |
|---|---|---|
| `metric_progress` / `length` | `valid`, ya demostrado por TA-04A | se conserva; TA-04E no lo revoca |
| `local_shape` | `unknown` | no mapa local ni captura técnica |
| `empirical_edge_envelope` | semántica `unknown`; uso actual `incompatible` | no bordes ni envelope de producto |
| geolocalización absoluta | `unknown` | datum/CRS continúa `NO-GO` |
| anchura física | `incompatible` | fórmula y ambos bordes continúan sin contrato |

TA-04E no cambia el `NO-GO` de TA-04C para datum/geolocalización absoluta. Una
forma local repetible tampoco habría demostrado posición absoluta; en este pase
ni siquiera se supera el gate rígido requerido para `local_shape`.

## Siguiente investigación sin relajación a posteriori

Documentar TA-04F: **«caracterizar el umbral de repetibilidad local de 5 m
frente a variación de sensor, piloto y trayectoria»**. Debe usar una resolución
pre-registrada nueva y un holdout independiente/nuevas grabaciones, o una fuente
oficial que justifique otro contrato. TA-04F no reetiqueta TA-04E como `GO` ni
selecciona retrospectivamente un threshold que haga pasar ese 61,73 % de
vueltas.

Orden operativo al recuperar Linear: crear o recuperar TA-04C; crear TA-04E
vinculada a TA-04C y a esta rama/commit; después crear TA-04F. TA-04B permanece
bloqueada y no se delega a Claude.

## Verificación documental

- agregados cotejados contra el protocolo pre-registrado: PASS;
- separación confirmatorio/exploratorio: PASS;
- búsqueda de afirmaciones post hoc de `GO`: PASS;
- privacidad, integridad y cleanup: PASS;
- revisión de coherencia y `git diff --check`: PASS antes del commit.

No corresponden tests Go/frontend, build, lint, captura o CI: TA-04E modifica
solo documentación y no cambia comportamiento de producto.
