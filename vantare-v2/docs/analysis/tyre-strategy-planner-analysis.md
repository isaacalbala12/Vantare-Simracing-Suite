# Tyre Strategy Planner — Análisis y Decisión Arquitectónica v3

**Fecha:** 2026-07-10
**Versión del documento:** 3.0

---

## Precondiciones Git

### Rama y worktree para implementación

La implementación **NO** se realizará en `launch/polar-billing` (rama actual verificada en el repositorio de Vantare v2).

**Precondición obligatoria antes de iniciar desarrollo:**

1. Partir de `develop` como base.
2. Crear la rama `feature/tire-strategy`.
3. Crear o utilizar un worktree completo y dedicado para esa rama.
4. Verificar que el worktree contiene el código fuente completo (no solo `node_modules/`).

**El worktree actual `cosmic-mountain` (`C:\Users\isaac\.local\share\opencode\worktree\0a6593ec74981194e4a909280ed623aa6700e094\cosmic-mountain`) NO es válido para desarrollar** — contiene únicamente `node_modules/` y no tiene código fuente de Vantare.

### Estado Git de Vantare v2 (verificado)

| Campo | Valor |
|-------|-------|
| Ruta del repositorio | `C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2` |
| Rama actual | `launch/polar-billing` |
| Commit HEAD | `44b49ae89de3510146b4911994dc35dd5d5a6091` |
| Mensaje | `fix(roadmap): only Widget Studio is in-development, rest to future` |

---

## Metadatos de verificación

### TinyPedal

| Campo | Valor |
|-------|-------|
| Repositorio | `https://github.com/TinyPedal/TinyPedal` |
| Rama | `master` |
| Commit HEAD | `ca52517b68295d6e71fd650e132bad081f82de8c` (2026-07-08) |
| Commit de introducción | `f0b90709c4e583dc779b009b5ac17dced04fe042` (2026-03-16) |
| Archivos del planner | `tinypedal/ui/tyre_strategy_planner.py`, `tinypedal/userfile/tyre_strategy.py` |
| Commits en archivos | **1 único commit** (`f0b9070`). Sin cambios posteriores. |

### Archivos de Vantare inspeccionados

| Archivo | Relevancia |
|---------|-----------|
| `cmd/vantare/main.go` | Entry point, Wails service registration |
| `internal/app/profile_service.go` | CRUD de perfiles, patrón de persistencia |
| `internal/app/hub_service.go` | Hub CRUD |
| `internal/app/settings_service.go` | Settings con migración, atomic write |
| `internal/engineer/telemetry/model.go` | Modelo interno (con tyre fields) |
| `pkg/models/telemetry.go` | Modelo público (sin tyre fields) |
| `pkg/config/profile.go` | Schema de perfiles |
| `internal/engineer/tyre/monitor.go` | Monitor de neumáticos |
| `internal/engineer/core/runtime.go` | Runtime de monitores |
| `frontend/package.json` | Dependencias |
| `frontend/src/hub/HubApp.tsx` | Shell del Hub |
| `frontend/src/hub/overlays/useOverlayStudioState.ts` | Estado con undo/redo |

### Dependencias frontend

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@wailsio/runtime": "3.0.0-alpha.79",
    "motion": "^12.42.2",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  }
}
```

No hay librería de DnD instalada actualmente.

---

## A. Análisis Confirmado de TinyPedal

### 1. Qué puede hacer el usuario

- Crear, abrir, guardar y exportar (CSV) planes de estrategia
- Definir stock de neumáticos con nombre único (`Soft #1`, etc.)
- Configurar parámetros por compuesto (desgaste inicial por posición, desgaste por stint por posición, stock limitado/ilimitado)
- Asignar neumáticos a ruedas (FL/FR/RL/RR) mediante drag-and-drop
- Configurar reglas: máximo de neumáticos, restricción de asignación, tiempos de cambio
- Ver desgaste proyectado, tiempo de servicio y resumen

### 2. Organización de la pantalla

```
┌─────────────────────────────────────────────────────────┐
│  Tyre Rule Panel                                        │
│  [Maximum Tyres: ▼4] [Change Time: 4.5s/1 ...]         │
│  [☑ Restrict Allocation] [☑ Highlight New Tyre]         │
├────────────────┬────────────────────────────────────────┤
│  Tyre Set      │  Tyre Plan Panel                       │
│  Panel         │  [File ▼] [filename] [Save As]         │
│  [Compounds ▼] │  ┌────┬────┬────┬──────┬────────┐     │
│  [Add] [Config]│  │ FL │ FR │ RL │ RR   │ Change │     │
│                │  ├────┼────┼────┼──────┼────────┤     │
│  Tyre Set List │  │S#1 │S#2 │M#1 │M#1   │ 4.5s   │     │
│  ┌──────────┐  │  └────┴────┴────┴──────┴────────┘     │
│  │ Soft #1  │  │  [Dup][New][InsB][InsA][Del] [Close]  │
│  │ Soft #2  │  │                                        │
│  └──────────┘  │                                        │
├────────────────┴────────────────────────────────────────┤
│  Status: Stock: 8/4 | Used: 3 | Stints: 5 | ...        │
└─────────────────────────────────────────────────────────┘
```

