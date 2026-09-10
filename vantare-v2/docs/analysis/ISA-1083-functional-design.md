# ISA-1083 — Standings funcional en React

Base: `origin/nightly@b6b5754eee059bc239fce18c08b39adae8c553fa`.
Rama: `vantareapp/isa-1083-functional-standings`.
Worktree: `C:/tmp/vantare-isa1083`. Implementación revisada; entrega y estado
remoto trazados en #1083. Integración a Nightly separada en #1098.

## Decisión vigente

Isaac elige las exploraciones de Images derivadas de la captura real de Joined01:
**opción 3 como principal y opción 2 como secundaria**. Se traducen a React como
Signature y Broadcast, dos apariencias del mismo renderer y de la misma ViewModel.
Isaac acepta el avance en React y autoriza terminar su integración a Nightly el
2026-09-10. Queda pendiente la prueba física del recorrido completo. No se
incorporan las imágenes generadas al widget; se reutiliza el isotipo existente.

- Signature conserva `standings-functional-compact` para no romper enlaces.
  Superficie oscura uniforme, cabecera con diagonales rojas, etiquetas subrayadas,
  separadores verticales cortos entre tiempos y selección gris neutra continua.
- Broadcast usa `standings-functional-broadcast`. Cabecera independiente y fila
  de etiquetas, cápsulas de vueltas y selección
  neutra de extremo a extremo. Las filas mantienen 30 px con o sin cápsulas.
- Workshop ofrece `Principal · 3` y `Broadcast · 2`. El diseño cambia mediante el
  catálogo existente, conserva los módulos seleccionados y usa WidgetVisualHost.
- Nombres y cifras conservan Inter. Se mantienen los valores, precisión y estados
  de fuente. No se añade ninguna dependencia ni renderer alternativo.

Isaac valora positivamente el resto de Broadcast y pide quitar las marcas rojas
junto a los pilotos. Se elimina únicamente ese adorno CSS, conservando posiciones,
tipografía, cabecera, cápsulas y dimensiones. El diseño Principal no cambia.

Verificación de este ajuste: 13 tests focales PASS, build con comprobación de
tipos PASS y `git diff --check` PASS. La pestaña actual muestra Broadcast con
10 filas y los cuatro módulos (594 × 370 px); ninguna celda de nombre genera
la marca roja. Captura: `design-evidence/functional/standings-broadcast-clean.png`.
No se repiten la suite completa ni lint para esta eliminación decorativa CSS;
sus resultados anteriores se conservan abajo. Sin prueba física Wails/LMU.
Se modifica `tokens.css`, este informe y el handoff, y se añade esa captura.
Sin commit, push, PR, CI remota, merge, promoción ni release. Para comprobarlo,
seleccionar Broadcast · 2 en Workshop: los nombres aparecen sin las marcas rojas.

Referencias elegidas: `design-evidence/functional/selected-images-v3.png` y
`selected-images-v2.png`. Su origen y prompts completos están en
`C:/Users/isaac/.codex/visualizations/2026/09/09/01a08751-3d68-7f32-8f90-6b9f7e7c56ee/standings-images-prompts.md`.

## Historial de dirección visual

Isaac rechazó las direcciones generadas con Images y pidió construir directamente
el widget en React desde la referencia de transparencia suave. Images queda para
explorar detalles posteriores; ninguna imagen generada es la base del renderer.
Los conceptos rechazados se conservan como historial en `design-evidence/functional/`.

**Corrección posterior de Isaac:** React07 es un avance funcional, pero sus colores
y lenguaje no representan Vantare. La identidad de marca tiene prioridad sobre
la originalidad abstracta que había valorado el revisor. Se descarta el azul grisáceo.

**Corrección de tipografía:** las cifras estaban desconectadas de los nombres y
el conjunto resultaba demasiado plano. Se retira Rajdhani de toda la pieza y se
trabaja la composición del núcleo y su extensión, manteniendo la identidad Vantare.

**Corrección previa de Isaac:** prefiere la composición unida, sin separar las
columnas en piezas. Rechaza el destacado rojo de Fodor y la placa detrás del 7.
Joined01 elimina la separación de 4 px, el rebaje de cabecera de 7 px y las
esquinas interiores. Fodor usa cristal gris neutro con una marca roja de 2 px
en el borde izquierdo; la cifra queda libre de placa. La nota de Depth03 no
sustituye esta decisión del usuario.

