# Inventario Técnico y de Diseño: Pedals Widget (P1)

Este documento detalla el estado actual del widget de pedales (`PedalsWidget`), el modelo de datos de telemetría de Go, las transformaciones en el frontend, la configuración de perfiles y los riesgos identificados para el desarrollo de la beta privada de Vantare Overlays Studio.

---

## 1. Resumen ejecutivo

El widget de pedales actual (`PedalsWidget`) en Vantare Overlays Studio es un panel grande de telemetría (con un tamaño por defecto de `530x80` px) que combina la marcha y velocidad, barras verticales de embrague, freno y acelerador, un icono de volante y un lienzo de historial gráfico en tiempo real.

Este inventario ha analizado el pipeline completo de datos, desde la lectura de la memoria compartida de LMU en Go hasta la normalización y renderizado en el frontend. Los hallazgos principales revelan que:
- Los datos de pedales en el backend están disponibles y son fiables en el rango `0.0..1.0`.
- El frontend realiza la normalización a porcentaje (`0..100`) de forma reactiva.
- El volante actual realiza una animación oscilatoria ficticia (fake) y no utiliza el dato real de `Steering`.
- El renderizado utiliza manipulación directa del DOM con un bucle de presupuesto de frames a alta frecuencia (30Hz), garantizando un excelente rendimiento.
- Se recomienda que la versión **Pedals Beta v1** (a diseñar en P2 e implementar en P3) sea un widget compacto y enfocado exclusivamente en las barras de pedales, eliminando elementos secundarios para asegurar la legibilidad en pantalla.

---

## 2. Estado actual del widget

### Archivos de código inspeccionados
- **Componente React:** [PedalsWidget.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/PedalsWidget.tsx)
- **Tests Frontend:** [PedalsWidget.test.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/PedalsWidget.test.tsx)
- **Widgets Relacionados:** [TelemetryWidget.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/TelemetryWidget.tsx) y [TelemetryVerticalWidget.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/TelemetryVerticalWidget.tsx)

### Registro y Rutas de Renderizado
El widget está completamente integrado en el pipeline de overlays de la aplicación:
1. **Catálogo del Hub:** Registrado en [WidgetList.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/hub/preview/WidgetList.tsx) bajo el tipo `"pedals"`, compartiendo el icono genérico de telemetría.
2. **Preview del Hub:** Renderizado reactivamente en [WidgetRenderer.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/hub/preview/WidgetRenderer.tsx) mediante la clave `pedals`.
3. **Overlays en Runtime:** Registrado de forma idéntica para el overlay de escritorio en [CompositeApp.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/CompositeApp.tsx) y para OBS en [ObsOverlayApp.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/ObsOverlayApp.tsx).

### Cobertura de Pruebas Unitarias Existentes
El archivo `PedalsWidget.test.tsx` contiene 2 pruebas básicas que ejecutan con éxito mediante Vitest:
- Verifica que las etiquetas `THR`, `BRK` y `CLU` se renderizan en modo edición.
- Verifica que el widget acepta un color de acento personalizado (`accentColor`) sin fallar.

---

## 3. Datos disponibles

### Modelo de Datos en Go
El modelo de datos se define en la estructura `PlayerTelemetry` dentro de [telemetry.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/pkg/models/telemetry.go):
- **Estructura:** `models.PlayerTelemetry`
- **Campos de Pedales:**
  - `Throttle` (tipo `float64`, etiqueta JSON: `json:"throttle,omitempty"`)
  - `Brake` (tipo `float64`, etiqueta JSON: `json:"brake,omitempty"`)
  - `Clutch` (tipo `float64`, etiqueta JSON: `json:"clutch,omitempty"`)
  - `Steering` (tipo `float64`, etiqueta JSON: `json:"steering,omitempty"`)

### Lector y Parser de Memoria Compartida LMU
El decodificador lee los bytes de la memoria mapeada en [parser.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/lmu/parser.go):
- Se extraen directamente los valores filtrados utilizando `readFloat64` con los offsets de la estructura física definidos en [offsets.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/lmu/offsets.go):
  - `Throttle`: `readFloat64(buf, po+vehicleTelemetryFilteredThrottle)` (Offset 420)
  - `Brake`: `readFloat64(buf, po+vehicleTelemetryFilteredBrake)` (Offset 428)
  - `Clutch`: `readFloat64(buf, po+vehicleTelemetryFilteredClutch)` (Offset 444)
  - `Steering`: `readFloat64(buf, po+vehicleTelemetryFilteredSteering)` (Offset 436)

