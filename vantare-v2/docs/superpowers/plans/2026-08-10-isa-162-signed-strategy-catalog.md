# ISA-162 Signed Strategy Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar, verificar, conservar offline y presentar por separado un catálogo oficial firmado de planes Strategy sin confiar en contenido alterado ni duplicar el repositorio de `Mis planes`.

**Architecture:** `internal/strategy/catalog` verifica un envelope Ed25519 que contiene como bytes exactos un manifest y un payload; cada entrada del payload lleva un único paquete `strategy.package.v1` inmutable que se valida con `packaging.Decode`. Un caché propio del catálogo conserva `current` y `previous` last-known-good y solo sustituye el actual tras verificar firma, checksum, secuencia, compatibilidad y paquetes completos. Un CLI separado firma fuera de la aplicación; Wails expone únicamente lectura/refresh y la UI mantiene `Planes de Vantare` separado de `Mis planes`.

**Tech Stack:** Go standard library (`crypto/ed25519`, `crypto/sha256`, `encoding/json`, `net/http`), contratos Strategy existentes, React/TypeScript/Vitest y GitHub Actions existentes. Sin dependencias nuevas.

---

## Threat model y decisiones cerradas

- Entrada no confiable: envelope, manifest, payload, paquetes anidados, respuesta HTTP y archivos de caché.
- Activos: claves públicas de confianza, identidad oficial, planes privados del usuario y el último catálogo ya verificado.
- La firma usa dominio `vantare.strategy.official-catalog.v1`, longitud big-endian del manifest, bytes exactos del manifest y bytes exactos del payload. Cambiar un solo byte invalida firma o checksum.
- El manifest declara `bundleVersion`, `sequence`, `publishedAt`, `keyId`, `payloadSHA256` y `payloadLength`. La secuencia es positiva y no puede retroceder frente al current verificado.
- Las claves públicas usan `strategy.official-catalog.trust.v1`, versión positiva, IDs únicos, algoritmo `Ed25519` y ventana opcional de secuencias. La aplicación nunca recibe ni llama a una clave privada.
- El payload usa `strategy.official-catalog.payload.v1`, máximo 128 entradas y 16 MiB totales. IDs son únicos y ordenados; cada compatibilidad exige simulador, circuito, coche y evento explícitos.
- Cada entrada contiene exactamente un `strategy.package.v1`, sin draft y con al menos una revisión. Su provenance debe nombrar `vantare`. Un fallo rechaza el catálogo completo.
- Un candidato inválido, viejo o ambiguo no escribe current ni previous. Un current corrupto solo puede recuperarse desde previous si previous vuelve a verificar con las claves actuales.
- Sin current/previous verificado, la UI muestra ausencia/error; nunca crea planes, ceros ni estimaciones.
- El transporte HTTP tiene timeout, límite de bytes, status 200 y URL `https`; el endpoint y las claves públicas se inyectan como configuración pública. No hay Shared Memory, LMU REST, DuckDB, Analysis ni almacenamiento privado ajeno.
- El CLI lee la clave privada desde una variable de entorno cuyo nombre recibe por flag. Tests usan una clave efímera. Ninguna clave privada o valor de secreto se escribe en el repo, logs o artefactos.

## Mapa de archivos

| Ruta | Responsabilidad |
|---|---|
| `internal/strategy/catalog/model.go` | Envelope, manifest, payload, entry, compatibilidad y read model verificado |
| `internal/strategy/catalog/errors.go` | Códigos estables y sentinels fail-closed |
| `internal/strategy/catalog/trust.go` | Parseo estricto del keyset público versionado |
| `internal/strategy/catalog/verify.go` | Checksum/firma exacta, límites, secuencia y validación de paquetes oficiales |
| `internal/strategy/catalog/cache.go` | Current/previous atómicos, LKG y recuperación |
| `internal/strategy/catalog/source.go` | GET HTTPS acotado e interfaz de source |
| `internal/strategy/catalog/service.go` | Load/refresh con fallback honesto y anti-downgrade |
| `internal/strategy/catalog/json_bridge.go` | Protocolo Wails correlacionado, sin filtrar errores internos |
| `internal/strategy/catalog/signing/sign.go` | Constructor determinista solo para tooling |
| `cmd/strategy-catalog/main.go` | CLI reproducible que lee manifest y clave desde entorno |
| `cmd/vantare/main.go` y tests | Configuración pública, cache/source/service y eventos Wails |
| `tools/generate_supabase_config.ps1` y tests existentes | Incrustar endpoint/keyset públicos sin entrar en nombres de caché |
| `.github/workflows/strategy-catalog.yml` | Workflow manual que prueba, firma y publica artefacto sin imprimir secretos |
| `frontend/src/strategy/strategy-catalog-client.ts` y test | Cliente TS estricto del bridge |
| `frontend/src/hub/strategy/StrategyPlannerPage.tsx`, test y CSS | Pestañas separadas, estados, refresh y copia explícita a `Mis planes` |
| `docs/strategy-planner/str-15b-official-catalog.md` | Contrato, operación, rotación, rollback y verificación manual |
| `docs/changelog/fragments/ISA-162.json` | Comunicación visible para testers |
| `docs/current-plan.md` y `docs/vantare-program/handoffs/strategy-planner.md` | Estado vivo y límites reales |

