# Aceptación, trazabilidad y cierre — SDD v1.1

[Especificación](README.md) · [Tareas](execution.md).

## Estados de un criterio

- **Pendiente:** falta implementación o comprobación.
- **PASS local:** código y evidencia del worktree identificado.
- **Inconcluso:** muestra/entorno insuficiente; no equivale a PASS ni FAIL físico.
- **FAIL:** incumplimiento reproducido, con issue y siguiente corrección.
- **Aceptado:** Isaac acepta lo que exige decisión humana; no significa publicado.

La matriz define pruebas que faltan por cerrar como conjunto, incluso cuando
algunos casos individuales ya pasaron. El handoff/issue conserva su estado actual.

## 1. Matriz de aceptación

| ID | Requisitos | Caso observable de aceptación | Evidencia mínima / tarea |
|---|---|---|---|
| A01 | R01 | LMU real atraviesa reader normalizado y proyección; Strategy no contiene SQL/lector paralelo. Contrato no exige extensión DuckDB a futuros adapters. | Tests contrato/arquitectura + banco real; T08/T22. |
| A02 | R02 | Abrir, corregir, copiar y recalcular conservan hash original. Copia verificada permite recuperar fuente ausente; copia fallida/cambiada no se ofrece como válida. | Hash antes/después, archivos temporales propios y casos permisos/espacio/colisión; T09/T22. |
| A03 | R03 | Manual y Automático llegan al mismo evento/editor; descubrimiento autorizado propone fuentes sin abrirlas todas ni aceptar selección silenciosa. | E2E desde ambas entradas con catálogo vacío y poblado; T05/T08. |
| A04 | R04 | Cinco pasos exactamente; Combinación no repite simulador/evento. Atrás/adelante/reabrir conserva el borrador y permite editar directamente. | Capturas + interacción/persistencia; T04–T07. |
| A05 | R05 | Evento de calendario real y carrera personalizada resuelven identidad. Cambiar combinación invalida derivados. Monomarca y multicar se distinguen. Feed ausente no inventa eventos. | Casos de provider/selector/documento y Wails; T05. |
| A06 | R06/R19 | Todas las pantallas A4 portadas a producto, sidebar comprimido donde acordado, carmín moderado y sin resultados decorativos. Cada pantalla >9/10 en revisión adversarial visual. | Referencia/actual mismo viewport, rúbrica, hallazgos y correcciones; T18 y revisión final Isaac. |
| A07 | R07 | Selección/corrección se hacen en Strategy con Analysis como owner; una revisión exacta llega al solver sin sustitución. | Test fronteras + flujo UI→Go; T10/T14/T15. |
| A08 | R08 | Valor, uso por familia, clasificación y límite pueden corregirse donde hay target válido; motivo/original visibles. Restaurar crea revisión. Target ambiguo, conflicto y guardado incierto se manejan sin pérdida. | Regresiones contractuales + cuatro recorridos reales; T10–T14. |
| A09 | R09/R10 | Invalidada sana, incidente, vuelta lenta sana y señal desconocida reciben tratamiento demostrable por familia. No ocultar Fuel sano al excluir ritmo. | Anotaciones independientes, confusión/cobertura por familia y test de derivados; T11/T12/T19/T20. |
| A10 | R11 | Evento completo transporta todas las reglas/inventario/pilotos/Fuel/VE al motor. Cada ausencia produce razón; no defaults ocultos ni cero por ausencia. | Matriz campo-origen-destino-test y goldens Go/TS; T02/T06/T22. |
| A11 | R12 | Piloto observado y estimado muestran origen; delta editable sólo altera ritmo; guardar/reabrir conserva estimación y restricciones de conducción. | Tests perfil/documento + UI resistencia; T07. |
| A12 | R13 | Propuesta inicial optimiza modelo; restringir/recalcular conserva constraints. Distingue factible de óptimo y detecta timeout/inviabilidad. | T15 funcional PASS local en #1271: replay/optimalidad, estados terminales y aceptación exacta. Restricciones editables siguen en T16/T17; gate integral T22. |
| A13 | R14 | Sin familias suficientes se guarda configuración y muestran magnitudes respaldadas; no óptimo completo. Recalcular no muestra resultado anterior como vigente. | T15 funcional PASS local en #1271: ausencia/cero, cobertura parcial y respuesta vigente. Gate integral T22. |
| A14 | R15 | Stint/parada editables con recursos, ventanas, inventario y coste válidos; drag y teclado equivalentes. No doble conteo de servicio ni reserva negativa. | Tests solver final + interacción y capturas; T16/T17. |
| A15 | R16 | Aceptar, modificar corrección, guardar, cerrar, reiniciar y reabrir reproduce revisión exacta. Plan aceptado permanece consultable sin original; derivación exige fuente/revisión válida. | E2E real + tests archivo cambiado/head avanzada/revisión perdida; T09/T14/T22. |
| A16 | R17 | Nuevo flujo no exige migración legacy; tampoco borra datos reales ni utiliza estrategias de ejemplo como evidencia de telemetría. | Revisión consumidores/cutover y arranque aislado; T14/T22. |
| A17 | R18/R19 | Revisión personal de código y Ponytail por bloque, pruebas pertinentes, sin ocultar fallos. Planes/docs y aceptación a cargo del orquestador; ejecutor según el reparto operativo vigente en execution.md, sin subdelegación implícita ni ediciones concurrentes. | Diffs e informes de revisión, issues hallazgos, gates completos; todos los cortes. |
| A18 | R20 | Wails real en build/configuración aplicable, autorizado, recursos liberados y originales intactos; LMU no intervenido. | PID/path propios, versiones/runtime/configuración saneada y logs/capturas; T22. |
| A19 | R21 | Corrección matemática y error empírico medidos por separado con corpus reservado suficiente y protocolo congelado. | Informes T19–T21, métricas/N/intervalos y límites, no fuga futura. |
| A20 | R22 | Editor registrado validado antes de implementar live; investigación compara OSS y decide Monte Carlo con licencias/evidencia. | Informe posterior T24, sin código live anticipado. |
| A21 | R23 | Cada corte tiene siguiente tarea elegible; no solicita permiso por acabar commit/check. Bloqueos reales afectan sólo su dependencia. | Trazabilidad de issues/handoff y protocolo de ejecución. |

