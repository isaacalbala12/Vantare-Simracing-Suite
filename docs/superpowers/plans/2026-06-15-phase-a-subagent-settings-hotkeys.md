> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Implement the tasks in this plan and stop. Do NOT proceed to other subagent plans. Do NOT run the release task.

# Subagent Plan — SettingsHotkeysAgent

**Goal:** Add global settings persistence (delta mode, hotkeys, CPU toggle), global Windows hotkeys, and an OBS setup section in the Settings page.

**Context:** This is part of Fase A in `docs/superpowers/plans/2026-06-15-phase-a-lmu-alpha-master.md`. Implement only Tasks 7–8 from the master plan.

**Tech Stack:** Go 1.23 + Wails v3 events (settings + hotkeys); React 19 + TypeScript (Settings UI).

**Definition of done for this subagent:**
1. All steps below are checked off.
2. Go tests pass.
3. Frontend tests pass.
4. Hotkey logic is verified to compile; actual Windows hotkeys must be smoke-tested by Main before release.

---

## Task 7: Settings Service + Settings Page Extensions

**Files:**
- Create: `vantare-v2/internal/app/settings_service.go`
- Create: `vantare-v2/internal/app/settings_service_test.go`
- Create: `vantare-v2/frontend/src/hub/components/ObsSetup.tsx`
- Modify: `vantare-v2/frontend/src/hub/pages/SettingsPage.tsx`
- Modify: `vantare-v2/cmd/vantare/main.go`

- [ ] **Step 1: Define settings model in Go**

```go
package app

type AppSettings struct {
	DeltaMode   string            `json:"deltaMode"`
	CpuSampling bool              `json:"cpuSampling"`
	Hotkeys     map[string]string `json:"hotkeys"`
}

func DefaultAppSettings() *AppSettings {
	return &AppSettings{
		DeltaMode:   "self",
		CpuSampling: true,
		Hotkeys: map[string]string{
			"toggleOverlay": "ctrl+shift+v",
			"nextProfile":   "ctrl+shift+right",
			"prevProfile":   "ctrl+shift+left",
		},
	}
}
```

- [ ] **Step 2: Implement SettingsService**

Persist to `{cfgDir}/app-settings.json`. Events:
- `settings:get` → emit `settings` with current settings.
- `settings:save` → validate, save, emit `settings-saved`.

```go
type SettingsService struct {
	path    string
	settings *AppSettings
	emitter EventEmitter
}

func (s *SettingsService) Load() error { ... }
func (s *SettingsService) Save(settings *AppSettings) error { ... }
```

- [ ] **Step 3: Wire events in main.go**

```go
settingsSvc := app.NewSettingsService(filepath.Join(cfgDir, "app-settings.json"), emitter)
settingsSvc.Load()
emitter.Emit("settings", settingsSvc.Settings())

wailsApp.Event.On("settings:get", func(event *application.CustomEvent) {
	emitter.Emit("settings", settingsSvc.Settings())
})
wailsApp.Event.On("settings:save", func(event *application.CustomEvent) {
	// parse event.Data into AppSettings
	// save and emit settings-saved
})
```

- [ ] **Step 4: Add hotkey validator**

```go
func ValidateHotkeyCombo(combo string) error {
	parts := strings.Split(strings.ToLower(combo), "+")
	if len(parts) < 2 {
		return fmt.Errorf("hotkey must have at least 2 keys")
	}
	// Allow ctrl, alt, shift, win + any alphanumeric key
	return nil
}
```

- [ ] **Step 5: Create ObsSetup.tsx**

