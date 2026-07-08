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
| 3 | **Lugar del feedback = dock + página en vivo, sin ruido del SO durante la cadena** | Cero notificaciones nativas durante la ejecución; toast nativo al terminar (éxito/parcial/error) con fallback al toast del Hub si las notificaciones de Windows están desactivadas. |
| 4 | **Alcance visual = híbrido** | Página de Launcher rediseñada; componentes base (ProfileCard, AppsPanel, dock) se pulen en su forma actual. Sobre Vantare Crystal existente. |
| 5 | **Dependencias = Motion solo (Framer Motion v11+)** | Sin shadcn/ui, sin auto-animate. UI primitives propios sobre Tailwind + tokens Vantare Crystal. Respetar AGENTS.md. |
| 6 | **App row = gradiente + abreviatura + nombre + badge categoría + detectada/manual + toggle favorita** | Path y args se ocultan tras click en "detalles"; el alta manual permite editar `args` desde el modal. |
| 7 | **App detalles = path .exe + args editables** | Panel "detalles" de la app muestra path y args; el usuario puede editar `args` ahí. |
| 8 | **Perfil = nombre grande + descripción + tiempo total estimado + lista horizontal de apps con delay + badge lanzable** | El perfil se entiende de un vistazo. Tiempo estimado = heurística (2s por executable, 1s por steam-uri) si no hay dato real. Si hay `avgChainDurationMs`, se muestra el real con `≈`. |
| 9 | **Persistencia = isFavorite (app y perfil), notes, launchCount, lastLaunchedAt, avgChainDurationMs, launchOnWindowsStartup, hotkey** | El plan original rechazó "último uso" y "contador". Se revisa esta iteración; el usuario confirma que entran. `avgChainDurationMs` se calcula en Go con EMA (alpha=0.3, justificado en §3.4). |
| 10 | **Arquitectura del feedback = `useSyncExternalStore` con store externo + ProfileCard se transforma + medición en Go** | Store externo evita re-render global del context en cada step. Go mide wall-clock y emite eventos con `startedAt`/`finishedAt`. Sin Zustand (el proyecto ya usa Context; un store externo con `useSyncExternalStore` cubre la suscripción selectiva sin patrón nuevo). |
| 11 | **Favoritos = badge en card + orden en grilla (sin sección separada)** | Una sola fuente visual, igual que el dock. El "destaque" se compensa con el dot dorado del dock y el badge "favorita" en la card. |
| 12 | **Editor de perfil = side-panel (drawer lateral)** | Edición compleja (notes largos, hotkeys, autostart, steps con delays) aislada, sin reflow de la grilla. Coherente con `AddNonSteamGameModal` en patrón de edición aislada. |
| 13 | **AddNonSteamGameModal = single-select** | El caso de uso (piloto añade apps de una en una) no justifica el estado `Set<id>` ni los tests asociados al multiselect. Si en v2 hay demanda real, se añade. |
| 14 | **Count (`launchCount`) en tooltip, no en la cara de la card** | Disponible si el usuario lo busca (hover), invisible si no. `lastLaunchedAt` y `avgChainDurationMs` SÍ visibles (son funcionalmente útiles). |
| 15 | **Resultado de la cadena = 3s en card + badge "último resultado" persistente en dock hasta relanzar** | La card vuelve a normal a los 3s (respeta el ritmo visual). El dock retiene el resultado (success/failed) hasta el siguiente lanzamiento, así sobrevive al alt-tab a pantalla completa. |
| 16 | **Hotkey en conflicto se desactiva estáticamente al registrar** | Validación al asignar con whitelist de combinaciones reservadas. Si coincide con hotkey local del Hub, se desactiva y se avisa. La resolución en runtime según foco es más correcta en el caso "Hub minimizado" pero introduce una superficie de bugs significativa (hooks de foco, message pump, estado de foco en Wails v3 alpha). El blast radius de la validación estática es menor y más mantenible. |

### Persistencia de telemetría: cuándo se actualiza

- `launchCount` y `lastLaunchedAt`: en **toda** cadena (éxito o fallo). Reflejan lo que el usuario hace. Se persisten en una escritura dedicada (`RecordProfileAttempt`).
- `avgChainDurationMs`: solo en **éxito total** (todos los pasos arrancaron). Se calcula con EMA sobre la duración real wall-clock de la cadena. Se persiste en `RecordProfileSuccess`.

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

### 3.3 Persistencia atómica y tolerante a fallos (fiabilidad global)

`SettingsService.Save` debe ser **atómico** y **tolerante a estado corrupto previo**:

