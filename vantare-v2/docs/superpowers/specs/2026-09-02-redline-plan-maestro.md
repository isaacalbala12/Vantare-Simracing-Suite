# Subplan A — cierre Endurance Redline

Fecha: 2026-09-02. Expediente: **ISA-962 / PR #969**.
Estado del documento: propuesta escrita para revisión de Isaac antes de activar microcortes.

Parte ejecutable A del [maestro integral de Huella mínima](2026-09-02-huella-minima-plan-maestro.md).
Este documento no agota el programa original: B–J se desglosan en el maestro.

## 1. Objetivo y autoridad

Cerrar el candidato Endurance Redline ya desarrollado: corregir el entorno CI,
demostrar que sus cinco presentaciones funcionan en el producto real y entregar
una integración verificable. No reiniciar el proyecto de rendimiento.

Isaac ha elegido «primero cerrar redline» y autorizado integrar este candidato
en `nightly` **cuando cumpla este cierre**. La autorización no permite saltarse
checks, publicar releases, promocionar a `testers`/`master`, cambiar rulesets ni
retirar irreversiblemente V1. Este plan desarrolla esa decisión, no una nueva
arquitectura. No activa trabajo hasta la revisión del documento.

Este documento gobierna alcance, dependencias y aceptación. El estado operativo
y la evidencia se mantienen en el único
[handoff vivo](../../vantare-program/handoffs/overlays-launcher-hub.md) y en
[ISA-962](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/962).
No crear otro handoff ni usar notificaciones antiguas como estado actual.

## 2. Punto de partida: no repetir lo entregado

- Candidato inspeccionado: `vantareapp/isa-962-redline-final-integration`,
  HEAD `9af9daa6d1a00afed390344710ad33479fba9108`, base
  `659b2c57dc2c7fc75962cc3c8e425ed1289266ec`. PR #969 draft, no integrado.
- Ya incluye geometría Standings, omisión de posiciones ganadas/perdidas en
  práctica/clasificación, autoridad Relative V2 y presentación sin FLIP/ghosts,
  contención Pedals, transparencia exterior y catálogo S3 cerrado.
- Evidencia registrada: frontend 441 archivos / 3421 tests PASS; typecheck,
  build y banco 22/22 PASS. Review estática sobre `1363de97`: APPROVE sin P0/P1.
  Son resultados previos identificados, no ejecuciones nuevas de este plan.
- CI remoto sobre `9af9daa6`: falla `Validate Vantare blocking gates`, run
  `33502297892`, por ausencia del ejecutable Chromium headless de Playwright.
  El workflow instala Chromium después de los tests que ya lo necesitan.
- La evidencia física del candidato final con jugador en pista sigue pendiente.
  Capturas anteriores en boxes/checkerboard no sustituyen esa prueba.
