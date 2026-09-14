# ISA-1027 — Plan de corrección y optimización de Calendario

Versión 1 · 2026-09-08 · Aprobado por Isaac; ejecución iniciada en ISA-1029.
Expediente: https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1027
Auditoría y reproducciones: report.md, findings.json, offline.json en esta carpeta.

## Objetivo y alcance

Calendario debe presentar horarios fiables, conservar el último documento recibido,
avisar correctamente y responder con rapidez sin perder contenido, calidad visual
ni capacidades. Se incluyen sus cinco vistas, detalle, estado/carga, persistencia,
recordatorios, importación/publicación y entradas desde Inicio y Strategy.
La publicación real sigue siendo una acción explícita del Owner.

HUD, OBS, renderizadores y Overlay Studio quedan fuera de las modificaciones.
Sus consumidores del contrato de calendario se comprueban por compatibilidad.
LMU, Edge y otras tareas permanecen intactos; no se altera el equipo para aparentar
un ahorro. No se añaden dependencias ni se rediseña el editor o la aplicación.

Skills aplicadas: Ponytail full (reutilizar y corregir en el origen),
systematic-debugging (reproducción antes del arreglo), planning-and-task-breakdown
(cortes verificables) y performance-optimization (medir, atribuir, cambiar, medir).
No se ha usado vantare-core, desactualizada según AGENTS.md.

## Base y estado real

Nightly remota verificada durante esta revisión:
d6d0992f8dbc800ccb6d75f60fffdc7c3d561da2.
Inspección en vantareapp/isa-1024-calendar-month, HEAD
e26a511a273464d9617570dd8851d1c954fbed48; árbol versionado limpio.
Esa rama añade únicamente la conservación del cálculo mensual como cambio de producto.
Los motores y servicios auditados corresponden a la base indicada.

#1020 (relojes), #1022 (nombre Calendario) y #1024 (Mes) son candidatos separados.
No se presupone que sus PR estén integradas ni que su combinación esté validada.
Antes de implementar se releerán estados remotos, base y diff de cada candidato.
Las mediciones previas con cero eventos son evidencia de ese escenario, no de
Calendario cargado. El mínimo global de CPU/GPU/RAM no está demostrado.

## Diagnóstico consolidado

| ID | Hallazgo | Evidencia actual | Causa que debe corregirse |
|---|---|---|---|
| F1 | Salidas de horario caducado | Go 0 eventos; Inicio 4 y Calendario 22 salidas | Vigencia perdida al transportar datos y cálculo local sin ese límite |
| F2 | Seguir serie no produce avisos | FollowSeries 0; Follow(evento) 1 | Preferencia de series desconectada de DueReminders |
| F3 | Fallo remoto sustituye publicación | HTTP local 503 revierte al seed | Selección no conserva última publicación; arranque también aplica seed |
| F4 | Días incorrectos en cambio horario | Octubre duplica 25; marzo incluye 4 salidas del día siguiente | Sumar 24 h para representar un día civil |
| F5 | Salidas semanales omitidas | 12 horarios reales se convierten en 8 | Límite fijo en dayCount |
| F6 | Mes inflado | 4.596 ocurrencias clasificadas como especiales | Recurrencia y evento especial no se distinguen en la vista |
| F7 | Resultado de acciones ambiguo | Recorrido de eventos y errores revisado | Hook descarta errores y toast anterior al acuse |
| F8 | Detalle incompleto | Modelo elimina estimated y otros campos | Conversión reduce información sin explicarlo |

F1–F6 tienen reproducciones ejecutables; F7–F8 tienen evidencia estática.
Las fechas de prueba y el servidor HTTP son escenarios controlados, no evidencia
de un incidente actual de Supabase. La auditoría anterior ejecutó Go del módulo
y 133 tests frontend, todos PASS; la cobertura no detectaba estas inconsistencias.

