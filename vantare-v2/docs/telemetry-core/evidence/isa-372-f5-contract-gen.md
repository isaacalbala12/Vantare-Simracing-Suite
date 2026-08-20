# ISA-372 / F5 — contrato TypeScript generado desde Go

Fecha: 2026-08-19. Carril B. Base: `tc-integration@98c3e2f2`.

## Resultado

`tools/telemetry-contract-gen` genera de forma determinista
`frontend/src/generated/telemetry.ts` desde una lista explícita de tipos wire
Go. No usa dependencias nuevas ni toma raíces de `core`, `derive`,
`schema.Field` o del estado canónico.

El archivo contiene 29 interfaces con 252 apariciones de campo. El conteo por
familia, incluyendo los campos aplanados de cada snapshot, es:

| Familia Go | Interfaces | Campos |
| --- | ---: | ---: |
| `projection/overlay` | 8 | 87 |
| `projection/engineer` | 5 | 71 |
| `projection/strategy` | 3 | 30 |
| `projection/analysis` (contrato conservado para F12.b) | 3 | 21 |
| wire compartido `projection` | 2 | 9 |
| structs espaciales alcanzables por Engineer | 4 | 12 |
| `internal/app/telemetrytransport` y compatibilidad facts reservada | 4 | 22 |

También genera 11 uniones literales: capabilities de los cuatro productos,
`ProductID`, `SnapshotKind`, `EventKind`, estado, frescura, procedencia y kinds
de facts Engineer.

`internal/telemetry/schema/envelope` no ofrece hoy structs exportados con tags
JSON: sus wrappers de ownership no son payload wire y no se generan.

## Paridad y divergencias

`TestGeneratedContractMatchesHandwritten` caracteriza los tres sobres que
declaraba manualmente `contracts.ts`, sus enums y el espejo vigente de
`OverlayVehicleV1`. Compara campo, tipo y opcionalidad. El resultado es verde.

Hallazgos:

- el briefing situaba el espejo de ~28 campos en `contracts.ts`, pero ese
  archivo solo contenía sobres genéricos. El espejo de producto vigente está
  en `frontend/src/overlay/projection/overlay-projection-v1.ts`, declara 30
  campos y quedó fuera de las rutas autorizadas para editar en F5. El generado
  ya contiene `OverlayVehicleV1` y el test demuestra paridad, pero retirar o
  reexportar las declaraciones del decoder requiere un corte posterior con
  ese archivo expresamente en alcance;
- la cifra de 28 campos del expediente histórico ya no describe el código:
  `overlay.VehicleV1` y su espejo TS vigente contienen 30 campos. Los dos
  campos adicionales son `fuelCapacityLiters` y `groundPositionCm`; Go y TS ya
  coincidían, por lo que no hubo que cambiar el contrato de red;
- F4 retiró el transporte live de facts, pero frontend conserva
  `FactEnvelope` y `EventKind = "fact"` como compatibilidad hasta F7. El
  generado lo marca deprecated; no añade una ruta live;
- `StatusEnvelope.Payload` es `json.RawMessage` en el sobre Go y se valida como
  `StatusPayload` antes de exponerse. La configuración explícita conserva esa
  relación tipada en TS sin cambiar los bytes.

Los goldens Overlay, Engineer, Strategy y Analysis no se modificaron. El test
`telemetry.generated.test.ts` carga los cuatro fixtures compartidos y los pasa
por el decoder existente con los tipos generados.

## Regeneración y gate

```powershell
task telemetry:contract
task telemetry:contract:check
```

En esta máquina `task` no está instalado. Los equivalentes verificados son:

```powershell
go run ./tools/telemetry-contract-gen
go run ./tools/telemetry-contract-gen -check
git diff --exit-code -- frontend/src/generated/
```

`-check` genera en un temporal, compara bytes y no modifica el árbol. Los
workflows `branch-channel-gates.yml` y `release.yml` ejecutan el mismo gate.
`legacy-retirement.test.ts` exige la cabecera por ruta y prohíbe que
`contracts.ts` vuelva a declarar nombres exportados por el generado.

## Límites

- No se tocó el canonical ni ninguna proyección Go.
- No se tocaron `store.ts`, `freshness-watchdog.ts`, `telemetry-adapter.ts`,
  `telemetry_core_runtime.go` o `telemetrytransport/transport.go`; la
  integración del carril F2 queda para el orquestador.
- El decoder Overlay conserva por ahora sus aliases manuales fuera de
  `contracts.ts`; F5 los caracteriza, pero no los editó porque su ruta no
  estaba autorizada.
- La validación es local. No hubo push, PR, CI remoto, merge ni promoción.
