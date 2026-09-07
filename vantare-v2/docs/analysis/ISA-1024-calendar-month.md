# ISA-1024 — cálculo mensual por día local

Derivado de #1015, autorizado por Isaac. Base nightly
`d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2`; rama
`vantareapp/isa-1024-calendar-month`, worktree `C:/tmp/vantare-isa1024-calendar-month`.
Independiente del código de #1020 y del renombrado #1022; no incorpora sus commits.

## Evidencia y cambio

RacesOrbitPage reconstruía monthAnchor/monthDays por cada tick de 1 s.
monthDays solo usa now para identificar el día local; su resultado de 42 celdas
depende de calendario/eventos, filtro, mes mostrado y día local, no del segundo.

Regresión previa: 10 llamadas idénticas en 10 ticks. Tras el cambio: cero llamadas
en esos ticks. Se conserva un Date por día local usando dayAnchor, sin redondear
por días UTC ni añadir un temporizador de 24 h. El reloj principal sigue a 1 s.
Se mantienen las dependencias de datos, filtro y desplazamiento del mes.

44 tests focales PASS: contenido de cuadrícula estable entre segundos, cuenta
atrás cambia al segundo, actualización al cruzar medianoche local de diciembre
a enero, filtro, eventos nuevos y navegación al siguiente mes. Página/funciones
productivas en Happy DOM con el fixture existente y un evento de test: esto
demuestra trabajo evitado y comportamiento, no un benchmark de conducción.

No hay cambio de estilos, motor calendario, rutas, permisos, datos ni cadencias;
HUD/Studio y dependencias intactos. El componente todavía renderiza cada segundo;
se evita reconstruir el modelo mensual, no todo el render React. Sin porcentaje
de ahorro CPU/RAM/GPU ni mejora Wails de navegación certificados.

## Entrega y validación

Seis archivos: página, test, este informe, handoff platform-commercial, plan.md y
roadmap.json generado. No movimientos ni cambios al checkout principal.
Logs locales en results/isa1024-checks. Primera suite: 3237 PASS/1 FAIL por
timeout de 20000 ms en StandingsRedlineTemplate.layout.test.tsx:246, fuera del
alcance y separado en #1025. No se cambia el test ni su límite. Única repetición:
3236 PASS/2 FAIL, Standings y PedalsRedline.layout.test.tsx (indicación de freno
con generic sans-serif fallback), ambos timeout 20000 ms. Se conservan ambos
resultados y se detienen repeticiones sin diagnóstico. Esto no es suite verde.
Roadmap regenerado, 23+21 tests PASS. Typecheck/build/lint completos PASS.
Build conserva el aviso de chunks grandes y Happy DOM registra AbortError de
teardown; los fallos de suite son los timeouts descritos. Issue #1024 conserva
SHA, PR y CI actualizados.
No Go ni contratos compartidos modificados: no se repite Go local por este corte.

Manual Wails pendiente: abrir Mes con calendario real, comprobar cuenta atrás,
filtros, navegación, actualización del documento y cambio de día sin diferencias
visuales. Medir A/B con LMU/Edge conservados, mismo foco/Auto/datos y sin mezclar
el perfilador con el consumo. La combinación con otros candidatos de #1015 se
revisa y prueba al integrar: las entregas aisladas no certifican el conjunto.
Sin merge, promoción ni release.

Revisión del diff: cambio acotado al cálculo mensual, sin modificar dayAnchor,
monthAnchor o monthDays, ni el reloj principal. El detalle conserva su reloj
original; datos/filtro/offset siguen entre las dependencias. Los tests de la
página y modelo pasan, pero no sustituyen el gate completo fallido ni Wails.