Ampliación de revisión: race-schedule-store.ts:106 consume Calendar.events.
No se pueden suprimir globalmente para arreglar Mes. normaliseCalendar enumera
los campos del documento: cualquier metadato añadido en Go debe atravesarlo y
llegar a sus consumidores, o se volverá a perder en el store.
El briefing Orbit conserva el detalle lateral y el ancho gráfico del Timeline;
la guía semanal histórica pide modal y duración completa. Para este plan prevalece
la experiencia Orbit vigente: no se cambia layout ni ancho de bloques como un
supuesto arreglo de rendimiento. Sí se corrige la información estimada.

## Contrato propuesto para los arreglos

1. Los instantes oficiales son UTC; se presentan en la zona local. Vigencia y
   ventanas usan inicio incluido y fin excluido. El día visible termina en la
   siguiente medianoche local: puede durar 23 o 25 horas.
2. Un documento caducado puede consultarse como histórico, identificado como tal;
   no genera futuras salidas ni avisos fuera de su vigencia. Sin vigencia conocida,
   no se inventa una nueva: se recupera de fuente verificable o se muestra desconocida.
3. En fallo remoto se conserva el último documento conocido y se informa del fallo.
   Si ese documento ha caducado, sigue caducado: offline no renueva su vigencia.
   Seed solo inicializa cuando no existe un documento utilizable y también respeta
   su vigencia. Una publicación futura no debe borrar prematuramente el horario activo.
4. Go mantiene publicación/persistencia y avisos. El motor TS existente sigue
   resolviendo vistas locales, con límites y pruebas de paridad compartidos.
   No se introduce un tercer motor, servicio, compilador ni framework de estado.
5. Seguir una serie expresa una preferencia estable; seguir un evento continúa
   funcionando. Una misma ocurrencia y umbral genera un único aviso aunque ambos
   estén seguidos. Permisos y preferencias de notificaciones siguen vigentes.
6. Todas las vistas muestran el mismo conjunto de ocurrencias para la misma
   ventana y filtro. Un límite visual usa +N; nunca elimina salidas del modelo.
7. Cambios de datos y acciones muestran pendiente, resultado confirmado o error.
   Se reutilizan store y canales existentes; solo se amplía el contrato cuando
   no permita distinguir operaciones concurrentes.

## Secuencia de trabajo

Cada corte incluye su regresión antes del cambio, revisión del diff y evidencia.
Archivos indicados son orientativos; documentos y tests acompañan cada corte.
Si supera aproximadamente cinco archivos productivos, se divide antes de editar.

### P0 — completar prueba de recorrido y fijar referencias

**C0. Reproducciones permanentes y matriz de consumidores.** Convertir los probes
en regresiones del framework existente usando el seed real y su fecha controlada;
registrar las diferencias esperadas antes de corregir. Inventariar todos los
lectores del documento, incluyendo normalización, /api/calendar, Inicio, Strategy
y Race Schedule, sin editar HUD. Archivos: tests de internal/calendar y pruebas
de race-starts/races-orbit-model; dividir Go y frontend en entregas pequeñas.
Aceptación: cada F1–F6 tiene un test que falla por el defecto; no por falta de entorno.
Dependencias: ninguna. No integrar deliberadamente tests rojos solos en nightly.

**C1. Recorrido Wails de referencia.** Capturar las cinco vistas con el mismo
documento válido de procedencia registrada, perfil de prueba aislado y binario/SHA.
Revisar clic, filtro, selección, Mes→Día, navegación desde Inicio, zoom y scroll,
teclado/foco, cuatro idiomas, tamaños de ventana soportados y regreso tras minimizar.
Aceptación: matriz con PASS/FAIL/no ejecutado y capturas por estado, sin declarar
que la revisión está completa si faltan estas pruebas. Depende de disponibilidad
del runtime y datos; no bloquea crear las regresiones de C0.

### P1 — fiabilidad del documento (F1, F3, F7)

**C2. Conservar último horario y metadatos.** Cambios previstos:
calendar.go, calendar_service.go, schedule_publication.go y arranque en main.go.
Persistir la vigencia/procedencia necesaria en el documento existente, conservar
preferencias y eventos ajenos al horario. Preparar el nuevo estado antes de
confirmar persistencia; probar fallo de escritura sin corromper estado vigente.
Aceptación: actualización correcta, 503, documento inválido, publicación futura,
arranque offline y reapertura conservan el resultado esperado; sin degradación
silenciosa ni pérdida de seguimientos. Dependencia: C0. Revisar compatibilidad
de lectura de documentos antiguos y rollback antes de cambiar formato.

