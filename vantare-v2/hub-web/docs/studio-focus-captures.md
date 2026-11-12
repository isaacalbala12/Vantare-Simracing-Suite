# Capturas de Studio Foco

La maqueta se abre en el Electron instalado del proyecto, con el mismo Chromium
y V8 que el candidato QA. El comparador verifica ambas versiones contra el
`browser.json` que ahora deja `visual-diff`. No carga IPC ni preload del producto,
no permite red y utiliza las mismas fuentes TTF locales. Exige un Electron ya
instalado; no inicia instalaciones ni descargas. No se modifica la
maqueta: solo se oculta su barra de selecciÃ³n, exterior a la ventana dibujada.

Antes de lanzar cualquier proceso, tomar `D:/VantareServer/qa/captura.lock` con
`mkdir`. Si existe, esperar y reintentar cada 60 s. No compilar Rust durante las
capturas y liberar el directorio en `finally`, tambiÃ©n ante errores. El visor
de referencia exige que el cerrojo exista; no lo adquiere por su cuenta.

Desde `hub-web`, con `VANTARE_HUB_QA_ROOT` en un directorio propio de QA:

```powershell
node --experimental-strip-types scripts/visual-diff.ts --scene studio-a-ilustraciones --theme both --width 1440 --height 900 --capture-only --capture-expanded-sidebar --references D:/VantareServer/evidence/hub-web/referencia-gpui --output <evidencia>/1440

node --experimental-strip-types scripts/studio-reference.ts --prototype D:/VantareServer/evidence/hub-web/studio-rediseno/variante-a.html --current <evidencia>/1440/dark/studio-a-ilustraciones/current.png --output <evidencia>/comparacion/1440/dark/closed --state delta --theme dark --sidebar closed --size 1440
```

Para 1280Ã—720, usar `--width 1280 --height 720` y `--size 1280`. Para la barra
abierta, comparar `expanded-sidebar.png` con `--sidebar open`. Repetir en claro.
Los valores predeterminados de `visual-diff` siguen siendo 1440Ã—900, y la
comprobaciÃ³n HWND sigue exigiendo el ejecutable, PID y tamaÃ±o exactos.

Cada comparaciÃ³n guarda `reference.png`, `diff.png`,
`comparison-reference-left.png` (maqueta izquierda, producto derecha), el hash
de la maqueta, versiones del motor, hashes de fuentes y cierre del visor.
Los porcentajes describen la ventana completa; durante los PR parciales no
certifican que las fases de disposiciÃ³n aÃºn pendientes estÃ©n terminadas.

El visor abre una ventana QA visible y desactiva solo su throttling de fondo: una
ventana oculta puede cargar el DOM y las fuentes sin entregar frames a Chromium.
En este servidor se puede ejecutar con `bun scripts/visual-diff.ts` y
`bun scripts/studio-reference.ts` (mismos argumentos); el runtime de control no
cambia el Chromium del candidato ni el del visor, cuyas versiones se verifican.
