# Plan maestro integral — Huella mínima de Vantare

Fecha: 2026-09-02. Aprobado por Isaac para iniciar: «perfecto, puedes iniciar».
Expediente documental actual: ISA-962; ejecución por las issues de cada corte.

## 1. Objetivo completo y prioridad

Este es el **maestro de todo el compromiso original**, no solo de Redline:
minimizar CPU, RAM y GPU de Hub, widgets y overlays; conservar calidad y
respuesta; ofrecer cinco niveles, Personalizado y Automático; demostrar el coste
con un banco reproducible; estudiar ahorro frente al HUD de LMU y composición.
«No notar pérdida» es la aspiración, no una garantía de impacto literalmente cero.

**Primero cerrar Endurance Redline.** Su
[subplan R0–R7](2026-09-02-redline-plan-maestro.md) es la primera fase ejecutable.
Las fases siguientes quedan planificadas aquí, con dependencias y salidas, no
olvidadas como «trabajo futuro». No se ejecutan simultáneamente con ese cierre.

Origen: [spec aprobada del 28 de agosto](2026-08-28-huella-minima-niveles-rendimiento-spec.md).
Este maestro actualiza su secuencia, estado y restricciones posteriores. Mantiene
sus decisiones no sustituidas y señala expresamente lo que aún necesita decisión.
No es un plan para rehacer el resto de productos de Vantare (Billing, Strategy,
Analysis, etc.); sí cubre el coste de la UI normal dentro del programa original.

El único estado vivo sigue en
[handoff Overlay/Launcher/Hub](../../vantare-program/handoffs/overlays-launcher-hub.md)
y GitHub Issues. Este documento define contratos y tareas; no duplica un diario.

## 2. Autoridad y límites comunes

- Isaac autoriza la planificación integral y prioriza Redline. Su autorización
  actual de merge se aplica al candidato Redline #969 una vez superados sus gates.
  No es permiso general para integrar todos los futuros cortes, publicar releases
  ni promocionar a testers/master. Cada nueva integración respeta AGENTS.md.
- Máximo cinco minutos por comprobación física, sin mínimo obligatorio. Un A/B
  con tres repeticiones puede contener varias comprobaciones de 180 s: se informa
  del conjunto antes de correrlo, sin convertirlo en un soak oculto.
- Sin completar/validar/comparar vueltas del jugador y sin Delta en las nuevas
  comprobaciones. No se elimina Delta ni se debilitan sus regresiones existentes.
- El diseño activo es **Endurance Redline**. #952 debe actualizar el alcance
  histórico Neo/Delta antes de implementar efectos; no extenderlo a todo Endurance.
- No reescribir a Qt/nativo, adoptar clusters, desactivar GPU en producción ni
  quitar V1 irreversiblemente por el mero hecho de estar mencionados en un plan.
- Sin secretos en prompts, logs o commits. Build licenciada mediante el proceso
  existente, sin copiar archivos de configuración privados entre workers.

## 3. Inventario de compromisos: hecho no significa validado en todo hardware

Fotografía 2026-09-02; las issues abiertas no demuestran ausencia de código.
Hay PRs integradas con issues todavía OPEN: reconciliarlas desde SHA y evidencia.

