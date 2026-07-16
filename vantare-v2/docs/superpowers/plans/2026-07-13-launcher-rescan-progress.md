# Launcher Rescan Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescanear aplicaciones una vez al entrar en Launcher y mostrar la barra A con progreso híbrido real de 0 a 100 sin degradar los logos visibles.

**Architecture:** El backend emitirá checkpoints ligeros por `launcher:discovery:progress`; el snapshot completo seguirá siendo la única fuente de apps y se emitirá al finalizar. El store compartido absorberá snapshot y progreso, deduplicará comandos síncronamente para React Strict Mode y expondrá hooks separados. Un componente pequeño interpolará el valor confirmado y `AppsPanel` lo integrará sobre la lista.

**Tech Stack:** Go, Wails events, React 19, TypeScript estricto, `useSyncExternalStore`, Tailwind/CSS existente, Vitest/Testing Library y Playwright existente. Sin dependencias nuevas.

---

## Límites

- Leer antes de editar: `AGENTS.md`, `docs/current-plan.md`, `docs/agent-workflow.md` y `docs/superpowers/specs/2026-07-13-launcher-rescan-progress-design.md`.
- Rama obligatoria: `vantareapp/isa-9-launcher`; base y PR: `develop`; no merge.
- No cambiar discovery, selección/ranking de assets, extracción de iconos, tarjetas, perfiles o dock.
- No incluir `.superpowers/`, capturas, builds ni binarios en commits.

### Task 1: Contrato y checkpoints reales en Go

**Files:**
- Modify: `internal/app/launcher/snapshot.go`
- Modify: `internal/app/launcher/launcher.go`
- Modify: `internal/app/launcher/launcher_test.go`
- Modify: `cmd/vantare/main_test.go`

- [ ] **Step 1: Escribir tests fallidos del contrato**

Añadir un emitter que conserve payloads y tests table-driven que exijan esta secuencia en éxito:

```go
want := []struct {
	phase    LauncherDiscoveryPhase
	progress int
	scanning bool
}{
	{DiscoveryStarting, 0, true},
	{DiscoveryDiscovering, 15, true},
	{DiscoveryMerging, 55, true},
	{DiscoveryResolvingIcons, 75, true},
	{DiscoveryComplete, 100, false},
}
```

Comprobar además que error conserva el último progreso, que nunca sale de `0..100` y que un segundo discovery devuelve `ErrDiscoveryInProgress`.

- [ ] **Step 2: Ejecutar el test y confirmar el fallo**

Run: `go test -count=1 ./internal/app/launcher/... ./cmd/vantare/...`

Expected: FAIL porque fases, payload y protección de concurrencia aún no existen.

- [ ] **Step 3: Añadir el contrato mínimo**

En `snapshot.go` definir nombres estables:

```go
type LauncherDiscoveryPhase string

const (
	DiscoveryStarting       LauncherDiscoveryPhase = "starting"
	DiscoveryDiscovering    LauncherDiscoveryPhase = "discovering"
	DiscoveryMerging        LauncherDiscoveryPhase = "merging"
	DiscoveryResolvingIcons LauncherDiscoveryPhase = "resolving-icons"
	DiscoveryComplete       LauncherDiscoveryPhase = "complete"
	DiscoveryError          LauncherDiscoveryPhase = "error"
)

type LauncherDiscoveryProgress struct {
	Scanning bool                   `json:"scanning"`
	Progress int                    `json:"progress"`
	Phase    LauncherDiscoveryPhase `json:"phase"`
	Error    *string                `json:"error"`
}
```

En `Service`, proteger un único discovery con el mutex existente. Crear un helper privado que limite el porcentaje a `0..100`, actualice el estado y emita exclusivamente:

```go
s.emit.Emit("launcher:discovery:progress", progress)
```

Emitir los cinco checkpoints en los límites reales de `DiscoverApps`. No llamar a `Snapshot()` desde esos checkpoints. Mantener el snapshot final en `handleDiscoverApps`.

- [ ] **Step 4: Ejecutar Go tests y formateo**

Run:

```powershell
gofmt -w internal/app/launcher/snapshot.go internal/app/launcher/launcher.go internal/app/launcher/launcher_test.go cmd/vantare/main_test.go
go test -count=1 ./internal/app/launcher/... ./cmd/vantare/...
```

Expected: PASS.

- [ ] **Step 5: Commit backend**

```powershell
git add -- internal/app/launcher/snapshot.go internal/app/launcher/launcher.go internal/app/launcher/launcher_test.go cmd/vantare/main_test.go
git diff --cached --check
git commit -m "feat(launcher): report discovery progress"
```

### Task 2: Bridge/store compartido y deduplicación

