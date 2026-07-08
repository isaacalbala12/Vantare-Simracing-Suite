# Launcher v2 — Spec de diseño

> **For agentic workers:** este es un spec validado por el usuario. El siguiente paso es invocar la skill `writing-plans` para descomponerlo en tareas ejecutables.

**Fecha:** 2026-07-08
**Estado:** Validado por el usuario, pendiente `writing-plans`.
**Brújula del proyecto:** **fiabilidad** y **rendimiento** como criterios de aceptación duros. Toda decisión arquitectónica se justifica contra estos dos ejes. El usuario delega la profundidad técnica pero exige que se respeten AGENTS.md, el sistema de diseño Vantare Crystal y el plan original del launcher.

---

## 1. Contexto

El launcher de Vantare ya está implementado (commits `6d35d44`, `1963c26`, `23e1fd8`) con la base funcional: discovery de apps, perfiles, editor inline, cadena de lanzamiento, dock dinámico. El usuario lo percibe como **preliminar** por cuatro razones:

1. **Bug de discovery**: solo Le Mans Ultimate se autodescubre. CrewChief, Spotify, Discord, OBS y MoTeC, que sí están instaladas y son las apps de los perfiles predefinidos, no aparecen.
2. **Sin animaciones / sin feedback**: la pestaña es demasiado simple, sin barra de progreso animada durante la cadena, sin estados intermedios visibles.
3. **Sin notificaciones**: no hay feedback nativo de éxito/error.
4. **Estética vibecodeada**: el look general no alcanza el nivel de "herramienta profesional".

El plan original (`docs/superpowers/plans/2026-07-06-launcher-extensive.md`) sentó la base técnica. Esta iteración lo eleva a producto.

---

## 2. Decisiones fundacionales

| # | Decisión | Implicación |
|---|---|---|
| 1 | **Discovery = autodescubrir todo** | El launcher debe detectar LMU + las 6 apps catalogadas sin intervención del usuario. Lo que no se detecta no aparece. El bug actual es a arreglar. |
| 2 | **Filosofía = herramienta seria con feedback visible** | El launcher se nota cuando trabaja. No es una utilidad silenciosa. |
| 3 | **Lugar del feedback = dock + página en vivo, sin ruido del SO durante la cadena** | Cero notificaciones nativas durante la ejecución; solo toast nativo al terminar (éxito/parcial/error). |
| 4 | **Alcance visual = híbrido** | Página de Launcher rediseñada; componentes base (ProfileCard, AppsPanel, dock) se pulen en su forma actual. Sobre Vantare Crystal existente. |
| 5 | **Dependencias = Motion solo (Framer Motion v11+)** | Sin shadcn/ui. UI primitives propios sobre Tailwind + tokens Vantare Crystal. Respetar AGENTS.md. |
| 6 | **App row = gradiente + abreviatura + nombre + badge categoría + detectada/manual + toggle favorita** | Path y args se ocultan tras hover/click. |
| 7 | **App detalles = path .exe + args** | Visibles al hacer click o hover. |
| 8 | **Perfil = nombre grande + descripción + tiempo total estimado + lista horizontal de apps con delay + badge lanzable** | El perfil se entiende de un vistazo. Tiempo estimado = heurística (2s por executable, 1s por steam-uri) si no hay dato real. Si hay `avgChainDurationMs`, se muestra el real con `≈`. |
| 9 | **Persistencia = isFavorite (app y perfil), notes, launchCount, lastLaunchedAt, avgChainDurationMs, launchOnWindowsStartup, hotkey** | El plan original rechazó "último uso" y "contador". Se revisa esta iteración; el usuario confirma que entran. `avgChainDurationMs` se calcula en Go con EMA (alpha=0.3). |
| 10 | **Arquitectura del feedback = ChainRunnerContext (React Context) + ProfileCard se transforma + medición en Go** | Una sola fuente de verdad. Dock lee del context. Go mide wall-clock y emite eventos con `startedAt`/`finishedAt`. Sin Zustand (es un patrón nuevo innecesario; el proyecto ya usa Context). |

### Persistencia de telemetría: cuándo se actualiza

