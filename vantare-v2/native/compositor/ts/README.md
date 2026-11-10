# TSX → receta JSON · VANTA-140 / #2022

Prueba aislada. Node 24 y TypeScript 5.9.3 (Apache-2.0), única dependencia de
desarrollo. El TSX nunca se importa ni ejecuta: TypeScript comprueba sus tipos
y el traductor recorre el AST. En carrera solo se entrega el JSON.

Desde este directorio:

```powershell
npm ci
npm run build
npm run check
npx tsc -p tsconfig.autor.json
npm test
node dist/traducir.js pruebas/ejemplo.tsx -o muestra.receta.json
node dist/traducir.js pruebas/ejemplo.tsx -o muestra.receta.json --vigilar
```

`build` regenera `generado/*.d.ts` desde cada `../modelos/*.modelo.json`, incluidos
los enumerados y las listas. También genera el objeto `tokens` desde el único
`../sistemas/*.sistema.json` disponible; en ausencia de sistemas usa
`pruebas/ejemplo.sistema.json`. Más de un sistema exige seleccionar uno antes
de generar con `node generar.mjs --sistema ruta.sistema.json`: no se mezclan
sus tokens. Para conservar esa selección, compila después con `npx tsc`
(el comando `build` vuelve a seleccionar el sistema por defecto).
Después de cambiar contratos o sistema,
repite `npm run build` y reinicia el vigilante.

`pruebas/ejemplo.tsx` es un ejemplo pequeño. `pruebas/relativo.tsx` es la
equivalencia de la receta directa vigente, utilizada como regresión. Importa
`m` desde el modelo generado y componentes, condiciones y `tokens` desde
`receta/index.js`. Exporta un único `<Overlay>` por defecto, con una raíz.
Para estilos compartidos usa `const estilo = {...} satisfies Estilo` e importa
`Estilo` como tipo si necesitas comprobación explícita fuera del JSX.
Los imports de tipos de la API se admiten con los nombres originales.
Las constantes solo contienen literales, otras constantes y tokens; no campos
del modelo. No se aceptan alias de imports, funciones auxiliares, spread,
`any` ni conversiones `as` (salvo `as const`).

`Lista` usa una función hija con un único parámetro, sin bloque. El nombre del
parámetro se conserva en `como`. `no(m.en_garaje)` genera `!en_garaje`;
`es(fila.lado, 'jugador')` genera `fila.lado=jugador`. Una plantilla como
`` `P${fila.posicion}` `` produce `P{fila.posicion}`. La plantilla de color
`` `$color.clase.${fila.clase}` `` conserva el enlace al enum; tsc comprueba
que todos sus valores tienen token en el sistema generado.

Los errores tienen `codigo`, `fichero`, `linea` y `columna` (base uno), más una
sugerencia. Un fallo de tipos devuelve `ErroresTipo.diagnosticos`, con **todos**
los diagnósticos de tsc y su `codigoTs` original; el CLI imprime cada posición.
Las restricciones propias del marcado tienen prioridad sobre la comprobación
de tipos. Los diagnósticos globales de tsc sin fichero se sitúan en la entrada,
línea 1, columna 1. El CLI devuelve código 1 al fallar y escribe tiempo en ms al
acertar. El vigilante escucha el directorio, filtra el nombre de entrada y
descarta eventos repetidos del mismo contenido. Escribe un temporal y lo renombra
al terminar; un error conserva la última receta válida. Ctrl+C cierra la escucha.
No vigila cambios en contratos/sistema/API. No admite imports de código ajeno.
Reutiliza un `Traductor` por sesión: conserva el programa incremental de
TypeScript y las fuentes versionadas. Los diagnósticos semánticos de fuentes
sin cambios se conservan; solo se analiza de nuevo el contenido cambiado.

Las pruebas comparan objetos JSON con la receta equivalente versionada,
verifican errores tipados con posición y miden veinte guardados del relativo esperando el
mensaje real de escritura, sin pausas artificiales. Incluyen guardados mediante
renombrado y ediciones inválidas de marcado y de tipos seguidas de recuperación.
Imprimen mediana y p95 (rango más próximo: muestra 19 de 20 ordenadas).
El tiempo comienza antes de guardar y termina al recibir el ACK de JSON escrito;
la carga inicial de TypeScript no forma parte de esos veinte guardados.

Correspondencia con `RECETA.md`, revisada campo a campo:

| Receta | API TSX |
| --- | --- |
| `receta`, `tipo`, `nombre`, `modelo`, `visible`, `entrada`, `salida`, `raiz` | Versión 1 y tipo overlay emitidos; props del mismo nombre; raíz = hijo único. |
| Comunes: `id`, `estilo`, `estados`, `transiciones`, `capa`, `visible`, `bucle` | Props opcionales del mismo nombre. |
| Caja `hijos` | Hijos JSX; `<Caja/>` omite `hijos`, `<Caja></Caja>` emite `[]`. |
| Texto `texto` | Contenido de Texto, literal o enlace/plantilla. |
| Lista `de`, `como`, `clave`, `plantilla`, `entrada`, `salida`, `movimiento` | Props; `como` es el parámetro hijo y `plantilla` su cuerpo JSX. |
| Estilo: `ancho`, `alto`, `min_ancho`, `max_ancho`, `direccion`, `alinear`, `justificar`, `hueco`, `relleno`, `crecer`, `encoger`, `posicion`, `arriba`, `izquierda`, `derecha`, `abajo` | Mismos nombres, enumerados, medidas y cardinalidades de relleno. |
| Estilo: `fondo`, `borde`, `radio`, `sombra`, `opacidad`, `tipo`, `color`, `alinear_texto` | Mismos nombres; degradado lineal, tokens por familia y cardinalidades de radio. |
| Estado `cuando`, `estilo`, `bucle` | Condición obligatoria; estilo y bucle opcionales. |
| Bucle `propiedad`, `valores`, `duracion`, `cuando` | Primeros tres obligatorios; condición opcional, también dentro de un estado. |
| Transición token, `{duracion, curva, retardo?}`, `{muelle: {rigidez, amortiguacion}}` | Las tres variantes; curvas nombradas o tupla Bézier. |
| Entrada `{desde, transicion}`, salida `{hacia, transicion}` | Mismos nombres, propiedades compuestas en desde/hacia. |

La validación final de límites, rangos numéricos, identidad de nodos y tokens
resueltos corresponde al cargador estricto de recetas. Esta entrega no prueba
la carga ni el dibujo del motor Rust/Windows.