### Estado en Pruebas del Backend (Go)
- **Datos Sintéticos:** [synthetic.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/lmu/synthetic.go) inicializa el búfer de pruebas en `0` para acelerador, freno y embrague.
- **Tests Unitarios:** `parser_test.go` incluye pruebas funcionales (ej. `TestParsePlayerTelemetryReadsFloat32TimeGapsAndClutch`) donde se inyectan valores float64 reales para validar la lectura del embrague.
- **Tests de Fixtures de Integración:** [fixture_integration_test.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/lmu/fixture_integration_test.go) verifica la lectura de `throttle` y `brake` desde un archivo binario real de LMU (`lmu-fixture.bin`), pero **no incluye ni valida el embrague (`clutch`) ni la dirección (`steering`)** en el mapa del archivo JSON de soporte (`lmu-fixture.json`).

---

## 4. Normalización y unidades

### Comportamiento en Go
No hay transformaciones de escala ni normalización en el backend. Los valores de pedales y dirección se transmiten en crudo a través del pipeline.
- Para LMU (basado en rFactor 2), los valores en memoria se exponen como flotantes de doble precisión (`float64`) en el rango **`0.0` (suelto) a `1.0` (totalmente presionado)**.

### Comportamiento en el Frontend (Normalización Reactiva)
La conversión se realiza en [telemetry-ref.ts](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/lib/telemetry-ref.ts) al procesar el snapshot mediante el helper `normalizeInputToPercent`:
```typescript
function normalizeInputToPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Live sims send 0..1; HTML gauges expect 0..100. If already >1, assume percent.
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}
```
- **Rango 0..1:** Si el valor es menor o igual a 1 (como los datos reales de LMU), se multiplica por 100 y se redondea (`0.42` -> `42%`).
- **Rango 0..100:** Si el valor es mayor que 1 (como los datos generados por mocks en el frontend, ej. `78`), se asume porcentaje y solo se redondea.
- **Casos Especiales:**
  - **`undefined` o `null`:** Se omiten en la actualización, manteniendo el último valor recibido o `0` por defecto.
  - **`NaN` o `Inf`:** Devuelve de forma segura `0`.
  - **Negativos:** Valores menores a 0 (ej. `-0.5`) caen bajo la regla `<= 1`, transformándose en porcentajes negativos (ej. `-50`).
  - **Valores mayores a 100:** No se limitan (ej. `105` se mantiene como `105`).

### Comportamiento en el Pipeline de Red (Diff/Filtros)
En el backend, tanto en [diff.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/diff/diff.go) como en [filter.go](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/internal/telemetry/pipeline/filter.go), se aplica un filtro de ruido a las señales de los pedales y dirección:
- **Umbral de Cambio:** `0.01` (1% de diferencia).
- **Lógica:** Si el cambio en el pedal entre ticks sucesivos es menor a `0.01` (en la escala `0.0..1.0`), la actualización no se emite hacia el cliente frontend. Esto evita la saturación de mensajes de red por oscilaciones milimétricas de los potenciómetros físicos.

---

## 5. Render y comportamiento actual

### Estructura Visual del Componente
El widget actual (`PedalsWidget`) está diseñado en una estructura rígida horizontal:
1. **Bloque Izquierdo (Marcha y Velocidad):** Ocupa `90px` fijos. Tiene un fondo diagonal con el color de acento y muestra la marcha en un tamaño de `42px` y la velocidad redondeada debajo.
2. **Bloque Central (Indicadores de Pedales):** Tres barras de progreso verticales con inclinación oblicua (`skewX(-10deg)`) y fondo negro.
   - **Clutch (Embrague):** Barra azul con etiqueta **`CLU`** (ojo: difiere de la especificación de diseño de plan que propone `CLT`).
   - **Brake (Freno):** Barra roja con etiqueta **`BRK`**.
   - **Throttle (Acelerador):** Barra verde con etiqueta **`THR`**.
3. **Bloque Derecho (Lienzo e Historial):** Ocupa todo el ancho restante (`flex-1`).
   - **Historial (Canvas):** Un elemento `<canvas>` que dibuja trazos continuos (glowing paths) para el acelerador (verde) y el freno (rojo) sobre un búfer histórico circular de 100 muestras.
   - **Volante:** Un icono SVG de volante a la izquierda del canvas. **El movimiento del volante es ficticio:** ejecuta una rotación oscilatoria continua en bucle mediante `Math.sin(fase)`, ignorando por completo la telemetría real del canal `Steering`.