- `launchCount` y `lastLaunchedAt`: en **toda** cadena (éxito o fallo). Reflejan lo que el usuario hace.
- `avgChainDurationMs`: solo en **éxito total** (todos los pasos arrancaron). Se calcula con EMA sobre la duración real wall-clock de la cadena.

---

## 3. Modelo de datos y persistencia

### 3.1 Structs Go (delta)

```go
// internal/app/settings_service.go

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
    // NUEVO v2:
    IsFavorite     bool                `json:"isFavorite,omitempty"`
}

type LaunchStep struct {
    AppID string `json:"appId"`
    Delay int    `json:"delay"`
}

type LaunchProfile struct {
    ID          string       `json:"id"`
    Name        string       `json:"name"`
    Description string       `json:"description,omitempty"`
    Steps       []LaunchStep `json:"steps"`
    // NUEVO v2:
    IsFavorite             bool       `json:"isFavorite,omitempty"`
    Notes                  string     `json:"notes,omitempty"`
    LaunchCount            int        `json:"launchCount,omitempty"`
    LastLaunchedAt         *time.Time `json:"lastLaunchedAt,omitempty"`
    AvgChainDurationMs     int64      `json:"avgChainDurationMs,omitempty"`
    LaunchOnWindowsStartup bool       `json:"launchOnWindowsStartup,omitempty"`
    Hotkey                 string     `json:"hotkey,omitempty"` // formato "ctrl+shift+1"
}
```

### 3.2 Frontend (delta)

```ts
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
  // NUEVO v2:
  isFavorite?: boolean;
};

export type LaunchProfile = {
  id: string;
  name: string;
  description?: string;
  steps: LaunchStep[];
  // NUEVO v2:
  isFavorite?: boolean;
  notes?: string;
  launchCount?: number;
  lastLaunchedAt?: string | null;
  avgChainDurationMs?: number;
  launchOnWindowsStartup?: boolean;
  hotkey?: string;
};
```

### 3.3 Persistencia atómica (fiabilidad global)

`SettingsService.Save` debe ser **atómico**: escribir a `app-settings.json.tmp` y `os.Rename` sobre el destino. Esto protege TODA la persistencia del Hub, no solo el launcher. Si ya lo hace, verificar y mantener. Si no, añadir en esta iteración. **Riesgo**: Windows puede bloquear el destino (antivirus, indexador). Mitigación: retry con backoff (3 intentos: 100ms, 500ms, 1s). Si falla definitivamente, log + toast de error en el Hub.

### 3.4 Cálculo de `avgChainDurationMs` (EMA)

```go
const emaAlpha = 0.3

func RecordProfileLaunch(backend ProfilesBackend, profileID string, durationMs int64) error {
    // Busca perfil por ID, incrementa LaunchCount, actualiza LastLaunchedAt.
    // Si AvgChainDurationMs == 0: inicializa con durationMs.
    // Si no: avg = alpha*new + (1-alpha)*old.
    // Persiste vía backend.SetLauncherProfiles.
}
```

**Cuándo se llama**: solo si la cadena terminó con `success=true`. `launchCount` y `lastLaunchedAt` se actualizan siempre (éxito o fallo), porque reflejan el intento del usuario.

### 3.5 Migración de settings existentes

**Sin migrador explícito**. La migración es aditiva:
- `omitempty` en JSON tags → settings v1 se serializan igual.
- `Load` hace merge; campos nuevos quedan en zero-value.
- Primer `Save` (al lanzar cadena o editar) escribe los nuevos campos.

**Test de regresión**: `TestSettingsMigratesLegacyAppSettings` carga un fixture de settings v1, verifica campos nuevos en zero-value, verifica que un `Save` posterior no rompe el archivo.

### 3.6 Auto-launch al inicio de Windows