| Compromiso original | Entrega localizada | Qué falta para cerrarlo |
| --- | --- | --- |
| F0 / banco y baseline | #924; scripts y baseline 2026-08-29 | Baseline comparable actual, perfiles sin Delta, atribución fiable, matriz por hardware y evidencia publicable |
| D1–D8 / niveles y cadencias | #926 → #936; `internal/app/performance/policy.go` | Matriz efectiva por widget/perfil, monitor real en Máximo, eventos no degradados; no repetir implementación que ya pase |
| D3–D4 / perfil v4 y UI | #943 → #947 | Cierre de migración/persistencia/guardado concurrente y UX sobre versión final; completar solo huecos reproducidos |
| D7 / sensor y Automático | #944 → #948 | Coste incremental, indisponibilidad, foreground y recuperación; validar default real sin reabrir el rollout resuelto |
| D10–D14 / lifecycle y entry propia | #940 → #942 | Conservar evidencia de Hub destruido; validar borradores/reapertura/audio/EcoQoS/DPI en conjunto; fuentes woff2 pendientes de verificar |
| #896 → #893 → #894 / V2 | Lifecycle y autoridad integrados; #953/#955 V1 OFF reversible | Cierre Redline, memoria/paridad y decisión de retirada física; código legado no está eliminado |
| D9 / efectos | #952 OPEN; `Resolve` todavía fuerza `full` desde L3 | Diseñar Redline noBlur/flat, aplicar y medir; el enum reservado no es la feature |
| D18 / Coste e informe | Sensor existente; no se localizó entrega específica en código/issue consultados | Confirmar inventario antes de crear issue; entregar widget y resumen local sin otra fuente de medición |
| D15 / HUD swap | Especificado; no se localizó entrega específica | Perfil, ayuda reversible y A/B equivalente; no prometer ganancia si no supera gate |
| D16–D17 / composición y clusters | Spike Rust histórico entregado fuera del producto | A/B justo 1/3/7, decisión documentada; adoptar solo con mejora demostrada y ADR |
| RAM residual / #956 y #951 | Diagnóstico y objetivos abiertos | Atribuir primero, corregir causas probadas y medir; no inferir fuga de Private Bytes por sí solos |
| UI normal Hub | #800, #785 y #776 son expedientes relacionados | Inventariar entregas para evitar duplicados; optimizar solo cuellos medidos dentro de este objetivo |

No buscar «terminado» solo en un monitor. La evidencia local, CI, integración,
validación por hardware y publicación son estados diferentes.

## 4. Decisiones reconciliadas y cuestiones que NO deben inventar los workers

1. Nombres definitivos: Máximo, Alto, Equilibrado, Ahorro, Mínimo,
   Personalizado, Automático. No volver a diseñar nombres.
2. Automático es el default desde #948 (P14); las frases antiguas que lo dejan
   deshabilitado o fijan nivel 1 están superadas. Respetar elecciones explícitas.
3. D19 de emisión Wails dirigida fue descartada; v2 usa pull dirigido. No abrir
   de nuevo esa implementación desde la antigua lista T B.1–B.3.
4. #896/#893/#894 sí pertenecen al programa por decisión posterior, aunque el
   §11 antiguo diga lo contrario. Retirada física sigue bajo autorización propia.
5. P13 acepta ahorro RAM L3 ≥20 % frente al baseline contractual. La evidencia
   final #940 registra 405,34 MiB; el cuerpo histórico #951 aún cita 430 MiB.
   Son capturas distintas: no mezclar sus columnas ni ratios. Inventario debe
   enlazar cada cifra a su corrida; el ahorro CPU y frametime se prueban aparte.
6. Cinco minutos no prueban una pendiente sostenida pequeña. Se pueden cerrar
   causas concretas de retención con reproducción/retaining paths y regresión;
   si queda incierta la estabilidad prolongada, se declara. No se rebaja un gate
   de retirada V1 ni se extiende la sesión sin consultar a Isaac.
7. Hardware no disponible se marca NO MEDIDO. No emular iGPU/VR ni extrapolar
   ganancias. La matriz local no certifica todos los PC.
8. Variante `flat` conserva exterior transparente y legibilidad. No introducir
   placas negras para ahorrar. El orquestador prepara el diseño y lo presenta a
   Isaac; el worker implementa el diseño aceptado, no decide estética nueva.
9. La expresión «coste cero» del lifecycle significa apagar trabajo prescindible,
   no cero RAM/CPU de toda la app; un borrador pendiente debe impedir destrucción.

## 5. Fases, dependencias y definición de cierre

```text
A Redline → B inventario/banco/atribución
                       ├→ C recortes probados + lifecycle/Hub
                       ├→ D efectos Redline + controles
                       └→ E coste propio + informe
                    C + D → F matriz final niveles/Automático/seguridad
                        E + F → G HUD swap y comparación
                            B → H evaluación composición (después de F)
             A + B + F + paridad → I decisión de retirada V1
                  A–I resueltos → J informe de cierre del programa
```

«Resuelto» permite un NO-GO justificado para un experimento; no permite marcar
una funcionalidad comprometida como entregada si está pendiente. Un hardware
ausente o un gate no cumplido queda abierto, o requiere decisión explícita de
Isaac para reducir el alcance. No confundir entrega parcial con programa cerrado.

