# Launcher Extendido — Apps, Perfiles y Lanzamiento en Cadena

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el launcher actual (LMU-only) por un lanzador de perfiles con apps detectadas, apps manuales, cadenas de lanzamiento con delays configurables, diálogos nativos y un dock dinámico de perfiles. LMU deja de ser un caso especial y pasa a ser una app más dentro de los perfiles.

**Architecture:** Se elimina el contrato legacy `LauncherConfig`/`Launchers` y se sustituye por `LauncherAppEntry` + `LaunchProfile`. El paquete `internal/app/launcher/` se reescribe con discovery, apps, perfiles y cadena. La persistencia sigue en `AppSettings` vía `SettingsService`. El frontend reemplaza `LauncherCard` y rellena los placeholders "Próximamente" de `LauncherPage`. El dock pasa a ser dinámico (un botón por perfil).

**Tech Stack:** Go 1.25+ · Wails v3 alpha.98 · React 19 + TypeScript + Tailwind v4 · Vitest · `golang.org/x/sys/windows/registry`.

---

## Decisiones de producto cerradas

| Tema | Decisión |
|------|----------|
| Apps a detectar (A1) | LMU, OBS Studio, CrewChief, Discord, Spotify, MoTeC, SimHub |
| Discovery (A2) | Registro de Windows + rutas conocidas + `libraryfolders.vdf` de Steam |
| Versión (A3) | No mostramos versión |
| Apps no detectadas (A4) | No aparecen en el panel; solo la opción "Añadir app manualmente" |
| Panel de recomendaciones (B1) | Solo muestra apps instaladas |
| Orden por defecto (B3) | LMU primero en defaults; arquitectura abierta |
| Presets vs perfiles (C1/H) | Son lo mismo. Dos por defecto: "Creador de Contenido" (LMU, OBS, Spotify) y "Pro" (LMU, CrewChief, Spotify, MoTeC) |
| Editar presets (C2) | Sí; no hay "restaurar defaults" (J) |
| Delay (D1) | 2 segundos por defecto, configurable por step; opción 0s |
| Último uso (D2) | No se persiste |
| Acciones de perfil (D3) | Editar, duplicar, iniciar, eliminar |
| Perfiles por defecto (D4) | Dos al instalar |
| Simulador obligatorio (D5) | No; pueden ser solo apps auxiliares |
| Añadir app manual (E1) | File picker nativo de Wails para `.exe` |
| Lista de apps manuales (E2) | Misma lista, mezcladas con detectadas |
| Errores de arranque (F1) | Notificación simple en el Hub + pregunta nativa (F2) |
| Comportamiento al fallar (F2) | Preguntar con diálogo nativo Wails `QuestionDialog` |
| Cancelable (F3) | Sí, con `context.Context` por cadena (prohibido `time.Sleep`) |
| Dock (G1) | Lanzador de perfiles: un botón por perfil; clic lanza la cadena completa |
| Dock + página (G2) | Sí, manteniendo ambos. Dock = acceso rápido; página = gestión/edición |
| Iconos (M) | Gradientes con abreviatura |
| Scroll en dock (N) | Scroll vertical si hay muchos perfiles |
| Arquitectura Go (O) | Reescribir `internal/app/launcher/` (migración, no extensión) |
| Nombres de perfiles por defecto | "Creador de Contenido" y "Pro"; localizados (i18n) |

---

## Dependencia nueva justificada

**`golang.org/x/sys/windows/registry`** — necesaria para leer `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*` en la fase de discovery. Es la forma estándar, tipada y robusta de acceder al registro desde Go en Windows. Alternativa rechazada: `os/exec` + `reg query` (parseo de texto frágil, sin tipado, propenso a errores de encoding de salida). Riesgo: ninguno (es una lib oficial, sin transitive deps pesadas). El worker debe añadirla con `go get golang.org/x/sys/windows/registry` y el reviewer debe verificar que no se introduce ninguna otra dependencia.

---

## Inventario del estado actual (lo que se sustituye)

Antes de tocar nada, el worker debe entender qué existe hoy y qué se elimina.

### Backend Go — contrato legacy

| Archivo | Qué tiene hoy | Qué pasa tras la migración |
|---------|---------------|---------------------------|
| `internal/app/settings_service.go` | `LauncherConfig` struct (líneas 25-31), `AppSettings.Launchers map[string]LauncherConfig` (línea 19), `GetLaunchers`/`SetLaunchers` (líneas 72-90), merge en `Load` (líneas 128-132) | Se elimina `LauncherConfig`, `Launchers`, `GetLaunchers`, `SetLaunchers` y el merge. Se añade `LauncherAppEntry`, `LaunchStep`, `LaunchProfile` + getters/setters + merge nuevo |
| `internal/app/diagnostics_service.go` | `SanitizedLauncherConfig` (líneas 13-18), `SanitizedAppSettings.Launchers` (línea 29), loop de sanitización (líneas 126-137) | Se elimina `SanitizedLauncherConfig` y su loop. Se añade sanitización de `LauncherApps`/`LauncherProfiles` (paths redacted) |
| `internal/app/diagnostics_service_test.go` | 3 tests usan `Launchers: map[string]LauncherConfig{...}` (líneas 30, 65, 115) | Se reescriben contra el modelo nuevo |
| `internal/app/settings_service_test.go` | Test de `SetLaunchers` (líneas 384-443) | Se reescribe contra `SetLauncherApps`/`SetLauncherProfiles` |
| `internal/app/launcher/launcher.go` | `LauncherConfig = app.LauncherConfig` alias (línea 24), `LauncherStatus`, `Service` con `Configure`/`Launch`/`GetStatus`, `SettingsBackend` interface (líneas 57-59), `lookupConfig`/`persistConfig` | Se elimina todo. Se reescribe como `launcher.go` orquestador con `LaunchProfile` |
| `internal/app/launcher/known.go` | `DefaultLMUAppID`, `KnownSteamAppIDs`, `KnownLaunchMethods` | Se elimina. Se reescribe como catálogo `KnownApps` |
| `internal/app/launcher/launcher_test.go` | `fakeSettings` con `GetLaunchers`/`SetLaunchers`, tests de `Configure`/`Launch`/`GetStatus` | Se elimina. Se reescribe contra el modelo nuevo |
| `cmd/vantare/main.go` | Handlers `handleLauncherStatusGet`/`handleLauncherConfigure`/`handleLauncherLaunch` (líneas 147-201), wiring de eventos (líneas 1001-1027) | Se eliminan los handlers legacy. Se añaden handlers nuevos para apps/perfiles/cadena |
| `cmd/vantare/main_test.go` | `fakeLauncherService` con `Configure`/`Launch` (líneas 506-530), tests de handlers (líneas 560-690) | Se reescriben contra el servicio nuevo |

### Frontend — contrato legacy

| Archivo | Qué tiene hoy | Qué pasa tras la migración |
|---------|---------------|---------------------------|
| `frontend/src/hub/launcher/launcher-state.ts` (50 líneas) | `LauncherView`, `parseLauncherStatus`, `parseConfigured` (contra `settings.launchers`) | Se elimina. Se reescribe contra `launcherApps`/`launcherProfiles` |
| `frontend/src/hub/launcher/launcher-state.test.ts` | Tests de `parseLauncherStatus`/`parseConfigured` | Se reescribe |
| `frontend/src/hub/components/LauncherCard.tsx` (335 líneas) | Configura+lanza LMU, escucha `launcher:status`/`launcher:configure`/`launcher:launch`/`launcher:launched`/`launcher:error` | Se elimina y se sustituye por `AppsPanel` + `ProfilesPanel` |
| `frontend/src/hub/components/LauncherCard.test.tsx` | 11 tests del flujo LMU | Se elimina y se reescribe para los componentes nuevos |
| `frontend/src/hub/pages/LauncherPage.tsx` (75 líneas) | Usa `LauncherCard` + 2 placeholders "Próximamente" disabled | Se reescribe: integra `AppsPanel` + `ProfilesPanel` reales |
| `frontend/src/hub/pages/LauncherPage.test.tsx` | Mockea `LauncherCard`, testea placeholders | Se reescribe |
| `frontend/src/hub/components/LauncherDock.tsx` (82 líneas) | 4 botones fijos (LMU, OBS, +sim disabled, +app disabled) | Se reescribe: botón por perfil dinámico + scroll vertical |
| `frontend/src/hub/components/LauncherDock.test.tsx` | Tests de navegación fija | Se reescribe |
| `frontend/src/hub/pages/DashboardPage.tsx` (línea 218) | Renderiza `<LauncherCard />` | Se sustituye por un widget de lanzamiento rápido contra perfiles (o se elimina y el dock cubre ese rol) |
| `frontend/src/hub/pages/SettingsPage.tsx` (líneas 63-66) | Exporta `LauncherConfig` type para otros componentes | Se elimina el type legacy; se añade `LauncherAppEntry`/`LaunchProfile` |
| `frontend/src/lib/wails-runtime-mock.ts` (líneas 93-100) | Auto-responde `launcher:status:get` con `{ lmu: { configured: false } }` | Se reescribe contra eventos nuevos |

**Total: ~20 archivos afectados** (11 Go, 9 frontend).

---

## Modelo de datos nuevo (contrato cerrado)

```
AppSettings
  ├── LauncherApps    map[string]LauncherAppEntry   // apps detectadas + manuales
  ├── LauncherProfiles []LaunchProfile              // perfiles de lanzamiento
  └── (eliminado: Launchers map[string]LauncherConfig)

LauncherAppEntry
  ├── ID, DisplayName, Abbreviation
  ├── Category (simulator|streaming|audio|telemetry|utility)
  ├── LaunchMethod (steam-uri|executable)
  ├── SteamAppID (solo si steam-uri)
  ├── ExecutablePath, Args (solo si executable)
  ├── Detected bool
  └── GradientFrom, GradientTo

LaunchProfile
  ├── ID, Name, Description
  └── Steps []LaunchStep

LaunchStep
  ├── AppID string   // referencia LauncherAppEntry.ID
  └── Delay int      // segundos antes de lanzar este paso
```

**Relación cerrada**: `LaunchStep.AppID` referencia `LauncherAppEntry.ID`. No hay `LauncherConfig`. LMU es una `LauncherAppEntry` con `Category: "simulator"` y `LaunchMethod: "steam-uri"`.

---

## Contrato de eventos Wails (nuevo, sustituye al legacy)

| Evento (frontend → backend) | Payload | Handler Go |
|------------------------------|---------|------------|
| `launcher:apps:discover` | `{}` | `handleDiscoverApps` |
| `launcher:app:add` | `{ entry: LauncherAppEntry }` | `handleAddApp` |
| `launcher:app:remove` | `{ id: string }` | `handleRemoveApp` |
| `launcher:profiles:list` | `{}` | `handleListProfiles` |
| `launcher:profile:save` | `{ profile: LaunchProfile }` | `handleSaveProfile` |
| `launcher:profile:delete` | `{ id: string }` | `handleDeleteProfile` |
| `launcher:profile:launch` | `{ id: string }` | `handleLaunchProfile` |
| `launcher:profile:cancel` | `{ id: string }` | `handleCancelProfile` |

| Evento (backend → frontend) | Payload | Cuándo |
|------------------------------|---------|--------|
| `launcher:apps:detected` | `{ apps: LauncherAppEntry[] }` | Tras discovery |
| `launcher:apps:updated` | `{ apps: LauncherAppEntry[] }` | Tras add/remove |
| `launcher:profiles:updated` | `{ profiles: LaunchProfile[] }` | Tras save/delete |
| `launcher:chain:step` | `{ profileId, stepIndex, appId, status }` | Cada paso de la cadena |
| `launcher:chain:done` | `{ profileId, success }` | Fin de cadena |
| `launcher:chain:error` | `{ profileId, message, stepIndex }` | Error en un paso |
| `launcher:dialog:question` | `{ title, message, profileId, stepIndex }` | Pedir continuar tras fallo |
| `launcher:error` | `{ message }` | Error genérico |

**Eventos legacy eliminados**: `launcher:status`, `launcher:status:get`, `launcher:configure`, `launcher:configured`, `launcher:launch`, `launcher:launched`.

**Eventos legacy conservados**: `settings` (sigue emitiendo `AppSettings` completo, ahora con `launcherApps`/`launcherProfiles` en vez de `launchers`).

---

## Estructura de archivos

### Backend Go

