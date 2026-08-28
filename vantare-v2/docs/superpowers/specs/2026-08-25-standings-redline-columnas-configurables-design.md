# Spec: Standings Redline con columnas configurables

Estado: aprobada por Isaac el 2026-08-26 y enmendada tras review Fable con su
acuerdo el 2026-08-27. Issue: ISA-849.

## Objetivo

Hacer que el diseño `standings-redline` de Vantare Endurance respete de forma
honesta la configuración de contenido del Standings sin perder su composición
visual ni su motor de movimiento.

El usuario debe poder activar, desactivar, ordenar, dimensionar y alinear las
métricas flexibles. `Posición` y `Piloto` permanecen como anclajes visibles y
fijos de Redline. Cuando se activen muchas métricas, el usuario ensanchará el
widget; Studio debe advertirlo y nunca redimensionarlo automáticamente.

Quedan fuera de alcance todos los demás diseños y plantillas.

## Decisiones cerradas

1. No se crea un adaptador, DSL, renderer alternativo ni registro nuevo.
2. `StandingsRedlineTemplate.tsx` deriva directamente de la configuración
   existente las columnas flexibles habilitadas y las renderiza en su orden.
3. `position` y `driverName` son anclajes Redline: siempre visibles y en sus
   posiciones actuales. En el inspector sus checks y flechas se muestran
   bloqueados con una explicación específica de Redline. Sus controles de
   anchura siguen activos; la alineación de `driverName` también.
4. El badge efímero de posiciones ganadas o perdidas continúa entre el anclaje
   de piloto y la zona flexible. No es una columna configurable.
5. Las demás métricas son flexibles: `driverNumber`, `vehicleClass`, `gap`,
   `interval`, `currentLap`, `lastLap`, `bestLap`, `pit` y `tireCompound`.
6. La anchura SM/MD/LG usa los píxeles canónicos de `WidgetColumnV3`. Redline
   no comprime por debajo de esas anchuras para esconder un problema de espacio.
7. La fila conserva 30 px de alto, el mismo `data-standings-row` y la misma key.
   El cambio de columnas es horizontal y no altera el stride del motor FLIP.
8. `model.columns` continúa siendo la única lista de columnas habilitadas,
   ordenadas y dimensionadas. Para recuperar el nombre fijo de un perfil antiguo
   que tenga Piloto desactivado se añade solo `configuredDriverName`; ningún
   renderer ajeno lo consume.
9. Solo el par `standings + vantare-endurance/standings-redline` usa una anchura
   CSS interna fluida igual a `layout.w`. Original, Crystal y los demás Endurance
   conservan el viewport base de 520 px y su escalado actual.

## Comportamiento visual

La fila mantiene esta jerarquía:

```text
[posición fija] [piloto fijo] [delta efímero] [métricas flexibles en orden]
```

Las métricas flexibles usan el formateo ya publicado por el ViewModel. Redline
solo conserva tratamientos especiales donde existe semántica visual aprobada:

- `bestLap`: tiempo y glifo morado del mejor registro de sesión;
- `gap`: celda de presión y lectura de batalla;
- `interval`: lectura publicada, sin conducir la batalla porque no equivale de
  forma general al intervalo entre filas adyacentes de la misma clase y no está
  disponible en Overlay V2;
- `pit`: celda configurable; el estado PIT de la fila y la sustitución de una
  lectura temporal inválida permanecen aunque esta columna esté oculta;
- `tireCompound`: badge y revelado temporal del compuesto;
- el resto: texto compacto con la anchura y alineación configuradas.

`vehicleClass` controla su celda de fila. El encabezado de bloque conserva la
agrupación estructural de Redline, pero no sustituye a esa columna ni participa
en su orden.