### A. Cierre Redline — activo primero

Ejecutar exclusivamente R0–R7 del subplan: CI → preflight → Standings → tres
Relative → Pedals → reconnect → reapertura → tráfico final → review/nightly.
No repetir aquí su lista ni convertirla en una matriz de rendimiento.

### B–E. Microcortes de atribución, reducción y funcionalidades restantes

Todos son encargos separados de 1–5 archivos de implementación; documentación
compartida y digest pertenecen al orquestador. Antes de despachar se fijan paths
exactos, SHA/base/worktree y issue. «Issue nueva» significa comprobar primero que
no exista, crearla antes de editar, con alcance y gate de esta fila.

| Corte / issue | Dependencia y trabajo | Área prevista | Aceptación y prueba |
| --- | --- | --- | --- |
| B0 / #924 + #962 documental | A; inventario final de PR/código/evidencia y reconciliar contratos | Handoff, spec, issues | Cada D1–D19/F0–F6 tiene owner, estado y enlace; huecos de entrega vs evidencia separados; review de trazabilidad |
| B1 / #924 | B0; congelar manifiesto del banco y perfiles Redline representativos (pocos/muchos widgets) | `scripts/bench/huella*`, `testdata/bench` | Mismo exe/escena/resolución/DPI; PID→rol confirmado; contadores ausentes no cero; regresión del agregador y smoke ≤5 min |
| B2 / #924 | B1; baseline actual A0/A1/HubVisible/HubMin | `docs/analysis`, resultados crudos locales | 180 s ×3 por condición válida, ruido ≤5 %; recursos y frametime separados; una tanda, si sigue ruidosa concluir INCONCLUSO sin bucle ilimitado |
| B3 / #956 | B1; atribuir memoria antes de corregir | `docs/analysis/webview2-renderer-memory-retention.md`, herramientas existentes | Distinguir warm-up/V8 usado-reservado/DOM/nativa/GPU; PID fiable, dos snapshots por target y retaining paths, control sin CDP; cada captura ≤5 min |
| B4 / #956 → issue de fix si procede | B3; dictamen causal | Diagnóstico y reproducción mínima | Retención de producto demostrada → un fix por causa con test RED; si banco contamina, corregir banco; incertidumbre explícita, no código especulativo |
| C1 / #951 | B2/B4; recorte renderer atribuible | Grafo entrada overlay o ruta retenedora concreta | Una palanca por PR, paridad Redline y A/B; objetivo de issue ≥40 MiB conjunto GPU+renderer, no sumas de corridas incompatibles |
| C2 / #951 | C1; recorte GPU/superficie si queda causa medible | Opciones/geometry Wails o tokens aprobados | Bounding box efectivo vs monitor; CPU/GPU/RAM y DPI, no transferir coste a CPU ocultándolo; descartar experimento si no gana |
| C3 / #940 | A+B1; validar lifecycle ya integrado, corregir solo regresión | `internal/app` lifecycle, tests | Hub limpio se destruye/reabre; sucio/OAuth/autosave se conservan; niveles 1–5 y cambio en caliente; pruebas deterministas y smoke ≤5 min por caso |
| C4 / #800 (relación #776) | B0/B2; medir arranque y navegación UI normal | `OrbitShell`, `RacesOrbitPage`, preferencias existentes | Identificar qué ya está entregado; corregir solo cuello reproducido; una tarea por lazy/prefetch, reloj o efectos; latencia/chunks/memoria antes-después, sin precargar todo si anula ahorro |
| C5 / issue acotada si pendiente D11 | B0; verificar fuentes y módulos que llegan al overlay | Assets/entry y tests de build | Si woff2/subset sigue pendiente, verificar licencia/tooling existente y caracteres de cuatro idiomas; no añadir herramienta sin aprobación; medir beneficio y descartar si no compensa |
| D0 / #952 | A+B0; contrato visual Redline full/noBlur/flat | Documento/tokens de diseño, no lógica | Comparación propuesta por orquestador, layout/texto/exterior alpha invariantes; aprobación visual antes de implementación; actualizar alcance Neo/Delta heredado |
| D1 / #952 | D0; tokens/consumo productivo | Tokens Endurance limitados a Redline + tests | Sin renderer duplicado; full actual intacto; noBlur y flat diferenciados y contenidos en Desktop/Studio/OBS; capturas productivas de cinco presentaciones |
| D2 / #952 + #943 | D1; habilitar efectos en política y Personalizado | `policy.go`, contrato/widget effects, UI existente | Dejar de forzar full solo donde hay variante; fallback honesto donde no; override por widget persiste sin pisar layout; Go/Vitest + integración |
| D3 / #952 + #924 | D2; medir full/noBlur/flat | Banco/evidencia | 180 s ×3 comparables, ahorro y regresiones por recurso; UI no promete ganancia si ruido la oculta; review independiente |
| E0 / issue nueva Coste | B1 + sensor existente; contrato de lectura y presentación | Documento/contrato sensor existente | Widget gratuito para todos, nivel y coste CPU/RAM/GPU disponibles, ausencia explícita; sin otra adquisición frontend; diseño aprobado |
| E1 / misma issue Coste | E0; renderer y consumo | Catálogo/WidgetVisualHost + TSX/test | Reutilizar snapshot Go, sin bucle de medición extra; disponible sin licencia de pago; cifra/unidad/frescura correctas; test de permisos y smoke |
| E2 / issue nueva informe local | E0/E1; resumen post-sesión del coste | Agregación Go/salida local y vista | Agregación acotada, no guardar todas las muestras sin límite; no depende de recording de telemetría activado; resumen sin datos inventados y sin subidas externas |
| E3 / Coste + informe | E1/E2 | Banco y regresiones | Medir coste del propio indicador/informe, demostrar cierre de suscripciones/estado al ocultar; no duplicar sensores ni mantener Hub vivo solo para medir |