### 3. Datos configurados manualmente

Compuestos, stock de neumáticos, configuración por compuesto, máximo de neumáticos, restricción de asignación, tiempos de cambio, plan de stints.

### 4. Representación de compuestos

Diccionario `{nombre: settings}` con 9 campos por compuesto (enable_limited_stock, starting_tread y wear_per_stint por posición). 14 compuestos hardcodeados.

### 5. Representación de neumáticos físicos

Nombre único `"Compuesto #N"` (string). Lista plana de strings.

### 6. Representación de stints

Tabla QTableWidget: cada fila es un stint, 4 columnas (FL/FR/RL/RR) + columna de tiempo de cambio.

### 7. Asignación a FL/FR/RL/RR

Drag-and-drop desde lista de stock hacia celda de la tabla.

### 8. Restricciones de drag-and-drop

- No drop de celdas vacías
- No drop con selección múltiple
- Solo dentro de la tabla (4 columnas)
- No drop si ya hay widget en la celda

### 9. Evitación de duplicados

**`_same_row`** (siempre activa): Impide mismo neumático en dos posiciones del mismo stint.

**`_same_allocation`** (solo con checkbox): Impide mismo neumático en posición diferente entre stints.

### 10. Restricción de posición

**La restricción SÍ existe.** Con "Restrict Allocation" activado, un neumático asignado a FL solo puede aparecer en FL en stints posteriores. No puede pasar a FR/RL/RR.

### 11. Cálculo de desgaste

```
remaining = starting_tread(posición) - wear_per_stint(posición) × count_stints
```

### 12. Desgaste de neumático reutilizado

Ejemplo con "Restrict Allocation" DESACTIVADO, compuesto "Soft":
- FL: starting_tread=100, wear_per_stint=40
- FR: starting_tread=100, wear_per_stint=30

| Stint | Posición | count | Fórmula | remaining |
|-------|----------|-------|---------|-----------|
| 1 | FL | 0 | `100 - 40×0` | 100% |
| 2 | FR | 1 | `100 - 30×1` | 70% |
| 3 | FL | 2 | `100 - 40×2` | 20% |

**Problema**: En stint 2, la fórmula usa FR_starting_tread=100 en lugar de carry forward el 60% restante de FL. El resultado (70%) es incorrecto — debería ser ~30%.

**TinyPedal vs correcto:**

| Stint | TinyPedal (inicio → final) | Correcto (inicio → final) |
|-------|---------------------------|--------------------------|
| 1 FL | 100% → 60% | 100% → 60% |
| 2 FR | 70% → 40% | 60% → 30% |
| 3 FL | 20% → -20% (blowout) | 30% → -10% (blowout) |

TinyPedal calcula mal porque relee starting_tread de la posición actual en lugar de carrying forward el tread restante.

### 13. Neumáticos cambiados

Compara neumático actual con el de la fila anterior por columna.

### 14. Tiempo de servicio

Array indexado por cantidad de neumáticos cambiados (0-4). Valores configurados por usuario.

### 15. Resumen

Stock/used/stints/pits/changes/time.

### 16. Persistencia

JSON con extensión `.tyre-strategy`. Guardado con `json.dump()`. Carga con `json.load()` + validación.

### 17. Validaciones

Versión del archivo, tyre_rule, tyre_set, tyre_stock (elimina inválidos/duplicados), tyre_plan (elimina filas inválidas).

### 18. Planes incompletos

Se permiten celdas vacías, filas vacías, planes sin validación de completitud.

### 19. Visual vs reglas

Visual: color de barra, blowout, highlight, sort. Reglas: duplicado en fila, asignación, cálculo de desgaste, tiempo de cambio.

### 20. Limitaciones

1. Desgaste fijo por stint (no por vuelta)
2. Stints sin duración
3. Fórmula incorrecta al cambiar posición
4. Stock máximo solo advertencia
5. Compuestos hardcodeados
6. Stints incompletos permitidos
7. Sin undo/redo
8. Acoplamiento UI-lógica
9. Nombres como identidad
10. Sin tests
11. Sin telemetría

---

## B. Análisis Confirmado de Vantare v2

### Stack

Go 1.25, Wails v3, React 19, TypeScript 6, Vite 8, Tailwind v4, Vitest 4.

### Comunicación

Wails Service Bindings para CRUD. Wails Events para tiempo real.

### Persistencia

JSON en disco. Escritura atómica (`.tmp` + `Rename`). Migración con `SchemaVersion`.

### Undo/redo

Historial con `MAX_HISTORY=50`, auto-save 800ms, shortcuts CTRL+Z/Y/S.

### Telemetría

