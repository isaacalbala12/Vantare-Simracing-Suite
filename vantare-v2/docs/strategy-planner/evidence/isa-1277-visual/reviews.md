# ISA-1277 · revisión visual adversarial

## Resultado final

- Pasada aceptada: `pass-23`.
- Cobertura: 18 pantallas principales y 72 capturas responsive.
- Idiomas: ES, EN, PT e IT.
- Anchuras cubiertas: 320, 768, 1024 y 1672 px según la familia.
- Mínimo principal: 9,1/10.
- Mínimo responsive: 9,1/10.
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
`pass-23/responsive.json`.

## Límite de la evidencia

El harness monta los componentes React productivos y fija respuestas para que
las capturas sean repetibles. No abre Wails ni archivos DuckDB y no acredita el
reader, LMU, persistencia nativa, licencia, precisión física o distribución.
Esos gates permanecen en T22.
