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

Comprobaciones realizadas:

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

Mac: exportación de tipos/corpus y seis tests de protocolo, más arquitectura,
correctos. `updates.rs` ya usaba la lectura portable del instalador pero su
dependencia se declaraba solo para Windows: se declara para ambos destinos,
con defaults desactivados, sin editar el instalador ni añadir GPUI. El lint y la
suite completa del Mac siguen teniendo casos previos dependientes de Windows
en settings/privacy/updates; no se dan por superados ni se han desactivado.
La validación completa de este cambio es la de Windows.

Evidencia local: `window-native-recheck.log`, `window-web-tests-final.log`,
`window-controls-smoke/result.json`, `window-host-smoke-final/host-smoke.json`
y `window-mac-{protocol,architecture}.log` bajo la carpeta de evidencia del Hub.