1. **Atomic write**: escribir a `app-settings.json.tmp` y `os.Rename` sobre el destino. Esto protege TODA la persistencia del Hub, no solo el launcher. Si ya lo hace, verificar y mantener. Si no, añadir en el corte 0b.
2. **Backup rotativo**: en cada `Save` exitoso, copiar el destino anterior a `app-settings.json.bak` antes de renombrar. Si el `Load` falla por JSON corrupto, intentar `.bak`; si también falla, arrancar con defaults y log crítico (no crash del Hub).
3. **Sidecar de fallo**: si el `Save` falla tras el retry, escribir el payload pendiente a `app-settings.json.failed` y reintentar la aplicación del sidecar en el próximo arranque del Hub (no solo en próxima cadena).
4. **Retry con backoff**: 3 intentos (100ms, 500ms, 1s) cuando el destino está bloqueado por AV/Indexador/OneDrive. Si falla definitivamente, log + toast de error en el Hub.
5. **Mutex de escritura**: un `sync.Mutex` en `SettingsService` serializa todos los `Set*` para cerrar la race TOCTOU entre `RecordProfileAttempt`/`RecordProfileSuccess` y ediciones de perfil concurrentes.
6. **SchemaVersion**: añadir `SchemaVersion int` (default 0) en `AppSettings` y un hook `migrateSettings()` en `Load` (v1 no-op). Blinda el futuro contra cambios de tipo de campo que rompan el `Unmarshal`.

### 3.4 Cálculo de `avgChainDurationMs` (EMA)

EMA con alpha=0.3 (justificación: converge al 90% del valor estable en ~7 lanzamientos y al 95% en ~9; un outlier reciente pesa lo suficiente para que el usuario vea cambio sin ser esclavo del ruido histórico. Un alpha=0.1 sería más estable pero tarda ~20 lanzamientos en reflejar un cambio real de duración — demasiado lento para un usuario que edita steps y quiere ver el efecto).

```go
const emaAlpha = 0.3

// RecordProfileAttempt se llama SIEMPRE que el usuario lanza una cadena (éxito o fallo).
// Incrementa LaunchCount, actualiza LastLaunchedAt, persiste.
// No toca AvgChainDurationMs (eso lo hace RecordProfileSuccess).
func RecordProfileAttempt(backend ProfilesBackend, profileID string) error { ... }

// RecordProfileSuccess se llama SOLO si la cadena terminó con success=true.
// Inicializa o mezcla AvgChainDurationMs con EMA, persiste.
func RecordProfileSuccess(backend ProfilesBackend, profileID string, durationMs int64) error {
    // ... busca perfil, si AvgChainDurationMs == 0 inicializa con durationMs;
    //     si no: avg = alpha*new + (1-alpha)*old.
}
```

**Cuándo se llama cada uno** (en `ChainRunner.RunProfile`, después de cerrar la cadena):
- `RecordProfileAttempt` se llama siempre (éxito o fallo parcial/total).
- `RecordProfileSuccess` se llama solo si `success=true`.

Ambos pasan por el mutex de `SettingsService` (sección 3.3.5).

### 3.5 Migración de settings existentes

**Migración aditiva con `SchemaVersion`**:
- `omitempty` en JSON tags → settings v1 se serializan igual.
- `Load` hace merge; campos nuevos quedan en zero-value.
- `migrateSettings()` se ejecuta en `Load` y es no-op para `SchemaVersion == 0` (v1) y `SchemaVersion == 1` (v2 con todos los campos nuevos). Si en el futuro un campo cambia de tipo, se añade un case en el switch.
- Primer `Save` (al lanzar cadena o editar) escribe los nuevos campos con `SchemaVersion: 1`.

**Tests de regresión**:
- `TestSettingsMigratesLegacyAppSettings`: carga fixture v1, campos nuevos en zero-value, `Save` posterior no rompe el archivo.
- `TestLoadToleratesCorruptedJSON`: fixture con JSON truncado → cae a `.bak` o defaults sin panic.
- `TestLoadFallsBackToDefaultsOnTotalCorruption`: `.bak` también corrupto → defaults + log crítico, no crash.

### 3.6 Auto-launch al inicio de Windows

