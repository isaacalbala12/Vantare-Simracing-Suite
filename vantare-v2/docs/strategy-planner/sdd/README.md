# SDD — Strategy sobre telemetría registrada

Versión 1.1 · revisión de continuidad 2026-09-13 · ISA-1091 · continuación de ISA-694/1028.

## Autoridad y propósito

Este paquete reúne especificación, plan de ejecución y aceptación del alcance
acordado con Isaac en la conversación del editor registrado. Sustituye la
**secuencia de ejecución pendiente** de los planes históricos de Strategy para
este alcance; conserva los contratos técnicos enlazados. No redefine otros
proyectos ni concede permiso para promover o publicar.

Este SDD se consolidó durante la pausa de implementación. Isaac autorizó
después iniciar todo su alcance y continuar sin aprobaciones entre cortes.
Las decisiones de producto y ejecución del chat se conservan; seguir
[execution.md](execution.md) de principio a fin sin preguntar «¿continúo?»
entre tareas. El reparto vigente entre orquestador y ejecutor está en R19.

Base histórica del SDD: `0240bc7806570be17832aea6153300631f392170` (ISA-1090).
Revisión de continuidad contrastada en `c2d5b45b43bbf8ff0efb2cd16f1598f7a4925eff`,
stack local ISA-1104. [execution.md §0](execution.md#0-punto-de-reanudación-comprobado--2026-09-13)
identifica capacidades presentes y cierres restantes. No se da T00–T12 por
completo por haber cerrado T12. Ninguna evidencia local equivale a integración Nightly.

**Lectura operativa:** este archivo → [ejecución](execution.md) →
[aceptación](acceptance.md) → sección técnica necesaria. El único estado vivo de
Strategy sigue en [su handoff](../../vantare-program/handoffs/strategy-planner.md);
Analysis mantiene [el suyo](../../vantare-program/handoffs/telemetry-analysis.md).
No crear otro handoff. Las tareas de este paquete conservan IDs estables y
enlazan la evidencia; no duplican estados cambiantes de GitHub.

## 1. Resultado que se entrega

Una persona configura una carrera dentro de Strategy, selecciona telemetría
compatible, revisa y corrige lo que se usará, genera una propuesta optimizada,
comprende sus límites, impone restricciones si lo desea y guarda una revisión
reproducible. Todo con el diseño A4 aprobado y los colores actuales de Vantare.

Éxito significa completar ese recorrido en Wails con archivos reales, demostrar
la corrección del motor bajo sus supuestos y medir por separado la validez de
esos supuestos. No basta con tener un lector, un solver o un prototipo separado.

## 2. Decisiones cerradas y trazabilidad del chat

Los «agree» cuyos enunciados originales no figuran en el contexto no se
reinterpretan como requisitos nuevos. Se usan los acuerdos explícitos y la
spec aprobada #1028 para recuperar su significado.

| ID | Decisión vinculante | Prueba de aceptación |
|---|---|---|
| R01 | Primera entrega LMU/DuckDB; contratos abiertos a otros formatos incorporados por Vantare. No SQL ni DuckDB obligatorios para futuros simuladores. | A01 |
| R02 | Originales intactos; ubicación original y copia opcional a carpeta elegida. | A02 |
| R03 | Manual configura una carrera; Automático descubre y propone sesiones/combinaciones. Ambos convergen en el mismo editor y motor registrado. | A03 |
| R04 | Asistente de cinco pasos: Inicio, Combinación, Reglas, Pilotos, Sesiones. Simulador y evento no son pasos adicionales. | A04 |
| R05 | Combinación reúne simulador, evento personalizado/calendario Vantare, categoría/coche, circuito/trazado. Una categoría monomarca puede resolver el coche; multicar no se mezcla sin criterio. | A05 |
| R06 | Diseño A4 y estilo videojuego aprobados; rojo/carmín moderado, superficies oscuras y sidebar comprimido en edición/cálculo. | A06 |
| R07 | Toda edición visible dentro de Strategy; Analysis conserva lectura, clasificación, correcciones y derivaciones. | A07 |
| R08 | Se revisan sesiones, stints, vueltas y datos; visión avanzada para canales/muestras. Correcciones reversibles, con original, motivo y procedencia. | A08 |
| R09 | Invalidada no equivale a inutilizable. Uso por familia; no inferir incidentes sólo de lentitud ni borrar degradación normal. | A09 |
| R10 | Evaluar clima, temperatura, desgaste, trompos, daños, tráfico, boxes, banderas y discontinuidades según señales reales; desconocido sigue desconocido. | A09 |
| R11 | Reglas, pilotos, neumáticos, Fuel y energía virtual necesarios deben estar disponibles o faltar explícitamente antes de prometer óptimo completo. | A10 |
| R12 | Resistencia permite estimar ritmo de otro piloto a partir del observado, con aviso y diferencia editable en s/vuelta. No inventar consumo/desgaste propios. | A11 |
| R13 | Primero propuesta óptima dentro del modelo; después restricciones y recálculo. Escenarios generales hipotéticos de ahorro/ritmo no forman parte de la primera entrega. | A12 |
| R14 | Resultado parcial permitido: calcular sólo lo respaldado. Ausencia no es cero; no rellenar con referencias ajenas automáticamente. | A13 |
| R15 | Edición de stint y parada, con representación de recursos y servicio; cambios muestran coste/restricciones y obsolescencia. | A14 |
| R16 | Plan aceptado fija fuentes, correcciones, selección, reglas y versión del cálculo. Cambiar la cabeza de una sesión no lo altera. | A15 |
| R17 | No se exige migrar estrategias antiguas no usadas; no autoriza borrar originales ni datos reales. | A16 |
| R18 | Auditoría Ponytail + revisión de código antes de nuevos bloques; tests, evidencia real y revisión visual iterativa. | A17 |
| R19 | El orquestador mantiene planes, producto/arquitectura, documentación y aceptación basada en revisión del diff y evidencia. Un ejecutor por worktree, sin subdelegación implícita; proveedor/modo vigentes se fijan operativamente en execution.md. Revisión adversarial exclusivamente visual separada, >9/10 por pantalla antes de pedir revisión humana. | A06, A17 |
| R20 | PC autorizado para bancos/builds/app cuando esté libre; coordinar otras mediciones. LMU no se inicia ni se cierra. | A18 |
| R21 | Seguridad sobre el cálculo sin incidentes: demostrar modelo y medir error empírico; no prometer infalibilidad ni contrafactuales observados. | A19 |
| R22 | Live, investigación OSS extensa y posible Monte Carlo después del editor registrado validado. Monte Carlo es hipótesis, no arquitectura aprobada. | A20 |
| R23 | Continuar entre cortes y corregir hallazgos del alcance sin pedir permiso repetido; detener sólo la acción realmente bloqueada. | A21 |

## 3. Qué existe y qué no está terminado

Estado de referencia, no certificación permanente: revalidar al empezar cada corte.

| Capacidad | Evidencia local al 13-09 | Pendiente real |
|---|---|---|
| Diseño y entrada | Asistente A4 unificado y biblioteca productiva #1093–1095; configuración guardada/reabierta. | Completar reglas/pilotos y paneles cálculo/plan/stint/parada; paridad T18 y recorrido Wails T22. |
| Lectura/correcciones | Valor, uso por familia, clasificación y catálogo canónico v4 #1096/#1099/#1104. Banco J9 bidireccional Imola↔Monza conserva hashes originales. | Límites T13, comandos tras reinicio y revisiones completas de plan T14, gates nativos/visuales. |
| Selección exacta | Documento/cliente/adapter #1084–1088 y adopción explícita desde Datos/Revisiones. | Plan aceptado reproducible con todas las entradas/versiones y consulta sin fuente; T14/T22. |
| Motor/entradas | SolverV2, replay final y corrección local del coste repetido #1089; transporte de reglas #1092. | T02/T03/T06/T07 no completos: perfiles, disponibilidad, inventario, servicios/formación, recursos/horizonte y estados; conexión productiva T15. |
| Criterios | Inventario/protocolo #1030; Imola/Monza son preparación expuesta. | T19a temporal antes de límites; anotación independiente, calibración y reserva suficiente T19–T21. |
| Calidad | Gates locales y bancos por corte; T12 local cerrado en c2d5b45b. | WebView2 ERROR_INVALID_STATE sin causa demostrada, aceptación visual/nativa/distribución y precisión empírica. |

Las notas antiguas «falta cliente/selección/productor» quedan superadas por
#1082–1088. Las frases «no implementado» del ADR 0010 describen su fecha de
redacción; no rehacer la mecánica ya existente. Las autorizaciones del PC y de
acciones remotas se comprueban con la instrucción vigente del chat: el SDD no
levanta restricciones posteriores. Esta revisión no abre app ni genera build
de escritorio. Prueba diagnóstica, banco nativo y distribución son evidencias
distintas. El estado vivo y sus artefactos permanecen en el handoff único.

## 4. Contrato de experiencia

### 4.1 Asistente

- **Inicio:** Manual o Automático; abrir carrera guardada. No elegir dos motores.
- **Combinación:** selector único con identidad canónica. Calendario usa el
  proveedor de Vantare existente. Se conserva referencia/versionado del evento
  y snapshot de reglas para reproducir; un cambio del calendario se ofrece,
  nunca reescribe el plan aceptado. Feed ausente permite carrera personalizada,
  con causa visible. No se inventan eventos ni se bloquea toda la herramienta.
- **Reglas:** duración o vueltas y semántica de final; condiciones/clima;
  capacidades, reservas y recursos; reglas de servicio, ventanas, cambios,
  neumáticos/inventario y conducción. Cada campo indica evento, dato observado
  o configuración explícita. Datos del evento se confirman, no se piden dos veces.
- **Pilotos:** orden, disponibilidad, límites y cambios obligatorios cuando
  apliquen. Ritmo observado o estimación explícita con referencia y delta.
  Disponibilidad incompleta no se convierte en disponibilidad ilimitada oculta.
- **Sesiones:** propuestas compatibles, cobertura por familia, motivos de uso o
  exclusión y acceso a revisión. Configuración se puede guardar sin datos;
  calcular muestra exactamente qué puede obtenerse y qué falta.

Atrás/adelante conserva el borrador. Cambiar combinación invalida derivados y
señala selecciones incompatibles sin borrar correcciones de las fuentes. Abrir
una carrera guardada no obliga a repetir todo el asistente. Ningún botón de
avance importa todos los archivos ni acepta una propuesta por el usuario.

### 4.2 Editor y pantallas aprobadas

| Pantalla | Contenido real y acción principal |
|---|---|
| Carrera | Resumen de combinación, evento, reglas/pilotos y cobertura; editar configuración y calcular/recalcular. |
| Datos | Sesiones → stints → vueltas → muestras; selección por familia, original/corrección, causas y alcance de datos ausentes. |
| Plan | Timeline, stints, paradas, recursos y restricciones. Selección sincronizada con el detalle; resultado calculado en Go. |
| Cálculo | Estado real, cancelación, presupuesto, resultado parcial/inviable/error. Sin porcentaje de progreso ficticio. |
| Revisiones | Borrador, propuesta, plan aceptado, fuente/revisión usada, cambios y restauración como nueva revisión. |
| Stint | Piloto, vueltas/duración, ritmo y procedencia, neumáticos, Fuel/VE al entrar/salir, restricciones y efectos. |
| Parada | Entrada/salida, tránsito, servicios, cantidades, cambio de piloto/neumático, tareas paralelas/secuenciales y total. |

Fuentes visuales: [prototipo](../prototypes/recorded-editor/README.md),
[recorrido](../evidence/isa-1063-all-screens),
[stint/parada](../evidence/isa-1063-visual-loop).
El último recorrido unificado prevalece sobre capturas anteriores con siete pasos.
Portar composición, jerarquía, espaciado e interacción; reutilizar tokens/kit
Orbit. HTML/prototipo es referencia, no un renderer alternativo en producción.
No usar fotografías generadas como datos observados ni cifras decorativas como
resultados. Conservar presencia visual con estados vacíos diseñados.

Biblioteca: no presentar 416 filas de fecha/tamaño como experiencia terminada.
Mostrar identidad disponible y estado, buscar/filtrar/ordenar y limitar el DOM
mediante mecanismos existentes. Discovery sólo inspecciona metadatos; antes de
abrir, usar nombres saneados o información de catálogo ya autorizado, marcada
como provisional. Coche/circuito verificados proceden del reader, no de adivinar
un nombre. Descubrir automáticamente no equivale a abrir automáticamente contenido.
Elegir una fuente en UI constituye la acción explícita de apertura.

### 4.3 Estados y transiciones

```text
borrador configurado -> fuentes seleccionadas -> revisión preparada
 -> entradas derivadas -> propuesta calculada -> plan aceptado
             cambio de entrada -> desactualizado -> recalcular
```

El estado guardado y el estado calculado son distintos. Calcular no acepta ni
publica. Una respuesta tardía de otra combinación/revisión no cambia la vista.
Tras editar una entrada, retirar presentación de resultado vigente antes de
recalcular; se puede mostrar el anterior etiquetado como desactualizado. Un
timeout nunca deja una tarjeta transitoria anunciada como plan completo.

## 5. Datos, revisiones y archivos

1. **Observación inmutable:** hash/tamaño + parser/schema/análisis/segmentación.
   La ruta es localización, el handle temporal es recurso y ninguno sustituye
   identidad o autorización. Mantener unidades y cero/ausencia/false distintos.
2. **Corrección Analysis:** conjunto versionado con padre, commandId, motivo,
   precondición y snapshot. Guardado atómico, backup validado, conflicto explícito
   y recuperación de resultado incierto; no reintento ciego ni last-write-wins.
3. **Selección Strategy:** fuentes incluidas y referencias completas
   sessionId/baseDigest/revisionId/snapshotId. Todas las incluidas fijan revisión
   si se usa el modo registrado fijado. Nunca sustituir por «última».
4. **Plan:** snapshot de selección, reglas, pilotos/estimaciones, restricciones,
   entradas derivadas/versiones, resultado y estado de aceptación. Reusar el
   documento/repositorio existentes. Registrar versión del solver y criterio
   objetivo para repetir el mismo modelo; guardar no promete archivo disponible.
5. **Copia opcional:** destino elegido, espacio/permisos y colisiones resueltos
   sin sobrescritura silenciosa; verificar integridad antes de ofrecerla como
   fuente utilizable, detectar cambio del original durante copia y limpiar sólo
   temporales propios. No copiar WAL activo como carrera cerrada válida.

Abrir fuera de rutas autorizadas requiere selección de archivo/carpeta por el
usuario del producto. No escanear todo el PC. Fuente ausente permite consultar
plan guardado, pero bloquea la derivación que la necesita hasta localizar original
idéntico o copia verificada. Cambio de contenido o parser incompatible no se
resuelve aplicando correcciones antiguas a ciegas. Mostrar qué referencia falta.

Límites existentes: discovery máximo 1024, cuatro sesiones simultáneamente
abiertas, presupuesto por fuente/página/revisión cerrado. No truncar ni ampliar
estos límites sin evidencia. La UI explica las cuatro sesiones; soportar conjuntos
mayores mediante otro lifecycle no es una arquitectura implícitamente autorizada.

### 5.1 Operaciones permitidas

Conservar [contrato de correcciones](../corrections-contract-v1.md) y ADR 0010:

- `set_sample_value`: escalar existente, tipo/unidad/precondición, motivo; no
  crea señal, cambia reloj ni promociona calidad.
- `set_family_use`: inclusión/exclusión de objetivos resueltos por familia
  vigente; excluir ritmo no elimina Fuel/VE sanos.
- `set_classification`: sólo campos permitidos tipados; no altera hash, permisos
  o parser. Cambio canónico de coche/circuito invalida combinación dependiente.
- `set_stint_boundary`: límite sobre eje temporal demostrado, sin ambigüedad,
  huecos/solapes ilegales ni alineación supuesta. Recalcula dependientes.
- Restaurar/deshacer crea otra revisión conservando historia. Cambiar selección
  del plan no equivale a corregir toda la sesión.

Objetivos: sesión, stint, vuelta, tramo o muestra conforme a capacidad real de
cada operación. Un número de vuelta por sí solo no identifica una observación.
Se rechazan objetivos irresolubles; no interpolación automática, fórmulas masivas
ni editor SQL. La validación dura no se anula con «incluir de todos modos».

## 6. Calidad y modelo empírico

La elegibilidad es por familia y condición. Clasificar como utilizable, no
utilizable o desconocido con razón y muestra. Invalidación deportiva puede
coexistir con consumo o ritmo representativo; no convertir cualquier vuelta
invalidada en sana ni toda vuelta lenta en incidente.

Matriz a resolver en preparación: formación, entrada/salida/tránsito/servicio
de boxes, banderas, impacto/daño, trompo sin impacto, tráfico, corte, salto de
reloj, lectura errónea, temperatura de pista, humedad/estado de pista, compuesto,
edad/desgaste, Fuel y VE. Para cada una documentar señal, unidad/reloj, detección
o anotación posible, incertidumbre y familias afectadas. Señal inexistente deja
el caso desconocido; no fabricar detectores por nombre de canal.

Combinar sesiones compatibles antes de agregar; no promediar estadísticas
agregadas perdiendo ponderación/selección. No extrapolar automáticamente entre
coches, clima, compuesto o temperaturas no cubiertas. No separar causalmente
Fuel y neumático si el corpus no lo permite. Explicar muestra y límites en UI.

Protocolo obligatorio: [evaluación #1030](../evidence/isa-1030/evaluation-protocol.md).
Inventario inicial 367 y discovery posterior 416 son momentos distintos, no
cuotas de evaluación. Las cuatro candidatas reservadas antiguas de pocas vueltas
no acreditan carreras completas suficientes. Imola/Monza usados en desarrollo
pertenecen a preparación; no reutilizarlos como prueba independiente.

Preparar anotaciones independientes del filtro, medir contaminación/descarte útil,
cobertura y error por familia/condición. Agrupar incertidumbre por carrera, no
tratar vueltas correlacionadas como muestras independientes. Antes de abrir
resultados reservados congelar modelo, selección, métricas, umbrales y N mínimo.
La tolerancia de producto requiere una decisión empírica respaldada: entregar a
Isaac una propuesta conjunta con evidencia, no preguntar umbral por umbral.
Mientras se resuelve, seguir UI, integridad y pruebas matemáticas independientes.

## 7. Motor y resultados

SolverV2 en Go es la autoridad. Objetivo: menor tiempo total previsto dentro del
modelo/reglas y horizonte declarados. Distinguir óptimo demostrado, factible sin
optimalidad demostrada, parcial, inviable, cancelado y error/presupuesto agotado.
Empates usan orden determinista documentado. Evaluar la decisión final después
de aplicar cambios; no conservar una etiqueta óptima de una solución anterior.

Entradas a transportar y verificar: duración/vueltas y final de carrera,
ritmos/curvas y procedencia, degradación respaldada, Fuel inicial/capacidad/consumo/
reserva, VE inicial/capacidad/aplicabilidad/consumo/reserva, inventario/compuestos/
edad y reglas de cambio, pilotos/disponibilidad/conducción, ventanas y servicios.
Ausencia de VE aplicable no equivale a VE gratis; no aplicable es otro estado.
Conservar decisiones previas documentadas de reservas, no sustituirlas por otras
constantes silenciosas. Verificar casos de última vuelta, reserva y pit final.

La estimación entre pilotos afecta sólo al ritmo autorizado y queda versionada.
No rellena desgaste, consumo ni perfil completo. Clima del evento/configuración
usa modelos respaldados; forecast nuevo/live no es dependencia del editor.

La propuesta inicial se obtiene antes de imponer preferencias. Fijar piloto,
parada o duración de stint, o arrastrar un límite, crea restricciones explícitas
y marca el resultado desactualizado. Recálculo conserva restricciones y muestra
coste frente a propuesta comparable con mismas fuentes/reglas. Inviabilidad
se explica; nunca se altera una regla/recurso para ocultarla.

#1089 corrigió localmente el coste repetido de paradas sin cambiar alternativas.
Conservar esa regresión y revalidar presupuesto/cancelación con el modelo final
y runtime aplicable en T22. Si reaparece un timeout, reproducir y perfilar antes
de aumentar presupuesto; no presentar una heurística como óptimo ni iniciar un
motor alternativo. El tiempo del banco de reader J9 no es tiempo del solver.

## 8. Arquitectura y código reutilizable

```text
LMU DuckDB (original/copia autorizada)
  -> reader y modelo normalizado Analysis
  -> base + correcciones + clasificación/derivaciones
  -> proyección versionada de revisiones exactas
  -> documento/entradas Strategy -> SolverV2 -> propuesta/plan aceptado
                     ^ UI React / cliente Wails ^
```

| Responsabilidad | Ubicación actual |
|---|---|
| Reader, modelo, clasificación, correcciones, proyección | `internal/telemetryanalysis/`, `internal/telemetryanalysis/strategyprojection/` |
| Autorización/lifecycle/bridge y catálogo de revisiones | `internal/app/telemetry_analysis_service.go`, `internal/app/strategy_revision_catalog.go` |
| Composición y límites nativos | `cmd/vantare/main.go` |
| Dominio, persistencia, comandos, optimización | `internal/strategy/{document,repository,application,solver}/` |
| UI y coordinación | `frontend/src/hub/strategy-orbit/`, `frontend/src/strategy/analysis-client.ts` |
| Calendario/selección/cálculo existente | `strategy-calendar-selection.ts`, `strategy-session-selection.ts`, `strategy-events-store.ts`, `strategy-orbit-bridge.ts` dentro de Strategy Orbit |
| Contratos, evidencia y visual de referencia | `docs/strategy-planner/`, este SDD y prototipo #1063 |

React no abre SQL ni calcula consumo, calidad o estrategia. El servicio no recibe
rutas arbitrarias del cliente como identidad de revisión. Persistencia de
Analysis permanece separada del plan. No nuevo motor, plugin framework, renderer
duplicado, store global paralelo o dependencia. Retirada de manual legacy sólo
para consumidores sustituidos y caracterizados, sin limpieza general.

Estilo: Go simple con contexto en I/O, errores tipados/envueltos y gofmt;
TypeScript estricto, componentes acotados, una autoridad por estado. Ejemplo
existente en `corrections.go`: `SourceAnalysisRef.Digest()` valida identidad antes
de producir `correctionDigest("analysis.correction-base.v1", base)`. Mantener
ese patrón de validación de frontera; no generar hashes equivalentes en React.
Usar Go/React/TypeScript/Wails/Playwright/Vitest y versiones fijadas en manifests
y lockfile del checkout; este SDD no prescribe una actualización.

## 9. Errores y recuperación obligatorios

| Caso | Comportamiento exigido |
|---|---|
| Sin archivos/compatibles o muestra insuficiente | Configuración conservada; acciones para elegir fuente y detalle de lo calculable. |
| Permiso/licencia denegados | Causa y vía existente de recuperación; no bypass ni catálogo vacío falso. |
| Runtime ausente/incompatible | Diagnóstico claro y procedimiento existente; no descarga/copia silenciosa. |
| Fuente activa/WAL/inestable/cambiada | No abrir como estable; revalidar y ofrecer reintento explícito. |
| Corrupción | Backup verificado/cuarentena; distinguir recuperación de pérdida, sin autorizar datos por reconstrucción. |
| Revisión ausente/conflicto/cuota | Mantener borrador; informar ID/causa saneada y recuperar sin sustituir ni borrar historia. |
| Cancelación/timeout/respuesta tardía | Backend termina; recursos liberados; no éxito tardío ni guardado asumido. |
| Cierre fallido | Mantener recurso registrado para recuperar; no perder handle ni ocultar fallo. |
| Inviabilidad | Restricciones y datos permanecen; causa accionable, sin plan ejecutable falso. |
| Calendario no disponible | Carrera personalizada permitida; no evento fabricado. |

## 10. Requisitos transversales y exclusiones

Windows 10/11 y funcionamiento local-first conforme al contrato de producto.
ES/EN/PT/IT en todas las pantallas y errores nuevos; texto de producto sencillo,
sin JSON de RuntimeError ni identificadores internos como mensaje principal.
Detalles técnicos saneados pueden quedar en una vista de diagnóstico.
Teclado/foco y escalado de escritorio no son extras opcionales del acabado.

No subir DuckDB, estrategias, nombres, rutas ni capturas con datos personales
como efecto de este flujo. Se conservan los consentimientos/versiones y permisos
existentes; el SDD no activa telemetría de producto, sincronización, recording o
servicios externos. Recursos de imagen existentes se reutilizan; no adquirir
dependencias/licencias nuevas por una decisión de implementación visual.

### Fuera de la primera entrega

Nuevos simuladores/formatos concretos; adquisición live y nuevas llamadas de
forecast; escenarios generales hipotéticos; editor SQL/fórmulas/interpolación;
publicación comunitaria/tienda; Engineer/Spotter/widgets live nuevos; reescritura
de arquitectura; promoción/release automáticas. Preservar módulos existentes.

Después de la aceptación del registrado (A01–A19/A21 y T23): investigación OSS extensa (algoritmos, licencias, costes,
supuestos, replay, calibración, incertidumbre y Monte Carlo), informe comparativo
y propuesta de arquitectura propia. Su resultado decide el diseño live; no se
promete copiar código ni una licencia compatible antes de revisarla.

## 11. Fuentes de verdad y resolución de contradicciones

- Decisiones explícitas recientes de Isaac en este chat y AGENTS.md.
- [Spec #1028](../../superpowers/specs/2026-09-08-strategy-recorded-editor-design.md).
- [ADR 0010](../../adr/0010-analysis-observation-corrections.md) y contrato de correcciones.
- [Proyección V2](../f1-2-contrato-proyeccion-v2.md), [documento V2](../f1-3-contrato-documento-v2.md), [solver](../f1-3-contrato-solver.md).
- [Roadmap](../../roadmap/plan.md), handoffs y evidencias #1030, #1038, #1063, #1088, #1090.
- GitHub #694, #1028, #1030, #1033, #1063, #1089, #1090, #1091 y cortes vinculados.

Este paquete cierra secuencia y aceptación, no inventa aprobaciones sobre
umbrales ni sustituye contratos técnicos por resúmenes. Ante conflicto real,
aplicar decisión reciente/evidencia verificable, actualizar el documento
histórico con enlace de precedencia y detener sólo la tarea que no pueda
resolverse. No interpretar una nota antigua «siguiente: cliente» como trabajo
nuevo si el cliente ya está probado. La revisión visual final de Isaac y la
promoción siguen siendo gates distintos.
