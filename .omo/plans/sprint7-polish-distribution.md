# Sprint 7 — Polish + Distribution

## TL;DR

> **Quick Summary**: Sprint 7 delivers all remaining polish and distribution features — system tray with real icon and rich context menu, global keyboard shortcuts (Alt+H), auto-start with start-minimized mode, auto-updater via electron-updater + GitHub Releases configuration, HTTP server hardening (port config, network access mode, port conflict handling), Electron Builder verification, and first `.exe` build (v1.0.0-beta.1). The app becomes shippable to end users.
>
> **Deliverables**:
> - Icon assets (`docs/assets/icon.ico`, `docs/assets/icon.png`, `docs/assets/icon.svg`)
> - `build/` directory with Electron Builder resources
> - System Tray con icono real + menú completo (Show/Hide, Toggle Overlays, Recording, Settings, Quit)
> - Global shortcuts: `globalShortcut.register()` para toggle overlays (default Alt+H)
> - Auto-start: `app.setLoginItemSettings()` con cleanup al desactivar
> - Auto-updater real (`electron-updater`, dev-mode no-op)
> - HTTP Server: puerto desde store, host configurable por networkAccess, port conflict handling
> - IPC handlers faltantes (`updates:check`, `updates:install`, `system:toggle-visibility`)
> - Cleanup en quit (unregister shortcuts, stop server, stop sim, destroy tray)
> - electron-builder.yml mejorado (per-user, icon paths, verificado)
> - Primer `.exe` build exitoso
> - Tests: unit tests + Playwright E2E + QA evidence
>
> **Estimated Effort**: Large (13 tareas across 4 waves + final)
> **Parallel Execution**: YES — 4 waves + final
> **Critical Path**: T1 (icon/assets) → T3 (tray) → T4 (shortcuts) → T5 (autostart) → T9 (builder) → T10 (build)

---

## Context

### Original Request
"Hagamos un plan para poder implementar el sprint 7 extensamente" — último sprint de polish antes de testing y release.

### Interview Summary
**Estado Actual (Pre-Sprint 7)**:
- ✅ System Tray básico (empty icon, menu solo Show + Quit)
- ✅ Bridge tipos definidos: toggleOverlayVisibility, minimizeToTray, checkForUpdates, installUpdate, openExternal, getVersion
- ✅ Preload expone todos los métodos bridge
- ✅ Store schema con defaults: autostart, startMinimized, overlayVisibilityKey, autoUpdate, updateChannel, httpServerPort, networkAccess
- ✅ HTTP Server con SSE (http-server.ts)
- ✅ OverlayManager (overlay-manager.ts)
- ✅ SimManager con lifecycle completo
- ✅ TelemetryRecorder (NDJSON streaming)
- ✅ electron-updater v6.3.0 en dependencias
- ✅ electron-builder.yml con GitHub provider
- ✅ 30 tests unitarios + 3 E2E specs
- ✅ Storybook v8.6 inicializado
- ✅ AutoUpdater class skeleton (stub vacío)

**Gaps identificados**:
- ❌ Tray icon placeholder (nativeImage.createEmpty())
- ❌ Menú tray incompleto (solo Show + Quit)
- ❌ globalShortcut.register() nunca llamado
- ❌ app.setLoginItemSettings() nunca llamado
- ❌ AutoUpdater es stub vacío
- ❌ IPC handlers: updates:check, updates:install, system:toggle-visibility NO existen → CRASH
- ❌ HTTP Server: puerto 3200 hardcodeado, host 127.0.0.1 hardcodeado
- ❌ Port conflict: EADDRINUSE no manejado, Promise cuelga
- ❌ build/ directory no existe
- ❌ icon.ico no existe
- ❌ Sin cleanup en quit (httpServer.stop, simManager.stop, globalShortcut.unregisterAll)
- ❌ No hay GitHub Actions
- ❌ No se ha hecho build .exe

### Metis Review
**Hallazgos Críticos**:
- **🚨 IPC handlers faltantes**: `updates:check`, `updates:install`, `system:toggle-visibility` sin handler → CRASH al llamar desde renderer
- **🚨 Port conflict**: `server.listen()` sin manejo de EADDRINUSE → Promise nunca se resuelve
- **🔴 Cleanup en quit**: httpServer.stop(), simManager.stop(), globalShortcut.unregisterAll(), tray.destroy() no se llaman
- **🔴 Auto-updater no-op en dev**: debe chequear `app.isPackaged` antes de contactar GitHub
- **🟡 Double shortcut**: cambiar overlayVisibilityKey no desregistra shortcut viejo
- **🟡 startMinimized**: mainWindow.show() siempre se llama, no chequea settings

### Decisiones de Diseño Resueltas

| Decisión | Valor | Justificación |
|---|---|---|
| Tray icon | Placeholder SVG/ICO "V" | Mínimo para build, reemplazable |
| Atajo global | Alt+H por defecto, configurable | Store ya tiene overlayVisibilityKey |
| Auto-start | Configurable, default false | Store ya tiene autostart: false |
| NSIS installer | Per-user (quitar perMachine:true) | Auto-start sin admin |
| Shortcut cleanup | Unregister viejo al cambiar | Evita shortcuts duplicados |
| startMinimized | Iniciar en tray sin ventana | Skip mainWindow.show() |
| Autostart cleanup | setLoginItemSettings(false) al desactivar | Limpieza completa |
| Test methodology | Tests-after (implement → tests → QA) | Práctico para system features |
| Update channel | Stable solo v1 | Beta/canary post-MVP |

---

## Work Objectives

