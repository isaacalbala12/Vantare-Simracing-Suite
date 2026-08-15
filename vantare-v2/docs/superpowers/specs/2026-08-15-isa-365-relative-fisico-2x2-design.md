# ISA-365 — Relative físico 2+2

Estado: especificación aprobada para implementación.

Issue: [ISA-365](https://linear.app/vantareapp/issue/ISA-365/rel-01-relative-fisico-22-con-degradacion-neutral-en-boxes)

## Supuestos aprobados

1. «Delante» y «detrás» describen proximidad física siguiendo el progreso de
   vuelta creciente, con continuidad circular en meta.
2. El widget muestra exactamente dos rivales delante, el jugador y dos rivales
   detrás cuando existen cuatro rivales elegibles.
3. La selección física y el gap temporal son datos independientes.
4. Los perfiles anteriores se normalizan a 2+2 e incluyen al jugador. Los
   controles de cantidad e inclusión del jugador se retiran para no ofrecer
   ajustes que contradigan el contrato.
5. En boxes se utiliza la posición física actual publicada por LMU. No se añade
   una caché privada `last-known` mientras no exista evidencia de que haga falta.

## Objetivo

Corregir el Relative para que muestre el tráfico físicamente próximo aunque
LMU no publique un tiempo relativo comparable. El usuario debe seguir viendo
cinco filas útiles en pista y en boxes sin tiempos inventados.

Éxito observable:

- dos sucesores circulares de `lapDistanceMeters` delante;
- jugador centrado;
- dos predecesores circulares detrás;
- filas neutrales con `—` cuando el tiempo no sea comparable;
- el mismo ViewModel en Studio, Desktop, OBS y Workshop.

## Evidencia y causa

Una sesión LMU real mostró 38 vehículos con `lapDistanceMeters` fresh y solo
uno con `relativeTimeGapSeconds`. El selector actual descarta los rivales sin
`timeGapToPlayer`, por lo que deja únicamente al jugador.

Overlay Projection v1 y su adapter ya entregan `lapDistanceMeters` para cada
vehículo. No hace falta ampliar Telemetry Core ni conocer la longitud total de
la pista: el sucesor y predecesor en una lista ordenada forman un orden circular
correcto alrededor de meta.

## Arquitectura y flujo

```text
LMU Shared Memory
  -> Telemetry Core
  -> Overlay Projection v1: vehicles[].lapDistanceMeters
  -> adapter: scoring[].lapDistanceMeters
  -> Relative ViewModel: selección circular 2+2
  -> WidgetVisualHost
  -> Studio / Desktop / OBS / Workshop
```

El cambio es frontend puro. El ViewModel continúa sin I/O, persistencia,
Wails, SSE ni acceso directo a LMU.

## Requisitos funcionales

### RF-01 — Selección física

La identidad de las filas se decide exclusivamente mediante
`scoring[].lapDistanceMeters`. No participan el gap temporal, la posición de
carrera, las vueltas completadas ni el delta de vueltas.

### RF-02 — Orden circular

Tras ordenar por distancia ascendente:

- los siguientes elementos, con wrap, son los coches delante;
- los anteriores, con wrap, son los coches detrás.

El desempate usa una identidad estable para que reordenar el payload no cambie
el resultado.

### RF-03 — Composición exacta

Con al menos cuatro rivales elegibles, el orden visual es:

```text
segundo delante
primero delante
jugador
primero detrás
segundo detrás
```

Con menos rivales se muestran una sola vez todos los disponibles. El jugador
no se puede ocultar.

### RF-04 — Clase y doblados

`classScope="sameClass"` filtra primero por la clase del jugador. Las vueltas
perdidas no excluyen ni recolocan un coche físicamente próximo.

### RF-05 — Gap temporal opcional

Una fila seleccionada no necesita `timeGapToPlayer`. El gap solo es comparable
cuando es finito, jugador y rival no están en pit, el delta relativo de vueltas
presente es cero y su signo coincide con el lado físico.

Si no es comparable:

```text
gapSeconds = null
gapText = "—"
tone = "neutral"
```

### RF-06 — Lado independiente

Cada fila expone `side: "ahead" | "player" | "behind"`. `side` controla orden
y disposición; `tone` controla color o alerta. Una fila delante puede ser
neutral.

### RF-07 — Boxes y ausencia

- Jugador en pit con distancia válida: selección física 2+2 y rivales neutrales.
- Rival en pit: permanece si es próximo, pero su gap es neutral.
- Rival sin distancia válida: se excluye.
- Jugador sin distancia válida: se muestra solo el jugador.
- Jugador no identificado: se conserva el estado de datos ausentes actual.
- Nunca se rellena con clasificación.

## No objetivos

- Modificar driver, fusión, reducer, derivaciones o proyección Go.
- Añadir `TrackLength`, `TimeIntoLap` o otro reader LMU/REST.
- Estimar longitud, metros firmados, velocidad o segundos.
- Añadir estado global, timers, caché `last-known` o dependencias.
- Cambiar Multiclass Relative, Standings u otros widgets.
- Reproducir todos los detalles internos no publicados por LMU.

## Stack, estructura y estilo

- React y TypeScript estricto.
- Vitest y Testing Library con tests colocados junto al código.
- Funciones puras, exports nombrados y tipos explícitos existentes.
- La selección devuelve filas con lado físico; el ViewModel decide si el gap
  es comparable.

Ejemplo de salida interna:

```ts
type SelectedRelativeRow = {
  row: RelativeScoringRow;
  side: "ahead" | "player" | "behind";
};
```

## Algoritmo

```text
player := primera fila isPlayer=true
si no existe: devolver []
si player.lapDistanceMeters no es finito: devolver [player]

candidates := rivales con distancia finita que cumplen classScope
ordered := candidates + player, ordenados por distancia e identidad estable
playerIndex := índice del jugador

aheadNearToFar := hasta 2 sucesores únicos con wrap
behindNearToFar := hasta 2 predecesores únicos con wrap, sin reutilizar filas

devolver reverse(aheadNearToFar) + player + behindNearToFar
```

## Estrategia de pruebas

Tests unitarios pequeños y deterministas:

- 38 vehículos y un solo gap temporal producen cinco filas;
- orden normal y wrap de meta;
- doblados próximos;
- filtro de misma clase;
- entrada reordenada y empates estables;
- distancias ausentes, NaN e infinitas;
- menos de cuatro rivales sin duplicados;
- jugador o rival en pit neutraliza gaps;
- gap ausente o de signo contradictorio no elimina filas;
- Original, Crystal y Endurance conservan lado y presentación neutral.

El bug se implementa con RED -> GREEN -> REFACTOR. El test de regresión debe
fallar con el selector anterior antes de modificar producción.

## Comandos

```powershell
corepack pnpm --dir frontend test -- src/overlay/widget-types/relative/relative-view-model.test.ts
corepack pnpm --dir frontend test -- src/overlay/design-systems/vantare-original/relative src/overlay/design-systems/vantare-crystal/relative src/overlay/design-systems/vantare-endurance/relative
corepack pnpm --dir frontend test
corepack pnpm --dir frontend build
corepack pnpm --dir frontend exec eslint src/overlay/widget-types/relative src/overlay/design-systems/vantare-endurance/relative
corepack pnpm --dir frontend visual:overlay-studio
```

## Límites

- Siempre: tests antes del código, cambios pequeños, TypeScript estricto,
  revisión del diff y documentación viva.
- Pedir antes: dependencia nueva, cambio backend, arquitectura nueva o ampliar
  el alcance a otros widgets.
- Nunca: inventar segundos, leer LMU desde React, duplicar renderizadores,
  debilitar tests, tocar secretos o limpiar cambios ajenos.

## Criterios de aceptación

1. Con cuatro rivales elegibles se renderizan exactamente cinco filas 2+1+2.
2. Las identidades corresponden a sucesores y predecesores circulares de la
   distancia de vuelta, incluido el cruce por meta.
3. El resultado no depende de clasificación, vueltas perdidas o disponibilidad
   del tiempo relativo.
4. En el caso live 38 vehículos/1 gap no desaparecen los rivales.
5. En pit se mantienen filas neutrales y no aparecen tiempos falsos ni alertas.
6. Perfiles anteriores quedan normalizados a 2+2 sin controles engañosos.
7. Las tres variantes visuales usan el mismo lado físico.
8. Suite frontend, build, ESLint focal y verificación visual aplicable pasan.

## Riesgos y seguimiento

- Falta evidencia con el jugador estacionado en garaje; si LMU deja de publicar
  distancia, este corte falla cerrado mostrando solo al jugador.
- `sessionInfo.lapDistance` y `timeIntoLap` quedan para caracterización futura;
  no bloquean esta solución.
- Endurance contiene lógica que deduce el lado desde `gapSeconds`; debe quedar
  cubierta por tests antes de cambiarla.
