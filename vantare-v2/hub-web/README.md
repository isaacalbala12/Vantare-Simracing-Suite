# Hub Electron — ADR 0107

VANTA-138, issue #1995. Interfaz Electron aislada y anfitrión Rust conectado
a los canales existentes. También funciona con el anfitrión simulado.
General y Apariencia leen y guardan sus documentos mediante Rust. El resto de
Ajustes se incorpora en las dos entregas siguientes del diseño.

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
sin instalador, firma ni despliegue. El puente y la preparación del anfitrión
están documentados en `native/hub-host/README.md`.
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

La ruta `?escena=specimen` es una escena de QA incluida en el paquete para revisar controles, paletas y accesibilidad con datos simulados.

## Paquete final y paquete de pruebas

El paquete final de `release/package` rechaza `--remote-debugging-port` y
`--remote-debugging-pipe`. La variable de ejecución no lo habilita: la excepción
se fija al compilar una copia de QA separada, conservando todos los fuses cerrados.
Los smokes usan `playwright-core` 1.65.0 sin runner ni descarga de navegadores.

Después de construir y empaquetar el paquete final con los comandos anteriores:

```powershell
$env:VANTARE_HUB_QA_BUILD='1'
bun run build
bun run package
Remove-Item Env:VANTARE_HUB_QA_BUILD
bun run smoke
```

La copia de QA usa `out-qa` y `release/package-qa`; no sustituye al paquete final.
El smoke comprueba que el final rechaza CDP, dos recargas, aislamiento, bloqueo
de `window.open` y `location.href` hacia un servidor loopback, y tamaño ajustado
al área de trabajo. `VANTARE_HUB_SCALE=1.5` verifica la ventana al 150 %.
El staging de cada variante se limpia antes de copiar, dentro de `release`.

En el smoke del anfitrión, `VANTARE_HUB_QA_CRASH=1` provoca una caída deliberada
del renderer y comprueba la salida de error del anfitrión. Sin esa variable,
comprueba cierre por EOF con salida 0. El paquete de QA nunca se distribuye.

## Ajustes I y QA local

General guarda zoom, densidad, arranque minimizado y avisos. Apariencia guarda
esquema, paleta, contraste, cristal, fuentes y movimiento. Los cambios de
contraste/cristal se previsualizan y se guardan al soltar. El inicio con Windows
usa `installer::engine::shell::sync_running`; sin instalación válida se muestra
desactivado. La UI no lee documentos ni ejecuta comandos del sistema.

El almacén Rust conserva CAS, reintento de la intención y documentos futuros
protegidos del Hub congelado. Descartar olvida la intención sin sobrescribir al
otro escritor. Un fallo de guardado impide cerrar hasta reintentar o descartar.
Si `reducedMotion` ya pertenece al layout, se usa su lector/escritor existente,
sin añadir ese campo a un layout antiguo ni cambiar su versión. La dependencia
temporal de `vantare-ui` está autorizada por D2 y se separa en #1999; no se
inicializa una aplicación GPUI. «Ocultar fuera de pista» y las frecuencias entran
en Ajustes II.

`bun scripts/settings-web.ts` comprueba guardado simulado, zoom, temas, paleta de
comandos con barra recogida, conflicto/reintento, descarte, documento protegido e
incompatibilidad. Ejecutar después del build; usa Chromium instalado con
`bun x playwright-core install chromium`. En este servidor fijar
`PLAYWRIGHT_BROWSERS_PATH=D:/VantareServer/tools/playwright-browsers`.

Para comprobar el anfitrión real con documentos nuevos y una copia empaquetada QA:

```powershell
$env:VANTARE_HUB_HOST_BINARY='D:/VantareServer/qa/isa-1995-host-tools/vantare-hub-host.exe'
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/isa-1995-ajustes-general'
$env:VANTARE_HUB_SETTINGS_TEST='1'
$env:VANTARE_HUB_STARTUP_TEST='1'
$env:VANTARE_HUB_SCALE='1'
bun scripts/smoke-host.ts
```

La prueba de inicio crea metadatos inertes con el fixture canónico del instalador,
un contexto Rust explícito, carpetas de shell bajo QA y una subclave exclusiva
`Software\VantareInstallerMatrix\<id>`. No lanza los ejecutables de relleno ni
escribe en las carpetas de inicio reales. La build del anfitrión debe tener
`qa-e2e`, que exige ese contexto y rechaza usar el registro normal. Para documento
protegido usar `VANTARE_HUB_SETTINGS_PROTECTED=1` sin la prueba de inicio.
Las escalas admitidas son 1, 1.25 y 1.5. Los JSON de resultados separan las pruebas
web de las que realmente escriben desde Rust.

La copia del anfitrión QA debe prepararse dentro de la reserva de compilación con
`native/hub-host/check.ps1 -ArtifactDirectory D:/VantareServer/qa/isa-1995-host-tools`,
según el README del crate. Los smokes no consumen ejecutables de slots liberados.

`scripts/smoke-settings.ts` contrasta el mismo flujo de Ajustes contra el paquete
QA estable, sin copiar una generación. Se ejecuta con Node y acepta las mismas
variables de escala y evidencia; `smoke-host.ts` sigue verificando la generación
instalada y su señal de listo.
