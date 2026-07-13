# Launcher — Spec Técnico

> **Propósito:** Documentación técnica definitiva del feature `launcher`. Cómo funciona, cómo se conecta, cómo está iterado, bugs resueltos y decisiones de diseño.

**Última actualización:** 2026-07-09
**Estado:** Feature completa (cortes 0a–7). Bug `os.ExpandEnv` y `cmd.Dir` resueltos.

---

## 1. Visión general

El launcher es un sistema de perfiles de lanzamiento para simuladores de carreras. Permite al usuario:

1. **Descubrir** apps instaladas automáticamente (registry Windows + paths conocidos)
2. **Crear perfiles** que combinan apps en una cadena secuencial con delays configurables
3. **Lanzar perfiles** con feedback visual en tiempo real (timeline animada)
4. **Hotkeys globales** para lanzar desde cualquier parte del SO
5. **Auto-launch** al iniciar Windows

**Stack:** Go 1.25+ · Wails v3 alpha.98 · React 19 · TypeScript · Tailwind v4 · Motion (Framer v11+)

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                                                          │
│  LauncherPage ─┬─ AppsPanel ─── AddNonSteamGameModal    │
│                ├─ ProfilesPanel ── ProfileCard           │
│                │                    ├─ Timeline          │
│                │                    └─ ProfileEditor     │
│                └─ LauncherDock (sidebar)                 │
│                                                          │
│  ChainRunnerProvider (Context)                           │
│  ├─ createChainStore() → useSyncExternalStore            │
│  ├─ useChainState(profileId)                             │
│  └─ useLastResult(profileId)                             │
│                                                          │
│  Events.On("launcher:chain:step")  ──→ store.handleStep │
│  Events.On("launcher:chain:done")  ──→ store.handleDone │
│  Events.On("launcher:chain:error") ──→ store.handleError│
└──────────────────────┬──────────────────────────────────┘
                       │ Wails Events (bidirectional)
┌──────────────────────┴──────────────────────────────────┐
│                    Backend (Go)                           │
│                                                          │
│  launcher.Service (orchestrator)                         │
│  ├─ DiscoverApps() → Discover() → MergeAppsWithDiscovered│
│  ├─ AddManualApp() / RemoveApp()                        │
│  ├─ ListProfiles() / SaveProfile() / DeleteProfile()    │
│  ├─ LaunchProfile() → ChainRunner.StartChain()           │
│  └─ CancelChain() / CancelAll()                          │
│                                                          │
│  ChainRunner                                            │
│  ├─ runChained() — sequential steps with delays         │
│  ├─ launchAndProbe() — steam-uri or executable          │
│  ├─ livenessProbe() — 3s timeout per process            │
│  ├─ active map — mutex-protected, rejects duplicates    │
│  └─ Telemetry: RecordProfileAttempt/Success (EMA α=0.3)│
│                                                          │
│  Discovery                                               │
│  ├─ discoverPlatform() — registry + Steam VDF           │
│  ├─ probeKnownPaths() — %env% template expansion        │
│  └─ matchKnownApps() — case-insensitive matchers        │
│                                                          │
│  HotkeyManager (Windows only)                            │
│  ├─ RegisterHotKey / UnregisterHotKey (user32.dll)      │
│  └─ ReRegisterAll (after WM_POWERBROADCAST)              │
│                                                          │
│  AutoStart (Windows only)                                │
│  └─ HKCU\...\Run → Vantare.exe --launch=<profileID>    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de datos

### 3.1 Backend Go — `app.LauncherAppEntry`

```go
// internal/app/settings_service.go (shared types)
type LauncherAppEntry struct {
    ID             string              `json:"id"`
    DisplayName    string              `json:"displayName"`
    Abbreviation   string              `json:"abbreviation"`
    Category       LauncherAppCategory `json:"category"`       // simulator|streaming|audio|telemetry|utility
    LaunchMethod   string              `json:"launchMethod"`   // "steam-uri" | "executable"
    SteamAppID     uint32              `json:"steamAppId,omitempty"`
    ExecutablePath string              `json:"executablePath,omitempty"`
    Args           string              `json:"args,omitempty"`
    Detected       bool                `json:"detected"`
    GradientFrom   string              `json:"gradientFrom"`
    GradientTo     string              `json:"gradientTo"`
    IsFavorite     bool                `json:"isFavorite,omitempty"`
}
```

### 3.2 Backend Go — `app.LaunchProfile`

