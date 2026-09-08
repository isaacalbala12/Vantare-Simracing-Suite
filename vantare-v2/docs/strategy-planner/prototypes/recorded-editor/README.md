# ISA-1063 — propuesta registrada con Orbit

La propuesta anterior fue rechazada por Isaac al ver la captura: no respetaba el
diseño de Vantare. Esa decisión sustituye la aceptación inicial. Esta nueva
propuesta rehace la presentación desde cero, sin sustituir la UI productiva.

Base: `267fc38f`. Rama: `vantareapp/isa-1063-orbit-prototype`.
Worktree: `C:/tmp/vantare-isa1063-orbit`.

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
La aceptación del nuevo diseño está pendiente de Isaac.

No se ejecutaron suites Go/React, lint frontend ni build: ningún archivo
productivo cambió; es HTML/CSS/JS documental que importa recursos existentes.
No se afirma validación Wails ni del modelo de carrera.

Archivos: `index.html`, `recorded-editor.css`, `recorded-editor.js`, este README,
handoff Strategy, plan maestro y roadmap/digest. Sin push, PR, CI remota, merge,
release, promoción o intervención en LMU. Commit local de revisión únicamente.
