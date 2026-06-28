# Widget Preview Bug Log

Registro de bugs y decisiones tomadas durante la estabilizacion de la preview aislada de `WidgetStudio`.

## Estado

Ultima actualizacion: 2026-06-23.

Estado actual: corregido tecnicamente y validado manualmente por el usuario en `Relative` y `Standings`, tanto con ancho intrinseco como con columnas opcionales.

Indice consolidado de bugs cerrados: `docs/resolved-bugs.md`.

## Contexto

`WidgetStudio` edita apariencia, datos, columnas, filtros y comportamiento interno del widget. No edita posicion ni tamano.

`LayoutStudio` edita posicion y tamano.

Por esa separacion, la preview aislada de `WidgetStudio` debe mostrar el widget seleccionado como sandbox visual, sin reutilizar comportamiento de layout, drag, resize, `x/y` o frame chrome.

## Arquitectura Correcta

- `WidgetRenderer`: render puro del widget.
- `PreviewScaler`: centra y escala una caja logica. Por defecto no amplia; solo reduce si no cabe.
- `WidgetSandboxPreview`: preview aislada para `WidgetStudio`.
- `PreviewWidgetFrame`: reservado para previews de layout/perfil.

`WidgetPreviewPanel` no debe usar `PreviewWidgetFrame`.

## Bugs Encontrados

### 1. Reutilizar `PreviewWidgetFrame` en `WidgetStudio`

Sintoma:

- `Relative` aparecia demasiado abajo, cortado o desplazado.
- Los fixes con padding, offsets o `transformOrigin` no resolvian el problema de forma fiable.

Causa:

- `PreviewWidgetFrame` mezcla render de widget, posicion absoluta, frame chrome, clipping, seleccion, drag/resize y layout preview.
- `WidgetStudio` necesitaba una preview aislada, no una caja de layout.

Solucion:

- Crear `WidgetRenderer`, `PreviewScaler`, `WidgetSandboxPreview`.
- Hacer que `WidgetPreviewPanel` delegue en `WidgetSandboxPreview`.
- Mantener `PreviewWidgetFrame` solo para `PreviewCanvas` y `ProfilePreview`.

### 2. `position.h` dominaba el modo compacto

Sintoma:

- En `Altura de filas -> Reducir altura visual`, el widget seguia centrando una caja alta.
- Parecia pegado al borde inferior o mal centrado.

Causa:

- `WidgetSandboxPreview` usaba `Math.max(baseSize.height, measuredHeight)`.
- `baseSize.height` venia de `widget.position.h`.
- En compacto, la preview debe poder medir la altura real del contenido sin conservar `position.h` como minimo visual.

Solucion:

- En Relative compacto, `minimumHeight` pasa a ser `1`.
- En modo fill, se mantiene `position.h`.
- `position.h` no se muta.

### 3. `WidgetRenderer` no llenaba el host en modo fill

Sintoma:

- Riesgo de que widgets que dependen de `h-full` no calculasen bien altura interna.
- `Relative` fill necesita altura del host para repartir filas.

Causa:

- Al extraer `WidgetRenderer`, se introdujo una capa intermedia sin `w-full h-full`.

Solucion:

- `WidgetRenderer` llena el host por defecto con `h-full w-full`.
- Se agrego `fillHost={false}` solo para casos de medicion intrinseca.

### 4. El shell de `WidgetStudio` tenia altura minima, no altura fija

Sintoma:

- El widget quedaba visualmente pegado al medio/bajo del area visible.
- El centrado se hacia contra una pagina mas alta que el viewport visible.

Causa:

- El contenedor principal usaba `min-h-[calc(100vh-3.5rem)]`.
- Con padding y settings largos, el area podia crecer y el centro logico no coincidia con el centro visible.

Solucion:

- Cambiar el shell a `h-[calc(100vh-3.5rem)]`.
- Mantener scroll en el panel de settings.

### 5. `PreviewScaler` ampliaba por defecto

Sintoma:

- La preview no se veia como el overlay real; parecia una version ampliada para llenar espacio.

Causa:

- `PreviewScaler` tenia `maxScale = 2` por defecto.
- La preview debe representar el tamano real y solo reducir si no cabe.

Solucion:

- Cambiar `maxScale` por defecto a `1`.
- Si en el futuro se quiere zoom, debe ser una opcion explicita.

### 6. Relative compacto conservaba espacio vacio a la derecha

Sintoma:

- El bloque compacto tenia cientos de pixeles vacios a la derecha.
- En overlay real ese espacio no existe.

Causa:

- `RelativeWidget` compacto seguia usando `w-full`.
- Las filas se estiraban al host aunque la suma real de columnas fuese menor.

Solucion:

- En modo compacto, `RelativeWidget` usa `inline-flex` y `width: intrinsicWidth`.
- En modo fill, mantiene `w-full h-full`.
- `getRelativeIntrinsicWidth` usa los mismos anchos default que las celdas.

### 7. El widget compacto seguia desplazado a la izquierda dentro de la preview

Sintoma:

- El tamano era correcto, pero el bloque quedaba a la izquierda del checkerboard.

Causa:

- `WidgetSandboxPreview` media un `contentRef` cuyo ancho estaba forzado a `logicalSize.width`.
- `WidgetRenderer` con `fillHost={false}` seguia creando una caja ancha.
- El widget visible era `fit-content`, pero estaba alineado a la izquierda dentro de una caja invisible mas ancha.

Solucion:

- En modo compacto, `contentRef` usa `width: fit-content`.
- `WidgetRenderer fillHost={false}` usa `width: fit-content` y no aplica `w-full`.
- `logicalSize.width` pasa a representar el tamano visible real.