```go
type LaunchProfile struct {
    ID                   string      `json:"id"`
    Name                 string      `json:"name"`
    Description          string      `json:"description,omitempty"`
    Steps                []LaunchStep `json:"steps"`
    IsFavorite           bool        `json:"isFavorite,omitempty"`
    Notes                string      `json:"notes,omitempty"`
    LaunchCount          int         `json:"launchCount,omitempty"`
    LastLaunchedAt       *time.Time  `json:"lastLaunchedAt,omitempty"`
    AvgChainDurationMs   int64       `json:"avgChainDurationMs,omitempty"`
    LaunchOnWindowsStartup bool      `json:"launchOnWindowsStartup,omitempty"`
    Hotkey               string      `json:"hotkey,omitempty"`
}

type LaunchStep struct {
    AppID string `json:"appId"`
    Delay int    `json:"delay"` // seconds between this step and the next
}
```

### 3.3 Frontend TypeScript — `launcher-state.ts`

```typescript
type LauncherAppEntry = {
    id: string;
    displayName: string;
    abbreviation: string;
    category: "simulator" | "streaming" | "audio" | "telemetry" | "utility";
    launchMethod: "steam-uri" | "executable";
    steamAppId?: number;
    executablePath?: string;
    args?: string;
    detected: boolean;
    gradientFrom: string;
    gradientTo: string;
    isFavorite?: boolean;
};

type LaunchProfile = {
    id: string;
    name: string;
    description?: string;
    steps: LaunchStep[];
    isFavorite?: boolean;
    notes?: string;
    launchCount?: number;
    lastLaunchedAt?: string | null;
    avgChainDurationMs?: number;
    launchOnWindowsStartup?: boolean;
    hotkey?: string;
};
```

### 3.4 Frontend — Chain Store types

```typescript
type ChainStepStatus = "pending" | "launching" | "done" | "failed";

type ChainStepState = {
    appId: string;
    status: ChainStepStatus;
    startedAt?: number;
    finishedAt?: number;
    message?: string;
    pid?: number;
};

type ChainState = {
    profileId: string;
    startedAt: number;
    lastEventAt: number;
    steps: ChainStepState[];
    currentStepIndex: number;
    overallStatus: "running" | "done" | "error";
};

type LastResult = "success" | "partial" | "error";
```

### 3.5 Persistencia

- **Archivo:** `app-settings.json` en el directorio de la app
- **Guardado atómico:** write a `.tmp` → rename atómico → backup `.bak` rotativo
- **Retry:** 3 intentos con backoff exponencial
- **Sidecar:** `.failed` file para recovery en el próximo arranque
- **Mutex:** write mutex serializa todos los `Set*` para evitar TOCTOU
- **Tolerancia a fallos:** `Load()` intenta principal → `.bak` → defaults

---

## 4. Discovery de apps

### 4.1 Flujo `Discover()`

```
Discover()
  ├─ discoverPlatform()          // Windows: registry + Steam VDF
  │   ├─ readUninstallEntries()  // var seam (inyectable en tests)
  │   │   ├─ HKLM\...\Uninstall
  │   │   ├─ HKLM\WOW6432Node\...\Uninstall
  │   │   └─ HKCU\...\Uninstall
  │   ├─ parseLibraryFoldersVDF() // Steam library folders
  │   └─ matchKnownApps()        // case-insensitive matchers
  │
  ├─ probeKnownPaths()           // %env% template expansion
  │   ├─ expandWindowsEnv()      // %VAR% + $VAR expansion
  │   ├─ findFirstExisting()     // direct exe lookup
  │   └─ findExecutableRecursive() // recursive up to depth 2
  │
  └─ Ensure LMU always present   // steam-uri, no executable needed
```

### 4.2 Apps conocidas (`known.go`)

| ID | Display Name | Launch Method | Known Paths |
|---|---|---|---|
| `lmu` | Le Mans Ultimate | steam-uri (ID: 2399420) | — |
| `obs` | OBS Studio | executable | `%PROGRAMFILES%\obs-studio\bin\64bit` |
| `crewchief` | CrewChief | executable | `%LOCALAPPDATA%\CrewChief` |
| `discord` | Discord | executable | `%LOCALAPPDATA%\Discord`, `%PROGRAMFILES%\Discord` |
| `spotify` | Spotify | executable | `%APPDATA%\Spotify`, `%LOCALAPPDATA%\Spotify` |
| `motec` | MoTeC | executable | `%PROGRAMFILES%\MoTeC` |
| `simhub` | SimHub | executable | `%PROGRAMFILES%\SimHub`, `%LOCALAPPDATA%\SimHub` |

