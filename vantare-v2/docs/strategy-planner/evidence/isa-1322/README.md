# ISA-1322 — Corrección visual de Strategy v5

Estado: corrección implementada localmente. Último empaquetado Wails bloqueado por Windows Defender; aceptación visual pendiente.

## Alcance

Se corrigen los dos defectos comunicados por Isaac: movimiento global al entrar en Strategy y mesa de preparación distinta del HTML aprobado. Base `8466c4a0aaed803812be900252a69a18e643c685` de ISA-1318; rama `vantareapp/isa-1322-strategy-desk-fidelity`, worktree `C:/tmp/vantare-isa1322`. GitHub #1322 es la autoridad por instrucción expresa del usuario, por encima de banners históricos de seguimiento.

Implementación GPT-6 Sol medium; dirección, revisión del diff y prueba Wails por root. Un escritor por worktree. Revisión visual independiente GPT-6 Sol medium, sin delegación adicional.

## Diagnóstico y solución

- La shell interpolaba `grid-template-columns`, y el CSS diferido de Strategy volvía a cambiar las anchuras al montarse. La ruta seleccionada fija ahora la geometría inmediatamente; se retira la transición global de rejilla.
- La antigua preparación duplicaba Evento/Reglas/Pilotos mediante `StrategyRecordedOverview` y comprimía controles horizontales en el lateral. Ahora usa contexto plegable, tarjetas de base/fuentes/referencias e inspector con pie visible.
- Los controles y validadores existentes conservan guardado, restricciones, revisiones y cálculo. Sin cambios Go, nuevas dependencias ni un motor alternativo.
- La revisión elegida debe coincidir por sessionId y revisionId; nunca se toma otra revisión como si fuera la adoptada.

## Prueba nativa

Build localdev de ISA-1318, sin cuenta, WebView aislado y puerto `127.0.0.1:39262`; la instancia anterior del usuario se conserva. LMU no se inicia ni se cierra.

La primera pasada recorrió Hub → Strategy → sesión real COTA → preparación → combinación desplegada → reglas. Ventana normal 1266×793 y maximizada 1920×1033. Se detectaron y remitieron para corrección una segunda cabecera y el recorte del pie de Base en ventana normal. Se observó de nuevo una consola transitoria al abrir el lector, antecedente ajeno a este cambio visual.

Fuente original: `Circuit of the Americas_P_2026-09-09T18_43_03Z.duckdb`, metadatos reales Circuit of the Americas / Isotta TIPO6 2024 #11:LM. SHA-256 antes/después `B6F8AFFFDF59066B13210499DA9B23524C8F72944B40F5193EFA96ACFAD60F34`.

## Límites

Las referencias de ritmo/combustible de telemetría no exponen aún la proyección en esta pantalla y aparecen pendientes; los valores manuales sí usan el borrador. No se inventan cifras para igualar el ejemplo del HTML. Este cambio no acredita T22 integral, cálculo empírico completo, live ni paridad de todas las pantallas posteriores.

La navegación automatizada del HTML de referencia fue bloqueada previamente. Se revisaron sus archivos fuente permitidos; no se eludió el bloqueo. Las capturas productivas no son una comparación píxel a píxel con una captura automática del HTML.

## Entrega

Sin push, PR, CI remota, merge, promoción ni release. La configuración de la build local no constituye un canal publicado. Runtime `data/` sin seguimiento y excluido de entrega.

## Comprobaciones finales

