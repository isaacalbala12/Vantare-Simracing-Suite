# Plan: Standings Eficiencia V1 con modalidad multiclass

## Objetivo

Añadir bandas multiclass al `StandingsFunctional` existente sin crear otro
diseño oficial, otro renderer ni una segunda carcasa visual.

## Secuencia

### 1. Contrato y agrupación

- Añadir al `StandingsViewModel` el alcance explícito de clase.
- Propagar `StandingsContent.classScope` desde `buildStandingsViewModelV2`.
- Crear helpers puros para detectar grupos contiguos y resolver la posición
  visible de clase con fallback a la posición global.
- Mantener el orden del frame y el significado actual de `rowCount`.

### 2. Renderer

- Mantener `StandingsFunctional` como único renderer.
- Renderizar `tr/th` de banda solo en `all-classes` y cuando haya una clase
  identificable.
- Reutilizar las mismas celdas y clases de fila para todos los pilotos.
- Mantener FLIP y flashes únicamente sobre filas de pilotos.
- Ajustar el cálculo de filas visibles para descontar bandas del espacio
  disponible.

### 3. Layout y estilos

- Extender las funciones de tamaño de Eficiencia para contar bandas.
- Añadir selectores mínimos de banda en `tokens.css`, junto a los selectores
  de `vf-standings` existentes.
- Usar el acento Eficiencia por clase sin introducir composición de iRacing,
  tarjetas, logos o badges.
- Mantener el modo normal pixel/semánticamente equivalente al estado actual.

### 4. Workshop y cobertura

- Conservar `standings-multiclass` como fixture de Workshop que activa
  `classScope: all-classes`.
- Añadir casos de renderer/view model/layout para normal, multiclass, una sola
  clase, clases contiguas, filas truncadas y estados no disponibles.
- Ejecutar tests focalizados y el typecheck/lint disponible.
- Revisar el diff final por archivo y verificar que no se hayan incluido
  cambios de otros agentes.

## Criterios de salida

- Un único diseño oficial `standings-functional-compact`.
- Normal sin bandas y sin cambios visuales intencionados.
- Multiclass con bandas de clase dentro de la misma tabla Eficiencia V1.
- `rowCount` cuenta solo pilotos.
- Sin datos inventados.
- Tests focalizados en verde y sin errores de formato en los archivos tocados.