### 4.3 Filtros del registry (`registry_filter.go`)

6 filtros estilo Steam para ocultar system components:
1. `SystemComponent == 1`
2. `ParentKeyName != ""` (child of another product)
3. `NoRemove == 1` (system-protected)
4. `ReleaseType ∈ {Update, Hotfix, SecurityUpdate, ServicePack}`
5. Publisher blacklist (Microsoft, Google, etc.)
6. Name blacklist (Visual C++, .NET, etc.)

### 4.4 Merge de apps (`apps.go`)

`MergeAppsWithDiscovered()` preserva apps manuales:
- Detected apps sobreescriben solo si la existente era detected
- Apps manuales (`detected=false`) nunca se borran
- Apps detected que ya no aparecen se eliminan

---

## 5. Cadena de lanzamiento

### 5.1 Flujo `ChainRunner`

```
StartChain(ctx, profile)
  ├─ Reject si profileID ya está activo (active map)
  ├─ ctx, cancel = context.WithCancel(parent)
  ├─ active[profileID] = cancel
  └─ go RunChain(ctx, profile)
       ├─ runChained() — ejecuta steps secuencialmente
       │   ├─ Emit "pending" antes del delay
       │   ├─ Delay (skip para step 0)
       │   ├─ launchAndProbe()
       │   │   ├─ steam-uri: rundll32 url.dll,FileProtocolHandler steam://run/<id>
       │   │   └─ executable: exec + cmd.Dir = filepath.Dir(exe)
       │   │       └─ livenessProbe() — 3s timeout
       │   └─ Emit "done" o "failed"
       │
       ├─ RecordProfileAttempt() — siempre
       ├─ RecordProfileSuccess() — solo si allSucceeded
       └─ Emit "chain:done" con success flag
```

### 5.2 Liveness probe

```go
func livenessProbe(cmd *exec.Cmd, timeout time.Duration) livenessResult {
    // Espera hasta 3s a que el proceso termine
    // Si termina → check exit code
    // Si timeout → asume que está corriendo normalmente (timedOut=true)
}
```

**Nota:** `steam-uri` via `rundll32` no es comprobable — se asume success inmediato.

### 5.3 `cmd.Dir` para apps executable

**Bug resuelto:** Apps como OBS necesitan que el working directory sea su propia carpeta para encontrar archivos relativos (locale, config).

```go
cmd := r.exec(entry.ExecutablePath)
cmd.Dir = filepath.Dir(entry.ExecutablePath) // FIX: CWD = carpeta del exe
```

**Causa conocida:** OBS busca `locale/en-US.ini` relativo a su exe.

### 5.4 Telemetría

- **`RecordProfileAttempt`:** incrementa `LaunchCount`, actualiza `LastLaunchedAt`
- **`RecordProfileSuccess`:** actualiza `AvgChainDurationMs` con EMA α=0.3
  - Primera vez: inicializa directo
  - Siguientes: `new = 0.3 * actual + 0.7 * old`
  - Converge al 90% del valor estable en ~7 lanzamientos

### 5.5 Store externo (Frontend)

`createChainStore()` usa `useSyncExternalStore` para suscripción selectiva:

- **`handleStep(ev)`:** aplica transiciones de estado con `VALID_TRANSITIONS`
  - Terminal states (`done`/`failed`) son idempotentes
  - Tolera out-of-order: `pending → done/failed` sin pasar por `launching`
  - Detecta relanzamientos dentro de la ventana de cleanup
- **`handleDone(profileId, success)`:** calcula `lastResult` (success/partial/error)
- **`scheduleCleanup`:** elimina chain state 3s después de completar
- **Watchdog:** cada 5s, si `lastEventAt > 30s` → marca como error

### 5.6 Transiciones de estado

```
pending  → launching → done
pending  → launching → failed
pending  → done      (tolera skip de launching)
pending  → failed    (tolera skip de launching)
launching → done
launching → failed
done     → (terminal, idempotent)
failed   → (terminal, idempotent)
```

---

## 6. Componentes Frontend

### 6.1 Árbol de componentes