**Files:**
- Modify: `frontend/src/hub/launcher/launcher-contract.ts`
- Modify: `frontend/src/hub/launcher/launcher-contract.test.ts`
- Modify: `frontend/src/hub/launcher/launcher-bridge.ts`
- Modify: `frontend/src/hub/launcher/launcher-bridge.test.ts`
- Modify: `frontend/src/hub/launcher/launcher-store.tsx`
- Modify: `frontend/src/hub/launcher/launcher-store.test.tsx`

- [ ] **Step 1: Escribir tests fallidos de bridge/store**

Los tests deben demostrar:

```ts
store.start();
store.start();
expect(bridge.subscribeDiscoveryProgress).toHaveBeenCalledTimes(1);
expect(bridge.requestSnapshot).toHaveBeenCalledTimes(1);

store.discoverApps();
store.discoverApps();
expect(bridge.dispatchLauncherCommand).toHaveBeenCalledTimes(1);
```

Tras recibir `complete` o `error`, una nueva llamada a `discoverApps()` debe volver a emitirse. `stop()` debe limpiar las dos suscripciones de forma idempotente.

- [ ] **Step 2: Ejecutar tests y confirmar el fallo**

Run: `pnpm --dir frontend test -- launcher-contract launcher-bridge launcher-store`

Expected: FAIL por símbolos inexistentes.

- [ ] **Step 3: Implementar contrato y store mínimo**

Añadir el espejo TypeScript exacto:

```ts
export type LauncherDiscoveryProgress = {
  scanning: boolean;
  progress: number;
  phase: "starting" | "discovering" | "merging" | "resolving-icons" | "complete" | "error";
  error: string | null;
};
```

El bridge mantendrá un único listener Wails para `launcher:discovery:progress`, igual que `subscribeSnapshot`. El store añadirá:

```ts
getDiscoveryProgress: () => LauncherDiscoveryProgress | null;
subscribeDiscoveryProgress: (listener: () => void) => () => void;
discoverApps: () => void;
```

`discoverApps()` marcará `discoveryRequested = true` antes de emitir para bloquear el doble efecto de Strict Mode. La bandera solo se libera al recibir `complete` o `error`. Eliminar de `start()` el comando automático antiguo; conservar la suscripción previa al `requestSnapshot()`.

- [ ] **Step 4: Ejecutar tests focalizados**

Run: `pnpm --dir frontend test -- launcher-contract launcher-bridge launcher-store`

Expected: PASS.

- [ ] **Step 5: Commit store**

```powershell
git add -- frontend/src/hub/launcher/launcher-contract.ts frontend/src/hub/launcher/launcher-contract.test.ts frontend/src/hub/launcher/launcher-bridge.ts frontend/src/hub/launcher/launcher-bridge.test.ts frontend/src/hub/launcher/launcher-store.tsx frontend/src/hub/launcher/launcher-store.test.tsx
git diff --cached --check
git commit -m "feat(launcher): share discovery progress state"
```

### Task 3: Barra A, entrada en pestaña e i18n

**Files:**
- Create: `frontend/src/hub/launcher/LauncherScanProgress.tsx`
- Create: `frontend/src/hub/launcher/LauncherScanProgress.test.tsx`
- Modify: `frontend/src/hub/pages/LauncherPage.tsx`
- Modify: `frontend/src/hub/pages/LauncherPage.test.tsx`
- Modify: `frontend/src/hub/launcher/AppsPanel.tsx`
- Modify: `frontend/src/hub/launcher/AppsPanel.test.tsx`
- Modify: `frontend/src/i18n/locales/es.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/pt.ts`
- Modify: `frontend/src/i18n/locales/it.ts`
- Modify: `frontend/src/i18n/i18n.test.ts`

- [ ] **Step 1: Escribir tests fallidos de comportamiento/render**

Cubrir:

```ts
expect(store.discoverApps).toHaveBeenCalledTimes(1); // cada montaje real de LauncherPage
expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
expect(screen.getByTestId("launcher-scan-progress-value")).toHaveTextContent("55%");
expect(screen.getByTestId("apps-rescan")).toBeDisabled();
expect(screen.getByTestId("app-row-lmu")).toBeInTheDocument();
```

Usar timers/RAF falsos para verificar interpolación, 100 % confirmado, salida posterior y reduced motion sin esperar tiempo real.

- [ ] **Step 2: Ejecutar tests y confirmar el fallo**

Run: `pnpm --dir frontend test -- LauncherPage AppsPanel LauncherScanProgress i18n`

Expected: FAIL porque la barra y hooks aún no existen.

- [ ] **Step 3: Disparar discovery al montar la página**

En `LauncherPage` sincronizar el montaje con el sistema externo:

```tsx
const { discoverApps } = useLauncherStore();

useEffect(() => {
  discoverApps();
}, [discoverApps]);
```