B3 no debe arrancar todos los modos CDP a la vez: control no instrumentado y
atribución son corridas diferentes. Para medir producción se usa una build
production sin debugging y muestreo externo; su relación con la build diagnóstica
se identifica. No extrapolar MiB/h desde cinco minutos como prueba concluyente.

C3 incluye la validación ya comprometida de audio de Ingeniero intacto en 4–5,
ausencia de subtítulos/presentación en esos niveles y reversión de EcoQoS/prioridad
en 1–3. Si hay un defecto se despacha aparte del estado sucio del Hub. F3 también
contrasta el comportamiento real al perder foreground (ocultación y trabajo
visual/polling), sin asumir que pausar las decisiones del sensor apaga el overlay.
El experimento #785 de GPU desactivada se inventaría, no se adopta: sigue siendo
diagnóstico y no default productivo. Evitar repetirlo si su evidencia ya es NO-GO.

### F. Matriz de niveles, Personalizado, Automático y eventos

No reconstruir la policy que ya existe. Congelar la tabla efectiva de Go y
contrastarla con D1–D8/§6 original. Las frecuencias numéricas de aquel borrador
son candidatos a validar, no resultados medidos. Mostrar `sourceHz`: pintar a
144 Hz no convierte una fuente de 60 Hz en 144 muestras nuevas.

| Corte / issue | Dependencia | Salida verificable |
| --- | --- | --- |
| F1 / #926/#943 (seguimiento si cerrado) | C/D finalizados | Tabla widget→cadencia/rAF/efectos por nivel y overrides; monitor en Máximo, identidad de perfil, migración v3/v4/backup y elección explícita conservadas; tests existentes ampliados solo por huecos |
| F2 / #944 | F1 + B1 | Rango auto 2–5, arranque efectivo 3, bajada ≤2 s, subida 30 s e histéresis 60 s; diez minutos estables con reloj falso ≤2 cambios; sin prolongar prueba física más de cinco minutos |
| F3 / #944 | F2 | PresentMon disponible/ausente/permiso denegado/stale/cierre y foreground; no matar ETW de Radeon; coste incremental sensor medido y mensaje de nivel coherente sin spam; no audio nuevo por defecto |
| F4 / #924 + #940 | F1/F3 | Matriz local 1–5, auto y perfil custom representativo, pocos/muchos widgets, Hub visible/minimizado; 180 s ×3, muestreos comparables, efectos disponibles declarados |
| F5 / policy/eventos | F4 | Banderas/spotter/audio sin degradación entre niveles; regresiones de contrato + evidencia de eventos reales disponibles, incremento p99 ≤50 ms vs L1; datos ausentes NO MEDIDOS, no fallbacks inventados |
| F6 / #924 | F4/F5 | dGPU + iGPU; VR si disponible, si no limitación explícita según spec. Tabla por hardware/perfil, sin universalizar resultados; cierre de cada gate o bloqueo con causa |

