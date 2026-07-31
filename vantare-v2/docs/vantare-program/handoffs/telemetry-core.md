# Handoff vivo — Telemetry Core

## Resultado

Un único núcleo live modular y neutral al simulador. El driver LMU posee Shared
Memory y REST local como fuentes complementarias. Overlay, Engineer, Strategy
y Analysis consumen proyecciones versionadas y nunca abren readers propios.

## Autoridad

- `docs/adr/0004-telemetry-core-modular-observation-architecture.md`.
- `docs/telemetry-core/README.md` y su evidencia.
- `docs/superpowers/plans/2026-07-19-telemetry-core-final-architecture-master.md`.
- Microplan activo y Linear.

## Estado real

- Proyecto Linear: `Telemetry Core — Modular Runtime & LMU`.
- Base apilada de ISA-129: ISA-105 / TC-07A, SHA
  `c9acee24cf4c4d80922b380b12f7367c2a60c937`.
- Rama activa:
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.
- Worktree activo: `C:\tmp\vantare-isa129\vantare-v2`.
- Promoción: ninguna; la cadena permanece en ramas de issue.
- TC-01–TC-03: cerrados.
- TC-04A–D y TC-05A–C: cerrados técnicamente en la cadena apilada.
- TC-06A–D: cerrados técnicamente; ISA-104 está `In Review`.
- TC-07A ISA-105: cerrado técnicamente en `c9acee2`; PR draft `#41`; Linear
  `In Review`; re-review D6 `ACCEPT`, P0/P1/P2/P3 = 0.
- TC-07A.1 ISA-129: `In Progress`; auditoría read-only de fuentes sintéticas
  cerrada; plan e implementación pendientes.
- TC-07B–TC-09: pendientes.

No existe wiring productivo del nuevo reducer/derivaciones. Gaps y delta
permanecen `missing` hasta tener inputs demostrados. La captura raw diagnóstica
de ISA-104 permanece desactivada y sin wiring productivo.

## Decisiones

- Preferencia por señal, no autoridad global entre Shared Memory y REST.
- Cero es legítimo; missing/stale/invalid no se inventan.
- Raw en memoria; persistencia solo con consentimiento.
- LMU usa sus archivos históricos y no duplica recording por defecto.
- Reducer single-writer sin I/O; derivaciones lineales/versionadas/acotadas.
- Replays raw, canónicos e históricos son niveles distintos.
- Mocks/simulator solo en harness explícito.

## Evidencia y riesgos

- ISA-104: catálogo metadata-only, inspector local, export sanitizado
  byte-exacto, Wails correlacionado, UI responsive y captura raw limitada sin
  wiring. Reviews backend/UI `ACCEPT`, P0/P1/P2/P3 = 0.
- Gates finales ISA-104: Go global serial, Telemetry, app, race focal, vet
  aplicable, 1.923 tests frontend, build frontend/Wails y Playwright
  wide/medium/compact en verde. Privacidad y seis capturas verificadas.
- **P3 heredado:** dos avisos `unsafe.Pointer` Win32 en vet LMU normal.
- **Deuda heredada fuera del corte:** lint global con 33 errores y dos warnings.
- **P2 operativo:** Nightly/Testers no existen; ISA-121 bloquea promoción.
- **P2 funcional conocido:** gaps/delta siguen missing hasta demostrar inputs.
- **P0 ISA-129 confirmado:** el bootstrap comercial inyecta
  `createMockSource()`, normaliza el buffer sintético como `Connected=true` y
  lo publica por Wails y SSE cuando LMU no está disponible.
- **P0 ISA-129 confirmado:** no existe adaptador productivo
  `lmu.Observation → core.Batch`; los replays crean batches manuales y no
  prueban el pipeline real.
- **P0 ISA-129 confirmado:** el driver modular publica solo al jugador; no
  existe `[]Vehicle` canónico ni identidad estable de parrilla.
- **P1 fuera de ISA-129:** Engineer arranca con `source="simulator"` y
  `connected=true`; debe resolverse en su corte antes del cutover Engineer.
- **Compatibilidad real pendiente:** LMU instalado es `1.4.0.0`; el driver
  canónico solo permite `1.3.0.0`. El mapping conserva tamaño 324820, pero no
  se permitirá 1.4 hasta demostrar invariantes y fixtures sanitizados.

