# ISA-894 — A/B Overlay V1 encendido frente a apagado

## Protocolo corregido tras revisión adversarial

- Fuente de aplicación final: `2f6eef139fb3d48439c9e137005691b55a3ac992`,
  rebasada sobre `origin/nightly@9723148f` (#954 incluido).
- Un solo `bin/vantare-isa894.exe` para las seis corridas: SHA-256
  `844715b0bbedfdbfa026dcb3fb2c244ce03363ea8e08a844d94e2c9ea32c46f5`.
- Un solo `frontend/dist`: SHA-256 de manifiesto ordenado
  `d088dfe6921ead67d22122707b897e8ae3e7e144dd4098b788cc6c7e14622b59`.
- LMU real: Circuit de Spa-Francorchamps, `PRACTICE1`, 18 coches, jugador en
  garaje (`playerPit=pit`); `Le Mans Ultimate.exe` PID 16792 permaneció vivo.
- Perfil `testdata/bench/huella-endurance-3.json`, condición A1, 180 segundos,
  tres repeticiones alternadas por estado.
- ON: `VANTARE_OVERLAY_V1_EMIT=1`. OFF: variable ausente y ajuste persistido
  `overlayV1Emit=false`.
- Un solo `scripts/bench/huella.ps1`, sin `-Forzar`. Antes de cada corrida no
  existía ningún `vantare-*.exe`; las seis apps cerraron con `Application.Quit`.
- El `PresentMon-x64.exe` permanente de Radeon (`RSXTraceSession`) no fue una
  condición de espera ni se cerró.

Cada CSV crudo contiene `buildSha256`, `distSha256`, `buildStable`, `gitHead`,
`scene`, `lmuSession` y `cars`. Los seis declaran exactamente los valores
anteriores, `buildStable=True` y `publishable=True`. El agregador tiene una
regresión que rechaza builds distintos o un binario/dist cambiado durante la
corrida.

El banco normaliza `cpuPct` contra 16 procesadores lógicos. RAM es Private
Bytes. CDP observó dos renderers, pero no pudo atribuir uno exclusivamente a la
ventana overlay; se publica literalmente `renderer-unassigned`.

## Resultado agregado (n=3 por estado)

Ruido = desviación muestral / media; el gate de repetibilidad es ≤5 %. Los
resúmenes completos están en [`on.md`](./ab-v1-off-runs/on.md) y
[`off.md`](./ab-v1-off-runs/off.md).

| Proceso / métrica | V1 ON | V1 OFF | Delta OFF vs ON | Ruido ON/OFF | Veredicto |
| --- | ---: | ---: | ---: | ---: | --- |
| Go host CPU | 2,646 % | 1,609 % | −39,19 % | **5,11 % / 5,56 %** | no concluyente: ambos superan ruido |
| Go host RAM privada | 72,83 MiB | 70,77 MiB | −2,83 % | 0,68 % / 1,18 % | repetible, ahorro pequeño |
| Renderer no asignado CPU | 2,496 % | 1,482 % | −40,63 % | 2,97 % / **8,95 %** | no concluyente: OFF supera ruido |
| Renderer no asignado RAM privada | 139,34 MiB | 108,46 MiB | −22,16 % | **5,82 %** / 4,58 % | no concluyente: ON supera ruido |
| Browser CPU | 1,000 % | 1,046 % | +4,60 % | 0,00 % / 1,56 % | pequeño aumento |
| Browser RAM privada | 45,11 MiB | 45,37 MiB | +0,58 % | 0,34 % / 1,05 % | sin mejora |
| GPU process CPU | 0,117 % | 0,119 % | +1,71 % | **52,54 % / 42,51 %** | no concluyente |
| GPU process RAM privada | 141,99 MiB | 141,35 MiB | −0,45 % | 1,07 % / 0,86 % | sin mejora material |
| Renderer Hub CPU | 0,014 % | 0,018 % | +28,57 % | 2,44 % / **86,66 %** | no concluyente |
| Renderer Hub RAM privada | 54,50 MiB | 54,90 MiB | +0,73 % | 0,68 % / 0,77 % | sin mejora |
| Frametime LMU | 15,262 ms | 14,137 ms | −7,37 % | **11,46 % / 10,89 %** | contexto, no causal |
| Frames perdidos LMU | 0 / 35.667 | 0 / 38.474 | 0 | 0 % / 0 % | PASS |

Conclusión acotada: apagar V1 elimina el coste shadow. Las bajadas de CPU Go,
CPU renderer y RAM renderer son direccionales, pero **no publicables como
efecto repetible** porque al menos una condición supera el gate de ruido. Solo
el pequeño ahorro de RAM Go supera repetibilidad; browser no mejora.

## Pull, histograma y recepción por ventana

`requestDurationMs` mide el round-trip del POST pull hasta procesar la
respuesta e incluye la espera del long-poll; no es el microbenchmark puro de
proyección de #912. El diagnóstico conserva las últimas 512 duraciones y
publica histograma no acumulativo, p99 empírico y máximo.

| Estado | Medias por preflight | Media | Ruido | p99 máximo | V1 / V2 recibidos | Shadow |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| ON | 22,72 / 11,23 / 25,14 ms | 19,70 ms | **37,74 %** | 73,30 ms | 16 / 13 | 13 frames; 35 mismatches |
| OFF | 15,33 / 27,75 / 17,53 ms | 20,20 ms | **32,80 %** | 68,00 ms | **0 / 16** | `null` en 3/3 ventanas |

OFF pasa el gate funcional: cero V1 recibido, V2 sigue avanzando y no se crea
ni ingiere el runtime shadow. El tiempo de pull no muestra una mejora causal.
ON reproduce divergencias live en `speedKph`, `remainingText`,
`rows[].currentLapText` y `rows[].lastLapText`; son diagnósticas, no autoridad
visual, pero mantienen bloqueado el corte 2.

## Corridas y artefactos

Los CSV crudos permanecen bajo `results/isa-894/review-final-180s/` local. Sus hashes
permiten relacionarlos de forma inequívoca con la metadata publicada.

| Estado | Run | CSV | SHA-256 CSV | Go CPU | Go RAM | Renderer CPU | Renderer RAM |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| ON | 1 | `a1-20260830-051723.csv` | `D409F9A88DB6DE4A9DA2FBF18E99224CDEC1CF059B842D86473ADD2A868B7E4F` | 2,671 % | 72,88 MiB | 2,548 % | 141,61 MiB |
| ON | 2 | `a1-20260830-052436.csv` | `E3489066A3FE65A462D1E53A968CD82A29DAE0B1E1569C0DF5D4423CCE41DEAD` | 2,500 % | 73,30 MiB | 2,529 % | 130,35 MiB |
| ON | 3 | `a1-20260830-053201.csv` | `C85C6044E86420D4702F3B1B07C2C4E4D0D5862BFBB9ACEB25322368AFD409FD` | 2,767 % | 72,32 MiB | 2,411 % | 146,07 MiB |
| OFF | 1 | `a1-20260830-052101.csv` | `4DCD840CCB4006B8C199FABCEFB629CB1E23E4B873659FE1475F65AE45BAC68A` | 1,595 % | 71,65 MiB | 1,419 % | 110,92 MiB |
| OFF | 2 | `a1-20260830-052816.csv` | `4606EBDE130A65423DE4D1443E58C011A8C5C7A843E4D9DA68AE42EEF5C34FE6` | 1,704 % | 69,99 MiB | 1,634 % | 111,72 MiB |
| OFF | 3 | `a1-20260830-053543.csv` | `B4FA388799904ADEB52BECFD24BDB8E2EEE1938DD4F6774B2710638F5E4A476E` | 1,527 % | 70,67 MiB | 1,392 % | 102,74 MiB |

| Artefacto versionado | SHA-256 |
| --- | --- |
| `on.md` | `8500E3A74A9D755C8F6050294A50D6749891B574EA8388836CF5AA08B3D1E754` |
| `off.md` | `C2664A7B2AF2EA4CE444E20F4F7928D77CCECB5A302AA34AA62DB382220BF6C9` |
| `on-1-cdp.json` | `C5990348D89AAFC1E715669FE3C03C5A788A09FB7267F125BA0339760C899B7D` |
| `on-2-cdp.json` | `E2B468930DB1B0017A2AB9861B15419FC91454E753E317DBB3E0F4DA6FFB26AB` |
| `on-3-cdp.json` | `1387C84E3F8A18BC705603E31EF5AFAD44C5E4D388E307FE7CCCD67973DF8ADC` |
| `off-1-cdp.json` | `67E858FAD56150B61F0E602BA34EAC9D334C114280004E9D7A0D174BB917E0B6` |
| `off-2-cdp.json` | `BE12F424C69D7D73596314894DBAB6F240E5B4D244F16A5D68AC1645EBC923CE` |
| `off-3-cdp.json` | `48A2631204787B3784B0C25669FA9F590B308782967AA175094016976779A95B` |

## Reproducción

```powershell
$env:VANTARE_OVERLAY_V1_EMIT = '1'
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion A1 `
  -Exe bin/vantare-isa894.exe -Perfil testdata/bench/huella-endurance-3.json `
  -Duracion 180 -Puerto 9294 -Salida results/isa-894/review-final-180s/on-1 `
  -Escena 'Circuit de Spa-Francorchamps / jugador en garaje' `
  -SesionLmu PRACTICE1 -Coches 18

Remove-Item Env:VANTARE_OVERLAY_V1_EMIT -ErrorAction SilentlyContinue
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion A1 `
  -Exe bin/vantare-isa894.exe -Perfil testdata/bench/huella-endurance-3.json `
  -Duracion 180 -Puerto 9294 -Salida results/isa-894/review-final-180s/off-1 `
  -Escena 'Circuit de Spa-Francorchamps / jugador en garaje' `
  -SesionLmu PRACTICE1 -Coches 18
```

Los agregados se regeneran con `node scripts/bench/huella-resumen.mjs` sobre
los tres CSV del mismo estado; el comando falla si los hashes no coinciden.