### Core Objective
Sprint 7 delivers all remaining polish and distribution features — system tray, global shortcuts, auto-start, auto-updater, HTTP server hardening, Electron Builder verification, and first `.exe` build — making the app shippable to end users.

### Concrete Deliverables
- `docs/assets/icon.ico` + `docs/assets/icon.png` (placeholder "V")
- `build/` directory con Electron Builder resources
- `apps/desktop/src/main/index.ts` — Actualizado: tray real, shortcuts, auto-start, cleanup
- `apps/desktop/src/main/ipc/handlers.ts` — 3 nuevos handlers (updates:check, updates:install, system:toggle-visibility)
- `apps/desktop/src/main/updates/auto-updater.ts` — Implementación real con electron-updater
- `apps/desktop/src/main/server/http-server.ts` — Port desde store, host configurable, port conflict handling
- `apps/desktop/electron-builder.yml` — perMachine removido, icon paths correctos
- `apps/desktop/e2e/sprint7-*.spec.ts` — Tests E2E
- `apps/desktop/src/main/ipc/__tests__/handlers.test.ts` — Handler tests actualizados
- `release/Vantare Overlays Setup 1.0.0-beta.1.exe` — Primer .exe (beta)
- `apps/desktop/electron-builder.yml` — GitHub publish config (provider, owner, repo, draft)
- GitHub Release draft created (manual publish en Sprint 8)

### Definition of Done
- [ ] `pnpm test` pasa (tests existentes + 15+ tests nuevos)
- [ ] `pnpm typecheck` pasa sin errores
- [ ] `pnpm build` pasa sin errores
- [ ] `pnpm package` produce `.exe` en `release/`
- [ ] System Tray con icono real + menú completo (Show/Hide, Toggle Overlays, Recording, Settings, Quit)
- [ ] Alt+H togglea overlays globalmente
- [ ] Auto-start funcional (registro en Windows startup)
- [ ] Auto-updater: checkUpdates retorna null en dev, update real en producción
- [ ] HTTP Server: puerto configurable, network mode funcional, port conflict graceful
- [ ] IPC handlers faltantes NO causan crash
- [ ] Cleanup completo en quit (shortcuts, server, sim, tray)
- [ ] QA evidence guardada en `.omo/evidence/sprint7/`

### Must Have
- Icon file existente en `docs/assets/icon.ico` y `docs/assets/icon.png`
- System Tray con menu completo funcional
- `globalShortcut.register()` para Alt+H (o el configurado en settings)
- `app.setLoginItemSettings()` llamado en app init con valor de settings.autostart
- AutoUpdater: no-op en dev, electron-updater real en prod, graceful failure en network errors
- HTTP Server: puerto desde `settings.httpServerPort`, host = `0.0.0.0` si `networkAccess=true`, sino `127.0.0.1`
- Port conflict: try/catch con log + reject de promise
- Cleanup en quit: unregister shortcuts, stop server, stop sim, destroy tray
- `system:toggle-visibility`: toggle all overlay windows hide/show
- `system:minimize-to-tray`: hide all windows, create tray if not exists

### Must NOT Have (Guardrails)
- **NO** modificar renderer UI (Settings page, Hub, overlays)
- **NO** agregar macOS/Linux platform-specific code
- **NO** over-engineering en auto-updater (sin progress bars, sin prompts en v1)
- **NO** OBS WebSocket auto-discovery
- **NO** code signing (post-MVP)
- **NO** GitHub Actions workflows
- **NO** modificar shared bridge types existentes
- **NO** cambiar overlays existentes (standings, relative, delta bar, stream alerts)
- **NO** modificar sim-core o auth packages
- **NO** agregar dependencias externas nuevas

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES — Vitest, Playwright, 30 tests existentes
- **Automated tests**: Tests-after (implement → then write tests)
- **Framework**: Vitest (unit), Playwright Electron (E2E)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.omo/evidence/sprint7/task-{N}-{scenario}.{ext}`.
- **System Tray**: Playwright Electron — verify menu items exist, clicking menu items sends IPC
- **Global Shortcuts**: Playwright Electron — register shortcut, send key combo, verify behavior
- **Auto-Start**: Bash — verify setLoginItemSettings called with correct args (mock)
- **Auto-Updater**: Unit test with mock autoUpdater — verify check/install flows
- **HTTP Server**: Vitest — verify port config, host switching, port conflict handling
- **IPC Handlers**: Vitest — verify new handlers exist and return expected types
- **Build**: Bash — verify `pnpm build` + `pnpm package` succeed

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — build infra + critical fixes):
├── T1: Icon assets + build/ directory + electron-builder config
├── T2: IPC handlers faltantes (updates:check, updates:install, system:toggle-visibility)
└── T3: AutoUpdater implementation + cleanup on quit

Wave 2 (System features — max parallel):
├── T4: System Tray completo (icono real + menú rico)
├── T5: Global shortcuts (Alt+H + settings-driven + unregister on change)
├── T6: Auto-start + startMinimized
└── T7: Cleanup on quit (unregister, stop server, stop sim, destroy tray)

Wave 3 (HTTP Server + Builder):
├── T8: HTTP Server: port desde store, networkAccess host, port conflict handling
├── T9: Settings change propagation (autostart cleanup, port restart, shortcut re-register)
└── T10: Electron Builder verification + .exe build

Wave 4 (Testing):
├── T11: Unit tests + handler tests
├── T12: Playwright E2E tests
└── T13: QA evidence + full test suite pass and close-out

Wave FINAL:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T4 → T10 (build path)
               T1 → T2 → T11 (test path)
               T3 → T7 → T9 (cleanup path)
```