## 2. Escenarios completos obligatorios

**E01 — carrera individual desde Manual.** Inicio → Combinación personalizada
LMU → reglas → piloto → sesiones compatibles → revisar vuelta → corrección con
motivo → calcular → aceptar → cerrar/reabrir → reproducir. Fuente original intacta.

**E02 — resistencia desde Automático y calendario.** Descubrir → proponer
combinación → seleccionar evento real compatible → reglas → piloto observado y
estimado → sesiones compatibles → propuesta → fijar stint/cambio de piloto →
parada con servicios → recalcular → coste/recursos → aceptar. Si falta un dato,
mostrar estado parcial y qué impide la propuesta completa.

**E03 — integridad/revisión.** Plan usa revisión A; otra edición crea B. Abrir
plan conserva A; elegir B crea borrador desactualizado. Archivo cambiado o A
perdida no se sustituye por base/B. Restaurar genera revisión nueva y trazable.

**E04 — fuentes/recuperación.** Original disponible; copia opcional verificada;
original ausente con copia; sin ambos; WAL activo; permiso denegado; corrupción
recuperable/no recuperable; runtime ausente. Cada caso conserva carrera y razón.

**E05 — interrupción.** Cancelar discovery/open/prepare/guardar/calcular, salir
del evento, cerrar app y reabrir. No recursos huérfanos ni resultado tardío
vigente. Guardado incierto se resuelve por commandId; cancelar no promete rollback.

**E06 — datos imperfectos.** Vuelta invalidada representativa, trompo confirmado,
lentitud normal, pit, discontinuidad y clima distinto. Clasificación por familia,
corrección explícita y ausencia de señal desconocida; sin promoción de confianza.

