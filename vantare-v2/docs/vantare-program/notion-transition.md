# Notion primero: seguimiento y compatibilidad técnica

Seguimiento operativo: **NOTION PRIMERO — obligatorio desde 2026-09-14**.
Corte técnico exclusivo (retirar la dependencia de issues/ISA en CI): **PENDIENTE**.
Decisión actual de Isaac: Notion debe ser la primera lectura y la actualización
obligatoria de todos los agentes, también en trabajos existentes. Esta decisión
sustituye la instrucción de #1189 que posponía el uso principal hasta el corte.

## Autoridad y alcance

Notion es la autoridad de tareas, prioridades, alcance, dependencias y continuidad.
GitHub conserva código, contratos técnicos versionados, ramas, PR, CI y releases.
La fase técnica pendiente no permite seguir trabajando solo en GitHub. Linear
está retirado; sus IDs son procedencia histórica. No mantener dos backlogs.

El trabajo nuevo se registra primero en Notion y se ejecuta cuando tiene alcance
autorizado. No ampliar silenciosamente el lote de producto. El cierre de Strategy
Planner y Clerk conserva sus criterios, pruebas y autorizaciones de integración;
no exige completar todos los programas ni impide actualizar Notion desde ahora.
Las tablas fechadas de abajo son historia, no una lista de trabajo actual.

## Entrada real de Notion

