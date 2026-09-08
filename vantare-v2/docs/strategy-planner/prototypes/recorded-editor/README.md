# ISA-1063 — propuesta registrada con Orbit

## Recorrido completo listo para revisión humana — 2026-09-08

Isaac acepta el corte local 4c08b834 de stint y parada y pide extender el mismo
bucle a las doce pantallas restantes antes de implementar la integración productiva.
Asistente Inicio/Simulador/Evento/Combinación/Reglas/Pilotos/Sesiones y editor
Carrera/Datos/Plan/Cálculo/Revisiones. Se mantienen originales intactos, cálculo
y guardado desconectados. El prototipo usa metadatos del banco existente.

Cuatro revisiones independientes: mínimos 7,9 → 8,7 → 8,9 → 9,1/10.
Las doce pantallas superan >9 individualmente; Plan y Revisiones llegan a 9,2.
Stint/parada mantienen 9,2/9,1 sin regresiones materiales. Falta aceptación humana. La evidencia vive en `docs/strategy-planner/evidence/isa-1063-all-screens`.
Rama `vantareapp/isa-1063-orbit-prototype`, worktree `C:/tmp/vantare-isa1063-orbit`,
base 4c08b834. Sin merge, release ni conexión nueva de DuckDB.

## Estado vigente: bucle de semejanza sobre 42c9dec8

Isaac rechazó esa iteración y pidió una revisión adversarial visual con nota >9.
Tras tres pasadas, el revisor da **9,1/10 a parada y 9,2/10 a stint**. Se solicita
revisión humana de las capturas reales; no se considera aceptado el acabado.
[Informe y límites](../../evidence/isa-1063-visual-loop/review-03.md).

Abrir directamente `index.html#pit` o `index.html#stint` mediante el servidor
local indicado abajo. La URL conserva únicamente la vista. Recargar descarta el
borrador; no persiste datos ni ejecuta el motor. Las pestañas de recursos cambian
la selección y el aviso, sin inventar curvas. El Plan ofrece el acceso al esquema
de cálculo. No hay cambios en la UI productiva.

Archivos de esta iteración: `plan-preview.js`, `recorded-editor.js`, `index.html`,
`detail-parity.css`, imágenes decorativas `garage-detail-v2.png`/`garage-detail-v3.png`,
evidencia y documentación. `detail-parity.css` acota las proporciones de estos
conceptos sobre la shell Orbit. Es un prototipo documental descartable.

La revisión compara a 1672 × 941 y no acredita otras pantallas o precisión del
solver. Persisten diferencias menores de fotografía e iconografía descritas en
el informe. Sintaxis de los dos JS, diff y digest comprobados; no builds React/Go
porque no cambia código productivo. El siguiente texto conserva la historia.

Iteración vigente sobre `e53bb132`: punto medio solicitado por Isaac entre
presentación plana y exceso de iluminación roja. Primero se termina y revisa la
parte visual en código; después se enlazan datos y motor. La dirección A4 se
mantiene; este acabado sigue sujeto a revisión visual.

Cambios: `plan-preview.js` y `recorded-editor.css`. Cabecera compacta, timeline
con estado seleccionado, pictogramas, tarjetas de entrada/salida, tabla de
servicios, grupos paralelos, restricciones y detalle del stint. Colores Orbit,
paneles neutros y carmín limitado a señales activas y detalles. Sin dependencias,
I/O, persistencia, cálculos inventados ni cambios en originales.

Isaac aprueba la dirección A4 y las pantallas de edición, cálculo, resultado,
stint y parada. Este corte adapta esa composición a los colores actuales de
Vantare mediante sus tokens Orbit reales. La propuesta inicial rechazada queda
superada. Sigue siendo un prototipo documental, no la UI productiva.

Base de este corte: `799049e8`. Rama: `vantareapp/isa-1063-orbit-prototype`.
Worktree: `C:/tmp/vantare-isa1063-orbit`.

## Recorrido A4 aprobado

- Asistente de siete pantallas con fondo de garaje generado y controles HTML.
- Editor con sidebar comprimido y navegación Carrera, Datos, Plan y Revisiones.
- Plan con acceso al detalle de stint y parada; cálculo como esquema explícito.
- Stint: piloto, ritmo, recursos, evolución y restricciones.
- Parada: servicios, simultaneidad, motivo y coste frente a seguir en pista.
- Se editan datos y reglas; el motor construirá stints y paradas. No se ofrece
  manipulación manual de segmentos ni se inventan resultados.
- `garage-a4.png` es una imagen decorativa generada con ChatGPT Images. No es
  captura de LMU ni evidencia de telemetría. `plan-preview.js` solo compone vistas.

## Diseño contrastado y reutilizado

- `frontend/src/styles/orbit.tokens.css`: paleta carmín/coral, tinta, radios,
  densidad y tipografía. Sin una paleta alternativa del prototipo.
- `frontend/src/styles/orbit-kit.css`: botones productivos claros/ghost y pills.
- `frontend/src/styles/orbit-shell.css`: rail, columna contextual y topbar.
- `frontend/src/assets/orbit-icons.svg` y `frontend/public/fonts/Inter-*.woff2`:
  recursos locales productivos. Se referencian directamente, no se duplican.
- `Rail.tsx`, `Topbar.tsx`, `OrbitShell.tsx` y la captura canónica
  `docs/design/orbit-v03/evidence/porte/01-shell/orbit-shell-inicio-1920x1080.png`
  fueron inspeccionados. La captura es referencia anterior; el CSS actual fue
  contrastado con el checkout principal: tokens iguales, diferencias de shell
  limitadas a interacción del rail y aviso de actualizaciones.

