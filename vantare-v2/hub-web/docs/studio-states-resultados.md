# Studio A · estados · resultados

VANTA-138 / #1995 / #2244. Diff exclusivo de estados sobre el squash de catálogo
`a6aec1836`; Apariencia y En pista proceden de nightly. Se conservan el catálogo,
MoreMenu, nombre accesible de Añadir y StudioSteps con su modo readOnly.

## Revisión resuelta

- Recargar solicita studio.get y restaura el foco después del commit de React:
  fila seleccionada, primera fila o lista vacía; si falta el núcleo, su aviso.
- El fallo de lectura inicial sustituye el esqueleto por error y recarga real.
  La protección y su recarga no desaparecen al coincidir con un fallo.
- Solo un anuncio Cargando; todos los textos están en i18n/studio.ts.
- Tests de conflicto CAS, límite, plan sin verificar y Solo lectura en la tira.
  Chromium de CI comprueba el compacto real, sin manipular hidden, y el foco.

## Tabla visual final

156 pares: trece escenas, tres tamaños, dos temas y dos estados de la barra.
Porcentaje perceptual de ventana completa; no es un porcentaje aislado de estados.
125 % es estrés QA del viewport (1440×900 físicos), no cambia el techo del producto.

| Tamaño   | Estado    | Oscuro plegada | Oscuro abierta | Claro plegada | Claro abierta |
| -------- | --------- | -------------: | -------------: | ------------: | ------------: |
| 1440-900 | vacio     |         2,70 % |         6,66 % |        2,83 % |        8,74 % |
| 1440-900 | protegido |         7,76 % |        11,67 % |        7,12 % |       14,64 % |
| 1440-900 | guardando |         5,58 % |        10,07 % |        8,18 % |       13,90 % |
| 1440-900 | error     |        10,66 % |        14,83 % |        9,22 % |       15,05 % |
| 1440-900 | oculto    |         5,93 % |        10,90 % |        5,79 % |       15,20 % |
| 1440-900 | delta     |         6,00 % |        10,58 % |        8,50 % |       14,37 % |
| 1440-900 | std-e     |         8,10 % |        11,24 % |        8,43 % |       15,15 % |
| 1440-900 | std-v     |         8,52 % |        11,64 % |        8,57 % |       14,86 % |
| 1440-900 | fuel      |         5,25 % |        11,63 % |        4,80 % |       14,47 % |
| 1440-900 | pista     |         7,41 % |        10,20 % |       10,15 % |       14,03 % |
| 1440-900 | contenido |         6,87 % |        11,52 % |        8,95 % |       14,58 % |
| 1440-900 | menu      |         7,04 % |        11,59 % |        9,15 % |       14,22 % |
| 1440-900 | add       |         6,42 % |         7,11 % |        8,35 % |        9,22 % |
| 1280-720 | vacio     |         3,78 % |         8,23 % |        3,97 % |       11,13 % |
| 1280-720 | protegido |         9,03 % |        12,14 % |        8,02 % |       13,51 % |
| 1280-720 | guardando |        10,00 % |        12,32 % |       13,79 % |       17,15 % |
| 1280-720 | error     |        15,23 % |        17,00 % |       11,55 % |       16,03 % |
| 1280-720 | oculto    |         9,30 % |        12,21 % |        9,76 % |       14,08 % |
| 1280-720 | delta     |        10,69 % |        12,90 % |       14,35 % |       17,79 % |
| 1280-720 | std-e     |         9,28 % |        12,03 % |        9,11 % |       14,23 % |
| 1280-720 | std-v     |         9,95 % |        12,29 % |        9,22 % |       14,41 % |
| 1280-720 | fuel      |         9,56 % |        12,30 % |        9,73 % |       15,06 % |
| 1280-720 | pista     |         9,48 % |        13,40 % |       13,68 % |       17,72 % |
| 1280-720 | contenido |        11,93 % |        14,19 % |       14,65 % |       17,93 % |
| 1280-720 | menu      |        11,72 % |        13,75 % |       13,85 % |       17,28 % |
| 1280-720 | add       |         7,60 % |         8,08 % |        8,21 % |        8,27 % |
| z125     | vacio     |         6,30 % |         8,59 % |        9,96 % |       11,96 % |
| z125     | protegido |        10,23 % |        12,66 % |       12,75 % |       13,88 % |
| z125     | guardando |        10,97 % |        11,39 % |       17,47 % |       14,05 % |
| z125     | error     |        16,43 % |        16,43 % |       15,06 % |       16,27 % |
| z125     | oculto    |        10,55 % |        11,79 % |       14,12 % |       13,54 % |
| z125     | delta     |        11,77 % |        12,12 % |       18,14 % |       15,26 % |
| z125     | std-e     |        10,32 % |        11,86 % |       13,59 % |       14,02 % |
| z125     | std-v     |        10,57 % |        11,76 % |       14,23 % |       14,31 % |
| z125     | fuel      |        10,93 % |        11,82 % |       15,18 % |       14,67 % |
| z125     | pista     |        11,49 % |        11,40 % |       17,18 % |       13,49 % |
| z125     | contenido |        12,93 % |        13,46 % |       18,17 % |       16,64 % |
| z125     | menu      |        12,65 % |        12,77 % |       17,90 % |       14,91 % |
| z125     | add       |         7,77 % |         7,99 % |        8,78 % |        9,00 % |