`pkg/models/telemetry.go` (público): sin tyre fields.
`internal/engineer/telemetry/model.go` (interno): con tyre fields.
Los datos de neumáticos NO están disponibles fuera del Ingeniero.

### No existe en Vantare

Modelo de compuesto, planificación de stints, curvas de degradación, inventario de neumáticos, librería DnD.

---

## C. Decisión Arquitectónica Original

### Principio

Feature de planificación pre-carrera, independiente del Ingeniero. Nueva sección en el Hub.

### Estructura

```
vantare-v2/
├── internal/
│   └── strategy/
│       ├── strategy.go
│       ├── calculator.go
│       ├── calculator_test.go
│       ├── validator.go
│       ├── validator_test.go
│       ├── persistence.go
│       └── persistence_test.go
├── internal/app/
│   ├── strategy_service.go
│   └── strategy_service_test.go
└── frontend/src/hub/strategy/
    ├── StrategyPage.tsx
    ├── CompoundsPanel.tsx
    ├── InventoryPanel.tsx
    ├── StintsTable.tsx
    ├── StrategySummary.tsx
    ├── useStrategyState.ts
    ├── useStrategyState.test.ts
    ├── StrategyPage.test.tsx
    └── strategy-types.ts
```

### Modelo de dominio (Go)

```go
package strategy

import "time"

const SchemaVersion = 1

// ---- Posiciones ----

type Position string

const (
    PosFL Position = "FL"
    PosFR Position = "FR"
    PosRL Position = "RL"
    PosRR Position = "RR"
)

var Positions = [4]Position{PosFL, PosFR, PosRL, PosRR}

// ---- Valores por rueda ----

type WheelValues struct {
    FL float64 `json:"fl"`
    FR float64 `json:"fr"`
    RL float64 `json:"rl"`
    RR float64 `json:"rr"`
}

// ---- Compuestos ----

type CompoundCategory string

const (
    CategoryDry     CompoundCategory = "dry"
    CategoryWet     CompoundCategory = "wet"
    CategoryPartial CompoundCategory = "partial"
)

type StockMode string

const (
    StockLimited   StockMode = "limited"
    StockUnlimited StockMode = "unlimited"
)

type TyreCompound struct {
    ID                   string           `json:"id"`
    Name                 string           `json:"name"`
    Symbol               string           `json:"symbol"`
    Color                string           `json:"color"`
    Category             CompoundCategory `json:"category"`
    StockMode            StockMode        `json:"stockMode"`
    DefaultInitialLifePct float64         `json:"defaultInitialLifePct"` // 0-100, vida inicial por defecto
    WearPerLap           WheelValues      `json:"wearPerLap"`           // puntos porcentuales consumidos por vuelta
}

// ---- Neumáticos físicos ----

type TyreInstance struct {
    ID             string  `json:"id"`             // UUID estable
    CompoundID     string  `json:"compoundId"`     // references TyreCompound.ID
    DisplayName    string  `json:"displayName"`    // "Soft #1"
    InitialLifePct float64 `json:"initialLifePct"` // 0-100, condición inicial
}

// ---- Stints ----

type WheelAssignments struct {
    FL string `json:"fl"` // TyreInstance.ID o ""
    FR string `json:"fr"`
    RL string `json:"rl"`
    RR string `json:"rr"`
}

type Stint struct {
    ID          string           `json:"id"`
    PlannedLaps int              `json:"plannedLaps"` // Vueltas previstas (> 0)
    Assignments WheelAssignments `json:"assignments"`
}

// ---- Reglas ----

type ChangeTimes struct {
    One   float64 `json:"one"`   // segundos para 1 neumático
    Two   float64 `json:"two"`   // segundos para 2
    Three float64 `json:"three"` // segundos para 3
    Four  float64 `json:"four"`  // segundos para 4
}

type StrategyRules struct {
    MaxLimitedTyres      int         `json:"maxLimitedTyres"`
    LockTyreToWheelPosition bool     `json:"lockTyreToWheelPosition"`
    ChangeTimes          ChangeTimes `json:"changeTimes"`
}

// ---- Objetivo de carrera ----

type RaceTarget string

const (
    RaceTargetOpen  RaceTarget = "open"  // Sin objetivo definido
    RaceTargetLaps  RaceTarget = "laps"  // Carrera por vueltas
    RaceTargetTimed RaceTarget = "timed" // Carrera por tiempo
)

// ---- Estrategia ----

type StrategyMetadata struct {
    Name         string      `json:"name"`
    Simulator    string      `json:"simulator,omitempty"`
    Vehicle      string      `json:"vehicle,omitempty"`
    Track        string      `json:"track,omitempty"`
    Notes        string      `json:"notes,omitempty"`
    RaceTarget   RaceTarget  `json:"raceTarget"`
    TotalLaps    int         `json:"totalLaps,omitempty"`    // > 0 si raceTarget == "laps"
    TotalTimeMin float64     `json:"totalTimeMin,omitempty"` // > 0 si raceTarget == "timed"
}

type Strategy struct {
    SchemaVersion int              `json:"schemaVersion"`
    ID            string           `json:"id"`
    Metadata      StrategyMetadata `json:"metadata"`
    Compounds     []TyreCompound   `json:"compounds"`
    Inventory     []TyreInstance   `json:"inventory"`
    Stints        []Stint          `json:"stints"`
    Rules         StrategyRules    `json:"rules"`
    CreatedAt     time.Time        `json:"createdAt"`
    UpdatedAt     time.Time        `json:"updatedAt"`
}
```