### Dependency Matrix
- **T1 → T4, T10**: Icon assets needed for tray and builder
- **T2 → T11, T12**: IPC handlers needed before testing
- **T3 → T7, T12**: AutoUpdater needed for cleanup tests
- **T4 → T7**: Tray needed for cleanup
- **T5 → T7**: Shortcuts needed for cleanup
- **T8 → T9**: HTTP server needed for settings propagation
- **T9**: Requires T4, T5, T6, T8 (all features that have configurable settings)
- **T11**: Requires T2, T3 (handlers + updater)
- **T12**: Requires T4, T5, T6, T8 (all features)
- **F1-F4**: All T1-T13 done

---

## TODOs

### Wave 1 — Foundation + Critical Fixes

- [ ] 1. **Icon assets + build directory + electron-builder config** — `docs/assets/`, `build/`, `electron-builder.yml`

  **What to do**:
  - Crear directorio `docs/assets/` si no existe
  - Generar placeholder icon:
    - SVG simple con letra "V" en un círculo, exportar como `icon.svg`
    - Convertir a PNG 256×256 (o 512×512) → `icon.png`
    - Convertir a ICO (múltiples tamaños: 16, 32, 48, 256) → `icon.ico`
    - Herramienta: usar `sharp` CLI o un script Node simple para generar PNG desde SVG, luego convertir a ICO con `png-to-ico` o manual
  - Crear directorio `build/` en `apps/desktop/` con `build/icon.ico` (o configurar correcto path)
  - Modificar `electron-builder.yml`:
    - Quitar `perMachine: true` de NSIS (instalación per-user)
    - Verificar que `icon: docs/assets/icon.ico` apunte al archivo real
    - Verificar `directories.buildResources: build` exista
  - Agregar `"postinstall": "electron-builder install-app-deps"` a `apps/desktop/package.json` si no existe
  - Verificar que `pnpm build` compila correctamente

  **Must NOT do**:
  - NO subir archivos binarios grandes (>1MB)
  - NO cambiar appId, productName, o provider de publish

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Asset generation + config changes, operación mecánica
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T2, T3
  **Blocks**: T4 (tray necesita icon), T10 (builder necesita config)
  **Blocked By**: None

  **References**:
  - `apps/desktop/electron-builder.yml` — Config to modify
  - `docs/assets/` — Target directory for icons
  - `build/` — Target directory for build resources

  **Acceptance Criteria**:
  - [ ] `docs/assets/icon.ico` exists and is a valid ICO file
  - [ ] `docs/assets/icon.png` exists (≥256×256)
  - [ ] `build/` directory exists
  - [ ] `electron-builder.yml` has `perMachine: false` (or removed)
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Icon files exist
    Tool: Bash
    Steps: Test-Path docs/assets/icon.ico, Test-Path docs/assets/icon.png
    Expected Result: Both true
    Evidence: .omo/evidence/sprint7/task1-icons.txt

  Scenario: Build compiles
    Tool: Bash (pnpm)
    Steps: cd apps/desktop && pnpm build
    Expected Result: Exit 0, dist/ directory created
    Evidence: .omo/evidence/sprint7/task1-build.log
  ```
  **Commit**: YES
  - Message: `chore(build): add icon assets and configure electron-builder`
  - Files: `docs/assets/icon.ico`, `docs/assets/icon.png`, `apps/desktop/electron-builder.yml`

- [ ] 2. **IPC handlers faltantes** — `apps/desktop/src/main/ipc/handlers.ts`

  **What to do**:
  - Agregar handler para `updates:check`:
    ```typescript
    ipcMain.handle('updates:check', async (): Promise<UpdateInfo | null> => {
      // Import AutoUpdater, call .checkForUpdates()
      // Return UpdateInfo | null
    });
    ```
  - Agregar handler para `updates:install`:
    ```typescript
    ipcMain.handle('updates:install', async (): Promise<void> => {
      // Call autoUpdater.quitAndInstall()
    });
    ```
  - Agregar handler para `system:toggle-visibility`:
    ```typescript
    ipcMain.handle('system:toggle-visibility', (): boolean => {
      // Toggle all BrowserWindows (excluyendo mainWindow si está oculta)
      // Si alguna overlay está visible → ocultar todas
      // Si todas están ocultas → mostrar mainWindow
      // Return new visibility state
    });
    ```
  - Importar tipos necesarios: `UpdateInfo` desde bridge types
  - Verificar que los 3 handlers existen con `grep` en handlers.ts
  - NO remover handlers existentes

  **Must NOT do**:
  - NO cambiar handlers existentes (settings, profiles, auth, themes, etc.)
  - NO modificar bridge.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Agregar 3 handlers siguiendo pattern existente
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T1, T3
  **Blocks**: T11 (handler tests), T12 (E2E tests)
  **Blocked By**: None

  **References**:
  - `apps/desktop/src/main/ipc/handlers.ts` — File to modify
  - `shared/types/bridge.ts:UpdateInfo` — Type to return
  - `apps/desktop/src/preload/index.ts:69-72` — Preload calls that need handlers

  **Acceptance Criteria**:
  - [ ] `ipcMain.handle('updates:check', ...)` exists
  - [ ] `ipcMain.handle('updates:install', ...)` exists
  - [ ] `ipcMain.handle('system:toggle-visibility', ...)` exists
  - [ ] `pnpm typecheck` passes
  - [ ] No preload method crashes due to missing handler

  **QA Scenarios**:
  ```
  Scenario: All 3 missing handlers exist
    Tool: Bash (grep)
    Steps: grep -E "ipcMain\.handle\('(updates:check|updates:install|system:toggle-visibility)'" handlers.ts
    Expected Result: All 3 patterns found
    Evidence: .omo/evidence/sprint7/task2-handlers.txt

  Scenario: Typecheck passes
    Tool: Bash
    Steps: pnpm typecheck --filter=desktop
    Expected Result: Exit 0
    Evidence: .omo/evidence/sprint7/task2-typecheck.log
  ```
  **Commit**: YES (groups with T3)
  - Message: `fix(ipc): add missing IPC handlers (updates:check, updates:install, toggle-visibility)`
  - Files: `apps/desktop/src/main/ipc/handlers.ts`

- [ ] 3. **AutoUpdater implementation + GitHub Releases config + cleanup on quit** — `apps/desktop/src/main/updates/auto-updater.ts`, `apps/desktop/src/main/index.ts`, `apps/desktop/electron-builder.yml`

  **What to do**:
  - En `apps/desktop/electron-builder.yml`:
    - Agregar configuración de `publish`:
      ```yaml
      publish:
        provider: github
        owner: vantare
        repo: overlays
        draft: true
        prerelease: false
      ```
    - Verificar que `appId` y `productName` están correctos
  - En `apps/desktop/src/main/updates/auto-updater.ts`:
    - Implementar AutoUpdater class con electron-updater:
      ```typescript
      import { autoUpdater } from 'electron-updater';
      import { app } from 'electron';

      export class AutoUpdater {
        private initialized = false;

        init(): void {
          if (!app.isPackaged) return; // no-op en dev
          autoUpdater.autoDownload = true;
          autoUpdater.autoInstallOnAppQuit = true;
          this.initialized = true;
        }

        async checkForUpdates(): Promise<UpdateInfo | null> {
          if (!app.isPackaged || !this.initialized) return null;
          try {
            const result = await autoUpdater.checkForUpdates();
            if (!result || !result.updateInfo) return null;
            return {
              version: result.updateInfo.version,
              downloadUrl: '', // electron-updater maneja download internamente
              releaseDate: result.updateInfo.releaseDate,
              releaseNotes: result.updateInfo.releaseNotes,
            };
          } catch {
            return null; // Graceful: network error, 404, etc.
          }
        }

        installUpdate(): void {
          if (!app.isPackaged) return;
          autoUpdater.quitAndInstall();
        }
      }
      ```
    - El `init()` debe llamarse desde `app.whenReady()` en `index.ts`
  - En `apps/desktop/src/main/index.ts`:
    - Importar AutoUpdater, llamar `init()` en `app.whenReady()`
    - Wire AutoUpdater instance para que handlers.ts pueda usarlo
    - Agregar cleanup en app quit:
      ```typescript
      app.on('before-quit', () => {
        isQuitting = true;
        globalShortcut.unregisterAll();
        httpServer?.stop();
        simManager?.stop();
        tray?.destroy();
        tray = null;
      });
      ```

  **Must NOT do**:
  - NO agregar download progress UI
  - NO hacer auto-update checks periódicos (solo on-demand via IPC)
  - NO publicar a GitHub Releases automáticamente (usar `draft: true`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: electron-updater integration + lifecycle management
  - **Skills**: None needed

  **Parallelization**: Can run in parallel with T1, T2
  **Blocks**: T7 (cleanup needs stop methods), T11 (tests need updater)
  **Blocked By**: None

  **References**:
  - `apps/desktop/src/main/updates/auto-updater.ts` — Stub to replace
  - `apps/desktop/src/main/index.ts` — Main entry to wire
  - `node_modules/electron-updater` — electron-updater API
  - `shared/types/bridge.ts:UpdateInfo` — Return type

  **Acceptance Criteria**:
  - [ ] `AutoUpdater.init()` es no-op cuando `app.isPackaged === false`
  - [ ] `checkForUpdates()` retorna `null` (no crash) en dev mode
  - [ ] `checkForUpdates()` retorna `null` en network errors (mock)
  - [ ] `installUpdate()` es no-op en dev mode
  - [ ] Cleanup en quit: unregisterAll, stop, destroy llamados
  - [ ] `pnpm typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: AutoUpdater no-op in dev mode
    Tool: Bun test with mock
    Steps: new AutoUpdater().checkForUpdates() when isPackaged=false
    Expected Result: Returns null, no network call
    Evidence: .omo/evidence/sprint7/task3-dev-mode.log

  Scenario: Cleanup on quit
    Tool: grep
    Steps: grep "globalShortcut.unregisterAll\|httpServer?.stop\|simManager?.stop\|tray?.destroy" index.ts
    Expected Result: All 4 cleanup calls found
    Evidence: .omo/evidence/sprint7/task3-cleanup.txt
  ```
  **Commit**: YES (groups with T2, T7)
  - Message: `feat(app): implement auto-updater with electron-updater`
  - Files: `apps/desktop/src/main/updates/auto-updater.ts`, `apps/desktop/src/main/index.ts`

### Wave 2 — System Features

- [ ] 4. **System Tray completo** — `apps/desktop/src/main/index.ts`

  **What to do**:
  - Reemplazar `createTray()` en `index.ts`:
    ```typescript
    function createTray(): void {
      const iconPath = path.join(__dirname, '../../docs/assets/icon.png');
      const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      tray = new Tray(trayIcon);

      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Vantare', click: () => mainWindow?.show() },
        { label: 'Hide Vantare', click: () => mainWindow?.hide() },
        { type: 'separator' },
        {
          label: 'Toggle Overlays',
          click: () => mainWindow?.webContents.send('system:toggle-visibility'),
        },
        { type: 'separator' },
        {
          label: isRecording ? 'Stop Recording' : 'Start Recording',
          click: () => {
            if (isRecording) {
              simManager?.stopRecording();
            } else {
              simManager?.startRecording();
            }
            updateTrayMenu();
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          click: () => {
            mainWindow?.show();
            mainWindow?.webContents.send('navigate', '/settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => { isQuitting = true; app.quit(); },
        },
      ]);
      tray.setToolTip('Vantare Overlays');
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => mainWindow?.show());
    }
    ```
  - La función `createTray()` debe:
    - Crear el icon desde `docs/assets/icon.png` (o icon.ico para Windows)
    - Construir menú contextual completo con todos los items arriba
    - Manejar actualización dinámica del label "Start Recording" ↔ "Stop Recording"
    - Si el icon file no existe en producción, fallback a `nativeImage.createEmpty()` para no crashear
  - El menú "Settings" envía un evento IPC que el Hub debe escuchar para navegar a /settings
  - Al cerrar ventana (window close event): en lugar de cerrar, ocultar a tray (ya existe en index.ts:49-54)
  - Asegurar que tray se crea ANTES de que se oculte la ventana en modo startMinimized

  **Must NOT do**:
  - NO modificar el Hub Layout o renderer (navegación vía IPC event)
  - NO crear tray más de una vez (guardar en variable global)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: System tray con menú dinámico y comunicación IPC
  - **Skills**: None needed

  **Parallelization**: Depends on T1 (needs icon)
  **Blocks**: T7 (cleanup needs tray.destroy), T9 (settings propagation)
  **Blocked By**: T1 (icon files)

  **References**:
  - `apps/desktop/src/main/index.ts:58-69` — Current tray stub
  - `electron.Tray` docs — Menu, click events, tooltip
  - `apps/desktop/docs/assets/icon.png` — Icon file from T1

  **Acceptance Criteria**:
  - [ ] Tray icon visible (not empty) in system tray
  - [ ] Menu has: Show, Hide, Toggle Overlays, Recording, Settings, Quit
  - [ ] "Toggle Overlays" sends IPC event to renderer
  - [ ] Recording label updates dynamically
  - [ ] Clicking "Settings" shows main window + navigates to /settings
  - [ ] X button minimizes to tray (doesn't quit)
  - [ ] Double-click tray shows main window

  **QA Scenarios**:
  ```
  Scenario: Tray menu items exist
    Tool: Playwright Electron
    Steps: Launch app, right-click tray icon
    Expected Result: Menu shows all 7+ items
    Evidence: .omo/evidence/sprint7/task4-tray-menu.png

  Scenario: Minimize to tray on close
    Tool: Playwright Electron
    Steps: Close main window via X button
    Expected Result: Window hides, tray remains, process continues
    Evidence: .omo/evidence/sprint7/task4-minimize.txt
  ```
  **Commit**: YES
  - Message: `feat(app): add system tray with icon and rich context menu`
  - Files: `apps/desktop/src/main/index.ts`

- [ ] 5. **Global shortcuts** — `apps/desktop/src/main/index.ts`

  **What to do**:
  - Agregar función `registerGlobalShortcuts()` en `index.ts`:
    ```typescript
    import { globalShortcut } from 'electron';

    let registeredShortcut: string | null = null;

    function registerGlobalShortcuts(): void {
      const settings = getStore().get('settings');
      const shortcutKey = settings.overlayVisibilityKey || 'Alt+H';

      // Unregister previous if exists
      if (registeredShortcut) {
        globalShortcut.unregister(registeredShortcut);
      }

      // Register new shortcut
      globalShortcut.register(shortcutKey, () => {
        // Toggle all overlay windows
        BrowserWindow.getAllWindows().forEach((win) => {
          if (win !== mainWindow) {
            if (win.isVisible()) win.hide();
            else win.show();
          }
        });
      });

      registeredShortcut = shortcutKey;
    }
    ```
  - Llamar `registerGlobalShortcuts()` en `app.whenReady()` después de initAppStore()
  - Crear función `updateGlobalShortcut(newKey: string)` que:
    - Unregister old
    - Register new
    - Actualiza `registeredShortcut`
  - Exponer `updateGlobalShortcut` para que handlers.ts pueda llamarlo cuando cambie settings.overlayVisibilityKey
  - Cleanup: `globalShortcut.unregisterAll()` en before-quit (T7)

  **Must NOT do**:
  - NO hardcodear Alt+H (leer de store)
  - NO registrar shortcuts antes de que app esté ready

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Patrón simple de register/unregister
  - **Skills**: None needed

  **Parallelization**: Depends on T2 (needs store initialized), T7 (needs unregister)
  **Blocks**: T7 (cleanup needs shortcuts), T9 (settings propagation)
  **Blocked By**: T2 (indirect - store ready)

  **References**:
  - `apps/desktop/src/main/index.ts` — Main process
  - `apps/desktop/src/main/store.ts:AppStoreSchema.settings.overlayVisibilityKey` — Shortcut key config
  - `electron.globalShortcut` docs — register/unregister API

  **Acceptance Criteria**:
  - [ ] Alt+H toggles overlay windows visibility
  - [ ] Changing overlayVisibilityKey via store updates shortcut
  - [ ] Old shortcut is unregistered when key changes
  - [ ] Shortcut does nothing if no overlays exist
  - [ ] `pnpm typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Alt+H toggles overlay visibility
    Tool: Playwright Electron
    Steps: Create overlay window, press Alt+H
    Expected Result: Overlay toggles visibility
    Evidence: .omo/evidence/sprint7/task5-shortcut.txt

  Scenario: Shortcut key change works
    Tool: Bun test
    Steps: Set overlayVisibilityKey='Alt+G', call updateGlobalShortcut('Alt+G'), press Alt+G
    Expected Result: Alt+G toggles overlays, Alt+H does nothing
    Evidence: .omo/evidence/sprint7/task5-shortcut-change.log
  ```
  **Commit**: YES
  - Message: `feat(app): add global keyboard shortcuts (Alt+H toggle overlays)`
  - Files: `apps/desktop/src/main/index.ts`

- [ ] 6. **Auto-start + startMinimized** — `apps/desktop/src/main/index.ts`

  **What to do**:
  - Crear función `applyAutoStartSettings()` en `index.ts`:
    ```typescript
    function applyAutoStartSettings(): void {
      const settings = getStore().get('settings');
      app.setLoginItemSettings({
        openAtLogin: settings.autostart,
        path: app.getPath('exe'),
      });
    }
    ```
  - Llamar `applyAutoStartSettings()` en `app.whenReady()` después de initAppStore()
  - Modificar `createMainWindow()` para soportar `startMinimized`:
    - Después de `mainWindow.once('ready-to-show', ...)`, chequear:
      ```typescript
      const settings = getStore().get('settings');
      if (settings.startMinimized) {
        mainWindow?.hide(); // No mostrar, solo tray
      } else {
        mainWindow?.show();
      }
      ```
    - Si `startMinimized` es true, asegurar que tray se crea ANTES de ocultar mainWindow
  - Crear función pública `updateAutoStart(enabled: boolean)` para que handlers.ts pueda llamarla cuando cambie settings.autostart:
    ```typescript
    function updateAutoStart(enabled: boolean): void {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
      });
    }
    ```

  **Must NOT do**:
  - NO hardcodear valores de autostart
  - NO llamar setLoginItemSettings antes de app.whenReady()

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: app.setLoginItemSettings + conditional window show
  - **Skills**: None needed

  **Parallelization**: Independent (can run in parallel with T4, T5, T7)
  **Blocks**: T7 (cleanup), T9 (settings propagation)
  **Blocked By**: None

  **References**:
  - `apps/desktop/src/main/index.ts` — Main process
  - `apps/desktop/src/main/store.ts:AppStoreSchema.settings.autostart` — Store key
  - `electron.app.setLoginItemSettings` docs

  **Acceptance Criteria**:
  - [ ] `app.setLoginItemSettings()` llamado con valor de settings.autostart
  - [ ] Si autostart=false → openAtLogin=false
  - [ ] Si startMinimized=true → app inicia sin ventana (solo tray)
  - [ ] Si startMinimized=false → app inicia con ventana visible
  - [ ] `updateAutoStart(true)` actualiza login item settings
  - [ ] `updateAutoStart(false)` limpia login item settings
  - [ ] `pnpm typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Auto-start settings applied
    Tool: Bun test (mock app.setLoginItemSettings)
    Steps: Set autostart=true, call applyAutoStartSettings()
    Expected Result: setLoginItemSettings llamado con openAtLogin=true
    Evidence: .omo/evidence/sprint7/task6-autostart.log

  Scenario: Start minimized launches without window
    Tool: Playwright Electron
    Steps: Set startMinimized=true, launch app
    Expected Result: Tray icon visible, no main window shown
    Evidence: .omo/evidence/sprint7/task6-start-minimized.png
  ```
  **Commit**: YES
  - Message: `feat(app): add auto-start and start-minimized mode`
  - Files: `apps/desktop/src/main/index.ts`

- [ ] 7. **Cleanup on quit** — `apps/desktop/src/main/index.ts`

  **What to do**:
  - Implementar cleanup completo en `app.on('before-quit')`:
    ```typescript
    app.on('before-quit', () => {
      globalShortcut.unregisterAll();
      httpServer?.stop();
      simManager?.stop();
      if (tray) {
        tray.destroy();
        tray = null;
      }
    });
    ```
  - Asegurar que `app.on('window-all-closed')` NO llame `app.quit()` en Windows (porque el tray debe mantener el proceso vivo):
    ```typescript
    app.on('window-all-closed', () => {
      // En Windows, no quit cuando cierran todas las ventanas
      // El proceso sigue vivo en la bandeja del sistema
      if (process.platform !== 'darwin') {
        // Don't quit - app lives in tray
      }
    });
    ```
  - El quit real solo debe ocurrir cuando:
    - Usuario hace clic en "Quit" del menú tray (isQuitting = true)
    - app.quit() es llamado explícitamente
  - Verificar que `isQuitting = true` en:
    - Tray menu "Quit" click handler
    - `before-quit` event handler

  **Must NOT do**:
  - NO llamar app.quit() en window-all-closed (Windows)
  - NO llamar cleanup dos veces (guard en isQuitting)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Cleanup orchestration, straightforward
  - **Skills**: None needed

  **Parallelization**: Depends on T4 (tray), T5 (shortcuts), T6 (autostart)
  **Blocks**: None (final wiring step for system features)
  **Blocked By**: T4 (tray.destroy), T5 (shortcuts.unregisterAll)

  **References**:
  - `apps/desktop/src/main/index.ts` — Main process
  - `apps/desktop/src/main/server/http-server.ts:158` — stop() method
  - `apps/desktop/src/main/sim/sim-manager.ts:220` — stop() method

  **Acceptance Criteria**:
  - [ ] `before-quit` handler calls: unregisterAll, stop, destroy
  - [ ] `window-all-closed` does NOT call app.quit() on Windows
  - [ ] App quits cleanly from tray menu "Quit"
  - [ ] No errors in console on quit
  - [ ] `pnpm typecheck` passes

  **QA Scenarios**:
  ```
  Scenario: Cleanup on quit is thorough
    Tool: Bash (grep)
    Steps: grep "unregisterAll\|httpServer?.stop\|simManager?.stop\|tray?.destroy" index.ts
    Expected Result: All 4 cleanup calls present in before-quit
    Evidence: .omo/evidence/sprint7/task7-cleanup.txt

  Scenario: Window close doesn't quit app
    Tool: Playwright Electron
    Steps: Close all windows, check if process continues
    Expected Result: Process stays alive (tray visible)
    Evidence: .omo/evidence/sprint7/task7-window-close.txt
  ```
  **Commit**: YES (groups with T2, T3)
  - Message: `fix(app): add cleanup on quit (shortcuts, server, sim, tray)`
  - Files: `apps/desktop/src/main/index.ts`

### Wave 3 — HTTP Server + Builder

- [ ] 8. **HTTP Server: port desde store, networkAccess host, port conflict handling** — `apps/desktop/src/main/server/http-server.ts`

  **What to do**:
  - Modificar `HttpServer` class para leer settings del store:
    - `this.port = settings.httpServerPort || 3200`
    - `this.host = settings.networkAccess ? '0.0.0.0' : '127.0.0.1'`
  - Agregar port conflict handling:
    ```typescript
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`HTTP Server: port ${this.port} in use, disabling`);
        this.server = null;
        reject(err);
      }
    });
    ```
  - En `index.ts`, manejar reject gracefulmente:
    ```typescript
    await httpServer.start().catch(() => console.warn('HTTP disabled'));
    ```
  - Agregar método `restart()` que lee settings frescos del store y reinicia
  - Exponer `HttpServer.restart()` para handlers.ts

  **Must NOT do**:
  - NO cambiar SSE endpoint (/events) o overlay SPA pages

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Depends on T2
  **Blocks**: T9
  **Blocked By**: T2

  **References**:
  - `apps/desktop/src/main/server/http-server.ts` — Refactor
  - `apps/desktop/src/main/store.ts:AppStoreSchema.settings`

  **Acceptance Criteria**:
  - [ ] Puerto desde `settings.httpServerPort`
  - [ ] Host = `0.0.0.0` cuando `networkAccess=true`
  - [ ] Host = `127.0.0.1` cuando `networkAccess=false`
  - [ ] Port conflict: server disabled, app continúa
  - [ ] `restart()` funciona
  - [ ] Tests existentes pasan

  **QA Scenarios**:
  ```
  Scenario: Port from store
    Tool: Bun test
    Steps: Set httpServerPort=3201, create server
    Expected Result: Listens on port 3201
    Evidence: .omo/evidence/sprint7/task8-port.log

  Scenario: Port conflict graceful
    Tool: Bun test
    Steps: Start 2 servers on same port
    Expected Result: 2nd rejects, no crash
    Evidence: .omo/evidence/sprint7/task8-conflict.log
  ```
  **Commit**: YES
  - Message: `feat(server): configurable HTTP server port and network access mode`
  - Files: `apps/desktop/src/main/server/http-server.ts`, `apps/desktop/src/main/index.ts`

- [ ] 9. **Settings change propagation** — `apps/desktop/src/main/ipc/handlers.ts`, `apps/desktop/src/main/index.ts`

  **What to do**:
  - Modificar `settings:save` handler para propagar cambios:
    - `autostart` → `updateAutoStart(bool)` en index.ts
    - `overlayVisibilityKey` → `updateGlobalShortcut(key)` en index.ts
    - `httpServerPort` o `networkAccess` → `httpServer.restart()`
  - En `index.ts`, exportar funciones callback que handlers.ts pueda llamar
  - NO bloquear save si propagación falla

  **Must NOT do**:
  - NO cambiar Settings type existente

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None needed

  **Parallelization**: Depends on T4, T5, T6, T8
  **Blocks**: T10
  **Blocked By**: T4, T5, T6, T8

  **Acceptance Criteria**:
  - [ ] Cambio autostart propaga a setLoginItemSettings
  - [ ] Cambio shortcut desregistra viejo, registra nuevo
  - [ ] Cambio port reinicia HTTP server
  - [ ] Save retorna aunque propagación falle

  **QA Scenarios**:
  ```
  Scenario: Autostart propagation
    Tool: Bun test
    Steps: Save autostart=true → setLoginItemSettings(true)
    Expected Result: Called with correct value
    Evidence: .omo/evidence/sprint7/task9-propagation.log
  ```
  **Commit**: YES
  - Message: `feat(app): propagate settings changes (autostart, shortcuts, port)`
  - Files: `apps/desktop/src/main/index.ts`, `handlers.ts`

- [ ] 10. **Electron Builder verification + first .exe build (v1.0.0-beta.1)** — `apps/desktop/`

  **What to do**:
  - Verificar `electron-builder.yml` completo y correcto (incluyendo publish config)
  - Verificar `build/` directory existe con recursos
  - Verificar que `version` en `apps/desktop/package.json` es `1.0.0-beta.1`
  - `pnpm build` → `dist/` correcto: dist/main, dist/preload, dist/renderer
  - `pnpm package` → .exe en `release/Vantare Overlays Setup 1.0.0-beta.1.exe`
  - NO firmar, NO publicar a GitHub (draft config preparado pero no ejecutado)

  **Must NOT do**:
  - NO pushear release/ a git

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Depends on T1, T2-T9
  **Blocks**: T12, T13
  **Blocked By**: T1, T2-T9

  **Acceptance Criteria**:
  - [ ] `pnpm build` exit 0
  - [ ] `pnpm package` exit 0
  - [ ] .exe en `release/`

  **QA Scenarios**:
  ```
  Scenario: Build and package
    Tool: pnpm
    Steps: cd apps/desktop && pnpm build && pnpm package
    Expected Result: Both exit 0, .exe exists
    Evidence: .omo/evidence/sprint7/task10-package.log
  ```
  **Commit**: NO (.exe no se commitea)

### Wave 4 — Testing

- [ ] 11. **Unit tests + handler tests** — `apps/desktop/src/main/ipc/__tests__/handlers.test.ts`, `apps/desktop/src/main/updates/__tests__/auto-updater.test.ts`

  **What to do**:
  - Handler tests: system:toggle-visibility, updates:check, updates:install, system:minimize-to-tray
  - AutoUpdater tests: no-op dev, check null en network error, check retorna UpdateInfo, install llama quitAndInstall
  - HTTP server tests: port config, host switching, port conflict
  - Actualizar tests existentes si es necesario

  **Must NOT do**:
  - NO modificar tests no relacionados

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None needed

  **Parallelization**: Depends on T2, T3
  **Blocks**: T13
  **Blocked By**: T2, T3

  **Acceptance Criteria**:
  - [ ] Handler tests pasan
  - [ ] AutoUpdater tests pasan
  - [ ] HTTP server tests pasan
  - [ ] `pnpm test --filter=desktop` pasa

  **QA Scenarios**:
  ```
  Scenario: All handler tests pass
    Tool: vitest
    Steps: pnpm test --filter=desktop -- src/main/ipc/__tests__/handlers.test.ts
    Expected Result: All pass
    Evidence: .omo/evidence/sprint7/task11-handler-tests.log
  ```
  **Commit**: YES
  - Message: `test(app): add unit and handler tests for sprint 7`
  - Files: test files

- [ ] 12. **Playwright E2E tests** — `apps/desktop/e2e/sprint7-*.spec.ts`

  **What to do**:
  - E2E spec: tray menú, shortcuts, auto-updater mock
  - Usar `_electron: electron` fixture de Playwright
  - Seguir patrones de `sprint6-hub.spec.ts`

  **Must NOT do**:
  - NO depender de GitHub Releases reales

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: playwright

  **Parallelization**: Depends on T2, T3, T4, T5
  **Blocks**: T13
  **Blocked By**: T2, T3, T4, T5

  **Acceptance Criteria**:
  - [ ] 3 specs creados
  - [ ] `pnpm test:e2e` compila

  **QA Scenarios**:
  ```
  Scenario: E2E tests compile
    Tool: pnpm
    Steps: pnpm test:e2e --list
    Expected Result: Lists specs
    Evidence: .omo/evidence/sprint7/task12-e2e-list.txt
  ```
  **Commit**: YES
  - Message: `test(e2e): add Playwright E2E tests for sprint 7`
  - Files: `apps/desktop/e2e/sprint7-*.spec.ts`

- [ ] 13. **QA evidence + full test suite pass** — `.omo/evidence/sprint7/`

  **What to do**:
  - Ejecutar todos los QA scenarios
  - Evidencia en `.omo/evidence/sprint7/task-{N}-{scenario}.{ext}`
  - Crear `.omo/evidence/sprint7/README.md`
  - Verificar: `pnpm test`, `pnpm typecheck`, `pnpm build` pasan

  **Must NOT do**:
  - NO falsificar evidencia

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: playwright

  **Parallelization**: Depends on T11, T12
  **Blocks**: F1-F4
  **Blocked By**: T11, T12

  **Acceptance Criteria**:
  - [ ] `pnpm test` pasa
  - [ ] `pnpm typecheck` pasa
  - [ ] `pnpm build` pasa
  - [ ] Evidencia completa

  **QA Scenarios**:
  ```
  Scenario: Full test suite passes
    Tool: pnpm
    Steps: pnpm test
    Expected Result: All pass
    Evidence: .omo/evidence/sprint7/task13-full-test-suite.log
  ```
  **Commit**: YES
  - Message: `chore(sprint7): add QA evidence and final test suite pass`
  - Files: `.omo/evidence/sprint7/README.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan and verify: Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `pnpm test`. Check: unused imports, console.log in prod, commented-out code, any regressions.

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Execute EVERY QA scenario from EVERY task. Test cross-task integration. Edge cases: port conflict, network mode, double shortcut, autostart toggle. Save to `.omo/evidence/sprint7/final-qa/`.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.

