# ISA-1033 — microplan posterior del contrato de correcciones

Estado: propuesta, no autorización de implementación. Base documental `8a2d8ff4`;
rama `vantareapp/isa-1033-observation-corrections`. Sin subagentes.
[ADR](../../adr/0010-analysis-observation-corrections.md) y
[contrato](../../strategy-planner/corrections-contract-v1.md).

## Gate y secuencia

#1033 entrega únicamente documentos. Antes de código: revisar ADR/contrato,
abrir una issue ejecutable por corte, fijar base/worktree y criterios verificables.
F0 debe definir semántica de fuentes y límites explícitos; filtros nuevos exigen
anotación/calibración de #1030. F1 debe poder resolver originales/copia autorizada
por contenido. Ningún corte implica publicar el editor o promover a Nightly.

La propuesta separa mecánica de correcciones de umbrales empíricos. No hace falta
inventar umbrales para probar conflicto/deshacer; sí hace falta aprobarlos antes
de que una nueva clasificación automática decida qué vuelta representa ritmo.

## Cortes de lógica y tests

Los paths siguientes son relativos a `internal/telemetryanalysis/`, salvo prefijo
explícito. Cada corte tiene hasta cinco archivos de lógica/test previstos; su
issue deberá confirmar consumidores reales y dividirse antes de ampliarlos.
No se implementan todos en un PR ni se añaden capas para encajar ese límite.

| Corte | Archivos previstos | Resultado y regresión observable |
|---|---|---|
| C1 — tipos y validación | `corrections.go`, `corrections_test.go` | Base/versiones, snapshots, objetivos, precondiciones y conflictos; hash determinista, cero/false/ausencia distintos, NaN/tipo/unidad inválidos rechazados. |
| C2 — custodia | `corrections_store.go`, `corrections_store_test.go`, `corrections_lease_windows.go`, `corrections_lease_other.go` | JSON privado, lease nativo, expectedRevision, idempotencia y deshacer. Dos escritores: uno gana y otro ve conflicto; fallo antes/después de reemplazo nunca anuncia un commit falso. |
| C3 — vista efectiva | `corrections_view.go`, `corrections_view_test.go` | Aplicar operaciones cerradas a una vista de modelo/páginas; original idéntico después, selector ambiguo/solapado rechazado y motivo/procedencia conservados. Reutilizar clasificación, segmentos y escalares vigentes. |
| C4 — familias derivadas | `consumptionpace.go`, `consumptionpace_test.go`, `derivedcurves.go`, `derivedcurves_test.go`, `corrections_view.go` | Eliminar vuelta de ritmo no elimina Fuel/VE válidos; recalcular dependientes y mostrar familias sin datos. No introducir thresholds distintos de los aprobados. |
| C5 — proyección de revisión | `strategyprojection/projection.go`, `strategyprojection/projection_test.go`, `projectionproducer.go`, `projectionproducer_test.go` | Vínculo fuente/análisis/corrección estructurado; cambios invalidan derivados, missing no se vuelve cero ni observed. Fijar versión de contrato y consumidores antes de editar. |
| C6 — comandos de Analysis desde Strategy | `internal/strategy/application/` y cliente TS, máximo cinco paths a cerrar en la issue | Guardar/consultar/deshacer por el owner Analysis; Strategy fija revisión, una respuesta tardía no sustituye una revisión más reciente. Sin SQL en React/Wails/Strategy. Dividir tipos/bridge y UI si supera el límite. |
| C7 — plan reproducible | documento/repositorio Strategy y tests, máximo cinco paths a cerrar | Guardar revisión exacta y selección; cambiar corrección solo marca borrador desactualizado; plan aceptado no cambia. Fuente o revisión perdida produce causa explícita. |

C6/C7 requieren inventario fresco para fijar nombres exactos: son dependencias
posteriores, no tareas ejecutables por esta tabla. El contrato nuevo no se anuncia
conectado al producto por existir C1/C2. El prototipo UI se revisa antes de implementar
su corte, usando estas capacidades y estados sin datos de telemetría inventados.

## Custodia mínima de C2

Carpeta `<raiz-privada-de-fuentes>/corrections/`, fuera del directorio original del
simulador. Cada JSON se nombra mediante digest de base emitido por Go; ningún path
viene libre del cliente. Archivo principal con cabeza+revisiones, backup validado,
cuarentena y lease de escritura. El backup no concede existencia a una revisión
que perdió: los consumidores validan el ID exacto solicitado.

Reusar el mecanismo nativo de exclusión de `internal/strategy/repository/lease_*`
y la escritura atómica/recuperación del store autorizado como patrones. Analysis
no depende del paquete de negocio Strategy. No se introduce un framework de
persistencia ni se copia un repositorio genérico completo para cuatro operaciones.

Fijar límites positivos de bytes/revisiones/correcciones y tamaño de motivo en la
issue C2, con prueba de rechazo sin truncado. Son presupuestos de recursos, no
umbrales físicos del modelo. No borrar ni compactar revisiones referenciadas para
resolver automáticamente una cuota; ofrecer una acción explícita de usuario.

## Verificación exigida por corte

1. Reproducción RED antes de corregir comportamiento; C1 nuevo usa casos del contrato.
2. `gofmt` y tests focales, incluidos cancelación e integridad del original.
3. Build frontend antes de `go test ./...` cuando hagan falta los assets embebidos;
   Go completo tras cualquier Go/contrato compartido.
4. Si toca frontend: suite, build, typecheck real y lint. Muestras del prototipo
   no sustituyen pruebas reales de UI ni calidad del modelo.
5. Revisión personal de diff, error paths, permisos, original intacto y coste.
6. Handoff/issue/roadmap/digest; declarar por separado implementación, CI, Wails
   y aceptación. Sin promoción automática.

Aceptación end-to-end posterior: autorizar fuente, abrir sesión, corregir ámbito,
recalcular familias/estrategia, deshacer, guardar revisión, reiniciar y reproducir;
añadir archivo cambiado, copia opcional, corrupción, writer concurrente y ausencia
real de datos. Las carreras de evaluación permanecen reservadas hasta fijar el
protocolo y no se usan para elegir thresholds.

## Cierre de este documento

No se ha creado un store, comando, schema persistido, pantalla o test de producto.
Validación de #1033: revisión contractual y de enlaces, coherencia con owners,
ejemplos de exclusión/deshacer/cambio de fuente, diff check y digest de roadmap.
Las suites de código del stack se registran en el cierre #1038; no se repiten por
estos Markdown. Quedan revisión del ADR, gates empíricos y las issues de ejecución.

Archivos de esta entrega documental: ADR 0010, corrections-contract-v1.md y este
microplan creados; maestro del editor, handoffs Strategy/Analysis y plan.md
actualizados; roadmap.json regenerado. No hay archivos movidos o borrados.