```typescript
export function ObsSetup({ url }: { url: string }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  const instructions = `1. Abre OBS.
2. Fuentes → + → Navegador.
3. Pega la URL: ${url}
4. Ancho: 1920, Alto: 1080.`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="..." />
        <button onClick={() => { navigator.clipboard.writeText(url); setCopiedUrl(true); }}>
          {copiedUrl ? "Copiado" : "Copiar URL"}
        </button>
      </div>
      <pre className="text-xs">{instructions}</pre>
      <button onClick={() => { navigator.clipboard.writeText(instructions); setCopiedInstructions(true); }}>
        {copiedInstructions ? "Copiado" : "Copiar instrucciones"}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Extend SettingsPage**

Add sections:
- Delta mode selector (`self`, `session`, `global`).
- Hotkey inputs for `toggleOverlay`, `nextProfile`, `prevProfile`.
- CPU sampling toggle.
- OBS setup section with a configurable overlay URL (separate from the normal overlay URL).

Frontend listens for `settings` event and emits `settings:save`.

- [ ] **Step 7: Write tests**

```go
func TestSettingsServiceLoadSave(t *testing.T) { ... }
func TestValidateHotkeyCombo(t *testing.T) { ... }
```

```typescript
it("renders delta mode selector", () => { ... });
it("copies OBS url to clipboard", () => { ... });
```

- [ ] **Step 8: Run tests and commit**

```bash
cd vantare-v2
go test ./internal/app/...
pnpm --dir frontend test
git add vantare-v2/internal/app/settings_service.go \
        vantare-v2/internal/app/settings_service_test.go \
        vantare-v2/frontend/src/hub/components/ObsSetup.tsx \
        vantare-v2/frontend/src/hub/pages/SettingsPage.tsx \
        vantare-v2/cmd/vantare/main.go
git commit -m "feat(settings): delta mode, hotkeys, cpu toggle, OBS setup"
```

---

## Task 8: Global Windows Hotkeys

**Files:**
- Create: `vantare-v2/internal/app/hotkeys.go`
- Create: `vantare-v2/internal/app/hotkeys_test.go`
- Modify: `vantare-v2/cmd/vantare/main.go`
- Modify: `vantare-v2/internal/app/settings_service.go`

- [ ] **Step 1: Add go-hotkeys dependency**

```bash
cd vantare-v2
go get github.com/micropkg/go-hotkeys
```

- [ ] **Step 2: Implement HotkeyManager**

```go
package app

import "github.com/micropkg/go-hotkeys"

type HotkeyManager struct {
	hk      *hotkeys.Hotkeys
	emitter EventEmitter
	actions map[string]func()
}

func NewHotkeyManager() *HotkeyManager {
	return &HotkeyManager{
		hk:      hotkeys.New(),
		actions: make(map[string]func()),
	}
}

func (m *HotkeyManager) Register(name, combo string, action func()) error {
	// parse combo to hotkeys modifiers + key
	return m.hk.Register(combo, action)
}

func (m *HotkeyManager) UnregisterAll() {
	m.hk.UnregisterAll()
}

func (m *HotkeyManager) Start() error {
	return m.hk.Start()
}

func (m *HotkeyManager) Stop() {
	m.hk.Stop()
}
```

Note: exact API of `go-hotkeys` may differ; read package docs and adapt.

- [ ] **Step 3: Wire default actions in main.go**

```go
hkMgr := app.NewHotkeyManager()

hkMgr.Register(settings.Hotkeys["toggleOverlay"], func() {
	windowMgr.ToggleOverlayVisibility()
})

hkMgr.Register(settings.Hotkeys["nextProfile"], func() {
	if !overlayRunning { return }
	profileSvc.NextProfile()
})

hkMgr.Register(settings.Hotkeys["prevProfile"], func() {
	if !overlayRunning { return }
	profileSvc.PreviousProfile()
})

hkMgr.Start()
defer hkMgr.Stop()
```

Add `NextProfile` / `PreviousProfile` to `ProfileService` if missing.

- [ ] **Step 4: Reload hotkeys on settings change**

In `settings:save` handler, after saving, call:

```go
hkMgr.UnregisterAll()
// re-register with new combos
```

- [ ] **Step 5: Implement profile cycling in ProfileService**

```go
func (s *ProfileService) NextProfile() error { ... }
func (s *ProfileService) PreviousProfile() error { ... }
```

Emit `profile:loaded` with new active profile.

- [ ] **Step 6: Write tests**

```go
func TestParseHotkeyCombo(t *testing.T) { ... }
func TestProfileCycleNext(t *testing.T) { ... }
func TestProfileCyclePrevious(t *testing.T) { ... }
```

- [ ] **Step 7: Run tests and commit**

```bash
cd vantare-v2
go test ./internal/app/...
pnpm --dir frontend test
git add vantare-v2/internal/app/hotkeys.go \
        vantare-v2/internal/app/hotkeys_test.go \
        vantare-v2/internal/app/profile_service.go \
        vantare-v2/cmd/vantare/main.go \
        vantare-v2/internal/app/settings_service.go
git commit -m "feat(hotkeys): global windows shortcuts for overlay and profiles"
```

---

## Final verification

```bash
cd vantare-v2
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
```

Report back which tests pass/fail.