### Mecanismo de Actualización en Pantalla
Para evitar el coste de renderizado y reconciliación de React en componentes con actualizaciones de alta frecuencia (30Hz), el widget utiliza referencias directas del DOM (`useRef`):
- Los elementos de texto y barras modifican directamente sus atributos `innerText` y `style.height` usando los helpers eficientes de [dom-write.ts](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/lib/dom-write.ts) (`setTextIfChanged`, `setStylePropertyIfChanged`).
- El canvas se redibuja en cada frame de animación limpiando y trazando la ruta bidimensional.

### Duplicidad de Código y Estilos
Los widgets de telemetría general [TelemetryWidget.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/TelemetryWidget.tsx) y [TelemetryVerticalWidget.tsx](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/overlay/widgets/TelemetryVerticalWidget.tsx) duplican de forma imperativa la visualización de los pedales:
- `TelemetryVerticalWidget` dibuja barras verticales similares para `CLU`, `BRK` y `THR` sin canvas histórico.
- `TelemetryWidget` (horizontal) dibuja barras horizontales solo para `THR` y `BRK` (excluyendo el embrague).
- Los tres componentes resuelven sus estilos de forma independiente.

---

## 6. Apariencia y configuración existente

### Registro en el Catálogo de Estilos
El widget de pedales está registrado en [style-catalog.ts](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/frontend/src/hub/state/style-catalog.ts) con un único estilo por defecto:
```typescript
pedals: [
  {
    id: "vantare-racing",
    name: "Vantare Racing",
    defaults: {
      accentColor: "#9b2226",
      textColor: "#FFFFFF",
      backgroundColor: "#1a0104",
      pedalThrottleColor: "#2ecc71",
      pedalBrakeColor: "#e74c3c",
      pedalClutchColor: "#3498db",
    },
  },
]
```

### Resolución de Estilos y Propiedades Heredadas
El helper `resolveWidgetAppearance("pedals", props)` garantiza la disponibilidad completa de las propiedades visuales. Hereda u otorga valores seguros por defecto para propiedades estructurales que no define el catálogo, como `opacity` (valor por defecto `1`) y `borderColor` (valor por defecto `"#9b2226"`).