| Archivo | Responsabilidad | Acción |
|---------|-----------------|--------|
| `internal/app/settings_service.go` | `LauncherAppEntry`, `LaunchStep`, `LaunchProfile`, getters/setters, merge | Modificar (eliminar legacy + añadir nuevo) |
| `internal/app/diagnostics_service.go` | Sanitización de apps/perfiles | Modificar |
| `internal/app/launcher/known.go` | Catálogo `KnownApps` | Reescribir |
| `internal/app/launcher/discovery.go` | Matching cross-platform, utilidades | Crear |
| `internal/app/launcher/discovery_windows.go` | Registro + `libraryfolders.vdf` + rutas conocidas | Crear |
| `internal/app/launcher/discovery_stub.go` | Stub non-windows | Crear |
| `internal/app/launcher/apps.go` | Registro de apps detectadas + manuales | Crear |
| `internal/app/launcher/profiles.go` | CRUD de perfiles | Crear |
| `internal/app/launcher/chain.go` | Cadena con delays, cancelación, diálogo de error | Crear |
| `internal/app/launcher/launcher.go` | Servicio orquestador | Reescribir |
| `internal/app/launcher/*_test.go` | Tests | Reescribir/crear |
| `cmd/vantare/main.go` | Wiring, eventos Wails, file picker, question dialog | Modificar |
| `cmd/vantare/main_test.go` | Tests de wiring | Modificar |

### Frontend

| Archivo | Responsabilidad | Acción |
|---------|-----------------|--------|
| `frontend/src/hub/launcher/launcher-state.ts` | Tipos y helpers | Reescribir |
| `frontend/src/hub/components/AppBadge.tsx` | Badge de app | Crear |
| `frontend/src/hub/launcher/AppsPanel.tsx` | Panel de apps | Crear |
| `frontend/src/hub/launcher/ProfileCard.tsx` | Tarjeta de perfil | Crear |
| `frontend/src/hub/launcher/ProfileEditor.tsx` | Editor inline | Crear |
| `frontend/src/hub/launcher/ProfilesPanel.tsx` | Lista + errores | Crear |
| `frontend/src/hub/pages/LauncherPage.tsx` | Integración real | Reescribir |
| `frontend/src/hub/components/LauncherDock.tsx` | Dock dinámico | Reescribir |
| `frontend/src/hub/components/LauncherCard.tsx` | (eliminado) | Eliminar |
| `frontend/src/lib/wails-runtime-mock.ts` | Mock extendido | Modificar |

---

## Fase 0: Schema, tipos y persistencia (migración)

**Objetivo:** Eliminar el contrato legacy `LauncherConfig`/`Launchers` y establecer el modelo nuevo `LauncherAppEntry`/`LaunchProfile` con persistencia. También crear `types.go` con los símbolos compartidos que las Fases 1-4 necesitan (`fileExists`, `execLauncher`, `Emitter`, errores). Al final de esta fase `internal/app/` compila y los tests de persistencia pasan; el resto del repo NO compila (esperado y aceptado, se restaura en Fases 1-5).

**Files:**
- Modify: `internal/app/settings_service.go`
- Modify: `internal/app/diagnostics_service.go`
- Modify: `internal/app/diagnostics_service_test.go`
- Modify: `internal/app/settings_service_test.go`
- Create: `internal/app/launcher/types.go`
- Test: `internal/app/settings_service_test.go`
### Task 0.0: Crear `internal/app/launcher/types.go` (símbolos compartidos)

Este archivo centraliza los símbolos que las Fases 1-4 (`discovery.go`, `apps.go`, `profiles.go`, `chain.go`) usan. Hoy viven en `launcher.go` (que se elimina en Fase 5). Moverlos aquí **antes** de tocar nada más evita la dependencia circular.

- [ ] **Step 1: Crear `internal/app/launcher/types.go`**

```go
package launcher

import (
	"errors"
	"os"
	"os/exec"
)

// Errores públicos para que callers reaccionen sin parsear mensajes.
var (
	ErrInvalidConfig     = errors.New("launcher: invalid configuration")
	ErrExecutableMissing = errors.New("launcher: executable path does not exist")
	ErrUnsupported       = errors.New("launcher: not supported on this platform")
	ErrAppNotFound       = errors.New("launcher: app not found")
	ErrProfileNotFound   = errors.New("launcher: profile not found")
	ErrProfileDuplicate  = errors.New("launcher: profile id already exists")
	ErrInvalidStep       = errors.New("launcher: invalid step")
)

// execLauncher imita os/exec.Command para tests inyectables.
type execLauncher func(name string, args ...string) *exec.Cmd

// defaultExecLauncher es el launcher de producción. Tests lo swapean vía NewService.
var defaultExecLauncher execLauncher = exec.Command

// Emitter es el sink mínimo de eventos. El *wailsEmitter de main.go lo satisface.
type Emitter interface {
	Emit(name string, data any)
}

// fileExists comprueba si un path existe (no sigue symlinks rotos).
func fileExists(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

// KnownLaunchMethods lista los métodos de lanzamiento aceptados.
var KnownLaunchMethods = map[string]struct{}{
	"steam-uri":  {},
	"executable": {},
}
```

- [ ] **Step 2: No eliminar aún nada de `launcher.go`**

En esta fase `launcher.go` sigue con su contenido legacy (que referencia `LauncherConfig` ya eliminado en `settings_service.go`). **No compila** — esperado. El contenido legacy se elimina en Fase 5. Lo único que importa es que `types.go` compile y los símbolos estén disponibles para Fases 1-4.

**Nota**: cuando la Fase 5 reescriba `launcher.go`, debe **eliminar** las definiciones duplicadas de `fileExists`, `execLauncher`, `defaultExecLauncher`, `Emitter`, `KnownLaunchMethods` y los errores que queden en `launcher.go` legacy, porque ya viven en `types.go`. Mismas rutas de paquete, sin cambios de import.

### Task 0.1: Eliminar `LauncherConfig` y añadir tipos nuevos en `settings_service.go`

- [ ] **Step 1: Eliminar `LauncherConfig` struct y reemplazar con tipos nuevos**

Elimina el bloque `type LauncherConfig struct { ... }` (líneas 22-31) y sustituye por:

```go
// LauncherAppCategory clasifica una app para la UI.
type LauncherAppCategory string

const (
	AppCategorySimulator LauncherAppCategory = "simulator"
	AppCategoryStreaming LauncherAppCategory = "streaming"
	AppCategoryAudio     LauncherAppCategory = "audio"
	AppCategoryTelemetry LauncherAppCategory = "telemetry"
	AppCategoryUtility   LauncherAppCategory = "utility"
)

// LauncherAppEntry representa una app detectada o añadida manualmente.
type LauncherAppEntry struct {
	ID             string              `json:"id"`
	DisplayName    string              `json:"displayName"`
	Abbreviation   string              `json:"abbreviation"`
	Category       LauncherAppCategory `json:"category"`
	LaunchMethod   string              `json:"launchMethod"`
	SteamAppID     uint32              `json:"steamAppId,omitempty"`
	ExecutablePath string              `json:"executablePath,omitempty"`
	Args           string              `json:"args,omitempty"`
	Detected       bool                `json:"detected"`
	GradientFrom   string              `json:"gradientFrom"`
	GradientTo     string              `json:"gradientTo"`
}

// LaunchStep es un paso dentro de un perfil.
type LaunchStep struct {
	AppID string `json:"appId"`
	Delay int    `json:"delay"`
}

// LaunchProfile es un perfil de lanzamiento editable.
type LaunchProfile struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Steps       []LaunchStep `json:"steps"`
}
```

- [ ] **Step 2: Reemplazar `Launchers` en `AppSettings`**

Elimina `Launchers map[string]LauncherConfig` (línea 19) y añade:

```go
LauncherApps     map[string]LauncherAppEntry `json:"launcherApps,omitempty"`
LauncherProfiles []LaunchProfile             `json:"launcherProfiles,omitempty"`
```

- [ ] **Step 3: Eliminar `GetLaunchers`/`SetLaunchers` y añadir getters/setters nuevos**

Elimina las funciones `GetLaunchers` (líneas 72-77) y `SetLaunchers` (líneas 81-92). Añade:

```go
func (s *SettingsService) GetLauncherApps() map[string]LauncherAppEntry {
	if s.settings == nil { return nil }
	return s.settings.LauncherApps
}

func (s *SettingsService) SetLauncherApps(apps map[string]LauncherAppEntry) error {
	if s.settings == nil { s.settings = DefaultAppSettings() }
	s.settings.LauncherApps = make(map[string]LauncherAppEntry, len(apps))
	for k, v := range apps { s.settings.LauncherApps[k] = v }
	return s.Save(s.settings)
}

func (s *SettingsService) GetLauncherProfiles() []LaunchProfile {
	if s.settings == nil { return nil }
	return s.settings.LauncherProfiles
}

func (s *SettingsService) SetLauncherProfiles(profiles []LaunchProfile) error {
	if s.settings == nil { s.settings = DefaultAppSettings() }
	out := make([]LaunchProfile, len(profiles))
	copy(out, profiles)
	s.settings.LauncherProfiles = out
	return s.Save(s.settings)
}
```

- [ ] **Step 4: Reemplazar el merge de `Launchers` en `Load`**
Elimina el bloque `if loaded.Launchers != nil { ... }` (líneas 128-132). Añade:

```go
if loaded.LauncherApps != nil {
	merged.LauncherApps = make(map[string]LauncherAppEntry, len(loaded.LauncherApps))
	for k, v := range loaded.LauncherApps { merged.LauncherApps[k] = v }
}
if loaded.LauncherProfiles != nil {
	merged.LauncherProfiles = make([]LaunchProfile, len(loaded.LauncherProfiles))
	copy(merged.LauncherProfiles, loaded.LauncherProfiles)
}
```

Después del merge, **rellena defaults si están vacíos** (para settings existentes sin los campos nuevos):

```go
if merged.LauncherApps == nil {
	merged.LauncherApps = defaultLauncherApps()
}
if merged.LauncherProfiles == nil {
	merged.LauncherProfiles = defaultLauncherProfiles()
}
```

Así un `app-settings.json` existente (sin `launcherApps`/`launcherProfiles`) recibe los defaults al cargar. Si el usuario ya tiene datos, se respetan.

- [ ] **Step 1: Eliminar `SanitizedLauncherConfig` y su uso**

Elimina `type SanitizedLauncherConfig struct { ... }` (líneas 13-18) y el campo `Launchers map[string]SanitizedLauncherConfig` (línea 29). Elimina el loop de sanitización (líneas 126-137).

- [ ] **Step 2: Añadir sanitización de apps y perfiles**

Añade a `SanitizedAppSettings`:

```go
LauncherApps     map[string]SanitizedLauncherApp     `json:"launcherApps,omitempty"`
LauncherProfiles []SanitizedLauncherProfile          `json:"launcherProfiles,omitempty"`
```

Y los tipos + loop de sanitización (paths redacted, igual que hoy):

```go
type SanitizedLauncherApp struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	Category       string `json:"category"`
	LaunchMethod   string `json:"launchMethod"`
	Detected       bool   `json:"detected"`
	ExecutablePath string `json:"executablePath,omitempty"` // redacted
}

type SanitizedLauncherProfile struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Steps int    `json:"steps"`
}
```

### Task 0.3: Perfiles por defecto en `DefaultAppSettings`

- [ ] **Step 1: Añadir perfiles y apps por defecto**

```go
func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		DeltaMode:   "self",
		CpuSampling: true,
		Hotkeys: map[string]string{
			"toggleOverlay":  "ctrl+shift+v",
			"toggleEditMode": "ctrl+shift+e",
			"nextProfile":    "ctrl+shift+right",
			"prevProfile":    "ctrl+shift+left",
		},
		LauncherApps: defaultLauncherApps(),
		LauncherProfiles: defaultLauncherProfiles(),
	}
}

func defaultLauncherApps() map[string]LauncherAppEntry {
	// LMU detectada por defecto (el discovery la sobreescribe si la encuentra)
	lmu := LauncherAppEntry{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: AppCategorySimulator, LaunchMethod: "steam-uri",
		SteamAppID: 2399420, Detected: true,
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	}
	return map[string]LauncherAppEntry{"lmu": lmu}
}

func defaultLauncherProfiles() []LaunchProfile {
	return []LaunchProfile{
		{
			ID:   "creator",
			Name: "Creador de Contenido",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "obs", Delay: 2},
				{AppID: "spotify", Delay: 2},
			},
		},
		{
			ID:   "pro",
			Name: "Pro",
			Steps: []LaunchStep{
				{AppID: "lmu", Delay: 0},
				{AppID: "crewchief", Delay: 2},
				{AppID: "spotify", Delay: 2},
				{AppID: "motec", Delay: 2},
			},
		},
	}
}
```

