# Briefing 07 · Estrategia (`?view=estrategia`)

## Objetivo
Sustituir la pantalla de estrategia actual por el **panel único de evento** de Orbit sobre `strategy-contract-v1` / `strategy-editor.ts` (stints, tyres con compound/condition/corner/state/origin, manualInputs, capabilities). Entrada directa a la última estrategia; la columna izquierda selecciona.

## Modelo y algoritmos
`13.5`: `buildPlan` (stints mínimos que caben, equilibrados, overrides, rotación), derivados (ventana de boxes, parada), condición de neumáticos, veredicto por **vueltas completadas**, disponibilidad con recorte de tramos. Viven en dominio con tests (casos a–d).

## Estructura
- **Cabecera de evento**: `Monogram` 52 ("4H"), crumb "Estrategia › Estrategia #1 · `StateChip` Al día/Borrador", h2 26px, subtítulo, `Chip` fecha·hora / duración / clase / equipo; **⚙ Ajustes** (`Menu`: Telemetría de la sesión, Modelo de combustible, Información del evento, Exportar plan) y **↺ Restablecer**.
- `UnderlineTabs`: **Resumen · Estrategias · Disponibilidad de pilotos**.
- **Resumen** (`height:100%`): `StatRow` compacta (Duración · Depósito «n vueltas máx. a x L» · Tiempo de parada · Paradas «stints · vueltas») → grid `1fr | 360px`: **Línea de carrera** (`HorizontalTimeline` filas por piloto, eje inicio→fin cada 30 min, bloques S1…, marcas PIT, clic selecciona stint) · **Distribución** (`Donut` Vueltas/Tiempo + leyenda) → grid `1fr | 340px` (`flex:1; min-height:0`): **Stints** (cabecera con "Repartir pilotos"; salida; lista con scroll interno de tarjetas `#n · Piloto (Select con punto de color) · Hora · Vueltas (rango) · Combustible · Ventana de boxes (~Vn) · Setup · lápiz [· ✎ manual · ! excede]` y filas **PIT** entre ellas «Duración · n L en depósito (x L añadidos) · Vuelta n · Neumáticos»; bandera) · panel derecho con `Seg` **Pilotos** (tarjetas: avatar, nombre, licencia, Seco/Lluvia/Eco ritmo + L/v, Editar) / **Neumáticos** (`TyreItem` arrastrables: chip compuesto, id, dónde está montado, condición).
- **Editor de stint** (lápiz): bajo la tarjeta, Vueltas · Combustible · Ritmo (del piloto) · "Volver a automático" + esquema **delante/detrás** con `CornerSlot` FL/FR/RL/RR (drop, tocar-y-tocar, teclado, ×, pulso al soltar).
- **Estrategias**: tarjetas (#1 activa con borde carmín, #2) con estado, nota, `dl` (stints·paradas, vueltas, ritmo medio, consumo medio, tiempo), Activar/Duplicar; "+ Nueva estrategia"; **Comparación** con veredicto en una frase.
- **Disponibilidad**: `AvailabilityBoard` (13:00→18:30, ok/quizá/no) + formulario piloto/estado/desde/hasta → "Añadir tramo".
- **Columna contextual**: eyebrow del evento + estrategias (`ListRow` `.sel`), "Otros eventos" (sin estrategia), **Nueva estrategia**. Estado vacío (sin evento): en el propio panel, "Elige evento y pilotos" con la lista de eventos próximos seguidos.

## Comportamiento
- Cambiar piloto en una tarjeta → recalcula todo (horas, ventana, donut, timeline) y estado Borrador. Repartir pilotos = rotación por orden.
- Overrides de vueltas fijan ese stint y redistribuyen el resto; combustible manual solo se muestra; ✎ marca manual; "Volver a automático" limpia.
- Neumáticos: asignar por drop/tocar/teclado actualiza inventario (usos, condición) y estado; × quita. Restablecer devuelve orden, overrides y neumáticos por defecto.
- Activar estrategia en pestaña Estrategias o desde la columna cambia el panel; menú ⚙ cierra con clic fuera y Esc.

## Criterios de aceptación
- [ ] Tests de dominio (a–d) verdes; veredicto compara vueltas y explica ahorro/coste.
- [ ] Sin scroll de página a 1080; stints con scroll interno; el editor abre con la tarjeta visible (scroll a la tarjeta).
- [ ] Drag & drop funciona en WebView2 y también tocar-y-tocar y Enter/Espacio; pulso verde al soltar; el neumático usado dos veces baja de condición.
- [ ] Pestaña Neumáticos oculta Pilotos (y viceversa) — regla `[hidden]{display:none!important}` o montado condicional.
- [ ] Capturas ≈ `evidence/estrategia-resumen.png`, `estrategia-editor-neumaticos.png`, `estrategia-estrategias.png`, `estrategia-disponibilidad.png`.

## Referencias
`06 § Estrategia`, `05 § 5.5–5.8`, `04` (HorizontalTimeline, Donut, CornerSlot, TyreItem, AvailabilityBoard, Menu), `13.5`, `14 strategy.*`, `frontend/src/strategy/*`.
