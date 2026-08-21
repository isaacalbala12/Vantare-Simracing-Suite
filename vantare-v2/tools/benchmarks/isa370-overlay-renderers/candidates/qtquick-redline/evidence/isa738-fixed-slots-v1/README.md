# ISA-738 Qt Standings fixed slots v1

Experimento aislado. Wails continúa siendo el único runtime Redline principal;
este candidate Qt no se integra en producto ni cambia el Telemetry Core.

El cambio sustituye la recreación de listas QML por pools append-only cuyo
tamaño deriva del corpus cargado. Los mismos bloques, slots y `StandingsRow` se
reutilizan al reordenar, retirar, reintroducir o envolver filas en una batalla;
no se añadieron threads, sidecar, IPC, shaders, `QQuickItem` custom ni
dependencias. El candidate no impone un hard cap adicional: la custodia del
replay es la que acota este experimento a 104 filas.

## Resultado stress104

Tres repeticiones seriales antes y después, con el mismo Qt 6.10.2, host,
corpus de 250 snapshots y 104 filas:

| Corte | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| Base `a76d0b64` | 9.0225 | 310.8921 | 651.4028 |
| Filas retenidas `5fd1e63e` | 12.1078 | 19.2099 | 142.3159 |
| Delta | +34.20 % | -93.82 % | -78.15 % |

El resultado es materialmente mejor, pero sigue fallando el gate stress
artificial de p95 <= 8 ms y max <= 16.67 ms. No se relaja el gate ni se
presenta como paridad productiva.

La latencia desde inicio de apply hasta la primera presentación observable
también mejora: p50 39.48 -> 21.48 ms y p95 657.96 -> 34.41 ms. La base solo
alcanzó primera presentación en 52 frames de las tres ejecuciones; el nuevo
corte la alcanzó en 498, por lo que esta comparación se conserva como
diagnóstico y no como un gate de pacing independiente.

## Escenarios canónicos con slots

Tres repeticiones por escenario:

| Escenario | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: |
| enter | 1.3726 | 2.5234 | 39.8966 |
| full | 2.3281 | 5.3654 | 62.5849 |
| overtake | 1.5977 | 3.1109 | 48.0653 |
| retirement | 1.3836 | 2.5766 | 34.8491 |

El régimen normal conserva p95 menor de 5.4 ms. Los fallos restantes del
agregador son picos aislados de arranque/animación; `full` supera además el
umbral hitch de 50 ms por un máximo de 62.58 ms.

## Custodia local

- Base raw: `C:\tmp\isa738-baseline-20260821172127`.
- Filas retenidas stress raw: `C:\tmp\isa738-retained-rows-20260821174323`.
- Filas retenidas canonical raw: `C:\tmp\isa738-retained-canonical-20260821174433`.
- Corpus stress raw: `C:\tmp\isa738-stress-20260821172127`, replay SHA-256
  `4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a`.
- Base summary SHA-256:
  `c085304c7d52a24ccf43275c9fe6944093d75917668a95e29d8c58382b8624fd`.
- Filas retenidas stress summary SHA-256:
  `39b84e0c83ce8d922de3f0974a8a0c34b692001deb00dd2ba26b7c2f11a90111`.
- Filas retenidas canonical summary SHA-256:
  `7db87da94e26d878807357e083dfd6e53fa01d5121db9ed22455eb3ec7cc86af`.
- Candidate EXE SHA-256:
  `bb03bbf1e1cb3eff0eb3c556593beffdcb1c72a3519f7b5c28bdf0579d9273cc`.

Los manifests raw conservan SHA-256 de cada trace. Los raw no se versionan.

## Gates

- RED: el reordenamiento destruía los tres objetos visuales observados.
- GREEN: clase, slot y fila conservan identidad en reorder, shrink/grow y battle.
- Standings Python/PySide: 9/9 PASS, incluido comportamiento y render offscreen.
- Qt 6.10.2 Release build: PASS.
- CTest core, Delta/Pedals y motion trace: PASS.
- CTest Relative: proceso termina sin salida en este host al repetirlo; no se
  tocó Relative y el fallo se conserva como límite, sin ampliar alcance.

Conclusión: **GO como arquitectura mínima de laboratorio; NO GO para sustituir
Wails ni promocionar Qt**. Otro rediseño no se justifica en ISA-738 sin una
decisión nueva.