### Unidades

| Campo | Unidad | Rango |
|-------|--------|-------|
| `InitialLifePct` | Porcentaje de vida restante | 0-100 |
| `DefaultInitialLifePct` | Porcentaje de vida restante | 0-100 |
| `WearPerLap` | Puntos porcentuales consumidos por vuelta | 0-100 |
| `PlannedLaps` | Vueltas | ≥ 1 |
| `TotalLaps` | Vueltas | ≥ 1 |
| `TotalTimeMin` | Minutos | > 0 |
| `ChangeTimes.*` | Segundos | ≥ 0 |
| `MaxLimitedTyres` | Cantidad de neumáticos (solo compuestos limited) | ≥ 0 |

### Stock por compuesto

`StockMode` controla si un compuesto tiene stock limitado:
- `"limited"`: El neumático cuenta hacia `MaxLimitedTyres`.
- `"unlimited"`: El neumático NO cuenta hacia `MaxLimitedTyres` (p.ej., intermedios, lluvia).

`MaxLimitedTyres` cuenta **únicamente** neumáticos de compuestos con `stockMode: "limited"`.

### Reglas simplificadas

Una sola regla configurable: `LockTyreToWheelPosition`.

- `true`: Un neumático asignado a FL solo puede reutilizarse en FL.
- `false`: Un neumático puede reutilizarse en cualquier posición.

La prohibición de usar un mismo neumático en dos ruedas del mismo stint **siempre está activa** y no es configurable.

### Modelo de carrera

`RaceTarget` define el objetivo:
- `"open"`: Sin objetivo definido (validación más permisiva)
- `"laps"`: Carrera por vueltas (`TotalLaps > 0`)
- `"timed"`: Carrera por tiempo (`TotalTimeMin > 0`)

`time-plus-lap` se pospone. El formato del evento (endurance, sprint) es un campo opcional futuro, no parte de fase 1.

Stints siempre tienen `PlannedLaps`. No hay stints por tiempo en fase 1.

### Fórmulas de cálculo

**Desgaste por vuelta por posición:**
```
wear_stint = compound.WearPerLap[position] × stint.PlannedLaps
life_after = life_before - wear_stint
```

**Acumulación de desgaste (misma posición):**
```
stint[0].life_before = instance.InitialLifePct
stint[0].life_after  = stint[0].life_before - wearPerLap[position] × stint[0].PlannedLaps
stint[1].life_before = stint[0].life_after
stint[1].life_after  = stint[1].life_before - wearPerLap[position] × stint[1].PlannedLaps
```

**Acumulación de desgaste (cambio de posición, lockTyreToWheelPosition=false):**
```
stint[0] en FL: life_before = InitialLifePct
                 life_after  = life_before - wearPerLap.FL × stint[0].PlannedLaps
stint[1] en FR: life_before = stint[0].life_after
                 life_after  = life_before - wearPerLap.FR × stint[1].PlannedLaps
```

**Tiempo de servicio por stint:**
```
count_changed = número de ruedas donde assignment[stint] ≠ assignment[stint-1]
service_time = changeTimes[count_changed]
```

**No se calcula tiempo total de carrera** en fase 1 (requiere `avgLapTime`, que está fuera de alcance).

### Ejemplo JSON válido

