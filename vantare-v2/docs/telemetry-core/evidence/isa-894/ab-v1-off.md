# ISA-894 — A/B Overlay V1 encendido frente a apagado

## Protocolo final

- Fuente: `5b8cfd5b2ff61f537a23eb91015fb15aa8afb1ac`.
- Un único `bin/vantare-isa894.exe`: SHA-256
  `83cfc4cbe25c176887bff4b19001f53f1fef12088c36fcd8bdae2f7b51a40722`.
- Un único `frontend/dist`: SHA-256 del manifiesto ordenado
  `7e95fb08f9f55d14835ffb681ef9aa02377b0bc9becf992c550fc217eb09f12f`.
- La build de diagnóstico se creó con `scripts/bench/build-measurement.ps1`:
  cargó el `frontend/.env.local` autorizado sin copiarlo ni imprimirlo,
  ejecutó el build frontend, `tools/generate_supabase_config.ps1` y `go build`,
  y eliminó el Go temporal.
- El preflight CDP de las seis corridas terminó en `license:changed=active`,
  `account=authenticated`, `configured=true`, `deviceOK=true`. Los manifiestos
  sanitizados `*-license.json` conservan también la transición inicial cuando
  existió; no contienen usuario, correo, token ni valores de configuración.
- LMU real: Spa, práctica WEC 2026, jugador en boxes/monitor e IA rodando, 18
  coches. Perfil `testdata/bench/huella-endurance-3.json`, condición A1,
  180 s, tres repeticiones alternadas por estado.
- ON: `VANTARE_OVERLAY_V1_EMIT=1`. OFF: variable ausente y ajuste persistido
  `overlayV1Emit=false`.
- Antes de cada corrida no existía otro `vantare-*.exe`; no se usó `-Forzar`.
  Las seis apps cerraron con `Application.Quit`. El `PresentMon-x64.exe`
  permanente de Radeon no se esperó ni se cerró.

Cada CSV declara el mismo exe, dist, HEAD, escena y coches, junto con
`buildStable=True`, `publishable=True` y el estado de licencia autenticado. CPU
está normalizada contra 16 procesadores lógicos y RAM es Private Bytes. CDP
observó dos renderers, pero no pudo atribuir uno exclusivamente al overlay; se
publica literalmente `renderer-unassigned`.

## Resultado agregado (n=3 por estado)

Ruido = desviación muestral / media; el gate estricto de repetibilidad es ≤5 %.
Los agregados completos están en [`on.md`](./ab-v1-off-runs/on.md) y
[`off.md`](./ab-v1-off-runs/off.md).

| Proceso / métrica | V1 ON | V1 OFF | Delta OFF vs ON | Ruido ON/OFF | Diferencia / suma SD | Veredicto |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Go host CPU | 2,626 % | 1,707 % | −34,98 % | 3,47 % / 1,83 % | 7,5× | grande y repetible |
| Go host RAM privada | 72,85 MiB | 71,03 MiB | −2,50 % | 0,86 % / 0,70 % | 1,6× | pequeño y repetible (gate ≤5 %) |
| Renderer no asignado CPU | 2,256 % | 1,189 % | −47,28 % | 2,53 % / 4,10 % | 10,1× | grande y repetible; atribución no exclusiva |
| Renderer no asignado RAM privada | 134,70 MiB | 96,31 MiB | −28,50 % | 3,56 % / **8,34 %** | 3,0× | efecto grande; precisión limitada |
| Browser CPU | 0,968 % | 1,005 % | +3,77 % | 4,55 % / 0,78 % | — | sin mejora |
| Browser RAM privada | 44,88 MiB | 45,13 MiB | +0,55 % | 0,18 % / 0,66 % | — | sin mejora |
| GPU process CPU | 0,082 % | 0,126 % | +53,46 % | **50,00 % / 43,30 %** | — | ruido alto; sin inferencia |
| GPU process RAM privada | 155,68 MiB | 158,55 MiB | +1,84 % | **16,92 % / 17,30 %** | — | ruido alto; sin inferencia |
| Renderer Hub CPU | 0,041 % | 0,032 % | −23,27 % | **115,47 % / 98,97 %** | — | ruido alto; sin inferencia |
| Renderer Hub RAM privada | 62,52 MiB | 62,53 MiB | +0,01 % | **15,68 % / 17,43 %** | — | ruido alto; sin inferencia |
| Frametime LMU | 11,321 ms | 10,957 ms | −3,21 % | 1,98 % / 1,38 % | — | contexto, no causal |
| Frames perdidos LMU | 0 / 47.700 | 0 / 49.277 | 0 | 0 % / 0 % | — | PASS |

En este A/B de 3×180 s por estado, con el mismo binario, dist, escena y sesión
autenticada, apagar V1 redujo la media de CPU del host Go un 35,0 %, la CPU del
renderer no asignado un 47,3 % y su RAM privada un 28,5 %. CPU Go y renderer
quedaron separados con ruido ≤5 %; la RAM del renderer tuvo 8,34 % de ruido en
OFF y no cumple la etiqueta estricta. El renderer no puede atribuirse
exclusivamente a la ventana overlay. El ahorro de RAM Go fue pequeño y
repetible (gate ≤5 %).

