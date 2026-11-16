# Diferencias con la referencia GPUI

Desde `hub-web`, después de construir y empaquetar la variante QA:

```powershell
$env:VANTARE_HUB_QA_ROOT='D:/VantareServer/qa/isa-1995-visual'
node --experimental-strip-types scripts/visual-diff.ts --scene ajustes-aplicacion --theme dark --references D:/VantareServer/evidence/hub-web/referencia-gpui --output D:/VantareServer/evidence/hub-web/visual-baseline
```

`--all --theme both` recorre todas las escenas de ambos temas. Cada resultado contiene `reference.png`, `current.png`, `diff.png`, fuentes realmente cargadas y stderr. `report.json` y `report.md` resumen porcentajes y fallos. Para comparar una captura ya existente, añadir `--current <PNG>` con una escena y tema únicos; el informe lo marca expresamente como captura aportada, sin verificar cómo fue tomada.

La métrica principal cuenta todos los píxeles RGBA diferentes, sin máscaras, recortes, alineado ni exclusión del antialias. El porcentaje perceptual complementario usa pixelmatch con umbral 0,1 y antialias incluido. Ningún porcentaje sustituye revisar el par a simple vista. Las escenas sin adaptador aparecen como `unimplemented`, nunca como cero diferencias ni capturando otra pantalla. Los fallos producen salida distinta de cero.

La herramienta lee `capture-batch.json` (escena, tema/paleta y 1440×900) y verifica el hash PNG del `.png.capture.json`. Este último solo contiene hashes `inputs`/`png`; no se pueden reconstruir sus datos de entrada desde el hash. El adaptador de cada escena debe reproducir esos datos de QA. Solo se admite actualmente la paleta Vantare de las referencias existentes, escala física 1 y zoom 100. Una referencia con otra configuración se rechaza hasta añadir su adaptador explícito.

La captura real usa Electron QA y PrintWindow de su propio HWND: incluye controles nativos que una captura CDP omitiría. No usa ni controla el escritorio, no abre cuentas ni servicios reales y no cambia CSP, preload ni fuses. Solo hay un Electron a la vez. El directorio de datos es único bajo QA; se conservan los datos para reproducir el resultado.

Para otros workers: añadir un módulo bajo `scripts/visual-diff/` que exporte sus adaptadores `VisualScene` e incorporarlo en `scenes.ts`; cada adaptador declara una escena del núcleo simulado y una preparación observable por Playwright. No hacer fallback a otra escena. El mock visual vive exclusivamente en el mock ya permitido por desarrollo/QA.

Fuentes: GPUI registra siete TTF Inter estáticas (`Inter W400…W800`), Rajdhani 600 y Space Mono. La web actual carga Inter variable y asigna Cascadia antes de Space Mono. La corrección tipográfica va en el PR siguiente según la auditoría de Opus. El informe conserva las caras cargadas y los nombres físicos que Chromium comunica; no afirma paridad por comprobar solo el nombre CSS. El rasterizado DirectWrite de GPUI y Chromium puede producir diferencias de antialias; se informa, sin ocultarlo.

Dependencias exclusivamente de desarrollo autorizadas: `pixelmatch` 8.0.0, `pngjs` 7.0.0 y `@types/pngjs` 6.0.5. Se usan para decodificar y comparar PNG de forma reproducible también fuera de Windows; la captura real del HWND sí exige Windows.

Referencia inicial aportada por Isaac: `privacy-followup-native-smoke/general-native.png` frente a `dark/ajustes-aplicacion.png`: **79,0900 % exacto**, **9,8441 % perceptual**. Sus estados de datos difieren: es la comparación solicitada del aspecto previo, no una nueva captura controlada. Resultado completo en `D:/VantareServer/evidence/hub-web/visual-before/report.json`.

## Captura adicional con barra expandida

