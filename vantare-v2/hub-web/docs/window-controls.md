# Controles de ventana propios

ADR 0107 / VANTA-138; opción A de `00-paridad-visual.md`, autorizada por Isaac.
Tres botones de 46×36, SVG originales de 14 px, color `text3`, sin controles
superpuestos del sistema. Minimizar y maximizar/restaurar actúan en el main;
cerrar sigue pasando por `window.close` y la guardia existente del anfitrión.

El contrato generado v7 añade las solicitudes sin parámetros
`window.minimize` y `window.toggleMaximize` junto al cierre existente. El tema
cerrado `windowState` publica solo `maximized: boolean`; refleja tanto los botones
como los cambios que haga Windows. El renderer no puede publicar ese estado,
elegir otro proceso ni aportar argumentos. Listeners y suscripciones se retiran
al cerrar el puerto o recargar. La firma del registro de pantallas no cambia;
`TitleBar.controls?: ReactNode` es opcional.

| General a 1440×900        | Antes (#2039) |   Después |
| ------------------------- | ------------: | --------: |
| Oscuro, diferencia exacta |     47,1215 % | 46,9650 % |
| Claro, diferencia exacta  |     51,6583 % | 51,4554 % |

Métrica completa RGBA sin máscaras. Pares y diferencias reales Windows en
`D:/VantareServer/evidence/hub-web/visual-window-controls/{dark,light}/ajustes-aplicacion/`.
Snap Layouts al pasar sobre maximizar queda fuera de estos botones HTML, límite
aceptado de la opción A. La maximización normal, restauración y redimensionado
siguen disponibles. Windows 10 continúa pendiente de máquina.

El smoke espera primero el cierre real de la página, desconecta CDP (sin enviar
un cierre al proceso) y exige la salida con 0 dentro del mismo plazo de 10 s.
Mantener el depurador adjunto bloqueaba la terminación en el banco; no se amplía
el plazo ni se desactiva el ahorro en segundo plano del producto.

Comprobaciones de la entrega inicial (antes de migrar a módulos):

- 273 tests web, TypeScript, Biome y lint de diseño. Casos negativos de parámetros,
  identidad de destino, estado falseado, error nativo, ventana destruida y recarga.
- Rust Windows: fmt, clippy y 71 tests correctos; un peer auxiliar se invoca desde
  los tests y está ignorado para su ejecución independiente. Arquitectura sin GPUI.
- Electron Windows: `scripts/check-window-controls.ts` confirma con Win32 los
  estados normal → maximizado → normal → minimizado; un guardado fallido veta el
  botón de cierre y descartar permite salir con 0. No se manipula el escritorio.
- Puente real: `scripts/smoke-host.ts`, anfitrión Rust, paquete UI con hashes y
  datos QA aislados; listo tras ventana visible, renderer sin Node y cierre por EOF.
  Los smokes consultan ahora las tres fuentes en Diagnóstico, porque el marco
  muestra el estado del simulador en lugar del texto de depuración «Núcleo …».

Desde `hub-web`, tras construir el paquete QA:

```powershell
$env:VANTARE_HUB_QA_ROOT = 'D:/VantareServer/qa/<worker>'
$env:VANTARE_HUB_EVIDENCE = 'D:/VantareServer/evidence/hub-web/<worker>'
node --experimental-strip-types scripts/check-window-controls.ts
```

## Contrato modular

El módulo `native/hub-host/src/protocol/modules/window/` aporta las solicitudes
sin parámetros, respuestas, tema, evento y muestras. Sus validadores y núcleo
simulado están en `src/contract/modules/window.ts` y `src/mock/modules/window.ts`;
los tipos/corpus se generan únicamente en los archivos `generated/window.*`.
La versión 7 y su bootstrap se mantienen como en el PR original. El cierre sigue
en `transport`, con su guardia existente. No se cambia el dispatcher central ni
el mecanismo de respuestas diferidas de servicios.

El anfitrión rechaza minimizar/maximizar con `Unsupported`: son operaciones del
main de Electron sobre su propia ventana, antes de reenviar al anfitrión. El
estado se publica solo desde ese main; el renderer no puede anunciarlo. El
núcleo simulado usa el emisor opcional de su contexto y conserva el estado por
sesión. Los textos de los controles viven en `i18n/window.es.ts`.

Se conserva la dependencia de producción del instalador solo en Windows y la de
test portátil que ya aporta nightly; no se añade soporte de producto a macOS.
Las validaciones de cada SHA y sus rutas se detallan en el cuerpo del PR #2045.

Evidencia local: `window-native-recheck.log`, `window-web-tests-final.log`,
`window-controls-smoke/result.json`, `window-host-smoke-final/host-smoke.json`
y `window-mac-{protocol,architecture}.log` bajo la carpeta de evidencia del Hub.