```json
{
  "schemaVersion": 1,
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "metadata": {
    "name": "Le Mans 24h - Estrategia Principal",
    "simulator": "LMU",
    "vehicle": "Porsche 963",
    "track": "Circuit de la Sarthe",
    "notes": "Estrategia conservadora con 6 pit stops",
    "raceTarget": "laps",
    "totalLaps": 350,
    "totalTimeMin": 0
  },
  "compounds": [
    {
      "id": "cmp-hard",
      "name": "Hard",
      "symbol": "H",
      "color": "#FFFFFF",
      "category": "dry",
      "stockMode": "limited",
      "defaultInitialLifePct": 100,
      "wearPerLap": {"fl": 0.8, "fr": 0.8, "rl": 0.6, "rr": 0.6}
    },
    {
      "id": "cmp-medium",
      "name": "Medium",
      "symbol": "M",
      "color": "#FFD700",
      "category": "dry",
      "stockMode": "limited",
      "defaultInitialLifePct": 100,
      "wearPerLap": {"fl": 1.2, "fr": 1.2, "rl": 1.0, "rr": 1.0}
    },
    {
      "id": "cmp-wet",
      "name": "Wet",
      "symbol": "W",
      "color": "#0066FF",
      "category": "wet",
      "stockMode": "unlimited",
      "defaultInitialLifePct": 100,
      "wearPerLap": {"fl": 1.5, "fr": 1.5, "rl": 1.2, "rr": 1.2}
    }
  ],
  "inventory": [
    {"id": "tyre-001", "compoundId": "cmp-hard",    "displayName": "Hard #1",    "initialLifePct": 100},
    {"id": "tyre-002", "compoundId": "cmp-hard",    "displayName": "Hard #2",    "initialLifePct": 100},
    {"id": "tyre-003", "compoundId": "cmp-hard",    "displayName": "Hard #3",    "initialLifePct": 95},
    {"id": "tyre-004", "compoundId": "cmp-hard",    "displayName": "Hard #4",    "initialLifePct": 100},
    {"id": "tyre-005", "compoundId": "cmp-medium",  "displayName": "Medium #1",  "initialLifePct": 100},
    {"id": "tyre-006", "compoundId": "cmp-medium",  "displayName": "Medium #2",  "initialLifePct": 100},
    {"id": "tyre-007", "compoundId": "cmp-medium",  "displayName": "Medium #3",  "initialLifePct": 100},
    {"id": "tyre-008", "compoundId": "cmp-medium",  "displayName": "Medium #4",  "initialLifePct": 100},
    {"id": "tyre-009", "compoundId": "cmp-wet",     "displayName": "Wet #1",     "initialLifePct": 100},
    {"id": "tyre-010", "compoundId": "cmp-wet",     "displayName": "Wet #2",     "initialLifePct": 100}
  ],
  "stints": [
    {
      "id": "stint-1",
      "plannedLaps": 35,
      "assignments": {"fl": "tyre-001", "fr": "tyre-002", "rl": "tyre-003", "rr": "tyre-004"}
    },
    {
      "id": "stint-2",
      "plannedLaps": 35,
      "assignments": {"fl": "tyre-005", "fr": "tyre-006", "rl": "tyre-007", "rr": "tyre-008"}
    },
    {
      "id": "stint-3",
      "plannedLaps": 35,
      "assignments": {"fl": "tyre-001", "fr": "tyre-002", "rl": "tyre-003", "rr": "tyre-004"}
    }
  ],
  "rules": {
    "maxLimitedTyres": 8,
    "lockTyreToWheelPosition": true,
    "changeTimes": {"one": 4.5, "two": 4.5, "three": 12.0, "four": 12.0}
  },
  "createdAt": "2026-07-10T12:00:00Z",
  "updatedAt": "2026-07-10T12:00:00Z"
}
```

**Notas del ejemplo:**
- 4 neumáticos diferentes por stint (no el mismo en las 4 ruedas)
- Compuestos con `stockMode` explícito
- `InitialLifePct` por neumático (no por posición)
- `WearPerLap` varía por posición
- `PlannedLaps` en cada stint
- `lockTyreToWheelPosition: true` → Hard #1 solo puede estar en FL
- Stint 3 reutiliza Hard #1-4 en la misma posición que stint 1

### API de StrategyService

```go
package app

type StrategyService struct {
    mu  sync.RWMutex
    dir string // Directorio de persistencia
}

// CRUD
func (s *StrategyService) ListStrategies() ([]StrategyEntry, error)
func (s *StrategyService) CreateStrategy(name string) (*strategy.Strategy, error)
func (s *StrategyService) LoadStrategy(id string) (*strategy.Strategy, error)
func (s *StrategyService) SaveStrategy(strat *strategy.Strategy) error
func (s *StrategyService) DeleteStrategy(id string) error
func (s *StrategyService) DuplicateStrategy(id string, newName string) (*strategy.Strategy, error)

// Evaluación
func (s *StrategyService) EvaluateStrategy(strat *strategy.Strategy) *EvaluationResult

// Exportación
func (s *StrategyService) ExportStrategyCSV(id string) (string, error)

type StrategyEntry struct {
    ID        string    `json:"id"`
    Name      string    `json:"name"`
    UpdatedAt time.Time `json:"updatedAt"`
}

type EvaluationResult struct {
    Calculations *StrategyCalculation `json:"calculations"`
    Summary      *StrategySummary      `json:"summary"`
    Issues       []ValidationIssue     `json:"issues"`
    Ready        bool                  `json:"ready"`
}

type StrategyCalculation struct {
    Stints []StintCalculation `json:"stints"`
}

type StintCalculation struct {
    StintID      string             `json:"stintId"`
    Wheels       []WheelCalculation `json:"wheels"`
    ServiceTime  float64            `json:"serviceTime"`
}

type WheelCalculation struct {
    Position   Position `json:"position"`
    TyreID     string   `json:"tyreId"`
    LifeBefore float64  `json:"lifeBefore"`
    LifeAfter  float64  `json:"lifeAfter"`
}

type StrategySummary struct {
    TotalStints       int     `json:"totalStints"`
    TotalPits         int     `json:"totalPits"`
    TotalChangedTyres int     `json:"totalChangedTyres"`
    TotalServiceTime  float64 `json:"totalServiceTime"`
    LimitedTyresUsed  int     `json:"limitedTyresUsed"`
    LimitedTyresMax   int     `json:"limitedTyresMax"`
}

type ValidationIssue struct {
    Code       string `json:"code"`
    Severity   string `json:"severity"` // "error", "warning", "info"
    EntityType string `json:"entityType"` // "strategy", "compound", "tyre", "stint", "assignment", "rule", "calculation"
    EntityID   string `json:"entityId"`
    Field      string `json:"field"`
    Message    string `json:"message"`
    BlocksSave bool   `json:"blocksSave"`
    BlocksReady bool  `json:"blocksReady"`
}
```