La propuesta Joined01 tenía una cabecera integrada, núcleo de identidad oscuro y
métricas secundarias ligeramente más transparentes. En carrera, el núcleo reúne
posición, piloto y GAP; vueltas y PIT se añaden como extensión. Filas de 30 px,
separación tenue y cristal suave. Usa carbón neutro, blanco y rojo Vantare `#C1121F`
(token existente en `frontend/src/index.css`). Selección gris continua, posición
del jugador sin fondo propio y texto TÚ. Cabecera de 44 px con isotipo,
firma, sesión y clase. Nombres en mayúsculas de 14 px. Amarillo reservado a PIT y
estados de fuente. **Inter en marca, nombres, posiciones, GAP, vueltas y reloj**,
verificado en las fuentes realmente utilizadas por Chromium. Mejor vuelta gana
peso en práctica y clasificación. No se modifican cifras ni precisión de la fuente.

Todas las columnas comparten un contorno continuo y la misma altura de cabecera.
La diferencia de opacidad conserva la jerarquía de lectura sin abrir huecos.
La fila del jugador tiene el mismo material neutro en todas sus celdas. La
profundidad procede de la transparencia, la luz tenue de cabecera y selección,
y la sombra exterior. El núcleo sigue completo al retirar los módulos.

## Contrato y archivos

- `frontend/src/overlay/design-systems/vantare-functional/`: renderer puro,
  tokens, etiquetas EN/ES/PT/IT, manifest y tests.
- Registro del sistema `vantare-functional` y diseño opt-in
  `standings-functional-compact`, más la alternativa `standings-functional-broadcast`,
  mediante los registros productivos existentes.
  No reemplaza perfiles ni los otros sistemas.
- `WidgetVisualViewport.tsx`: anchura real de este Standings, conservando la
  tipografía al añadir columnas. La geometría de los demás sistemas se conserva.
- `OverlayWorkshopDevRoute.tsx`, `FunctionalStudyControls.tsx`,
  `functional-study-options.ts` y CSS de Workshop: vista de estudio dentro del
  harness existente. El único renderer sigue siendo el de `WidgetVisualHost`.
- Variante dev `standings-functional-study`: diez filas de demostración explícitas
  para juzgar composición y longitudes similares a la referencia. No es evidencia
  de telemetría real y no altera el golden original. Sin dorsales ni logos inventados.
- Registro, catálogo y tests de caracterización actualizados para el cuarto sistema,
  que implementa solo Standings. El guard conserva la cobertura de los anteriores.

## Probar manualmente

Con el servidor local de este worktree en 5243 y runtime mock explícito, abrir:

`http://127.0.0.1:5243/workshop?widget=standings&system=vantare-functional&design=standings-functional-compact&variant=standings-functional-study&session=race&state=ready&surface=obs&background=context`

Activar Diferencia, Mejor vuelta, Última vuelta y Estado en boxes. La anchura cambia
entre 238 y 574 px en Principal, y entre 258 y 594 px en Broadcast. Elegir el
diseño con `Principal · 3` o `Broadcast · 2`; posición y nombre conservan tamaño.
Cambiar Carrera/Práctica,
fondos Mixto/Oscuro/Claro y fuente Recibiendo/Antiguos/Desconectado. El fondo es
solo un escenario abstracto para comprobar contraste; no forma parte del widget.

## Revisión visual independiente

Tarea Codex `01a08756-30ab-7682-af63-1df81364debe`, sin editar este worktree.
Capturas inmutables del React real y notas honestas, no aprobación del usuario:

- React01: 7,4/10. Demasiado peso uniforme y selección dorada dependiente de referencia.
- React02: 8,0/10. Mejor jerarquía y selección azul; reducir cabecera y lavado del jugador.
- React03: 8,275/10. Material aceptable; probar contraste de cifras y énfasis de práctica.
- React04: 8,3/10. Rajdhani en todas las cifras resulta demasiado técnica; se descarta.
- React05: 8,6/10. Se conserva tipografía híbrida y jerarquía específica de práctica.
- React06/07: **8,675/10 (8,7)**. Núcleo continuo de posición, piloto y GAP en carrera,
  extensión secundaria de vueltas/PIT y cabecera sin doble capa de opacidad.
  Candidata más lograda según el revisor, que desaconseja retoques arbitrarios
  para perseguir décimas. **No alcanza el umbral de 9 ni sustituye aceptación de Isaac.**