```
HubApp
└─ ChainRunnerProvider (Context + Wails event listeners)
   └─ LauncherPage
      ├─ AppsPanel
      │   ├─ AppBadge (icono + nombre)
      │   ├─ AddNonSteamGameModal (single-select, cap 200)
      │   └─ Panel de detalles (path + args editables)
      │
      └─ ProfilesPanel
         └─ ProfileCard
            ├─ Normal: nombre, steps, telemetría, acciones
            └─ Chain active: ProfileCardTimeline (early return)

LauncherDock (sidebar, fuera de LauncherPage)
├─ useChainState() — ring animado por perfil
├─ useLastResult() — badge verde/rojo/ámbar
└─ Tooltip con resultado + nombre de app fallida
```

### 6.2 ProfileCard

- **Normal:** muestra nombre, descripción, steps con AppBadge, tiempo estimado, telemetría, acciones (editar/duplicar/eliminar)
- **Chain active:** early return a `ProfileCardTimeline` (no muestra card normal)
- **lastResult badge:** punto de color (verde=success, rojo=error, ámbar=partial)

### 6.3 ProfileCardTimeline

- Bloques horizontales con Motion (fade in/out)
- Colores por categoría: simulator=#ff3b3b, streaming=#302e31, audio=#06b6d4, telemetry=#f59e0b, utility=#3b82f6
- Pulse animation en step `launching` (opacity 0.7→1→0.7, 1.5s)
- Botón "Cancelar" fijo arriba a la derecha
- `role="status"` + `aria-live="polite"` para accesibilidad

### 6.4 HubToast

- Fallback de notificaciones nativas de Windows
- Slide-in desde top-right con Motion (0.3s, ease `[0.16, 1, 0.3, 1]`)
- 3 variantes: success (verde), partial (ámbar), error (rojo)
- Auto-dismiss 8s
- Botón "Reintentar fallidos" para partial/error

### 6.5 AddNonSteamGameModal

- Modal con portal, búsqueda (pre-lowercase), cap 200
- Botón "Browse" para file picker
- Single-select con AppBadge icons
- Colores Vantare explícitos (`#C1121F` en vez de `bg-accent`)

### 6.6 ProfileEditor (side-panel)

- Drawer lateral con Motion
- Campos: name, description, notes, steps editor, hotkey input, autostart toggle
- Steps editor: drag para reordenar (↑/↓), delay configurable

---

## 7. Hotkeys globales (`hotkey_windows.go`)

### 7.1 Registro

```go
// Parse: "ctrl+shift+1" → MOD_CONTROL | MOD_SHIFT, VK '1'
// Register via user32.dll!RegisterHotKey(hwnd=0, id, modifiers, vk)
```

### 7.2 HotkeyManager

- `Register(profileID, combo)` — registra hotkey, idempotent
- `Unregister(profileID)` — remueve hotkey
- `ReRegisterAll()` — re-registra todas después de `WM_POWERBROADCAST`

### 7.3 Combos reservados

```go
var reservedCombos = map[string]bool{
    "ctrl+c": true, "ctrl+v": true, "ctrl+x": true, "ctrl+z": true,
    "alt+f4": true, "alt+tab": true, "win+l": true,
}
```

---

## 8. Auto-launch (`autostart_windows.go`)

```go
// RegisterAutostart(profileID)
// → HKCU\Software\Microsoft\Windows\CurrentVersion\Run
// → "Vantare.<profileID>" = '"<exe>" --launch=<profileID>'

// ParseLaunchFlag(args)
// → extrae --launch=<id> de os.Args
```

**Flujo:**
1. Al inicio, `main.go` llama `ParseLaunchFlag(os.Args)`
2. Si hay flag, busca el perfil y lo lanza automáticamente
3. Si el perfil no existe o el JSON está corrupto, exit silencioso (no crash)

---

## 9. Eventos Wails

### 9.1 Backend → Frontend

| Evento | Payload | Cuando |
|---|---|---|
| `launcher:apps:detected` | `{apps: LauncherAppEntry[]}` | Después de discovery |
| `launcher:apps:updated` | `{apps: LauncherAppEntry[]}` | Después de add/remove/update |
| `launcher:profiles:updated` | `{profiles: LaunchProfile[]}` | Después de save/delete/duplicate |
| `launcher:chain:step` | `ChainProgress` | Cada cambio de estado en la cadena |
| `launcher:chain:done` | `{profileId, success}` | Cadena completada |
| `launcher:chain:error` | `ChainProgress` | Error (doble lanzamiento, etc.) |
| `launcher:registry:listed` | `{apps: RegistryApp[]}` | Listado del registry para modal |