Presupuestos originales conservados: L3 CPU total de Vantare ≥25 % mejor y RAM
privada ≥20 % mejor que la referencia contractual, sin empeorar frametime; L5
≤0,5 cores y ≤250 MB privados. Registrar bytes base y unidades (MB decimal no es
MiB), porcentaje máquina vs core y referencia exacta. No sustituir baseline
histórico por uno nuevo desfavorable para aparentar cumplimiento: publicar ambos
si cambia build/perfil/escena. El ahorro RAM aceptado no prueba por sí solo CPU.

Si un presupuesto no se cumple, emitir NO-GO cuantificado y proponer un único
microcorte causal o una decisión explícita de presupuesto. No encadenar mejoras
indefinidas ni rebajar metas sin Isaac.

### G. Sustituir HUD LMU y demostrar o descartar ganancia

- **G0 / issue HUD, tras F:** elegir información equivalente y perfil Redline
  que sustituya realmente al HUD. No declarar paridad completa si falta una
  función excluida (Delta); la comparación se limita al subconjunto equivalente.
- **G1 / misma issue:** perfil + asistente con instrucciones y restauración del
  estado previo. Preferir cambios soportados y reversibles; no editar instalación,
  memoria del juego, anticheat ni HUD mediante técnicas no autorizadas.
- **G2 / banco:** comparar sin Vantare/HUD elegido vs Vantare/HUD elegido apagado,
  misma escena y carga. Gate original: p99 con Vantare ≤p99 HUD nativo en ≥2/3
  repeticiones y ≥2 escenarios hardware; cada corrida 180 s, máximo cinco min.
  Si no gana, documentar resultado: no se considera ahorro demostrado.
- **G3 / Coste/informe:** comparación opcional solo con referencia válida del
  hardware, perfil, resolución y build; invalidar al cambiar condiciones. Mostrar
  coste propio si falta referencia. No presentar el A/B histórico como ahorro
  instantáneo medido en cada frame. Publicación comercial exige autorización aparte.

### H. Evaluación de composición — experimento, no migración obligatoria

- **H0 / #951 o issue experimental dedicada, después de F:** comprobar estado
  del spike Rust existente, contratos/builds y mantenibilidad. No rehacerlo sin motivo.
- **H1:** A/B Wails vs composición con **un controller y mismo documento**;
  misma escala DPI/rasterización, flags, perfil, telemetría y resolución. Árbol
  completo de procesos y coste del host incluidos; no comparar solo el proceso Rust.
- **H2:** solo si H1 da señal útil, probar 1/3/7 controllers con la misma carga
  total, no siete copias completas. Compartir entorno no garantiza menos RAM;
  registrar memoria, CPU, GPU, latencia y aislamiento de fallos.
- **H3:** decisión GO/NO-GO con gate D16 (mejora al menos 2/3 escenarios) y D17
  (clusters solo si 3 gana con margen medible en iGPU). Sin hardware no hay GO.
  NO-GO cierra el experimento; GO abre ADR y plan de integración separados,
  incluyendo lenguaje/FFI, input, DPI, transparencia, ciclo de vida y rollback.

No se promete un porcentaje de mejora por ser una arquitectura «mejor». No
introducir Rust/C++ en producto hasta esa decisión explícita.

### I. Cierre de la transición V1/V2

- **I0 / #894:** después de A, atribución B4 y gates relevantes de F, actualizar
  inventario estático/dinámico de consumidores productivos y paridad semántica.
  V1 OFF con rollback ya está entregado; no repetir ese cambio ni quitarlo antes.
- **I1:** completar evidencia que falte del protocolo de retirada, identificando
  qué parte se reutiliza legítimamente de Redline y qué no. S2 es el último gate
  físico. Límite cinco minutos; si memoria sostenida no queda demostrada con
  evidencia válida disponible, declarar bloqueo de Cut 2, no de Redline.
- **I2:** revisión adversarial y **autorización explícita de retirada física**.
  La autorización de nightly Redline no la sustituye.
