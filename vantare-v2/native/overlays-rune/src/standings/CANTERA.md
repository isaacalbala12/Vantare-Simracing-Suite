# CANTERA · Efectos de Standings Eficiencia

Código de apoyo para E6 (agente Sol). No es un PR ni se fusiona tal cual.

## Qué hay

Rama `vantareapp/isa-2333-standings-efectos-eficiencia-cantera` (base: la rama
de #2465 anterior al rebase de Sol, `42db6206`). Copia útil:

- `standings/motion.rs`: `derive_events` (posición con `places`, mejor personal,
  mejor de sesión con `Plan::session_best`), prioridad GPUI (SessionBest 3 >
  Position/Lead/Pit 2 > PersonalBest 1), `motion_continues` con `sequence >=`
  (comentado: continuidad, no clave de caché), `select_battle` con histéresis,
  `RowVis` con `chip`, `sweep`, `battle`, `best_marker`, `flash`; tiempos
  literales: aviso 1200 ms, barrido 800 ms `EASE_OUT` con keyframes 0 → (0,−100 %),
  0,4 → (0,7,0), 1 → (0,+100 %), chip 180 ms `EASE`, batalla 200 ms, rombo 220 ms.
- `standings/effects_tests.rs`: tests de continuidad repetida/atrasada/sesión,
  chip, barrido, batalla/rombo, caducidad y reducido, con constantes literales.
- `standings/paint.rs` (viejo): fragmentos de chip, barrido, batalla, rombo y
  badge de rail, con sus claves.

## Qué asume

- El `Motion`/`RowVis` y `paint.rs` **anteriores** a #2465 (estructura de
  `scene.rs`); el rebase de #2465 renombró a `render.rs` y simplificó `Motion`.
- No incluye rail de boxes: es Eficiencia y va con su `size()` (+34 solo con
  columna PIT habilitada).
- El destello de fila de Vantare se lleva aparte
  (`vantareapp/isa-2333-standings-flash-rune`).

## Qué reutilizar en E6

`derive_events`, prioridad, `motion_continues`, `select_battle`, los tweens y
sus constantes, y los tests. Adaptar nombres a `render.rs`/`Motion` nuevos.