**Nota**: estos defaults se inyectan en instalación limpia. En settings existentes con `LauncherApps == nil`, el `Load` los rellena. Si el usuario ya tiene apps/perfiles, se respetan.

### Task 0.4: Tests de persistencia

- [ ] **Step 1: Reescribir tests en `settings_service_test.go`**

Elimina los tests que usan `SetLaunchers`/`Launchers` (líneas 384-443). Añade:

```go
func TestSettingsServicePersistsLauncherApps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"obs": {ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS", Category: app.AppCategoryStreaming, LaunchMethod: "executable", Detected: true, GradientFrom: "#302e31", GradientTo: "#0a0a0a"},
	}
	if err := svc.Save(custom); err != nil { t.Fatalf("save: %v", err) }
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil { t.Fatalf("load: %v", err) }
	if len(loaded.Settings().LauncherApps) != 1 { t.Fatalf("expected 1 app, got %d", len(loaded.Settings().LauncherApps)) }
	if loaded.Settings().LauncherApps["obs"].DisplayName != "OBS Studio" { t.Errorf("unexpected app name") }
}

func TestSettingsServicePersistsLauncherProfiles(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherProfiles = []app.LaunchProfile{
		{ID: "creator", Name: "Creador de Contenido", Steps: []app.LaunchStep{{AppID: "lmu", Delay: 0}, {AppID: "obs", Delay: 2}}},
	}
	if err := svc.Save(custom); err != nil { t.Fatalf("save: %v", err) }
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil { t.Fatalf("load: %v", err) }
	if len(loaded.Settings().LauncherProfiles) != 1 { t.Fatalf("expected 1 profile, got %d", len(loaded.Settings().LauncherProfiles)) }
	if loaded.Settings().LauncherProfiles[0].Steps[1].Delay != 2 { t.Errorf("expected delay 2, got %d", loaded.Settings().LauncherProfiles[0].Steps[1].Delay) }
}

func TestDefaultAppSettingsIncludesDefaultProfiles(t *testing.T) {
	s := app.DefaultAppSettings()
	if len(s.LauncherProfiles) != 2 { t.Fatalf("expected 2 default profiles, got %d", len(s.LauncherProfiles)) }
	if s.LauncherProfiles[0].ID != "creator" { t.Errorf("expected creator, got %s", s.LauncherProfiles[0].ID) }
	if s.LauncherProfiles[1].ID != "pro" { t.Errorf("expected pro, got %s", s.LauncherProfiles[1].ID) }
	if len(s.LauncherApps) != 1 { t.Fatalf("expected 1 default app (lmu), got %d", len(s.LauncherApps)) }
}
```

- [ ] **Step 2: Reescribir tests en `diagnostics_service_test.go`**

Reescribe los 3 tests (líneas 30, 65, 115) para usar `LauncherApps` en vez de `Launchers`. Verifica que el path queda redacted.

### Task 0.5: Compilación (punto de control crítico)

- [ ] **Step 1: La app NO compila en este punto (esperado y aceptado)**

Tras Task 0.1-0.4, `internal/app/launcher/launcher.go`, `cmd/vantare/main.go`, `cmd/vantare/main_test.go` y todo el frontend referencian `LauncherConfig`/`Launchers` eliminados. **Esto es esperado y aceptado.** Fase 0 se commitea con la app rota; las Fases 1-5 la reparan progresivamente. No se exige que cada fase intermedia compile el repo completo, solo su paquete.

- [ ] **Step 2: Verificar que SOLO `internal/app/` compila**

Run: `go build ./internal/app/...`
Expected: OK (settings_service y diagnostics no dependen del paquete launcher)

Run: `go test ./internal/app/... -run TestSettingsService -v`
Expected: PASS (los tests nuevos de persistencia)

**Criterio de aceptación Fase 0:**
- `go build ./internal/app/...` PASS
- `go test ./internal/app/... -run "TestSettingsService|TestDiagnostics"` PASS
- `LauncherConfig`/`Launchers`/`GetLaunchers`/`SetLaunchers` ya no existen en `internal/app/`
- `LauncherAppEntry`/`LaunchProfile`/`LaunchStep` existen y persisten round-trip
- `DefaultAppSettings` incluye 2 perfiles y 1 app (lmu) por defecto
- El resto del repo NO compila todavía (esperado, se restaura en Fases 1-5)

---

## Fase 1: Discovery de apps instaladas

**Objetivo:** Detectar LMU, OBS Studio, CrewChief, Discord, Spotify, MoTeC y SimHub en Windows. Estrategia en tres capas: (1) registro `Uninstall`, (2) `libraryfolders.vdf` de Steam + appmanifest, (3) rutas conocidas. La función es pura, sin efectos secundarios: lee el sistema y devuelve un mapa de `LauncherAppEntry`.

**Files:**
- Reescribir: `internal/app/launcher/known.go`
- Create: `internal/app/launcher/discovery.go`
- Create: `internal/app/launcher/discovery_windows.go`
- Create: `internal/app/launcher/discovery_stub.go`
- Test: `internal/app/launcher/discovery_test.go`

### Task 1.1: Catálogo de apps conocidas (`known.go`)

- [ ] **Step 1: Reescribir `internal/app/launcher/known.go`**

Elimina `DefaultLMUAppID`, `KnownSteamAppIDs`, `KnownLaunchMethods` (ya no se usan tras la migración). Sustituye por:

```go
package launcher

const DefaultLMUSteamAppID uint32 = 2399420

// KnownApp describe una app detectable/launchable.
type KnownApp struct {
	ID                  string
	DisplayName         string
	Abbreviation        string
	Category            string
	LaunchMethod        string
	SteamAppID          uint32
	ExecutableNames     []string // candidatos de .exe, ordenados por preferencia
	DisplayNameMatchers []string // substrings a buscar en DisplayName del registro
	KnownPaths          []string // rutas conocidas absolutas o con %env% a probar
	GradientFrom        string
	GradientTo         string
}

var KnownApps = []KnownApp{
	{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: "simulator", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUSteamAppID,
		DisplayNameMatchers: []string{"le mans ultimate"},
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	},
	{
		ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS",
		Category: "streaming", LaunchMethod: "executable",
		ExecutableNames: []string{"obs64.exe", "obs32.exe"},
		DisplayNameMatchers: []string{"obs studio"},
		KnownPaths: []string{`%PROGRAMFILES%\obs-studio\bin\64bit`, `%PROGRAMFILES(X86)%\obs-studio\bin\64bit`},
		GradientFrom: "#302e31", GradientTo: "#0a0a0a",
	},
	{
		ID: "crewchief", DisplayName: "CrewChief", Abbreviation: "CC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames: []string{"CrewChiefV4.exe", "CrewChief.exe"},
		DisplayNameMatchers: []string{"crewchief"},
		KnownPaths: []string{`%LOCALAPPDATA%\CrewChief`},
		GradientFrom: "#3b82f6", GradientTo: "#1d4ed8",
	},
	{
		ID: "discord", DisplayName: "Discord", Abbreviation: "DC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames: []string{"Discord.exe", "Update.exe"},
		DisplayNameMatchers: []string{"discord"},
		KnownPaths: []string{`%LOCALAPPDATA%\Discord`, `%PROGRAMFILES%\Discord`},
		GradientFrom: "#5865F2", GradientTo: "#404EED",
	},
	{
		ID: "spotify", DisplayName: "Spotify", Abbreviation: "Sp",
		Category: "audio", LaunchMethod: "executable",
		ExecutableNames: []string{"Spotify.exe"},
		DisplayNameMatchers: []string{"spotify"},
		KnownPaths: []string{`%APPDATA%\Spotify`, `%LOCALAPPDATA%\Spotify`},
		GradientFrom: "#10b981", GradientTo: "#059669",
	},
	{
		ID: "motec", DisplayName: "MoTeC", Abbreviation: "MT",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames: []string{"MoTeC.exe"},
		DisplayNameMatchers: []string{"motec"},
		KnownPaths: []string{`%PROGRAMFILES%\MoTeC`},
		GradientFrom: "#f59e0b", GradientTo: "#b45309",
	},
	{
		ID: "simhub", DisplayName: "SimHub", Abbreviation: "SH",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames: []string{"SimHub.exe"},
		DisplayNameMatchers: []string{"simhub"},
		KnownPaths: []string{`%PROGRAMFILES%\SimHub`, `%LOCALAPPDATA%\SimHub`},
		GradientFrom: "#8b5cf6", GradientTo: "#6d28d9",
	},
}

var KnownAppsByID = map[string]KnownApp{}

func init() {
	for _, a := range KnownApps { KnownAppsByID[a.ID] = a }
}
```

### Task 1.2: Utilidades cross-platform (`discovery.go`)

- [ ] **Step 1: Crear `internal/app/launcher/discovery.go`**

```go
package launcher

import (
	"os"
	"path/filepath"
	"strings"
)

// discoveredCandidate es una entrada candidata leída del sistema.
type discoveredCandidate struct {
	DisplayName     string
	InstallLocation string
	Publisher       string
}

// findFirstExisting busca el primer exe existente de la lista bajo basePath.
func findFirstExisting(basePath string, names []string) string {
	for _, name := range names {
		candidate := filepath.Join(basePath, name)
		if fileExists(candidate) { return candidate }
	}
	return ""
}

// findExecutableRecursive busca recursivamente hasta maxDepth un archivo con alguno de los nombres.
func findExecutableRecursive(root string, names []string, maxDepth int) string {
	if root == "" || maxDepth < 0 { return "" }
	entries, err := os.ReadDir(root)
	if err != nil { return "" }
	for _, e := range entries {
		if e.IsDir() && maxDepth > 0 {
			if found := findExecutableRecursive(filepath.Join(root, e.Name()), names, maxDepth-1); found != "" {
				return found
			}
			continue
		}
		name := strings.ToLower(e.Name())
		for _, target := range names {
			if name == strings.ToLower(target) { return filepath.Join(root, e.Name()) }
		}
	}
	return ""
}

// matchKnownApps recibe candidatos del registro/rutas y devuelve entradas detectadas.
func matchKnownApps(candidates []discoveredCandidate) map[string]LauncherAppEntry {
	found := map[string]LauncherAppEntry{}
	for _, c := range candidates {
		nameLower := strings.ToLower(c.DisplayName)
		for _, known := range KnownApps {
			if _, ok := found[known.ID]; ok { continue }
			matched := true
			for _, m := range known.DisplayNameMatchers {
				if !strings.Contains(nameLower, strings.ToLower(m)) { matched = false; break }
			}
			if !matched { continue }
			entry := LauncherAppEntry{
				ID: known.ID, DisplayName: known.DisplayName, Abbreviation: known.Abbreviation,
				Category: LauncherAppCategory(known.Category), LaunchMethod: known.LaunchMethod, SteamAppID: known.SteamAppID,
				Detected: true, GradientFrom: known.GradientFrom, GradientTo: known.GradientTo,
			}
			if known.LaunchMethod == "executable" && c.InstallLocation != "" {
				entry.ExecutablePath = findFirstExisting(c.InstallLocation, known.ExecutableNames)
				if entry.ExecutablePath == "" {
					entry.ExecutablePath = findExecutableRecursive(c.InstallLocation, known.ExecutableNames, 3)
				}
			}
			found[known.ID] = entry
		}
	}
	return found
}

// probeKnownPaths prueba rutas conocidas (expandiendo %env%) para apps no encontradas vía registro.
// Devuelve un mapa NUEVO; no muta el input.
func probeKnownPaths(found map[string]LauncherAppEntry) map[string]LauncherAppEntry {
	out := make(map[string]LauncherAppEntry, len(found))
	for k, v := range found { out[k] = v }
	for _, known := range KnownApps {
		if _, ok := out[known.ID]; ok { continue }
		if known.LaunchMethod != "executable" { continue }
		for _, p := range known.KnownPaths {
			expanded := os.ExpandEnv(p)
			if expanded == "" { continue }
			exe := findFirstExisting(expanded, known.ExecutableNames)
			if exe == "" {
				exe = findExecutableRecursive(expanded, known.ExecutableNames, 2)
			}
			if exe != "" {
				out[known.ID] = LauncherAppEntry{
					ID: known.ID, DisplayName: known.DisplayName, Abbreviation: known.Abbreviation,
					Category: LauncherAppCategory(known.Category), LaunchMethod: known.LaunchMethod,
					ExecutablePath: exe, Detected: true,
					GradientFrom: known.GradientFrom, GradientTo: known.GradientTo,
				}
				break
			}
		}
	}
	return out
}

// Discover detecta apps instaladas. En Windows lee registro + rutas; en otras plataformas devuelve solo apps por defecto.
func Discover() map[string]LauncherAppEntry {
	found := discoverPlatform() // windows.go o stub.go
	found = probeKnownPaths(found)
	// Garantiza que LMU esté siempre presente (steam-uri no necesita exe)
	if _, ok := found["lmu"]; !ok {
		known := KnownAppsByID["lmu"]
		found["lmu"] = LauncherAppEntry{
			ID: known.ID, DisplayName: known.DisplayName, Abbreviation: known.Abbreviation,
			Category: AppCategorySimulator, LaunchMethod: known.LaunchMethod, SteamAppID: known.SteamAppID,
			Detected: false, GradientFrom: known.GradientFrom, GradientTo: known.GradientTo,
		}
	}
	return found
}
```

