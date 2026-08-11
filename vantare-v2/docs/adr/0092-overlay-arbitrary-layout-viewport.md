# ADR 0092 — Superficie arbitraria y paridad de resolución del overlay

- Estado: aceptada para ISA-326
- Fecha: 2026-08-11
- Sustituye, solo para resolución del lienzo, la exclusión de alcance de ADR 0003
- Issue: ISA-326

## Contexto

Overlay Studio V3 usa hoy un lienzo lógico global de 1920 × 1080. El selector
llamado «resolución» solo cambia el espacio usado para calcular el zoom de la
previsualización; no cambia el documento, los límites de drag/resize ni la
geometría que consumen Desktop y OBS. Por eso un preset ultrawide sigue siendo
un documento 16:9 y la posición vista en Studio puede no coincidir con la del
overlay real.

`monitorIndex` se persiste, pero la selección y enumeración nativa de monitores
continúa reservada en el runtime actual. No debe fingirse esa capacidad usando
el tamaño de la ventana del Hub.

## Decisión

### 1. La resolución pertenece al documento

El documento V3 admite `layoutViewport`:

```json
{
  "layoutViewport": { "width": 3440, "height": 1440 }
}
```

Sus unidades son píxeles CSS/DIP, no píxeles físicos. Un documento V3 antiguo
sin el campo conserva exactamente su geometría y se interpreta como
1920 × 1080. El campo es una ampliación retrocompatible del schema V3; no se
cambia `schemaVersion` porque no invalida ningún lector ni exige transformar
coordenadas existentes. Al modificar la superficie desde Studio, el campo sí
se guarda de forma explícita y participa en dirty/undo/redo/save.

La superficie válida usa enteros finitos positivos dentro de límites de
seguridad compartidos por TypeScript y Go. Los widgets se validan y recuperan
contra la superficie resuelta del documento, nunca contra constantes globales.

### 2. Una transformación pura y compartida

Studio, Desktop y OBS consumen la misma función pura:

```text
scale   = min(outputWidth / layoutWidth, outputHeight / layoutHeight)
offsetX = (outputWidth  - layoutWidth  * scale) / 2
offsetY = (outputHeight - layoutHeight * scale) / 2
```

La transformación es uniforme (`contain`), con origen explícito. No deforma
widgets, no recorta contenido y no aplica DPI dos veces. Cuando salida y
documento coinciden, `scale = 1` y `offset = 0`.

El `layoutOrigin` heredado de ventanas shrink-wrap se normaliza antes de esta
transformación. No se permite que Desktop, OBS y el preview mantengan fórmulas
independientes.

### 3. Studio representa la superficie real

El rectángulo delimitado del canvas es `layoutViewport`. El escenario exterior
es solo espacio de trabajo. Fit calcula cómo mostrar ese rectángulo dentro del
espacio disponible; los porcentajes de zoom siguen siendo zoom visual y no
resoluciones encubiertas.

El control de superficie ofrece presets como atajos y entrada personalizada
`width × height`. No agrupa la capacidad por relaciones 16:9, 21:9 o 32:9: se
acepta cualquier tamaño válido. Cambiar la superficie no escala ni recoloca en
silencio los widgets; mantiene sus coordenadas y muestra cualquier elemento que
deba recuperarse con las reglas existentes.

### 4. Política ante proporciones distintas

La adaptación automática completa entre proporciones distintas requeriría un
contrato adicional de anclajes/reflow por widget. ISA-326 no lo inventa ni lo
infiere. Hasta que exista ese contrato, una salida de proporción distinta usa
`contain` centrado y deja bandas transparentes. Es una degradación explícita y
reversible, preferible a estirar o recortar silenciosamente.

Diseñar el perfil con la superficie exacta del monitor usa todo el monitor,
incluidos ultrawide, super-ultrawide y tamaños personalizados. Los presets son
solo comodidad, no una lista de resoluciones permitidas.

### 5. DPI y monitor

Las dimensiones del runtime se toman del viewport CSS real. `devicePixelRatio`
no multiplica las coordenadas del documento. La enumeración, selección y
movimiento de la ventana a `monitorIndex` solo se añadirá mediante una capacidad
nativa comprobable; si no existe en la base actual, tendrá issue dependiente y
no bloqueará la paridad geométrica de ISA-326.

`WidgetVisualHost` y los renderizadores visuales no conocen resolución,
persistencia ni posición. Solo cambia el marco que los coloca.

## Consecuencias

- Un perfil puede diseñarse para cualquier resolución sin estar limitado a una
  relación de aspecto predefinida.
- Los perfiles existentes abren como 1920 × 1080 sin migración destructiva.
- Studio, Desktop y OBS comparten escala y origen observables.
- Un mismo perfil no ocupa automáticamente toda una salida con otra proporción;
  eso queda visible y requiere un contrato posterior de anclajes/reflow.
- La aplicación Hub continúa siendo fluida; la superficie del documento es el
  único rectángulo con dimensiones lógicas fijas.

## Verificación requerida

- Contrato y transformación: 1280×720, 1920×1080, 2560×1440, 3840×2160,
  3440×1440, 5120×1440 y al menos un tamaño personalizado no predefinido.
- Compatibilidad: documento V3 sin `layoutViewport` produce 1920×1080 y las
  mismas coordenadas.
- Paridad: el mismo documento y viewport producen la misma caja final en
  Studio, Desktop y OBS.
- Diferente proporción: escala uniforme, offset centrado y cero deformación.
- UI: el Hub no impone un ancho máximo al workspace de perfiles y sus paneles
  siguen siendo utilizables en anchos compactos.