- **Por perfil**: `LaunchOnWindowsStartup bool`.
- **UI**: toggle en `ProfileEditor` (side-panel) con copy "Iniciar [nombre del perfil] al arrancar Windows".
- **Backend** (`internal/app/launcher/autostart_windows.go`): entrada en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` con nombre `Vantare.<profileID>` y valor `"<path a vantare.exe>" --launch=<profileID>`.
- **Idempotencia**: si la entrada ya existe con el mismo valor, no hace nada. Si difiere, la actualiza. Al desmarcar, elimina.
- **Robustez del `--launch=`**:
  - Parseo defensivo: si `--launch=<profileID>` viene con args malformados o vacíos, se ignora el flag y Vantare arranca normal.
  - Si el `profileID` no existe en settings (perfil borrado), se ignora el flag y se elimina la entrada del registro.
  - Si el `Load` falla por JSON corrupto, se ignora el flag, se loggea crítico, y Vantare arranca normal (no crash en autostart — esto es clave: el autostart puede iterar en bucle si el binario crashea).
  - Si `app.ExecutablePath` de algún step no existe, exit silencioso con log (no UI, no crash).
- **Solo se activa el toggle si el perfil tiene al menos un step válido** (validación en el editor).

### 3.7 Hotkeys globales

- **Por perfil**: `Hotkey string` (formato "ctrl+shift+1").
- **UI**: campo de texto con validación en el side-panel del editor, o un "record key" (pulsar combinación y se rellena).
- **Backend** (`internal/app/launcher/hotkey_windows.go`): registra con `RegisterHotKey` de Windows al iniciar el Hub; desregistra al cambiar/eliminar.
- **Re-registro tras resume**: hook `WM_POWERBROADCAST` (resume tras suspensión de laptop) re-registra todas las hotkeys de perfil. Idempotente.
- **Reintento si otra app suelta la combinación**: tras detectar que `RegisterHotKey` falló al inicio, se reintenta en eventos de foco de ventana (heurística: cuando el Hub recupera foco, reintentar las hotkeys fallidas).
- **Conflictos**: si `RegisterHotKey` falla (otra app la tiene), se desactiva y se emite `launcher:profile:hotkey:error` con motivo. UI del editor muestra el campo en rojo con mensaje "Esta combinación está en uso por otra app".
- **Prioridad**: hotkeys locales del Hub tienen prioridad. Si la combinación coincide con una local, se desactiva la del perfil al registrar. (Tradeoff documentado en §2 dec.16: la resolución en runtime según foco sería más correcta para el caso "Hub minimizado" pero introduce hooks de foco y message pump en Wails v3 alpha — blast radius mayor que la validación estática.)
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

**Limpieza y watchdog**:
- 3 segundos después de `done`/`error`, la entrada se borra del map → la card vuelve a normal. El `setTimeout` se guarda por `profileId` y se cancela al recibir cualquier evento nuevo de ese perfil (evita que un relanzamiento en los 3s borre la cadena nueva).
- En el `useEffect` cleanup del provider, se cancelan todos los timeouts pendientes y se desuscriben los listeners (evita `setState` sobre estado muerto al desmontar el Hub).
- **Watchdog de evento perdido**: si una entrada de chain está en `running` y pasan 30s sin eventos, se marca `overallStatus: "error"` con message "stale chain" y se borra al cabo de 3s. Cubre pérdida de `chain:done` en Wails v3 alpha.
- Si el Hub se cierra mid-cadena, el `ChainRunner` de Go lo detecta (hook de cierre de la ventana/app de Wails) y cancela explícitamente. No depende solo de la señal de desconexión del cliente (alpha no es fiable).

**Reducer tolerante a desorden/duplicados** (transiciones dirigidas por estado):
- `pending → launching`: solo desde `pending`.
- `launching → done | failed`: solo desde `launching` o `pending` (cubre eventos que llegan desordenados).
- `done | failed` son terminales: si llega otro evento para el mismo `stepIndex`, se ignora (idempotente).
- El `Map<profileId, ChainState>` se actualiza con `new Map(prev); next.set(id, updated)` para preservar la referencia de las entradas no tocadas (habilita `React.memo` por perfil).

**`getChain` con identidad estable**: implementado con `useCallback` en el store y `useSyncExternalStore` (no `useContext` con un `value` recreado). `getChain(id)` no cambia de referencia entre renders; `cancel` también en `useCallback`.

**Rendimiento**:
- `useSyncExternalStore` con store externo evita re-render global del árbol de consumidores en cada step. Solo los perfiles SUSCRITOS a un `profileId` específico re-renderizan cuando su entrada cambia.
- El countdown se renderiza con `useEffect` + `setInterval` LOCAL al sub-componente `ProfileCard.Timeline`, no en el store.
- `useMemo` para el orden de perfiles en el dock; el comparador es estable.

**`active map` en el backend previene doble-lanzamiento** (en `ChainRunner.StartChain`):
- Si `active[profileID]` ya existe, se rechaza el segundo `StartChain` con un evento `launcher:chain:error` con message "perfil ya en curso". El frontend lo muestra como toast. No encola.
- El `active[profileID] = cancel` NO sobrescribe un cancel previo; si ya existe, el segundo `StartChain` es rechazado.

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
- Si hay `chain` activa: anillo SVG circular con `stroke-dashoffset` animado, color de categoría del step actual, icono "cancelar" en hover.
- Si no hay chain activa y hay `lastResult` (del `lastResultByProfileId` del store, persistente hasta el próximo lanzamiento): badge sutil en el borde del botón (verde si success, rojo si failed, ámbar si parcial). Esto sobrevive al alt-tab a pantalla completa.
- Si no hay chain ni lastResult: comportamiento actual. Si `isFavorite`, dot dorado.
- **Tooltip** con nombre del perfil y, al hacer hover más de 1s, `launchCount` ("Lanzado N veces") y `lastLaunchedAt` ("hace 2h"). El count NO está en la cara del botón, solo en el tooltip.
- `lastResultByProfileId` se actualiza en el store externo al recibir `chain:done`/`chain:error` y se borra al recibir un nuevo `chain:step` del mismo perfil (inicio de nueva cadena).

### 4.5 AddNonSteamGameModal (estilo Steam)

- **Modal** con: barra de búsqueda, lista del registro Windows (apps instaladas, con icono + nombre + path), **single-select** (una fila clickable a la vez, resaltada), botón "Browse..." (file picker), botones "Cancelar" y "Añadir". Click en una fila la resalta; click en "Añadir" la añade y cierra el modal. Para añadir varias, el usuario repite el modal.
- **Lectura lazy**: al abrir, emite `launcher:registry:list`. El backend lee el registro, devuelve `launcher:registry:listed` con `apps[]`. Skeleton/spinner mientras carga.
- **Filtrado**: `useMemo` con `.includes()` sobre `{id, lowerName, lowerPath}[]` precomputado una vez al cargar la lista. El `query.toLowerCase()` se hace una vez por keystroke; las entradas ya están en lowercase. O(n) por keystroke, n≈10k, ~1-2ms en V8. Sin fuse.js en v1.
- **Cap de render**: primeros **200 matches** se renderizan; si hay más, se muestra un footer "Refina la búsqueda para ver más (N resultados más)". Evita que el DOM se dispare a 10k+ filas en máquinas dev.
- **`args` editable**: tras añadir la app, el usuario puede editar `args` desde el panel "detalles" de la app (decisión 7). El modal de alta deja `args` vacío por defecto; el usuario lo rellena en el detalle.
- **Browse**: file picker nativo (Wails). Fallback al `<input type="file">` actual si Wails v3 alpha.98 no expone diálogo nativo. El .exe elegido se trata como `detected: false` con el path absoluto.
- **Backend nuevo**: `internal/app/launcher/registry_windows.go` lee `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*` + WOW6432Node + HKCU, devuelve `[]RegistryApp` (displayName, executablePath, iconPath).
- **Refactor**: extraer `readUninstallEntries()` a helper compartido entre `discovery_windows.go` y `registry_windows.go`.

### 4.6 Flujo de datos (cadena)

```
Usuario hace click "Lanzar" en ProfileCard o dock
  → Frontend emite "launcher:profile:launch" { id }
  → Backend (ChainRunner.StartChain):
      1. Si active[profileID] ya existe → emite "launcher:chain:error" { message: "perfil ya en curso" } y termina (idempotencia).
      2. Crea context.CancelFunc, registra active[profileID] = cancel.
      3. Por cada step:
         - select { sleep delay; <-ctx.Done() } (cancelación).
         - time.Now() → startedAt.
         - exec.Command(app.ExecutablePath, ...).Start() (fire-and-forget, registra el PID en la chain state).
         - emit "launcher:chain:step" { profileId, stepIndex, appId, status: "launching", startedAt, pid }.
         - **Liveness probe** no bloqueante: tras 1-2s, comprueba `cmd.Process.Signal(syscall.Signal(0))` y, en otro goroutine, `cmd.Wait()` (con timeout 3s). Si el proceso ya salió con código ≠0 antes de los 3s, emite `chain:step` con `status: "failed"` y message "el proceso terminó con código N". Si sale con código 0, emite `status: "done"`. Si sigue vivo a los 3s, emite `status: "done"` (asumimos que arrancó OK; el liveness probe es un best-effort, no bloqueante).
         - Para `steam-uri` (vía `rundll32`), el liveness probe no es fiable: se acepta como `done` sin comprobación. Documentado como limitación.
         - time.Now() → finishedAt.
      4. Si success (todos los steps `done`): RecordProfileSuccess(profileID, durationMs).
      5. SIEMPRE: RecordProfileAttempt(profileID) (count + lastLaunchedAt, éxito o fallo).
      6. emit "launcher:chain:done" { profileId, success }.
      7. delete(active, profileID).

