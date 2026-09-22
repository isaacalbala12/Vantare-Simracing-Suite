# ISA-1322 — Corrección visual de Strategy v5

Estado: corrección implementada localmente. Rebuild normal recuperada y asset regenerado con VirusTotal 0/62. Aceptación visual pendiente; el bloqueo histórico de abajo ya no es el estado actual.

## Verificación posterior — 22-sep, última build

La revisión de la captura aportada por Isaac detectó una causa concreta: `.strategy-preparation__main>section` anulaba por especificidad los mínimos de las tarjetas. Se reduce únicamente la especificidad del valor genérico con `:where`; las alturas propias se aplican sin `!important`. Lint y build localdev completos pasan, logs `C:/tmp/isa1322-css-final-lint.log` y `C:/tmp/isa1322-css-final-build-localdev.log`. No se repite la suite funcional porque este ajuste es exclusivamente CSS; se verifica el render nativo.

Root reabre el DuckDB COTA en el ejecutable recompilado y comprueba ventana 1266×793 y maximizada 1920×1033: Base 340 px y Referencias 240 px en escritorio amplio, controles y pie visibles. Las capturas [normal](preparation-normal.png) y [maximizada](preparation-maximized.png) corresponden ahora a esta build. Reglas y Pilotos se comprobaron en el mismo corte funcional antes de recompilar este CSS. Original con el mismo SHA-256 documentado abajo. La consola transitoria del lector sigue siendo un antecedente reproducido; no se interviene en ella.

«Por confirmar» en evento y pilotos corresponde a una configuración aún sin rellenar. «Pendiente de datos» en ritmo/consumo es una limitación distinta: esta vista no recibe todavía la proyección exacta de telemetría, y su código muestra guiones expresamente. No es prueba de ausencia de vueltas utilizables y no se presenta como flujo funcional terminado.

Revisión independiente GPT-6 Sol medium de las capturas finales: **9,1/10 normal, 9,0/10 maximizada; 9,1 conjunta redondeada**. Considera la preparación lista para revisión de Isaac, con repetición de «Por confirmar» y metadatos discretos como detalles menores. Compara fuente del concepto y PNG nativo; no acredita paridad píxel a píxel, conexión de métricas ni T22. Ejecutable final SHA-256 `C482206A48BFE941F1F654064494FF8E3595B673B9649B9A580A8A6439E40239`.

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
- Typecheck, ESLint, auditoría i18n (cuatro idiomas, cero ausentes/huérfanas) y builds frontend+Wails localdev: salida 0. El bloqueo histórico se documenta abajo; el último CSS sí está empaquetado y comprobado en nativo en la verificación posterior.
- Roadmap: 44 pruebas aprobadas; artefacto regenerado desde origin/nightly, `--check` sin cambios. No se editó JSON manualmente.
- No se repite Go test: no se modifica Go ni contrato compartido. La compilación Wails localdev sí enlaza el frontend productivo nuevo.
- No se ejecuta CI remota ni matriz completa de idiomas/tamaños; la prueba visual nativa de este corte es en español a 1266×793 y 1920×1033.

La segunda pasada añadió la prueba Manual → ritmo 120 s → referencia 2:00.000, con dato introducido expresamente para QA, sin atribuirlo al DuckDB. La pasada final reabre COTA en la build corregida; original intacto. Se mantienen separados entrada, guardado, cálculo y aceptación.

## Cómo comprobarlo

Abrir `C:/tmp/vantare-isa1322/vantare-v2/bin/vantare-localdev.exe`, entrar en Strategy y elegir una sesión utilizable. La disposición compacta debe aparecer directamente. En preparación, desplegar Cambiar combinación, alternar Resumen/Reglas/Pilotos y reducir/maximizar la ventana: los controles no se cortan, y guardar/abrir carrera queda en el inspector. Cambiar origen vuelve al menú conservando el retorno a la carrera. Manual ofrece las referencias editables y señala las estimaciones.

Las instancias propias de QA se cerraron antes de recompilar; la instancia previa del usuario no se cerró ni reemplazó. El directorio data/ de esa prueba es local y no se entrega.

## Antecedente: bloqueo y revisión visual anterior

La pasada nativa anterior obtuvo **8,9/10** del revisor GPT-6 Sol medium: normal 9,1 y maximizada 8,7. En aquel corte no se alcanzó el umbral solicitado de más de 9. Las capturas enlazadas arriba se han sustituido por la nueva verificación posterior; la revisión anterior queda como antecedente.

El ajuste posterior es sólo CSS: mejora textos auxiliares a 11 px y asigna en escritorio amplio un mínimo de 340 px a Base y 240 px a Referencias. ESLint y diff-check pasan. El frontend termina de compilar, pero el empaquetado Go falla al intentar embeber un asset de Carreras:

```text
github.com/vantare/overlays/v2/frontend/embed.go:9:5: embed dist/assets/RacesOrbitPage-BtqPDHOa.js: open frontend\dist\assets\RacesOrbitPage-BtqPDHOa.js: Operation did not complete successfully because the file contains a virus or potentially unwanted software.
```

El worker informa de cuarentena de Windows Defender a las 22:29:58. El log de build confirma el bloqueo de lectura. No se ha determinado aquí si es una detección válida o un falso positivo. No se cambia protección, no se restaura ni se añade excepción, y no se reintenta por otra ruta. El binario previo no contiene el último CSS y no se entrega como actualizado. El dist queda incompleto por la retirada del asset.

La acción pendiente de aquel corte fue revisar la detección y recompilar normalmente. La rebuild posterior solicitada por Isaac tuvo éxito; el análisis del asset regenerado está en [la auditoría actualizada](defender-audit.md). Se conserva este antecedente para distinguir las capturas y builds anteriores de la verificación posterior.

## Archivos

Cambios de aplicación: OrbitShell, orbit-slot-ids, orbit-shell.css; StrategyRecordedPreparation y su CSS; StrategyRecordedWorkflow; CSS de frame/page; traducciones Strategy es/en/pt/it. Tests: Preparation nuevo, Page y Workflow adaptados. Documentación: diseño v5, handoff vivo, plan/roadmap generado y esta evidencia con dos PNG. No se mueven archivos; no se cambia backend ni dependencias.

Logs originales: `C:/tmp/isa1322-{typecheck,focused,test,lint,i18n,build}.log`; `isa1322-build.log` registra el fallo histórico externo. La recompilación final exitosa usa `C:/tmp/isa1322-css-final-build-localdev.log` y su ejecución nativa se describe arriba.
