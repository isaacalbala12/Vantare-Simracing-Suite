# Redimensionado en la app real (Wails + WebView2) — perfilado y correccion

**Decision asociada:** D-R4-5 · **Rama:** `vantareapp/isa-369-…` · **Fecha:** 2026-08-19

Isaac reporta que en la app de escritorio real, al reducir la ventana con un gesto
rapido, la UI Orbit «sigue reduciendo su tamano muy lento… no es fluido… parece
algo intrinseco de la UI». El harness headless no lo reproducia. Este documento
recoge la medicion **en la app real**, el cuello identificado y el antes/despues.

---

## 1. Como se mide

### 1.1 Abrir DevTools en el WebView2 de Wails

La variable de entorno `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` **no sirve**: Wails
la sobrescribe al crear el entorno del WebView2
(`webviewloader/native_module.go` → `preventEnvAndRegistryOverrides`). Hay que
pasar el argumento por las opciones de la aplicacion
(`application.Options.Windows.AdditionalBrowserArgs`).

Se anadio un gancho de diagnostico en `cmd/vantare/main.go`: con
`VANTARE_WEBVIEW_DEBUG_PORT=9222` el binario arranca el WebView2 con
`--remote-debugging-port=9222`. Sin la variable no cambia absolutamente nada.

```powershell
$env:VANTARE_WEBVIEW_DEBUG_PORT = '9222'
Start-Process .\bin\vantare.exe
# http://127.0.0.1:9222/json/list  -> pagina "Vantare"
```

### 1.2 Reproducir el gesto real

`frontend/scripts/orbit-real-resize.ps1` mueve la ventana real de Windows en
40 pasos de 1900×1020 a 900×700 en 700 ms. Dos modos, y **la diferencia importa**:

| Modo | Mecanismo | Que mide |
| --- | --- | --- |
| `api` | `SetWindowPos` en bucle | Coste del contenido web, sin bucle modal |
| `drag` | `WM_SYSCOMMAND SC_SIZE\|WMSZ_BOTTOMRIGHT` + `SetCursorPos` paso a paso | **El gesto del usuario**: entra en el bucle modal de Windows (`WM_ENTERSIZEMOVE`), que es donde WebView2 presenta de forma diferida |

Tres callejones sin salida que conviene no repetir:

- `mouse_event(LEFTDOWN)` sintetico sobre la esquina **no agarra el borde**, aunque
  `WM_NCHITTEST` devuelva `HTBOTTOMRIGHT` (17) en ese punto. Tampoco
  `PostMessage(WM_NCLBUTTONDOWN, HTBOTTOMRIGHT)`. Lo unico que funciona es
  `WM_SYSCOMMAND SC_SIZE`.
- `SetCursorPos` **recorta a la pantalla**. Con la ventana a 1920×1080 en un
  monitor de 1920×1080 la esquina inferior derecha cae fuera y el gesto no
  agarra nada. De ahi el tamano de partida 1900×1020 (area de trabajo: 1920×1032).
- La app **arranca minimizada**. Con la ventana oculta WebView2 limita `rAF` a
  **1 Hz** y no emite `resize`: la primera tanda de medidas salio toda a
  ~1016 ms/frame y con 0 eventos, que es un artefacto, no un problema de la UI.
  El script restaura y trae al frente antes de medir.

### 1.3 Que se recoge

`frontend/scripts/orbit-real-resize-profile.mjs` se conecta con
`chromium.connectOverCDP`, prepara cada condicion (flags en `localStorage` +
recarga), lanza el gesto y recoge por corrida:

- **Cadencia de frames**: `requestAnimationFrame` en el hilo principal del
  renderer (p50/p95/max, frames > 32 ms).
- **Long tasks**: `PerformanceObserver({ entryTypes: ['longtask'] })`.
- **CDP `Performance.getMetrics`**: delta de `LayoutDuration`,
  `RecalcStyleDuration`, `ScriptDuration`, `TaskDuration`.