### Task 1.3: Implementación Windows (`discovery_windows.go`)

- [ ] **Step 1: Crear `internal/app/launcher/discovery_windows.go`**

Lee `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*` y `HKLM\SOFTWARE\WOW6432Node\...` (ambas vistas) usando `golang.org/x/sys/windows/registry`. También lee `libraryfolders.vdf` de Steam para Steam libraries. Devuelve candidatos.

```go
//go:build windows

package launcher

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

func discoverPlatform() map[string]LauncherAppEntry {
	candidates := readUninstallRegistry()
	found := matchKnownApps(candidates)
	// Steam libraryfolders.vdf para apps Steam (LMU ya cubierto, pero refuerza)
	if steamLibs := readSteamLibraryFolders(); len(steamLibs) > 0 {
		for _, lib := range steamLibs {
			// Busca appmanifests para SteamAppID conocidos
			_ = lib // implementación detallada en el worker
		}
	}
	return found
}

func readUninstallRegistry() []discoveredCandidate {
	var out []discoveredCandidate
	// Lee tanto HKLM (machine-wide) como HKCU (per-user).
	// Discord y Spotify suelen instalarse por usuario (HKCU), no por máquina.
	type regRoot struct {
		root registry.Key
		path string
	}
	roots := []regRoot{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`},
	}
	for _, r := range roots {
		k, err := registry.OpenKey(r.root, r.path, registry.READ|registry.WOW64_64KEY)
		if err != nil { continue }
		names, err := k.ReadSubKeyNames(-1)
		k.Close()
		if err != nil { continue }
		for _, name := range names {
			sub, err := registry.OpenKey(r.root, r.path+`\`+name, registry.READ|registry.WOW64_64KEY)
			if err != nil { continue }
			dn, _, _ := sub.GetStringValue("DisplayName")
			loc, _, _ := sub.GetStringValue("InstallLocation")
			sub.Close()
			if dn == "" { continue }
			out = append(out, discoveredCandidate{DisplayName: dn, InstallLocation: loc})
		}
	}
	return out
}

func readSteamLibraryFolders() []string {
	steamPath := os.Getenv("steamPath")
	if steamPath == "" {
		steamPath = filepath.Join(os.Getenv("ProgramFiles(x86)"), "Steam")
	}
	vdf := filepath.Join(steamPath, "steamapps", "libraryfolders.vdf")
	// Parseo simple del vdf: extraer rutas "path" — el worker implementa el parser
	_ = vdf
	return nil // placeholder; el worker lo implementa con strings parsing
}
```

**Nota para el worker**: el parser de `libraryfolders.vdf` es simple (formato texto, no JSON). Extraer líneas con `"path"` y limpiar comillas/`\\`. No añadir un parser VDF completo; solo lo mínimo para obtener rutas de librerías.

### Task 1.4: Stub non-Windows (`discovery_stub.go`)

- [ ] **Step 1: Crear `internal/app/launcher/discovery_stub.go`**

```go
//go:build !windows

package launcher

func discoverPlatform() map[string]LauncherAppEntry {
	return map[string]LauncherAppEntry{}
}
```

### Task 1.5: Tests de discovery (`discovery_test.go`)

- [ ] **Step 1: Crear tests table-driven**

Tests de `matchKnownApps` y `probeKnownPaths` (puros, sin tocar registro real). Tests de `Discover` mockeando `discoverPlatform`.

```go
func TestMatchKnownApps(t *testing.T) {
	tests := []struct {
		name       string
		candidates []discoveredCandidate
		wantIDs    []string
	}{
		{"lmu by display name", []discoveredCandidate{{DisplayName: "Le Mans Ultimate"}}, []string{"lmu"}},
		{"obs by display name", []discoveredCandidate{{DisplayName: "OBS Studio"}}, []string{"obs"}}, // InstallLocation vacío: solo verifica match por nombre, no busca exe
		{"case insensitive", []discoveredCandidate{{DisplayName: "LE MANS ULTIMATE"}}, []string{"lmu"}},
		{"no match", []discoveredCandidate{{DisplayName: "Notepad"}}, []string{}},
		{"multiple", []discoveredCandidate{{DisplayName: "OBS Studio"}, {DisplayName: "Spotify"}}, []string{"obs", "spotify"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchKnownApps(tt.candidates)
			for _, id := range tt.wantIDs {
				if _, ok := got[id]; !ok { t.Errorf("missing %s", id) }
			}
			if len(got) != len(tt.wantIDs) { t.Errorf("got %d, want %d", len(got), len(tt.wantIDs)) }
		})
	}
}
```

- [ ] **Step 2: Test de LMU siempre presente**

```go
func TestDiscoverAlwaysIncludesLMU(t *testing.T) {
	got := Discover()
	if _, ok := got["lmu"]; !ok { t.Fatal("lmu must always be present") }
}
```

- [ ] **Step 3: Ejecutar tests**

Run: `go test ./internal/app/launcher/ -run "TestMatch|TestDiscover" -v`
Expected: PASS

**Criterio de aceptación Fase 1:**
- `known.go` no contiene `KnownSteamAppIDs` ni `KnownLaunchMethods` (eliminados)
- `KnownApps` cataloga las 7 apps con matchers, exe names, known paths y gradientes
- `discovery.go` compila cross-platform (sin imports de Windows en este archivo)
- `discovery_windows.go` tiene `//go:build windows`
- `discovery_stub.go` tiene `//go:build !windows`
- `Discover()` siempre devuelve LMU (aunque `Detected: false`)
- Tests de `matchKnownApps` y `Discover` PASS

---

## Fase 2: Registro de apps (detectadas + manuales)

**Objetivo:** Gestionar el ciclo de vida de apps: fusionar detectadas con manuales, añadir manuales vía file picker, eliminar apps. El servicio `apps.go` es puro (no lanza procesos).

**Files:**
- Create: `internal/app/launcher/apps.go`
- Create: `internal/app/launcher/apps_test.go`

### Task 2.1: Servicio de apps (`apps.go`)

- [ ] **Step 1: Crear `internal/app/launcher/apps.go`**

```go
package launcher

import (
	"fmt"
)

// ErrAppNotFound ya vive en types.go (Fase 0). No redefinir aquí.
// ErrInvalidConfig también vive en types.go.
// AppsBackend es el slice de SettingsService que apps.go necesita.
type AppsBackend interface {
	GetLauncherApps() map[string]LauncherAppEntry
	SetLauncherApps(map[string]LauncherAppEntry) error
}

// MergeAppsWithDiscovered fusiona apps detectadas con las existentes en settings.
// - Apps detectadas sobrescriben las del mismo ID si Detected era true o no existían.
// - Apps manuales existentes se conservan (no se sobrescriben por detectadas).
// - Apps en settings que ya no se detectan y eran Detected=true se eliminan.
func MergeAppsWithDiscovered(existing map[string]LauncherAppEntry, detected map[string]LauncherAppEntry) map[string]LauncherAppEntry {
	merged := make(map[string]LauncherAppEntry, len(existing))
	for k, v := range existing {
		merged[k] = v
	}
	for id, d := range detected {
		ex, ok := merged[id]
		if !ok || ex.Detected {
			merged[id] = d
		}
	}
	// Elimina apps detectadas que ya no están
	for id, ex := range merged {
		if ex.Detected {
			if _, stillThere := detected[id]; !stillThere {
				delete(merged, id)
			}
		}
	}
	return merged
}

// AddManualApp valida y persiste una app manual.
func AddManualApp(backend AppsBackend, entry LauncherAppEntry) error {
	if entry.ID == "" { return fmt.Errorf("%w: id is required", ErrInvalidConfig) }
	if entry.DisplayName == "" { return fmt.Errorf("%w: displayName is required", ErrInvalidConfig) }
	if entry.LaunchMethod == "executable" && entry.ExecutablePath == "" {
		return fmt.Errorf("%w: executablePath is required for executable method", ErrInvalidConfig)
	}
	if _, ok := KnownLaunchMethods[entry.LaunchMethod]; !ok {
		return fmt.Errorf("%w: launchMethod %q", ErrInvalidConfig, entry.LaunchMethod)
	}
	entry.Detected = false
	apps := backend.GetLauncherApps()
	if apps == nil { apps = map[string]LauncherAppEntry{} }
	apps[entry.ID] = entry
	return backend.SetLauncherApps(apps)
}

// RemoveApp elimina una app. No permite eliminar apps referenciadas por perfiles.
func RemoveApp(backend AppsBackend, profiles []LaunchProfile, id string) error {
	for _, p := range profiles {
		for _, s := range p.Steps {
			if s.AppID == id {
				return fmt.Errorf("launcher: app %q is used by profile %q", id, p.Name)
			}
		}
	}
	apps := backend.GetLauncherApps()
	if _, ok := apps[id]; !ok { return ErrAppNotFound }
	delete(apps, id)
	return backend.SetLauncherApps(apps)
}
```

**Nota para el worker**: `KnownLaunchMethods` (usado en `AddManualApp`) y los errores (`ErrInvalidConfig`, `ErrAppNotFound`) ya viven en `types.go` desde la Fase 0. No definirlos aquí.
### Task 2.2: Tests de apps (`apps_test.go`)

- [ ] **Step 1: Tests table-driven de merge**

```go
func TestMergeAppsWithDiscovered(t *testing.T) {
	existing := map[string]LauncherAppEntry{
		"lmu": {ID: "lmu", Detected: true, DisplayName: "Le Mans Ultimate"},
		"custom": {ID: "custom", Detected: false, DisplayName: "My App"},
	}
	detected := map[string]LauncherAppEntry{
		"lmu": {ID: "lmu", Detected: true, DisplayName: "Le Mans Ultimate (updated)"},
		"obs": {ID: "obs", Detected: true, DisplayName: "OBS Studio"},
	}
	merged := MergeAppsWithDiscovered(existing, detected)
	if merged["lmu"].DisplayName != "Le Mans Ultimate (updated)" { t.Error("detected should overwrite existing detected") }
	if _, ok := merged["custom"]; !ok { t.Error("manual app must be preserved") }
	if _, ok := merged["obs"]; !ok { t.Error("new detected app must be added") }
	if _, ok := merged["old"]; ok { t.Error("stale detected app must be removed") }
}
```

- [ ] **Step 2: Tests de AddManualApp y RemoveApp**

Test de add con datos válidos, add con ID vacío (error), add con exe path vacío (error), remove de app usada por perfil (error), remove de app no usada (ok), remove de app inexistente (error).

- [ ] **Step 3: Ejecutar tests**

Run: `go test ./internal/app/launcher/ -run "TestMerge|TestAddManual|TestRemove" -v`
Expected: PASS

**Criterio de aceptación Fase 2:**
- `MergeAppsWithDiscovered` fusiona detectadas + manuales sin perder manuales
- `AddManualApp` valida ID, DisplayName, LaunchMethod, ExecutablePath
- `RemoveApp` bloquea eliminación de apps referenciadas por perfiles
- Tests PASS

---

## Fase 3: CRUD de perfiles

**Objetivo:** Crear, leer, actualizar, duplicar y eliminar perfiles de lanzamiento. El servicio `profiles.go` es puro y valida que los `AppID` referenciados existan.

**Files:**
- Create: `internal/app/launcher/profiles.go`
- Create: `internal/app/launcher/profiles_test.go`

### Task 3.1: Servicio de perfiles (`profiles.go`)

- [ ] **Step 1: Crear `internal/app/launcher/profiles.go`**

```go
package launcher

import (
	"fmt"
)

// Los errores ErrProfileNotFound, ErrProfileDuplicate, ErrInvalidStep viven en types.go.
// No redefinir aquí.

type ProfilesBackend interface {
	GetLauncherProfiles() []LaunchProfile
	SetLauncherProfiles([]LaunchProfile) error
	GetLauncherApps() map[string]LauncherAppEntry
}

// ListProfiles devuelve los perfiles persistidos.
func ListProfiles(backend ProfilesBackend) []LaunchProfile {
	return backend.GetLauncherProfiles()
}

// SaveProfile crea o actualiza un perfil. Valida que cada AppID exista en apps.
// El Delay mínimo es 0; valores negativos se rechazan.
func SaveProfile(backend ProfilesBackend, profile LaunchProfile) error {
	if profile.ID == "" { return fmt.Errorf("%w: id is required", ErrInvalidConfig) }
	if profile.Name == "" { return fmt.Errorf("%w: name is required", ErrInvalidConfig) }
	apps := backend.GetLauncherApps()
	for i, s := range profile.Steps {
		if s.AppID == "" { return fmt.Errorf("%w: step %d missing appId", ErrInvalidStep, i) }
		if _, ok := apps[s.AppID]; !ok {
			return fmt.Errorf("%w: step %d references unknown app %q", ErrInvalidStep, i, s.AppID)
		}
		if s.Delay < 0 { return fmt.Errorf("%w: step %d delay negative", ErrInvalidStep, i) }
	}
	profiles := backend.GetLauncherProfiles()
	idx := -1
	for i, p := range profiles {
		if p.ID == profile.ID { idx = i; break }
	}
	if idx == -1 {
		profiles = append(profiles, profile)
	} else {
		profiles[idx] = profile
	}
	return backend.SetLauncherProfiles(profiles)
}

// DeleteProfile elimina un perfil por ID.
func DeleteProfile(backend ProfilesBackend, id string) error {
	profiles := backend.GetLauncherProfiles()
	idx := -1
	for i, p := range profiles {
		if p.ID == id { idx = i; break }
	}
	if idx == -1 { return ErrProfileNotFound }
	profiles = append(profiles[:idx], profiles[idx+1:]...)
	return backend.SetLauncherProfiles(profiles)
}

// DuplicateProfile duplica un perfil existente con un nuevo ID y nombre.
func DuplicateProfile(backend ProfilesBackend, id, newID, newName string) error {
	profiles := backend.GetLauncherProfiles()
	var src *LaunchProfile
	for i := range profiles {
		if profiles[i].ID == id { src = &profiles[i]; break }
	}
	if src == nil { return ErrProfileNotFound }
	for _, p := range profiles {
		if p.ID == newID { return ErrProfileDuplicate }
	}
	dup := LaunchProfile{
		ID: newID, Name: newName, Description: src.Description,
		Steps: append([]LaunchStep(nil), src.Steps...),
	}
	profiles = append(profiles, dup)
	return backend.SetLauncherProfiles(profiles)
}
```

### Task 3.2: Tests de perfiles (`profiles_test.go`)

- [ ] **Step 1: Tests table-driven**

```go
type fakeProfilesBackend struct {
	apps     map[string]LauncherAppEntry
	profiles []LaunchProfile
}
// ... implementar interface

func TestSaveProfileValidatesAppIDs(t *testing.T) {
	backend := &fakeProfilesBackend{
		apps: map[string]LauncherAppEntry{"lmu": {}},
		profiles: []LaunchProfile{},
	}
	// OK
	err := SaveProfile(backend, LaunchProfile{ID: "p1", Name: "P1", Steps: []LaunchStep{{AppID: "lmu", Delay: 0}}})
	if err != nil { t.Fatalf("expected ok, got %v", err) }
	// AppID inexistente
	err = SaveProfile(backend, LaunchProfile{ID: "p2", Name: "P2", Steps: []LaunchStep{{AppID: "ghost", Delay: 0}}})
	if !errors.Is(err, ErrInvalidStep) { t.Fatalf("expected ErrInvalidStep, got %v", err) }
	// Delay negativo
	err = SaveProfile(backend, LaunchProfile{ID: "p3", Name: "P3", Steps: []LaunchStep{{AppID: "lmu", Delay: -1}}})
	if !errors.Is(err, ErrInvalidStep) { t.Fatalf("expected ErrInvalidStep, got %v", err) }
}

func TestDuplicateProfile(t *testing.T) { /* ... */ }
func TestDeleteProfile(t *testing.T) { /* ... */ }
```

- [ ] **Step 2: Ejecutar tests**

Run: `go test ./internal/app/launcher/ -run "TestSaveProfile|TestDuplicate|TestDelete" -v`
Expected: PASS

**Criterio de aceptación Fase 3:**
- `SaveProfile` valida ID, Name, AppID existentes, Delay >= 0
- `DeleteProfile` elimina por ID
- `DuplicateProfile` copia steps con nuevo ID/nombre
- Tests PASS

---

## Fase 4: Cadena de lanzamiento con delays y cancelación

**Objetivo:** Ejecutar un perfil como secuencia de pasos con delays cancelable. Cada paso lanza una app; entre pasos hay un delay configurable. La cadena es cancelable vía `context.Context`. Los errores se reportan vía eventos y pueden abrir un diálogo nativo Wails `QuestionDialog`.

**Files:**
- Create: `internal/app/launcher/chain.go`
- Create: `internal/app/launcher/chain_test.go`

### Task 4.1: Tipo `ChainRunner` y función `RunChain` (`chain.go`)

- [ ] **Step 1: Crear `internal/app/launcher/chain.go`**

```go
package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/app"
)

// ChainRunner ejecuta un perfil como secuencia de pasos.
type ChainRunner struct {
	apps    func() map[string]LauncherAppEntry // lee apps actuales
	exec    execLauncher                        // inyectable para tests
	emit    Emitter
	mu      sync.Mutex
	active  map[string]context.CancelFunc // profileID -> cancel
}

func NewChainRunner(appsFn func() map[string]LauncherAppEntry, emit Emitter, execFn execLauncher) *ChainRunner {
	if execFn == nil { execFn = defaultExecLauncher }
	return &ChainRunner{
		apps:   appsFn,
		exec:   execFn,
		emit:   emit,
		active: map[string]context.CancelFunc{},
	}
}

// ChainProgress es el payload de los eventos de progreso.
type ChainProgress struct {
	ProfileID  string `json:"profileId"`
	StepIndex  int    `json:"stepIndex"`
	AppID      string `json:"appId"`
	Status     string `json:"status"` // "starting", "started", "skipped", "error", "done"
	Message    string `json:"message,omitempty"`
}

// RunChain ejecuta el perfil. Es bloqueante: espera los delays y los inicios de proceso.
// El caller (handler en main.go) debe invocarla en una goroutine.
// Si un paso falla, emite `launcher:chain:error` y devuelve error.
func (r *ChainRunner) RunChain(ctx context.Context, profile LaunchProfile) error {
	// Copia defensiva: el mapa devuelto por r.apps() puede mutarse concurrentemente
	// (add/remove de apps durante un delay largo). Trabajar sobre un snapshot
	// inmutable evita race conditions en concurrent map access.
	apps := make(map[string]LauncherAppEntry, len(r.apps()))
	for k, v := range r.apps() {
		apps[k] = v
	}
	for i, step := range profile.Steps {
		if err := ctx.Err(); err != nil { return err }

		app, ok := apps[step.AppID]
		if !ok {
			r.emit.Emit("launcher:chain:error", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
				Status: "error", Message: fmt.Sprintf("app %q not found", step.AppID),
			})
			return fmt.Errorf("launcher: app %q not found", step.AppID)
		}

		// Delay antes del paso (excepto el primero, delay 0)
		if step.Delay > 0 && i > 0 {
			r.emit.Emit("launcher:chain:step", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "waiting",
			})
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(step.Delay) * time.Second):
			}
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "starting",
		})

		if err := r.launchApp(app); err != nil {
			r.emit.Emit("launcher:chain:error", ChainProgress{
				ProfileID: profile.ID, StepIndex: i, AppID: step.AppID,
				Status: "error", Message: err.Error(),
			})
			return fmt.Errorf("launcher: step %d (%s): %w", i, step.AppID, err)
		}

		r.emit.Emit("launcher:chain:step", ChainProgress{
			ProfileID: profile.ID, StepIndex: i, AppID: step.AppID, Status: "started",
		})
	}
	r.emit.Emit("launcher:chain:done", ChainProgress{
		ProfileID: profile.ID, Status: "done",
	})
	return nil
}

// launchApp lanza una app según su LaunchMethod. No espera a que la app cierre.
// No recibe ctx: el proceso lanzado no es cancelable desde aquí (el ctx de la cadena
// solo controla los delays entre pasos).
func (r *ChainRunner) launchApp(appEntry LauncherAppEntry) error {
	if runtime.GOOS != "windows" { return ErrUnsupported }
	var cmd *exec.Cmd
	switch appEntry.LaunchMethod {
	case "steam-uri":
		uri := fmt.Sprintf("steam://run/%d", appEntry.SteamAppID)
		cmd = r.exec("rundll32.exe", "url.dll,FileProtocolHandler", uri)
	case "executable":
		if !fileExists(appEntry.ExecutablePath) {
			return fmt.Errorf("%w: %s", ErrExecutableMissing, appEntry.ExecutablePath)
		}
		cmd = r.exec(appEntry.ExecutablePath)
	default:
		return fmt.Errorf("%w: launchMethod %q", ErrInvalidConfig, appEntry.LaunchMethod)
	}
	if cmd == nil { return fmt.Errorf("%w: exec returned nil", ErrInvalidConfig) }
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start failed: %w", err)
	}
	go func(c *exec.Cmd) { _ = c.Wait() }(cmd) // detach
	return nil
}

// StartChain crea un context derivado del parent y lanza RunChain en goroutine.
// Registra el cancel para poder cancelar vía CancelChain.
func (r *ChainRunner) StartChain(parent context.Context, profile LaunchProfile) {
	ctx, cancel := context.WithCancel(parent)
	r.mu.Lock()
	r.active[profile.ID] = cancel
	r.mu.Unlock()
	go func() {
		defer func() {
			r.mu.Lock()
			delete(r.active, profile.ID)
			r.mu.Unlock()
		}()
		_ = r.RunChain(ctx, profile)
	}()
}

// CancelChain cancela la cadena activa de un perfil.
func (r *ChainRunner) CancelChain(profileID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if cancel, ok := r.active[profileID]; ok {
		cancel()
		delete(r.active, profileID)
		return true
	}
	return false
}
```

**Notas para el worker:**
- **Prohibido `time.Sleep`**: usar `select` entre `<-ctx.Done()` y `<-time.After()`.
- **`context.Context` por cadena**: cada `StartChain` crea un context derivado del parent. `CancelChain` lo cancela.
- **Detach**: el proceso lanzado no se espera (`go func(c *exec.Cmd) { _ = c.Wait() }`).
- **Skills Go obligatorias**: `golang-concurrency`, `golang-context`, `golang-error-handling`, `golang-testing`, `golang-safety`.

### Task 4.2: Diálogo nativo de error (integración en main.go, no en chain.go)

El diálogo nativo `QuestionDialog` vive en el layer de Wails (`main.go`), no en `chain.go`. El worker no debe acoplar `chain.go` a Wails. El flujo es:
1. `chain.go` emite `launcher:chain:error` con `{ profileId, message, stepIndex }`.
2. `RunChain` retorna error inmediatamente (la cadena para; no hay "continuar desde el siguiente paso" en esta iteración).
3. `main.go` escucha `launcher:chain:error` y abre `QuestionDialog`: "El paso X falló: <message>. ¿Reintentar el perfil desde el inicio?".
4. Si el usuario dice "sí", `main.go` emite `launcher:profile:launch` con `profileId` (relanza la cadena completa).
5. Si dice "no", no hace nada (la cadena ya terminó).

**Decisión de diseño**: no implementar "continuar desde el siguiente paso" en esta iteración. Es complejo (requiere callback bloqueante en `RunChain` o estado de resumen) y no justifica el coste. Reintentar el perfil completo es más simple y consistente. Si en el futuro se quiere reanudar, se añade un callback `onError` a `RunChain`.

**El wiring concreto de `QuestionDialog` se detalla en Fase 5 Step 5.**

### Task 4.3: Tests de cadena (`chain_test.go`)

- [ ] **Step 1: Tests con exec inyectado**

```go
type stubExec struct {
	calls []string
	err   error
}
func (s *stubExec) Command(name string, args ...string) *exec.Cmd {
	s.calls = append(s.calls, name+" "+strings.Join(args, " "))
	if s.err != nil { return nil }
	// Devuelve un *exec.Cmd real pero con un proceso que no hace nada.
	// Usar exec.Command("cmd", "/c", "exit", "0") en Windows o "true" en Unix,
	// para que Start() no lance un proceso real problemático.
	// Alternativa: ver launcher_test.go existente para el patrón stubExec
	// que usa os/exec.Command con un helper que no bloquea.
	cmd := exec.Command("cmd", "/c", "exit", "0") // Windows; en tests cross-platform usar runtime.GOOS
	if runtime.GOOS != "windows" {
		cmd = exec.Command("true")
	}
	return cmd
}

func TestRunChainExecutesAllSteps(t *testing.T) {
	apps := map[string]LauncherAppEntry{
		"lmu": {ID: "lmu", LaunchMethod: "steam-uri", SteamAppID: 2399420},
		"obs": {ID: "obs", LaunchMethod: "executable", ExecutablePath: "dummy"},
	}
	profile := LaunchProfile{ID: "p1", Steps: []LaunchStep{
		{AppID: "lmu", Delay: 0},
		{AppID: "obs", Delay: 0}, // delay 0 para test rápido
	}}
	exec := &stubExec{}
	spy := &spyEmitter{}
	r := NewChainRunner(func() map[string]LauncherAppEntry { return apps }, spy, exec.Command)
	err := r.RunChain(context.Background(), profile)
	if err != nil { t.Fatalf("expected ok, got %v", err) }
	if len(exec.calls) != 2 { t.Fatalf("expected 2 launches, got %d", len(exec.calls)) }
}

func TestRunChainCancellable(t *testing.T) {
	// delay largo + cancel mid-chain
	ctx, cancel := context.WithCancel(context.Background())
	// ... lanza, cancela, verifica que no ejecuta el segundo paso
}

func TestRunChainErrorOnMissingApp(t *testing.T) {
	profile := LaunchProfile{ID: "p1", Steps: []LaunchStep{{AppID: "ghost", Delay: 0}}}
	// ... verifica error y evento chain:error
}

func TestRunChainErrorOnMissingExecutable(t *testing.T) {
	// app executable con path inexistente → error
}

func TestCancelChain(t *testing.T) {
	// StartChain + CancelChain → verify cancel called
}
```

- [ ] **Step 2: Ejecutar tests**

Run: `go test ./internal/app/launcher/ -run "TestRunChain|TestCancelChain" -v`
Expected: PASS

**Criterio de aceptación Fase 4:**
- `RunChain` ejecuta todos los pasos en orden
- Delays se esperan con `select` + `time.After` (no `time.Sleep`)
- `context.Cancel` cancela la cadena entre pasos
- Error de app faltante/exe faltante emite `launcher:chain:error` y devuelve error
- `CancelChain` cancela una cadena activa
- `StartChain`/`CancelChain` son seguros concurrentemente (sync.Mutex)
- Tests PASS con exec inyectado (no lanza procesos reales)

---

## Fase 5: Servicio orquestador y wiring Wails (restaura compilación)

**Objetivo:** Reescribir `launcher.go` como orquestador que combina apps + perfiles + cadena, y reemplazar el wiring legacy de `main.go` con los handlers nuevos. Al final de esta fase **la app compila y funciona end-to-end por backend** (sin frontend todavía).

**Files:**
- Reescribir: `internal/app/launcher/launcher.go`
- Reescribir: `internal/app/launcher/launcher_test.go`
- Modify: `cmd/vantare/main.go`
- Reescribir: `cmd/vantare/main_test.go` (tests de launcher)

### Task 5.1: Reescribir `launcher.go` como orquestador

- [ ] **Step 1: Reescribir `internal/app/launcher/launcher.go`**

Elimina todo el contenido legacy (`LauncherConfig` alias, `Service`, `Configure`, `Launch`, `GetStatus`, `lookupConfig`, `persistConfig`). Sustituye por un orquestador que delega en `apps.go`, `profiles.go` y `chain.go`:

```go
package launcher

import (
	"context"
	"fmt"

	"github.com/vantare/overlays/v2/internal/app"
)

// Service es el orquestador del launcher. Delega en apps.go, profiles.go y chain.go.
type Service struct {
	settings app.LauncherSettingsBackend // interface definida abajo
	emit     Emitter
	chain    *ChainRunner
}

// LauncherSettingsBackend es el slice de SettingsService que el launcher necesita.
type LauncherSettingsBackend interface {
	GetLauncherApps() map[string]app.LauncherAppEntry
	SetLauncherApps(map[string]app.LauncherAppEntry) error
	GetLauncherProfiles() []app.LaunchProfile
	SetLauncherProfiles([]app.LaunchProfile) error
}

func NewService(settings LauncherSettingsBackend, emit Emitter, execFn execLauncher) *Service {
	if execFn == nil { execFn = defaultExecLauncher }
	s := &Service{
		settings: settings,
		emit:     emit,
	}
	s.chain = NewChainRunner(s.settings.GetLauncherApps, emit, execFn)
	return s
}

// DiscoverApps detecta apps, fusiona con existentes y persiste.
func (s *Service) DiscoverApps() (map[string]app.LauncherAppEntry, error) {
	detected := Discover()
	existing := s.settings.GetLauncherApps()
	merged := MergeAppsWithDiscovered(existing, detected)
	if err := s.settings.SetLauncherApps(merged); err != nil {
		return nil, err
	}
	s.emit.Emit("launcher:apps:detected", map[string]any{"apps": merged})
	return merged, nil
}

// AddManualApp delega en apps.go.
func (s *Service) AddManualApp(entry app.LauncherAppEntry) error {
	return AddManualApp(s.settings, entry)
}

// RemoveApp delega en apps.go.
func (s *Service) RemoveApp(id string) error {
	return RemoveApp(s.settings, s.settings.GetLauncherProfiles(), id)
}

// ListProfiles delega en profiles.go.
func (s *Service) ListProfiles() []app.LaunchProfile {
	return ListProfiles(s.settings)
}

// SaveProfile delega en profiles.go.
func (s *Service) SaveProfile(profile app.LaunchProfile) error {
	return SaveProfile(s.settings, profile)
}

// DeleteProfile delega en profiles.go.
func (s *Service) DeleteProfile(id string) error {
	return DeleteProfile(s.settings, id)
}

// DuplicateProfile delega en profiles.go.
func (s *Service) DuplicateProfile(id, newID, newName string) error {
	return DuplicateProfile(s.settings, id, newID, newName)
}

// LaunchProfile inicia la cadena de un perfil.
func (s *Service) LaunchProfile(ctx context.Context, profileID string) error {
	profiles := s.settings.GetLauncherProfiles()
	var profile *app.LaunchProfile
	for i := range profiles {
		if profiles[i].ID == profileID { profile = &profiles[i]; break }
	}
	if profile == nil {
		return fmt.Errorf("%w: %s", ErrProfileNotFound, profileID)
	}
	s.chain.StartChain(ctx, *profile)
	return nil
}

// CancelChain cancela la cadena activa de un perfil.
func (s *Service) CancelChain(profileID string) bool {
	return s.chain.CancelChain(profileID)
}
```

**Nota para el worker**: `ErrProfileNotFound`, `Emitter`, `execLauncher`, `defaultExecLauncher` ya viven en `types.go` (Fase 0). Los tipos `app.LauncherAppEntry`/`app.LaunchProfile` viven en `internal/app` (Fase 0). Este archivo no debe redefinir ninguno de ellos.
### Task 5.2: Eliminar handlers legacy y añadir handlers nuevos en `main.go`

- [ ] **Step 1: Eliminar handlers legacy**

Elimina `handleLauncherStatusGet`, `handleLauncherConfigure`, `handleLauncherLaunch` (líneas 147-201). Elimina interfaces `launcherStatusGetter`, `launcherConfigurator`, `launcherRunner` (líneas 132-145).

- [ ] **Step 2: Añadir handlers nuevos**

```go
func handleDiscoverApps(svc *launcher.Service, emitter app.EventEmitter) {
	apps, err := svc.DiscoverApps()
	if err != nil {
		logf("launcher:discover error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:detected", map[string]any{"apps": apps})
}

func handleAddApp(entry app.LauncherAppEntry, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.AddManualApp(entry); err != nil {
		logf("launcher:addApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": svc.settings.GetLauncherApps()})
}

func handleRemoveApp(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.RemoveApp(id); err != nil {
		logf("launcher:removeApp error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:apps:updated", map[string]any{"apps": svc.settings.GetLauncherApps()})
}

func handleListProfiles(svc *launcher.Service, emitter app.EventEmitter) {
	profiles := svc.ListProfiles()
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": profiles})
}

func handleSaveProfile(profile app.LaunchProfile, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.SaveProfile(profile); err != nil {
		logf("launcher:saveProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": svc.ListProfiles()})
}

func handleDeleteProfile(id string, svc *launcher.Service, emitter app.EventEmitter) {
	if err := svc.DeleteProfile(id); err != nil {
		logf("launcher:deleteProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
	emitter.Emit("launcher:profiles:updated", map[string]any{"profiles": svc.ListProfiles()})
}

func handleLaunchProfile(id string, svc *launcher.Service, emitter app.EventEmitter, parentCtx context.Context) {
	if err := svc.LaunchProfile(parentCtx, id); err != nil {
		logf("launcher:launchProfile error: %v", err)
		emitter.Emit("launcher:error", map[string]any{"message": err.Error()})
		return
	}
}

func handleCancelProfile(id string, svc *launcher.Service, emitter app.EventEmitter) {
	svc.CancelChain(id)
}
```

- [ ] **Step 3: Reemplazar wiring de eventos**

Elimina los `wailsApp.Event.On` de `launcher:status:get`, `launcher:configure`, `launcher:launch` (líneas 1001-1027). Sustituye por:

```go
wailsApp.Event.On("launcher:apps:discover", func(event *application.CustomEvent) {
	handleDiscoverApps(launcherSvc, emitter)
})
wailsApp.Event.On("launcher:app:add", func(event *application.CustomEvent) {
	var entry app.LauncherAppEntry
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &entry) }
	}
	handleAddApp(entry, launcherSvc, emitter)
})
wailsApp.Event.On("launcher:app:remove", func(event *application.CustomEvent) {
	var payload struct{ ID string `json:"id"` }
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &payload) }
	}
	handleRemoveApp(payload.ID, launcherSvc, emitter)
})
wailsApp.Event.On("launcher:profiles:list", func(event *application.CustomEvent) {
	handleListProfiles(launcherSvc, emitter)
})
wailsApp.Event.On("launcher:profile:save", func(event *application.CustomEvent) {
	var profile app.LaunchProfile
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &profile) }
	}
	handleSaveProfile(profile, launcherSvc, emitter)
})
wailsApp.Event.On("launcher:profile:delete", func(event *application.CustomEvent) {
	var payload struct{ ID string `json:"id"` }
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &payload) }
	}
	handleDeleteProfile(payload.ID, launcherSvc, emitter)
})
wailsApp.Event.On("launcher:profile:launch", func(event *application.CustomEvent) {
	var payload struct{ ID string `json:"id"` }
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &payload) }
	}
	handleLaunchProfile(payload.ID, launcherSvc, emitter, context.Background())
})
wailsApp.Event.On("launcher:profile:cancel", func(event *application.CustomEvent) {
	var payload struct{ ID string `json:"id"` }
	if event.Data != nil {
		if raw, err := json.Marshal(event.Data); err == nil { _ = json.Unmarshal(raw, &payload) }
	}
	handleCancelProfile(payload.ID, launcherSvc, emitter)
})
```

- [ ] **Step 4: File picker para apps manuales**

Añade un handler `launcher:app:pick` que abre el file picker nativo de Wails para `.exe`:

```go
wailsApp.Event.On("launcher:app:pick", func(event *application.CustomEvent) {
	dialog := application.NewFileDialog()
	path, err := dialog.SetTitle("Seleccionar ejecutable").AddFilter("exe", "*.exe").BrowseFiles()
	if err != nil || path == "" { return }
	emitter.Emit("launcher:app:picked", map[string]any{"path": path})
})
```

- [ ] **Step 5: Diálogo de error de cadena**

Añade un handler que escucha `launcher:chain:error` y abre `QuestionDialog`:

```go
wailsApp.Event.On("launcher:chain:error", func(event *application.CustomEvent) {
	// Parse payload: { profileId, message, stepIndex }
	// Abrir QuestionDialog: "El paso X falló: <message>. ¿Reintentar el perfil desde el inicio?"
	// Si sí: emitter.Emit("launcher:profile:launch", map[string]any{"id": profileId}) — relanza la cadena completa.
	// Si no: no hacer nada (la cadena ya terminó con error).
})
```

**Decisión de diseño**: no hay "continuar desde el siguiente paso". El error siempre para la cadena. El diálogo solo ofrece reintentar el perfil completo. Ver Task 4.2 para el rationale.

**Nota para el worker**: la integración exacta de `QuestionDialog` depende de la API de Wails v3 alpha.98. El worker debe consultar la doc de Wails y, si la API no está disponible, dejar el handler con un TODO y emitir `launcher:error` como fallback.

### Task 5.3: Reescribir tests de wiring (`main_test.go`)

- [ ] **Step 1: Eliminar tests legacy**

Elimina `fakeLauncherService`, `TestHandleLauncherConfigure*`, `TestHandleLauncherLaunch*`, `TestLauncherConfigureHandlerReEmitsSettingsOnRejection` (líneas 506-690).

- [ ] **Step 2: Añadir tests nuevos**

Tests de cada handler nuevo con un `fakeLauncherService` que satisface la nueva interfaz `*launcher.Service` (o sus métodos públicos). Verificar eventos emitidos. El patrón es el mismo que los tests legacy pero con los eventos nuevos.

### Task 5.4: Reescribir `launcher_test.go`

- [ ] **Step 1: Eliminar tests legacy**

Elimina `fakeSettings`, todos los `TestConfigure*`, `TestLaunch*`, `TestGetStatus*`.

- [ ] **Step 2: Añadir tests del orquestador**

Tests de `DiscoverApps`, `AddManualApp`, `RemoveApp`, `ListProfiles`, `SaveProfile`, `DeleteProfile`, `LaunchProfile`, `CancelChain` usando un fake backend.

### Task 5.5: Punto de control de compilación

- [ ] **Step 1: Compilar todo**

Run: `go build ./...`
Expected: PASS (toda la app compila)

Run: `go test ./internal/app/... ./cmd/vantare/...`
Expected: PASS

**Criterio de aceptación Fase 5:**
- `go build ./...` PASS
- `go test ./internal/app/... ./cmd/vantare/...` PASS
- No quedan referencias a `LauncherConfig`/`Launchers`/`GetLaunchers`/`SetLaunchers` en el repo
- No quedan referencias a `launcher:status`, `launcher:configure`, `launcher:launch` en Go
- Los handlers nuevos emiten los eventos del contrato nuevo
- El backend funciona end-to-end (discovery → apps → perfiles → cadena) aunque sin UI

---

## Fase 6: Frontend — apps, perfiles, página y dock

**Objetivo:** Reemplazar el frontend legacy del launcher (`LauncherCard`, `launcher-state`, placeholders) por la UI nueva: panel de apps, panel de perfiles con editor inline, página LauncherPage integrada y dock dinámico. Al final la app funciona end-to-end con UI.

**Files:**
- Reescribir: `frontend/src/hub/launcher/launcher-state.ts`
- Reescribir: `frontend/src/hub/launcher/launcher-state.test.ts`
- Eliminar: `frontend/src/hub/components/LauncherCard.tsx`
- Eliminar: `frontend/src/hub/components/LauncherCard.test.tsx`
- Create: `frontend/src/hub/components/AppBadge.tsx`
- Create: `frontend/src/hub/launcher/AppsPanel.tsx`
- Create: `frontend/src/hub/launcher/ProfileCard.tsx`
- Create: `frontend/src/hub/launcher/ProfileEditor.tsx`
- Create: `frontend/src/hub/launcher/ProfilesPanel.tsx`
- Reescribir: `frontend/src/hub/pages/LauncherPage.tsx`
- Reescribir: `frontend/src/hub/pages/LauncherPage.test.tsx`
- Reescribir: `frontend/src/hub/components/LauncherDock.tsx`
- Reescribir: `frontend/src/hub/components/LauncherDock.test.tsx`
- Modify: `frontend/src/hub/pages/DashboardPage.tsx`
- Modify: `frontend/src/hub/pages/SettingsPage.tsx`
- Modify: `frontend/src/lib/wails-runtime-mock.ts`

### Task 6.1: Reescribir `launcher-state.ts` (tipos y helpers)

- [ ] **Step 1: Eliminar `LauncherView`/`parseLauncherStatus`/`parseConfigured`**

Sustituye por tipos y helpers contra el modelo nuevo:

```typescript
import type { AppSettings } from "../pages/SettingsPage";

export type LauncherAppCategory = "simulator" | "streaming" | "audio" | "telemetry" | "utility";

export type LauncherAppEntry = {
  id: string;
  displayName: string;
  abbreviation: string;
  category: LauncherAppCategory;
  launchMethod: "steam-uri" | "executable";
  steamAppId?: number;
  executablePath?: string;
  args?: string;
  detected: boolean;
  gradientFrom: string;
  gradientTo: string;
};

export type LaunchStep = { appId: string; delay: number };

export type LaunchProfile = {
  id: string;
  name: string;
  description?: string;
  steps: LaunchStep[];
};

export type ChainStatus = "waiting" | "starting" | "started" | "error" | "done";

export type ChainProgress = {
  profileId: string;
  stepIndex: number;
  appId: string;
  status: ChainStatus;
  message?: string;
};

// Helpers puros
export function getAppsFromSettings(settings: AppSettings | null | undefined): LauncherAppEntry[] {
  if (!settings?.launcherApps) return [];
  return Object.values(settings.launcherApps).sort(appSortOrder);
}

export function getProfilesFromSettings(settings: AppSettings | null | undefined): LaunchProfile[] {
  return settings?.launcherProfiles ?? [];
}

export function appSortOrder(a: LauncherAppEntry, b: LauncherAppEntry): number {
  // LMU primero, luego por category, luego por displayName
  const catOrder = ["simulator", "streaming", "audio", "telemetry", "utility"];
  if (a.id === "lmu" && b.id !== "lmu") return -1;
  if (b.id === "lmu" && a.id !== "lmu") return 1;
  const ca = catOrder.indexOf(a.category);
  const cb = catOrder.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  return a.displayName.localeCompare(b.displayName);
}

export function isProfileLaunchable(profile: LaunchProfile, apps: LauncherAppEntry[]): boolean {
  const appIds = new Set(apps.map(a => a.id));
  return profile.steps.length > 0 && profile.steps.every(s => appIds.has(s.appId));
}
```

- [ ] **Step 2: Reescribir `launcher-state.test.ts`** con tests de los helpers nuevos.

### Task 6.2: `AppBadge.tsx`

- [ ] **Step 1: Crear `frontend/src/hub/components/AppBadge.tsx`**

Badge de app: icono con gradiente (usando `gradientFrom`/`gradientTo`) + abreviatura + nombre. Props: `app: LauncherAppEntry`, `size?: "sm"|"md"`.

### Task 6.3: `AppsPanel.tsx`

- [ ] **Step 1: Crear `frontend/src/hub/launcher/AppsPanel.tsx`**

Panel que muestra apps detectadas + manuales. Botón "Reescanear" (emite `launcher:apps:discover`). Botón "Añadir app manualmente" (abre file picker → `launcher:app:pick` → recibe `launcher:app:picked` → form de nombre/categoría → `launcher:app:add`). Cada app tiene `AppBadge` + botón eliminar (si no está referenciada por perfiles). Escucha `launcher:apps:detected` y `launcher:apps:updated`.

### Task 6.4: `ProfileCard.tsx` + `ProfileEditor.tsx`

- [ ] **Step 1: Crear `frontend/src/hub/launcher/ProfileCard.tsx`**

Tarjeta de perfil: nombre, descripción, lista de `AppBadge` por step con delay, botones Editar/Duplicar/Iniciar/Eliminar. Estado "lanzando" (spinner), "error" (mensaje), "idle".

- [ ] **Step 2: Crear `frontend/src/hub/launcher/ProfileEditor.tsx`**

Editor inline (expandir, no modal): nombre, descripción, lista de steps (añadir/eliminar/reordenar apps, editar delay por step). Cada step es un selector de app + input de delay. Botones "Guardar" / "Cancelar". Emite `launcher:profile:save`.

### Task 6.5: `ProfilesPanel.tsx`

- [ ] **Step 1: Crear `frontend/src/hub/launcher/ProfilesPanel.tsx`**

Lista de `ProfileCard` + botón "Crear perfil". Muestra errores de cadena (escucha `launcher:chain:error`). Estado de lanzamiento (escucha `launcher:chain:step`/`launcher:chain:done`). Botón "Cancelar" en perfil activo (emite `launcher:profile:cancel`).

### Task 6.6: Reescribir `LauncherPage.tsx`

- [ ] **Step 1: Eliminar `LauncherCard` y placeholders "Próximamente"**

Reescribe `LauncherPage.tsx` para integrar `AppsPanel` + `ProfilesPanel`:

```tsx
import { V52SectionHeader } from "../components/V52SectionHeader";
import { AppsPanel } from "../launcher/AppsPanel";
import { ProfilesPanel } from "../launcher/ProfilesPanel";

export function LauncherPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="opacity-0 animate-fade-in-up">
        <V52SectionHeader
          title="Launcher"
          description="Detecta apps, crea perfiles de lanzamiento y arranca cadenas con un clic."
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 flex flex-col gap-4 opacity-0 animate-fade-in-up delay-100">
          <AppsPanel />
        </section>
        <section className="lg:col-span-2 space-y-3 opacity-0 animate-fade-in-up delay-150">
          <ProfilesPanel />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `LauncherPage.test.tsx`** — elimina el mock de `LauncherCard`, testea que renderiza `AppsPanel` y `ProfilesPanel`.

### Task 6.7: Reescribir `LauncherDock.tsx` (dock dinámico)

- [ ] **Step 1: Reescribir `frontend/src/hub/components/LauncherDock.tsx`**

El dock pasa a ser dinámico y **se auto-suscribe a eventos Wails** (no recibe `profiles` ni `onLaunchProfile` por props). Así `V52Shell.tsx` no cambia su interfaz: sigue pasando solo `onNavigate`.

El dock escucha `settings` (para `launcherProfiles`) y `launcher:profiles:updated`, y emite `launcher:profile:launch` directamente. Mantiene el botón de navegación a la página Launcher. Scroll vertical si hay muchos perfiles.

```tsx
import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import type { LaunchProfile } from "../launcher/launcher-state";

type LauncherDockProps = {
  onNavigate: (section: string) => void;
};

export function LauncherDock({ onNavigate }: LauncherDockProps) {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);

  useEffect(() => {
    // Pide perfiles al montar y escucha solo launcher:profiles:updated.
    // No escuchar "settings" para evitar doble actualización redundante.
    Events.Emit("launcher:profiles:list");
    const offProfiles = Events.On("launcher:profiles:updated", (event: { data?: { profiles?: LaunchProfile[] } }) => {
      setProfiles(event.data?.profiles ?? []);
    });
    return () => { offProfiles(); };
  }, []);

  const handleLaunch = (id: string) => Events.Emit("launcher:profile:launch", { id });

  return (
    <aside className="v52-dock hidden lg:flex flex-col" aria-label="Launcher rápido">
      {/* Botón navegar a página Launcher */}
      <button onClick={() => onNavigate("launcher")} className="v52-dock-item" aria-label="Ir a Launcher">
        <ListIcon />
      </button>
      {/* Botón por perfil (dinámico, scroll vertical) */}
      <div className="overflow-y-auto flex flex-col gap-1">
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => handleLaunch(p.id)}
            title={p.name}
            className="v52-dock-item"
          >
            <ProfileGlyph name={p.name} />
          </button>
        ))}
      </div>
    </aside>
  );
}
```

**Nota para el worker**: `V52Shell.tsx` no se modifica en este corte. El dock sigue recibiendo solo `onNavigate` como hoy; la suscripción a perfiles es interna.

- [ ] **Step 2: Reescribir `LauncherDock.test.tsx`** — testea que renderiza un botón por perfil (mockeando los eventos `settings`/`launcher:profiles:updated`) y emite `launcher:profile:launch` al clic. El test no recibe perfiles por props; los inyecta vía eventos mock.

### Task 6.8: Ajustar `DashboardPage.tsx` y `SettingsPage.tsx`

- [ ] **Step 1: `DashboardPage.tsx`** — elimina `<LauncherCard />` (línea 218) y su import (línea 4) sin sustituirlo por nada. El dock dinámico ya cubre el acceso rápido a perfiles; el dashboard no necesita duplicar el lanzamiento. No renderices nada de launcher en el dashboard.

- [ ] **Step 2: `SettingsPage.tsx`** — elimina el type `LauncherConfig` (líneas 63-66). Añade `LauncherAppEntry`/`LaunchProfile` types re-exportados desde `launcher-state.ts`. El campo `launchers` de `AppSettings` se sustituye por `launcherApps` y `launcherProfiles`.

### Task 6.9: Extender `wails-runtime-mock.ts`

- [ ] **Step 1: Modificar `frontend/src/lib/wails-runtime-mock.ts`**

Elimina el auto-respond de `launcher:status:get` (líneas 93-100). Añade auto-respond para `launcher:apps:discover`, `launcher:profiles:list` con datos mock (apps LMU + perfiles por defecto).

### Task 6.10: Tests frontend

- [ ] **Step 1: Tests por componente**

Tests para: `AppBadge`, `AppsPanel`, `ProfileCard`, `ProfileEditor`, `ProfilesPanel`, `LauncherPage`, `LauncherDock`. Tests de `launcher-state` helpers. Cada componente debe tener tests de render, interacciones (clicks, emits) y estados (error, loading).

Run: `pnpm --dir frontend test`
Expected: PASS (suite completa, sin regresiones)

Run: `pnpm --dir frontend build`
Expected: PASS

Run: `pnpm --dir frontend lint`
Expected: PASS (warnings preexistentes OK)

**Criterio de aceptación Fase 6:**
- `LauncherCard` y `LauncherCard.test.tsx` eliminados
- `launcher-state.ts` no contiene `LauncherView`/`parseLauncherStatus`/`parseConfigured`
- `LauncherPage` renderiza `AppsPanel` + `ProfilesPanel` reales (sin placeholders)
- `LauncherDock` renderiza un botón por perfil dinámico
- `DashboardPage` no usa `LauncherCard`
- `SettingsPage` no exporta `LauncherConfig`
- `wails-runtime-mock` responde eventos nuevos
- Suite frontend completa PASS, build PASS, lint PASS
- Los nombres de perfiles por defecto se muestran localizados vía keys i18n (`launcher.profiles.creator.name`, `launcher.profiles.pro.name`); los defaults Go son en español, el frontend los localiza al renderizar

---

## Apéndice: Prompts por fase

### Prompt worker — Fase 0 (schema/persistencia)

```markdown
Actua como worker disciplinado en el repo `vantare-v2`.