- Vantare01: corrección de marca a partir del feedback de Isaac. Cambian paleta,
  cabecera, caja del jugador y tratamiento de nombres. El revisor debe juzgar
  parentesco con Vantare/Redline, no solo diferenciación frente a la referencia.
  Nota 8,75; identifica la firma tipográfica genérica como único fallo importante.
- **Vantare02: 8,825 global; 9/10 en identidad Vantare.** Cabecera con el isotipo
  existente `frontend/src/assets/orbit/vantare-mark.png` junto a la etiqueta de marca.
  No es una reconstrucción del wordmark geométrico de la referencia, que no se
  encontró en el repositorio. El revisor considera resuelta la identificación.
  Paleta y composición recomendadas, aceptación de Isaac pendiente. El aviso
  de datos antiguos ocupa la etiqueta de sesión para no competir con la marca.
- Depth01: Inter unifica la pieza; el revisor considera la profundidad todavía
  parcial. Se comparan contacto entre superficies y composición en dos piezas.
- Depth02: se elige la composición en dos piezas y se corrigen un GAP que rompía
  el destacado vino y separadores desiguales en la primera columna secundaria.
- **Depth03: 9,0/10 global, sin redondeo.** Revisión visual de carrera, práctica,
  compacto, núcleo, módulos completos y fondos claro/oscuro. Se dan por resueltas
  la tipografía, composición y continuidad de superficies según el revisor.
  Isaac después pide unir las piezas y retirar el destacado rojo y la placa.
  Joined01 incorpora esas correcciones; la nota anterior no es su aceptación.
- **Joined01: 9,0/10 global, sin redondeo.** El revisor confirma las tres
  correcciones en cinco capturas de React: continuidad, selección neutra y 7
  sin placa. No propone más cambios dentro de este alcance. La aceptación
  visual de Isaac sigue pendiente. [Informe](../../design-evidence/functional/standings-joined-review.md).

Capturas del corte Joined01: [standings](../../design-evidence/functional/standings-joined-final.png)
y [módulos completos](../../design-evidence/functional/standings-joined-expanded.png).
Son evidencia visual, no imágenes usadas para construir el widget.

Capturas y JSON en
`C:/Users/isaac/.codex/visualizations/2026/09/09/01a08751-3d68-7f32-8f90-6b9f7e7c56ee/`.
Las revisiones se guardan en
`C:/Users/isaac/Documents/Codex/2026-09-09/revision-widgets-functional-1083/outputs/`.

## Verificación

**Traslado de las opciones elegidas:** 32 combinaciones de módulos verificadas
en el navegador integrado, con nombres íntegros de 14 px y diez filas de 30 px.
Principal: 238–574 px, altura 350 px. Broadcast: 258–594 px, altura 370 px.
Práctica enfatiza mejor vuelta en ambas; stale conserva las diez filas con aviso
y desconectado elimina filas. Chromium confirma Inter en nombres, posición, GAP,
vueltas, reloj y marca. Las dos apariencias se comprueban a través de
WidgetVisualHost en Studio/Desktop/OBS/harness mediante tests, sin equivaler
a validación física de esas superficies.

El primer corte de suite completa del traslado detectó el total histórico de
65 diseños frente a los 66 tras añadir Broadcast. Se actualiza la caracterización
a 66 y se exigen los dos IDs Functional explícitos; no se reduce cobertura.

Resultado final: **422 archivos, 3328 tests PASS y 2 omitidos** con cuatro
workers. Tras los últimos detalles de apariencia, **51 focales PASS**.
Build/typecheck y lint **PASS**; solo aviso de tamaño de chunks en build.
`git diff --check` PASS. El guard de sistemas continúa fallando por las tres
referencias Endurance preexistentes documentadas abajo; no se ocultan.
Consola de la pestaña de comprobación sin errores. No se ejecutaron Wails/LMU
ni tests Go porque este corte solo modifica frontend y documentación.

Revisión independiente: **Signature 9,0/10; Broadcast refinado 9,0/10**.
Broadcast pasó de 8,825 a 9 tras limitar las diagonales al espacio libre de
cabecera y suavizar las cápsulas. Informes conservados en
`design-evidence/functional/selected-designs-review-01.md` y `-02.md`.
Capturas completas del Workshop:
[Signature](../../design-evidence/functional/standings-signature-react.png) y
[Broadcast](../../design-evidence/functional/standings-broadcast-react.png).
Son capturas con escenario, no prueba de paridad física ni fondos del widget.