- **Desajuste visual** (la metrica que corresponde a lo que se percibe):
  por frame, distancia entre la escala **aplicada** (`--orbit-zoom`) y la que
  **pide** el viewport en ese instante. De ahi salen `zoomWrites` (escalones de
  escala aplicados durante el gesto), `lagFrames` (frames con el contenido
  descuadrado del marco) y `settleMs` (cuanto tarda en cuadrar tras soltar).

Condiciones (a/b/c/d del briefing), 3 corridas cada una, se reporta la mediana
por `lagFrames`. Interruptor de diagnostico anadido:
`localStorage vantare.v03orbit.zoomOff = "1"` desactiva el escalado sin recompilar.

```powershell
node scripts/orbit-real-resize-profile.mjs --label antes   --mode drag --repeats 3
node scripts/orbit-real-resize-profile.mjs --label despues --mode drag --repeats 3
```

> Los `.json` crudos quedan en este mismo directorio
> (`real-resize-drag-antes.json`, `real-resize-drag-despues.json`).

---

## 2. Medida ANTES (HEAD 7640b896, con el throttling de D-R4-4)

Ventana de captura ≈ 4,6 s (reposo + gesto de 700 ms + 1,2 s tras soltar).
`layout`/`style`/`script`/`task` son **totales acumulados** en esa ventana, en ms.

| Condicion | frames | p50 | p95 | max | >32 ms | long tasks | layout | style | script | task | resizeEv | zoomWrites | lagFrames | settleMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (a) Orbit · Inicio · zoom | 282 | 16,7 | 16,8 | 16,9 | 0 | **0** | 117,4 | 137,2 | 22,2 | 471,9 | 38 | **4** | **19** | **50** |
| (b) Orbit · Inicio · sin zoom | 279 | 16,7 | 16,8 | 33,4 | 2 | **0** | 133,1 | 174,2 | 39,1 | 677,0 | 34 | 0 | n/a¹ | n/a¹ |
| (c) Shell legada V52 | 281 | 16,7 | 16,8 | 16,9 | 0 | **0** | 128,2 | 73,1 | 20,6 | 485,3 | 40 | 0 | n/a¹ | n/a¹ |
| (d1) Orbit · Ajustes · zoom | 279 | 16,7 | 16,8 | 16,9 | 0 | **0** | 116,5 | 76,8 | 19,7 | 372,3 | 39 | **4** | **18** | **82** |
| (d2) Orbit · Studio · zoom | 278 | 16,7 | 16,8 | 17,0 | 0 | **0** | 74,6 | 114,2 | 55,8 | 507,8 | 38 | **4** | **19** | **77** |

¹ Sin escalado (b, c) no hay «escala aplicada» que comparar: el contenido nunca
sigue al marco por diseno, asi que `lagFrames`/`settleMs` no aplican.

### Lectura

**El hilo principal no es el cuello, ni de lejos.** En las cinco condiciones el
renderer va a **60 Hz clavados** (p50 16,7 / p95 16,8 ms) durante el arrastre
modal real, con **cero long tasks**. Layout + estilo suman ~250 ms repartidos en
4,6 s: en torno al **5 % del presupuesto**. Hay 38-40 eventos de `resize`
llegando a la pagina, uno por paso del gesto.

**Lo que falla es el escalado, y falla por ir demasiado despacio a proposito.**
Con `zoom` activo la shell aplica solo **4 escalones** de escala para los 38-40
pasos de la ventana. El marco se redibuja al instante (lo hace DWM) mientras el
contenido se queda descuadrado **19 frames (~320 ms)** y no cuadra hasta
**50-82 ms despues de soltar**. Eso es exactamente «sigue reduciendo su tamano
muy lento»: el contenido persigue a la ventana a saltos gruesos y llega tarde.

El throttling de 120 ms + reposo de 180 ms de D-R4-4 se calibro contra un harness
headless que no reproducia el gesto real. Contra la app real, **compraba un
ahorro que no hacia falta a cambio del sintoma que reporta Isaac**.

### Hipotesis del briefing, contrastadas