Frontend ChainRunnerProvider:
  → Recibe eventos, actualiza el store externo (Map<profileId, ChainState> con reducer tolerante a desorden).
  → useSyncExternalStore notifica SOLO a los componentes suscritos al profileId que cambió.
  → ProfileCard lee getChain(profile.id) → renderiza Timeline si existe.
  → LauncherDock lee getChain(profile.id) → renderiza anillo de progreso; lee lastResultByProfileId → renderiza badge sutil si no hay chain activa.
  → 3s después del done/error, limpia la entrada del map → ProfileCard vuelve a card normal. El setTimeout se cancela si llega un nuevo chain:step del mismo perfil.
  → Watchdog: 30s sin eventos para una chain running → marca "stale chain" y limpia a los 3s.
  → El toast nativo de Windows con "Reintentar fallidos" emite `launcher:profile:retry:failed` con el profileID del toast.
```

**PIDs registrados**: `ChainRunner` guarda el `cmd.Process.Pid` de cada step en su `ChainState` (no se espera el proceso, pero se guarda el PID para watchdog y "detener todo" futuro). El frontend los recibe en los eventos `chain:step`. Esto habilita diagnóstico futuro ("¿qué procesos lanzó esta cadena?") y un eventual "Kill chain" sin rehacer la arquitectura.

### 4.7 Edge cases

- **Cancelación mid-cadena**: `ctx.CancelFunc()`, pasos restantes en `pending`, emite `chain:error` con message "cancelled". `.exe` ya lanzados siguen (diseño, como Steam). El frontend marca la entrada como `error` y la limpia a los 3s.
- **App no encontrada**: `ChainRunner` valida `app.ExecutablePath` antes de lanzar. Si no existe, emite `chain:step` con `status: "failed"` y message legible.
- **Hub se cierra mid-cadena**: el hook de cierre de ventana/app de Wails cancela explícitamente las cadenas activas (no depende solo de la señal de desconexión del cliente, que en alpha no es fiable). Los `.exe` ya lanzados siguen.
- **Hotkey en conflicto**: `RegisterHotKey` falla → backend marca inactiva + emite `launcher:profile:hotkey:error` → UI del editor muestra error.
- **Auto-launch con exe desinstalado**: Vantare se lanza con `--launch=<profileID>`, valida paths, exit silencioso con log si falla. Si el `profileID` no existe o el `Load` falla, se ignora el flag y Vantare arranca normal (nunca crash en autostart — el bucle de autoarranque es un modo de fallo real que debe evitarse).
- **Save atómico falla (antivirus/OneDrive)**: retry con backoff. Si falla definitivamente, escribe a `app-settings.json.failed` (sidecar) y reintenta en próximo arranque. La próxima cadena no "reintenta" — el sidecar se aplica al iniciar.
- **Race de telemetría vs edición**: `sync.Mutex` en `SettingsService` serializa todos los `Set*`. No hay TOCTOU.
- **Doble-lanzamiento del mismo perfil**: `active[profileID]` ya existe → `chain:error` con message "perfil ya en curso". Frontend muestra toast.
- **Eventos Wails desordenados o duplicados**: el reducer del store externo aplica transiciones dirigidas por estado (§4.2). `done` antes de `launching` se acepta como `done`; un segundo `done` se ignora (idempotente).
- **`chain:done` perdido**: el watchdog de 30s marca la entrada como `stale chain` y la limpia.

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

**Colores por categoría** (alineados con WIDGET-STUDIO-09; **audio cambiado a cian para evitar colisión con el verde de `done`**):
- `simulator` → `#ff3b3b` (rojo Vantare).
- `streaming` → `#302e31` (gris oscuro).
- `audio` → `#06b6d4` (cian, evita colisión semántica con `done` verde).
- `telemetry` → `#f59e0b` (ámbar MoTeC-like).
- `utility` → `#3b82f6` (azul CrewChief-like).

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
- **Fallback al toast del Hub** cuando:
  - El SO no soporta notificaciones (modo kiosk, sin Action Center).
  - **El usuario desactivó notificaciones para Vantare** en Configuración de Windows. Esto se detecta consultando el estado vía API WinRT (`UserNotificationListener` o registry). En ese caso, el toast del Hub pasa a ser el primario, no el fallback.
  - Vantare detecta que está en fullscreen detrás de un juego (heurística: el Hub no está visible Y hay un proceso de juego en foreground). En ese caso, el toast del Hub tampoco será visible, pero el **badge "último resultado" en el dock** (§4.4) sí sobrevive.
