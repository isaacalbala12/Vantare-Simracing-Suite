# Resolved Bugs And Stabilization Log

Registro de bugs importantes ya cerrados, con causa raiz y reglas para no reabrirlos.

Este documento no sustituye a los planes detallados. Sirve como indice rapido para workers y reviewers.

## Estado actual

Ultima actualizacion: 2026-06-23.

Version estable relacionada: `v0.3.9.0`.

## Bugs cerrados

### Preview aislada usaba `PreviewWidgetFrame`

Estado: cerrado.

Sintoma:

- Widgets aparecian desplazados, recortados o anclados a una caja de layout incorrecta dentro de `WidgetStudio`.

Causa raiz:

- `WidgetStudio` reutilizaba una pieza pensada para previews de layout, con posicion absoluta, chrome, seleccion, drag/resize y clipping.

Solucion:

- Arquitectura separada: `WidgetPreviewPanel -> WidgetSandboxPreview -> PreviewScaler -> WidgetRenderer`.
- `PreviewWidgetFrame` queda reservado para `LayoutStudio` y previews de perfiles.

Regla:

- No reintroducir `PreviewWidgetFrame` en `WidgetStudio`.

### Relative compacto conservaba `position.h`

Estado: cerrado.

Sintoma:

- En modo `Reducir altura visual`, `Relative` se centraba usando una caja alta y parecia pegado abajo.

Causa raiz:

- La altura minima del sandbox seguia usando `position.h`.

Solucion:

- Compact `Relative` mide altura real del contenido.
- Fill mantiene altura declarada.

Regla:

- En compacto, la caja visual puede ser intrinseca.
- En fill, la altura puede seguir viniendo de `position.h`.

### Relative compacto conservaba espacio vacio a la derecha

Estado: cerrado.

Sintoma:

- El bloque compacto tenia cientos de pixeles vacios a la derecha.

Causa raiz:

- El root y las filas se estiraban al host aunque la suma real de columnas fuese menor.

Solucion:

- `Relative` compacto usa ancho intrinseco y `fit-content`.
- `WidgetRenderer fillHost={false}` evita `w-full` para previews intrinsecas.

Regla:

- La caja visible de una preview intrinseca debe coincidir con el contenido real.

### Standings no ensanchaba al activar columnas

Estado: cerrado.

Sintoma:

- `Standings` recortaba columnas opcionales o no crecia correctamente en la preview.

Causa raiz:

- `resolveWidgetPreviewBaseSize` solo calculaba ancho intrinseco para `Relative`.

Solucion:

- `Standings` tambien usa `getStandingsIntrinsicWidth` en la preview aislada.
- Tests cubren columnas default y columnas opcionales.

Regla:

- Todo widget configurable con columnas debe exponer o reutilizar un calculo de ancho intrinseco.

### WidgetStudio preview conservaba `position.w` y dejaba espacio derecho

Estado: cerrado en `v0.3.9.0`.

Sintoma:

- `Relative` fill y `Standings` dejaban mucho espacio vacio a la derecha aunque el contenido fuese mas estrecho.

Causa raiz:

- El sandbox usaba `Math.max(position.w, intrinsicWidth)`.
- Eso permitia crecer cuando faltaba ancho, pero nunca encoger cuando sobraba.

Solucion:

- En `WidgetStudio`, `Relative` y `Standings` usan ancho intrinseco.
- `LayoutStudio` y overlay runtime siguen usando `position.w/h`.
- `__previewFillHost` es un contexto runtime interno para que los widgets sepan si deben llenar host o envolver contenido.

Regla:

- `WidgetStudio` no edita tamano; por tanto su preview debe envolver contenido interno configurable.
- `LayoutStudio` edita tamano; por tanto ahi si aplica `position.w/h`.

### Relative fill perdio altura al usar ancho intrinseco

Estado: cerrado.

Sintoma:

- Tras PREVIEW2, `Relative` fill envolvia ancho correctamente pero no llenaba la altura declarada.

Causa raiz:

- `fillHost={false}` quitaba `w-full` y `h-full`.

Solucion:

- `fillHost={false}` solo hace opt-out del ancho.
- La altura se mantiene con `h-full` en el renderer y `Relative` fill intrinseco.
- Compact `Relative` sigue sin `h-full`.

Regla:

- Ancho intrinseco y altura fill son decisiones independientes.

### Autosave interrumpia controles de WidgetStudio

Estado: cerrado.

Sintoma:

- Al seleccionar opciones, el guardado automatico recargaba estado y deseleccionaba controles.

Causa raiz:

- `WidgetStudio` guardaba automaticamente cambios de configuracion mientras el usuario interactuaba.

Solucion:

- Guardado explicito en `WidgetStudio`.
- Cambios reales activan estado dirty y boton Guardar.
- Mock scenario es estado local de preview y no activa Guardar.

Regla:

- Controles de edicion de widgets no deben depender de autosave inmediato.

### Legacy profiles sin variant no podian activar columnas

Estado: cerrado.

Sintoma:

- Toggles de columnas en perfiles legacy no cambiaban visualmente ni persistian.

Causa raiz:

- El widget no tenia `variantId`, y `toggleRelativeColumn` devolvia el perfil original.

Solucion:

- Normalizacion frontend genera variante default para `relative`/`standings` cuando falta.

Regla:

- Los flujos de UI deben soportar perfiles legacy sin exigir migracion silenciosa en disco.

## Riesgos pendientes

- JSDOM no valida layout real. Sigue pendiente harness visual/browser con Playwright.
- `__previewFillHost` es runtime-only; no debe serializarse ni entrar al schema.
- `enrichWidgetPropsWithVariant` puede normalizar por render. Impacto menor, pero vigilar si crece el numero de widgets.
- `columns: []` sigue siendo semanticamente ambiguo para futuros cortes donde columnas base puedan deshabilitarse.

## Checks recomendados para bugs de preview

```powershell
pnpm --dir frontend test -- widget-preview-size WidgetSandboxPreview WidgetRenderer RelativeWidget StandingsWidget
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
```

## Verificacion manual recomendada

1. Abrir app reconstruida.
2. Ir a `Overlays Studio -> Widgets`.
3. Revisar `relative` fill, compact y columnas opcionales.
4. Revisar `standings` default, columnas opcionales y escenarios mock.
5. Revisar que `delta`, `telemetry`, `telemetry-vertical` y `pedals` no cambian comportamiento.
6. Revisar `LayoutStudio`: posicion/tamano siguen siendo su responsabilidad.
