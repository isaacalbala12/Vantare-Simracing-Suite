# Launcher Extendido — Apps, Perfiles y Lanzamiento en Cadena

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el launcher actual (solo LMU) en un lanzador de perfiles con apps detectadas, apps manuales, cadenas de lanzamiento con delays configurables, diálogos nativos y un dock dinámico de perfiles.

**Architecture:** Extendemos el paquete `internal/app/launcher/` existente con descubrimiento de apps, registro de apps manuales, perfiles de lanzamiento y ejecución en cadena cancelable. La persistencia sigue en `AppSettings` a través de `SettingsService`. El frontend mantiene el estado local con eventos Wails y reutiliza los estilos v5.2. Los cambios son compatibles con el launcher LMU existente.

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
| Cancelable (F3) | Sí |
| Dock (G1) | Lanzador de presets/perfiles; muestra todos los perfiles dinámicamente |
| Dock + página (G2) | Sí, manteniendo ambos |
| Iconos (M) | Gradientes con abreviatura |
| Scroll en dock (N) | Scroll vertical si hay muchos perfiles |
| Arquitectura Go (O) | Extender `internal/app/launcher/` existente |

---

## Estructura de archivos

### Backend Go

| Archivo | Responsabilidad |
|---------|---------------|
| `internal/app/settings_service.go` | Extender `AppSettings` con `LauncherAppEntry`, `LaunchProfile` y métodos de persistencia |
| `internal/app/launcher/known.go` | Catálogo de apps conocidas |
| `internal/app/launcher/discovery.go` | Matching cross-platform, rutas conocidas, utilidades |
| `internal/app/launcher/discovery_windows.go` | Registro + `libraryfolders.vdf` + búsqueda en disco |
| `internal/app/launcher/discovery_stub.go` | Stub non-windows |
| `internal/app/launcher/apps.go` | Registro de apps detectadas + manuales |
| `internal/app/launcher/profiles.go` | CRUD de perfiles |
| `internal/app/launcher/chain.go` | Cadena con delays, cancelación, diálogo de error |
| `internal/app/launcher/launcher.go` | Servicio orquestador con constructor inyectado |
| `internal/app/launcher/*_test.go` | Tests |
| `cmd/vantare/main.go` | Wiring, eventos Wails, file picker, question dialog |

### Frontend

| Archivo | Responsabilidad |
|---------|---------------|
| `frontend/src/hub/launcher/launcher-state.ts` | Tipos y helpers |
| `frontend/src/hub/components/AppBadge.tsx` | Badge de app |
| `frontend/src/hub/launcher/AppsPanel.tsx` | Panel de apps |
| `frontend/src/hub/launcher/ProfileCard.tsx` | Tarjeta de perfil |
| `frontend/src/hub/launcher/ProfileEditor.tsx` | Editor inline |
| `frontend/src/hub/launcher/ProfilesPanel.tsx` | Lista + errores |
| `frontend/src/hub/pages/LauncherPage.tsx` | Integración real |
| `frontend/src/hub/components/LauncherDock.tsx` | Dock dinámico |
| `frontend/src/lib/wails-runtime-mock.ts` | Mock extendido |

---

## Fase 0: Schema y tipos de persistencia

**Files:**
- Modify: `internal/app/settings_service.go`
- Test: `internal/app/settings_service_test.go`

### Task 0.1: Tipos en `settings_service.go`

- [ ] **Step 1: Añadir tipos debajo de `LauncherConfig`**