Archivos de este corte: `StandingsFunctional.tsx`, `tokens.css`, `manifest.ts`,
`StandingsFunctional.test.tsx`, `official-designs.ts` y su test,
`FunctionalStudyControls.tsx`, `OverlayWorkshopDevRoute.tsx`,
`overlay-workshop-characterization.test.ts`; más informe, handoff, plan,
roadmap generado y evidencia. Sin archivos movidos. Logs finales:
`C:/tmp/vantare-isa1083-tests-selected-final.log`,
`C:/tmp/vantare-isa1083-tests-selected-focused.log`,
`C:/tmp/vantare-isa1083-build-selected.log` y
`C:/tmp/vantare-isa1083-lint-selected.log`.

### Historial de comprobaciones

- Suite frontend completa tras la nueva base React: **422 archivos, 3322 PASS,
  2 omitidos**. Avisos de teardown happy-dom en salida, exit 0.
- Tras los siguientes ajustes: **36 tests focales PASS**, incluidos tamaños
  modulares sin escala y aviso stale con cabecera oculta.
- Build con typecheck y lint finales PASS (React07). Aviso conocido de chunks mayores de 500 kB.
- Navegador: **16 combinaciones PASS**, nombres íntegros a 15 px, filas de 30 px,
  anchuras 238–574 px y altura 332 px; sin errores JS. Práctica enfatiza bestLap,
  stale conserva diez filas con aviso y desconexión elimina los datos retenidos.
  Combinaciones repetidas en React05 y06; React07 solo elimina doble fondo de cabecera.
- Vantare01: **16 combinaciones repetidas PASS**, nombres completos en mayúsculas
  de 14 px, anchuras 238–574 px y altura 342 px; cero errores JS y estados correctos.
- Vantare final: repetidas las 16 combinaciones y estados PASS; build con el
  isotipo y lint PASS. Suite completa **3326 PASS, 1 fallo y 2 omitidos**:
  presupuesto de CPU del decoder V2, 1,562 ms frente al límite 1,5 ms. Ese test y
  su decoder no fueron modificados por este trabajo. Repetición aislada del test
  junto con los del widget: **14 PASS**. No se declara suite completa verde ni se
  atribuye una mejora de rendimiento; se conservan los dos resultados.
- **Corte de tipografía/profundidad:** suite completa **422 archivos, 3327 PASS
  y 2 omitidos**, incluyendo el presupuesto CPU que falló en el corte anterior.
  Tras consolidar la composición, **36 focales PASS**; build/typecheck y lint PASS.
  Navegador **16 combinaciones PASS**, altura 344 px, anchuras 238–574 px,
  nombres completos de 14 px, estados correctos y cero errores JS. Chromium
  confirma Inter para nombres, posición, GAP, vueltas, reloj y marca. La fila
  del jugador comparte el mismo color de superficie en todas sus celdas.
- **Corte de composición unida (Joined01):** navegador **16 combinaciones
  PASS**, 238–574 px de ancho, 344 px de alto, nombres completos y cero errores
  JS; práctica y estados de fuente correctos. Inter confirmado de nuevo en
  las seis categorías; selección neutra idéntica en todas las celdas.
  Suite completa: **3325 PASS, 2 fallos y 2 omitidos**. Fallan la espera de
  `use-fonts-ready.test.tsx:52` (80 ms con temporizadores reales) y el timeout
  de 20 s de `StandingsRedlineTemplate.layout.test.tsx:246`. No se modificaron
  esos ficheros. Repetición de ambos junto con los tests del estudio con dos
  workers: **41 PASS**. Esto no convierte el primer resultado en una suite
  completa verde ni demuestra por sí solo la causa de los fallos.
  Logs: `C:/tmp/vantare-isa1083-tests-joined.log` y
  `C:/tmp/vantare-isa1083-tests-joined-focused.log`.
  Build con typecheck y lint **PASS**; permanece el aviso de chunks mayores
  de 500 kB. `git diff --check` PASS. No se añaden tests de detalles CSS:
  la geometría, estados y tipografía se verifican en el navegador real.
- El guard `design-system:check` mantiene tres detecciones previas en tests
  Endurance (imports/URLs). No se debilita para ocultarlas.
- No se ejecutaron Wails ni LMU en este corte. No se acredita telemetría física,
  aceptación visual de Isaac, rendimiento ni paridad entre sistemas operativos.

