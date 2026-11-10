# Hub Electron — paso 1

VANTA-138, issue #1995, ADR 0107. Esqueleto aislado del núcleo real.
Solo está disponible `Hello` del anfitrión simulado; Ajustes aún no guarda datos.

Bun 1.4.4, versiones exactas en package.json y bun.lock. En este servidor:

```powershell
$env:BUN_INSTALL_CACHE_DIR='D:/VantareServer/cache/bun'
$env:ELECTRON_CACHE='D:/VantareServer/cache/electron'
$env:VANTARE_HUB_DATA_DIR='D:/VantareServer/qa/isa-1995'
$env:VANTARE_HUB_HOST='mock'
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
bun run package
```

`release/package/vantare-hub-ui-win32-x64/vantare-hub-ui.exe` es una carpeta
QA, sin instalador, firma, despliegue ni integración con el supervisor.
Los fuses se aplican a esa copia, nunca al Electron compartido en node_modules.

`bun run dev:web` permite trabajar sin Rust; `bun run dev` abre Electron.
La CSP bloquea WebSocket de HMR: recargar para ver cambios, sin relajar la política.
El renderer empaquetado usa exclusivamente `app://hub/` y assets locales.
Todos los permisos y ventanas nuevas están denegados en este primer paso.
El preload aislado entrega un MessagePort sin exponer ipcRenderer.
La entrega del puerto usa window.postMessage: un MessagePort no atraviesa
contextBridge como valor de retorno de una promesa.

Electron 45.2.3 figura como Latest Stable (4-nov-2026) en
https://releases.electronjs.org/release/v45.2.3.
Windows 10 22H2: pendiente prueba manual por Isaac en equipo o VM:
arranque, fuentes de respaldo, controles de ventana y escalados 100/125/150 %.
La ejecución en Windows Server no acredita Windows 10.

Referencia GPUI: el binario existente en targets/isa-1993-baseline/debug no
incluye parity-capture; capture-native.ps1 sale con código 2 y pide recompilar.
No se modificó el Hub congelado ni se reutilizó su target para construir.