**Nota:** React edita el documento localmente vía `useReducer`. Go no expone operaciones por cada clic (AddCompound, AddTyre, etc.). La API solo expone CRUD + Evaluate + Export.

### Catálogo de validaciones

| Código | Severidad | Entidad | Campo | Mensaje | blocksSave | blocksReady |
|--------|-----------|---------|-------|---------|------------|-------------|
| `V001` | error | strategy | id | ID de estrategia duplicado | Sí | Sí |
| `V002` | error | strategy | schemaVersion | Versión de schema desconocida | Sí | Sí |
| `V003` | error | strategy | - | Datos corruptos o no serializables | Sí | Sí |
| `V004` | warning | strategy | name | Nombre de display vacío | No | Sí |
| `V005` | warning | strategy | name | Nombres de display duplicados | No | Sí |
| `V006` | warning | strategy | raceTarget | Objetivo de carrera inválido | No | Sí |
| `V010` | error | compound | id | ID de compuesto duplicado | Sí | Sí |
| `V011` | warning | compound | name | Compuesto sin nombre | No | Sí |
| `V012` | warning | compound | wearPerLap | wearPerLap es 0 en todas las posiciones | No | Sí |
| `V013` | warning | compound | stockMode | stockMode inválido | No | Sí |
| `V014` | warning | compound | defaultInitialLifePct | Vida inicial fuera de rango (0-100) | No | Sí |
| `V015` | error | compound | - | Referencia a compuesto inexistente en eliminación | Sí | Sí |
| `V020` | error | tyre | id | ID de neumático duplicado | Sí | Sí |
| `V021` | warning | tyre | displayName | Neumático sin nombre de display | No | Sí |
| `V022` | warning | tyre | displayName | Nombres de display duplicados | No | Sí |
| `V023` | error | tyre | compoundId | Referencia a compuesto inexistente | Sí | Sí |
| `V024` | error | tyre | initialLifePct | Vida inicial fuera de rango (0-100) | Sí | Sí |
| `V025` | warning | tyre | - | Inventario vacío | No | Sí |
| `V026` | error | tyre | - | Referencia a neumático inexistente en eliminación | Sí | Sí |
| `V030` | error | stint | id | ID de stint duplicado | Sí | Sí |
| `V031` | warning | stint | plannedLaps | Vueltas previstas ≤ 0 | No | Sí |
| `V032` | warning | stint | - | Stint sin asignaciones | No | Sí |
| `V033` | warning | stint | - | Stint con asignaciones incompletas | No | Sí |
| `V040` | error | assignment | - | Asignación a neumático inexistente | Sí | Sí |
| `V041` | error | assignment | - | Mismo neumático en dos posiciones del mismo stint | Sí | Sí |
| `V042` | warning | assignment | - | Neumático en posición diferente a uso anterior (lockTyreToWheelPosition) | No | Sí |
| `V050` | error | rule | maxLimitedTyres | Límite negativo | Sí | Sí |
| `V051` | warning | rule | changeTimes | Todos los tiempos de cambio en 0 | No | No |
| `V060` | warning | calculation | - | Vida restante negativa en algún stint | No | Sí |
| `V061` | warning | calculation | - | Total de vueltas no cubierto por stints | No | Sí |
| `V062` | warning | calculation | - | Stock limitado excedido | No | Sí |

### Datos derivados (no se persisten)

- `UsageCount` (veces usado)
- Vida al inicio/final de cada stint
- Neumáticos usados / agotados
- Número de cambios
- Tiempo total de servicio
- Resumen
- Issues de validación
- Estado ready

Todo se recalcula mediante `EvaluateStrategy`.

### Persistencia