- **Por perfil**: `LaunchOnWindowsStartup bool`.
- **UI**: toggle en `ProfileEditor` con copy "Iniciar [nombre del perfil] al arrancar Windows".
- **Backend** (`internal/app/launcher/autostart_windows.go`): entrada en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` con nombre `Vantare.<profileID>` y valor `"<path a vantare.exe>" --launch=<profileID>`.
- **Idempotencia**: si la entrada ya existe con el mismo valor, no hace nada. Si difiere, la actualiza. Al desmarcar, elimina.
- **Fallo del exe al inicio de Windows**: Vantare se lanza con `--launch=<profileID>`, valida paths, si falla exit silencioso con log (no UI, no crash).
- **Solo se activa el toggle si el perfil tiene al menos un step válido** (validación en el editor).

### 3.7 Hotkeys globales

- **Por perfil**: `Hotkey string` (formato "ctrl+shift+1").
- **UI**: campo de texto con validación, o un "record key" (pulsar combinación y se rellena).
- **Backend** (`internal/app/launcher/hotkey_windows.go`): registra con `RegisterHotKey` de Windows al iniciar el Hub; desregistra al cambiar/eliminar.
- **Conflictos**: si `RegisterHotKey` falla (otra app la tiene), se desactiva y se emite `launcher:profile:hotkey:error` con motivo. UI del editor muestra el campo en rojo con mensaje "Esta combinación está en uso por otra app".
- **Prioridad**: hotkeys locales del Hub tienen prioridad. Si la combinación coincide con una local, se desactiva la del perfil.
- **Validación al asignar**: whitelist de combinaciones "seguras" (no Ctrl+C, Ctrl+V, Win+L, etc.). Si el usuario intenta asignar una reservada, se rechaza en el editor antes de llegar al backend.

---

## 4. Componentes y flujo

### 4.1 Árbol de componentes

```
HubApp
└── HubShell
    ├── HubErrorBoundary
    ├── LicenseProvider
    ├── I18nProvider (ya global desde I18N-02)
    ├── ChainRunnerProvider         ← NUEVO: estado de cadenas en curso
    │   ├── Topbar
    │   ├── LauncherDock            ← Lee ChainRunnerContext
    │   └── <Page>
    │       ├── LauncherPage
    │       │   ├── AppsPanel
    │       │   │   ├── AppRow × N
    │       │   │   └── AddNonSteamGameModal  ← NUEVO: estilo Steam
    │       │   └── ProfilesPanel
    │       │       ├── ProfileCard × N (cada una lee ChainRunnerContext)
    │       │       │   └── ProfileCard.Timeline  ← NUEVO: mini-timeline (condicional)
    │       │       ├── ProfileEditor (modal o inline)
    │       │       └── FavoritesSection          ← NUEVO: perfiles favoritos arriba
    │       └── ...
```

**Justificación**:
- `ChainRunnerProvider` en `HubShell` para que el dock lo vea desde cualquier página.
- `AddNonSteamGameModal` dentro de `AppsPanel` (botón "+ Añadir").
- `ProfileCard.Timeline` condicional (early return; cero coste cuando no hay cadena).

### 4.2 ChainRunnerContext

```ts
type ChainStepState = {
  appId: string;
  status: "pending" | "launching" | "done" | "failed";
  startedAt?: number;  // epoch ms
  finishedAt?: number; // epoch ms
  message?: string;    // error message si failed
};

type ChainState = {
  profileId: string;
  startedAt: number;
  steps: ChainStepState[];
  currentStepIndex: number;
  overallStatus: "running" | "done" | "error";
};