### Task 1: Dominio firmado, caché y generador reproducible

**Files:**
- Create: `internal/strategy/catalog/{model,errors,trust,verify,cache,source,service,json_bridge}.go`
- Create: `internal/strategy/catalog/*_test.go`
- Create: `internal/strategy/catalog/signing/sign.go`
- Create: `internal/strategy/catalog/signing/sign_test.go`
- Create: `cmd/strategy-catalog/main.go`
- Create: `cmd/strategy-catalog/main_test.go`

- [x] **Step 1: Escribir primero tests RED de abuso y contrato**

  Los nombres mínimos son:

  ```go
  func TestVerifyAcceptsExactSignedBytes(t *testing.T)
  func TestVerifyRejectsEverySingleByteMutation(t *testing.T)
  func TestVerifyRejectsUnknownExpiredAndFutureKeys(t *testing.T)
  func TestVerifyRejectsWrongSchemaChecksumLengthAndSignature(t *testing.T)
  func TestVerifyRejectsDuplicateOrIncompatibleEntries(t *testing.T)
  func TestVerifyRejectsDraftsMultipleBundlesAndNonVantareProvenance(t *testing.T)
  func TestCacheRejectedCandidateNeverReplacesLastKnownGood(t *testing.T)
  func TestCacheRecoversVerifiedPreviousWhenCurrentIsCorrupt(t *testing.T)
  func TestServiceRejectsSequenceRollbackAndUsesVerifiedOfflineCache(t *testing.T)
  func TestSignProducesIdenticalBytesForIdenticalInputs(t *testing.T)
  func TestCLIReadsPrivateKeyWithoutPrintingOrPersistingIt(t *testing.T)
  ```

- [x] **Step 2: Ejecutar RED y conservar el fallo esperado**

  Run: `go test -count=1 ./internal/strategy/catalog/... ./cmd/strategy-catalog`

  Expected: FAIL porque todavía no existe la implementación; no se acepta un test que pase sin ejercer firma, mutación y escritura real en `t.TempDir()`.

- [x] **Step 3: Implementar el contrato mínimo**

  Las firmas públicas quedan fijadas así:

  ```go
  const BundleVersionV1 = "strategy.official-catalog.bundle.v1"
  const PayloadVersionV1 = "strategy.official-catalog.payload.v1"
  const TrustVersionV1 = "strategy.official-catalog.trust.v1"

  type Verifier struct { /* copia defensiva de trusted keys */ }
  func ParseTrustedKeySet(document []byte) (TrustedKeySet, error)
  func NewVerifier(keys TrustedKeySet) (*Verifier, error)
  func (v *Verifier) Verify(document []byte) (VerifiedCatalog, error)

  type Cache struct { /* mutex, root, verifier, writer inyectable para tests */ }
  func OpenCache(root string, verifier *Verifier) (*Cache, error)
  func (c *Cache) Load() (VerifiedCatalog, CacheStatus, error)
  func (c *Cache) Accept(candidate []byte) (VerifiedCatalog, CacheStatus, error)

  type Source interface { Fetch(context.Context) ([]byte, error) }
  type Service struct { /* source + cache */ }
  func (s *Service) Load(context.Context) (Result, error)
  func (s *Service) Refresh(context.Context) (Result, error)
  ```

  `VerifiedCatalog` no conserva aliases mutables: copia manifest, payload y paquetes. `Accept` verifica antes de cualquier write; compara contra current verificado; escribe previous y current con temp+sync+replace. La recuperación verifica previous antes de restaurar.

