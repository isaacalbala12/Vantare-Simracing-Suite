# ISA-349 — contrato puro de capturas v1

Estado: plan TDD aprobado por ISA-346; ejecución en curso.

## Objetivo

Crear un contrato puro y equivalente en Go y TypeScript para describir un lote
server-owned de hasta diez capturas PNG/JPEG. Este corte no realiza I/O ni
introduce SQL, Storage, RPC, UI o agentes.

## Decisiones cerradas

- Versión exacta `testing-center.screenshot-evidence.v1`.
- 1..10 capturas por lote; el flujo sin capturas no crea este contrato.
- 1 byte..10 MiB por captura y máximo 100 MiB por lote.
- MIME exactos `image/png` e `image/jpeg`.
- SHA-256 lowercase de 64 caracteres.
- Posiciones contiguas 1..N, IDs opacos no vacíos y canal `nightly|testers`.
- Dimensiones 1..16.384 por lado y máximo 40 megapíxeles.
- Estados batch y evidencia cerrados según la spec ISA-346.
- `failureCode` solo existe para una evidencia `rejected` y usa una
  enumeración cerrada.
- `EvidenceScreenshot = "screenshot"` amplía de forma compatible el contrato
  de evidencia existente.

## Archivos previstos

- `internal/testingcenter/contract/types.go`
- `internal/testingcenter/contract/screenshot.go`
- `internal/testingcenter/contract/screenshot_test.go`
- `frontend/src/hub/testing-center/screenshot-evidence-contracts.ts`
- `frontend/src/hub/testing-center/screenshot-evidence-contracts.test.ts`
- este microplan y `docs/current-plan.md`

## Secuencia TDD

### Task 1 — Go RED

1. Añadir tests table-driven de un batch válido y round-trip JSON cerrado.
2. Cubrir versión, campos desconocidos, IDs, canal, count 0/10/11, posiciones,
   MIME, bytes 0/10 MiB/10 MiB+1, total, digest y dimensiones.
3. Cubrir todos los estados y la relación `rejected`/`failureCode`.
4. Añadir regresión que exige `EvidenceScreenshot` en `Evidence.Validate`.
5. Ejecutar el focal y conservar la salida RED por símbolos ausentes.

### Task 2 — Go GREEN/REFACTOR

1. Añadir tipos, constantes y validación mínima en `screenshot.go`.
2. Reutilizar validadores privados existentes sin crear abstracciones
   genéricas ni I/O.
3. Añadir decoder JSON exacto con el patrón actual de `decode.go`.
4. Ejecutar `gofmt` y el paquete focal hasta GREEN.

### Task 3 — TypeScript RED

1. Añadir tests del decoder para el mismo batch válido y los límites de borde.
2. Probar shape exacto, arrays, enteros seguros, estados y failure code.
3. Ejecutar Vitest focal y conservar la salida RED por módulo ausente.

### Task 4 — TypeScript GREEN/REFACTOR

1. Implementar tipos, constantes y decoder puro sin dependencia nueva.
2. Mantener errores cerrados mediante `TestingCenterContractError`.
3. Ejecutar Vitest focal hasta GREEN.

### Task 5 — gates

1. `go test ./internal/testingcenter/contract -count=1`.
2. `pnpm --dir frontend test -- src/hub/testing-center/screenshot-evidence-contracts.test.ts`.
3. `pnpm --dir frontend build` porque se añaden exports TypeScript.
4. `go test ./...` por cambio de contrato compartido.
5. `git diff --check` y revisión completa del diff.

## Stop conditions

- El contrato necesita paths, tokens, nombres originales o bytes.
- Aparece una dependencia nueva.
- Se requiere cambiar la firma del reporte actual.
- Los estados no pueden validarse sin introducir comportamiento de SQL/Storage.
- Un test existente falla por una causa no entendida.

## Entrega

Commits pequeños RED/GREEN/REFACTOR, dos reviews independientes (spec y calidad),
PR draft apilado sobre ISA-346 y Linear actualizado. No merge ni promoción.