### 9.2 Frontend → Backend

| Evento | Payload | Acción |
|---|---|---|
| `launcher:apps:discover` | — | Trigger discovery |
| `launcher:app:add` | `LauncherAppEntry` | Añadir app manual |
| `launcher:app:remove` | `{id}` | Eliminar app |
| `launcher:app:update` | `{id, args}` | Actualizar args de app |
| `launcher:app:pick` | — | File picker (fallback) |
| `launcher:app:favorite` | `{id, favorite}` | Toggle favorita |
| `launcher:profiles:list` | — | Listar perfiles |
| `launcher:profile:save` | `{profile}` | Crear/actualizar perfil |
| `launcher:profile:delete` | `{id}` | Eliminar perfil |
| `launcher:profile:duplicate` | `{id, newId, newName}` | Duplicar perfil |
| `launcher:profile:launch` | `{id}` | Lanzar cadena |
| `launcher:profile:cancel` | `{id}` | Cancelar cadena |
| `launcher:profile:retry:failed` | `{id}` | Reintentar steps fallidos |
| `launcher:profile:stats:save` | `{id, durationMs}` | Guardar stats manualmente |
| `launcher:profile:hotkey:set` | `{id, combo}` | Asignar hotkey |
| `launcher:autostart:toggle` | `{id, enabled}` | Toggle auto-launch |
| `launcher:registry:list` | — | Listar apps del registry |

---

## 10. Archivos del feature

### 10.1 Backend Go (`internal/app/launcher/`)

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `launcher.go` | 148 | Orchestrator `Service` — une discovery, apps, profiles y chain |
| `types.go` | 44 | Tipos base, errores públicos, `execLauncher` |
| `apps.go` | 92 | CRUD de apps: Merge, Add, Remove |
| `profiles.go` | 117 | CRUD de perfiles: List, Save, Delete, Duplicate |
| `chain.go` | 320 | `ChainRunner` — ejecución secuencial, liveness, telemetry |
| `discovery.go` | 207 | `Discover()`, `expandWindowsEnv`, `matchKnownApps`, `probeKnownPaths` |
| `discovery_windows.go` | 102 | Windows: registry + Steam VDF parser |
| `discovery_stub.go` | 13 | Non-Windows stub |
| `known.go` | 84 | Catálogo de 7 apps conocidas |
| `registry_common.go` | 56 | `readUninstallEntries` var seam |
| `registry_windows.go` | 50 | `ListRegistryApps()` exportado |
| `registry_filter.go` | 79 | `IsSystemApp`, `IsFilteredOut` |
| `telemetry.go` | 51 | `RecordProfileAttempt`, `RecordProfileSuccess` (EMA) |
| `autostart_windows.go` | 55 | `RegisterAutostart`, `UnregisterAutostart`, `ParseLaunchFlag` |
| `hotkey_windows.go` | 179 | `HotkeyManager` — RegisterHotKey, ReRegisterAll |

### 10.2 Frontend (`frontend/src/hub/launcher/`)

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `launcher-state.ts` | 156 | Tipos + helpers puros (`estimateChainDuration`, `isProfileLaunchable`, etc.) |
| `chain-store.tsx` | 378 | Store externo con `useSyncExternalStore`, watchdog, cleanup |
| `AppsPanel.tsx` | — | Panel de apps detectadas/manuales |
| `ProfilesPanel.tsx` | — | Panel de perfiles con grilla |
| `ProfileCard.tsx` | 243 | Card de perfil + early return a Timeline |
| `ProfileCard.timeline.tsx` | 119 | Mini-timeline con Motion |
| `ProfileEditor.tsx` | — | Side-panel con name, notes, steps, hotkey, autostart |
| `AddNonSteamGameModal.tsx` | — | Modal single-select del registro |
| `HubToast.tsx` | 114 | Toast fallback con auto-dismiss |

### 10.3 Wiring (`cmd/vantare/main.go`)

- 18 handlers de eventos Wails (líneas 142–390)
- `launcherSvc` inicializado en línea 741
- `profileHkMgr` en línea 772
- `cleanupApp()` llama `launcherSvc.CancelAll()` en línea 470

### 10.4 Tests

- **Backend:** 11 archivos de test (launcher, chain, discovery, apps, profiles, telemetry, registry, registry_filter, autostart, hotkey)
- **Frontend:** 10 archivos de test (launcher-state, chain-store, AppsPanel, ProfilesPanel, ProfileCard, ProfileCard.timeline, ProfileCard.timeline.a11y, ProfileEditor, AddNonSteamGameModal, HubToast)