type ChainRunnerContextValue = {
  chains: Map<string, ChainState>;
  getChain: (profileId: string) => ChainState | undefined;
  cancel: (profileId: string) => void;
};
```

**Eventos**:
- `launcher:chain:step` (backend → frontend): `{ profileId, stepIndex, appId, status, startedAt, finishedAt, message? }`.
- `launcher:chain:done` (backend → frontend): `{ profileId, success }`.
- `launcher:chain:error` (backend → frontend): `{ profileId, message, stepIndex }`.
- `launcher:profile:cancel` (frontend → backend): `{ id }`.
- `launcher:profile:retry:failed` (frontend → backend): `{ id }` — relanza SOLO los steps que fallaron en la última cadena del perfil, con los mismos delays.

**Limpieza**: 3 segundos después de `done`/`error`, la entrada se borra del map → la card vuelve a normal. Si el Hub se cierra mid-cadena, el `ChainRunner` de Go lo detecta y cancela.

**Rendimiento**: el context solo cambia cuando llega un evento Wails (cada step, no cada frame). El countdown se renderiza con `useEffect` + `setInterval` LOCAL al sub-componente `ProfileCard.Timeline`.

### 4.3 ProfileCard (se transforma)

```tsx
export function ProfileCard({ profile, apps }: Props) {
  const { getChain } = useChainRunner();
  const chain = getChain(profile.id);

  if (chain) {
    return <ProfileCardTimeline profile={profile} apps={apps} chain={chain} />;
  }

  return (
    <article /* card normal */>
      {/* nombre grande, descripción, tiempo total, apps horizontal, badge lanzable, telemetría */}
    </article>
  );
}
```

`ProfileCardTimeline` (sub-componente): mini-timeline horizontal con bloques por step animados con Motion, countdown visible entre steps, botón Cancelar siempre visible. Al cerrar la cadena, la timeline se queda 3s con el resumen y luego la card vuelve a normal (el context limpió la entrada).

### 4.4 LauncherDock (sincronizado)

```tsx
export function LauncherDock({ onNavigate }: Props) {
  const { getChain } = useChainRunner();
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  // ...existing useEffect to load profiles

  const orderedProfiles = useMemo(
    () => [...profiles].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.name.localeCompare(b.name);
    }),
    [profiles]
  );

  return (
    <aside className="v52-dock hidden lg:flex flex-col">
      <button onClick={() => onNavigate("launcher") /* navigate icon */} />
      <div className="overflow-y-auto flex flex-col gap-1">
        {orderedProfiles.map((p) => (
          <DockProfileButton
            key={p.id}
            profile={p}
            chain={getChain(p.id)}
            onLaunch={() => Events.Emit("launcher:profile:launch", { id: p.id })}
            onCancel={() => Events.Emit("launcher:profile:cancel", { id: p.id })}
          />
        ))}
      </div>
    </aside>
  );
}
```

`DockProfileButton` (nuevo sub-componente):
- Si hay `chain`: anillo SVG circular con `stroke-dashoffset` animado, color de categoría del step actual, icono "cancelar" en hover.
- Si no hay chain: comportamiento actual. Si `isFavorite`, dot dorado.
- Tooltip con nombre.

### 4.5 AddNonSteamGameModal (estilo Steam)

- **Modal** con: barra de búsqueda, lista del registro Windows (todas las apps instaladas, con icono + nombre + path), checkboxes para multiselect, botón "Browse..." (file picker), botones "Cancelar" y "Añadir N".
- **Lectura lazy**: al abrir, emite `launcher:registry:list`. El backend lee el registro, devuelve `launcher:registry:listed` con `apps[]`. Skeleton/spinner mientras carga.
- **Filtrado**: `useMemo` con `.includes()` (O(n), n≈10k, ~1-2ms en V8). Sin fuse.js en v1.
- **Multiselect**: set de IDs seleccionados. Toggle en cada fila.
- **Browse**: file picker nativo (Wails). Fallback al `<input type="file">` actual si Wails v3 alpha.98 no expone diálogo nativo.
- **Backend nuevo**: `internal/app/launcher/registry_windows.go` lee `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*` + WOW6432Node + HKCU, devuelve `[]RegistryApp` (displayName, executablePath, iconPath).
- **Refactor**: extraer `readUninstallEntries()` a helper compartido entre `discovery_windows.go` y `registry_windows.go`.

### 4.6 Flujo de datos (cadena)

```
Usuario hace click "Lanzar" en ProfileCard o dock
  → Frontend emite "launcher:profile:launch" { id }
  → Backend (ChainRunner.RunProfile):
      1. Crea context.CancelFunc, registra en active map.
      2. Por cada step:
         - select { sleep delay; <-ctx.Done() } (cancelación).
         - time.Now() → startedAt.
         - exec.Command(app.ExecutablePath, ...).Start() (fire-and-forget).
         - emit "launcher:chain:step" { profileId, stepIndex, appId, status: "launching", startedAt }
         - time.Now() → finishedAt.
         - emit "launcher:chain:step" { ..., status: "done" | "failed", finishedAt, message? }.
      3. Si success: RecordProfileLaunch(profileID, durationMs).
      4. emit "launcher:chain:done" { profileId, success }.
      5. Limpia active map.

