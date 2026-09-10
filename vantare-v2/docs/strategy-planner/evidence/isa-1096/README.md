# ISA-1096 — edición escalar e historial del editor registrado

Base bd9ed2c2ffa148ce4398265e2f83af80303739af (#1095), rama
vantareapp/isa-1096-recorded-corrections, worktree C:/tmp/vantare-isa1096.
SDD T10; contrato de correcciones/ADR0010. Sin nuevos umbrales o arquitectura.

## T10a — operaciones de revisión exacta y snapshot

Dos paths de lógica/test. Carga revisión explícita verificando base/snapshot;
escalar desde muestra/canal originales con motivo y sin promoción de calidad.
Sustituir un objetivo preserva las otras correcciones. Comando clonado completo
para conservar payload/ID ante resultado incierto. Cabeza histórica distinta
rechaza escritura; restaurar usa snapshot anterior con cabeza explícita actual.
Proyección separada del guardado duradero y adopción explícita posterior.
Siete tests focales y tipos PASS. Lint detectó un import de tipo no utilizado,
retirado antes del gate final. Logs C:/tmp/isa1096-t10a-*.log.
No nueva UI montada aún. Sigue controlador y vistas Datos/Revisiones.

Gate heredado #1095 T08j: 438 archivos/3433 tests, lint/build PASS.
Avisos heredados happy-dom teardown y chunks Vite. Sin Wails, banco real nuevo,
review visual >9, push, PR, CI remota, promoción o release.

## T10b — controlador de edición y guardado

useRecordedCorrections mantiene la vista entre pestañas, páginas de 50 muestras,
originales separados de propuesta, revisión exacta e historial por padres bajo
petición. Guardar congela comando/payload; cancelar no promete rollback. Un fallo
de proyección conserva la revisión duradera y reintenta sólo la proyección.
Adopción explícita, restauración con cabeza verificada, ninguna propiedad de
handles. 13 focales (helpers+hook), tipos/lint PASS. Todavía no montado.
Sigue resolver explícitamente comandos inciertos/conflictos: el reintento estable
ya existe, pero no basta cuando la cabeza avanzó sin guardar ese comando. Añadir
consulta autorizada por commandId/payload sobre el mismo store; después UI.

## T10c — resolver confirmaciones inciertas en Analysis

ResolveCorrectionCommand revalida sesión/base y consulta el mismo store con
commandId y digest del payload completo. Devuelve revisión encontrada y cabeza
actual, o ausencia explícita; nunca guarda una corrección. Comparte lease con
Save y rechaza una respuesta de ausencia mientras el escritor retiene el lease.
Reutiliza validación acotada de comandos; no cambia hashes, cuotas o reglas.
Pruebas: comando antiguo con cabeza posterior, ausencia, payload alterado,
writer activo, cancelación, permisos/base/handle y backup con confirmación
perdida. Go focal final, build, Go global -p1 y vet general PASS.
Cuatro paths Go. Cliente/resolución visible aún pendientes.

## T10d — contrato y cliente de resolución

El cliente usa ResolveCorrectionCommand con la solicitud completa validada,
sin ejecutar SaveCorrections. found=false no admite revisión; found=true exige
revisión duradera con comando, base y campos del comando coincidentes. Conserva
cancelación y no reintenta automáticamente. 43 focales, tipos/lint PASS.
Cuatro paths. Sigue conectarlo al controlador y la UI. No es recuperación del
borrador pendiente tras reiniciar: ese vínculo persistente sigue en T14.

## T10e — resolución en el controlador

Resolver confirma revisión existente y proyecta sin replay, o confirma ausencia
conservando propuesta/cabeza actual y conflicto explícito. Nunca adopta cabeza
implícitamente. Cierre del estado de edición rechaza cambios/comandos pendientes;
handles siguen perteneciendo al owner. 16 focales, tipos/lint PASS. Adopción
propaga señal para que el owner compruebe cancelación antes de cambiar el plan.
Sigue integración de propietario y vistas; estado incierto entre reinicios aún
pendiente de persistir en documento Strategy existente (T14).

## T10f — owner de sesiones y revisión del evento

Un solo AnalysisClient conecta propietario de handles y controlador persistente
de correcciones. Locks comprobados al actuar evitan cerrar durante lectura en
el mismo ciclo. Cambios pendientes bloquean cierre/cambio de fuente y guardado
configuración; el guard de salida ve esos cambios. Adopción modifica sólo una
fuente ya incluida con la misma base/combinación; marca borrador sin guardarlo.
27 focales, tipos/lint PASS. Cinco paths. Sigue montaje de Datos y pestañas A4.

## T10g — vista Datos y pestañas productivas

Datos monta el controlador, con lectura explícita de fuente/canal y 50 muestras
por página, original/corrección/calidad, motivo y guardado/adopción separados.
Formulario sin aplicar persiste entre pestañas y participa en el guard de salida.
Biblioteca deshabilita cambios de fuentes mientras hay correcciones pendientes.
16 focales, tipos/lint focal y lint/build general PASS. Global frontend: 441 archivos/3463 tests PASS (322.01s).
Capturas data-pass-01 documentan fixture vacío y límites, no Wails/nota >9.
Roadmap cuatro idiomas/digest actualizado. Cinco paths lógica/test/CSS, más
copy, asset aprobado y documentación. Plan/Revisiones todavía sin operaciones
completas. Guardado incierto tras reinicio sigue pendiente de custodia en T14.

Review encontró un hueco antes del siguiente montaje: Inspect ofrece canales
que ReadCorrectionInput no prepara. No ampliar lecturas ni mantener lista de
nombres en React: siguiente corte expondrá capacidades de edición desde las
páginas realmente preparadas por Analysis. Hasta entonces no certificar todas
las señales como editables. Después continúa historial visible y familias.

## T10h — capacidad de edición nativa

PrepareCorrections publica editableChannelIds, explícitamente vacío si no hay
señales preparadas con unidad válida. Se obtiene de páginas ya leídas, conserva
orden nativo y elimina duplicados; no amplía I/O ni infiere capacidad en React.
Contrato TS opcional por compatibilidad: ausencia no concede edición.
RED wire Go y validación TS reproducidos; GREEN 2 focales Go, 42 TS, tipos,
lint focal/build, global Go -p1 y vet del alcance PASS. Vet ampliado a todos
los subpaquetes de app falla en launcher/icon_windows.go:553 (unsafe.Pointer),
deuda heredada ya seguida en #950; archivo intacto. Logs C:/tmp/isa1096-t10h-*.
Review propia: autorización y lectura siguen en withCorrectionInput; la lista
no sustituye la validación de cada guardado. Siguiente transportar capacidad
a RecordedSession y bloquear edición sin permiso explícito, luego historial.
Sin Wails, banco DuckDB, nota visual, push/PR/CI remota o promoción nuevos.

## T10i — capacidad conservada por el propietario

RecordedSession conserva una copia de editableChannelIds. Respuestas antiguas
producen conjunto vacío; recordedSampleCorrection rechaza señales sin capacidad
explícita antes de construir el comando. RED/GREEN, 30 focales/tipos/lint PASS.
Cinco paths declarados. Siguiente T10j: aplicar el mismo límite en Datos y su
fixture UI; después historial. Build/global se agrupan tras ese montaje sin
atribuir aún aceptación general a este corte. No cambios nativos ni promoción.
