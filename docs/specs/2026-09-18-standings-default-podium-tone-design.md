# Diseño: separación tonal del top 3 en Standings Default

- Fecha: 2026-09-18
- Estado: aprobado para especificación técnica
- Alcance: Vantare Functional · Overlay Workshop · Standings

## Decisión

El diseño **Default** tendrá una separación tonal mínima entre el top 3 y la
ventana de pilotos alrededor del jugador.

La selección de filas no cambia. El motor seguirá proyectando primero las
posiciones 1, 2 y 3 y después la ventana contextual del jugador. La separación
será exclusivamente una capa de presentación del Workshop.

El cambio se limita a:

- estudio visual `Default` (`study=default`);
- clasificación `Normal`;
- widget Standings del sistema `vantare-functional`.

V1, Foco, Multiclass, los perfiles globales y el renderer productivo fuera del
Workshop quedan sin cambios visuales.

## Experiencia visual

El top 3 se presenta como un bloque ligeramente más claro que el resto de la
tabla. La primera fila contextual vuelve al tono base y recibe una transición
visual muy discreta para que el corte se perciba sin parecer una segunda tabla.

No habrá:

- etiqueta «TOP 3» o «VENTANA DEL JUGADOR»;
- fila separadora vacía;
- aumento de altura, padding estructural o cambio de resolución;
- duplicación de pilotos;
- cambio en el resaltado del jugador.

El resaltado del jugador conserva prioridad visual. Si el jugador ocupa una de
las tres primeras posiciones, la fila seguirá marcada como jugador dentro del
bloque tonal. Si no existe una fila contextual —por ejemplo, con una lista de
`tres` pilotos o una ventana sin vecinos— no se dibuja ninguna separación.

## Límite entre datos y presentación

La función de ventana existente continúa siendo la única responsable de
seleccionar y ordenar filas. No se crea una segunda versión de la clasificación
ni se añade un modo al contrato de datos.

Después de recibir `model.rows`, el renderer de Standings añadirá metadatos DOM
de presentación a las filas ya proyectadas:

- `data-standings-group="podium"` para las posiciones globales 1–3;
- `data-standings-group="context"` para las demás filas proyectadas;
- `data-standings-context-start="true"` solo en la primera fila contextual.

Estos metadatos se calculan únicamente para `classificationMode="normal"`.
Multiclass conserva sus bandas y no recibe la separación tonal del top 3.

La hoja de estilos del Workshop aplicará el tratamiento solo bajo el scope
existente del estudio:

`functional-study[data-study-style="default"]`

Así, el renderer puede seguir siendo compartido por la aplicación y el
Workshop sin trasladar esta decisión visual a ajustes globales o perfiles
persistidos.

## Composición con estados existentes

La separación tonal debe convivir con:

- la fila activa del jugador;
- los flashes de movimiento de adelantamiento;
- los estados stale, missing, disconnected y error;
- la marca visible u oculta;
- cualquier combinación válida de columnas.

La implementación no debe reemplazar de forma destructiva los fondos o sombras
que ya expresan el estado del jugador o del movimiento. El tratamiento tonal
se compondrá con esos estados mediante una capa neutra de baja intensidad o
una variable visual dedicada.

## Casos límite

| Caso | Resultado esperado |
| --- | --- |
| 1–3 pilotos | Solo bloque tonal; sin línea o transición de contexto |
| Jugador en P1, P2 o P3 | Resaltado del jugador dentro del bloque tonal |
| Jugador fuera del top 3 | Top 3 tonal y ventana contextual separada al comenzar |
| Jugador en última posición | La ventana se desplaza como ahora; la separación no cambia |
| `around=0` | Top 3 tonal; no hay fila contextual |
| Multiclass | Sin bloque tonal; bandas de clase sin cambios |
| V1 o Foco | Render visual actual, sin metadatos estilísticos aplicados por el Workshop |
| Fuente no disponible | No se añaden adornos a estados sin filas |

## Verificación

La entrega se considerará correcta cuando se verifique todo lo siguiente:

1. En `study=default` + clasificación Normal, P1–P3 forman un bloque tonal
   reconocible pero sutil y la ventana empieza con un corte visual mínimo.
2. V1 y Foco mantienen el aspecto anterior en los mismos escenarios.
3. El array de filas, sus posiciones, la identidad del jugador y el resultado
   de `around` son idénticos antes y después del cambio.
4. La altura intrínseca y la resolución declarada no cambian por la separación.
5. El resaltado del jugador y los estados de movimiento siguen funcionando en
   las dos zonas.
6. Multiclass no recibe el estilo del top 3.
7. No se modifica `StandingsContent`, la configuración global ni el diseño
   persistido; el efecto vive en el scope visual del Workshop Default.

La matriz mínima de pruebas cubrirá `study=default`, `study=v1` y
`study=v2-focus`, jugadores en P1, una posición intermedia y la última
posición, `around=0`, `around=4` y `around=8`, además de Normal y Multiclass.

## Fuera de alcance

- Rediseñar V1 o Foco.
- Convertir Default en una nueva variante de datos.
- Cambiar la regla de tres posiciones fijas más ventana contextual.
- Añadir una etiqueta, un segundo encabezado o una tabla separada.
- Llevar el tratamiento tonal a perfiles reales o a la aplicación fuera del
  Workshop.
