# ISA-894 — A/B Overlay V1 encendido frente a apagado

## Protocolo

- Base: `origin/nightly@8b4a7e4f`; build local `bin/vantare-isa894.exe`.
- LMU real: Spa, práctica, jugador en garaje; `Le Mans Ultimate.exe` PID 16792
  permaneció vivo y el banco no manipuló el juego.
- Perfil `testdata/bench/huella-endurance-3.json`, condición A1, 180 s,
  tres repeticiones alternadas por estado.
- ON: `VANTARE_OVERLAY_V1_EMIT=1`. OFF: variable ausente y ajuste persistido
  `overlayV1Emit=false`.
- Un solo `scripts/bench/huella.ps1`, sin `-Forzar`. La tentativa OFF2 se
  detuvo antes de abrir Vantare porque estaba midiendo el ejecutable ajeno de
  #944; se esperó a que terminara y no se mató ningún proceso.
- `PresentMon-x64.exe`/`RSXTraceSession` de Radeon no fue condición de espera y
  no se cerró. Las seis apps propias terminaron mediante `Application.Quit`.

El banco normaliza `cpuPct` contra los 16 procesadores lógicos: CPU Go equivale
a 0,387 cores ON y 0,265 cores OFF. RAM es Private Bytes. CDP vio dos renderer,
pero no pudo atribuir uno exclusivamente a la ventana overlay; por eso se
publica literalmente `renderer-unassigned`, no “renderer overlay”.

## Resultado agregado (n=3 × 180 s)

Ruido = desviación muestral / media; el gate de repetibilidad es ≤5 %. Los
resúmenes generados completos están en [`on.md`](./ab-v1-off-runs/on.md) y
[`off.md`](./ab-v1-off-runs/off.md).

| Frontera | V1 ON | V1 OFF | Delta OFF vs ON | Ruido ON/OFF | Veredicto |
| --- | ---: | ---: | ---: | ---: | --- |
| Go host CPU | 2,420 % | 1,657 % | **−31,52 %** | 0,66 % / 2,56 % | publicable |
| Go host RAM privada | 73,00 MiB | 72,67 MiB | −0,45 % | 0,70 % / 0,80 % | sin ahorro material |
| Renderer no asignado CPU | 2,470 % | 1,506 % | **−39,06 %** | 1,06 % / 1,48 % | publicable, atribución limitada |
| Renderer no asignado RAM privada | 156,88 MiB | 117,44 MiB | −25,14 % | 3,61 % / **9,58 %** | **no concluyente** por ruido OFF |
| Browser CPU | 0,957 % | 0,991 % | +3,48 % | 1,46 % / 1,97 % | publicable; no mejora |
| Browser RAM privada | 46,88 MiB | 46,76 MiB | −0,26 % | 0,46 % / 0,31 % | sin ahorro material |
| Frametime LMU | 16,974 ms | 15,803 ms | −6,90 % | **12,65 % / 15,90 %** | contexto, no causal |
| Frames perdidos LMU | 0 / 32.156 | 0 / 34.717 | 0 | 0 % / 0 % | PASS |

Conclusión acotada: apagar V1 reduce de forma repetible el CPU del Go host y
del renderer no asignado. No demuestra ahorro de RAM Go/browser; la aparente
caída de RAM renderer no es publicable porque una condición excede 5 % de
ruido. PresentMon solo demuestra estabilidad del juego durante las muestras.

## Pull y recepción por ventana

Se hicieron tres preflights instrumentados de 10 s por estado. `requestDuration`
mide el round-trip del POST pull hasta procesar su respuesta —incluye espera del
long-poll— y no es el microbenchmark puro de proyección de #912.

| Estado | Medias por preflight | Media de corridas | Ruido | Requests | V1 recibidos | V2 recibidos | Shadow |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| ON | 28,18 / 34,37 / 17,30 ms | 26,61 ms | **32,46 %** | 8 | 8 | 5 | 5 frames; 14 mismatches |
| OFF | 16,48 / 9,48 / 13,87 ms | 13,28 ms | **26,64 %** | 47 | **0** | 44 | 0 frames; 0 mismatches |

El contador dinámico pasa: V1 OFF recibió cero proyecciones y continuó
recibiendo V2. La diferencia de tiempo (−50,10 %) es descriptiva, **no
publicable como efecto causal**, porque ambas series superan el gate de ruido.
ON reproduce 14 divergencias live en `speedKph`, `rows[].currentLapText` y
`rows[].lastLapText`; son los mismos campos ya observados por #893. No tienen
autoridad visual, pero la paridad no es cero y por tanto sigue bloqueando el
corte 2.