Frontend ChainRunnerProvider:
  → Recibe eventos, actualiza Map<profileId, ChainState>.
  → ProfileCard lee getChain(profile.id) → renderiza Timeline si existe.
  → LauncherDock lee getChain(profile.id) → renderiza anillo de progreso.
  → 3s después del done/error, limpia la entrada → ProfileCard vuelve a card normal.
  → El toast nativo de Windows con "Reintentar fallidos" emite `launcher:profile:retry:failed` con el profileID del toast.
```

### 4.7 Edge cases

- **Cancelación mid-cadena**: `ctx.CancelFunc()`, pasos restantes en `pending`, emite `chain:error` con message "cancelled". `.exe` ya lanzados siguen (diseño, como Steam).
- **App no encontrada**: `ChainRunner` valida `app.ExecutablePath` antes de lanzar. Si no existe, emite `chain:step` con `status: "failed"` y message legible.
- **Hub se cierra mid-cadena**: `ChainRunner` de Go detecta el cierre del cliente y cancela. Los `.exe` ya lanzados siguen.
- **Hotkey en conflicto**: `RegisterHotKey` falla → backend marca inactiva + emite `launcher:profile:hotkey:error` → UI del editor muestra error.
- **Auto-launch con exe desinstalado**: Vantare se lanza con `--launch=<profileID>`, valida paths, exit silencioso con log si falla.
- **Save atómico falla (antivirus)**: retry con backoff. Si falla definitivamente, log + toast de error. La próxima cadena reintenta; el estado en memoria no se pierde.

---

## 5. Feedback de la cadena (motion)

### 5.1 Principios

- **Duración**: 200-300ms para transiciones de estado. 1500ms para el ciclo del pulso "launching".
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (Motion `easeOut`-like, sin rebote).
- **Propiedades animadas**: solo `transform` y `opacity`. **Nunca** width/height/top/left/margin/padding (causan layout).
- **`prefers-reduced-motion`**: respetar. Si activo, transiciones a 0ms y pulso se quita. Feedback sigue visible por color + icono + texto.
- **Cantidad**: máximo 1 elemento animándose a la vez por perfil.

### 5.2 Estados de bloques

| Estado | Visual | Motion |
|---|---|---|
| `pending` | Fondo `bg-white/5`, borde `border-white/10`, icono opacidad 0.4, delay visible. | Sin motion. |
| `launching` | Fondo `bg-{categoryColor}/20`, borde `border-{categoryColor}/40`, icono opacidad 1.0. | Pulso opacidad 0.7 → 1.0 → 0.7 cada 1500ms. |
| `done` | Fondo `bg-emerald-500/15`, borde `border-emerald-500/40`, check verde. | Fade-in del check 200ms. Slide-in de 4px desde la izquierda (solo al pasar de `launching` a `done`). |
| `failed` | Fondo `bg-red-500/15`, borde `border-red-500/40`, X rojo, mensaje debajo (truncado, tooltip con completo). | Fade-in del X 200ms. Sin slide. |
| `cancelled` | Fondo `bg-amber-500/10`, borde `border-amber-500/30`, icono pause. | Fade-in 200ms. |

**Colores por categoría** (alineados con WIDGET-STUDIO-09):
- `simulator` → `#ff3b3b`
- `streaming` → `#302e31`
- `audio` → `#10b981`
- `telemetry` → `#f59e0b`
- `utility` → `#3b82f6`

### 5.3 Countdown entre steps

- Barra horizontal fina (4px) entre el bloque terminado y el siguiente.
- Relleno `scaleX: 0 → 1` durante el delay, color de la categoría del step siguiente.
- Texto "esperando Xs" con `setInterval` local a 1Hz.
- Si delay == 0, barra no se renderiza.

### 5.4 Botón Cancelar

- Posición: fijo arriba-derecha de la card durante toda la cadena.
- Borde `border-amber-500/40`, texto `text-amber-300`, fondo transparente. Hover: `bg-amber-500/10`.
- Fade-in 200ms. Sin scale.
- **No pide confirmación**. Click → cancela. Idempotente en backend.

### 5.5 Transición card → timeline (M1)

- 50-100ms de skeleton "Iniciando..." mientras llega el primer evento Wails (evita flash de "nada").
- Luego fade cruzado 200ms: card normal opacity 1→0, timeline opacity 0→1 con slide sutil de 8px desde abajo.

