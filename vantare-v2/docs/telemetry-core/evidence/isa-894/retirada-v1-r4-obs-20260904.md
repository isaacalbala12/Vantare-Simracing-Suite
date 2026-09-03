# ISA-894 — R4 OBS exclusivamente V2

Fecha: 2026-09-04. Rama `vantareapp/isa-894-retirada-v1-r4`, worktree
`C:\tmp\vantare-v1-retirada-r4\vantare-v2`, base exacta R3
`f755a527a5380c86e1dde2e825b3615bc257fa21`.

## Alcance

R4 retira del runtime productivo OBS el adapter SSE Overlay Projection V1 y el
comparador shadow V1/V2. OBS conserva un único store/binding OverlayFrame V2,
su SSE canónico, el callback `invalid-frame`, Engineer, perfil, calendario,
Race Schedule, flags V2, diagnósticos y teardown compatible con StrictMode.

No se modifican el backend, las rutas SSE, el productor, los tipos, builders,
fixtures, Desktop, Studio ni los renderizadores. R4 no significa que V1 haya
salido todavía del binario y no inicia aún la auditoría ni el bucle de
rendimiento V2.

## TDD RED -> GREEN

Primero se modificó únicamente `ObsOverlayApp.test.tsx` para exigir dos
EventSources exactos —`/telemetry/overlay-v2/projection` y
`/engineer/stream`—, ausencia de `/telemetry/overlay/projection`, render de un
frame golden V2, diagnóstico sin `shadow` y cierre de ambos streams.

Comando RED:

```text
corepack pnpm --dir frontend test -- src/overlay/ObsOverlayApp.test.tsx
```

Resultado: 3 tests fallidos y 7 superados. Causas literales relevantes:

```text
expected [ …(3) ] to deeply equal [ …(2) ]
+ "/telemetry/overlay/projection"
expected true to be false
```

La producción R3 abría el tercer EventSource V1 e incluía la propiedad
diagnóstica `shadow`. El GREEN mínimo elimina sus imports, creación,
start/stop, callbacks y dispose. El mismo comando termina 10/10.

Commit de código, test y microplan:
`c2bc2142227c167c5f8712e42cf2d26f99b9d5a8`.

## Checks ejecutados

| Check | Resultado |
| --- | --- |
| Vitest focal OBS | PASS, 1 archivo / 10 tests |
| Vitest OBS + store/performance/ViewModels V2 | PASS, 4 archivos / 25 tests |
| `corepack pnpm --dir frontend typecheck` | PASS, exit 0 |
| `corepack pnpm --dir frontend build` | PASS, exit 0; aviso heredado de chunks >500 kB |
| ESLint de los dos archivos de comportamiento | PASS, exit 0 |
| `git diff --check` | PASS |
| `rg` de `createSseProjectionTelemetryAdapter`, `createOverlayV2ShadowActivation`, `/telemetry/overlay/projection`, `sessionSummary` y `acceptLegacy` en `ObsOverlayApp.tsx` | Cero coincidencias |

No se ejecutó suite Go porque R4 no cambia Go ni contratos compartidos. No se
abrieron apps, LMU o navegadores y no se leyeron `.env*`. No hubo benchmark ni
prueba física; la verificación manual final pertenece a Isaac.

## Review y riesgos

Review independiente de especificación Muse xhigh
`ses_f96617126ffeAzP2TFMF1g0Uqs` sobre `c2bc2142`: **APPROVE**,
P0/P1/P2/P3 bloqueantes = 0. Confirmó alcance cerrado, solución puramente
sustractiva, lifecycle V2/Engineer, StrictMode, teardown y RED atribuible a la
producción R3. Los P3 documentales se cierran en este follow-up.

Review independiente de calidad/adversarial Muse xhigh
`ses_f965c73b9ffexbDbAPyPAF3m76` sobre `0cac9bd5`: **APPROVE**,
P0/P1/P2/P3 bloqueantes = 0. Reprodujo 25/25 tests, typecheck, ESLint,
`diff --check`, frontera productiva y digest. Su única precisión documental
no bloqueante sobre el patrón `rg` queda aplicada en este follow-up.

Riesgos pendientes:

- el productor, la ruta SSE, el flag/configuración y el contrato V1 continúan
  en backend y en el binario;
- adapters, decoder, shadow, tipos, builders y fixtures legacy siguen
  empaquetados o referenciados hasta clasificarlos y retirarlos por dependencia;
- R4 no certifica rendimiento óptimo ni equivalencia física Wails/LMU.

El CI remoto y la publicación de la PR son estados posteriores a este
documento. Ninguna review autoriza merge o promoción.

Rollback: instalar la build anterior privada verificada en R0. No se añade un
flag V1 ni un fallback oculto al binario nuevo.