- El toast del Hub es un componente propio (no Wails), posicionado en la esquina superior derecha, con la misma API que el toast nativo (éxito/parcial/error + botón "Reintentar fallidos").

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
| `settings_service_test.go` | `TestSettingsMigratesLegacyAppSettings`, `TestLoadToleratesCorruptedJSON` (carga JSON truncado → cae a `.bak`), `TestLoadFallsBackToDefaultsOnTotalCorruption` (`.bak` también corrupto → defaults, no crash), `TestAtomicSave` (escritura a `app-settings.json.tmp` + rename, simulación de AV bloqueando), `TestSaveFailedSidecar` (3 reintentos fallidos → sidecar creado), `TestSidecarAppliedOnStartup` (sidecar presente al inicio → se aplica), `TestSettingsWriteMutex` (dos `SetLauncherProfiles` concurrentes no se pisan), `TestRecordProfileAttemptAlways` (count sube en éxito Y en fallo), `TestRecordProfileSuccessOnlyOnFullSuccess` (avg solo en éxito total), `TestRecordProfileSuccessEMA` (alpha=0.3 sobre varios valores). |
| `launcher/chain_test.go` | `TestChainRunnerMeasuresWallClock`, `TestChainRunnerCancellation` (cancela mid-chain, pasos restantes pending), `TestChainRunnerFailureDoesNotUpdateAvg` (cadena con fallo → no se llama RecordProfileSuccess, SÍ RecordProfileAttempt), `TestChainRunnerRejectsDoubleLaunch` (segundo StartChain del mismo perfil es rechazado), `TestChainRunnerLivenessProbeCatchesCrash` (stub exec que arranca y muere en <2s → step marcado failed), `TestChainRunnerSteamUriAcceptedWithoutProbe` (steam-uri marcado done sin comprobación). |
| `launcher/registry_windows_test.go` (nuevo) | `TestReadUninstallEntries`, `TestReadUninstallEntriesFiltersEmpty`. |
| `launcher/discovery_windows_test.go` | `TestParseLibraryFolders`, `TestDiscoverFindsOBS`, `TestDiscoverAlwaysIncludesLMU`. |
| `launcher/autostart_windows_test.go` (nuevo) | `TestRegisterUnregisterAutostart` (idempotente), `TestUnregisterClearsEntry`, `TestAutostartWithUnknownProfileID` (`--launch=<inexistente>` → no crash, entrada del registro eliminada). |
| `launcher/hotkey_windows_test.go` (nuevo) | `TestParseHotkeyString`, `TestHotkeyConflictDoesNotCrash`, `TestHotkeyReregistrationIdempotent` (registrar 2 veces = 1 efecto). |
| `cmd/vantare/main_test.go` | `TestHandleRegistryList`, `TestHandleProfileStatsSave`, `TestHandleAutostartToggle`, `TestHandleHotkeySet`, `TestHandleProfileRetryFailed`, `TestHandleWindowCloseCancelsChains` (hook de cierre cancela cadenas activas). |
| `diagnostics_service_test.go` | Sanitización de los nuevos campos: `isFavorite`, `notes`, `launchCount`, `lastLaunchedAt`, `avgChainDurationMs`, `launchOnWindowsStartup`, `hotkey`. `notes` y `args` se redactan (paths libres del usuario no se filtran en logs/diagnósticos). |