- [x] **Step 4: Implementar firma y CLI fuera del runtime**

  ```go
  package signing

  func Build(manifest catalog.Manifest, payload catalog.Payload, privateKey ed25519.PrivateKey) ([]byte, error)
  ```

  El CLI recibe `-manifest`, `-output` y `-private-key-env`; resuelve paths de paquetes relativos al manifest, ordena entradas por ID y lee base64url seed/private-key desde la variable indicada. Nunca acepta la clave literal por argumento y nunca la imprime.

- [x] **Step 5: Ejecutar GREEN y checks focales**

  Run:

  ```text
  gofmt -w internal/strategy/catalog cmd/strategy-catalog
  go test -count=20 ./internal/strategy/catalog/... ./cmd/strategy-catalog
  go vet ./internal/strategy/catalog/... ./cmd/strategy-catalog
  git diff --check
  ```

  Expected: PASS y `gofmt -l` sin salida.

### Task 2: Cableado de aplicación y workflow de publicación

**Files:**
- Modify: `cmd/vantare/main.go`
- Modify: `cmd/vantare/main_test.go`
- Modify: `tools/generate_supabase_config.ps1`
- Modify: tests del generador existentes que encuentre el worker
- Create: `.github/workflows/strategy-catalog.yml`

- [x] **Step 1: Escribir tests RED del bridge y configuración**

  ```go
  func TestExecuteStrategyCatalogCommandPreservesCorrelationAndSanitizesErrors(t *testing.T)
  func TestStrategyCatalogRootStaysInsideStrategyDataRoot(t *testing.T)
  func TestResolveStrategyCatalogConfigurationFailsClosedWhenMissing(t *testing.T)
  ```

  El guard PowerShell debe demostrar que el source generado solo contiene endpoint/keyset públicos codificados y no la variable privada `VANTARE_STRATEGY_CATALOG_SIGNING_KEY`.

- [x] **Step 2: Ejecutar RED**

  Run: `go test -count=1 ./cmd/vantare`

  Expected: FAIL en las funciones/eventos aún ausentes.

- [x] **Step 3: Cablear sin ampliar autoridad**

  Añadir configuración pública `strategyCatalogURL` y
  `strategyCatalogPublicKeys`. En una build empaquetada, endpoint y keyset
  embebidos son la autoridad y no pueden sustituirse desde el entorno; solo
  una build de desarrollo sin configuración embebida admite el opt-in por
  variables públicas. Si falta URL o keyset, registrar disponibilidad falsa y
  devolver un error público estable; no aceptar contenido unsigned. Cache bajo
  `<strategy root>/official-catalog`, evento request
  `strategy:catalog:command` y eventos `strategy:catalog:result|error`.

- [x] **Step 4: Añadir workflow reproducible y fail-closed**

  `strategy-catalog.yml` será `workflow_dispatch`, comprobará ruta de manifest dentro del repo, ejecutará tests, pasará la clave solo como env al CLI, generará dos veces en directorios temporales, comparará SHA-256, subirá únicamente el bundle y su `.sha256`, y fallará si falta el secret. No publica release, no hace commit y no imprime la variable.

- [x] **Step 5: Ejecutar GREEN**

  Run:

  ```text
  gofmt -w cmd/vantare
  go test -count=20 ./cmd/vantare
  go test -count=1 ./internal/strategy/...
  go vet ./internal/strategy/... ./cmd/vantare
  git diff --check
  ```

### Task 3: Cliente y UI oficial separada

**Files:**
- Create: `frontend/src/strategy/strategy-catalog-client.ts`
- Create: `frontend/src/strategy/strategy-catalog-client.test.ts`
- Modify: `frontend/src/hub/strategy/StrategyPlannerPage.tsx`
- Modify: `frontend/src/hub/strategy/StrategyPlannerPage.test.tsx`
- Modify: `frontend/src/hub/strategy/strategy-planner.css`

- [x] **Step 1: Escribir tests RED de comportamiento observable**

  ```ts
  it("keeps verified Vantare plans separate from My plans")
  it("shows no official plan when no verified catalog exists")
  it("labels a recovered offline catalog as last-known-good")
  it("refreshes explicitly and keeps the visible LKG when refresh is rejected")
  it("previews one official package before copying it to My plans")
  it("never writes an official plan when preview or import fails")
  it("rejects malformed bridge results instead of defaulting fields")
  ```