- Hub, niveles, perfiles y Automático ya tienen entregas integradas (#936,
  #941, #942, #947, #948); V1 apagado con rollback también (#953/#955).
  Su integración no demuestra que todo el objetivo de rendimiento esté cerrado.

## 3. Fronteras del programa

| Fase | Alcance | Activación |
| --- | --- | --- |
| A · Redline | Cinco presentaciones, CI y regresiones físicas acotadas | Única fase activa tras revisar este plan |
| B–H · Huella global | Banco, CPU/RAM/GPU, efectos, Coste, HUD y evaluación de composición | Después de A, según dependencias del maestro integral |
| I · Retirada V1 | Criterios completos del corte irreversible y rollback | Separada; exige evidencia y autorización específica |

Delta, otros diseños Endurance/Original/Crystal, nuevas variantes, reescrituras
Qt/Rust/nativas, clusters y benchmarks prolongados no pertenecen a A. Track Map
ya incluido en el candidato conserva sus regresiones automáticas, pero no amplía
el catálogo físico S3. No borrar ni alterar esos productos por estar excluidos.

El protocolo [ISA-894](../../telemetry-core/evidence/isa-894/plan-sesiones.md)
sigue reservado al cierre de V1. A reutiliza el orden **S3 → S4 → S5 → S2**,
pero S4/S5/S2 comprueban regresiones Redline con la configuración V2 por defecto:
no exigen una nueva matriz ON/OFF, paridad shadow o aprobación de memoria.
Sus resultados se etiquetan «cierre Redline», nunca «PASS corte 2».

## 4. Qué significa Redline cerrado

1. **Standings Redline:** columnas y filas completas, texto legible y exterior
   transparente; ancho físico efectivo coherente entre Studio/Desktop/OBS,
   sin salir de pantalla tras aplicar el mínimo. No mostrar ganadas/perdidas
   en práctica/clasificación. Probar anchos persistidos, no preensanchar el test.
2. **Relative Mirror, Proximity y Traffic:** jugador identificable, vecinos
   delante/detrás coherentes con V2; sin oscilación injustificada, superposición,
   ghost ni clipping. Cambiar vecinos cuando la fuente canónica lo requiere es
   correcto: no congelar datos para obtener un vídeo aparentemente estable.
3. **Pedals Redline:** marco, valores y wells contenidos; saturación sin halos
   exteriores ni recorte; exterior alpha. Un panel interior intencionado no es
   el fallo de placa negra exterior denunciado por Isaac.
4. CI obligatorio verde, revisión independiente sin bloqueantes y evidencia
   real completa para esas cinco presentaciones, incluidas reapertura/reconexión.

No se exige completar, validar ni comparar vueltas; Delta queda omitido. Se
utiliza LMU con jugador en pista. Una observación no producida se registra como
NO OBSERVADA, no PASS. Cada comprobación física dura **como máximo 5 minutos**;
puede acabar antes. No convertir una limitación del entorno en un soak de horas.

## 5. Microcortes y dependencias

Cada asignación congela issue, base, SHA y lista exacta de archivos antes de
editar. Tamaño objetivo: 1–5 archivos escritos. Una reparación que exceda ese
límite se divide; los cambios de documentación compartida los hace el orquestador.

| ID / responsable | Trabajo y dependencia | Archivos previstos / tamaño | Salida y verificación |
| --- | --- | --- | --- |
| R0 · orquestador | Publicar este contrato y conciliar issue/handoff. Sin dependencia | Plan, handoff, roadmap y nota en protocolo; digest generado | Revisión escrita de Isaac; cero implementación en este corte |
| R1 · worker CI + reviewer | Resolver Chromium ausente. Después de R0 | `.github/workflows/branch-channel-gates.yml`; hasta 2 archivos de regresión existentes si proceden | Instalar el navegador de la versión bloqueada antes de `vitest`; comprobar fallo de instalación no silenciado; CI obligatorio verde, sin skips/relajación ni nueva dependencia |
| R2 · orquestador | Congelar candidato y comprobar entorno. Después de R1 | Manifiesto/evidencia sanitizada, hasta 2 archivos | Misma máquina para control de pantalla, LMU/PID, Vantare/PID y telemetría; licencia válida, exe/dist/perfiles identificados; no abrir repetidamente builds sin licencia |
| R3a · operador único | S3 Standings. Después de R2 | Capturas/atestación, sin código | Geometría productiva, práctica sin ganadas/perdidas, exterior alpha y vista real en pista; máximo 5 min |
| R3b · mismo operador | S3 las tres Relative. Después de R3a | Capturas/vídeo breve/atestación, sin código | Cada variante contrastada con identidades/orden V2; máximo 5 min por variante, sin cambiar contrato para esconder saltos |
| R3c · mismo operador | S3 Pedals. Después de R3b | Capturas/atestación, sin código | Reposo y entrada real/saturación disponibles, contención y transparencia; máximo 5 min |
| R4 · mismo operador | S4 reconexión Redline. Después de todo S3 PASS | Evidencia, sin código | Pérdida y recuperación de fuente, estado honesto no-live y nuevo frame ≤30 s; sin filas obsoletas ni cambio de renderer; máximo 5 min |
| R5 · mismo operador | S5 reapertura Redline. Después de R4 | Evidencia, sin código | Desktop y Studio Live/OBS tardíos mantienen renderer y contenido; primer estado ≤5 s y completo ≤10 s; máximo 5 min por comprobación |
| R6 · mismo operador | S2 tráfico Redline, siempre último físico. Después de R5 y checks aplicables | Evidencia, sin código | Jugador en pista con tráfico real: identidad, vecinos y orden correctos, sin recortes/saltos; máximo 5 min, sin criterios de vuelta ni benchmark de memoria |
| R7 · reviewer independiente + orquestador | Cierre y promoción autorizada. Después de R6 | Handoff/roadmap/evidencia final, hasta 3 fuentes + digest | Revisar diff y prueba física exacta, CI final verde; integrar #969 en nightly sin bypass; verificar SHA remoto y no afirmar release |

**Checkpoint tras R1–R2:** no iniciar LMU hasta que build/licencia/entorno sean
válidos. Si control remoto y procesos locales no corresponden, parar la prueba:
la falta de respuesta a teclas no demuestra un problema de RawInput.

**Checkpoint tras R3:** están revisadas las cinco presentaciones, no solo
montadas. Conservar PNG alpha y checker por presentación (diez imágenes), más
prueba visible sobre LMU y vídeo breve para movimiento Relative. Un checker
prueba composición visual, no por sí solo transparencia de la ventana Wails.

**Si aparece un defecto:** abrir microcorte R-FIX bajo issue adecuada, con una
reproducción y un test RED antes del arreglo, máximo 1–5 archivos. Un worker
implementa y otro revisa. Repetir solo las pruebas afectadas por ese cambio y
sus dependencias; R6 se repite al final si cambió runtime después de ejecutarlo.
No mezclar dos defectos independientes ni encargar «revisa todo de nuevo».

## 6. Ejecución, evidencia y reglas para no repetir trabajo

- Un solo operador usa el PC/LMU. No ejecutar builds/tests pesados en paralelo
  a una captura física. Una revisión estática independiente sí puede avanzar.
- Terra fast para arreglos acotados, razonamiento medio por defecto; reviewer
  con razonamiento alto si el contrato lo requiere. Usar herramientas/modelos
  disponibles y declarar sustitución, no afirmar un modo fast inexistente.
- Un nivel de delegación, un escritor por worktree/rama; ningún worker crea
  otros workers. El orquestador inspecciona el diff y las pruebas, no solo el
  texto del informe. No reactivar agentes históricos ya terminados.
- Cada hallazgo contiene reproducción, archivo/línea, efecto y alcance. P0/P1
  y cualquier incumplimiento de §4 bloquean. Deuda ajena va a otra issue, sin
  convertirla en condición nueva para Redline ni ocultar errores de CI.
- Preflight físico: máximo dos intentos dentro de cinco minutos. Si no hay
  entorno válido, publicar el bloqueo preciso y conservar los demás avances.
  No reiniciar repetidamente LMU, Vantare o sesiones de autenticación a ciegas.
- Una build funcional nueva invalida evidencias de las rutas modificadas.
  Documentación sola no exige volver a conducir: conservar HEAD real de build,
  hashes y diferencia de fuentes; nunca atribuir un exe viejo al HEAD nuevo.
- Cada artefacto registra microcorte, SHA/base, SHA-256 exe/dist/perfiles,
  renderer efectivo, sesión/estado, timestamp, duración, resultado y limitación.
  No publicar secretos ni nombres/datos personales no necesarios.
- Una pantalla bloqueada, ausencia de tráfico o control no funcional produce
  BLOQUEADO/NO OBSERVADO, no una aprobación sintética. Un resultado de cinco
  minutos no demuestra ausencia de fuga de memoria sostenida ni ahorro global.

## 7. Estructura y comandos

Desde `vantare-v2` (directorio que contiene `frontend` y `go.mod`):

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend lint
git diff --check
```

Si cambia Go/contrato compartido, construir frontend antes de `go test ./...`;
aplicar `gofmt` a los Go modificados. No usar `tsc -p tsconfig.json` como gate.
El worker ejecuta primero la regresión focal y al cerrar los checks completos
aplicables. No repite toda la suite por cada cambio de prosa.

Roadmap desde el mismo directorio anidado:

```powershell
python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly
python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly --check
```

Renderer productivo: `frontend/src/overlay/design-systems/vantare-endurance/`;
frontera compartida: `frontend/src/overlay/core/WidgetVisualHost.tsx`.
Tests junto al código; catálogo `testdata/bench/s3-redline-catalog.json`;
materializador `scripts/bench/materialize-s3-redline-catalog.mjs`.
La build con licencia usa `scripts/bench/build-measurement.ps1` con el parámetro
`-EnvFile` autorizado: no inspeccionar/copiar valores ni versionar el generado.
Antes de usar los harness locales `run-family.ps1`/`attest-s3.ps1`, verificar sus
parámetros y procedencia; no inventar flags ni usar `sesion-v1.ps1` para S3.

Mantener TS estricto, ViewModels puros y pruebas de comportamiento observable;
sin renderer paralelo, estado de persistencia en vistas ni abstracciones nuevas.
Preservar el cambio ajeno `configs/calendar-lmu.json` fuera de todos los commits.

## 8. Contrato breve que recibe cada worker

El orquestador completa antes de enviar: ID R*, issue, objetivo único, rama/base/
SHA/worktree exactos, archivos permitidos, lecturas canónicas, reproducción,
tres criterios de aceptación como máximo, comandos, límites, evidencia esperada
y reviewer asignado. Si falta alguno, la tarea todavía no se despacha.

Entrega: qué cambió, test RED/GREEN o motivo de no edición, checks completos con
exit/resultados, diff, riesgos, commit/push/PR/CI reales y siguiente dependencia.
PROHIBIDO merge/release por el worker, leer secretos, modificar cambios ajenos,
ocultar tests fallidos o ampliar arquitectura. Nueva dependencia requiere a Isaac.
El orquestador incorpora evidencia y cambios de estado al handoff y a la issue.

## 9. Cierre y siguiente decisión

R7 solo se aprueba con todos los criterios Redline cumplidos y sin evidencia
pendiente disfrazada de PASS. Si una rama base avanza, revisar el delta de la
integración y ejecutar regresiones afectadas antes del merge. Verificar SHA
fusionado y checks del canal; si fallan, informar y corregir/revertir mediante
PR, nunca forzar ni afirmar publicación. `nightly` integrado no es release.

Después entregar un informe corto de Redline cerrado y activar la siguiente
dependencia del maestro integral aprobado. No marcar #956 ni la retirada
irreversible V1 cerradas por la integración de Redline. Los cortes posteriores
conservan sus gates y autorizaciones propias, sin reiniciar toda la planificación.