- **I3, condicionado a I2:** microcortes separados para consumidores/adapters,
  tipos/historias y comparador; cada uno ≤5 archivos o partición adicional,
  tests/red de importaciones y guardarraíl contra reintroducción. No romper
  lectores históricos legítimos por confundirlos con consumidores live.
- **I4:** build, contratos, CI y evidencia focal tras retirada; plan de reversión
  por commits/PR, ADR/handoff/roadmap exactos. No afirmar «sin V1» antes del merge
  autorizado y la comprobación del canal.

### J. Entrega final del programa

Un informe único, breve, con enlaces: qué está integrado, qué funciona y dónde,
tabla antes/después por hardware/perfil, limitaciones, experimentos descartados,
pendientes bloqueados y pasos manuales. Conciliar #924/#940/#943/#944/#951/#952/
#956/#894 desde evidencia, sin cerrar por antigüedad ni solo por tener un PR merged.

El programa no se llama completo mientras falte una funcionalidad comprometida,
hardware requerido o gate sin resolver. Si Isaac acepta una entrega parcial,
registrar precisamente la reducción de alcance; no cambiar historia ni cifras.

## 6. Operación de los subagentes

- Cada worker recibe **un corte**, issue, base/SHA/worktree, archivos permitidos,
  reproducción, ≤3 criterios de aceptación, comandos, límites y reviewer.
  Prohibida delegación anidada, edición del checkout principal y merge por worker.
- Asignación actualizada por Isaac el 2026-09-03: únicamente Muse Spark 1.3
  Contributor, `opencode-go/muse-spark-1.3-contributor`, mediante MCP OpenCode
  con variante `xhigh`. No sustituir modelos si está indisponible. Reviewer
  independiente y lectura de diff/evidencia; no aprobar por el informe del autor.
- Paralelizar únicamente archivos/worktrees independientes: diseño D0, contrato
  E0 y revisión estática pueden avanzar mientras otro corte espera. Nunca dos
  operadores del PC ni builds pesados mientras se mide. Empezar con un worker y
  un reviewer por corte activo; más agentes solo si hay independencia real.
- Hallazgo con reproducción, impacto y ruta. Máximo dos intentos de preflight en
  cinco minutos; ante tres enfoques fallidos o alcance >5 archivos, parar y
  reformular. No reiniciar de cero una revisión por una edición documental.
- Reporte al usuario: corte activo, resultado verificable, bloqueo y siguiente
  corte. Sin narrar commits rutinarios ni ocultar que se está esperando permiso.

## 7. Comandos, pruebas y estructura

Aplican AGENTS.md y los comandos del subplan Redline §7. Fuentes principales:
`internal/app/performance/`, `frontend/src/telemetry-transport/`, renderer
`WidgetVisualHost`, `frontend/src/hub/`, `scripts/bench/`, evidencias en
`docs/analysis/` y `docs/telemetry-core/evidence/`. Renderer recibe ViewModels
puros; Go conserva la decisión; no introducir un framework de telemetría nuevo.

```powershell
# Desde vantare-v2, no desde la raíz Git superior:
git status --short
pnpm --dir frontend test
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend lint
# Si se modifica Go o contratos compartidos, después del build frontend:
go test ./...
git diff --check
python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly --check
```

Primero test de reproducción, después cambio mínimo, suite aplicable y review.
Instrumentación/fuentes solo con herramientas existentes; dependencias nuevas,
arquitectura, nuevas superficies de privacidad o gates contradictorios requieren
decisión antes de implementar. No falsear PASS, no secretos, no borrar datos.

## 8. Decisiones diferidas explícitas

No impiden cerrar Redline ni escribir este plan. Se consultan justo antes de
su corte: diseño exacto noBlur/flat y Coste; hardware iGPU/VR accesible; qué hacer
si el límite de cinco minutos no resuelve memoria sostenida; GO/NO-GO composición
y, solo si GO, lenguaje/integración; autorización Cut 2; promociones posteriores
y cualquier publicación de ventajas comerciales. Ningún worker decide por Isaac.

La aprobación escrita recibida activa primero A. B–J ya tienen ruta de
cierre y se despachan por dependencias, sin otra ronda de planificación desde
cero; los puntos de decisión anteriores se resuelven cuando corresponda.
