# Referencias Eficiencia — #1427

Base de producto: `f0254e1f354970c06130775c92edc0a4e21cd9e6`.
Preparación de fase 2 de [#1427](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1427), ADR 0099.
Hay **20 pares PNG/geometría** en [`native/ui/reference/`](../../../native/ui/reference/)
y un `manifest.json` con los **22 tipos** y sus bloqueos. No hay PNG ficticio
para los dos tipos que no tienen renderer Eficiencia.

## Regenerar y comprobar

Desde `vantare-v2/`, con las dependencias frontend ya instaladas:

```powershell
node tools/widget-reference/generate.mjs
python tools/widget-reference/check.py
```

Si este worktree no tiene `frontend/node_modules`, se puede reutilizar una
instalación existente sin escribir en ella. Comando utilizado en esta entrega:

```powershell
node tools/widget-reference/generate.mjs --modules C:/tmp/vantare-parity-wails/vantare-v2/frontend/node_modules
```

Requiere Node, Vite, `@tailwindcss/vite`, React y Playwright de las dependencias
existentes del frontend, su Chromium instalado y Python con Pillow/numpy
(los mismos del comparador ISA-1410). No instala paquetes ni cambia manifiestos.
`--output <directorio>` permite conservar otra tanda. `.runs/` guarda las dos
generaciones crudas; está ignorado junto a la caché local de Vite.

El comando comprueba tipos de `scene.tsx` con la configuración app real del
frontend (incluidos sus imports; no usa el tsconfig solution vacío). Después
genera dos tandas en páginas independientes y compara cada pareja
con `diff.py --threshold 0 --max-percent 0 --json`, sin máscaras. También exige
JSON de geometría idéntico byte a byte. Publica el manifiesto después de las
comparaciones. Cualquier montaje inesperadamente fallido devuelve código 1;
los dos bloqueos conocidos del catálogo se registran explícitamente.
`check.py` valida los artefactos, tamaños, alfa, cobertura del catálogo,
ausencia de recorte del renderer, diagnósticos y animaciones asentadas. Los resultados por widget están en
`manifest.json`; este check de archivos no sustituye regenerar las dos tandas.

## Montaje y procedencia

`scene.tsx` usa `widgetTypeRegistry.createDefault`, aplica el diseño
`isDefault` de `official-designs.ts` y monta **WidgetVisualViewport +
WidgetVisualHost**. No copia TSX/CSS ni proyecta ViewModels propios. Conserva
contenido y ajustes oficiales; Standings usa su función productiva de tamaño
intrínseco para sus 20 filas configuradas. Marca visible e idioma español.
El JSON incluye configuración, runtime exacto, escala del viewport, atributos,
cajas y estilos de **todos** los elementos y sus pseudo-elementos.

Se importa `frontend/src/index.css` (incluido el reset Tailwind del producto),
fuentes locales y `vantare-functional/tokens.css`. El único estilo del arnés
es el marco transparente en (0,0). El lienzo contiene la caja configurada y
la caja DOM completa del renderer, medidas a DPR 1 sin cambiar su layout;
si Standings expone un rail PIT se reservan sus 34 px adicionales. Se recorta
la sombra exterior como en ISA-1410. Delta Trace crece de 144 a 277.72 px por
su SVG, y Track Map de 220 a 248 px por su footer; se capturan 278 y 248 px
respectivamente para conservar todo el widget. Ambos tamaños configurados
originales siguen en el JSON. No hay fondo de escenario ni controles.

Escena común: `buildWorkshopFrameV2({variant: "default", session: "race",
location: "track", state: "ready", system: "vantare-functional"})` de
`frontend/src/overlay/authoring/fixtures/authoring-v2-workshop-frame.ts`.
Parte del golden `internal/telemetry/projection/overlayv2/testdata/overlay_v2_20.golden.json`
y aplica las demostraciones existentes de Workshop (`withWorkshopDemo`,
`withFunctionalStandingsDemo`, ventana Relative y posiciones Radar).
Son **fixtures visuales**, no una captura real de LMU: se ha elegido la
alternativa Workshop autorizada en el encargo; `lmu47.snapshot.json` no se usa.
Los huecos que conserva el producto aparecen como guiones o estados vacíos.

Excepciones auxiliares existentes: Race Schedule recibe los cuatro eventos
`WORKSHOP_V2_SCHEDULE_EVENTS`; Engineer Radio recibe
`buildEngineerPresentationFixture("es", "warning")` de
`frontend/src/engineer/engineer-presentation-fixtures.ts`. Fastest Lap usa
la vista previa productiva de `FastestLapPresentation` en modo `harness`;
no se simula un evento de récord live.

Reloj de pared fijo `2026-07-14T12:00:00.000Z`, zona UTC, locale `es-ES`, DPR 1
(100 % DPI). Tras cargar fuentes/imágenes y dejar asentar timers, las
animaciones finitas terminan; las infinitas se pausan en su origen. Se esperan
dos frames antes de capturar. HMR y el watcher se desactivan durante captura.
El motor y SHA utilizados se registran en el manifiesto.
El golden conserva presupuesto `effects=noBlur` y motion completo (nivel 3);
`full`/`flat` y reduced motion no están cubiertos. Los estilos calculados
registran también los overrides CSS que mantengan blur en Standings.

El arnés leído fue `vantareapp/isa-1410-parity-wails@4229c478`:
`tools/native-ui/wails/frontend/parity.tsx`, `parity.css`, `vite.config.mjs`,
`tools/native-ui/parity/SPEC.md` y `dump-geometry.cjs`. `diff.py` es copia
**sin cambios** del comparador de esa rama (SHA256
`e93e0325a526f9cc1e622c04eb66d061b8f43e592039f87cb55c14322413e90e`).
La captura nueva usa Chromium de Playwright, **no una ventana Wails/WebView2**;
la geometría y el rasterizado se deben revisar teniendo en cuenta ese motor.

## Cobertura de la escena

Tamaños en píxeles CSS/físicos a DPR 1. Todo lo no listado, incluidos cambios
de fuente, desconexión, datos obsoletos y movimiento, queda fuera de esta tanda.
Las claves citadas son entradas Overlay V2; el runtime completo está en cada JSON.

| Tipo / PNG | Tamaño | Datos que consume | Estado capturado | No cubierto |
| --- | --- | --- | --- | --- |
| `delta` | 280 × 96 | `delta`, vueltas del jugador | Instrument, referencia personal, +0.214 | Capsule, mejora negativa, referencia ausente/cambiada |
| `standings` | 440 × 664 | `standings`, `player.id`, `session`, `weather` | Carrera, clase del jugador, siete filas en caja de 20, jugador/líder, laps y gaps presentes/ausentes | Todas las clases, Broadcast, rail PIT (desactivado por defecto), 20 filas visibles, reordenación |
| `relative` | 304 × 285 | `relative`, jugador, sesión y clima | 3 delante + jugador + 3 detrás, clases, −1 vuelta, gaps firmados, guiones | Cruces de posición, entrada/salida, fill, pérdida de rivales |
| `pedals` | 120 × 160 | `player.throttle/brake/clutch` | 75/13/6 %, diseño con fondo | Solo barras transparente, 0/100 %, movimiento |
| `broadcast-tower` | 1920 × 71 | standings, sesión, clima | Cinco coches, clases, jugador, gaps; vuelta de sesión ausente | Carrusel, paginación, vuelta válida, cambio de orden |
| `fuel-strategy` | 680 × 204 | `fuel`, estimaciones e historial | 42 L, consumo 2.14 L, 79 vueltas, necesidad 169.1 L, historial | Cambios de modo, cálculo sin autoridad, entrada/salida de boxes |
| `pedals-telemetry` | 300 × 112 | controles e historial, velocidad, rpm, marcha | Volante por defecto, marcha 4, 180 km/h, 7200 rpm | Otros volantes, marcha R/N, rangos extremos, movimiento |
| `pedals-telemetry-compact` | — | — | **Bloqueado:** no registrado en Eficiencia; tipo retirado del catálogo de creación | Todo; no tiene diseño oficial Eficiencia ni PNG |
| `racing-flags` | 280 × 88 | `session.flag` | Bandera verde | Amarilla, azul, roja, blanca, negra, cuadros, desconocida y pulsación |
| `fastest-lap` | 480 × 104 | standings, clase del jugador, preferencias de récord | Vista previa de récord de clase HYPERCAR, Antonio Giovinazzi, 1:30.904 | Detección live, entrada/salida del aviso, personal y sin récord |
| `delta-trace` | 1000 × 278 | `delta.seconds/history` | +0.257, perdiendo, traza Workshop | Sectores/mapa de vuelta ausentes, ganando, giro actual |
| `race-schedule` | 780 × 340 | canal auxiliar Calendar | Cuatro eventos Workshop, clases, licencias y duración | Calendario vacío/error, más eventos, datos autenticados |
| `head-to-head` | 360 × 128 | standings, relative, jugador | **SIN RIVAL:** jugador líder y target por defecto delante | Rival válido, tiempos/duelo, target detrás |
| `delta-advanced` | — | — | **Bloqueado:** no registrado en Eficiencia | Todo; no tiene diseño oficial Eficiencia ni PNG |
| `input-telemetry` | 360 × 140 | controles/historial, velocidad, rpm, marcha | Tres pedales, traza, marcha 4, 180 km/h, 7200 rpm | Controles ausentes, extremos, historial en movimiento |
| `multiclass-relative` | 420 × 155 | `relative`, jugador, clases | Cinco filas, tres clases, gaps crecientes, jugador | Más filas, clase ausente, posiciones disponibles, cruces |
| `track-weather` | 240 × 150 | `weather` | Pista 28 °C, aire 21 °C, viento 14 km/h NW, lluvia/humedad 0; presión ausente | Lluvia, mojado, presión válida, estados de calidad |
| `car-damage-visual` | 150 × 191 | `damage` | Aero/carrocería/suspensión 100 % | Daño por rueda y niveles parciales/críticos |
| `car-damage-numbers` | 140 × 149 | `damage` | Aero/carrocería/suspensión 100 %, neumáticos 13 % | Otros porcentajes, componentes no disponibles |
| `engineer-radio` | 440 × 112 | `engineerPresentation` auxiliar | Vista previa warning/FUEL: «Combustible crítico, entra en boxes» | Spotter crítico, info, otras lenguas, audio, expiración live |
| `track-map` | 320 × 248 | `session.track`, `standings[].groundPosition`, pack estático | Trazado Sebring, nombre del circuito y un marcador disponible del golden | Otros circuitos, circuito no mapeado, movimiento, mapa sintético |
| `radar` | 220 × 220 | `radar.cars` xyz | Tres coches Workshop: cerca/solape, lejos y doblado | Vista sin rivales, coordenadas reales LMU, rotación/movimiento |

## Límites y continuidad

Validación local de la entrega: `cargo fmt --check` (con
`CARGO_BUILD_JOBS=4`), `cargo clippy --workspace --all-targets -j 4 -- -D warnings`
y `cargo test --workspace -j 4`, todos código 0. **220 pruebas pasan**, incluidas
las siete de lifecycle con procesos reales; **dos pruebas físicas opt-in** de
LMU Shared Memory/REST quedan ignoradas porque necesitan LMU en marcha.
No se ha modificado Rust. El typecheck del montaje y `node --check` pasan.
Las dos generaciones finales comparan **1.775.410 píxeles**, con **0 distintos**,
umbral 0, delta máximo 0, sin máscaras y 20 geometrías idénticas. `check.py`
pasa; antes de ampliar el lienzo detectó el recorte de Delta Trace (regresión
roja conservada en `.runs/clipping-before.log`).
No se ejecutan los gates pnpm de todo el frontend: no se han editado sus
fuentes ni configuración; el generador comprueba los imports del montaje y
ejercita los 20 renderizadores en navegador.

Notion no disponible: Isaac autoriza expresamente esta ejecución local con
GitHub. No se afirma actualización ni cierre de seguimiento Notion. El
orquestador debe reconciliar tarea/proyecto y handoff al recuperar acceso.
No se escribe el handoff canónico desde este worker porque queda fuera de sus
dos rutas. Sin push, PR, merge, promoción ni release.

Los 20 montajes no tienen diagnósticos del host. Las dos ausencias son del
catálogo productivo, no fallos de datos. Para el porte completo el orquestador
debe decidir si `delta-advanced` y el retirado `pedals-telemetry-compact`
necesitan renderer Eficiencia. También falta una escena de Head to Head con
rival y la matriz de estados adicionales de la tabla. Estas referencias no
prueban paridad GPUI, funcionamiento físico LMU/OBS ni rendimiento.