**E07 — horizonte/recursos.** Carrera por vueltas y por tiempo; última vuelta,
reserva Fuel y VE, VE no aplicable, neumáticos agotados, ventana obligatoria,
conducción máxima, tareas de pit simultáneas y secuenciales. Decisión final
evaluada después de restricciones; imposible permanece imposible.

**E08 — volumen.** Biblioteca real de cientos de archivos, cuatro abiertas,
quinta rechazada claramente, 1024/1025 en tests de metadatos; paginación/filtrado
de UI no altera selección ni abre fuentes ocultas. No truncar un resultado.

## 3. Capas de prueba y evidencia

| Capa | Qué demuestra | Qué no demuestra |
|---|---|---|
| Unitarias/contrato | Unidades, ausencia, identidad, selección, algoritmo, errores. | Exactitud de señales reales ni acabado visual. |
| Enumeración/replay | Óptimo de espacios acotados y factibilidad de decisión bajo el modelo. | Superioridad física de una estrategia que no se corrió. |
| Corpus preparación | Semántica y calibración de criterios; reproducción de fallos. | Evaluación independiente del propio ajuste. |
| Corpus reservado | Error bajo protocolo preregistrado y cobertura medida. | Generalización fuera de las condiciones/muestra. |
| React/Playwright con fixture | Interacciones/estados/presentación del componente productivo. | Reader real, permisos o distribución. |
| Wails diagnóstico con DuckDB real | Bridge/reader/selección/persistencia en runtime nativo identificado. | Login/entitlement o build de distribución. |
| Wails distribución | Recorrido real con configuración/licencia de producto. | Aceptación humana o release publicada. |
| Revisión visual | Semejanza A4 y usabilidad de pantallas revisadas. | Corrección matemática o precisión empírica. |

No asignar porcentajes de cobertura arbitrarios como sustituto de casos críticos.
Tests deben probar comportamiento y regresiones, no reflejar detalles internos.
Mantener fixtures reales saneadas cuando proceda; casos matemáticos controlados
se identifican como tales y nunca pasan por telemetría del usuario.

## 4. Protocolo visual

1. Captura del componente productivo a la misma resolución de la referencia;
   referencia de recorrido final y stint/parada prevalecen sobre iteraciones viejas.
2. Revisar composición/jerarquía, proporciones/espaciado, tipografía, color/luz,
   recursos/iconografía y estados/interacción. Registrar puntuación por dimensión
   y total de cada pantalla; ningún total medio oculta una pantalla ≤9.
3. Corregir hallazgos visibles, recapturar y repetir. Reviewer exclusivamente
   visual según autorización previa, sin tocar código. No afirmar independencia
   si sólo se hizo autoevaluación.
4. Comprobar al menos viewport de referencia 1672×941 y escritorio más estrecho
   1280×720, además de escalado del equipo real. Son casos de prueba, no cambio
   del tamaño mínimo de producto. Validar también tamaño mínimo vigente del repo.
5. Teclado, foco, scroll, textos largos ES/EN/PT/IT, estados vacíos, error,
   parcial y ocupado. El arrastre tiene alternativa de edición numérica/teclado.
6. Al superar >9/10 individual, enviar un conjunto ordenado a Isaac para revisión;
   avanzar tareas técnicas independientes mientras espera. Su aceptación final
   no sustituye los gates de cálculo y datos.

## 5. Protocolo empírico y rendimiento

Antes de evaluación: guardar hashes de conjuntos, criterio de deduplicación,
orden temporal, versiones de análisis/solver, correcciones/selección, métricas,
umbrales y muestra mínima. Separar fuentes expuestas de reserva. No aprender del
futuro de la misma carrera que se predice. Si se ajusta con resultados reservados,
esa reserva pasa a preparación y hace falta otra para certificar nuevamente.

Métricas: contaminación aceptada, descarte útil, cobertura/desconocidos por
familia; error firmado/absoluto ritmo s/vuelta/stint, Fuel L, VE puntos
porcentuales, pit s; factibilidad y ranking dentro del modelo. Reportar
incertidumbre por carrera y condiciones; no mezclar climas para mejorar promedio.
No adoptar el 2% provisional histórico como tolerancia aprobada.