La rejilla se define directamente en la fila mediante sus tracks configurados.
Para Redline, la frontera `WidgetVisualViewport` usa `layout.w` como anchura base
y escala 1: ensanchar concede espacio CSS real en Studio, Desktop, OBS, edición
in-place y Workshop. La anchura mínima recomendada suma anclajes, delta,
columnas flexibles, gaps y padding. Si `widget.layout.w` es menor, el inspector
muestra la recomendación. No hay resize automático, scroll ni reducción de
fuente. El nombre usa `minmax(preset, 1fr)` para conservar la jerarquía visual;
el preset es su mínimo observable, no un truncado rígido a 90 px.

## Contrato de animaciones

Las animaciones estructurales permanecen siempre activas en runtime cuando el
motor Redline esté habilitado:

- FLIP de adelantamientos;
- flash verde/rojo;
- contador escalonado de posiciones;
- entrada de participantes;
- fantasma de retirada.

Las animaciones que revelan una métrica respetan su visibilidad:

- batalla y presión solo si `gap` está visible;
- corona y onda morada solo si `bestLap` está visible;
- revelado de compuesto solo si `tireCompound` está visible;
- el estado PIT se conserva siempre; la columna PIT respeta su visibilidad.

Los fantasmas reutilizan la misma función de fila y las mismas columnas
configuradas. Solo cambian su posición a `—`, su estado a `OUT` cuando exista
una celda adecuada y su animación de salida. No mantienen una segunda maqueta
hardcodeada.

La desactivación de los motores Redline dentro del lienzo de Studio pertenece a
ISA-799 y su PR draft #795. ISA-849 no absorbe ni duplica ese cambio: se construye
sobre Nightly y resolverá el solape al integrar. La paridad visual se valida en
Workshop y la animación real en runtime; Studio no se presenta como prueba de
motion mientras ISA-799 siga pendiente.

## Tech stack

- React 19 y TypeScript estricto.
- CSS productivo de `vantare-endurance/tokens.css`.
- Vitest y Testing Library.
- `WidgetVisualHost` como única frontera para Studio, Desktop, OBS y Workshop.
- Sin dependencias nuevas.

## Comandos

Desde `vantare-v2`:

```powershell
pnpm --dir frontend test -- src/hub/overlay-studio/orbit/StudioOrbitFeedback.test.tsx src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.test.tsx src/overlay/design-systems/vantare-endurance/standings/standings-motion.test.ts src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.test.tsx
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-workshop
git diff --check
```

La suite completa `pnpm --dir frontend test` se ejecuta antes del cierre. La
prueba Wails/WebView2 se ejecuta si el entorno puede cargar una sesión autorizada;
si no, se registra el bloqueo exacto y no se presenta Workshop como prueba Wails.

## Estructura del proyecto

Archivos productivos esperados:

- `frontend/src/overlay/design-systems/vantare-endurance/standings/StandingsRedlineTemplate.tsx`
  — fila configurable y compuertas visuales.
- `frontend/src/overlay/design-systems/vantare-endurance/standings/useStandingsMotion.ts`
  — habilitación de eventos ligada a las métricas visibles.
- `frontend/src/overlay/design-systems/vantare-endurance/tokens.css`
  — rejilla y celdas Redline.
- `frontend/src/overlay/widget-types/standings/StandingsContentInspector.tsx`
  — anclajes bloqueados y advertencia de anchura solo para Redline.
- `frontend/src/overlay/core/WidgetVisualViewport.tsx` y sus consumidores
  — anchura CSS fluida limitada al par Redline, sin cambiar otros renderers.

Tests junto al código correspondiente. Cualquier extensión aditiva del ViewModel
debe quedar caracterizada y no cambiar el DOM de los demás renderizadores.

## Estilo de código

La configuración se consume directamente, sin capa intermedia:

```tsx
const flexibleColumns = model.columns.filter(
  (column) => !REDLINE_FIXED_METRICS.has(column.metricId),
);

{flexibleColumns.map((column) => (
  <RedlineMetricCell key={column.id} column={column} row={row} />
))}
```