**C3. Vigencia hasta la última vista.** Archivos: calendar-types.ts,
calendar-store.ts, race-starts.ts, next-starts.ts y races-orbit-model.ts.
Propagar metadatos y reutilizar el motor para acotar resultados en el origen.
Aceptación: Inicio, detalle y cinco vistas no generan salidas fuera de vigencia;
fin exacto, lista vacía y documento antiguo tienen resultado explícito.
Dependencia: C2. Verificar normalización, previews agotadas y las identidades
de circuito/clase usadas por Strategy.

**C4. Estado de actualización visible.** Archivos: use-calendar-starts.ts,
calendar-store.ts, RacesOrbitPage.tsx y puente de refresh.
Reutilizar loaded/error y evitar el doble recorrido que publica datos anteriores
como si fueran el resultado nuevo. Mantener contenido al actualizar.
Aceptación: carga inicial, vacío, caducado, actualizando y error son distinguibles;
dos clics rápidos/respuestas fuera de orden no restauran un documento anterior.
Dependencias: C2–C3. Carga y vigencia son dimensiones distintas, no un único booleano.

**Checkpoint A:** documento estable al reiniciar/fallar red; todas las entradas
respetan vigencia; contratos de consumidores compatibles. No proseguir con una
retirada de datos que obligue a modificar widgets excluidos.

### P2 — recordatorios fiables (F2, parte de F7)

**C5. Resolver avisos desde series seguidas.** Archivos: calendar_service.go,
reminder_loop.go y tests correspondientes. Expandir solo la ventana necesaria
para los umbrales existentes con el motor Go; conservar seguimiento individual.
No materializar y persistir todos los IDs futuros como nueva preferencia.
Aceptación: cada umbral funciona, serie+evento no duplica, unfollow detiene futuros
avisos y horario caducado no avisa. Probar segundos a ambos lados del umbral,
renovación semanal, reinicio y suspensión/reanudación. Fijar en el test cuándo
se considera pasado un aviso; no emitir una ráfaga de avisos vencidos al reanudar.
Dependencias: C2–C3. Revisar límites de la deduplicación en memoria y su limpieza.

**C6. Confirmación y permisos.** Archivos: RacesOrbitPage.tsx, calendar-store.ts,
calendar_bridge.go y pruebas de integración. Toast tras confirmación; en error,
preferencia y feedback coherentes, sin dos acciones opuestas simultáneas.
Aceptación: seguir desde UI persiste, alimenta Inicio y produce aviso permitido;
Free bloqueado con motivo y preferencias de notificaciones respetadas.
Dependencia: C5. Aviso emitido/aceptado por Windows y aviso realmente visible
se registran por separado; no reimplementar el centro de notificaciones.

### P3 — vistas y detalle correctos (F4, F5, F6, F8)

**C7. Fechas locales y todos los slots.** Archivos: races-orbit-model.ts,
next-starts.ts si hace falta, y sus tests. Reutilizar dayAnchor/setDate para
fechas civiles; obtener ocurrencias por ventana, no mediante un 8 arbitrario.
Aceptación: 12/12 slots, cambio de mes/año, día bisiesto, UTC, Madrid y una zona
al oeste de UTC; cambios de hora sin fechas duplicadas ni salidas fuera del día.
En la hora local repetida deben poder distinguirse ambas ocurrencias por instante.
Dependencia: C3; puede preceder a C5 si se mantiene su corte independiente.

**C8. Mes compacto y consistente.** Archivos: races-orbit-model.ts,
RacesOrbitPage.tsx y tests. Separar ocurrencias generadas de eventos especiales
usando procedencia/identidad existente verificable; no usar heurísticas por título.
Contar slots semanales en el día local correcto, no solo comparar weekday UTC.
Aceptación: las 4.596 recurrencias no aparecen como especiales; un evento especial
real sigue visible; +N y Mes→Día concuerdan con filtro y fecha. Conservar events
para consumidores compartidos. Dependencias: C3 y C7.