### 5.6 Transición timeline → card (M3)

- 3s con resumen visible (estados finales de cada bloque, sin animaciones activas).
- Fade cruzado 200ms: timeline opacity 1→0, card normal opacity 0→1.

### 5.7 Toast nativo de Windows (M3)

- Éxito total: "Perfil X listo · 4/4 apps lanzadas".
- Éxito parcial: "Perfil X · 3/4 apps listas, falló Z". Botón "Reintentar fallidos".
- Error total: "Perfil X · no se pudo iniciar". Botón "Reintentar".
- **Fallback**: si el SO no soporta notificaciones (modo kiosk, sin Action Center), toast del Hub en la esquina superior derecha.

### 5.8 Accesibilidad

- `role="status"` + `aria-live="polite"` en la timeline.
- Botón Cancelar con `aria-label="Cancelar lanzamiento de [nombre del perfil]"`.
- Focus management: durante cadena → foco en Cancelar. Al volver a normal → foco en Lanzar.
- Contraste WCAG AA verificado en colores de estado sobre fondo Vantare Crystal.
- `prefers-reduced-motion` respetado (ya en 5.1).

### 5.9 Micro-interacciones del dock

- Botón del perfil en curso: anillo SVG circular con `stroke-dashoffset` animado, color de categoría del step actual.
- Hover: `bg-white/5` (100ms ease-out). Sin scale.
- Press: `bg-white/10` durante 50ms.

### 5.10 Estados vacíos y de error

- **AppsPanel vacío (0 apps)**: ilustración SVG (icono "search" con gradiente Vantare), copy + botones "Re-escanear" / "Añadir manualmente".
- **AppsPanel con apps no detectadas**: copy pequeño "Faltan N apps. [Re-escanear]".
- **ProfileCard no lanzable**: borde izquierdo rojo, badge "Falta app", botón Lanzar disabled. Click en badge → scroll a la app faltante en AppsPanel con highlight 2s.
- **ProfileCard sin steps**: copy "Sin pasos. Pulsa Editar para añadir." Botón Editar destacado.
- **Chain error global**: banner arriba del ProfilesPanel con copy claro + botón "Reintentar".

---

## 6. Testing

### 6.1 Backend Go

| Archivo | Tests |
|---|---|
| `settings_service_test.go` | `TestSettingsMigratesLegacyAppSettings`, `TestAtomicSave`, `TestRecordProfileLaunch`. |
| `launcher/chain_test.go` | `TestChainRunnerMeasuresWallClock`, `TestChainRunnerCancellation`, `TestChainRunnerFailureDoesNotUpdateAvg`. |
| `launcher/registry_windows_test.go` (nuevo) | `TestReadUninstallEntries`, `TestReadUninstallEntriesFiltersEmpty`. |
| `launcher/discovery_windows_test.go` | `TestParseLibraryFolders`, `TestDiscoverFindsOBS`, `TestDiscoverAlwaysIncludesLMU`. |
| `launcher/autostart_windows_test.go` (nuevo) | `TestRegisterUnregisterAutostart`, `TestUnregisterClearsEntry`. |
| `launcher/hotkey_windows_test.go` (nuevo) | `TestParseHotkeyString`, `TestHotkeyConflictDoesNotCrash`. |
| `cmd/vantare/main_test.go` | `TestHandleRegistryList`, `TestHandleProfileStatsSave`, `TestHandleAutostartToggle`, `TestHandleHotkeySet`, `TestHandleProfileRetryFailed`. |
| `diagnostics_service_test.go` | Sanitización de los nuevos campos. |

### 6.2 Frontend

