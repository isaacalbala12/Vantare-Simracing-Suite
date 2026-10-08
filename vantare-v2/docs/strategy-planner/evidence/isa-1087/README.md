# ISA-1087 — Strategy consume revisiones exactas

Base 11676e9958d951fc1ed999055b4b38f0103590d0; rama
vantareapp/isa-1087-connect-revision-inputs; C:/tmp/vantare-isa1087.

Tres archivos Go modificados: internal/strategy/application/session_catalog.go,
su test y cmd/vantare/main.go. Contrato, ambos handoffs y roadmap actualizados.
No se modifica strategy_telemetry_test.go: el comportamiento se cubre en el
consumidor y el productor existente; compilar/probar main verifica composición,
sin añadir un test que compare texto del constructor.

GetEventPlanningInputs solicita las referencias exactas al adaptador autorizado,
valida contrato, combinación y referencias devueltas. Conserva ajustes; no
escribe ni devuelve parciales al fallar. Selección sin referencias mantiene
el catálogo anterior. Main conecta Strategy tras inicializar Analysis/licencia.

RED previo por conexión ausente; GREEN focal. RED adicional reproducido:
proveedor cancela contexto y devuelve éxito tardío; ahora se rechaza con
context.Canceled. Cobertura de revisión/combinación incorrecta, refs ausentes,
selección parcial, fallo del proveedor, ausencia de proveedor, cero fallback,
ajustes conservados y cero escritura. Fixtures de contrato, no DuckDB real.

Checks PASS: build frontend (aviso heredado de chunks >500 KB), gofmt,
go test ./internal/strategy/application ./internal/app ./cmd/vantare,
go vet de esos tres paquetes, go test ./... (C:/tmp/isa1087-go-test.log),
revisión personal del diff y git diff --check. Suite frontend no repetida:
ningún TS/CSS cambiado; última evidencia #1085 418 archivos/3294 tests.

Verificación manual pendiente de UI: abrir explícitamente una fuente, fijar su
revisión, solicitar entradas y comprobar las referencias; cerrar la fuente o
cambiar la referencia debe producir error sin sustituir datos. No se certifica
todavía ese recorrido en Wails, precisión física ni editor completo. Reapertura,
UI productiva, operaciones restantes y calibración real siguen pendientes.

PC/build/app autorizados; este corte no abre app ni toca LMU. Sin dependencia
nueva, modificación de fuentes reales, push, PR, CI remota, merge, promoción
ni release. Actualización de issue dentro del alcance autorizado.