La maqueta y el producto usan Electron 45.2.3, Chromium 156.0.8078.80, V8 15.6.75.27
y las mismas nueve caras TTF locales verificadas por hash. HTML original intacto:
fa9acc97776ef3e65662a0bea8c0eaae51891bb263dfc8376f408682694571c4.
Los 156 visores y 84 sesiones de producto tienen cierre limpio sin forcedKill.

La maqueta compacta los hijos, pero intenta cambiar la cuadrícula desde una
container query del propio contenedor: su columna queda en 248 px. El producto
aplica los 72 px de §11. Esto explica parte de la diferencia al abrir la barra
y en z125. No se ha alterado la referencia para reducir el porcentaje.
También hay diferencias heredadas del marco/datos y dibujos de widgets; estos
porcentajes no atribuyen esos píxeles a este PR. Vacío oscuro 1440 plegada pasó
de 3,80 % a 2,70 % durante la iteración de estados.

Seis negativos sin equivalente en la maqueta tienen 24 imágenes adicionales:
ilegible sin instancias, cargando, núcleo ausente, primer get fallido,
protegido más error y recuperación de lectura. Sus doce sesiones tienen cierre
limpio. No se inventa una referencia ni un porcentaje para esos estados.

## Comprobación y límites

CI del código 2cbe8f630: 174 archivos, 1851 tests pasan y uno está omitido por la suite existente; los 20 de estados pasan. Chromium de CI pasa también. Lint/tipos y el build QA se comprueban además de la CI. La suite de componentes
y Chromium se ejecutan en Hub web. Dos intentos locales recientes de Vitest no
pudieron iniciar dos workers (timeout del pool, antes de ejecutar sus pruebas);
se conserva el diagnóstico y se usa la CI como verificación del head final.
No se ha debilitado ningún test ni ampliado plazos para esconder esos fallos.

Evidencia no versionada: hub-web/isa-1995-studio-a-6-estados/EVIDENCIA-FINAL.md,
COMPARACIONES.md, metricas.json, validacion-final.json y negativos/validacion.json.
Cada par contiene referencia a la izquierda, producto a la derecha, diff,
versiones, fuentes y recibos. candidato-final.json describe los ASAR y qué escenas
se repitieron; no se presenta toda la serie como un solo binario.

Sin cambios en state.tsx, Rust, contrato, CAS ni valores por defecto. Sin nuevas
dependencias, merge, release, instalador o cuentas reales. Handoff en el PR.