| # | Hipotesis | Veredicto | Evidencia |
| --- | --- | --- | --- |
| (i) | `zoom` + `calc(100vw / var(--orbit-zoom))` fuerza layout/repintado de toda la shell | **Refutada como cuello** | (a) con zoom cuesta *menos* que (b) sin zoom: layout 117 vs 133, style 137 vs 174. Escalado el contenido se renderiza mas pequeno. El coste existe pero cabe de sobra en el frame |
| (ii) | `100vw/100vh` + `container-type: inline-size` en cascada | **Refutada** | Layout total 74-133 ms en 4,6 s en todas las condiciones, incluida la legada |
| (iii) | `backdrop-filter`, sombras, `filter`, degradados → repintado caro en GPU | **Refutada** | Cero long tasks y p95 = 16,8 ms en todas. Ademas ya se congelan con `data-orbit-resizing`. Solo hay 8 `backdrop-filter` en toda la hoja |
| (iv) | `ResizeObserver`/`useLayoutEffect` con layout sincrono por frame | **Refutada** | `ScriptDuration` 20-56 ms en 4,6 s; Studio (el mas cargado) 56 ms |
| (v) | Re-render masivo de React en resize | **Refutada** | Idem: sin long tasks y con script plano |
| (vi) | WebView2/DWM limitan el repintado durante el arrastre | **Refutada** | (c) V52 legada va igual de fina a 60 Hz. La plataforma no limita nada… **salvo con la ventana minimizada**, donde `rAF` cae a 1 Hz (artefacto de medicion, no del uso real) |
| — | **El throttling del propio escalado** | **CONFIRMADA** | 4 escalones para 38-40 pasos, 19 frames descuadrados, 50-82 ms de retardo tras soltar |

---

## 3. Correccion

Una sola, la que los datos justifican: **escribir el factor una vez por frame**,
coalescido con `requestAnimationFrame`, en lugar del throttling temporal.

`frontend/src/hub/orbit/use-orbit-responsive-zoom.ts`

- Fuera `ORBIT_ZOOM_THROTTLE_MS` (120 ms) y `ORBIT_ZOOM_SETTLE_MS` (180 ms).
- `resize` → `requestAnimationFrame(write)` con bandera de coalescencia: varios
  eventos dentro del mismo frame producen **una** escritura, y ningun frame se
  queda sin la escala que le toca. La bandera se marca *antes* de encolar, para
  que un `rAF` sincrono no deje el gesto colgado.
- Se conserva `data-orbit-resizing` (congela transiciones y `backdrop-filter`
  durante la rafaga, que si no se re-disparan en cada escalon), con un reposo
  corto de 120 ms que ya **no retrasa el escalado**, solo levanta la marca.
- Se conserva la cuantizacion a milesimas.

### Lo que NO se ha tocado, y por que

El briefing ofrecia una bateria de medidas (containment, quitar `backdrop-filter`
permanentes, pausar `ResizeObserver`, store de viewport, aplicar el zoom solo al
soltar, o renunciar a escalar y plegar). **Ninguna esta justificada por la
medicion** y todas tienen coste visual o de complejidad:

- `contain: layout style paint` en Surfaces y workspace: el layout consume ~4 %
  del presupuesto. Anadir containment cambia el recorte de tooltips del rail y el
  desbordamiento de paneles a cambio de un margen que ya sobra.
- Quitar `backdrop-filter`/sombras: son 8 reglas, ya congeladas durante el gesto,
  y no aparecen en el perfil. Se perderia acabado a cambio de nada medible.
- Pausar `ResizeObserver` o meter un store de viewport: `ScriptDuration` es
  20-56 ms en 4,6 s. No hay nada que recortar.
- **Aplicar el zoom solo al soltar** habria sido justo la direccion contraria a
  lo medido: es una version extrema del defecto que causaba el sintoma.
- **Renunciar a escalar** no procede: escalar no es incompatible con la fluidez
  en WebView2; el escalado por frame va a 60 Hz.

---