---

## Commit Strategy

- **T1**: `chore(build): add icon assets and configure electron-builder`
- **T2**: `fix(ipc): add missing IPC handlers (updates:check, updates:install, toggle-visibility)`
- **T3**: `feat(app): implement auto-updater with electron-updater and GitHub publish config`
- **T4**: `feat(app): add system tray with icon and rich context menu`
- **T5**: `feat(app): add global keyboard shortcuts (Alt+H toggle overlays)`
- **T6**: `feat(app): add auto-start and start-minimized mode`
- **T7**: `fix(app): add cleanup on quit (shortcuts, server, sim, tray)`
- **T8**: `feat(app): configurable HTTP server port and network access mode`
- **T9**: `feat(app): propagate settings changes (autostart, shortcuts, port)`
- **T10**: `chore(build): produce first .exe (v1.0.0-beta.1)`
- **T11**: `test(app): add unit and handler tests for sprint 7 features`
- **T12**: `test(e2e): add Playwright E2E tests for sprint 7 features`
- **T13**: `chore(sprint7): add QA evidence and final test suite pass`

---

## Success Criteria

### Verification Commands
```bash
pnpm typecheck      # Expected: 0 errors
pnpm test           # Expected: all tests pass
pnpm build          # Expected: exit 0, dist/ created
pnpm package        # Expected: .exe in release/
```

### Final Checklist
- [ ] All Must Have items checked in F1 audit
- [ ] All Must NOT Have items absent (verified in F1)
- [ ] All tests pass
- [ ] First .exe build exists