## Repeticiones de 180 s

| Estado | Run | Go CPU | Go RAM | Renderer CPU | Renderer RAM | Browser CPU | Browser RAM | Frames perdidos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ON | 1 | 2,411 % | 73,58 MiB | 2,450 % | 161,33 MiB | 0,956 % | 47,09 MiB | 0 / 9.586 |
| ON | 2 | 2,439 % | 72,59 MiB | 2,461 % | 150,51 MiB | 0,944 % | 46,66 MiB | 0 / 10.250 |
| ON | 3 | 2,411 % | 72,83 MiB | 2,500 % | 158,80 MiB | 0,972 % | 46,89 MiB | 0 / 12.320 |
| OFF | 1 | 1,667 % | 72,03 MiB | 1,483 % | 112,01 MiB | 0,972 % | 46,91 MiB | 0 / 9.684 |
| OFF | 2 | 1,611 % | 73,17 MiB | 1,528 % | 130,37 MiB | 0,989 % | 46,74 MiB | 0 / 13.145 |
| OFF | 3 | 1,694 % | 72,80 MiB | 1,506 % | 109,93 MiB | 1,011 % | 46,62 MiB | 0 / 11.888 |

## Artefactos y hashes

Los CSV crudos quedan en `results/isa-894/` localmente; los agregados y seis
diagnósticos CDP sanitizados se versionan en `ab-v1-off-runs/`.

| Artefacto | SHA-256 |
| --- | --- |
| `v1-on-1/a1-20260830-021541.csv` | `762792673D0C47CB9DBCFF5D624277A842E441DCF37495BE8CBCB324A41068A9` |
| `v1-on-2/a1-20260830-023225.csv` | `55ADA9D43E720CED40721A65FE6D306D7F83FBF7FD9B8E41B7B9E64D48A741F5` |
| `v1-on-3/a1-20260830-025304.csv` | `BD057E71B18DEC9313ABCCEFB198D2B53C2A44F30862EC7535E5BF28C7B31021` |
| `v1-off-1/a1-20260830-022420.csv` | `8D337FF4C497F687EB9D683EB34B0A9B3070B69C8D8FB274CE809CC7BCB4ABB0` |
| `v1-off-2/a1-20260830-024456.csv` | `B7A2884D29FE708A0A498A59922CFB0D5884A691C0898D43FC2024CABD861F4B` |
| `v1-off-3/a1-20260830-030115.csv` | `1108FCF29A12210005A2575BB656FBA8D134B7F575DA48FC133576CE42A75151` |
| `on.md` | `5553F21C78F4C65EB3D59F318DD9662AB6013C8CB9228710CD92E674985ABC67` |
| `off.md` | `FBA090814168040EC81427464AED472ACD27344BFAF36DDBC3C4C926F4B7D0A5` |
| `on-1-cdp.json` | `3216CE6EB6A6E254E1B01B68198FCC3476681C8ECE0C30BDE2DC2B0286EBEBBE` |
| `on-2-cdp.json` | `5EAD606C92852873DDBCFED9EA67D0EE316598693AEE92795B6C755A8268D322` |
| `on-3-cdp.json` | `A3B5CA20686DF2A1CA1C276F5FFF804F1079703EB4FBA5005C0B001D48D77844` |
| `off-1-cdp.json` | `571B9D50A607120840763B4B8BD68087A1131DAC974310D0F26EF27A5A792AB6` |
| `off-2-cdp.json` | `F129270D00983C7CF52EE1F45BA69CBA69E748FD846F530494272312EA340076` |
| `off-3-cdp.json` | `4585EDF866D28A3E7A48DA1E95B4F29896E72ACA84A5D506A5FDAFA7C21171E8` |

## Reproducción

```powershell
$env:VANTARE_OVERLAY_V1_EMIT = '1'
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion A1 -Exe bin/vantare-isa894.exe -Perfil testdata/bench/huella-endurance-3.json -Duracion 180 -Puerto 9294 -Salida results/isa-894/v1-on-1

Remove-Item Env:VANTARE_OVERLAY_V1_EMIT -ErrorAction SilentlyContinue
pwsh -NoProfile -File scripts/bench/huella.ps1 -Condicion A1 -Exe bin/vantare-isa894.exe -Perfil testdata/bench/huella-endurance-3.json -Duracion 180 -Puerto 9294 -Salida results/isa-894/v1-off-1
```

Los agregados se regeneran con `node scripts/bench/huella-resumen.mjs` sobre
los tres CSV del mismo estado.