### Perfiles de Usuario y Configuración por Defecto
En [example-racing.json](file:///c:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/configs/example-racing.json), el widget se incluye activado en el lienzo por defecto con dimensiones de **`530` de ancho y `80` de alto**, guardando los colores por defecto en la sección `props.appearance`.
Actualmente, **no existen variantes de widgets** (Widget Variants) específicas para pedales. El usuario no puede personalizar qué pedales mostrar, ni cambiar la orientación, ni ocultar textos desde `WidgetStudio` porque el widget carece de selectores o propiedades avanzadas de configuración.

---

## 7. Problemas y riesgos

1. **Simulación de Volante Engañosa:** El icono de volante en `PedalsWidget` se mueve de forma autónoma simulando una oscilación armónica sin relación con la telemetría real. Si un usuario gira el volante físico, el widget no lo reflejará correctamente. Para la beta, esto debe corregirse en el nuevo diseño (eliminando el volante o conectándolo a `Steering`).
2. **Duplicidad de Código:** La lógica visual de las barras de pedales está duplicada en tres componentes. Sin embargo, dado el principio de realizar *el cambio seguro más pequeño posible*, refactorizar esto a un componente común de pedales podría introducir riesgos de regresión visual en los widgets de telemetría existentes. Es más seguro desarrollar el nuevo PedalsWidget aislado.
3. **Ausencia de Embrague en Fixtures de Integración:** El test de integración de Go no comprueba la validez del embrague contra los fixtures. Si el parser de LMU rompiese el mapeo de `clutch` en el futuro, los tests de Go seguirían pasando en verde.
4. **Falta de Limitación (Clamping) en Normalización:** Si la API devuelve por error un valor de pedal fuera del rango normal (ej. `< 0` o `> 1.0`), la función `normalizeInputToPercent` producirá valores extraños (ej. alturas de barra negativas o desbordadas superiores al `100%`).
5. **Nombres de Etiquetas Discrepantes:** El código actual usa `CLU` para embrague, mientras que los documentos de diseño proponen `CLT` (Clutch). Debemos unificar criterios para la beta privada.

---

## 8. Decisiones recomendadas para P2

Para el diseño visual y estructural en **P2 - Pedals nuevo diseño pequeño**, se recomiendan formalmente las siguientes decisiones de producto:

1. **Diseño Compacto e Independiente:** Pedals beta v1 debe ser un widget pequeño y legible (por ejemplo, con dimensiones cercanas a `150x80` o similar), diseñado para apilarse limpiamente. No debe arrastrar el bloque de marchas, velocidad, volante o historial de canvas del widget heredado.
2. **Soporte de Tres Pedales:** Debe mostrar de forma obligatoria acelerador (`Throttle`), freno (`Brake`) y embrague (`Clutch`).
3. **Uso de Datos Normalizados:** El renderizado debe basarse estrictamente en la escala `0..100` ya normalizada por el frontend.
4. **Separación de Responsabilidades:** El editor `WidgetStudio` permitirá cambiar colores internos, visibilidad de etiquetas y comportamiento, pero **nunca** su posición o tamaño en el lienzo (responsabilidad de `LayoutStudio`).
5. **Esquema Conservador:** Se evitará la creación de un nuevo esquema de base de datos o perfil de configuración. Toda personalización visual avanzada (ej. orientación) debe ir mapeada en campos clave existentes del objeto `props.appearance` para no romper la compatibilidad de perfiles v2.
6. **Robustez mediante Tests:** Se deben añadir pruebas de renderizado estricto y aserciones de valores límite (valores negativos, superiores a 100 e indefinidos) antes de proceder con cualquier rediseño visual en el código de producción.

---

## 9. Contrato propuesto para P3

Para la fase de desarrollo e implementación técnica (**P3 - Pedals throttle/brake/clutch render**), se define el siguiente contrato operativo:

- **Input:** Campos de telemetría de entrada: `throttle`, `brake`, `clutch` normalizados en el rango `0..100`.
- **Estrategia ante Fallos (Fallback):** Cualquier valor nulo, indefinido, infinito o no válido se renderizará visualmente como `0%` (barra vacía), evitando la aparición de textos rotos como `NaN%`.
- **Renderizado Visual:** Tres barras de progreso verticales u horizontales según se decida en P2, con etiquetas fijas de alta legibilidad (`THR`, `BRK`, `CLT` o las equivalentes en español/marca aprobadas).
- **Rendimiento:** Las actualizaciones visuales continuarán realizándose mediante referencias del DOM (`useRef`) y manipulación directa de estilos para no sobrecargar el hilo de renderizado de React a alta frecuencia (30Hz o superior).
- **Editor WidgetStudio:** No se expondrán bajo ningún concepto mandos de posición, escala, tamaño o borrado dentro del panel de ajustes de `WidgetStudio`.
- **Registro Global:** Se reutilizará el pipeline de integración actual en `WidgetRenderer`, `CompositeApp`, `ObsOverlayApp` y `WidgetList` para que los overlays de escritorio, OBS y previews rendericen la nueva estructura de forma transparente.
- **Tests Automatizados:** El archivo `PedalsWidget.test.tsx` debe ampliarse para certificar que:
  - Se renderizan exactamente los tres controles de pedales.
  - Se realiza la limitación correcta (clamping) de valores extremos.
  - El componente responde correctamente a los cambios de colores de apariencia del catálogo.

---

## 10. Checklist de verificación manual futura

Una vez implementado el renderizado en P3, los testers y desarrolladores deberán verificar manualmente los siguientes puntos clave:

- [ ] **Modo Demo/Mock en el Hub:** Al activar el modo demo o mock en Overlays Studio, las tres barras del widget de pedales deben reaccionar y animarse fluidamente.
- [ ] **Modo Live con LMU:** Con el simulador LMU activo, las barras del widget deben sincronizarse en tiempo real con las presiones físicas sobre los pedales del simulador.
- [ ] **Renderizado en OBS:** La URL del overlay abierta en OBS Studio debe mostrar el widget de pedales con su nuevo diseño compacto sin desbordes ni problemas de escalado.
- [ ] **Persistencia en el Hub:** Modificar los colores del acelerador, freno y embrague en `WidgetStudio` debe actualizar la preview de forma inmediata y persistirse correctamente en el perfil al guardar.
- [ ] **Ajuste en LayoutStudio:** Comprobar que el widget de pedales puede arrastrarse y colocarse en cualquier parte de la pantalla mediante el canvas de `LayoutStudio` de forma fluida.
- [ ] **Comprobación de Extremos:** Suministrar manualmente a través del mock valores extremos de pedales (ej. `< 0` y `> 100`) y confirmar que las barras se limitan visualmente a vacío y lleno respectivamente sin desbordar el contenedor.
