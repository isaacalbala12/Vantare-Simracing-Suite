# ISA-738 Qt Standings fixed slots v1

Experimento aislado. Wails continúa siendo el único runtime Redline principal;
este candidate Qt no se integra en producto ni cambia el Telemetry Core.

El cambio sustituye la recreación de listas QML por pools acotados y crecientes
de bloques y slots visuales. Los mismos objetos se reutilizan al reordenar las
filas; no se añadieron threads, sidecar, IPC, shaders, `QQuickItem` custom ni
dependencias.

## Resultado stress104

Tres repeticiones seriales antes y después, con el mismo Qt 6.10.2, host,
corpus de 250 snapshots y 104 filas:

| Corte | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| Base `a76d0b64` | 9.0225 | 310.8921 | 651.4028 |
| Slots `a7aa4e35` | 11.0424 | 18.3418 | 195.4381 |
| Delta | +22.39 % | -94.10 % | -70.00 % |

El resultado es materialmente mejor, pero sigue fallando el gate stress
artificial de p95 <= 8 ms y max <= 16.67 ms. Sin contar los cinco primeros
snapshots de calentamiento, el corte de slots mide p50 11.041 ms, p95 18.287 ms
y max 32.541 ms. No se relaja el gate ni se presenta como paridad productiva.

La latencia desde inicio de apply hasta la primera presentación observable
también mejora: p50 39.48 -> 20.98 ms y p95 657.96 -> 35.25 ms. La base solo
alcanzó primera presentación en 52 frames de las tres ejecuciones; slots la
alcanzó en 496, por lo que esta comparación se conserva como diagnóstico y no
como un gate de pacing independiente.

## Escenarios canónicos con slots

Tres repeticiones por escenario:

| Escenario | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| enter | 1.3391 | 2.8123 | 44.6725 |
| full | 1.5353 | 3.1178 | 40.2784 |
| overtake | 1.5200 | 2.8672 | 48.0895 |
| retirement | 1.3475 | 2.6577 | 53.8382 |

El régimen normal conserva p95 menor de 3.2 ms. Los fallos restantes del
agregador son picos aislados de arranque/animación; `retirement` supera además
el umbral hitch de 50 ms por un máximo de 53.84 ms.

## Custodia local

- Base raw: `C:\tmp\isa738-baseline-20260821172127`.
- Slots stress raw: `C:\tmp\isa738-fixed-slots-20260821172639`.
- Slots canonical raw: `C:\tmp\isa738-fixed-slots-canonical-20260821172904`.
- Corpus stress raw: `C:\tmp\isa738-stress-20260821172127`, replay SHA-256
  `4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a`.
- Base summary SHA-256:
  `c085304c7d52a24ccf43275c9fe6944093d75917668a95e29d8c58382b8624fd`.
- Slots stress summary SHA-256:
  `75a232566e1339c8f311ae5550cb00175b8e61035018812fc1b6fc9f00e8d573`.
- Slots canonical summary SHA-256:
  `81b2736a81ce786800457526f17922aab4a177bd4f39dc0369892e7f30446b8c`.
- Candidate EXE SHA-256:
  `7791f6c44bab8efbf1f87715548c665074d02b26b23e485dc232aad8c2dcad93`.

Los manifests raw conservan SHA-256 de cada trace. Los raw no se versionan.

## Gates

- RED: el reordenamiento destruía los tres objetos visuales observados.
- GREEN: los tres slots conservan identidad y actualizan sus datos.
- Standings Python/PySide: 8/8 PASS, incluido comportamiento y render offscreen.
- Qt 6.10.2 Release build: PASS.
- CTest core, Delta/Pedals y motion trace: PASS.
- CTest Relative: proceso termina sin salida en este host al repetirlo; no se
  tocó Relative y el fallo se conserva como límite, sin ampliar alcance.

Conclusión: **GO como arquitectura mínima de laboratorio; NO GO para sustituir
Wails ni promocionar Qt**. Otro rediseño no se justifica en ISA-738 sin una
decisión nueva.