Objetivo: Fase 0 del plan Launcher Extendido. Eliminar el contrato legacy
`LauncherConfig`/`Launchers` y establecer el modelo nuevo `LauncherAppEntry`/
`LaunchProfile` con persistencia. La app NO compila al final (esperado).

Tipo de tarea: refactor + migracion de schema.

Antes de editar:
1. Lee `AGENTS.md`.
2. Lee `docs/superpowers/plans/2026-07-06-launcher-extensive.md` (Fase 0 completa).
3. Lee `docs/architecture.md`.
4. `git status --short` y rama actual.

Alcance:
- Puedes tocar:
  - `internal/app/settings_service.go`
  - `internal/app/diagnostics_service.go`
  - `internal/app/diagnostics_service_test.go`
  - `internal/app/settings_service_test.go`
- No debes tocar:
  - `internal/app/launcher/` (Fase 1+)
  - `cmd/vantare/` (Fase 5)
  - frontend (Fase 6)
  - LayoutStudio, widgets, backend de telemetria, Supabase, access policy

Skills Go obligatorias: `golang-error-handling`, `golang-testing`, `golang-code-style`.

Checks:
- `go build ./internal/app/...` PASS
- `go test ./internal/app/... -run "TestSettingsService|TestDiagnostics"` PASS
- `go test ./internal/app/... -run TestDefaultAppSettings -v` PASS

