# ISA-1084 — revisión de Analysis fijada en el documento

Base c1db89f993d25e00ae6c876adc7e436bd4b9b3af; rama
vantareapp/isa-1084-plan-analysis-revision, C:/tmp/vantare-isa1084.

Cuatro Go modificados: internal/strategy/document/document.go y document_test.go;
internal/strategy/application/session_catalog.go y session_catalog_test.go.
Contrato de correcciones, handoffs y roadmap manual/generado actualizados.

Referencia opcional para representación anterior; identidad completa validada,
cobertura de todas las incluidas, referencias de excluidas conservadas y
concordancia exacta de la proyección persistida. GetEventPlanningInputs rechaza
el cálculo por catálogo antiguo si se ha fijado revisión. No hay fuente abierta,
consulta a la cabeza, cambio automático de plan ni autorización por digest.

RED: los tests no compilaban por ausencia de Revision y del error de protección.
GREEN: document/application completos PASS. Fixtures simbólicas y reutilización
del contrato de proyección existente, no datos de carrera ni precisión física.
Primera ejecución interrumpida por archivos de instalación/caché compartida Go
no encontrados; repetir con GOCACHE=C:/tmp/isa1084-go-cache llegó al RED esperado
y después al GREEN. No se modificó instalación ni caché ajena.

Go global FAIL: cmd/vantare y frontend no pueden compilar porque frontend/dist
no existe; además reaparece #708, TestCoordinatorWithSQLiteDrainsAndReleasesAllHandles,
store_test.go:801, complete recording WAL: context deadline exceeded. Tres
repeticiones aisladas pasan sin cambios (2,263 s); no invalidan el fallo global.
Vet document/application y diff check PASS. Por instrucción de Isaac no se genera build ni se abre la app. No hay
assets ficticios para esconder el bloqueo. Log C:/tmp/isa1084-go-test.log.
Frontend sin cambios: sus tests/tipos/lint no se repiten; gate anterior #1082.

Verificación funcional pendiente: seleccionar revisión desde UI, guardar plan,
reiniciar, recuperar y recalcular exactamente esa revisión. Faltan el contrato
TS, productor autorizado conectado y la UI. C7 no se declara completo.
Revisión personal: identidad/coverage, nil legado, lectura sin mutar, ausencia
de fallback al catálogo y diff. Sin nueva dependencia, LMU, modificación de
originales, push/PR, CI remota, merge, promoción ni release.