### 8. Fill/Standings previews conservaban `position.w` y dejaban espacio vacio a la derecha

Sintoma:

- `Relative` fill y `Standings` mostraban un area vacia ancha a la derecha en `WidgetStudio`.
- La caja de la preview reflejaba el ancho de `LayoutStudio` en vez del ancho real del contenido del widget.

Causa:

- `resolveWidgetPreviewBaseSize` usaba `Math.max(position.w, intrinsicWidth)`, que expandia pero nunca encojia.
- `WidgetSandboxPreview` solo usaba `fit-content` para `Relative` compacto; fill y `Standings` seguan fijando `position.w`.
- Las filas de `RelativeWidget` y `StandingsWidget` usaban `width:max(100%, intrinsicWidth)`, estirandose al padre.
- `StandingsWidget` no tenia modo intrinsic/`fillHost`, por lo que en el sandbox siempre estiraba a `position.w`.

Solucion:

- En el sandbox de `WidgetStudio`, los widgets configurables con ancho intrinseco (`relative`, `standings`) usan el ancho intrinseco real, sea menor o mayor que `position.w`.
- `position.h` sigue usandose para la altura en modo fill.
- El modo intrinsic del sandbox se aplica cuando `baseSize.mode === "intrinsic"` o `Relative` esta en compacto.
- `WidgetRenderer` propaga un contexto interno runtime `__previewFillHost` a los widgets; estos envuelven el contenido (filas + root) cuando es `false`.
- Los overlays runtime y `LayoutStudio` siguen usando `position.w/h` porque `__previewFillHost` no llega fuera de `WidgetRenderer`.

### 9. Overlay desktop shrink-wrap con origen cero

Sintoma:

- Al abrir el overlay desktop desde la app, los widgets aparecian dentro de una caja transparente pequena, recortada o desplazada sobre el Hub.
- Visualmente parecia que el overlay ya no estaba a pantalla completa.

Causa:

- El refactor del modo de edicion in-place hizo que la factoria Wails aplicara `window.Manager.ApplyProfile(profile, false)` tambien al overlay desktop de carrera.
- `ModeRacing` pasaba por el camino de shrink-wrap de `window.Manager`.
- El frontend recibia `layoutOrigin={0,0}`, por lo que posiciones absolutas de perfil 1920x1080 se renderizaban dentro de una ventana shrink-wrap.

Solucion:

- El runtime desktop Wails en `ModeRacing` y `ModeEdit` debe ser fullscreen.
- `ModeRacing` es fullscreen + click-through.
- `ModeEdit` es fullscreen + interactivo.
- `layoutOrigin` debe ser `{0,0}` en ambos modos desktop fullscreen.
- `applyShrinkWrap` no debe usarse en el camino desktop racing/edit.

Regla nueva:

- No reutilizar logica de shrink-wrap para corregir o simplificar el overlay desktop. Shrink-wrap solo es valido si la superficie tambien propaga al frontend el origen real calculado.
- Cualquier cambio en `internal/window/manager.go`, `ProfileService.EmitLoaded`, `OverlayController` o la factoria Wails debe comprobar que racing/edit siguen fullscreen.

## Reglas Para Futuros Workers

- No corregir previews con offsets magicos (`translateX`, padding arbitrario, `center 40%`, etc.).
- No volver a usar `PreviewWidgetFrame` en `WidgetPreviewPanel`.
- No mezclar `WidgetStudio` con posicion/tamano.
- Si un widget se ve mal en preview, revisar primero:
  - caja visible real,
  - `logicalSize`,
  - `contentRef`,
  - `scrollWidth`,
  - `getBoundingClientRect`,
  - `fillHost`,
  - `position.w/h` como minimo visual.
- En `WidgetStudio`, los widgets configurables (`relative`, `standings`) usan ancho intrinseco. No usar `position.w` como ancho minimo visual alli.
- En `LayoutStudio` y overlays runtime, `position.w/h` sigue siendo el contrato de layout.
- En compacto, el tamano visual puede ser intrinseco.
- En fill, el alto visual respeta `position.h`; el ancho es intrinseco en `WidgetStudio`.
- `__previewFillHost` es contexto runtime interno de `WidgetRenderer`; no persistirlo en schema ni variantes.
- En el overlay desktop Wails, `ModeRacing` y `ModeEdit` son fullscreen con `layoutOrigin={0,0}`. No aplicar shrink-wrap ahi.

## Tests Que Protegen Este Flujo

Tests focales:

```powershell
pnpm --dir frontend test -- PreviewScaler WidgetSandboxPreview WidgetPreviewPanel RelativeWidget relative-format WidgetRenderer
```

Checks completos recomendados:

```powershell
pnpm --dir frontend test
pnpm --dir frontend lint
pnpm --dir frontend build
git diff --check
```

## Verificacion Manual

1. Reconstruir y abrir la app.
2. Entrar en `Overlays Studio -> Widgets -> relative`.
3. Activar `Mostrar mejor vuelta` y `Mostrar ultima vuelta`.
4. Cambiar `Altura de filas` a `Reducir altura visual`.
5. Verificar:
   - el bloque no conserva espacio vacio a la derecha;
   - el bloque queda centrado en el checkerboard;
   - las columnas siguen alineadas;
   - no hay clipping;
   - el modo fill sigue respetando el alto/ancho guardado.

## Riesgo Pendiente

JSDOM no verifica layout visual real. Sigue siendo recomendable crear un harness visual/browser con Playwright para detectar regresiones de centrado, clipping y cajas invisibles.
