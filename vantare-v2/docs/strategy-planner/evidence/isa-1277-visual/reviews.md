# ISA-1277 · revisión visual adversarial

## Matriz v5 a 1280×720 y cierre del gate visual web (2026-09-26)

`pass-v5-25-responsive-final` amplía la matriz a 1280×720 y contiene 128
capturas del frontend productivo en harness. Son 20 combinaciones de cuatro
idiomas y cinco tamaños (320, 768, 1024, 1280×720, 1672), sin overflow,
errores de página ni foco perdido. La primera ampliación v5-24 mostró en
portugués el contador de correcciones pegado al botón de preparar revisión;
el corte final los apila con separación visible. La revisión adversarial
independiente puntuó el pase final con **mínimo 9,1/10**, sin P1/P2; sólo
permanece el P3 opcional de metadatos secundarios tenues en escritorio.
Test de Datos, build/typecheck, lint y diff check PASS.

El umbral visual >9 queda superado en el harness y se envió a Isaac el
conjunto para revisión. Falta su aceptación y prueba visual nativa. El
harness simula respuestas y no acredita Wails, lector DuckDB o precisión.

## Iteración v5 · umbral visual del harness (2026-09-26)

`pass-v5-23-mobile-final` contiene 99 capturas del frontend productivo en
harness, con ES/EN/PT/IT a 320/768/1024/1672 px. `responsive.json` registra
16 casos sin desbordamiento horizontal, error de página ni foco perdido.
En móvil, la elección Stint/Paradas ocupa una fila y conserva el selector de
la parada o stint concreto; el contexto compacto permite leer circuito y
coche en dos líneas. La entrada Manual tiene mayor presencia y las etiquetas
de los editores son más legibles. La revisión adversarial independiente con
GPT-6 Sol medium da **mínimo 9,1/10**, sin P1/P2 observables. Señala como P3
opcional algunos textos auxiliares tenues en escritorio.

Tests focales 11/11, auditoría i18n, typecheck/build, lint y diff check PASS.
Esto supera el umbral visual >9 del harness, pero no equivale a aceptación de
Isaac ni a paridad nativa Wails. El harness usa respuestas simuladas y no
demuestra DuckDB real, precisión del cálculo ni los gates E01–E08 de T22.

## Iteración v5 responsive y recuperación (2026-09-26)

La revisión independiente de `pass-v5-16-plan` puntuó como mínimo 7,4/10:
contexto cortado a 320 px, Manual poco accesible y editores a 768 px con
espacio mal aprovechado. Tras corregir entrada móvil, contexto apilado a
768 px y contexto plegable a 320 px, la revisión de `pass-v5-18-responsive`
subió a 8,1/10 y la de `pass-v5-19-context` a **8,4/10**. La última
señaló que el error de edición de parada sólo ofrecía volver a Plan.

`pass-v5-20-recovery` contiene 99 capturas del React productivo en harness.
El error de parada ofrece también recalcular la **estrategia base**; la
acción existente descarta el editor de parada y no reintenta sus restricciones.
Se conserva la distancia conocida en los estados parcial y error, sin dibujar
stints ni paradas inexistentes. En las 16 combinaciones ES/EN/PT/IT y
320/768/1024/1672 px, `responsive.json` registra cero errores, cero
desbordamientos y foco visible. Tests focales 11/11, auditoría i18n,
typecheck, lint, build y `git diff --check` PASS. La captura final no tiene
nueva nota independiente: **8,4/10 es la última nota verificada y T18 sigue
abierto**. Persisten densidad y texto auxiliar pequeño en editores de 320 px.

El harness usa respuestas simuladas. No demuestra cálculo con los valores
introducidos, DuckDB real, Wails ni aceptación nativa T22.

## Iteración v5 · Plan sin calcular (2026-09-25)

`pass-v5-16-plan` conserva 99 capturas. El Plan pendiente ya ocupa la mesa con
la distancia conocida de la carrera, una línea neutra entre salida y meta y
un aviso explícito de que todavía no existe una propuesta calculada. No dibuja
stints, paradas ni progreso inventados. Se revisaron las capturas de escritorio
ES, 1024 px PT y 320 px IT; la matriz de 16 combinaciones no registra errores
de página ni desbordamientos y mantiene el foco visible. La auditoría de
traducciones, el test de Plan, typecheck, lint y build pasan. La primera
recaptura se interrumpió mientras corrían checks de compilación en paralelo;
la repetición aislada terminó PASS.
La suite completa secuencial terminó PASS: 493 archivos, 4317 tests superados
y 2 omitidos.

Esta iteración elimina el gran vacío exterior del Plan pendiente, pero no tiene
una nueva puntuación adversarial independiente. La nota mínima vigente sigue
siendo 8,0/10 y **T18 permanece sin aceptar**.

## Corte v5 · 2026-09-25 · aceptación pendiente

`pass-v5-13` recoge 99 capturas del frontend productivo en el harness,
incluida la matriz ES/EN/PT/IT a 320, 768, 1024 y 1672 px. En las 16
combinaciones no se detectó desbordamiento horizontal ni error de página y el
foco se comprobó visible. La revisión adversarial independiente con GPT-6 Sol
medium no encontró P1/P2 visuales, pero la nota mínima por grupo es **8,0/10**:
entrada 8,5; preparación 8,5; fuentes 8,4; datos 8,3; plan 8,1
(sin calcular 7,8; calculado 8,4); stint/parada 8,2; responsive 8,0.
**Ninguna pantalla supera aún el umbral >9/10 de T18.**