## Pull y recepción por ventana

`requestDurationMs` mide el round-trip del POST pull, incluida la espera del
long-poll; no es el microbenchmark puro de proyección de #912.

| Estado | Medias por preflight | Media | Ruido | p99 máximo | V1 / V2 recibidos | Shadow |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| ON | 11,78 / 12,70 / 11,93 ms | 12,14 ms | 3,99 % | 32,40 ms | 21 / 18 | 17 frames; 48 mismatches |
| OFF | 13,23 / 8,07 / 25,27 ms | 15,52 ms | **56,6 %** | 59,50 ms | **0 / 16** | `null` en 3/3 ventanas |

OFF pasa el gate funcional: cero V1 recibido, V2 avanza y no se crea ni ingiere
el runtime shadow. El pull tiene alta variación OFF y no se usa para atribuir
una mejora causal. ON conserva divergencias diagnósticas live en `speedKph` y
textos de vuelta; no son autoridad visual, pero mantienen bloqueado el corte 2.

## Corridas publicadas

Los seis CSV se publican completos y sanitizados bajo `ab-v1-off-runs/`. Se
conservan por separado el SHA del crudo local y el SHA del fichero publicado
tras normalizar rutas personales y finales de línea.

| Estado | Run | CSV | SHA crudo | SHA publicado | Go CPU | Go RAM | Renderer CPU | Renderer RAM |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| ON | 1 | [`on-1.csv`](./ab-v1-off-runs/on-1.csv) | `5A73A156B3A77E5B84DEA24FD4A179900DE31B577DCEE44BA02E90D0D1894DE1` | `63EFA44B1326A58E3DC6F6E350A90D14C3E3A4811A7811B9A011E56F35B57C3C` | 2,521 % | 72,34 MiB | 2,274 % | 137,12 MiB |
| ON | 2 | [`on-2.csv`](./ab-v1-off-runs/on-2.csv) | `3FB7B8ADE5EDB2ED155724A080DAA0C89F100F9D92C7DCCAEBB0C18F8492E74F` | `5E32580A7D35C896A5D9B383FC1DC19D9368B35F19CD59999521D2E7D1C5350C` | 2,685 % | 72,65 MiB | 2,192 % | 129,18 MiB |
| ON | 3 | [`on-3.csv`](./ab-v1-off-runs/on-3.csv) | `F09D15CAAD00E1DAA8537FC32D334D79CE7F3FC0428C232873B4DB5C592ED7BD` | `3770BA7C03D2A0BE041311B74C7254B33B6378C814EF6337DDBBA320A005909E` | 2,671 % | 73,55 MiB | 2,301 % | 137,80 MiB |
| OFF | 1 | [`off-1.csv`](./ab-v1-off-runs/off-1.csv) | `794BF9E95A35D832B718CC4F161AE24B7B3E4833B6A907B62AB3D18E85693C56` | `3318F7CD317473AD45E217B3C61DBD5421A47EAFEBFB32B102465ABADE9205DC` | 1,689 % | 71,19 MiB | 1,149 % | 100,65 MiB |
| OFF | 2 | [`off-2.csv`](./ab-v1-off-runs/off-2.csv) | `7A9A405F03644F4EFDAB126D71283EE05830E1BC9F1D4272AAA386D41D1AA435` | `A53EB58F925096F4EF2C2E42CF51DF75BC797617700CE842F6001739EAD3414B` | 1,743 % | 70,47 MiB | 1,243 % | 101,24 MiB |
| OFF | 3 | [`off-3.csv`](./ab-v1-off-runs/off-3.csv) | `7AE662C2960809DFF28C9F0BC2D5AE7E5FBA678199273C84555A6E67CE075F41` | `4370AF0E915D0C2146543A713C419659AD739C79DDA5DC03D477F2811468A4F6` | 1,689 % | 71,43 MiB | 1,176 % | 87,04 MiB |

Los `*-cdp.json` conservan V1/V2, pull, p99/histograma y shadow; los nuevos
`*-license.json` prueban el preflight autenticado. SHA-256 de agregados:
`on.md=C3B53D41BAD01EB80AC00DFD6D1AD506438317D5FBDFC60F0F6142CA19226238` y
`off.md=036327A48186B4EA0034CC51B63A9FA70429871BDECEE7603C49FA23FF543AB2`.

## Reproducción

```powershell
pwsh -File scripts/bench/build-measurement.ps1 `
  -EnvFile C:\ruta\autorizada\frontend\.env.local `
  -OutFile bin\vantare-isa894.exe

$env:VANTARE_OVERLAY_V1_EMIT = '1'
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion A1 `
  -Exe bin/vantare-isa894.exe -Perfil testdata/bench/huella-endurance-3.json `
  -Duracion 180 -Puerto 9294 -Salida results/isa-894/on-1 `
  -Escena 'Spa práctica WEC 2026, jugador en boxes, IA rodando' `
  -SesionLmu 'Práctica' -Coches 18
```

El banco falla cerrado si el preflight no alcanza una sesión configurada y
autenticada, si cambia exe/dist/HEAD o si la higiene requiere `-Forzar`.