## Integración productiva, 2026-09-10

Plan vigente: [entrega por partes](ISA-1083-delivery-plan.md). ISA-1083 entrega
el widget; ISA-1097 separa disponibilidad y marca por licencia.

- Regresión de persistencia reproducida: Go rechazaba `vantare-functional`.
  Se incorpora al contrato y se verifican perfiles V4 y diseños de usuario
  tras una lectura nueva del disco, para Signature y Broadcast.
- El selector de Studio usa el registro existente y solo ofrece sistemas
  compatibles con el tipo de widget. Seleccionar Functional/Broadcast conserva
  el contenido; no se ofrece Functional para Pedals.
- Un perfil de 340 px recortaba nombres en el harness normal de Studio.
  El marco efectivo ahora respeta columnas y número de filas; lo comparten
  Studio, Desktop, OBS y Workshop. No cambia el documento al renderizar.
  Los movimientos conservan preview DOM imperativa; el resize parte del marco
  visible. Las regresiones incluyen 20 filas, borde derecho y snapping.
- El aviso stale con cabecera oculta se muestra en las etiquetas de columna:
  conserva aviso y filas sin aumentar el alto. Signature reserva su cabecera
  independiente cuando se ordena una columna de tiempos antes de la identidad.

Evidencia: `C:/tmp/vantare-isa1083-persistence-red.log` y `-green.log`,
`C:/tmp/vantare-isa1083-studio-red.log` y `-green.log`,
`C:/tmp/vantare-isa1083-geometry-red.log` y `-green.log` (145 PASS).
Suite frontend anterior a geometría: 3330 PASS, 2 omitidos, exit 0.
Suite Go completa, build con tipos y lint PASS. Los resultados del corte final
y de la revisión independiente se registran al cerrar la entrega.
El guard visual conserva las tres detecciones Endurance, reproducidas en la base
limpia; no se suprime ninguna regla. Los datos del harness son fixtures, no LMU.

Revisión independiente: tres P2 corregidos (cabecera, controles de anchura y
borde inferior), veredicto final sin bloqueantes. [Expediente de revisión](../../design-evidence/functional/integration-review.md).
Suite completa posterior: **424 archivos, 3345 PASS, 2 omitidos**, exit 0;
166 tests focales tras los primeros fixes y 22 tras el último ajuste de cabecera.
El estado de las comprobaciones globales y focales se conserva por corte.

## Estado y límites

El corte de marca modifica `StandingsFunctional.tsx`, `tokens.css` y el CSS de la
vista de estudio en `overlay-workshop.css`; reutiliza el isotipo sin cambiarlo.
También actualiza este informe, el handoff y el plan con su roadmap generado.
Los cortes posteriores de tipografía/profundidad y composición unida solo cambian
el TSX y CSS del propio Standings, esta documentación y las capturas de evidencia. No cambia datos,
persistencia, columnas disponibles ni otros renderizadores.

Entrega opt-in en rama de issue, autorizada para Nightly al completar los
controles; todavía sin integración ni publicación acreditadas. Se preservan
el checkout principal y las aplicaciones abiertas. Disponibilidad confirmada;
la prueba física Wails/LMU sigue pendiente porque esta sesión solo controla UI
de navegador, no ventanas nativas. La revisión independiente está cerrada. Los resultados de
navegador/fixtures no acreditan rendimiento ni paridad entre sistemas operativos.

## Nombre del sistema aprobado — 2026-09-10

Efficiency es el sistema de diseño; Eficiencia en español, Eficiência en
portugués y Efficienza en italiano. Signature y Broadcast son sus estilos.
Se conservan los identificadores históricos `vantare-functional` y
`standings-functional-*` para guardar/reabrir perfiles, memorias y enlaces.
Studio resuelve los nombres oficiales vigentes sin reescribir documentos ni
renombrar estilos de usuario. Los controles del Workshop ya muestran esta jerarquía.

El ajuste afecta al manifiesto/catalogo, controles Workshop, selector y modelo
de presentación Orbit, sus tests, ocho diccionarios de Studio, plan, roadmap y
handoff. No cambia la estética aprobada, columnas, geometría o autoridad Go.
Delta de pago queda confirmado como decisión para ISA-1097; no se anuncia como
derecho ya implementado. Revisión y evidencias del corte en
`design-evidence/functional/integration-review.md`.
