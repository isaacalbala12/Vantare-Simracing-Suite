# ISA-894 · R6a.1 retirada de constructores Overlay V1 huerfanos

## Motivo

R6a retiro el unico productor runtime de Overlay V1. El gate global descubrio
correctamente que `overlay.ProjectV1` y `telemetrytransport.NewOverlayFull`
quedaban exportados sin caller productivo. No se permite silenciar el guard con
allowlists, `Deprecated`, callers ficticios ni excepciones temporales.

Base congelada: `fcf965687989c99409a6f46d3435da8f1d60a2c3` (R6a).

R6a.1 es un segundo microcorte dentro de la misma rama y del mismo futuro PR.
R6a no se declara verde de forma aislada: el par R6a + R6a.1 debe cerrar el
guard y todos los gates.

## Alcance cerrado

Produccion:

- `internal/telemetry/projection/overlay/v1.go`: retirar el proyector y toda su
  implementacion muerta; conservar temporalmente solo tipos y constantes de
  contrato que aun consume contract-gen o el Hub inerte.
- `internal/app/telemetrytransport/transport.go`: retirar
  `NewOverlayFull`; conservar `ProductOverlay`, `Hub`, `newFull` y Strategy.

Tests que dejen de compilar o que usaban el proyector V1 como oraculo:

- tests del paquete `projection/overlay` y sus benchmarks;
- tests de drivers, recording, Overlay V2 o transporte que llamen a
  `overlay.ProjectV1`/`NewOverlayFull`;
- tests historicos Go bajo `docs/research` si forman parte de `go test ./...`;
- tests de failure-policy/payload necesarios para reponer una prueba runtime de
  `ErrPayloadTooLarge` sobre Strategy, con limite reducido e inyectado solo en
  test.

No se modifican frontend, contract-gen, TypeScript generado,
adapters legacy, el Hub runtime, `Hub()`, `ProductOverlay`, metricas, Strategy
V1, Engineer ni OverlayFrame V2 productivo. Esos contratos restantes se
retiran por dependencia en R6b/R7.

Excepcion unica a "sin fixtures/goldens" (resolucion del orquestador a la
contradiccion del replay canonico, minima y obligatoria): el replay canonico
compilaba contra `overlay.ProjectV1` y no puede quedar asi ni puede omitir al
consumidor Overlay. Se migra
`internal/telemetry/recording/replay/canonical_integration_test.go` para
incluir un OverlayFrame V2 determinista (`overlayv2.ProjectV2` puro con
contexto/defaults existentes, sin tocar produccion V2 y sin reimplementar V1)
en el digest, y se actualiza unicamente
`testdata/canonical-integration-v1.golden.json` con el digest resultante. Si
ProjectV2 no pudiera construirse deterministicamente sin tocar produccion V2,
se para y se reporta en lugar de inventar un digest.

Segunda excepcion a "sin fixtures/goldens" (fix de revision del orquestador
P1, estrictamente necesaria): `TestSingleLMU14RuntimeReachesCanonicalDeterministically`
quedo debilitado al comparar las 20 ejecuciones solo entre si, conservando el
campo legacy `trackOverlayProjectionSha256` sin uso: un bug determinista
pasaria. Se preserva la garantia fija renombrando el campo/JSON a
`TrackCanonicalFingerprintSHA256` / `trackCanonicalFingerprintSha256`, con
assert del SHA256 del `canonicalRuntimeFingerprint` serializado contra el
golden, y se actualiza unicamente
`internal/telemetry/drivers/lmu/testdata/menu_track_pit_disconnect_v1.golden.json`
con el hash real. No se reintroduce V1 ni se cambia produccion.

## Garantias

1. Cero exports de telemetria sin caller productivo; el wiring guard pasa sin
   excepciones nuevas.
2. Cero funcion capaz de proyectar FinalState a Overlay V1 o construir su full
   envelope dentro del binario.
3. Los tipos V1 de contrato pueden sobrevivir temporalmente solo si tienen un
   consumidor productivo literal en contract-gen/Hub y no ejecutan trabajo.
4. Los tests que usaban V1 como oraculo se migran a hechos canonicos o V2; no
   se reemplazan por aserciones mas debiles.
5. La politica de fallos conserva evidencia runtime de
   `ErrPayloadTooLarge`: un Hub Strategy con limite de test reducido provoca el
   fallo de snapshot, tanto en modo fail-stop legacy como en modo no terminal.

## TDD

### RED ya acreditado

Tras R6a y antes de produccion R6a.1:

`go test ./internal/telemetry -run TestExportedSymbolsHaveProductionCaller -count=1 -v`

debe fallar citando exactamente `NewOverlayFull` y `overlay.ProjectV1` sin
caller productivo. Esa salida es el RED arquitectonico; no se crea un caller
falso para apagarlo.

### GREEN

- retirar ambos constructores y la implementacion de proyeccion V1 ya muerta;
- migrar o eliminar solo tests que prueban codigo eliminado, dejando una
  garantia equivalente en V2/hechos canonicos cuando aplique;
- reponer el desborde runtime en Strategy mediante un Hub de test acotado;
- ejecutar el wiring guard hasta que no quede ningun siguiente huerfano.

## Gates

- wiring guard focal RED registrado y GREEN final;
- tests focales de overlayv2, drivers, recording y telemetrytransport tocados;
- `go test ./...` completo; reintentar una vez el flaky heredado de voiceinput
  sin confundirlo con el corte;
- `go vet ./...`, separando deuda heredada conocida;
- `gofmt`, `git diff --check` y busqueda de frontera por simbolo;
- `pnpm --dir frontend typecheck`, test, build y lint no se repiten si R6a.1 no
  toca frontend y ya constan verdes sobre el mismo commit padre;
- review fresca de especificacion y review fresca de calidad sobre el conjunto
  R6a + R6a.1.

## Cierre

El PR draft se publica solo cuando el conjunto sea verde. No mergear ni
promover a `nightly` sin autorizacion explicita de Isaac.