---

## 11. Bugs resueltos

### 11.1 `os.ExpandEnv` no expande `%VAR%` de Windows

**Problema:** Go `os.ExpandEnv()` solo expande sintaxis `$VAR` / `${VAR}`. Las rutas de KnownApps usan `%PROGRAMFILES%` (sintaxis Windows), que quedan literales sin expandir. Resultado: `probeKnownPaths` nunca encuentra el exe.

**Solución:** Función `expandWindowsEnv()` en `discovery.go`:
```go
func expandWindowsEnv(s string) string {
    result := os.ExpandEnv(s) // $VAR / ${VAR}
    var buf strings.Builder
    for i := 0; i < len(result); i++ {
        if result[i] == '%' {
            end := strings.IndexByte(result[i+1:], '%')
            if end >= 0 {
                key := result[i+1 : i+1+end]
                if val, ok := os.LookupEnv(key); ok {
                    buf.WriteString(val)
                    i += 1 + end
                    continue
                }
            }
        }
        buf.WriteByte(result[i])
    }
    return buf.String()
}
```

**Regla:** Siempre usar `expandWindowsEnv` en vez de `os.ExpandEnv` para paths Windows.

### 11.2 Apps necesitan `cmd.Dir` = su propia carpeta

**Problema:** `exec.Command(path).Start()` usa el CWD del proceso padre (Vantare `bin/`). Apps como OBS buscan archivos relativos a su exe (`locale/en-US.ini`) y fallan.

**Solución:** `cmd.Dir = filepath.Dir(entry.ExecutablePath)` antes de `cmd.Start()`.

**Apps afectadas conocidas:** OBS. Potencialmente CrewChief, SimHub, MoTeC.

### 11.3 Cadena se detiene al fallar un step

**Problema original:** `runChained` hacía `return false` cuando un step fallaba, deteniendo toda la cadena.

**Solución:** Cambiar a `continue` para que la cadena siga con los steps restantes. El resultado final es `allSucceeded = false` pero se reportan todos los steps.

### 11.4 Doble-lanzamiento del mismo perfil

**Problema:** Doble click rápido en "Lanzar" causaba dos cadenas simultáneas.

**Solución:** `active map` en `ChainRunner` rechaza el segundo `StartChain` con `chain:error` "perfil ya en curso".

### 11.5 Watchdog para `chain:done` perdido

**Problema:** Si Wails pierde el evento `chain:done`, la UI queda en estado "running" indefinidamente.

**Solución:** Watchdog cada 5s que marca como error si `lastEventAt > 30s`.

---

## 12. Decisiones de diseño

| Decisión | Razón |
|---|---|
| Store externo con `useSyncExternalStore` | Suscripción selectiva: un `ProfileCard` solo re-renderiza cuando cambia SU perfil. Evita jank con 50+ perfiles. |
| `expandWindowsEnv` custom | Go no soporta `%VAR%` Windows nativamente. Alternativas (regex, reemplazo manual) son más frágiles. |
| `cmd.Dir` global para todos los executables | Más simple que marcar apps individuales. Si una app no necesita CWD propio, no le afecta. |
| EMA α=0.3 para telemetría | Balance: converge rápido (~7 lanzamientos) pero no es demasiado ruidoso. |
| Watchdog 30s | Suficiente para apps lentas (OBS puede tardar 5-10s en abrir) pero detecta cadenas colgadas. |
| Cleanup 3s después de completar | Ventana para que el usuario vea el resultado antes de que el state desaparezca. |
| `ChainRunnerProvider` en `HubApp` | Un solo provider para toda la app. El dock y la página comparten el mismo store. |
| Single-select en AddNonSteamGameModal | v1: mantenibilidad. Multiselect es más complejo y se difiere a v2. |
| Cap de 200 en registry list | Rendimiento: machines de developers pueden tener 50k+ entradas. |

---

## 13. Fuera de alcance (v2)

- Búsqueda fuzzy (fuse.js)
- Virtualización completa de listas
- Multiselect en AddNonSteamGameModal
- Drag & drop para reordenar steps
- Importar/exportar perfiles como JSON
- Sincronización entre dispositivos (Supabase)
- Kill chain (matar todos los procesos)
- Estadísticas de uso avanzadas (gráficos)