Respuesta final obligatoria:
- Archivos modificados.
- Que cambio en lenguaje simple.
- Tests ejecutados y resultado.
- Verificacion manual.
```

### Prompt reviewer — Fase 0

```markdown
Actua como reviewer adversarial del repo `vantare-v2`. No edites archivos.

Contexto:
- Lee `AGENTS.md`.
- Lee `docs/superpowers/plans/2026-07-06-launcher-extensive.md` (Fase 0).
- Revisa el diff del worker.

Objetivo: Fase 0 — migracion de schema launcher.

Revisa:
- Se elimino `LauncherConfig`/`Launchers`/`GetLaunchers`/`SetLaunchers` en `internal/app/`.
- `LauncherAppEntry`/`LaunchProfile`/`LaunchStep` existen y persisten round-trip.
- `DefaultAppSettings` incluye 2 perfiles y 1 app (lmu) por defecto.
- `SanitizedLauncherConfig` se elimino y se anadio sanitizacion de apps/perfiles.
- No se toco `internal/app/launcher/` ni `cmd/` ni frontend.
- No se anadio dependencias nuevas (Fase 0 no las necesita).
- Tests de persistencia no son complacientes (verifican round-trip real).
- `go build ./internal/app/...` PASS.

Devuelve: Criticos / Medios / Opcionales / Evidencia / Recomendacion.
```

### Prompt worker — Fases 1-5 (backend completo)

```markdown
Actua como worker disciplinado en el repo `vantare-v2`.