`RedlineMetricCell` es un componente local pequeño para conservar los cuatro
tratamientos semánticos existentes. No conoce persistencia, Studio, Wails ni
telemetría cruda. No se extrae una abstracción hasta que otro consumidor real
la necesite.

## Estrategia de pruebas

### Contrato del inspector

- En Redline, Posición y Piloto aparecen activos, bloqueados y explicados.
- En Original, Crystal y otras plantillas no cambia el inspector actual.
- El aviso aparece solo cuando la anchura configurada resulta insuficiente y
  desaparece al ensanchar el widget.
- Los handlers reales siguen escribiendo visibilidad, orden, anchura y alineación.

### Renderer Redline

- Cada métrica flexible activa aparece una vez y las inactivas no aparecen.
- El DOM respeta el orden configurado.
- SM/MD/LG y alineación producen estilos observables.
- Posición y Piloto sobreviven a documentos antiguos que los desactivaron.
- Todas las métricas activas funcionan con un widget suficientemente ancho.
- Un valor ausente muestra `—`; nunca se inventa información.
- Los fantasmas usan las mismas columnas que las filas vivas.

### Movimiento

- FLIP, flash, delta, entrada y retirada siguen pasando con distintas columnas.
- Gap activa batalla y presión; ocultarlo las desactiva. Intervalo nunca conduce
  la batalla.
- Best lap y neumático no generan señales visuales si su métrica está oculta;
  PIT conserva su estado de fila y su columna respeta visibilidad.
- Las duraciones, máximo de una batalla, prioridad por cercanía al jugador y
  cancelación/cleanup existentes no cambian.
- `prefers-reduced-motion` mantiene el comportamiento accesible vigente.

### Evidencia visual y runtime

- Capturas Redline con configuración predeterminada, mínima y todas las métricas
  en un widget ancho.
- Comparación de reposo para evitar regresiones en líder, jugador y clase.
- Secuencias de adelantamiento, batalla, mejor vuelta, pit-out y retirada.
- Verificación de Studio, Workshop y, cuando sea posible, Wails/WebView2 real.

## Límites

### Siempre

- Mantener `WidgetVisualHost` como única frontera.
- Preservar la identidad y altura de cada fila durante las animaciones.
- Escribir primero tests de regresión que fallen por el comportamiento actual.
- Mantener datos y procedencia en el ViewModel; el renderer solo presenta.
- Actualizar handoff, issue y roadmap si cambia su estado público.

### Consultar antes

- Cambiar la altura de fila o el diseño de los anclajes.
- Añadir una dependencia.
- Cambiar el contrato de cálculo o transportar señales nuevas desde Go.
- Ampliar el alcance a otra plantilla o widget.

### Nunca

- Crear un renderer duplicado, adaptador genérico, DSL o registro paralelo.
- Inventar valores para llenar una columna.
- Redimensionar automáticamente el documento del usuario.
- Debilitar las animaciones o sus tests para acomodar la rejilla.
- Modificar Tower, Strip, F1, WEC, LMU, Racelabs, Apex, Neo, Original o Crystal.

## Criterios de éxito

1. Todas las métricas flexibles de Redline respetan visibilidad, orden, anchura
   y alineación con efecto observable.
2. Posición y Piloto quedan fijos, visibles y honestamente bloqueados en Studio.
3. Un usuario puede mostrar las nueve métricas flexibles ensanchando el widget;
   Studio avisa antes de que el contenido quede recortado.
4. El aspecto predeterminado de Redline conserva su jerarquía, paleta, alturas,
   líder, jugador, slots y chip de clase.
5. Todas las animaciones existentes conservan semántica, duración, exclusión y
   cleanup; las ligadas a métricas ocultas no se muestran.
6. Los demás renderizadores mantienen DOM y comportamiento.
7. Tests focales, suite frontend, typecheck, build, lint aplicable y evidencia
   visual pasan; la evidencia Wails se distingue explícitamente de Workshop.

## Preguntas abiertas

Ninguna. Las decisiones de producto necesarias para planificar están cerradas.