## Issues

| Estado | Issues |
|---|---|
| Cerradas | ISA-23–37, incluyendo ISA-96/97/100 según Linear |
| Cerradas técnicamente | ISA-38–41 e ISA-101–103 en la cadena apilada |
| En revisión | ISA-104 / TC-06D, PR draft `#40` |
| En revisión | ISA-105 / TC-07A, `c9acee2`, PR draft `#41` |
| En progreso | ISA-129 / TC-07A.1 |
| Pendientes | ISA-106–117 e ISA-87 según dependencias |

## Siguiente acción exacta

Ejecutar ISA-129 / TC-07A.1 para
parrilla/timing/gaps/delta/sesión/unidades y retirar el fallback mock conectado
antes de ISA-106. Sin CSS, canvas, renderers, regeneración de baselines ni
cutover productivo.

Auditoría de fallback cerrada:

- Ruta afectada:
  `cmd/vantare → app.New → TelemetrySourceManager → createMockSource →
  BuildSyntheticBuffer → Normalizer Connected=true → Wails/SSE`.
- Sin LMU, Studio/Desktop/OBS reciben una sesión sintética con `Spa` y
  `TestDriver`, aunque el indicador superior diga Mock.
- Las excepciones válidas permanecen en preview Mock explícita, harnesses,
  fixtures, replays y CLIs de diagnóstico.
- ISA-129 debe invertir primero los tests del manager, retirar el fallback
  implícito de producción, impedir que `fusion.Merge(nil, ...)` conceda
  conexión y demostrar payload desconectado honesto por Wails y SSE.
- Después debe construir evidencia reproducible, observación multivehículo,
  bridge `Observation → Batch`, scoring/sesión/timing, gaps/delta con semántica
  explícita y proyección aditiva. No se aceptan campos por existir solo en
  código legacy.
- `InPit` no participa hoy en `withFreshness`; debe recibir la misma política
  stale que el resto del frame.
- VE, compuesto, daños y cualquier clima sin fuente demostrada permanecen
  `missing` y no bloquean la honestidad del contrato.
- El simulador productivo de Engineer queda documentado y excluido de este
  corte; no debe perderse antes del cutover Engineer.

## Gate final

TC-09 exige Core, recording, Overlay y Engineer simultáneos; soak automatizado
de dos horas; sesión LMU real; reconexión; frecuencia/drops/latencia; teardown;
y evidencia para Isaac.

## Última actualización

2026-07-31, ISA-129 iniciada sobre ISA-105 `c9acee2`. Las dos auditorías
read-only confirmaron el fallback sintético conectado de Overlay, ausencia del
bridge productivo `Observation → Batch` y driver modular limitado al jugador.
También aislaron el simulador productivo de Engineer como deuda de su propio
corte. Los fixtures reales sanitizados prueban 44 vehículos para LMU 1.3, pero
REST modular sigue siendo sintético. LMU instalado es 1.4.0.0; el driver solo
reconoce 1.3.0.0 y el allowlist no se ampliará sin prueba estructural. Worktree
limpio; sin código modificado, merge, promoción ni cutover.

Histórico ISA-105: D1–D5 aprobados y publicados en `f2a1ac3`. Cobertura real:
18/18, con un exacto, cinco parciales, once no comparables y un externo. La
evidencia sanitizada conserva 2 widgets, 31 campos, 19 iguales y 12 diferencias
explicadas; tres capturas y hashes verificados. Go telemetry/app, frontend
297/1.993, build y Playwright pasan. Visual Crystal falla al 100 % también en
la base exacta y el benchmark incumple umbrales en ambas ramas; no se tocaron
ni regeneraron baselines, canvas o renderers. Review D5 `APPROVE`,
P0/P1/P2/P3 = 0. D6 detectó cuatro P2 y un P3; todos quedaron corregidos:
cap separado 64+64, `pitStopCount` retirado, sourcePaths reales, identidad
`vehicles[].id` + `playerVehicleId`, handoff sincronizado y ADR válido.
Re-review final `ACCEPT`, P0/P1/P2/P3 = 0. Suite frontend final
297 archivos/2.000 tests y Playwright PASS. HEAD `c9acee2`, PR draft `#41`,
Linear `In Review`; ISA-129 es la siguiente dependencia.
