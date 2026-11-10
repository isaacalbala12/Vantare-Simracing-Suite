# Receta de overlay — formato v1 (prueba #2022)

Una **receta** describe *cómo se ve* un overlay. No calcula nada: el núcleo le
entrega un **modelo** ya calculado (textos formateados, booleanos de situación,
listas con clave) y la receta solo lo pinta. Un **sistema de diseño** aporta
colores, tipografías, medidas y movimientos mediante tokens; la misma receta
se pinta con otro sistema sin tocarla.

Tres ficheros JSON, validados de forma estricta (campo desconocido = error):

| Fichero | Qué es |
| --- | --- |
| `recetas/<nombre>.receta.json` | Estructura, enlaces al modelo, estados y transiciones. |
| `sistemas/<nombre>.sistema.json` | Tokens: `color`, `tipo`, `medida`, `mov`, `efecto`. |
| `modelos/<nombre>.modelo.json` | Contrato del modelo que entrega el núcleo (campos y tipos). De aquí se generan los tipos TS. |

Mensajes de error: siempre `ruta.json:/puntero/json: qué falla. Cómo hacerlo.`
Ejemplo: `relativo.receta.json:/raiz/hijos/2/estilo/fondo: "#ff0000" es un color fijo. Usa un token, p. ej. "$color.superficie".`

## Receta

```json
{
  "receta": 1,
  "tipo": "overlay",
  "nombre": "relativo",
  "modelo": "relativo/1",
  "visible": "!en_garaje",
  "entrada": { "desde": { "opacidad": 0, "y": -8 }, "transicion": "$mov.aparecer" },
  "salida":  { "hacia": { "opacidad": 0, "y": -8 }, "transicion": "$mov.desaparecer" },
  "raiz": { "tipo": "caja", "estilo": { "ancho": "$relativo.ancho" }, "hijos": [] }
}
```

- `receta`: versión del formato (1). `tipo`: `"overlay"` (solo muestra) o
  `"menu"` (reservado; v1 lo rechaza con «aún no soportado»).
- `modelo`: contrato `nombre/versión` que debe existir en `modelos/`.
- `visible`: condición (ver «Condiciones»). Al pasar a falso se ejecuta `salida`
  y la capa raíz se oculta al terminar; al pasar a verdadero, `entrada`.

### Nodos

Campos comunes: `tipo`, `id` (opcional, único entre hermanos, `[a-z][a-z0-9_]*`),
`estilo`, `estados`, `transiciones`, `capa` (bool), `visible` (condición).

| `tipo` | Campos propios |
| --- | --- |
| `caja` | `hijos`: lista de nodos. |
| `texto` | `texto`: cadena con enlaces `{ruta}` al modelo, p. ej. `"P{fila.posicion}"`. |
| `lista` | `de`: ruta a una lista del modelo; `como`: nombre del elemento (`fila`); `clave`: campo con la identidad estable; `plantilla`: nodo; `entrada`, `salida`, `movimiento`: transiciones de los elementos que entran, salen o cambian de sitio. |

Cada elemento de `lista` es siempre una capa propia. Una capa propia
(`"capa": true`) se compone por separado: su opacidad, posición, escala y giro
se animan sin repintar. Un nodo con transición de propiedad compuesta es capa
automáticamente.

### Estilo

Maquetación (flexbox, como CSS): `ancho`, `alto`, `min_ancho`, `max_ancho`,
`direccion` (`fila`|`columna`), `alinear` (`inicio`|`centro`|`fin`|`estirar`),
`justificar` (`inicio`|`centro`|`fin`|`entre`), `hueco`, `relleno` (1, 2 o 4
valores), `crecer`, `encoger`, `posicion` (`relativa`|`absoluta`), `arriba`,
`izquierda`, `derecha`, `abajo`.

Si se omiten, `direccion` es `columna` y `alinear` es `estirar` (STRETCH).
La posición es relativa, el relleno y hueco son cero; ancho y alto son automáticos.
`crecer` vale 0 y `encoger` vale 1. Las propiedades compuestas parten de
opacidad 1, x/y/giro 0 y escala 1. Los insets `auto` permanecen automáticos.

Pintura: `fondo` (color o degradado), `borde` (`{ "ancho", "color" }`),
`radio` (1 o 4 valores), `sombra` (token `$efecto.*`), `opacidad`.
Texto: `tipo` (token `$tipo.*`), `color`, `alinear_texto`.

Valores:
- **Colores y tipografías: siempre tokens** (`$color.*`, `$tipo.*`). Un literal es error.
- **Medidas: tokens** (`$medida.*` o un espacio propio del overlay como `$relativo.*`),
  o `0`, `"auto"`, `"100%"`. Un número suelto es error con sugerencia.
- Degradado: `{ "lineal": { "angulo": 90, "paradas": [["$color.a", 0], ["$color.b", 1]] } }`.
- `opacidad`: número 0..1 (no es una medida del diseño).
- Token con enlace a un **enumerado** del modelo: `"$color.clase.{fila.clase}"`.
  Solo se admite si el campo es `enum` y el sistema define un token para
  **cada** valor del enumerado (se comprueba al cargar, no en carrera).