Anotar PIT/tráfico/daño/trompo con evidencia independiente cuando exista. Sin
verdad suficiente, resultado inconcluso y explicación de qué falta. Presentar a
Isaac tolerancias/N con tradeoffs después de preparación, antes de reserva.

Medir discovery, abrir/preparar, derivar, calcular, cancelar y memoria de recursos
retenidos en condiciones comparables. Registrar hardware, versiones, corpus,
estado de otros procesos y tres repeticiones cuando se compare rendimiento.
No afirmar ahorro si variación invalida comparación. Presupuestos de producto
vigentes permanecen; un banco no los redefine. #1089 no se arregla sólo subiendo
o quitando ocho segundos ni devolviendo una solución factible como óptima.

## 6. Definición de terminado

**Editor registrado listo para aceptación** requiere A01–A19 y A21 con evidencia
aplicable, sin P0/P1 abiertos del recorrido y sin ocultar pendientes materiales.
T24/A20 es fase posterior explícita y no bloquea esta entrega. Incidentes sin
señal no se certifican detectados; límites del modelo se muestran al usuario.

El informe final enumera requisitos, pruebas y artefactos, hallazgos cerrados/
abiertos, ausencia de datos y consecuencias, captura de cada pantalla, base/
rama/SHA/commits y estado real PR/CI. Una muestra insuficiente mantiene A19
inconcluso aunque el software pueda probarse. No anunciar el conjunto terminado.

**Integrado** exige aprobación y SHA/PR/CI de Nightly; **promocionado** exige
canal y gates correspondientes; **publicado** requiere release verificable y
autorizada. Ninguno se deduce de tests locales ni de escribir este SDD.

## 7. Revisión documental histórica v1.0

ISA-1091, base 0240bc78. Revisados chat, spec/maestro #1028, contrato/ADR 0010,
protocolo #1030, prototipo #1063, handoffs, código de correcciones/adapter/cálculo
Orbit y evidencias #1088/#1090. Correcciones durante la revisión: nombre exacto
del test real; #152 era otra issue y se retiró del seguimiento live; selección
unificada de cinco pasos prevalece sobre siete; propuestas históricas no vuelven
a bloquear la mecánica escalar ya ejecutada. No se presume PASS del motor real.

Validación documental: enlaces relativos del paquete, cobertura R01–R23,
A01–A21 y T00–T24, referencias cruzadas, JSON de roadmap regenerado y diff check.
No Go/React/tests/build/app en esta entrega exclusivamente documental. La
revisión es personal; no se atribuye revisión adversarial independiente del SDD.
Las mediciones/test del código citados son evidencia previa, no nuevas ejecuciones.

## 8. Revisión de continuidad v1.1 — 2026-09-13

Base auditada `c2d5b45b`, stack ISA-1104. Revisión documental independiente
solicitada a Astra high: contrastados SDD, handoff, roadmap, issues #1091/#1104/
#1030/#1033/#1092/#1089/#1028/#1063/#439/#436, matriz #1092 y componentes/adapter actuales. Se conservan R01–R23,
A01–A21 y T00–T24. La numeración de T12 no prueba que todas las tareas anteriores
estén cerradas: T02/T03/T06/T07 requieren cierre explícito antes de T15; T11i
sigue en T18/T22. T19a temporal precede a T13 y no exige certificar incidentes.

El plan ahora desglosa subcortes, dependencias y checkpoints C0–C4. T14 incluye
recuperación de comandos tras reinicio y distingue historial de fuente/plan.
T21 exige modelo final congelado y reserva suficiente; T22 tiene preflight
temprano para no posponer el bloqueo nativo hasta el final. T23 no puede cerrar
A19 inconcluso ni sustituir distribución por authorizer controlado. T24 comienza
tras aceptación recorded y continúa siendo investigación sin código live.

T12 PASS local y los bancos J9 se citan como evidencia previa, no ejecuciones
nuevas de esta revisión. Verificación documental: referencias relativas/IDs,
diff y regeneración canónica del roadmap. No se ejecutan Go/frontend/build ni
Wails porque sólo se actualiza documentación de planificación.