Añade `--capture-expanded-sidebar` al comando anterior para guardar también
`<tema>/<escena>/expanded-sidebar.png` mediante el mismo HWND de Electron a
1440×900. La escena debe mostrar el marco y sus perfiles QA. Se expande con
Ctrl+B y se comprueba el ancho de 272px antes de capturar; no cambia la API del
adaptador. `current.png` conserva la captura contraída para compararla con su
referencia. La captura expandida queda identificada en `expanded-sidebar.json`
como **sin comparación** cuando no hay referencia GPUI de ese estado; no se le
atribuye un porcentaje ni se reutiliza una referencia contraída como si lo fuera.
Este flag no admite `--current`, porque necesita una instancia real. Como en el
resto de capturas, adquirir antes el cerrojo global y no compilar simultáneamente.

## Cierre de la ventana de captura

El cierre se hace con el botón real de la ventana. El helper espera la respuesta
de la guarda (`HUB_QA_CLOSE_ALLOWED`), el cierre de la página y la desconexión
del cliente CDP. En las 60 ventanas medidas para #2308 la guarda respondió en
13–40 ms, la página se cerró 19–25 ms después y el CDP se desconectó 9–12 ms más
tarde. A partir de ahí Chromium puede tardar 2–5 s en apagar sus propios procesos
hijos, algo que la captura QA no necesita.

Por eso, cuando la ventana está cerrada, el CDP desconectado y `cleanupFailed` es
0, el helper concede un margen de 250 ms (`QA_CLOSE_MARGIN_MS`) y, si el proceso
sigue vivo, mata solo su propio árbol con `taskkill /T /F`. Ese cierre se registra
como `qaKillAfterClose: true` en `teardown.json` y como evento
`qa-kill-after-close` en `lifecycle.json`; no es un cierre normal ni un
`forcedKill`. Un cuelgue real (la ventana no se cierra, el CDP sigue conectado o
`cleanupFailed` es mayor que 0) no entra en esa rama y sigue terminando por el
plazo existente con `forcedKill: true`.

El volcado final del perfil de QA (`DIPS`) que Chromium haría en esos segundos se
descarta a propósito: el directorio de datos de cada captura es desechable y no
se reutiliza. El cierre del producto no cambia.

## Visibilidad y primer plano en el recibo

`teardown.json` registra también `visibilityAtScene`, `visibilityAtEnd` y
`foregroundAtPrepare` para poder confirmar o descartar que una captura falló
porque la ventana no estaba en primer plano (rAF no dispara y Playwright no ve
el control estable). `visibilityAtScene` se toma justo antes de preparar la
escena y `visibilityAtEnd` al terminar, mientras la página sigue viva; ambos
incluyen `visibilityState`, `hidden` y `hasFocus`. `foregroundAtPrepare` es el
`foreground` que ya registra `window.json` al preparar la ventana. Solo se
registra: no cambia plazos, guardas, cierre ni la lógica de la captura.

## Referencia declarada no válida

Si el orquestador descarta una referencia, `--capture-only --invalid-reference-reason "motivo"` admite una única escena y tema. Conserva `current.png` y un informe `captured/referenceStatus:invalid`, sin copia de referencia, diferencias ni porcentajes. Sigue comprobando los recibos del banco y las dimensiones 1440×900; no convierte la referencia en válida. Requiere el mismo cerrojo global para capturas reales. `--current` permite probar este modo con una imagen ya tomada sin abrir Electron.

El barrido usa `--capture-only --scene <escena> --theme both`, sin `--current` ni motivo de referencia inválida. No lee el banco de referencias: guarda cada PNG real y los recibos de la matriz; el informe del barrido compara esas imágenes después. El modo Onboarding con `--invalid-reference-reason` conserva la validación de recibos y acepta una imagen suministrada con `--current`, pero exige un tema y un motivo no vacío. Ambos modos verifican 1440×900 y nunca generan diferencias ni porcentajes en esta fase.

CI comprueba explícitamente los scripts con `bun run typecheck:scripts`; incluye sus tipos globales existentes. El workflow también corre tras integrar cambios en nightly para validar el resultado combinado de PR independientes.