Objetivo: Fases 1-5 del plan Launcher Extendido. Implementar discovery, apps,
perfiles, cadena, orquestador y wiring. Al final `go build ./...` PASS.

Tipo de tarea: feature + refactor.

Antes de editar:
1. Lee `AGENTS.md`.
2. Lee `docs/superpowers/plans/2026-07-06-launcher-extensive.md` (Fases 1-5).
3. `git status --short` y rama actual.

Alcance:
- Puedes tocar:
  - `internal/app/launcher/` (reescribir)
  - `cmd/vantare/main.go`, `cmd/vantare/main_test.go`
- No debes tocar:
  - `internal/app/settings_service.go` (Fase 0 ya hecho)
  - `internal/app/diagnostics_service.go` (Fase 0 ya hecho)
  - frontend (Fase 6)
  - LayoutStudio, widgets, telemetria, Supabase, access policy

Dependencia nueva: `golang.org/x/sys/windows/registry` (justificada en el plan).

Skills Go obligatorias: `golang-error-handling`, `golang-testing`,
`golang-code-style`, `golang-concurrency`, `golang-context`, `golang-safety`.

Reglas criticas:
- Prohibido `time.Sleep` en la cadena. Usar `select` + `time.After`.
- Cada cadena tiene su `context.Context` cancelable.
- `discovery_windows.go` con `//go:build windows`, `discovery_stub.go` con `//go:build !windows`.
- No acoplar `chain.go` a Wails (el dialogo vive en `main.go`).

