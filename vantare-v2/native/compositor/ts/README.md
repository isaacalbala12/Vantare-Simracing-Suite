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

El ejemplo es deliberadamente pequeño, no el relativo completo. Importa
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
sugerencia. El CLI devuelve código 1 al fallar y escribe tiempo en ms al
acertar. El vigilante escucha el directorio, filtra el nombre de entrada y
descarta eventos repetidos del mismo contenido. Escribe un temporal y lo renombra
al terminar; un error conserva la última receta válida. Ctrl+C cierra la escucha.
No vigila cambios en contratos/sistema/API. No admite imports de código ajeno.

Las pruebas comparan objetos JSON con la receta equivalente versionada,
verifican errores tipados con posición y miden diez guardados esperando el
mensaje real de escritura, sin pausas artificiales. Incluyen guardados mediante
renombrado y una edición inválida seguida de recuperación.

La validación final de límites, rangos numéricos, identidad de nodos y tokens
resueltos corresponde al cargador estricto de recetas. Esta entrega no prueba
la carga ni el dibujo del motor Rust/Windows.