**C9. Detalle y navegación coherentes.** Archivos: modelo y página de Calendario,
tests y locales ES/EN/PT/IT en un corte separado si excede tamaño.
Conservar marca estimada en sesiones y mostrar información requerida por el diseño
vigente sin sustituir el panel. Revisar selección al filtrar, cambiar publicación,
volver desde Inicio y elegir otra serie; no arrastrar pickedAt de otra serie.
Aceptación: hora y serie del detalle corresponden siempre a la selección; estimado
visible; enlaces solo cuando son reales; sin desbordamientos ni pérdida de foco.
Dependencias: C3 y C7. Campos adicionales de equipos/energía/notas: propuesta visual
con datos existentes antes de ampliación; no presentar ausencia como valor cero.

**Checkpoint B:** las cinco vistas concuerdan y el seguimiento funciona desde UI
hasta aviso. Resolver resultados de C1; mismas capturas/acciones después del cambio.

### P4 — velocidad y consumo medidos

**C10. Línea base representativa.** Medir versión anterior y versión funcionalmente
corregida por separado: arreglar el contenido cambia la carga y no es un A/B de una
optimización. Para cada experimento posterior, mismo documento, cantidad de eventos,
ventana, resolución, estado LMU, binario, configuración y secuencia de interacción.
Archivos: herramientas ya existentes y evidencia, sin instrumentación remota nueva.
Dependencias: checkpoint B; baseline original puede recogerse durante C1.

**C11. Un recorte atribuido por iteración.** Prioridad candidata, no arreglo decidido:
aislar contador de un segundo de las rejillas estables; recalcular solo vista visible;
separar suscripción al documento del hook que calcula salidas cada 15 s; agrupar
eventos por día una vez cuando el perfil lo justifique; evitar regenerar bloques de
Timeline sin cambios. Reutilizar helpers y estado existente. No añadir caché global,
virtualización, nuevo store ni alterar animaciones sin evidencia específica.
Archivos según atribución: RacesOrbitPage.tsx, modelo, use-calendar-starts.ts o
ScheduleImportSection.tsx; cada hipótesis en un corte separado.
Aceptación: mejora repetible sobre el ruido, pruebas/capturas iguales y contadores
visibles actualizados. Dependencia: C10. Comparar #1020/#1024 con esta solución
para reaprovechar cambios útiles y evitar duplicarlos; #1022 conserva el nombre.

## Protocolo de medida y criterios

| Escenario | Qué medir | Resultado exigido |
|---|---|---|
| Abrir Calendario desde Inicio, frío/caliente | clic→primer contenido útil, clic→interactivo | Registrar p50/p95 por separado; objetivo inicial propuesto p95 ≤200 ms en navegación caliente local |
| Cambiar vista, filtro, fecha y selección | clic→pintado correcto, tareas largas, renders | Mismo contenido; mejora sobre variación A/A, sin congelación perceptible |
| Timeline, scroll y zoom | tiempo de frame y frames fuera de presupuesto de pantalla | Sin perder calidad, líneas temporales o respuesta al gesto |
| Reposo en cada vista, minimizada y al regresar | CPU propia, RAM privada/working set, GPU por motor atribuible | Sin regresión repetible; despertar conserva hora y datos correctos |
| 30 ciclos entrar/salir + sesión prolongada | tendencia RAM, listeners, timers y handles | Sin crecimiento sostenido atribuible a Calendario tras estabilización |
| Actualizar/seguir/reiniciar | latencia local, red y disco separadas, tamaño payload | Sin bloqueo de UI ni falsas confirmaciones |

Los 200 ms son una propuesta de presupuesto local, no una cifra conseguida ni una
garantía para la red. No se fija un porcentaje mínimo universal de CPU/GPU/RAM.
La meta es reducir trabajo innecesario y demostrar el ahorro sin degradar función.