### 6.2 Frontend

| Archivo | Tests |
|---|---|
| `launcher/launcher-state.test.ts` | `TestEstimateChainDuration`, `TestEstimateChainDurationPrefersReal` (si avgChainDurationMs presente, se prefiere). |
| `launcher/chain-store.test.ts` (nuevo, store externo) | `TestStoreUpdatesOnStepEvent`, `TestStoreReducerIsTolerantToOutOfOrder` (`done` antes de `launching` se acepta), `TestStoreReducerIsIdempotent` (segundo `done` para mismo step se ignora), `TestStoreClearsAfter3s` (avanzar tiempo, entrada borrada), `TestStoreClearsTimeoutOnNewStep` (relanzamiento en <3s no borra la cadena nueva), `TestStoreWatchdogMarksStaleChain` (30s sin eventos → error + limpieza), `TestStoreCleanupsOnUnmount` (timeouts cancelados). |
| `launcher/chain-store.subscribe.test.ts` (nuevo) | `TestUseSyncExternalStoreOnlyRerendersSubscribed` (un `ProfileCard` suscrita a un profileId no re-renderiza cuando cambia OTRO profileId). |
| `launcher/ProfileCard.test.tsx` | Renderiza Timeline cuando chain activo, muestra avg/last en cara, count en tooltip, favorita, falta app. |
| `launcher/ProfileCard.timeline.test.tsx` (nuevo) | Renderiza steps, anima launching, muestra Cancelar y countdown, keys estables (no remount por step). |
| `launcher/AddNonSteamGameModal.test.tsx` (nuevo) | Lazy load, búsqueda con pre-lowercase, cap de render a 200 matches, single-select, Browse abre picker, Add emite entry con `args` editable en detalle. |
| `launcher/AppsPanel.test.tsx` | Toggle favorita, abre modal Add, panel de detalles permite editar `args`. |
| `launcher/ProfileEditor.test.tsx` (side-panel) | Campos notes, hotkey, autostart. Validación de hotkey contra whitelist. Toggle autostart deshabilitado si perfil sin steps válidos. |
| `components/LauncherDock.test.tsx` | Perfil en curso con anillo, lastResult badge sutil, favoritos primero, count en tooltip, dot dorado. |
| `i18n/i18n.test.ts` | Paridad de nuevas keys en es/en/pt/it. |
| `launcher/ProfileCard.timeline.a11y.test.tsx` (nuevo) | `aria-live`, `aria-label` en Cancelar, `prefers-reduced-motion` con fallback manual `matchMedia` (test de la lógica de detección, no del runtime Wails). |

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

## 7. Plan de ejecución (9 cortes)

Cada corte compila, pasa sus tests, y se puede verificar manualmente antes del siguiente. El corte 0 se parte en 0a/0b para reducir el blast radius del Save atómico (pieza de mayor riesgo de fiabilidad).

