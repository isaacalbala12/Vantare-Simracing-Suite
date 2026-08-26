# TA-04A — evidencia espacial LMU y contrato puro

Estado: candidata local implementada y revisada; `GO` para
vuelta/progreso/ancla y `NO-GO` para geometría/anchura. La evidencia sanitizada
vive en `ta04a-spatial-evidence.md`. Sin sección visual.

## Contexto y autorización transitoria

TA-04A continúa sobre `work/ta04a-spatial-evidence` desde `0dd44807689f4e788e3d6aab8cd949997dc82a10`. Isaac autorizó de forma expresa y temporal continuar evidencia y código no visual sin crear Linear y documentar las issues para crearlas al final. Esta excepción no autoriza push, PR, CI remoto, merge o promoción: antes de cualquiera de esas acciones hay que crear/recuperar la issue, registrar la rama y actualizar el handoff.

TA-03F sigue candidata local. Sus smokes manuales de rollback, uninstall y Windows 10 se difieren a una VM sacrificable; no bloquean la evidencia local de TA-04A, pero sí siguen abiertos para packaging/release. TA-04A adopta retención efímera cerrada: la copia privada solo existe durante la observación puntual, se elimina y verifica en la misma sesión y nunca se incorpora al repositorio. Cualquier necesidad de conservarla exige parar y aprobar otro contrato.

## Objetivo

Decidir, mediante evidencia autorizada y sanitizada, si el histórico DuckDB de LMU demuestra un contrato espacial suficiente para futuras vueltas, progreso y geometría. TA-04A produce únicamente reglas, estados de capacidad y un contrato Go puro propuesto; no calcula un delta, no publica un mapa y no crea una vista.

Los candidatos ya inventariados son `Lap Dist`, `Total Dist`, `Path Lateral`, `Track Edge`, `GPS Latitude`, `GPS Longitude`, `GPS Time` y el evento `Lap`. Sus nombres, unidades y frecuencias no prueban semántica, origen temporal, resets, longitud o sistema de coordenadas.

## Alcance y stop obligatorio

Permitido en la futura implementación, tras GO y una issue:

- ampliar solo `internal/telemetryanalysis` con tipos puros de capacidad, progreso, límites de vuelta y geometría;
- tests deterministas, fuzz y benchmark de datos sintéticos derivados de las reglas demostradas;
- documentación y evidencia sanitizada.

Prohibido en TA-04A, incluso si la evidencia es positiva:

- `frontend/`, Wails, SSE, rutas, bindings, ViewModels o CSS;
- mapa, gráfico, cursor, scrubbing, zoom, captura de pantalla o captura de mapa; no hay excepción de preview;
- comparador, malla de distancia, delta, coaching, Strategy, Telemetry Core, reader adicional, persistencia, imports externos o dependencias nuevas;
- conservar/versionar DB, muestras, GPS crudo, rutas, identificadores, metadatos sensibles o secretos.

**STOP:** al cerrar el contrato puro se detiene el trabajo. TA-04B es un corte separado para una captura técnica visual estática, con issue, plan y revisión propios. La interacción y el renderizado de producto siguen perteneciendo a TA-07; el comparador/delta pertenece a TA-06.

## Protocolo de consentimiento, privacidad e integridad

1. El operador confirma explícitamente una observación puntual y local de una grabación LMU ya finalizada. Sin consentimiento: NO-GO, sin abrir datos.
2. Discovery TA-02/TA-03E enumera metadata; se exige ausencia de `.wal`, ventana de estabilidad, identidad regular y capability autorizada. Nunca se abre un WAL, se fuerza checkpoint o se accede por ruta de consumidor.
3. El reader TA-03E/TA-03C usa staging privado y read-only. Se comprueba la evidencia del original antes y después; ninguna operación escribe, mueve o renombra la biblioteca LMU.
4. Solo se registran reglas, presencia, conteos, rangos/agregados y hashes necesarios para reproducir la decisión. No se imprimen ni guardan valores, coordenadas, timestamps, rutas, nombres, IDs, setup o metadata sensible.
5. La copia privada se elimina al acabar. Si la retención es necesaria para repetir pruebas, parar y definir primero el contrato de retención, finalidad, ubicación, plazo y borrado verificable.

## Evidencia requerida y decisión

La evidencia debe demostrar, no inferir por nombres:

| Pregunta | GO solo si | NO-GO si |
|---|---|---|
| Límite de vuelta | `Lap` tiene transición reproducible y se relaciona con reset/continuidad de `Lap Dist`. | Falta transición, es ambigua o no se alinea de forma demostrable. |
| Progreso y longitud | `Lap Dist` es finito, monotónico dentro de una vuelta válida, define reset y permite una longitud compatible. | Hay regresión, salto, calidad insuficiente o longitudes incompatibles sin regla demostrada. |
| Ancla temporal | Existe regla verificable entre continuas de frecuencia implícita y eventos/GPS timestamped. | Solo coincide índice, frecuencia o primera muestra; eso no es ancla. |
| Geometría | GPS se vincula a progreso con sistema/proyección, cierre y calidad demostrables. | No se puede vincular GPS a progreso o no se conoce el sistema de coordenadas. |
| Anchura | Cobertura y confianza por tramo están demostradas. | `Track Edge` es solo escalar o semántica desconocida: publicar anchura `unknown`. |

Un NO-GO no es fallo: conserva `distance_pending` o `incompatible` y prohíbe un fallback temporal silencioso. Solo GO en una fila habilita su familia; no habilita las demás por asociación.

## Contrato y pruebas previstos

Archivos previstos exclusivamente tras GO y issue: `internal/telemetryanalysis` (contrato puro y tests), este plan, `historical-model.md`, el handoff y `current-plan.md`. No se prevén archivos frontend ni productivos visuales.

El contrato debe incluir calidad/procedencia/versionado y representar:

- frontera de vuelta, progreso `s`, longitud y discontinuidad;
- capability independiente por progreso, ancla temporal, GPS, geometría y anchura; ausencia explícita, no cero estimado;
- geometría por tramo con confianza/cobertura, nunca ancho global inventado.

Primero RED con datos sintéticos: vuelta válida, reset, progreso monótono, regresión, discontinuidad, longitud incompatible, calidad missing/invalid, GPS no alineado y cursor por progreso puro. Añadir fuzz para NaN/Inf, índices y secuencias inválidas, y benchmark paginado representativo. Checks esperados: `go test ./internal/telemetryanalysis -count=20`, `go test -race ./internal/telemetryanalysis -count=10`, benchmark TA-04 real, `go test ./... -count=1` y `git diff --check`. Ningún test usa una grabación personal como fixture.

## Secuencia y cierre

1. Confirmar la excepción temporal sin Linear y mantener la rama local sin acciones externas; la issue se crea al final antes de push/PR/promoción.
2. Revisar consentimiento y retención efímera; sin ambos, detener en protocolo/NO-GO.
3. Ejecutar la observación puntual, sanitizar la evidencia y decidir GO/NO-GO por cada familia de la tabla.
4. Si GO, implementar solo contrato puro y pruebas; si NO-GO, documentar el estado y no crear aproximaciones.
5. Hacer review independiente, actualizar handoff/Linear/current-plan y dejar la rama en review. No hay promoción automática.

Delegación futura de TA-04A no visual: **DeepSeek V4 Flash**, un solo worker y sin subdelegación. **STOP visual:** TA-04B y cualquier captura, mapa o UI se entregan mediante el MCP de T3 Code a **Claude Opus 5 con razonamiento low**. Este plan no delega ni autoriza acciones externas.

## Resultado de ejecución

La primera observación autorizada fue insuficiente. Isaac amplió después el
consentimiento a las grabaciones finalizadas necesarias. Una segunda candidata
multivuelta, procesada por la pila productiva, demostró un snapshot inicial no
autoritativo, 70 eventos alineados con 70 resets, 71 segmentos, 69 completos y
un ancla `GPS Time` estable. Los guards de
estabilidad/WAL, integridad PRE/POST, runtime, reader, Close→Cleanup y eliminación
de temporales pasaron en cada lectura.

El paso 4 quedó implementado en `internal/telemetryanalysis/spatial.go` con
tests table-driven, fuzz y benchmark sintéticos. La revisión cerró cobertura
temporal completa, OLS, cardinalidad snapshot+resets, dos vueltas completas
mínimas, parciales honestos, tolerancias inmutables, overflow y receivers
fabricados. Geometría sigue `NO-GO` por datum no demostrado y anchura por
semántica/fórmula no demostrada. TA-04B permanece bloqueada y no se inicia.

Checks finales: focal x20, race UCRT64 x10, vet, ambos fuzz, benchmark paginado,
build frontend, suite Go global con `CGO_ENABLED=0` y `git diff --check` pasan.
Las revisiones independientes de especificación y calidad terminan `APPROVE`
sin P0–P3 razonables.