Si la identidad del método no es estable, corregir el store; no silenciar la dependencia de `useEffect`.

- [ ] **Step 4: Crear `LauncherScanProgress`**

El componente recibe el payload y usa un hook local con `requestAnimationFrame` para acercarse al target sin superarlo. Cancelar el frame en cleanup. Con reduced motion, saltar al target. El render base será:

```tsx
<div role="status" aria-live="polite" aria-label={`${label}, ${phaseLabel}, ${displayedProgress}%`}>
  <div className="flex items-end justify-between gap-3">
    <div>
      <p className="font-sans text-xs font-medium text-white/90">{label}</p>
      <p className="font-sans text-[11px] text-white/45">{phaseLabel}</p>
    </div>
    <output data-testid="launcher-scan-progress-value" className="font-display text-sm tabular-nums text-white/80">
      {displayedProgress}%
    </output>
  </div>
  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
    <div className="relative h-full rounded-full bg-vantare-red-500 transition-[width] duration-500 ease-out" style={{ width: `${displayedProgress}%` }}>
      <span aria-hidden className="absolute right-0 top-1/2 size-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-vantare-red-400 shadow-[0_0_12px_rgba(255,59,59,.55)] motion-safe:animate-pulse" />
    </div>
  </div>
</div>
```

No añadir gradientes blancos ni CSS HUD. Usar los tokens/fuentes ya existentes.

- [ ] **Step 5: Integrar barra y textos**

Insertar el componente entre la cabecera y `<ul>`. `AppsPanel` debe llamar `discoverApps`, deshabilitar el botón con `disabled={progress?.scanning}` y mantener la lista renderizada. Añadir keys `launcher.apps.scanning`, `launcher.apps.scan.starting`, `discovering`, `merging`, `resolvingIcons`, `complete`, `error` en los cuatro idiomas y verificar paridad.

- [ ] **Step 6: Ejecutar tests y build**

Run:

```powershell
pnpm --dir frontend test -- LauncherPage AppsPanel LauncherScanProgress launcher-store launcher-bridge i18n
pnpm --dir frontend build
```

Expected: PASS.

- [ ] **Step 7: Commit UI**

```powershell
git add -- frontend/src/hub/launcher/LauncherScanProgress.tsx frontend/src/hub/launcher/LauncherScanProgress.test.tsx frontend/src/hub/pages/LauncherPage.tsx frontend/src/hub/pages/LauncherPage.test.tsx frontend/src/hub/launcher/AppsPanel.tsx frontend/src/hub/launcher/AppsPanel.test.tsx frontend/src/i18n/locales/es.ts frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/pt.ts frontend/src/i18n/locales/it.ts frontend/src/i18n/i18n.test.ts
git diff --cached --check
git commit -m "feat(launcher): animate rescan progress"
```

### Task 4: Verificación visual, review y entrega

**Files:**
- Modify if needed: existing Launcher Playwright smoke script only
- Modify: `docs/current-plan.md`

- [ ] **Step 1: Ejecutar suite aplicable**

```powershell
go test -count=1 ./internal/app/launcher/... ./cmd/vantare/...
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
```

No ocultar fallos; atribuir como preexistente solo con archivo y evidencia.

- [ ] **Step 2: Capturas deterministas**

Usar Playwright/navegador real para capturar `starting`, estado intermedio, `complete` y error a 100 %, 125 %, 150 % y 200 %. Confirmar en cada escala que no hay overflow, texto cortado ni logo sustituido. Verificar app conocida, Steam, ejecutable detectado y app manual.

- [ ] **Step 3: Smoke Wails Windows**

Construir según documentos usando el `.env.local` del escritorio sin copiar secretos al repo. Abrir `bin/vantare.exe`, entrar/salir de Launcher, comprobar un reescaneo por entrada y botón bloqueado. Si no es posible, detenerse y documentar el bloqueo según ISA-9.

- [ ] **Step 4: Review sin editar**

Primera pasada solo lectura: revisar contrato Go/TS, carrera de doble scan, cleanup RAF/listeners, reduced motion, accesibilidad, i18n, scope y archivos ajenos. Después corregir únicamente findings reales y repetir tests afectados.

- [ ] **Step 5: Documentar y commit final**

Actualizar `docs/current-plan.md` con causa, comportamiento, checks y riesgos.

```powershell
git add -- docs/current-plan.md
git diff --cached --check
git commit -m "docs(launcher): record rescan progress verification"
```

- [ ] **Step 6: Push, PR y Linear**

Push de `vantareapp/isa-9-launcher`; actualizar el PR existente hacia `develop` sin merge. Mover ISA-9 a In Review solo con evidencia completa. Comentar causa, cambios, archivos, tests, capturas, riesgos, smoke manual y confirmación expresa de **NO merge** y gate de aprobación manual de Isaac.
