# Pedals telemetry compact: adaptación visual a Eficiencia

## Objetivo

Adaptar `pedals-telemetry-compact` cuando se muestra con el sistema `vantare-iracing` para que su apariencia sea la del widget de Eficiencia, no una reinterpretación del panel iRacing. El contrato de datos y los controles del Workshop se mantienen.

## Diagnóstico

La implementación actual (`PedalsAdvancedIracing.tsx` + `iracing-tokens.css`) define una identidad propia: marcha ámbar, panel compacto con radios iRacing, barras verticales y un SVG de volante. Esa composición no comparte la jerarquía visual de Eficiencia. El sistema de Eficiencia es la referencia canónica; sus superficies, radios, espaciado, tipografía y colores semánticos deben gobernar el resultado.

## Decisión de diseño

- Mantener el mismo widget, sus datos (`gear`, velocidad, RPM, clutch, brake y throttle), los interruptores `showSpeed`, `showRpm` y `showClutch`, y el tamaño responsive existente.
- Rehacer solo la capa visual para copiar la geometría del widget de Eficiencia: panel funcional oscuro, borde fino, radio pequeño, padding y jerarquía de texto equivalentes, sin cápsula ni acabado específico de iRacing.
- Usar la paleta semántica de Eficiencia: texto blanco/gris neutro, acelerador verde apagado, freno rojo apagado y embrague ámbar apagado. La marcha deja de ser ámbar dominante.
- Conservar la estructura informativa de Eficiencia: bloque de marcha/velocidad/RPM, barras C/B/T con sus porcentajes y un cierre derecho neutro. No se añadirá ninguna composición alternativa.
- Retirar el SVG del volante del layout visible. El valor `steering` permanece en el view-model para no romper el contrato, pero no fuerza una columna ni una identidad visual ajena al sistema.
- Mantener la identidad técnica `vantare-iracing` y sus rutas de registro; solo se modifica la presentación de este renderer.

## Responsive y estados

- El widget debe seguir ocupando todo el rectángulo declarado por el host y funcionar desde el mínimo de `190 × 68` sin desbordamiento.
- Las barras y los bloques de texto se comprimen con `min-width: 0`, truncado seguro y proporciones flexibles; no se introducen tamaños absolutos que reabran el problema en Studio.
- Los estados no listos mantienen el mensaje accesible y atenúan la representación de datos siguiendo el patrón de Eficiencia.

## Límites de implementación

El cambio queda limitado al renderer y tokens de `vantare-iracing`, más sus tests específicos. No se modifican los tokens compartidos de Eficiencia, el contrato del widget, el registro global ni los cambios concurrentes de otros agentes.

## Verificación

- Tests del renderer: estructura, valores, toggles, estados y ausencia del SVG del volante.
- Typecheck y build del frontend.
- Revisión visual en Workshop con tamaño default, escala reducida y mínimo declarado; se comprobará que no haya overflow ni cambio de geometría entre superficies.