| # | Corte | Alcance | Verificación |
|---|---|---|---|
| **0a** | **Structs + migración aditiva** | Añadir campos a structs Go y TS. `SchemaVersion` en `AppSettings`. Hook `migrateSettings()` no-op. Tipos TSX. `Load` con fallback a `.bak` y defaults. | `go test`, `pnpm test`, `tsc`, `lint`. Settings v1 cargan OK. JSON corrupto no crashea. |
| **0b** | **Save atómico aislado** | Atomic write (`tmp` + `os.Rename`). Backup rotativo a `.bak`. Sidecar `.failed`. Retry con backoff. `sync.Mutex` de escritura. `SchemaVersion` se setea a 1 en el primer Save. | `go test ./internal/app/...` con tests de atomicidad, sidecar, mutex, AV bloqueando. Verificar que `app-settings.json` se renombra atómicamente. |
| 1 | **Discovery fix + parser Steam** | Implementar `readSteamLibraryFolders` correctamente. Refactor `readUninstallEntries` a helper compartido entre `discovery_windows.go` y `registry_windows.go`. | Discovery devuelve OBS, Spotify, Discord, etc. en Windows. `go test`. |
| 2 | **Menú Add Non-Steam Game (single-select)** | Backend `registry_windows.go`. Frontend `AddNonSteamGameModal` con búsqueda (pre-lowercase) + cap 200 + single-select + Browse. `args` editable en panel de detalles. Integrar en `AppsPanel`. | Modal abre, lista apps del registro, búsqueda filtra, single-select funciona, Browse abre picker, apps añadidas tienen `args` editable en detalles. Visual compare. |
| 3 | **Favoritos y notas** | Toggle favorita (app y perfil) en `AppBadge` y `ProfileCard` (badge + orden en grilla, sin sección separada). Campo `notes` en `ProfileEditor`. Dock prioriza favoritos con dot dorado. | Click en estrella persiste. Notas se guardan. Dock reordena. Visual compare. |
| 4 | **Telemetría (backend-only)** | `RecordProfileAttempt` y `RecordProfileSuccess` en Go. EMA en chain runner. `SchemaVersion` ya está. UI NO se toca aquí. | Test Go: count sube en éxito Y en fallo; avg solo en éxito total; EMA converge con alpha=0.3. `go test ./internal/app/launcher/...`. |
| 5 | **Cadena en vivo (UI + store + telemetry UI)** | Store externo con `useSyncExternalStore`. Reducer tolerante a desorden. Watchdog. Liveness probe en Go. Eventos con `startedAt`/`finishedAt`/`pid`. `ProfileCard` se transforma con early return. UI pinta telemetría (lastLaunchedAt, avg, count en tooltip). Mini-timeline con Motion. Cancelar siempre visible. `active map` rechaza doble-lanzamiento. | Lanzar perfil: card se transforma, telemetría visible, dock retiene lastResult. Cancelar detiene. Relanzar en <3s no borra la cadena nueva. 30s sin eventos → stale chain. Visual compare. |
| 6 | **Dock sincronizado** | `DockProfileButton` con anillo SVG durante cadena + badge sutil de `lastResult` (verde/rojo/ámbar) persistente hasta relanzar. Tooltip con count. | Dock muestra progreso en vivo + lastResult tras cadena. Click en Cancelar (también desde el dock) detiene. |
| 7 | **Auto-launch + hotkeys + cierre robusto** | `autostart_windows.go` con `HKCU\...\Run` + parseo defensivo de `--launch=`. `hotkey_windows.go` con `RegisterHotKey` + re-registro en `WM_POWERBROADCAST` + whitelist. Hook de cierre de ventana cancela cadenas. | Marcar auto-launch, reiniciar Windows, Vantare lanza perfil. Asignar hotkey, minimizar Hub, pulsar hotkey, perfil se lanza. Cerrar Hub mid-cadena cancela. |