- Suite frontend: 490 archivos, **4.265 pruebas aprobadas, 2 omitidas**, salida 0. Se conserva en el log la traza Happy DOM `AbortError` durante teardown; no se oculta ni se presenta como prueba nativa.
- Focales Preparation/Page/Workflow: **19/19**. Incluyen combinación plegada y reapertura, guardado, biblioteca con segunda sesión, referencias pendientes de revisión exacta y redondeo de ritmo al cambio de minuto (59.9999 → 1:00.000).
- Typecheck, ESLint, auditoría i18n (cuatro idiomas, cero ausentes/huérfanas) y builds anteriores frontend+Wails localdev: salida 0. El último ajuste CSS compila en frontend, pero el empaquetado Wails final está bloqueado; véase abajo.
- Roadmap: 44 pruebas aprobadas; artefacto regenerado desde origin/nightly, `--check` sin cambios. No se editó JSON manualmente.
- No se repite Go test: no se modifica Go ni contrato compartido. La compilación Wails localdev sí enlaza el frontend productivo nuevo.
- No se ejecuta CI remota ni matriz completa de idiomas/tamaños; la prueba visual nativa de este corte es en español a 1266×793 y 1920×1033.

La segunda pasada añadió la prueba Manual → ritmo 120 s → referencia 2:00.000, con dato introducido expresamente para QA, sin atribuirlo al DuckDB. La pasada final reabre COTA en la build corregida; original intacto. Se mantienen separados entrada, guardado, cálculo y aceptación.

## Cómo comprobarlo

Abrir `C:/tmp/vantare-isa1322/vantare-v2/bin/vantare-localdev.exe`, entrar en Strategy y elegir una sesión utilizable. La disposición compacta debe aparecer directamente. En preparación, desplegar Cambiar combinación, alternar Resumen/Reglas/Pilotos y reducir/maximizar la ventana: los controles no se cortan, y guardar/abrir carrera queda en el inspector. Cambiar origen vuelve al menú conservando el retorno a la carrera. Manual ofrece las referencias editables y señala las estimaciones.

Las instancias propias de QA se cerraron antes de recompilar; la instancia previa del usuario no se cerró ni reemplazó. El directorio data/ de esa prueba es local y no se entrega.

## Bloqueo final y revisión visual

La última pasada nativa con capturas obtuvo **8,9/10** del revisor GPT-6 Sol medium: normal 9,1 y maximizada 8,7. No se alcanza todavía el umbral solicitado de más de 9. [Ventana normal](preparation-normal.png) y [maximizada](preparation-maximized.png) corresponden a esa pasada, no al último CSS.

El ajuste posterior es sólo CSS: mejora textos auxiliares a 11 px y asigna en escritorio amplio un mínimo de 340 px a Base y 240 px a Referencias. ESLint y diff-check pasan. El frontend termina de compilar, pero el empaquetado Go falla al intentar embeber un asset de Carreras:

```text
github.com/vantare/overlays/v2/frontend/embed.go:9:5: embed dist/assets/RacesOrbitPage-BtqPDHOa.js: open frontend\dist\assets\RacesOrbitPage-BtqPDHOa.js: Operation did not complete successfully because the file contains a virus or potentially unwanted software.
```

El worker informa de cuarentena de Windows Defender a las 22:29:58. El log de build confirma el bloqueo de lectura. No se ha determinado aquí si es una detección válida o un falso positivo. No se cambia protección, no se restaura ni se añade excepción, y no se reintenta por otra ruta. El binario previo no contiene el último CSS y no se entrega como actualizado. El dist queda incompleto por la retirada del asset.

**Siguiente acción:** Isaac debe revisar la detección en Seguridad de Windows. Tras resolverla, recompilar normalmente, repetir capturas normal/maximizada y solicitar al revisor el contraste final. No declarar el acabado visual aceptado mientras eso falte.

## Archivos

Cambios de aplicación: OrbitShell, orbit-slot-ids, orbit-shell.css; StrategyRecordedPreparation y su CSS; StrategyRecordedWorkflow; CSS de frame/page; traducciones Strategy es/en/pt/it. Tests: Preparation nuevo, Page y Workflow adaptados. Documentación: diseño v5, handoff vivo, plan/roadmap generado y esta evidencia con dos PNG. No se mueven archivos; no se cambia backend ni dependencias.

Logs locales: `C:/tmp/isa1322-{typecheck,focused,test,lint,i18n,build}.log`. El log build final registra el fallo externo; las builds anteriores exitosas se verificaron mediante la ejecución nativa descrita.
