# ISA-992 — feedback: comparaciones y geometría

Base: `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`, rama `vantareapp/isa-992-comparaciones-tester`, worktree `C:/tmp/vantare-isa992`. Subcorte de #989. No merge, push, PR ni ejecución Wails/LMU.

## Cambios

- Head-to-Head: V1 usa exclusivamente `timeGapToPlayer`; V2 usa exclusivamente el gap relativo del rival seleccionado. No sustituye con gap al líder ni del jugador. Crystal identifica rivales anterior/posterior de clasificación y referencia al jugador; no dibuja sectores o tiempos inventados. Cuadrícula flexible de tres columnas, filas flexibles y cabecera horizontal explicativa.
- **Contrato geométrico observable:** Head-to-Head deja de permitir desbloqueo de proporción. Usa el mecanismo existente de conformidad, base 360x128, mínimo 270x96. Un perfil 360x304 pasa a 360x128 y uno 720x96 pasa a 720x256 al cargar. Se preservan ancho (salvo mínimo), posición y contenido. No se añadió lógica de layout al renderer ni cambios de canvas/core.
- Multiclass: otras clases centra en la posición de inserción del jugador sin exigir/reinsertar su fila. V1/V2 no mezclan gap al jugador con gap al líder. Crystal explica que es clasificación multiclase, activa divisores ya configurables y presenta estado vacío.
- Broadcast Tower conserva la franja horizontal: clasificación, vuelta, diferencia al líder, asfalto y SOF no disponible. V1 usa exclusivamente el gap al líder para coincidir con esa etiqueta; no se inventa SOF ni equipo. Se mantiene el contrato de fuentes existente.
- Delta Advanced: etiquetas completas, referencia efectiva del frame V2 (personal-best, session-best, previous-lap). Referencia ausente/desconocida se declara no disponible. Crystal y Original ocultan los campos sin fuente cuando así se configura; Crystal muestra estado vacío si no queda ninguno.
- Delta Endurance: `lossColor` atraviesa control de apariencia, settings/normalización y variable CSS productiva en sus plantillas. Se valida hexadecimal de seis cifras; default #ff6b76. Traducción del control en es/en/it/pt. No cambia la opacidad dependiente del delta.

## Evidencia

TDD observado antes del arreglo: Head-to-Head retornaba 1.1 del líder sin relativo; other V2 devolvía missing y filas vacías; Multiclass reutilizaba gaps al líder; Crystal Delta mostraba cuatro celdas con unavailable desactivado; Broadcast V1 prefería 2 respecto al jugador sobre 10 al líder; Original Delta conservaba etiquetas ocultando solo valores; settings Delta descartaba lossColor; Head-to-Head permitía desbloqueo de proporción. Tests nuevos/extendidos guardan estos casos.

Geometría Chromium headless: `HeadToHeadCrystal.geometry.test.tsx` usa markup del componente productivo y hojas CSS productivas. Falló antes de corregir CSS en 360x120 por filas/lecturas fuera del frame. Pasa 360x96, 360x120, 260x96, 360x304 y 720x192, con tres filas y sectores. Incluye escala de viewport por ancho, sin ensanchar la caja antes de medir. Además, tests de definición/conformidad cubren perfiles 720x96 y 360x304. **Esto es DOM/Chromium, no Wails/LMU.**

Validación final focal: 24 archivos, 93 tests, exit 0. Incluye directorios widget-types/head-to-head, multiclass-relative, broadcast-tower, delta-advanced; renderizadores Crystal correspondientes; delta Endurance + contract.test; delta-advanced Original; widget-aspect-contract y profile-layout-conform. Typecheck `tsc -b --noEmit` exit 0. ESLint focal exit 0. Build `tsc -b && vite build` exit 0 con aviso de chunks >500kB; último cambio de capacidades posterior cubierto por focales y pendiente de build integrada del orquestador. `git diff --check` sin errores.

No hay lock frontend versionado en la base. Node_modules usa junction al checkout principal; dependencies/devDependencies de package.json verificadas idénticas (scripts/version no idénticos). No se instalaron dependencias.

## Verificación pendiente y riesgos

- Orquestador ejecuta suite completa y build integrada, actualiza roadmap y handoff común.
- Abrir perfiles antiguos en Studio y confirmar cambio de altura previsto, posición preservada, y resize proporcional. Confirmar legibilidad a DPI real.
- Comprobar filtro otras clases y referencias con HUD/LMU real. Los gaps sin fuente ahora permanecen ausentes: es deliberado y puede reducir números visibles antes engañosos.
- Validar apariencia Broadcast/Multiclass/Delta con Isaac; textos explicativos siguen idioma español usado por estos renderizadores. No se rediseñó catálogo ni se inventó telemetría.
- Guardar/recargar lossColor en Studio y verificar HUD. Tests de normalización y renderer no prueban guardado Wails real.
- Las capturas previas/contratos de paridad visual cambiarán para estos widgets y necesitan revisión; no se presentan como cierre de validación física.