Checks:
- `go build ./...` PASS
- `go test ./internal/app/... ./cmd/vantare/...` PASS
- No quedan referencias a `LauncherConfig`/`Launchers` en el repo (grep)

Respuesta final obligatoria:
- Archivos creados/modificados.
- Que cambio en lenguaje simple.
- Tests ejecutados y resultado.
- Verificacion manual (como probar la cadena sin UI).
```

### Prompt worker — Fase 6 (frontend)

```markdown
Actua como worker disciplinado en el repo `vantare-v2`.

Objetivo: Fase 6 del plan Launcher Extendido. Reemplazar el frontend legacy
del launcher por la UI nueva: apps, perfiles, pagina y dock.

Tipo de tarea: feature frontend.

Antes de editar:
1. Lee `AGENTS.md`.
2. Lee `docs/superpowers/plans/2026-07-06-launcher-extensive.md` (Fase 6).
3. Lee `docs/widget-architecture.md` (para entender la separacion de superficies).
4. `git status --short` y rama actual.

Alcance:
- Puedes tocar:
  - `frontend/src/hub/launcher/launcher-state.ts` (+ test)
  - `frontend/src/hub/components/AppBadge.tsx` (nuevo)
  - `frontend/src/hub/launcher/AppsPanel.tsx`, `ProfileCard.tsx`, `ProfileEditor.tsx`, `ProfilesPanel.tsx` (nuevos)
  - `frontend/src/hub/pages/LauncherPage.tsx` (+ test)
  - `frontend/src/hub/components/LauncherDock.tsx` (+ test)
  - `frontend/src/hub/pages/DashboardPage.tsx`, `frontend/src/hub/pages/SettingsPage.tsx`
  - `frontend/src/lib/wails-runtime-mock.ts`
- No debes tocar:
  - Backend Go (Fases 0-5 ya hechas)
  - LayoutStudio, widgets, telemetria, Supabase, access policy

Elimina archivos: `LauncherCard.tsx`, `LauncherCard.test.tsx`.

Reglas:
- Reutiliza estilos v5.2 existentes (`v52-dock`, `card-sleek`, etc.).
- No anadir librerias UI.
- `AppBadge` usa gradient con `gradientFrom`/`gradientTo` (CSS inline o Tailwind).
- `ProfileEditor` es inline (expandir), no modal.
- `LauncherDock` renderiza un boton por perfil (dinamico).
- i18n: nombres de perfiles por defecto localizados ("Creador de Contenido" / "Pro").

Checks:
- `pnpm --dir frontend test` PASS
- `pnpm --dir frontend build` PASS
- `pnpm --dir frontend lint` PASS (warnings preexistentes OK)

Respuesta final obligatoria:
- Archivos creados/modificados/eliminados.
- Que cambio en lenguaje simple.
- Tests ejecutados y resultado.
- Verificacion manual (como abrir Launcher y ver perfiles).
```

---

## Orden de ejecucion y dependencias

``+Fase 0 (schema) → Fase 1 (discovery) → Fase 2 (apps) → Fase 3 (perfiles) → Fase 4 (cadena) → Fase 5 (wiring) → Fase 6 (frontend)
+```

Dependencias:
- Fase 0 debe completarse antes que ninguna (define los tipos que todas usan).
- Fases 1-4 pueden ejecutarse en secuencia estricta (cada una usa la anterior).
- Fase 5 restaura la compilacion completa; requiere Fases 0-4.
- Fase 6 requiere Fase 5 (eventos backend operativos).

Cada fase es un microcorte con TDD: tests escritos antes o durante la implementacion, y criterios de aceptacion verificables. El worker de cada fase recibe solo el prompt de su fase y el plan completo como referencia.

---

## Verificacion manual final (para usuario no programador)

Tras completar todas las fases:

1. **Abrir la app**: el dock izquierdo muestra botones de perfiles (no los botones fijos legacy).
2. **Ir a la pagina Launcher**: ve un panel de apps (izquierda) y un panel de perfiles (derecha).
3. **Apps**: pulsar "Reescanear" → aparecen las apps instaladas (LMU, OBS, etc.) con badge de gradiente. "Añadir app manualmente" abre un file picker.
4. **Perfiles**: aparecen "Creador de Contenido" y "Pro" por defecto. Editar un perfil permite añadir/eliminar apps y cambiar delays.
5. **Lanzar perfil**: clic en un perfil (dock o pagina) → lanza la cadena. Se ve progreso por paso. Cancelar para.
6. **Error de app**: si un exe no existe, aparece un dialogo nativo preguntando si continuar.
7. **Settings**: `AppSettings` ya no tiene `launchers`; tiene `launcherApps` y `launcherProfiles`.
8. **Cerrar y reabrir**: apps y perfiles persisten.
9. **Diagnostics**: el pack de diagnostico no muestra `launchers`; muestra `launcherApps` (con path redacted) y `launcherProfiles`.
```