- [x] **Step 2: Ejecutar RED**

  Run: `npx vitest run src/strategy/strategy-catalog-client.test.ts src/hub/strategy/StrategyPlannerPage.test.tsx`

  Expected: FAIL por cliente/pestaña ausentes.

- [x] **Step 3: Implementar UI mínima**

  Añadir selector accesible `Planes de Vantare | Mis planes`, preservando el flujo existente de `Mis planes`. El catálogo oficial tiene estados loading/empty/error/ready, botón explícito `Actualizar catálogo`, evidencia de firma/key/sequence y cards con simulador/circuito/coche/evento. `Guardar en Mis planes` reutiliza `previewStrategyImport` y `commitStrategyImport`; no abre ni activa directamente y nunca mezcla la lista oficial con el repositorio.

- [x] **Step 4: Ejecutar GREEN y regresiones frontend**

  Run:

  ```text
  npx vitest run src/strategy/strategy-catalog-client.test.ts src/strategy/strategy-transfer.test.ts src/strategy/strategy-library.test.ts src/hub/strategy/StrategyPlannerPage.test.tsx
  npx eslint src/strategy/strategy-catalog-client.ts src/strategy/strategy-catalog-client.test.ts src/hub/strategy/StrategyPlannerPage.tsx src/hub/strategy/StrategyPlannerPage.test.tsx
  npx tsc -b --force
  ```

  Expected: PASS sin cambiar tests existentes para ocultar regresiones.

### Task 4: Evidencia, revisión y entrega

**Files:**
- Create: `docs/strategy-planner/str-15b-official-catalog.md`
- Create: `docs/changelog/fragments/ISA-162.json`
- Modify: `docs/current-plan.md`
- Modify: `docs/vantare-program/handoffs/strategy-planner.md`

- [x] **Step 1: Documentar operación y límites reales**

  Incluir formatos, firma exacta, rotación solapada de claves, procedimiento de cache recovery, generación reproducible, variables públicas/secretas por nombre, verificación manual y la limitación honesta de que no se publica ningún plan de referencia hasta disponer de contenido aprobado y clave de producción configurada.

- [x] **Step 2: Revisión independiente de especificación**

  El reviewer comprueba uno a uno los criterios de ISA-162 y el threat model. Critical/Important se corrigen antes de continuar.

- [x] **Step 3: Revisión independiente de calidad**

  El reviewer busca bypass criptográfico, downgrade, TOCTOU, pérdida de LKG, exposición de secret, parser permisivo, estado React duplicado y UI que sugiera datos inexistentes.

- [x] **Step 4: Gates completos**

  Run:

  ```text
  gofmt -l internal/strategy cmd/strategy-catalog cmd/vantare
  go vet ./internal/strategy/... ./cmd/strategy-catalog ./cmd/vantare
  go test -count=1 ./internal/strategy/... ./cmd/strategy-catalog ./cmd/vantare
  npx tsc -b --force
  npx vitest run
  pnpm build
  pnpm lint
  git diff --check
  ```

  `go test -race` queda pendiente de CI porque este Windows no dispone de CGO/gcc; se declara, no se simula.

  Evidencia repetida tras la rebase sobre `origin/nightly@ff286f4`: `gofmt`,
  vet, Go focal y global, variante `production`, typecheck real, 358 archivos /
  2493 tests frontend, build,
  guard PowerShell, YAML, fragmento y `git diff --check` pasan. `pnpm lint` se
  ejecutó y conserva el baseline rojo del repositorio (39 errores y 2 warnings
  fuera de los archivos ISA-162); el ESLint focal de los cuatro archivos TS/TSX
  modificados pasa. No se amplía esta issue para limpiar esa deuda ajena.

- [x] **Step 5: Estado externo exacto**

  Actualizar handoff/current-plan y Linear tras cada worker y al cierre. Preparar commits pequeños, push normal y PR draft hacia `nightly` solo después de checks/reviews. No merge, promoción, release ni ejecución del workflow firmado sin nueva autorización de Isaac.

  Estado alcanzado: cuatro commits de producto/documentación rebasados sobre
  `origin/nightly@ff286f4`, rama publicada y PR draft #201 abierto hacia
  `nightly`. ISA-162 permanece `In Progress`, porque este equipo no tiene un
  estado intermedio de review y el PR aún no está integrado. Sin merge,
  promoción, release ni workflow firmado.
