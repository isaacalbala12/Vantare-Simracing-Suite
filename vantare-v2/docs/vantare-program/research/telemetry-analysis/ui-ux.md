# UI/UX de referencia y accesibilidad

La referencia HTML es una composición propia inspirada en patrones funcionales de la matriz: resumen antes de trazas, mapa/cursor/series sincronizados, y evidencia visible. No reproduce assets, textos, layout ni identidad de un competidor.

## Estructura de información

| Vista | Pregunta del usuario | Contenido imprescindible | Acción |
|---|---|---|---|
| Galería | “¿Qué tengo para analizar?” | sesiones, origen, sim/track/vehículo, fecha, estado, búsqueda y filtros | indexar o abrir |
| Resumen | “¿Dónde gano más tiempo?” | referencia, compatibilidad, mejor/consistencia/teórica y tres tarjetas | abrir zona/workspace |
| Workspace | “¿Por qué sucede y qué pruebo?” | mapa, trazas, canales, tabla y cursores enlazados | seleccionar canal/zona, guardar nota |
| Estados | “¿Por qué no aparece un análisis?” | falta de referencia/distancia/licencia/importación y ruta de corrección | reintentar, elegir otra fuente o ver límites |

## Interacción y estados

La referencia TA-01 demuestra navegación de tabs con teclado, selección ilustrativa de vuelta A/B, activación de hasta dos trazas extra, elección de canal y enfoque de una zona desde la tabla. Estas acciones actualizan un estado textual compartido para evidenciar el contrato de sincronización sin fingir que el gráfico contiene telemetría real. El scrubbing, zoom y renderizado enlazado real pertenecen a TA-07 y deberán validarse contra ViewModels y datos canónicos.

En el producto, al elegir una tarjeta o fila, mapa, tabla y gráfico enfocan el mismo intervalo; el foco programático no roba teclado durante el scrubbing. Los datos se etiquetan con unidad, calidad y procedencia. Una tarjeta de baja confianza no se colorea como orden; usa copy que explica la insuficiencia.

Los gráficos no dependen solo del color: referencia usa patrón/línea sólida, comparada línea segmentada y el estado se expone en texto. La tabla es alternativa operable a gráfico/mapa. Respeta `prefers-reduced-motion`, alto contraste y zoom 200%; la referencia usa controles semánticos, labels y live region concisa.

## Criterios de aceptación visual futuros

- 1440×900: resumen muestra KPIs y tres tarjetas sin scroll horizontal; workspace mantiene tabla alternativa y canales legibles.
- 1024×768: el inspector puede colapsarse sin perder la selección ni el estado de compatibilidad.
- 390×844: no intenta miniaturizar cinco paneles; usa tabs/paneles secuenciales y retiene la acción “ver evidencia”.
- Teclado: `Tab`, `Shift+Tab`, flechas en tabs y `Enter/Espacio` activan todos los controles; nunca hay canvas imprescindible.
- Sin datos: no aparecen series, mapa o métricas ficticias; el CTA describe requisito real.

## Decisiones visuales de Vantare

El resumen usa jerarquía de “pérdida → evidencia → acción”; la vista avanzada usa dark cockpit legible, no densidad gratuita. La línea de trazada es abstracta y propia. El copy evita “AI dice” y sustituye por “regla X observó Y”. Setup se presenta como “contexto de comparación”, no como explicación causal.
