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
La documentación oficial declara Windows 10 y posteriores como plataformas admitidas:
https://github.com/electron/electron/blob/main/README.md#platform-support.

Windows 10 22H2: pendiente prueba manual por Isaac en equipo o VM:
arranque, fuentes de respaldo, controles de ventana y escalados 100/125/150 %.
La ejecución en Windows Server no acredita Windows 10.

Referencia GPUI: el binario existente en targets/isa-1993-baseline/debug no
incluye parity-capture; capture-native.ps1 sale con código 2 y pide recompilar.
Después se compiló parity-capture con target propio en D:. La referencia actual
se genera desde D:/VantareServer/qa/isa-1995-reference/capture-bin, en claro y
oscuro, excluyendo once escenas Strategy que el propio binario declara retiradas.
La única adición al Hub congelado es el exportador autorizado.

Paso 2a: `bun run tokens` genera CSS y el tema de Tailwind desde design/tokens.json.
El ejemplo native/hub/examples/export-tokens.rs se usó una sola vez; desde ahora
manda el JSON. `bun run fonts` y `bun run icons` copian recursos propios locales.
Nueve paletas × claro/oscuro; los tests verifican semánticos completos y AA
en textos sobre las dos superficies. `bun run lint:design` comprueba el diseño
y los textos JSX; las salidas generadas se excluyen de formato para conservar
su comprobación byte a byte.

Ajuste web de accesibilidad: `focus-ring` usa `accent-bright` opaco. La selección
traslúcida heredada no llegaba a 3:1 en 15 temas. El token `selection` conserva
el valor exportado y los colores del Hub congelado no cambian.