```go
// LauncherAppCategory clasifica una app para la UI.
type LauncherAppCategory string

const (
	AppCategorySimulator  LauncherAppCategory = "simulator"
	AppCategoryStreaming  LauncherAppCategory = "streaming"
	AppCategoryAudio      LauncherAppCategory = "audio"
	AppCategoryTelemetry  LauncherAppCategory = "telemetry"
	AppCategoryUtility    LauncherAppCategory = "utility"
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

- [ ] **Step 2: Extender `AppSettings`**

```go
type AppSettings struct {
	DeltaMode              string                        `json:"deltaMode"`
	CpuSampling            bool                          `json:"cpuSampling"`
	Hotkeys                map[string]string             `json:"hotkeys"`
	ActiveOverlayProfileID string                        `json:"activeOverlayProfileId,omitempty"`
	BetaWelcomeCompleted   bool                          `json:"betaWelcomeCompleted,omitempty"`
	BetaUserRole           string                        `json:"betaUserRole,omitempty"`
	Launchers              map[string]LauncherConfig     `json:"launchers,omitempty"`
	LauncherApps           map[string]LauncherAppEntry   `json:"launcherApps,omitempty"`
	LauncherProfiles       []LaunchProfile               `json:"launcherProfiles,omitempty"`
}
```

### Task 0.2: Métodos de persistencia

- [ ] **Step 1: Añadir getters/setters en `SettingsService`**

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

- [ ] **Step 2: Mergear en `Load`**

Después del merge de `Launchers`:

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

### Task 0.3: Tests de persistencia

- [ ] **Step 1: Añadir tests en `internal/app/settings_service_test.go`**

```go
func TestSettingsServicePersistsLauncherApps(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app-settings.json")
	svc := app.NewSettingsService(path, nil)
	_ = svc.Load()
	custom := app.DefaultAppSettings()
	custom.LauncherApps = map[string]app.LauncherAppEntry{
		"lmu": {ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU", Category: app.AppCategorySimulator, LaunchMethod: "steam-uri", SteamAppID: 2399420, Detected: true, GradientFrom: "#ff3b3b", GradientTo: "#9a0606"},
	}
	if err := svc.Save(custom); err != nil { t.Fatalf("save: %v", err) }
	loaded := app.NewSettingsService(path, nil)
	if err := loaded.Load(); err != nil { t.Fatalf("load: %v", err) }
	if len(loaded.Settings().LauncherApps) != 1 { t.Fatalf("expected 1 app, got %d", len(loaded.Settings().LauncherApps)) }
	if loaded.Settings().LauncherApps["lmu"].DisplayName != "Le Mans Ultimate" { t.Errorf("unexpected app name") }
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
```

- [ ] **Step 2: Ejecutar tests**

Run: `go test ./internal/app/... -run TestSettingsServicePersistsLauncher -v`
Expected: PASS

---

## Fase 1: Discovery de apps instaladas

**Objetivo:** Detectar LMU, OBS Studio, CrewChief, Discord, Spotify, MoTeC y SimHub en Windows. Estrategia en tres capas: (1) registro `Uninstall`, (2) `libraryfolders.vdf` de Steam + appmanifest, (3) rutas conocidas.

**Files:**
- Modify: `internal/app/launcher/known.go`
- Create: `internal/app/launcher/discovery.go`
- Create: `internal/app/launcher/discovery_windows.go`
- Create: `internal/app/launcher/discovery_stub.go`
- Test: `internal/app/launcher/discovery_test.go`

### Task 1.1: Catálogo de apps conocidas

- [ ] **Step 1: Reescribir `internal/app/launcher/known.go`**

```go
package launcher

const DefaultLMUAppID uint32 = 2399420

var KnownLaunchMethods = map[string]struct{}{
	"steam-uri":  {},
	"executable": {},
}

// KnownApp describe una app detectable/launchable.
type KnownApp struct {
	ID                  string
	DisplayName         string
	Abbreviation        string
	Category            string
	LaunchMethod        string
	SteamAppID          uint32
	ExecutableNames     []string // candidatos de .exe, ordenados por preferencia
	DisplayNameMatchers []string
	GradientFrom        string
	GradientTo          string
}

var KnownApps = []KnownApp{
	{
		ID: "lmu", DisplayName: "Le Mans Ultimate", Abbreviation: "LMU",
		Category: "simulator", LaunchMethod: "steam-uri", SteamAppID: DefaultLMUAppID,
		DisplayNameMatchers: []string{"le mans ultimate"},
		GradientFrom: "#ff3b3b", GradientTo: "#9a0606",
	},
	{
		ID: "obs", DisplayName: "OBS Studio", Abbreviation: "OBS",
		Category: "streaming", LaunchMethod: "executable",
		ExecutableNames: []string{"obs64.exe", "obs32.exe"},
		DisplayNameMatchers: []string{"obs studio"},
		GradientFrom: "#302e31", GradientTo: "#0a0a0a",
	},
	{
		ID: "crewchief", DisplayName: "CrewChief", Abbreviation: "CC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames: []string{"CrewChiefV4.exe", "CrewChief.exe"},
		DisplayNameMatchers: []string{"crewchief"},
		GradientFrom: "#3b82f6", GradientTo: "#1d4ed8",
	},
	{
		ID: "discord", DisplayName: "Discord", Abbreviation: "DC",
		Category: "utility", LaunchMethod: "executable",
		ExecutableNames: []string{"Discord.exe", "Update.exe"},
		DisplayNameMatchers: []string{"discord"},
		GradientFrom: "#5865F2", GradientTo: "#404EED",
	},
	{
		ID: "spotify", DisplayName: "Spotify", Abbreviation: "Sp",
		Category: "audio", LaunchMethod: "executable",
		ExecutableNames: []string{"Spotify.exe"},
		DisplayNameMatchers: []string{"spotify"},
		GradientFrom: "#10b981", GradientTo: "#059669",
	},
	{
		ID: "motec", DisplayName: "MoTeC", Abbreviation: "MT",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames: []string{"MoTeC.exe"},
		DisplayNameMatchers: []string{"motec"},
		GradientFrom: "#f59e0b", GradientTo: "#b45309",
	},
	{
		ID: "simhub", DisplayName: "SimHub", Abbreviation: "SH",
		Category: "telemetry", LaunchMethod: "executable",
		ExecutableNames: []string{"SimHub.exe"},
		DisplayNameMatchers: []string{"simhub"},
		GradientFrom: "#8b5cf6", GradientTo: "#6d28d9",
	},
}

var KnownAppsByID = map[string]KnownApp{}

func init() {
	for _, a := range KnownApps { KnownAppsByID[a.ID] = a }
}
```

### Task 1.2: Utilidades cross-platform

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

// matchKnownApps recibe candidatos y devuelve entradas detectadas.
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
				Category: known.Category, LaunchMethod: known.LaunchMethod, SteamAppID: known.SteamAppID,
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
```