Se corrigieron el solape de controles de fuentes a 320 px, la lectura de
vueltas y plan a 768 px y la partición de `.duckdb` a 1024 px. El pase 12
compacta el plan pendiente, diferencia mejor las referencias editables y da
44 px a campos y acciones móviles. Persisten detalles P3: vacío exterior del
plan sin calcular en escritorio, texto auxiliar tenue, saltos de nombres largos
y editores móviles extensos. Las dos capturas de contexto a 320 px muestran
ahora el título real del editor activo; el encuadre a media página de las
capturas de controles
procede del desplazamiento del banco, no demuestra un fallo de navegación de
la app. El nombre anónimo repetido de la captura de parada es un fixture y no
acredita un fallo con una fuente real. Esta evidencia no valida Wails, LMU,
DuckDB, persistencia nativa ni la precisión del cálculo. La referencia A4 que
sigue abajo es histórica y su 9,2/10 **no se hereda** para v5.

## Resultado histórico A4

- Pasada base aceptada: `pass-23`.
- Corrección nativa de fuentes aceptada: `pass-27-runtime-source-screen`.
- Recorrido adversarial y recuperación aceptados: `pass-28-computer-use`.
- Cobertura: 19 pantallas principales y 72 capturas responsive.
- Idiomas: ES, EN, PT e IT.
- Anchuras cubiertas: 320, 768, 1024 y 1672 px según la familia.
- Nota adversarial final: 9,2/10.
- Hallazgos pendientes: ninguno P0, P1 o P2.
- `responsive.json`: 16 combinaciones, sin diferencia entre ancho interior y
  contenido, sin overflow registrado, sin errores de página y con foco visible.

La revisión fue exclusivamente visual y separada de la implementación. La
pasada 23 recapturó la matriz tras reconciliar `nightly`: sus 90 PNG y
`responsive.json` son idénticos por SHA-256 a la pasada 22, por lo que heredan
sus puntuaciones aceptadas. El revisor adversarial confirmó la equivalencia y
volvió a comprobar `Creador de Contenido` completo en dos líneas, los cuatro
idiomas, el foco y la ausencia de desbordamientos.

## Puntuación de pantallas principales

| Pantalla | Nota |
|---|---:|
| Inicio | 9,2 |
| Combinación | 9,1 |
| Reglas | 9,2 |
| Pilotos | 9,1 |
| Sesiones | 9,1 |
| Carrera | 9,2 |
| Datos vacíos | 9,2 |
| Fuentes | 9,1 |
| Vueltas | 9,1 |
| Datos avanzados | 9,1 |
| Revisiones | 9,1 |
| Plan sin calcular | 9,2 |
| Plan calculado | 9,2 |
| Editor de stint | 9,1 |
| Editor de parada | 9,1 |
| Calculando | 9,2 |
| Cobertura parcial | 9,2 |
| Error | 9,2 |

## Puntuación responsive

| Familia y anchura | ES | EN | PT | IT |
|---|---:|---:|---:|---:|
| Inicio · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Inicio · 768 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Inicio · 1024 px | 9,2 | 9,2 | 9,1 | 9,1 |
| Inicio · 1672 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Plan · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Plan · 768 px | 9,2 | 9,2 | 9,2 | 9,2 |
| Plan · 1024 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Plan · 1672 px | 9,2 | 9,2 | 9,2 | 9,2 |
| Fuentes · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Fuentes · 768 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Vueltas · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Vueltas · 768 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Calculado · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Calculado · 768 px | 9,1 | 9,2 | 9,2 | 9,1 |
| Stint · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Stint · 768 px | 9,2 | 9,2 | 9,2 | 9,2 |
| Parada · 320 px | 9,1 | 9,1 | 9,1 | 9,1 |
| Parada · 768 px | 9,1 | 9,1 | 9,1 | 9,1 |

El artefacto verificable de geometría y runtime es
`pass-28-computer-use/responsive.json`.

## Corrección tras preflight Wails

La biblioteca de fuentes dejó de ser un drawer y ahora ocupa una pantalla A4
completa. El flujo repite automáticamente la observación de estabilidad sin
debilitar la protección del archivo activo. `pass-27-runtime-source-screen`
recaptura 91 imágenes, incluida la entrada real desde «Elige tu combinación»,
y su `responsive.json` no registra overflow ni errores.

La revisión adversarial final se ejecutó con GPT-5.6 Sol medium y abrió los 91
PNG completos por separado. Puntúa el conjunto 9,2/10, sin P0/P1/P2. Como P3
deja el tamaño táctil ajustado de algunos controles a 320 px y la partición
legible de nombres largos de archivo en dos líneas.

## Recorrido Computer Use

`pass-28-computer-use` incorpora 94 PNG: las 91 vistas anteriores y tres
regresiones. La lista integrada de sesiones a 1208 px separa nombre, fecha,
tamaño y estado; el error de una parada inviable conserva «← Plan»; al volver,
Plan muestra «Reintentar cálculo». Computer Use verificó además el flujo manual
de guardado y adopción de una corrección de vuelta antes de calcular. Las tres
capturas nuevas se inspeccionaron completas y no presentan P0/P1/P2.

## Límite de la evidencia

El harness monta los componentes React productivos y fija respuestas para que
las capturas sean repetibles. No abre Wails ni archivos DuckDB y no acredita el
reader, LMU, persistencia nativa, licencia, precisión física o distribución.
Esos gates permanecen en T22.