- [Vantare · Engineering Dashboard](https://app.notion.com/p/3fce51695c65834e80b381ec2d632192).
- [Tareas](https://app.notion.com/p/7587f71012d64b05b6da2bc0d9aa0c10), data source
  `b1bca6c8-5590-40f3-ada7-6c0047830f42`; ID nativo prefijo `VAN`.
- [Proyectos](https://app.notion.com/p/c1bf0e1563a748369afdb6557686af9b), data source
  `fa906259-39aa-4a34-8963-6daa4feb7675`.
- [Versiones e hitos](https://app.notion.com/p/81ff04f9ff1041baa3a1380e4f00b93c), data source
  `31ec9e8b-9f0a-4ebe-9fd7-2bdc2df74688`.
- [Documentación y decisiones](https://app.notion.com/p/b9e21b2ff5634955a5b7325dfe7b7878), data source
  `5e6e84ec-6551-4ad5-badb-098aa34ac3f3`.

Las cuatro bases pertenecen al hub original. Leer el esquema real antes de
escribir y reutilizar las páginas existentes. El kanban tiene filtro rápido
**Proyecto**: elegir uno o varios; vacío muestra todos los proyectos. Las tarjetas
históricas se consultan en su vista propia. No crear otro hub ni otra base.

Captura importada del 2026-09-14: 720 issues y 1104 comentarios, 17 proyectos y
24 hitos. Se revisaron las asignaciones por proyecto (173 corregidas). Estos
recuentos son un snapshot, no una sincronización automática: reconciliar cambios
posteriores por URL/ID de origen. Hay cuerpos históricos truncados y estados por
reconciliar; no confundir importación con aceptación ni con integraciones probadas.

Tareas de continuación ya preparadas en esa base (no recrearlas):

- [Importar y verificar histórico y pendientes](https://app.notion.com/p/3d9e51695c6581188615dc4565314f14).
- [Adaptar y probar controles](https://app.notion.com/p/3d9e51695c6581dc9350f3a1c880136c).
- [Completar el corte técnico exclusivo](https://app.notion.com/p/3d9e51695c6581bcb80bf34c84d810e9), bloqueada por las anteriores y el lote.

## Referencia histórica del lote aprobado (2026-09-12)

Snapshot de inspección: 2026-09-12, base nightly
`74726a4a7ab2832a4ad493176b11b1fb4d282d93`. Resolver
la referencia remota completa antes de cada trabajo. La lista fija alcance, no
congela el HEAD de los candidatos. Cada cierre registra su SHA real y evidencia.

| Entrega | Issue primaria / PR | Tratamiento |
|---|---|---|
| Efficiency, política común y runtime | #1098 / #1107 | Cerrar el candidato conjunto; reconciliar dependencias absorbidas por alcance y evidencia |
| Orbit: pantallas auxiliares Hub | #1179 / #1180 | Entrega separada del candidato Efficiency |
| Orbit: estados Studio/Perfiles | #1181 / #1182 | Integrada en nightly en `576a4663` durante la preparación; reconciliar registro de aceptación y remanentes |
| Orbit fuera del Hub | #1185 / #1186 | Integrada en nightly en `c3dba271` durante la preparación; reconciliar registro de aceptación y remanentes |
| Avisos del actualizador | #840 / #1184 | Corregir/verificar el fallo de CI del candidato antes de aceptar |
| Vueltas, fuel y paginación | #822 / #1188 | Corregir/verificar el fallo de CI antes de aceptar |
| Clerk: cuenta interna | #909 / #913 | Dependencia de login; conservar sus criterios de aceptación |
| Clerk: inventario de transición | #911 / #1173 | Cerrar inventario; las implementaciones derivadas no entran automáticamente |
| Clerk: login y sesión mínima | #915 / #1187 | Incluye sus validaciones pendientes; no exige terminar todo el programa Clerk |
| Strategy: clasificaciones T12 | #1104 / sin PR en snapshot | Hay avances locales reportados; verificar worktree/SHA y acotar cierre al alcance de esta issue |

Los números # de esta tabla son GitHub, no IDs de Linear. Para abrirlos usar
`https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/N` o `/pull/N`.

### Reconciliación sin doble integración

- #1107 declara que reúne #1083/#1103, #1097/#1105, #1106/#1127 y contenido de
  PR #1157/#1168/#1163/#1161/#1118/#1170/#1117/#1122/#1158/#1165. Esa declaración
  es inventario del candidato, no prueba de integración. Comparar cambios y
  evidencia con el SHA aceptado en nightly, marcar lo absorbido y trasladar a
  Notion cualquier remanente ajeno al cierre. #1132 figura como sustituida;
  verificarlo antes de cerrarla. No mergear ramas antiguas solo para vaciar PR.
- El conjunto de Calendario ya entró por #1062. Las PR fuente #1059/#1060 y sus
  dependencias requieren reconciliación documental, no repetir su integración.
  Mantener las limitaciones de validación física explícitas.
- PR ya integradas #1163/#1168/#1165/#1170/#1172/#1166/#1164/#1156/#1155/#1154/
  #1153/#1124 no son bloqueos nuevos del corte. Una issue aún abierta puede
  requerir cerrar su registro o separar el remanente, no reimplementar.
- #1183 (widgets/Workshop) tiene alcance y rama base pero no evidencia remota de
  ejecución en el snapshot. Antes de clasificarla, consultar su handoff y rama;
  si se demuestra ejecución anterior a esta decisión, registrar esa evidencia
  como corrección del inventario. Si no, pasa pendiente a Notion. No inventar
  aceptación ni descartar trabajo local. Mismo criterio para cualquier trabajo
  local no publicado que se descubra durante la reconciliación inicial.
- #1174/#1175/#1176/#1177 y restantes ampliaciones no iniciadas pasan a Notion.
  No esperar a terminar todos los programas ni las 55 PR abiertas del snapshot.

Para cerrar cada fila: URL de PR, SHA aceptado, comprobación de pertenencia a
nightly remoto, aceptación aplicable, checks y limitaciones, dependencias
absorbidas con evidencia y pendientes trasladados. No basta `closed`, `merged`
en una PR fuente, una etiqueta `state:*` ni un comentario de un worker.

## Qué hace cada agente, desde ahora

1. Obtener `origin/nightly` actualizado y leer sus AGENTS aunque el chat se haya
   iniciado en master o un checkout antiguo. Crear worktree aislado; preservar
   cambios ajenos. Nightly no actualiza los contextos ya cargados ni master.
2. Abrir el hub, localizar la tarea por UUID/ID Notion o URL GitHub de origen y
   leer su proyecto, dependencias, objetivo, alcance y aceptación. Para nuevas
   peticiones, crear primero la tarea Notion; no duplicar una importada.
3. Leer contratos y handoff técnico en Git. Actualizar Notion al empezar:
   Estado `En curso`, Proyecto, Agente, Rama/base, siguiente paso y bloqueos.
4. Implementar dentro del alcance autorizado. Tras cada worker, decisión,
   bloqueo o cambio material, actualizar tarea y continuidad del proyecto.
   Registrar hallazgos fuera de alcance como pendientes separados en Notion.
5. Para cambios en el repo, conservar la issue GitHub existente si CI la consume.
   Si falta y los gates la requieren, crear un puente técnico mínimo después de
   Notion: enlace a la tarea y contrato de roadmap exacto. Usar el número GitHub
   en `vantareapp/isa-N-slug`; nunca el VAN. Prioridades y estado se editan en Notion.
   Mantener el contrato leído por CI coherente con las decisiones de Notion.
6. Antes de entregar, escribir `En revisión`, PR, checks con resultados/omisiones,
   SHA observado, riesgos y siguiente paso en Notion. Releer la página y comprobar
   que quedaron guardados. Sin escritura verificada, el seguimiento no está cerrado.
7. Después de una integración autorizada, verificar PR y pertenencia del SHA al
   canal remoto; actualizar Notion con aceptación, canal y evidencia real. No
   inferir publicación ni aceptación de producto de un cierre automático de GitHub.
8. Revisar [inventario documental y técnico](notion-document-audit.md) antes de
   afirmar que se puede retirar el puente GitHub. No desactivar validadores.

No se implementa sincronización automática con este contrato. Si Notion no está
accesible, conservar evidencia local, informar el fallo y pausar trabajo dependiente;
no usar GitHub como sustituto silencioso ni declarar una actualización inexistente.

## Migración: contenido, identidad y verificación

Importar todo el material de trabajo accesible, conservando procedencia:

- Issues abiertas/cerradas: cuerpo completo disponible, autor, fechas originales,
  motivo de cierre, labels, responsables, milestone, comentarios y enlaces.
- GitHub Project: campos, agrupaciones, prioridades e iteraciones que existan;
  subissues, dependencias y referencias históricas. No inferir relaciones del título.
- PR: enlaces, ramas, SHA, estado, revisión y checks; conservar las discusiones
  técnicas en GitHub con referencia desde Notion, sin fingir que son comentarios
  nativos de los autores en Notion. Registrar limitaciones de captura.
- Documentos operativos, decisiones, planes, evidencias y enlaces a contratos
  versionados; distinguir vigente/histórico y código activo/legado. No copiar
  secretos, datos privados de runtime ni archivos de entorno.

Usar ID estable de GitHub (repositorio + ID de issue) para importación idempotente,
además del número legible. Guardar UUID de página Notion, `VAN-N`, número GitHub y
`ISA-N` antiguo por separado. Ejemplo: GitHub #519 conserva ISA-233; no renumerar.
Las fechas de creación de Notion no sustituyen las fechas originales.

Snapshot inicial anterior a #1189: 717 issues (208 abiertas/509 cerradas), 369 con
`migrated:linear`, 350 cuerpos con aviso de truncamiento. Recontar al importar.
Conservar lo que existe y marcar `Origen incompleto`; buscar el resto en evidencia
versionada o exportaciones existentes. No reactivar Linear como dependencia ni
inventar texto. Ninguna tarea incompleta se declara ejecutable sin reconstruir
objetivo, alcance y aceptación. La incompletitud histórica reconocida no bloquea
por sí sola el corte si está inventariada y no afecta una tarea ejecutable.

Las cerradas son histórico. Las abiertas no ejecutadas se importan como pendientes
operativos, con su referencia histórica. No cerrarlas como completadas por migrar.
Hacer segunda pasada de relaciones tras crear todas las páginas. Verificar cada
registro contra origen (contenido, comentarios, metadatos y relaciones), recuentos
por estado, ausencia de duplicados y lista explícita de omisiones. Un muestreo
visual complementa esa comparación, no la sustituye. Reintentos hacen upsert.
Antes del corte, importar el delta y registrar momento/SHA de la captura final.

## Contrato operativo vigente

- La tarea Notion es la autoridad de alcance/dependencias/estado. GitHub Issues
  conserva el histórico y el puente técnico anterior; cualquier nuevo reporte externo
  se deriva a una tarea Notion con enlace, sin doble gestión.
- Notion no ejecuta código por alojar una tarea: el agente/entorno conectado lee
  la tarea y contratos, implementa en rama aislada, abre PR y devuelve evidencia.
  No se activan colas, despachos, auto-merge ni gastos por este documento.
- Cada tarea incluye objetivo, tipo, alcance/exclusiones, dependencias, documentos,
  criterios de aceptación, checks, verificación manual y decisión de roadmap con
  IDs exactos. Mantener la continuidad operativa en la página del proyecto Notion. Los
  handoffs Git conservan decisiones técnicas y evidencia fechada; no eligen
  trabajo ni sustituyen el estado vivo. Enlazar cada nuevo registro a su tarea.
- Código, ADR y contratos ligados a una versión continúan en Git con referencias
  desde Notion. Cada documento tiene un único lugar editable; no editar dos copias.
- Prioridad/alcance vienen de Notion; PR/CI/canal/release vienen de GitHub. El agente
  registra SHA y hora observados y no sobrescribe decisiones humanas con snapshots
  antiguos. Fallos de conexión dejan estado pendiente, nunca éxito supuesto.
- Estado de trabajo y canal son campos separados. Aceptada/integrada en nightly
  no significa probada en testers, promocionada a master ni publicada.
- El roadmap público se edita y publica visualmente en la app por Owner.
  Notion conserva las decisiones y el seguimiento interno; no publica por sí solo.
- Los nombres de rama y fragmentos para tareas `VAN-N` deben estar implementados
  y probados antes de usarlos. No reutilizar `isa-N` con números Notion ni declarar
  que un prefijo todavía rechazado por CI funciona. El corte técnico fijará la
  convención exacta y migrará plantillas/validadores juntos.

## Puertas pendientes del corte técnico exclusivo

Estas puertas retiran el puente GitHub/ISA; no condicionan el uso principal de
Notion. Documentar evidencia en la tarea de corte y el proyecto Migración a Notion:

- [ ] Lote aceptado e integrado; PR absorbidas y trabajo local reconciliados.
- [ ] Histórico y pendientes importados, relaciones restauradas y omisiones listadas.
- [ ] Acceso del agente a página/tareas/proyectos comprobado; esquemas y vistas listos.
- [ ] Gates de rama, autoridad de tarea, roadmap y metadatos de release adaptados,
      probados con casos positivos/negativos y sin degradar controles de promoción.
- [ ] Circuito real tarea Notion → PR → checks → evidencia en tarea verificado.
- [ ] Delta final importado; instrucciones y puntos de entrada coherentes.
- [ ] Fecha y SHA del corte registrados; corte técnico marcado COMPLETADO en PR a nightly,
      portada Notion actualizada y GitHub Issues identificado como archivo.

La decisión condicional del corte ya está aprobada por Isaac; no pedir de nuevo
la misma decisión de producto. Si aparece un permiso de conexión, autenticación,
configuración externa o acción reservada que aún no esté autorizado, solicitar
solo ese paso concreto. No añadir un bloqueo basado en el mero paso del tiempo.
No declarar el corte técnico completado por cerrar #1189 ni únicamente el lote.

## Recuperación

Un fallo de Notion pausa la ejecución dependiente y conserva evidencia local;
no reactiva GitHub ni Linear como seguimiento principal. Recuperar el acceso y
reconciliar las escrituras pendientes antes de cerrar la tarea. Una reversión de
autoridad requiere decisión trazada de Isaac, sin pérdida del histórico.
Testers/master y releases conservan sus autorizaciones y checks existentes.