## 4. Medida DESPUES (mismas condiciones, mismo binario recien compilado)

| Condicion | frames | p50 | p95 | max | >32 ms | long tasks | layout | style | script | task | resizeEv | zoomWrites | lagFrames | settleMs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (a) Orbit · Inicio · zoom | 281 | 16,7 | 16,8 | 33,4 | 5 | **0** | 202,7 | 168,9 | 22,9 | 588,0 | 30 | **8** | **7** | **17** |
| (b) Orbit · Inicio · sin zoom | 277 | 16,7 | 16,8 | 33,3 | 1 | **0** | 110,1 | 133,0 | 28,9 | 531,5 | 38 | 0 | n/a | n/a |
| (c) Shell legada V52 | 284 | 16,7 | 16,8 | 17,0 | 0 | **0** | 101,9 | 62,0 | 16,1 | 357,8 | 40 | 0 | n/a | n/a |
| (d1) Orbit · Ajustes · zoom | 301 | 16,7 | 16,8 | 33,4 | 1 | **0** | 192,0 | 97,6 | 20,1 | 469,0 | 33 | **11** | **10** | **16** |
| (d2) Orbit · Studio · zoom | 295 | 16,7 | 16,8 | 33,3 | 1 | **0** | 132,5 | 150,8 | 54,7 | 562,2 | 33 | **11** | **10** | **16** |

### Antes / despues, condiciones con escalado

| Metrica | (a) Inicio antes → despues | (d1) Ajustes antes → despues | (d2) Studio antes → despues |
| --- | --- | --- | --- |
| Escalones aplicados en el gesto | 4 → **8** | 4 → **11** | 4 → **11** |
| Frames con el contenido descuadrado | 19 → **7** | 18 → **10** | 19 → **10** |
| Retardo en cuadrar tras soltar (ms) | 50 → **17** | 82 → **16** | 77 → **16** |
| p95 de frame (ms) | 16,8 → 16,8 | 16,8 → 16,8 | 16,8 → 16,8 |
| Long tasks > 50 ms | 0 → **0** | 0 → **0** | 0 → **0** |
| Layout acumulado (ms / 4,6 s) | 117 → 203 | 117 → 192 | 75 → 133 |

**Objetivo del briefing** (arrastre de 700 ms con ≥ 30 frames pintados y sin long
tasks > 50 ms repetidos): se cumple con holgura. A 60 Hz sostenidos el gesto de
700 ms pinta **~42 frames**, y no hay ninguna long task en ninguna condicion.

El retardo percibido tras soltar baja de 50-82 ms a **16-17 ms**, es decir a
**un frame**: el limite fisico de `resize` → siguiente `rAF`. Los frames
descuadrados se reducen a menos de la mitad, y el resto es mayoritariamente el
salto instantaneo con que el script recoloca la ventana al inicio de cada corrida.

El coste: layout acumulado sube ~85 ms (de 117 a 203 ms **en 4,6 s**) porque
ahora hay el doble o el triple de escalones reales, y aparecen 5 frames de
33 ms en (a) sobre 281. Sigue siendo el **~4 %** del presupuesto de la ventana de
captura, el p95 no se mueve y no hay una sola long task. Es el intercambio
correcto: se paga trabajo que sobra para eliminar el retardo que se ve.

---

## 5. Notas de reproducibilidad

- El gesto modal a veces no arranca al primer intento (foco recien devuelto tras
  la recarga). El `.ps1` **verifica el tamano final** y sale con codigo 2 si la
  ventana no se movio; el harness reintenta hasta 3 veces. Sin esa verificacion
  una corrida fallida se cuela como «0 ms de layout», que parece un resultado
  excelente y es simplemente que no paso nada.
- El gesto usa entrada sintetica: hay que ejecutarlo **sin sandbox** de entorno,
  o `SetCursorPos`/`mouse_event` no llegan a la ventana.
- Reconstruccion del binario de prueba (Metodo C):
  `scripts/rebuild-orbit-test-binary.ps1`.
