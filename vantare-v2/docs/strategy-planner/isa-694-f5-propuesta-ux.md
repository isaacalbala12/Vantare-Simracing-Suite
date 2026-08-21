# ISA-694 · F5 — Propuesta UX del flujo asistido en Command Orbit

Fecha: 2026-08-21 · Autor: orquestador · Estado: propuesta para gate de Isaac
(D3: pantallas negociables, features mostradas intactas)

## Principio

El flujo asistido no sustituye a Orbit: lo alimenta. Todo lo que hoy se ve
(wizard, tarjetas de stints, comparación, inventario, disponibilidad de
pilotos) se conserva; lo nuevo es **de dónde salen los números** y cómo se ve
su procedencia.

## Cambios propuestos, por pantalla

### 1. Nueva entrada: selector de combinación (pantalla nueva, pequeña)

Al crear o abrir un evento, un paso previo opcional: "¿De qué combinación es
este evento?" con la lista de combinaciones detectadas en tu telemetría
(F3-a1), cada una con su resumen (sesiones, carreras, última actividad, datos
por bucket de clima). Elegirla conecta el evento a sus derivadas; saltarla =
modo manual puro (D1: manual es el caso degenerado). Dentro del evento, un
panel "Sesiones" lista las incluidas/excluidas con motivo y permite
excluir/incluir sin destruir nada.

### 2. Inputs con procedencia (cambio dentro del wizard existente)

Cada campo numérico (consumo, ritmo, depósito, pit, desgaste) gana un chip de
procedencia: `derivado` (con muestra y rango al pasar el ratón), `manual`,
`referencia` (catálogo) o `falta`. Editar un valor derivado crea un override
manual sin borrar el derivado (volver atrás = un clic). Cero números sin chip.

### 3. Panel de clima (sección nueva dentro del evento)

Timeline de 5 nodos (inicio→fin) con lluvia/cielo/temperatura; botón
"Capturar forecast" activo cuando LMU está abierto en esa combinación (F3b/c,
cuando A2 se valide); edición manual de escenarios siempre disponible. Los
resultados muestran plan por escenario + la recomendación robusta destacada.

### 4. Resultados: variantes con riesgo (cambio en las tarjetas existentes)

Las tarjetas rápida/equilibrada/conservadora se mantienen, pero ganan la
evaluación esperado/caso-malo y el badge de riesgo cuando el caso malo viola
una restricción ("exige consumo de tu 10% mejor"). El plan de ahorro (D6) se
muestra como fila propia cuando existe ("ahorra 0,25 L/vuelta en stints 2-3").
La restricción vinculante siempre visible ("te limita el neumático").

### 5. Ejemplos validados (sección nueva por combinación)

Backtests de tus carreras: "esta estrategia predijo 2h01m, corriste 2h02m
(+0,8%)". Es la evidencia de confianza del motor y el germen de D16.

### 6. Referencia comunitaria (sección nueva, claramente separada)

Estrategias curadas y perfiles de referencia del catálogo, siempre con
etiqueta `referencia` y su muestra (k≥3). Un clic las convierte en punto de
partida de un plan propio (los valores entran como `reference`, nunca como
tuyos). Vacía y con copy honesto hasta que exista el primer catálogo.

### 7. Arranque en frío (banner una sola vez)

Primer uso: "Hemos encontrado N sesiones de LMU en tu equipo — ¿importar?"
(descubrimiento por la ruta estándar). Progreso visible; nada automático sin
ese OK inicial.

## Lo que NO cambia

Wizard y formularios, tarjetas de stints y comparación, editor de inventario
(ahora por evento), disponibilidad y orden de pilotos, navegación y estética
Orbit, migración y verbos honestos de F2.

## Orden de implementación propuesto (5 issues de F5)

a) selector de combinación + panel de sesiones → b) chips de procedencia y
overrides → c) panel de clima (+ overlay ingame como issue propia de
Overlays) → d) ejemplos validados → e) referencia comunitaria + arranque en
frío (con catálogo fixture hasta que F6 publique el real).