Primero 6 repeticiones A/A del escenario, calentamiento fijo y ventanas de igual
duración; guardar valores individuales y dispersión. Después al menos 6 pares A/B
con orden alternado, mismo estado y sin perfilador para la cifra final. Recoger
suficientes interacciones (al menos 30 por acción/version) para describir latencia;
si p95 es inestable, ampliar y no presentarlo como conclusión firme.
Perf traces/perfiles de CPU son para atribuir, separados del banco de consumo.
Definir umbral de mejora superior a la banda de ruido A/A antes de elegir el corte.
Si la diferencia queda dentro del ruido: inconcluso, no porcentaje de ahorro.

CPU: tiempo de CPU del árbol de procesos atribuible a Vantare por tiempo y núcleos,
con denominador registrado. RAM en MiB y proporción física si interesa. GPU por
PID/motor cuando sea posible: no sumar porcentajes de motores como total de tarjeta.
LMU no se resta del total del equipo para fingir una atribución: se mide Vantare y
se registra LMU como carga concurrente. GPU no atribuible se declara inconclusa.
No ejecutar builds/perfiladores de otra tarea durante un banco de aceptación;
si coinciden, invalidar esa repetición sin cerrar sus aplicaciones.

## Revisión pendiente, riesgos y límites

- Wails/Windows: faltan ejecución visual completa y evidencia del aviso visible.
- No se ha consultado la publicación actual de Supabase: no afirmar que esté vieja.
- Importación/publicación: repetir en entorno aislado validación, deduplicación,
  autorización Owner y conservación de borradores; no publicar para probar.
- Investigar en C0/C5 redondeo de umbrales, dedupe tras reinicio y retención de su
  mapa. Son riesgos detectados por lectura, no nuevos fallos reproducidos en este plan.
- Compatibilidad: cambios aditivos del documento deben sobrevivir normalización,
  disco, Wails y HTTP; no borrar eventos de usuario ni preferencias antiguas.
- La memoria histórica decía que no se materializaban miles de eventos. El código
  actual y las reproducciones contradicen esa descripción; manda la evidencia actual.
- Los timeouts ajenos de Standings/Pedals (#1025) no se corrigen aquí ni se ocultan.
  Una suite con esos fallos sigue sin ser verde aunque los checks focales pasen.

## Gates y entrega por corte

Go: gofmt y go test ./... tras construir frontend si el embed lo requiere.
Frontend: pnpm --dir frontend test, typecheck, lint y build. Regresión focal RED→GREEN
antes del gate completo. No repetir indefinidamente suites ni debilitar pruebas.
Contratos compartidos: lectores existentes, tipos y pruebas de compatibilidad.
Visual: capturas de estados equivalentes y revisión de interacción real Wails.
Rendimiento: CSV crudo, SHA/binario, datos, condiciones, script y límites de atribución.

Cada corte tiene issue/ramificación propia antes de editar, desde nightly verificada;
no se desarrolla en el checkout principal ni se trabaja sobre ramas ajenas.
El único handoff sigue siendo docs/vantare-program/handoffs/platform-commercial.md.
Al formalizar los cortes en PR, incorporar allí estado y enlaces y actualizar
docs/roadmap/plan.md con tokens exactos de los hitos afectados; regenerar roadmap.json
con el procedimiento existente, nunca editarlo a mano. #1027 es expediente de revisión;
su label roadmap:not-required no autoriza cambios productivos. Reclasificar o abrir
issues hijas roadmap:required antes de los arreglos.

Revisión independiente de cada candidato antes de integración; no se ha delegado
en esta planificación. Rollback mediante revert del corte, conservando formatos y
datos; probar lectura del documento previo antes de cerrar un cambio de persistencia.
Actualizar issue y handoff al cambiar evidencia/estado. Una PR draft y CI local no
equivalen a integración. Isaac autoriza la promoción a nightly; sin release implícita.

## Ejecución autorizada

Isaac aprobó la ejecución después de revisar esta versión. C0/C2 han comenzado
en #1029, con regresiones de conservación y persistencia antes del arreglo.
C1 (recorrido Wails), restantes regresiones y cortes posteriores siguen pendientes.
El estado operativo se mantiene en el handoff único y en las issues; la aprobación
del plan no equivale a promoción a nightly ni publicación.