| Archivo | Tests |
|---|---|
| `launcher/launcher-state.test.ts` | `TestEstimateChainDuration`. |
| `launcher/ChainRunnerContext.test.tsx` (nuevo) | Provider actualiza con eventos step, limpia a 3s, cancel emite evento. |
| `launcher/ProfileCard.test.tsx` | Renderiza Timeline cuando chain activo, muestra avg/last/count/favorita. |
| `launcher/ProfileCard.timeline.test.tsx` (nuevo) | Renderiza steps, anima launching, muestra Cancelar y countdown. |
| `launcher/AddNonSteamGameModal.test.tsx` (nuevo) | Lazy load, búsqueda, multiselect, Browse, Add emite entries. |
| `launcher/AppsPanel.test.tsx` | Toggle favorita, abre modal Add. |
| `launcher/ProfileEditor.test.tsx` | Campos notes, hotkey, autostart. |
| `components/LauncherDock.test.tsx` | Perfil en curso con anillo, favoritos primero, dot dorado. |
| `i18n/i18n.test.ts` | Paridad de nuevas keys en es/en/pt/it. |
| `launcher/ProfileCard.timeline.a11y.test.tsx` (nuevo) | `aria-live`, `aria-label` en Cancelar, `prefers-reduced-motion`. |

### 6.3 Visual compare (Playwright)

Script `frontend/scripts/launcher-visual-compare.mjs` (patrón de `widget-studio-visual-compare.mjs`). Capturas:
1. LauncherPage vacía.
2. LauncherPage con 7 apps detectadas y 2 perfiles.
3. Perfil marcado como favorito (sección Favoritos arriba).
4. Perfil en estado `launching` (mini-timeline, countdown activo).
5. Perfil en estado `done` (3s de resumen).
6. Dock con perfil en curso (anillo de progreso).
7. Dock con perfil favorito (dot dorado).
8. Modal "Add Non-Steam Game" abierto con búsqueda.
9. Modal con multiselect (3 apps marcadas).
10. Perfil no lanzable (borde rojo, badge "Falta app").

---

## 7. Plan de ejecución (8 cortes)

Cada corte compila, pasa sus tests, y se puede verificar manualmente antes del siguiente.

| # | Corte | Alcance | Verificación |
|---|---|---|---|
| 0 | **Migración de modelo de datos** | Añadir campos a structs Go y TS. `Save` atómico en `SettingsService`. Test de migración. | `go test`, `pnpm test`, `tsc`, `lint`. Settings v1 cargan OK. |
| 1 | **Discovery fix + parser Steam** | Implementar `readSteamLibraryFolders` correctamente. Refactor `readUninstallEntries` a helper compartido. | Discovery devuelve OBS, Spotify, Discord, etc. en Windows. `go test`. |
| 2 | **Menú Add Non-Steam Game** | Backend `registry_windows.go`. Frontend `AddNonSteamGameModal` con búsqueda + multiselect + Browse. Integrar en `AppsPanel`. | Modal abre, lista apps del registro, búsqueda filtra, multiselect funciona, Browse abre picker. Visual compare. |
| 3 | **Favoritos y notas** | Toggle favorita (app y perfil) en `AppBadge` y `ProfileCard`. Campo `notes` en `ProfileEditor`. Dock prioriza favoritos. Sección Favoritos. | Click en estrella persiste. Notas se guardan. Dock reordena. Visual compare. |
| 4 | **Telemetría (count + lastLaunchedAt + avgChainDurationMs)** | `RecordProfileLaunch` en Go. EMA en chain runner. UI muestra count, "hace 2h", "≈Xs". | Lanzar perfil, count sube, lastLaunchedAt se actualiza, avg se calcula. Varios lanzamientos, EMA converge. |
| 5 | **ChainRunnerContext + ProfileCard se transforma** | Context global en `HubShell`. ProfileCard lee context, early return a Timeline. Eventos Wails con `startedAt`/`finishedAt`. | Lanzar perfil, card se transforma en timeline. Done, vuelve a normal a los 3s. Visual compare. |
| 6 | **Dock sincronizado + Cancelar** | `DockProfileButton` con anillo SVG. Botón Cancelar siempre visible. | Dock muestra progreso en vivo. Cancelar detiene la cadena. |
| 7 | **Auto-launch + hotkeys** | `autostart_windows.go` con `HKCU\...\Run`. `hotkey_windows.go` con `RegisterHotKey`. Toggles/campos en `ProfileEditor`. Manejo de conflictos. | Marcar auto-launch, reiniciar Windows, Vantare lanza perfil. Asignar hotkey, minimizar Hub, pulsar hotkey, perfil se lanza. |