**Dependencias**: 0a → 0b → (1, 2, 3, 4). (1, 2, 3, 4) → 5. 5 → 6. 5 → 7 (la cancelación del cierre de ventana se hace junto con auto-launch/hotkeys porque comparten el módulo de integración con Windows).

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
2. AppsPanel muestra las 7 apps detectadas con badge de categoría, detectada/manual, toggle de favorita, panel de detalles con path y `args` editables. Modal "Add Non-Steam Game" (single-select) añade apps del registro o con Browse.
3. ProfileCard muestra nombre, descripción, tiempo total (estimado o real con `≈`), apps horizontal con delay, badge lanzable/falta app, lastLaunchedAt y avgChainDurationMs en cara, count en tooltip, favorito, notas (en editor side-panel). Se transforma en mini-timeline durante la cadena; card vuelve a normal a los 3s, dock retiene lastResult hasta relanzar.
4. LauncherDock prioriza favoritos, muestra anillo de progreso en perfiles en curso y badge sutil de lastResult persistente. Suscripción selectiva: un `DockProfileButton` no re-renderiza cuando cambia otra cadena. Tooltip con count + lastLaunchedAt.
5. Cadena ejecuta steps con delays, mide wall-clock, liveness probe detecta crash post-Start, cancela con context, watchdog marca stale chain a los 30s, rechaza doble-lanzamiento. `RecordProfileAttempt` se llama siempre; `RecordProfileSuccess` solo en éxito total. EMA alpha=0.3.
6. Auto-launch: toggle por perfil, entrada en `HKCU\...\Run`, parseo defensivo de `--launch=` (perfil inexistente o JSON corrupto → no crash, entrada eliminada). Vantare respeta `--launch=<profileID>` al inicio.
7. Hotkeys: campo por perfil, registro con `RegisterHotKey`, whitelist de combinaciones reservadas, re-registro en `WM_POWERBROADCAST` (resume), conflicto se desactiva estáticamente y avisa.
8. Persistencia atómica: `app-settings.json` se escribe vía `tmp` + rename, `.bak` rotativo, sidecar `.failed`, retry con backoff, mutex de escritura, `SchemaVersion` y hook de migración. Load tolera JSON corrupto (cae a `.bak` o defaults, no crash).
9. Accesibilidad: `role="status"` + `aria-live`, focus management, contraste WCAG AA, `prefers-reduced-motion` con fallback manual `matchMedia`.
10. Motion: 200-300ms, ease-out, solo transform/opacity, GPU, 1 elemento por perfil.
11. i18n: paridad de las nuevas keys en es/en/pt/it.
12. Tests: cobertura nueva (Go y TS) sigue convenciones del repo. Tests obligatorios pasan: Load tolerante a JSON corrupto, doble `StartChain` rechazado, `RecordProfileAttempt` en fallo, liveness probe de `.exe` que crashea, `--launch` con args malformados, watchdog de evento perdido, sidecar aplicado en arranque, mutex de escritura, reducer tolerante a desorden, cleanup con `clearTimeout` por profileId, store solo re-renderiza suscriptores.
13. Visual compare: script captura los estados clave (incluye lastResult en dock y stale chain), exit 0, sin regresiones.
14. Cancelación robusta: cerrar el Hub mid-cadena cancela las cadenas activas vía hook de cierre de Wails; los `.exe` ya lanzados siguen (diseño).
15. PIDs registrados: cada step expone el `pid` del proceso lanzado en el evento `chain:step` para watchdog y "detener todo" futuro.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Parser `libraryfolders.vdf` falla en formatos raros. | Test con fixtures de varios formatos. Fallback: log + continuar sin apps de Steam. |
| Listado del registro tiene 50k+ entradas en máquinas de developers. | v1: leer al abrir, pre-lowercase, cap de render a 200 matches + "refina para ver más". Si duele, v2 con virtualización. |
| `RegisterHotKey` choca con hotkeys del sistema o de otros launchers. | Validación al asignar con whitelist de combinaciones seguras. Si falla, deshabilitar + avisar. Re-registro tras resume. |
| Auto-launch con `--launch=<profileID>` si el path de una app ya no existe, o si el profileID no existe, o si el JSON está corrupto. | Parseo defensivo: si el flag está malformado, se ignora. Si el perfil no existe, se elimina la entrada del registro. Si el `Load` falla, exit silencioso (nunca crash en autostart — el bucle de autoarranque es un modo de fallo real). |
| `Save` atómico falla por antivirus/OneDrive/Indexador. | Retry con backoff (3 intentos). Si falla definitivamente, sidecar `app-settings.json.failed` que se aplica en el próximo arranque del Hub. Mutex de escritura serializa todos los `Set*` para evitar TOCTOU. |
| JSON corrupto preexistente (OneDrive sync conflict, AV cortó un write anterior). | Backup rotativo `.bak`; `Load` cae a `.bak` si el principal falla; si `.bak` también falla, defaults + log crítico (no crash). |
| Motion en docks con muchos perfiles (50+) causa jank. | `useSyncExternalStore` con suscripción selectiva: un `DockProfileButton` solo re-renderiza cuando cambia SU entrada. `React.memo` con comparador por `profileId`. |
| Wails v3 alpha.98 puede tener bugs en eventos (tarde, perdidos, duplicados, desordenados). | Store externo con reducer tolerante a desorden (transiciones dirigidas por estado). Watchdog de 30s para evento `chain:done` perdido. Cleanup con `clearTimeout` por `profileId` evita que un relanzamiento borre la cadena nueva. Tests de edge cases obligatorios. |
| `prefers-reduced-motion` no detectado en Wails. | Fallback manual con `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. Test de la lógica de detección (no del runtime Wails). |
| Doble-lanzamiento del mismo perfil (doble click). | `active map` en backend rechaza el segundo `StartChain` con `chain:error` "perfil ya en curso". Frontend muestra toast. |
| Crash de `.exe` post-`Start()` (DLL faltante, runtime ausente) marcado como `done` erróneamente. | Liveness probe no bloqueante (1-2s signal + 3s wait con timeout). Si el proceso murió con código ≠0, step marcado `failed`. Limitación documentada: `steam-uri` vía `rundll32` no es comprobable. |
| Pérdida de telemetría por cierre del Hub entre `chain:done` y `RecordProfileAttempt/Success`. | Las escrituras de telemetría son síncronas antes del `emit("chain:done")`; el mutex garantiza atomicidad con ediciones concurrentes. El sidecar cubre pérdida de Save por AV. |
| Notificaciones de Windows desactivadas para Vantare (toast nativo "traga" en silencio). | Detección vía API WinRT. Si está off, toast del Hub pasa a primario. Adicional: dock retiene `lastResult` hasta relanzar, así sobrevive aunque el toast no se vea. |

---

## 10. Fuera de alcance v1 (diferido a v2)

- Búsqueda fuzzy (fuse.js) en AppsPanel y AddNonSteamGameModal.
- Virtualización completa de listas (v1 usa cap de 200 matches).
- Multiselect en AddNonSteamGameModal (v1 es single-select por decisión de mantenibilidad).
- Sección "Favoritos" separada en la página (v1 usa badge + orden en grilla).
- Drag & drop para reordenar steps (v1 usa botones ↑/↓).
- "Lanzado N veces" en la cara de la card (v1 lo pone en tooltip).
- Resolución de hotkey en runtime según foco (v1 usa desactivación estática).
- Importar/exportar perfiles como JSON.
- Plantillas de perfil.
- Sincronización entre dispositivos (Supabase).
- Notificación de "perfil listo" en el system tray (badge en dock cubre el caso de alt-tab).
- Estadísticas de uso avanzadas (gráficos, top apps).
- "Kill chain" (matar todos los procesos de una cadena). v1 registra PIDs; v2 lo implementa.