| Campo | Valor |
|-------|-------|
| Directorio | Resuelto por la abstracción de rutas de Vantare (reutilizar `configsDir()` o equivalente) |
| Subdirectorio | `strategies/` |
| Extensión | `.vantare-strategy` |
| Nombre del archivo | `<strategy-id>.vantare-strategy` (UUID, no nombre visible) |
| Sanitización | UUID ya es seguro; no necesita sanitización adicional |
| Escritura atómica | Seguir patrón real de `settings_service.go`: `.tmp` + `os.Rename` |
| Backup | Antes de sobrescribir, renombrar actual a `.bak` |
| Recuperación | Si el archivo principal falla, intentar `.bak` |
| Corrupción | Si JSON inválido, mostrar error y no cargar |
| Listado | `os.ReadDir` + filtro por extensión |
| Duplicado | Copiar archivo + nuevo UUID + renombrar |
| Rename | Solo actualizar nombre dentro del JSON; el archivo mantiene el UUID |
| Delete | `os.Remove` |
| Migración | `migrateStrategy()` con `SchemaVersion` incremental (patrón de `settings_service.go`) |
| SchemaVersion desconocida (> actual) | Rechazar con error explícito |

### Undo/redo y dirty state

```typescript
type StrategyHistory = {
    entries: Strategy[];
    currentIndex: number;
    savedIndex: number;
};

// Dirty state:
const isDirty = currentIndex !== savedIndex;

// Al undo hasta savedIndex:
// isDirty = false (automáticamente limpio)

// Guardar actualiza savedIndex:
// savedIndex = currentIndex
```

**Estado de persistencia** (savedIndex vs currentIndex): Se si la estrategia tiene cambios sin guardar.

**Estado de validación** (issues[]): Se recalcula con `EvaluateStrategy` después de cada cambio. No se persiste.

**Dirty state** (isDirty): Derivado de `currentIndex !== savedIndex`. No es un booleano independiente.

**Operaciones que crean historial:** Todas las mutaciones del documento (UPDATE_METADATA, ADD/UPDATE/REMOVE_*, ASSIGN/UNASSIGN).

**Operaciones que NO crean historial:** SET_STRATEGY (carga), SET_EVALUATION (recálculo).

**Guardar** no borra errores de validación. La validación es un cálculo derivado, no estado de persistencia.

### Frontend: ubicación de StrategyPage

Según el patrón real de `HubApp.tsx` (archivos de página en `frontend/src/hub/pages/`), la ubicación correcta es:

**`frontend/src/hub/pages/StrategyPage.tsx`**

Los componentes internos del planner van en `frontend/src/hub/strategy/`.

### Drag-and-drop

**Decisión: Incluir DnD en fase 1.**

La experiencia de asignar neumáticos a ruedas es central en el planner. Posponer DnD a fase 2 degrada la UX significativamente.

**Dependencia elegida: `@dnd-kit/core` + `@dnd-kit/sortable`**

| Candidato | Compatibilidad React 19 | Estado | Motivo |
|-----------|------------------------|--------|--------|
| `@dnd-kit/core` v2 | ✅ Funciona con React 19 | Activo, mantenimiento regular | Mejor opción: accessible, performante, extensible |
| `react-beautiful-dnd` | ❌ Deprecated por Atlassian | Deprecated | No usar |
| `@hello-pangea/dnd` | ⚠️ Fork, compatibilidad incierta | Comunidad | Alternativa si @dnd-kit falla |
| HTML5 DnD nativo | ✅ Nativo | Limitado | Sin soporte touch, UX pobre |

**Alternativa accesible:** Dropdown por celda como fallback para usuarios que no pueden usar DnD. Soporte de teclado para reordenar stints (flechas arriba/abajo).

### Archivos a crear

| Archivo | Propósito |
|---------|-----------|
| `internal/strategy/strategy.go` | Modelo de dominio |
| `internal/strategy/calculator.go` | Cálculo de desgaste |
| `internal/strategy/calculator_test.go` | Tests |
| `internal/strategy/validator.go` | Validación draft vs ready |
| `internal/strategy/validator_test.go` | Tests |
| `internal/strategy/persistence.go` | Save/load/export |
| `internal/strategy/persistence_test.go` | Tests |
| `internal/app/strategy_service.go` | Wails service |
| `internal/app/strategy_service_test.go` | Tests |
| `frontend/src/hub/pages/StrategyPage.tsx` | Página principal |
| `frontend/src/hub/strategy/strategy-types.ts` | Tipos |
| `frontend/src/hub/strategy/useStrategyState.ts` | Estado con undo/redo |
| `frontend/src/hub/strategy/useStrategyState.test.ts` | Tests |
| `frontend/src/hub/strategy/CompoundsPanel.tsx` | Editor de compuestos |
| `frontend/src/hub/strategy/InventoryPanel.tsx` | Inventario |
| `frontend/src/hub/strategy/StintsTable.tsx` | Tabla de stints con DnD |
| `frontend/src/hub/strategy/StrategySummary.tsx` | Resumen |
| `frontend/src/hub/strategy/StrategyPage.test.tsx` | Tests |
| `docs/strategy-planner-schema.json` | Schema JSON |
| `package.json` (frontend) | Agregar `@dnd-kit/core` y `@dnd-kit/sortable` |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `cmd/vantare/main.go` | Agregar `wailsApp.RegisterService(application.NewService(strategySvc))` |
| `frontend/src/hub/HubApp.tsx` | Agregar `"strategy"` al tipo `Section` y renderizar `StrategyPage` |
| `frontend/package.json` | Agregar dependencias `@dnd-kit/core` y `@dnd-kit/sortable` |