**Dependencias**: 0 → (1, 2, 3, 4, 5, 6, 7). 5 → 6. 1+2+3+4+5+6 → 7.

**Verificación al final de cada corte**:
- `pnpm --dir frontend test`
- `pnpm --dir frontend build`
- `pnpm --dir frontend lint`
- `go test ./...`
- `go build ./...`
- Visual compare (cuando aplique: 2, 3, 5, 6)
- Verificación manual del flujo descrito.

---

## 8. Criterios de aceptación globales

1. Discovery encuentra LMU, OBS, CrewChief, Discord, Spotify, MoTeC, SimHub cuando están instalados. LMU siempre aparece.
2. AppsPanel muestra las 7 apps detectadas con badge de categoría, detectada/manual, toggle de favorita. Modal "Add Non-Steam Game" añade apps del registro o con Browse.
3. ProfileCard muestra nombre, descripción, tiempo total (estimado o real con `≈`), apps horizontal con delay, badge lanzable/falta app, telemetría, favorito, notas (en editor). Se transforma en mini-timeline durante la cadena, vuelve a normal a los 3s.
4. LauncherDock prioriza favoritos, muestra anillo de progreso en perfiles en curso, sincronizado con el context.
5. Cadena ejecuta steps con delays, mide wall-clock, cancela con context, actualiza count siempre y avg solo en éxito, persiste telemetría al cerrar.
6. Auto-launch: toggle por perfil, entrada en `HKCU\...\Run`, Vantare respeta `--launch=<profileID>` al inicio.
7. Hotkeys: campo por perfil, registro con `RegisterHotKey`, conflicto manejado, hotkey local del Hub tiene prioridad.
8. Persistencia atómica: `app-settings.json` no se corrompe aunque el proceso muera a mitad de write.
9. Accesibilidad: `role="status"` + `aria-live`, focus management, contraste WCAG AA, `prefers-reduced-motion`.
10. Motion: 200-300ms, ease-out, solo transform/opacity, GPU, 1 elemento por perfil.
11. i18n: paridad de las nuevas keys en es/en/pt/it.
12. Tests: cobertura nueva (Go y TS) sigue convenciones del repo (table-driven, sin `time.Sleep`, sin mocks innecesarios).
13. Visual compare: script captura los 10 estados clave, exit 0, sin regresiones.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Parser `libraryfolders.vdf` falla en formatos raros. | Test con fixtures de varios formatos. Fallback: log + continuar sin apps de Steam. |
| Listado del registro tiene 50k+ entradas en máquinas de developers. | v1: leer al abrir, filtrar client-side. Si duele, v2 con virtualización. |
| `RegisterHotKey` choca con hotkeys del sistema o de otros launchers. | Validación al asignar con whitelist de combinaciones seguras. Si falla, deshabilitar + avisar. |
| Auto-launch con `--launch=<profileID>` si el path de una app ya no existe. | Chain runner valida `ExecutablePath`. Si falla, exit silencioso con log. La próxima sesión del Hub muestra el badge "Falta app". |
| `Save` atómico falla por antivirus. | Retry con backoff (3 intentos). Si falla, log + toast. La próxima cadena reintenta. |
| Motion en docks con muchos perfiles (50+) causa jank. | `useMemo` en el dock. Si crece, v2 con `React.memo` en `DockProfileButton`. |
| Wails v3 alpha.98 puede tener bugs en eventos (tarde, duplicados). | Context cliente tolerante. Tests de edge cases. |
| `prefers-reduced-motion` no detectado en Wails. | Test manual. Fallback: `window.matchMedia('(prefers-reduced-motion: reduce)').matches` aplicado manualmente. |

---

## 10. Fuera de alcance v1 (diferido a v2)

- Búsqueda fuzzy (fuse.js) en AppsPanel y AddNonSteamGameModal.
- Virtualización de listas largas (>10k entradas).
- Logs persistentes de errores por step.
- Drag & drop para reordenar steps (v1 usa botones ↑/↓).
- Importar/exportar perfiles como JSON.
- Plantillas de perfil.
- Sincronización entre dispositivos (Supabase).
- Notificación de "perfil listo" en el system tray.
- Estadísticas de uso avanzadas (gráficos, top apps).
