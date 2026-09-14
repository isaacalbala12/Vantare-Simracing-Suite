# ISA-894 — R2 Desktop exclusivamente V2

Fecha: 2026-09-04. Rama `vantareapp/isa-894-retirada-v1-r2`, worktree
`C:\tmp\vantare-v1-retirada-r2\vantare-v2`, base exacta R1
`c3cb104aeba78bb5f962165283a49eb42e47798d`.

## Alcance

R2 migra un consumidor antes de borrar su dependencia: `CompositeApp` deja de
construir, arrancar y parar `createWailsProjectionTelemetryAdapter`, y deja de
crear/aceptar/reportar el shadow legacy. Desktop conserva pull Wails, store V2,
binding al coordinator, Engineer, Calendar, RaceSchedule, features V2 y cleanup.

No toca OBS, Studio, productor Go, SSE V1, flags, builders, tipos generados ni
tooling. Por tanto R2 no es retirada fisica total ni prueba que V1 haya salido
del binario. Tampoco es la auditoria V2 o una medicion de rendimiento.

## TDD RED -> GREEN

Antes de modificar produccion se anadio un test que monta Desktop, entrega por
el pull solamente status/proyeccion V1 y exige ausencia de widget/shadow V1.

Comando RED:

```text
pnpm test -- src/overlay/CompositeApp.test.tsx -t "R2 RED"
```

Resultado: 1 failed, 15 passed. Fallo conductual literal:

```text
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
at src/overlay/CompositeApp.test.tsx:204:42
```

El filtro era el nombre temporal del test RED; antes del GREEN se renombro a
`R2: un evento legacy V1 solo no alimenta Desktop...`. El fallo demuestra que
el evento V1 creaba el shadow una vez. No se presenta la fixture como prueba
Wails/LMU.

GREEN minimo:

- `CompositeApp.tsx` pierde 13 lineas legacy, sin sustituto ni fallback.
- Un evento V1 aislado no crea ni alimenta shadow y no pinta datos.
- Un snapshot V2 aislado sigue pintando `Driver 000`.
- El unmount cierra la sesion pull, retira diagnosticos y listeners de perfil.
- Dos tests V2 preexistentes dejaron de inyectar V1 como ruido.

Commits de codigo/test: `4fe69f12` y endurecimiento `992d1177`.

## Checks ejecutados

Orquestador, sobre el codigo de R2:

| Check | Resultado |
| --- | --- |
| Vitest `CompositeApp` + pull/store V2 + guardias retirement/authority | PASS, 5 archivos / 42 tests |
| `corepack pnpm --dir frontend typecheck` | PASS, exit 0 |
| `corepack pnpm --dir frontend build` | PASS, exit 0; aviso heredado de chunks >500 kB |
| `corepack pnpm --dir frontend lint` | PASS, exit 0 |
| Go focal `telemetrytransport` pull/R1 | PASS, exit 0 |
| `rg` ausencia legacy en `CompositeApp.tsx` y limites OBS/Studio intactos | PASS |
| `git diff --check` | PASS |
| Roadmap frontend | PASS, 3 archivos / 49 tests |
| Roadmap Python + digest reproducible | PASS, 23 tests; `--check` sin cambios |

No se ejecuto suite Go global porque R2 no cambia Go. No se abrieron apps, LMU,
navegadores ni se leyeron `.env*`. No hubo benchmark ni prueba fisica.

## Review y riesgos

Review independiente de especificacion Muse xhigh
`ses_f96873b0effe2VItOuu03U5Dgw` sobre `4fe69f12`: **APPROVE**, P0/P1 = 0.
Confirmo conjunto cerrado, tests no debilitados y lifecycle V2/auxiliar intacto.
Sus P3 de trazabilidad se resolvieron en `992d1177`: diagnostico exige ausencia
real de la clave `shadow` y pruebas V2 ya no inyectan eventos V1.

Review independiente de calidad/adversarial Muse xhigh
`ses_f9681a57bffeSnlDKCNUB0t4uR` sobre `20e5c0c3`: **APPROVE**, P0/P1/P2/P3
bloqueantes = 0. Confirmo lifecycle/StrictMode/pull/auxiliares, simpleza del
delta, tests no debilitados, roadmap reproducible y limites honestos.

Riesgos pendientes y honestos:

- OBS y Studio todavia construyen adapters legacy; la ruta SSE/productor V1 no
  se puede borrar hasta migrarlos y probarlos.
- El adapter/decoder/shadow V1 sigue empaquetado por esos consumidores.
- Las filas BLOCKED del inventario (historias input, dano, auxiliares) siguen
  sin autorizar borrado.
- CI remoto y prueba manual de Isaac son estados posteriores; ningun PASS se
  infiere de esta evidencia.

Publicacion aislada: [PR draft #972](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/972)
contra `nightly`, apilada sobre #969, #970 y #971. No hubo merge o promocion.

Rollback: cambiar a la build anterior privada verificada en R0; el ejecutable
nuevo no recupera V1 mediante un flag adicional.