### Archivos que NO deben tocarse

- `internal/engineer/` — completo
- `internal/telemetry/` — completo
- `frontend/src/overlay/` — completo
- `frontend/src/hub/overlays/` — completo
- `pkg/config/profile.go` — completo
- `pkg/models/telemetry.go` — completo
- `supabase/` — completo
- `internal/app/profile_service.go` — completo
- `internal/app/hub_service.go` — completo
- `internal/app/settings_service.go` — completo

### Plan por tareas

| # | Tarea | Dependencia | Estimación |
|---|-------|-------------|------------|
| T0 | Crear rama `feature/tire-strategy` desde `develop` y worktree dedicado | Ninguna | 0.5h |
| T1 | Modelo de dominio (`strategy.go`) | T0 | 2h |
| T2 | Calculadora (`calculator.go` + tests) | T1 | 4h |
| T3 | Validador (`validator.go` + tests) | T1 | 3h |
| T4 | Persistencia (`persistence.go` + tests) | T1 | 3h |
| T5 | StrategyService (`strategy_service.go` + tests) | T2, T3, T4 | 3h |
| T6 | Wiring en `main.go` | T5 | 0.5h |
| T7 | Instalar `@dnd-kit/core` + `@dnd-kit/sortable` | T0 | 0.5h |
| T8 | Tipos TypeScript + hook de estado | T1, T7 | 4h |
| T9 | StrategyPage + CompoundsPanel + InventoryPanel | T8 | 4h |
| T10 | StintsTable con DnD | T8, T7 | 5h |
| T11 | StrategySummary | T2, T8 | 2h |
| T12 | Integración en HubApp | T9 | 0.5h |
| T13 | Tests de integración | Todo | 3h |

**Total estimado:** ~35.5h

### Plan por commits

| # | Commit | Contenido |
|---|--------|-----------|
| 1 | `chore(strategy): create feature branch from develop` | T0 |
| 2 | `feat(strategy): add domain model and calculator` | T1 + T2 |
| 3 | `feat(strategy): add validator and persistence` | T3 + T4 |
| 4 | `feat(strategy): add Wails service and wire into app` | T5 + T6 |
| 5 | `chore(strategy): add @dnd-kit dependencies` | T7 |
| 6 | `feat(strategy): add frontend types and state hook` | T8 |
| 7 | `feat(strategy): add StrategyPage and panels` | T9 + T11 |
| 8 | `feat(strategy): add StintsTable with drag-and-drop` | T10 |
| 9 | `feat(strategy): integrate into Hub navigation` | T12 |

### Criterios de aceptación

1. **Crear estrategia**: El usuario puede crear una estrategia con nombre, compuestos, inventario y stints
2. **Persistencia**: La estrategia se guarda y carga correctamente desde disco (archivo por UUID)
3. **Cálculo**: El desgaste se calcula por vuelta por posición con carrying forward correcto
4. **Validación**: El catálogo de validaciones funciona (draft vs ready)
5. **Undo/redo**: Las operaciones se pueden deshacer y rehacer; dirty state correcto
6. **Compuestos editables**: El usuario puede agregar, editar y eliminar compuestos
7. **Inventario**: El usuario puede agregar y eliminar neumáticos del inventario
8. **DnD**: El usuario puede asignar neumáticos a posiciones mediante drag-and-drop
9. **DnD accesible**: Existe fallback con dropdown para usuarios que no pueden usar DnD
10. **Resumen**: El resumen muestra desgaste, tiempo de servicio y estado de validación
11. **Tests**: Todos los tests pasan (Go + Vitest)

### Riesgos pendientes

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| `@dnd-kit/core` no compatible con React 19 | Baja | Alto | Verificar antes de instalar; fallback a `@hello-pangea/dnd` o HTML5 DnD |
| Cambios en `main.go` durante el desarrollo | Media | Alto | Feature branch, merge frecuente |
| Cambios en `HubApp.tsx` | Media | Medio | Integración minimal |
| Conflicto de directorio `strategies/` | Baja | Medio | Directorio propio, no compartir |
| Schema version incompatible | Baja | Alto | Validar en carga |
| El patrón de rutas de Vantare no es reutilizable | Baja | Medio | Inspeccionar antes de implementar persistencia |

### Grado de confianza

**Alto (85%)**: Modelo, calculadora, validador, persistencia, StrategyService.

**Medio (70%)**: DnD con @dnd-kit (depende de compatibilidad real con React 19), estimación de tiempo.

**Bajo (40%)**: Tests de integración, rendimiento con estrategias grandes.
