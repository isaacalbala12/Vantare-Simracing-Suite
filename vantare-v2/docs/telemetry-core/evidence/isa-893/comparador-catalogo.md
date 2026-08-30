# ISA-893 — gate del comparador para el catálogo completo

Base de clasificación: `OVERLAY_SHADOW_POLICIES` en
`frontend/src/overlay/telemetry-shadow/overlay-shadow-comparator.ts`.

El gate enlaza tres conjuntos y falla si divergen:

1. los 20 tipos de `widgetTypeRegistry`;
2. las 20 políticas del comparador;
3. los 18 builders de `overlayV2ViewModelRegistry`, que deben coincidir
   exactamente con las políticas no externas.

## Veredicto por widget

| Widget | Cobertura del comparador | Justificación |
| --- | --- | --- |
| `delta` | exact | Señales y semántica comparables campo a campo. |
| `pedals` | exact | Controles instantáneos comparables campo a campo. |
| `standings` | partial | Número, equipo/color, compuesto y parte de gaps no existen con igual semántica en V1. Los campos comparables siguen siendo exactos cuando la columna los muestra; una `currentLap` oculta se omite en ambos ViewModels y no participa en paridad. |
| `relative` | partial | El número de coche no es comparable en V1. |
| `broadcast-tower` | partial | Número, equipo/color, temperatura y SOF no tienen par completo. |
| `fuel-strategy` | partial | Historial/medias/requerido legacy no comparten autoridad con la derivación V2. |
| `pedals-telemetry` | partial | V1 arrastra la unidad de velocidad mal etiquetada; posición y controles sí se comparan. |
| `pedals-telemetry-compact` | partial | Conserva el mismo mismatch declarado de unidad V1. |
| `delta-trace` | partial | Puntos/current/trend se comparan; sectores, insight y mapa no tienen par. |
| `delta-advanced` | partial | Solo best tiene señal equivalente; sector/theoretical/last quedan declarados. |
| `input-telemetry` | partial | Instante comparable; V1 no conserva timestamp por muestra del historial. |
| `multiclass-relative` | partial | Color y número legacy no tienen par canónico completo. |
| `track-map` | partial | Track/estado se comparan; geometría es un asset estático, no telemetría. |
| `racing-flags` | not-comparable | La proyección V1 del comparador no contiene control de carrera equivalente. El builder V2 sigue siendo obligatorio. |
| `head-to-head` | not-comparable | V1 no atribuye calidad por identidad del rival seleccionado. El builder V2 sigue siendo obligatorio. |
| `track-weather` | not-comparable | El adapter V1 del comparador no expone una señal ambiental equivalente. El builder V2 sigue siendo obligatorio. |
| `car-damage-visual` | not-comparable | El adapter V1 del comparador no expone daños equivalentes. El builder V2 sigue siendo obligatorio. |
| `car-damage-numbers` | not-comparable | Mismo contrato de daños que la variante visual. El builder V2 sigue siendo obligatorio. |
| `race-schedule` | external | Autoridad Calendar; ruta cerrada `events`. No pertenece a OverlayFrame V2. |
| `engineer-radio` | external | Autoridad Engineer; ruta cerrada `engineerPresentation`. No pertenece a OverlayFrame V2. |

`partial` y `not-comparable` no se cuentan como paridad: producen mismatch o
veredicto declarado. `external` tampoco se convierte en PASS telemétrico. La
comparación bloqueada conserva la ruta auxiliar exacta para no disfrazar
`engineerPresentation` como `events`.