### Condiciones

Solo leen el modelo; no hay operadores aritméticos ni llamadas.
`"campo"` (booleano verdadero), `"!campo"` (falso), `"campo=valor"` (enumerado
igual a un valor declarado en el contrato). Rutas con punto: `fila.cerca`.

### Estados

```json
"estados": [
  { "cuando": "fila.jugador", "estilo": { "fondo": "$color.jugador" } },
  { "cuando": "fila.cerca",   "estilo": { "opacidad": 1 } }
]
```
Se aplican en orden; el último que se cumple gana por propiedad.

### Transiciones

`"transiciones": { "opacidad": "$mov.resalte", "y": "$mov.desliza", "fondo": "$mov.color" }`

Una transición es un token `$mov.*` o un objeto
`{ "duracion": ms, "curva": "lineal"|"entrada"|"salida"|"entrada-salida"|[x1,y1,x2,y2], "retardo": ms }`
o un muelle `{ "muelle": { "rigidez": n, "amortiguacion": n } }`.
`bucle`: `{ "propiedad": "opacidad", "valores": [0.35, 1, 0.35], "duracion": ms }`
repite mientras su `cuando` se cumpla (resalte pulsante).

- Propiedades compuestas (gratis, sin repintar): `opacidad`, `x`, `y`, `escala`, `giro`.
- Propiedades pintadas (repintan la capa en cada fotograma de la transición):
  `fondo`, `color`, `borde`. El validador lo avisa con la alternativa compuesta:
  «superpón una capa con el color final y anima su opacidad».
- Toda transición es **interrumpible**: si el destino cambia a mitad, la nueva
  arranca desde el valor y la velocidad actuales.

## Sistema de diseño

```json
{
  "sistema": 1,
  "nombre": "vantare",
  "fuentes": ["Inter"],
  "color": { "superficie": "#17171bf2", "texto": "#f4f4f6" },
  "tipo": { "fila": { "familia": "Inter", "peso": 500, "tamano": 13, "interletra": 0, "interlinea": 18, "tabulares": true } },
  "medida": { "fila": 24 },
  "mov": { "aparecer": { "duracion": 220, "curva": "salida" } },
  "efecto": { "panel": { "sombra": { "color": "$color.sombra", "desenfoque": 24, "y": 8 } } },
  "relativo": { "ancho": 420 }
}
```
Espacios propios por overlay (`relativo`) admiten medidas. Un sistema puede
referenciar sus propios tokens. Cambiar de sistema en caliente: cada capa se
repinta con el nuevo y se funde con la anterior (`$mov.cambio_sistema`).

## Contrato del modelo

```json
{ "modelo": "relativo/1",
  "campos": {
    "en_garaje": "bool",
    "titulo": "texto",
    "filas": { "lista": { "id": "texto", "posicion": "texto", "jugador": "bool", "cerca": "bool", "lado": { "enum": ["delante", "jugador", "detras"] } } }
  } }
```
Tipos: `bool`, `texto`, `numero` (solo para estilos acotados, p. ej. `opacidad`), `{ "enum": [...] }`, `{ "lista": {...} }`.

## Límites (recetas de terceros, a futuro)

| Límite | Valor v1 |
| --- | --- |
| Tamaño de fichero | 256 KiB |
| Nodos de la receta / tras expandir listas | 512 / 4096 |
| Profundidad | 32 |
| Elementos por lista | 64 |
| Capas | 256 |
| Texto por nodo tras enlazar | 256 caracteres |
| Duración de una transición / bucle | 10 s |
| Fuentes | solo las del paquete del producto |
| Imágenes, sombreadores, rutas, red | no admitidos en v1 |

La carga devuelve un `Programa` opaco y tipado: resuelve tokens, condiciones,
rutas, tablas de enumerados y estilos taffy antes de crear la escena. El JSON
original se conserva solo para recompilar al cambiar receta o sistema; en cada
foto solo se lee el modelo, con ámbitos de lista prestados. Un cambio inválido
no modifica la escena. `Escena::nueva` recibe ese `Programa`; `avanzar` no recibe
medidor y devuelve `Result`, igual que las entradas con reloj inyectado.

Las medidas y números del modelo están acotados a ±1 000 000. La expansión de
tokens tiene un presupuesto de 256 KiB; el modelo, 1 MiB y 65 536 valores.
Las curvas admiten como máximo 1024 tramos, con suelo de tolerancia por ULP;
una duración positiva debe ser al menos 1 ms. Los controles Bézier tienen
x en 0..1 e y en −10..10. Fuera de esos límites se devuelve un error.
Los errores al cargar o recargar conservan fichero y puntero JSON completos.

Un muelle que no se asienta antes de 10 s con la velocidad real de interrupción,
o una curva cuya precisión exige coeficientes fuera de f32, devuelve un error
numérico explícito y conserva la escena anterior. No se emite una curva parcial
ni se cambia por una curva lineal. Para admitir ese movimiento, reduce la
velocidad de llegada o cambia la transición. Las tipografías requieren familia,
peso, tamaño e interlínea; interletra (0), tabulares y mayúsculas (false) son opcionales.
