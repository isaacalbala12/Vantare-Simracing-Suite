# ISA-893 — prueba Wails/LMU real del catálogo completo

## Resultado

La revalidación física del HEAD corregido tras la review de PR #941 pasó el
2026-08-30 sobre `4fa01639`. LMU permaneció abierto como PID 16792 en la escena
coordinada de Spa, práctica WEC 2026, con el jugador en el garaje y la IA
rodando. La prueba no interactuó con el juego ni sustituyó su telemetría por
fixtures, replay o datos sintéticos.

Antes de arrancar se esperó a que desapareciera `vantare-isa940.exe`. En el
hueco libre se lanzó únicamente esta build:

```text
binario  C:\tmp\vantare-isa893\vantare-v2\bin\vantare-isa893.exe
SHA-256  FF48984502D0A1E39A39F2B2594DA17A3EB62AD7761255FE8454A8E1A05D42A7
PID      25212
perfil   testdata/bench/huella-completo.json
CDP      127.0.0.1:9243
HTTP     127.0.0.1:29243
runtime  C:\tmp\vantare-isa893-runtime-final-20260830
```

WebView2 confirmó `--webview-exe-name=vantare-isa893.exe`,
`--remote-debugging-port=9243` y el user-data propio
`C:\Users\isaac\AppData\Roaming\vantare-isa893.exe\EBWebView`.

## Evidencia CDP

`scripts/bench/huella-cdp.mjs` abrió el perfil por el evento productivo Wails
`overlay:start-active`. `wails-overlay-start.json` registra un target Hub y un
target Overlay, exactamente 20 frames, 0 long tasks durante la ventana de 10 s
y los renderer PID 27184 y 8892.

`capture-wails-v2.mjs` esperó el catálogo completo y falló cerrado ante frame
sin pintar, error de renderer, diagnóstico de autoridad o ausencia de frames
V2 live. El resultado versionado es:

```text
widgets esperados             20
widgets observados            20
widgets pintados              20
errores de renderer            0
diagnósticos de autoridad      0
frames V2 live decodificados 512
parse p50                  0,3 ms
parse p99                  0,6 ms
```

Los 20 códigos observados, en el orden del perfil, fueron:

```text
delta
standings
relative
pedals
broadcast-tower
fuel-strategy
pedals-telemetry
pedals-telemetry-compact
racing-flags
delta-trace
race-schedule
head-to-head
delta-advanced
input-telemetry
multiclass-relative
track-weather
car-damage-visual
car-damage-numbers
engineer-radio
track-map
```

El diagnóstico conservó también 556 frames del comparador histórico y 1.617
diferencias shadow. Esas métricas no fueron fallback ni autoridad visual: la
sonda verificó que ningún widget presentó un diagnóstico de autoridad y que
los 20 renderizaron desde sus fuentes V2/auxiliares.

## Artefactos

| Archivo | SHA-256 | Contenido |
|---|---|---|
| `wails-overlay-start.json` | `F1DB38E71F9F02B1E0D8940098ECB27AE86372DB7F5E099329FD680492191BD0` | Apertura Wails, targets y 20 frames. |
| `wails-v2-live.json` | `FAF921FE3286EC4894D0DBC83311A3654ABA1BAEDD773305BF87434A7A6AFEB6` | Catálogo observado, pintado y diagnóstico V2. |
| `wails-v2-live.png` | `4CCB878295E63D5DC8504AB01FC6B7E8521AEC702B5804D12A84AF562BD9733B` | Captura del overlay completo. |
| `capture-wails-v2.mjs` | versionado junto a la evidencia | Sonda reproducible fail-closed. |

![Los 20 widgets pintados por la build Wails propia](./wails-v2-live.png)

## Cierre e higiene

El helper CDP devolvió literalmente:

```json
{"schema":"vantare.huella.cdp.v1","action":"app-quit","requested":true}
```

Después del cierre, PID 25212 no existía y el puerto 9243 no tenía listener.
No quedó ningún proceso `vantare*`; LMU PID 16792 seguía vivo. No se esperó ni
se cerró `PresentMon-x64`, y no se tocó ningún proceso ajeno.
