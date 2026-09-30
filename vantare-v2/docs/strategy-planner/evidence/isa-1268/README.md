# ISA-1268 · T15a2b delta de ritmo por piloto

## Resultado local

Orbit recibe un delta aditivo opcional por piloto. El backend resuelve primero
el ritmo observado de la combinación y suma después el delta, usando la misma
función durante optimización y replay final. La regresión 60/62 conserva ambos
ritmos y acredita que el delta no modifica el consumo.

TypeScript transporta el campo sin alterar los ritmos o consumos existentes.
El adaptador recorded convierte las estimaciones relativas, incluso cadenas,
en un único delta por piloto. Referencias ausentes, ciclos, duplicados y valores
no finitos no generan una entrada de cálculo.

## Límites

- La entrada completa y el botón Calcular aún no están conectados al recorrido
  recorded; corresponden a T15b después de cerrar T15a2c.
- El orden libre en una carrera temporal sigue bloqueado hasta que el solver
  controle directamente su condición de finalización.
- No se estiman deltas automáticamente ni se modifican otras familias.
- No se abrió la app ni se ejecutaron Wails, LMU o DuckDB.

## Verificación

El RED inicial demuestra que el contrato Go, el transporte TypeScript y el
adaptador recorded no existían. Pasan el paquete Go focal de aplicación y 4
archivos/108 tests frontend focales. También pasan frontend completo (450
archivos, 3.879 tests), typecheck, lint, auditoría i18n, build, Go global y 259
checks documentales. El primer Go global se inició antes del build y falló sólo
porque aún no existía `frontend/dist`; repetido después del build, pasa. El
build conserva el aviso heredado de chunks superiores a 500 kB.