La estructura HTML documental utiliza las clases reales de Orbit. El CSS propio
solo compone el contenido del asistente/editor y adapta el prototipo a ventanas
estrechas. No monta React/Wails ni reemplaza el renderer de la aplicación.

## Abrir y verificar

Desde `vantare-v2`, servir en loopback para que fuentes y sprite SVG funcionen:

```powershell
python -m http.server 8764 --bind 127.0.0.1 --directory C:/tmp/vantare-isa1063-orbit/vantare-v2
```

Abrir `http://127.0.0.1:8764/docs/strategy-planner/prototypes/recorded-editor/`.
El servidor solo entrega recursos locales. No necesita instalación ni paquetes.

1. Elegir Manual o Automático y recorrer los siete pasos.
2. Configurar duración y piloto; volver atrás conserva sus valores. Borrar un
   campo lo devuelve a «Por confirmar». La duración negativa no permite avanzar.
3. Abrir borrador: resumen, revisión de datos, excluir sesión y deshacer.
4. Plegar la columna en escritorio. A 1152 px o menos se oculta automáticamente;
   a 800 px o menos las tarjetas y el editor pasan a una columna.

## Verificación y revisión personales

- `node --check recorded-editor.js`: PASS.
- Chrome: Manual y Automático, todos los pasos, campos retenidos y duración
  negativa rechazada. Texto `<b>Piloto & revisión</b>` se muestra como texto;
  no se interpreta como HTML. Borrado por teclado comprobado.
- Exclusión cambia disponibilidad del borrador; deshacer restaura. Cambiar de
  combinación reinicia su selección y elimina el deshacer de la anterior.
- Teclado: foco al título al avanzar, Tab entre opciones, controles nativos.
  Plegar y restaurar columna comprobados en escritorio.
- Inicio y editor medidos a 1440, 1024, 768 y 320 px: sin desbordamiento
  horizontal de página ni del contenido. Inspección visual en Chrome de
  escritorio y ventana estrecha. Sin auditoría exhaustiva de accesibilidad.
- Estilo computado: Inter; carmín `#d52f49`; primario `rgb(243, 238, 238)`.
  Consola consultada sin errores ni warnings de la propuesta.
- Ponytail/code review: recursos reutilizados, estado acotado en memoria,
  campos escapados, sin nuevas dependencias, sin I/O de usuario ni cálculos.
- `git diff --check` y roadmap digest: PASS.

Capturas locales de esta revisión (no versionadas):
`C:/Users/isaac/.codex/visualizations/2026/09/07/01a07e43-6608-7220-8b7c-205f522fcd67/strategy-orbit-inicio-1440.png`
y `strategy-orbit-editor-1440.png` en la misma carpeta.
El editor de la captura usa 60 minutos introducidos durante la prueba: no es
una duración inferida de la telemetría.

## Límites y estado

Solo usa metadata del banco Imola/Algarve #1030; sin predicciones inventadas.
Automático no escanea; calendario, relevos, corrección escalar, cálculo y guardado
siguen sin conectar. La copia es una preferencia demostrativa, no copia archivos.
Los originales siguen intactos. La recarga descarta todos los cambios locales.
La dirección A4 está aceptada por Isaac; queda pendiente su integración productiva.

No se ejecutaron suites Go/React, lint frontend ni build: ningún archivo
productivo cambió; es HTML/CSS/JS documental que importa recursos existentes.
No se afirma validación Wails ni del modelo de carrera.

Archivos: `index.html`, `recorded-editor.css`, `recorded-editor.js`, este README,
handoff Strategy, plan maestro y roadmap/digest. Sin push, PR, CI remota, merge,
release, promoción o intervención en LMU. Commit local de revisión únicamente.

## Verificación del corte A4

Sintaxis de ambos JS y `git diff --check`: PASS. Revisión personal del diff:
se corrigió el foco de los accesos antiguos a las nuevas pestañas. Chrome:
asistente completo, Plan, Stint, Parada, Cálculo y Revisiones recorridos.
Parada sin desbordamiento del main a 320 px (252/252) y 768 px (677/677).
Se corrigió el desbordamiento inicial de las pestañas y se restauró el viewport.
No se ejecutan Go ni builds React: este corte solo modifica el prototipo documental.

Capturas reales de Chrome del corte A4 (carpeta de visualizaciones de la sesión):
`strategy-a4-wizard-browser.png`, `strategy-a4-stint-browser.png` y
`strategy-a4-pit-browser.png`. Son distintas de los conceptos generados.

## Comprobación de la intensidad intermedia

Chrome: siete pasos, acceso a Plan/Parada/Stint y vuelta a Datos; el acceso
«Revisar datos» deja el foco en Datos. Calcular continúa deshabilitado.
Parada sin desbordamiento horizontal del main a 1600 (1509/1509), 1198
(1107/1107), 768 (677/677) y 320 px (252/252). Se corrigió la alineación del
nodo de parada cuando su etiqueta ocupa dos líneas. Viewport restaurado.

Capturas reales: `strategy-balanced-pit-code.png` y
`strategy-balanced-stint-code.png` en la carpeta de visualizaciones de la sesión.
La imagen del garaje sigue siendo decorativa; tablas, iconos, timeline y controles
son HTML/CSS/SVG. No hay datos generados para rellenar los resultados.

Revisión personal del diff y sintaxis JS; no tests unitarios nuevos para este
ajuste visual reversible. No builds React/Go: no se modifica código productivo.
