# ISA-991 · Controles y geometría de tablas

Base `659b2c57`, rama `vantareapp/isa-991-tablas-tester`, worktree `C:/tmp/vantare-isa991`.
Subcorte de #989. Sin cambios en checkout principal ni worktrees ajenos.

## Cambio

- Relative Crystal consume todas las columnas admitidas, incluida Última vuelta. Standings Crystal deja de elegir solamente una columna gap y una vuelta: consume la selección y orden completos.
- Cabeceras y filas usan exactamente la misma cuadrícula, proporcional a los presets de ancho. La alineación se aplica a ambas. La geometría queda dentro de la anchura persistida, sin ensanchar el frame.
- Relative usa Check/Field/Seg de Orbit en filtros y columnas, con textos legibles, alineación central conservada y controles accesibles de reordenación. Sin dependencia nueva.
- Filas Crystal de Standings/Relative pasan a texto de 18px canónicos y 34px de alto. A 340px persistidos, Standings presenta texto de 11,77px antes de DPI/escala exterior. Cabeceras de 14px. El modo compacto de Standings usa 28px para contener la tipografía mayor.
- Al cambiar explícitamente el número de filas de Standings Crystal se guarda en el mismo comando la altura calculada desde filas configuradas + cabecera/tabla/pie/bordes y escala horizontal existente. Respeta mínimo240px, ancho, posición y aspect-lock. No depende de coches presentes y no modifica el drag/resize imperativo. No cambia Endurance ni otros diseños.

## Evidencia

RED antes: cuatro fallos (Última vuelta omitida, columnas Standings ignoradas, frame600 inalterado tras20→5 en340/520px). GREEN focal56/56.
Inspector: RED control nativo; GREEN3/3 tras Orbit.
Suite completa ejecutada antes de añadir el test Chromium final: 433 archivos,3300/3300,exit0. AbortError de teardown happy-dom con suite PASS.
Typecheck PASS. Build PASS con aviso de chunks grandes heredado. ESLint focal PASS.
Chromium headless: 2/2, renderToStaticMarkup de componentes productivos dentro WidgetVisualViewport y CSS/fuentes productivos inlinados. Test1: cinco filas completas y tipografía física tras cambio documental20→5 en340/420/520px sin ampliar fixture. Test2: Relative340px, Última vuelta presente, cabecera y celdas alineadas y ancho físico de Piloto cambia más de30px al cambiar estrecha→ancha.

## Límites y validación pendiente

- No es prueba Wails/LMU ni captura del HUD real. No se lanzó la app. Sin push/PR/merge/release.
- La build y perfil exactos del tester siguen sin identificarse. Relative no admite Intervalo/Vuelta como métricas independientes: no se inventan ni se añaden datos.
- No se fabrica Mejor/Última vuelta donde la proyección no ofrece dato. El control ahora determina la presencia de la columna aunque su celda sea no disponible.
- Muchos campos en poco ancho pueden mostrar elipsis. El texto continúa escalando según el contrato de viewport; anchos extremos menores que340px necesitan revisión visual de producto.
- El mínimo documental240px puede dejar margen tras5filas en anchos estrechos. Se preserva el contrato de resize existente y sí se reduce el alto frente al frame alto anterior.
- Pendiente Studio real: cambiar columnas, filas, guardar, reabrir, undo/redo y comparar HUD al mismo tamaño/DPI. Root integra handoff y roadmap común de #989.

## Revisión adicional

Chromium con compactRows=true descartó que la regla general34px pisara el selector compacto (este tiene más especificidad), pero reprodujo una diferencia real: el contenido requería25px frente al cálculo documental24px. Se fija mínimo compacto28px y la fórmula usa28px. La matriz340/420/520px cubre modo normal y compacto con20→5filas y verifica todas las alturas y contención.

También reprodujo elipsis en Julien Andlauer con las columnas predeterminadas (scroll136px/celda129px). Piloto ahora recibe peso1,5 frente a columnas numéricas con mismo preset; conserva respuesta de los controles y ancho total. Prueba con fuentes productivas confirma sin overflow nombre, gap+12.345 y vuelta1:38.621 a340/420/520px, ambos modos.

Focal de revisión43/43 y typecheck PASS. No se repitió suite global. Seleccionar todas las columnas simultáneamente a340px sigue siendo una composición excesivamente densa: debe ampliarse ancho o reducir campos; no se ocultan columnas seleccionadas ni se encoge el texto para simular legibilidad.
