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

Paso 2b: `?escena=specimen` reúne los controles Base UI con aspecto Vantare.
`VANTARE_HUB_TEST_SCENE=specimen bun run smoke` verifica diálogos, foco, slider,
tabla virtual (1000 filas), aislamiento y axe sobre el paquete.
`VANTARE_HUB_THEME_SHEET=1` añade los 18 temas; `VANTARE_HUB_SCALE` permite
1, 1.25 o 1.5 mediante el escalado de Electron y registra devicePixelRatio.

Axe usa setLegacyMode porque Electron CDP no permite crear la pestaña auxiliar
del modo habitual. No se excluyen reglas ni se permiten fallos serious/critical.
La región desplazable de la tabla tiene foco de teclado; una excepción local
a noNoninteractiveTabindex documenta esta necesidad verificada por axe.
Los espacios de virtualización son pseudoelementos y no añaden filas ARIA.

El lint JSX usa @babel/parser (solo desarrollo): TypeScript 7 no ofrece la
antigua API del compilador y una expresión regular confundía tipos TS y JSX.
Base UI publica directivas use client: Rolldown advierte de que se descartan;
todo este renderer es cliente y no hay React Server Components. El log completo
del build se conserva en la evidencia. Specimen se carga con React.lazy.

Para mantener también la caché de transformación de Bun en D:, fijar
BUN_RUNTIME_TRANSPILER_CACHE_PATH=D:/VantareServer/cache/bun-transpiler.
