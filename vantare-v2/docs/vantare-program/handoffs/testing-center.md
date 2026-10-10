# Handoff vivo — Testing Center

## #1536 · ronda 3 integrada localmente (2026-10-10)

Cuatro merges --no-ff en orden #1556/#1554/#1555/#1553 sobre a410cb46, sin conflictos; 4/4 checks por cola PASS. Código integrado 42a14e166e3eb30f87365693f6145de19fac6d65; árbol native 3cba75c6574625a7435bd8906261a8b2aaa44f80. Gates finales por cola: fmt y Clippy -D warnings PASS; Nextest 1526/1526 (7 skips heredados del perfil), lifecycle 18/18 y telemetría 25/25 (0 skips). Engineer recovery/status_process pasa sin fallos ni reintentos. 22 archivos nativos idénticos a las ramas aceptadas, 17 tests nuevos conservados; corpus/goldens y archivos excluidos #1531 intactos.

#1556: expectativas de voz según plataforma, guardia Windows en paths, viento half-up y aviso de scan truncado; la integración conserva los 17 tests nuevos de R3.

Rama vantareapp/isa-1536-arreglos-revision; tracker #1536 abierto en Vantare/In Progress, cuatro issues R3 abiertas en Vantare/In Review. Evidencia C:/tmp/review-full/r3-*.log, merges-r3.tsv y tests-preservados-r3.json; buzón C:/tmp/buzon/integracion-r2.md. Siguiente: esperar la revisión de #1531 antes de integrarlo; gates e integración R3 cerrados localmente. Sin delegación, push, PR, nightly ni release; #1550 intacto, pantalla-ocupada respetada. Windows es la plataforma ejecutada; sin QA visual, sesiones físicas ni CI remoto. Las entradas siguientes conservan el historial anterior.

> **Seguimiento vigente (#1503): GitHub Issues de este repositorio y GitHub
> Project Vantare.** Leer la issue y actualizarla junto con el handoff tras
> cada cambio material; registrar PR, checks, SHA y canal real. Los enlaces y
> estados de trackers anteriores son evidencia histórica, no instrucciones.


Última actualización: 2026-10-08, UI R10 ronda 5 implementada en rama local; gates aprobados, capturas inspeccionadas y revisión de Isaac pendiente. La integración ISA-728 se conserva como evidencia histórica.

## Autoridad y alcance

Testing Center mantiene su proyecto separado de los módulos de producto.
GitHub Issues contiene el estado operativo; `../execution-policy.md`,
`../../branch-channels.md` y `../../../AGENTS.md` fijan las autorizaciones.
ISA-318 y ISA-322 corresponden a las issues migradas [#607](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/607)
y [#611](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/611).

## ISA-728 — validación del workflow inerte

- Base: `nightly` en `a9b8dd3695c66856e931d73650d54c4f6cb9e828`.
- Rama: `vantareapp/isa-728-inert-workflow-validation`.
- Código corregido: `5798d5eb4d7752d79c1708480266b6689b415ff2`.
- Worktree: `C:/tmp/vantare-isa728`; Muse usa otro worktree para verificar.
- Estado: integrada en `nightly` mediante la PR [#1108](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1108).
  SHA de integración de código: `a2958ea1c26e4e74dbaad3827382c36cb8d7de37`.
- Corrección, regresión y revisión independiente aprobadas. SHA publicado,
  PR y resultados remotos se registran en
  [#728](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/728).
- Sin promoción a Testers o Master ni release. Este corte es independiente del
  candidato de widgets #1098 / PR #1107.

GitHub rechazaba el workflow antes de crear trabajos. La [anotación del run](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34500227769)
identifica `runner.temp` en las líneas 156 y 219: ese contexto no está
disponible en `jobs.<job_id>.env`, incluso si el trabajo está desactivado.
Las dos declaraciones de `MANIFEST_PATH` pasan al entorno de los cinco pasos
que consumen el manifiesto, conservando su ruta bajo la carpeta temporal del
ejecutor. La [tabla de contextos de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
admite `runner` en `steps.env`.

## Evidencia y límites

- Muse confirmó el fallo estructural y que el contrato anterior pasaba sus
  14 pruebas sin detectarlo. Logs locales en su `.task/isa-728-evidence/`.
- La nueva regresión falla con el workflow original; el candidato pasa las
  15 pruebas Deno, formato y `git diff --check`.
- Muse revisó `5798d5eb`: APROBADO, sin hallazgos P0, P1 o P2, y confirmó las
  15 pruebas. Codex revisa los cambios documentales posteriores; el código
  permanece idéntico al SHA revisado.
- Comprobación local con PyYAML ya instalado: YAML válido y los cinco
  consumidores conservan la misma variable en el entorno de su paso. Esto no
  sustituye al validador remoto de GitHub Actions.
- Evidencia local de implementación en `vantare-v2/.task/isa-728-evidence/`.
- No hay cambios de Go, frontend o contratos de telemetría; no se repiten sus
  suites locales para este arreglo. Los gates oficiales se verifican en la PR.

## Decisiones y siguiente acción

Se conservan los dos disparadores, la fixture manual `small-frontend-bug`,
permisos de lectura, acciones fijadas por SHA y todos los trabajos productivos
desactivados. No se configura ningún proveedor, secreto, ruleset ni auto-merge.

La integración de Nightly quedó registrada con el merge de la PR #1108 y el
SHA `a2958ea1`. El resultado del CI postmerge y la punta vigente se cierran en
la issue de integración [#1109](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1109).
La siguiente promoción a Testers requiere feedback Pro Plus y la aprobación
reservada a Isaac.
No reenviar eventos
`repository_dispatch` ni activar correcciones automáticas.
## Beta nativa #1456 — Admin compatible con native-admin (2026-10-05)

Rama aislada `vantareapp/isa-1453-posthog-admin`, base `a464e9fc`.
Cliente adaptado al servidor versionado en `supabase/functions/native-admin`
y `20261003201000_native_admin.sql`: capacidades `vantare.module.*`, contactos
nullable, búsqueda no vacía, `next_cursor`, texto de payload y objetos de URLs
firmadas. Sin `VANTARE_ADMIN_URL`, deriva la ruta exacta del origen Supabase.
La búsqueda inicial pide introducir correo/nombre, sin enviar una query vacía.
El servidor devuelve módulos efectivos, no concesiones individuales: la UI
muestra ese acceso y permite Conceder/Revocar explícitamente; revocar no elimina
acceso por rol o rollout. Confirmación y relectura tras ACK se conservan.
No se cambia servidor ni se despliega. E2E owner pendiente: el orquestador
confirmó owner activo de Isaac (nota 15:04); Isaac inicia sesión en raíz aislada; no usar tokens de
native-beta. Escrituras solo cuenta propia y restaurando el estado, sin rollout
global. Guía y checklist en `C:/tmp/mac-evidence/`.
Gates completos Unix presentan fallos ajenos en UI; resultados propios y logs
se reportan sin declarar verde el workspace. No se crea PR ni se promociona.

Actualización #1456 (nota 15:24): instalación privada reproducible mediante native/admin/instalar-escritorio.ps1, en LOCALAPPDATA/Vantare Admin; accesos Escritorio/Inicio con icono y lanzador sin consola, sesión aislada y reinstalación conservando datos. Instalación 2x y arranque desde el acceso verificados. Binario Windows perfil prueba con config real OK; capturas físicas demo limpias de las tres pantallas revisadas (1280x800, DPI96), beta sin cambios. Mac: fmt y Clippy propios --no-deps OK; 69 tests propios y 10 lifecycle OK. E2E owner producción continúa pendiente del login de Isaac.

## Ronda 2 Admin #1456 — listado y respuesta local (2026-10-05)

La búsqueda real por nombre y correo de Isaac devuelve una cuenta owner. La
lista inicial vacía era el flujo de búsqueda obligatoria; Isaac pide listado
paginado al abrir. `search_accounts` con query vacía y cursor UUID lista solo
cuentas ya mapeadas al issuer, ordenadas por alta/UUID descendentes. La migración
20261005160000 precede al despliegue Edge. No se crean identidades objetivo.
El perfil actor validado se reutiliza en enriquecimiento; bloqueo, owner,
revocación OAuth, presupuesto y auditoría siguen comprobándose en cada petición.
Logs sanitizados separan las fases del servidor. No hay caché de autenticación.
Dos regresiones fallaron antes; después Deno Admin/authorize 70/70 y lint/fmt OK.
Tests pgTAP de páginas añadidos; NO ejecutados: sin PostgreSQL/Docker local.
Servidor 06c9f761 desplegado por el orquestador según nota 15:58. E2E con la
sesión aislada de Isaac: primera página devuelve una cuenta owner y cursor null;
nombre y correo encuentran esa cuenta. Solo hay una cuenta real: no se demostró
navegación entre dos páginas pobladas. Lectura de fases por MCP Supabase denegada;
falta extracto sanitizado del orquestador.

Cliente: tabla al abrir, filtro local inmediato, debounce remoto 300 ms, caché de
lecturas 30 s/64 entradas, precarga de módulos/reportes y refresco de fondo.
Actualizar, mutaciones, logout y denegación invalidan la caché. Respuestas tardías
tras perder autorización se descartan. No hay reintento automático de precarga
fallida. Worker bloquea en reposo y GPUI solo sondea respuestas pendientes.
RUST_LOG escribe tiempos sanitizados fuera del hilo UI.

Capturas reales: C:/tmp/mac-evidence/ronda-2.png. Hasta construcción de render,
lecturas cacheadas finales: detalle5,68ms/módulos4,90ms/reportes4,74ms/lista6,23ms.
Consultas remotas aún ~0,74–1,8s: <300ms no se cumple en carga fría. Hover p95
7,97ms/siguiente frame GPUI p95 9,71ms: no son DWM/GPU ni prueba de listas largas.
Workspace1094/1094 (4 skips de plataforma), lifecycle, fmt, check y Clippy PASS;
tras revisión final, Admin14/14 PASS y binario prueba con config real PASS.
CPU, instalación y límites: C:/tmp/mac-evidence/entrega-r2.md y
C:/tmp/fase2/informe-mac.md. No se atribuye mejora CPU sin comparación controlada.
Sin push, PR, integración o release. plan.md no existe en la base recibida.


## Hub beta #1470 — formulario y recibos de sesión (2026-10-05)

El formulario productivo GPUI usa acción como título y observado como texto;
conserva esperado/contexto porque el contrato v1 los exige. Tipo Algo falla /
Sugerencia se guarda como marcador explícito de contexto, sin nuevo schema.
Los recibos reales de envío/reintento aparecen en Mis informes, deduplicados
por ID, con el estado/fecha del servidor. Lista limitada a la sesión: no existe
consulta de historial ni conversación en el servicio nativo. Registros,
conversación e historial remoto quedan pendientes, sin datos inventados.
JPEG comprimido, vista previa, quitar y prepare/upload/finalize/attach mantienen
el protocolo anterior; no se toca backend, auth ni la política tester/owner.
Pruebas nuevas cubren cambio de tipo y deduplicación sin duplicar texto privado.
Evidencia y estado de gates: sección Fase 2 Testing Center del handoff vivo
`overlays-launcher-hub.md` y C:/tmp/1470-testing-evidence/.

## 2026-10-08 — UI R10, ronda 5 (#1496), entrega aislada

Encargo explícito: C:/tmp/ui-r10/brief-r5-testing.md y PLAN.md; usuario fija
GitHub y ejecución sin preguntas. Las referencias históricas a Notion no
sustituyen este encargo. Issue técnica #1496 sigue describiendo R0; ampliar su
cuerpo se deja al orquestador junto con las demás rondas, sin sobrescribirlo.

- Worktree C:/tmp/vw3-ui-r5-testing/vantare-v2; rama
  vantareapp/isa-1496-ui-r5-testing; base R3 a5a0108422b89c9ae113fe53761ee144f2bc820f.
- Hitos previos locales: 51a922ad (pestañas/Resumen), 63bd938d (Informes),
  fc27e1d1 (Cuestionarios/Comunidad). El cuarto hito contiene adaptación,
  regresiones, correcciones de gates y esta evidencia; SHA final en el informe.
- Cuatro pestañas en la barra superior, hero y secciones pendientes, redactor
  existente, lista de recibos con ID/estado/fecha y detalle accesible por teclado.
- Privacidad y envío sin cambios. El texto privado sigue fuera de la lista;
  submitted significa Recibido al enviar, sin inferir seguimiento remoto.
- Cuestionarios, niveles, insignias, votos, conversación, reconocimiento y alta
  pública son Próximamente. Se describen formatos/propuestas sin inventar datos.
- RailSection común y Adapt; secciones opcionales fuera de B/XS, scroll interior
  del editor/lista/herramientas. Redactor y lista alternan en Informes para
  conservar espacio; diferencia con el mockup pendiente de revisión de Isaac.
- Kit/tokens/dependencias/contratos/runtime intactos. Shell y demo solo cambian
  sus bloques Testing. Otros workers trabajan en ramas independientes.
- Evidencia: C:/tmp/ui-r10/r5-evidence/VERIFICACION.md e informe-r5.md.
  PASS fmt/check/Clippy, Nextest1260/1260 (6 skips heredados), lifecycle18.
  Build prueba configurado PASS. Logs de fallos/repeticiones y hash conservados.
- Pantalla compartida respetada: sin ventanas mientras existía el marcador;
  tanda final96 GPUI +96 mockup, seis matrices inspeccionadas y originales
  ampliados. Cada ventana se cerró. No se afirma paridad exacta ni QA física.
- plan.md falta tanto en la base como en origin/nightly consultado. No se crea
  otra fuente manual ni se publica contenido del roadmap.
- Pendiente: revisión de Isaac de las diferencias y preguntas del informe;
  validar interacción y envío real en entorno autorizado. Fuji23h falló en
  un intento y pasó al repetir el gate con dos casos simultáneos; evidencia
  conservada y hallazgo fuera de alcance registrado en #1458, sin tocar solver.
  Tests no demuestran login, envío remoto real, LMU/OBS, Mac, DPI físico ni fluidez.
- Sin push, PR, CI remota, merge, promoción ni release. No se toca la instalación
  personal ni se envían informes de prueba a servicios reales.

### #1496 — integración local R5 en calidad (2026-10-08)

Merge no-ff de b299be82 sobre calidad/e597a009 autorizado por Isaac.
Conservados Cuenta/Ajustes R4, kit único, rojo y contrastes semánticos vigentes.
Resueltos shell, cabecera Testing y fragmento acumulando R4/R5. Las nuevas
vistas reciben Adapt de su ventana; no se restaura el global retirado.
Gates y captura del conjunto pendientes; sin push/PR/promoción/release.

Verificación del conjunto calidad/70e15d11 (2026-10-08): fmt/check/Clippy
-D warnings PASS; Nextest1272/1272 (6 skips previos + microbenchmark ignorado),
lifecycle18/18 y builds prueba/QA PASS por la cola, target propio -j2.
QA conserva warning heredado analysis/view.rs:989. Capturas del conjunto en
curso; primer intento oculto falló por HWND no visible, repetido correctamente
por ruta nativa prevista. Logs/manifiesto: calidad-1-evidence/reanudacion.
Latencia de entrada sigue pendiente (PresentMon msSinceInput=0); no se
certifica fluidez, DPI físico, LMU live, OBS, login ni Mac. Solo local.

Cierre de la tanda de calidad (código70e15d11): 144/144 PNG en 1920×1080 y
1280×720, Vantare/DeepSeek, hashes y dimensiones comprobados. Doce hojas
y originales de casos principales inspeccionados; sin regresión de conflictos
observada en la muestra. Ventanas y helpers QA cerrados; mutex libre.
Tres aliases históricos Workshop/Telemetría/Licencias muestran Inicio/cargando
y no acreditan esos módulos; R0–R6 sí cubiertos. No paridad exacta ni latencia.
Informe≤15 líneas C:/tmp/ui-r10/informe-calidad-1.md; logs/diff/manifiestos/manual
en calidad-1-evidence/reanudacion/VERIFICACION.md. Instalación real intacta.
Siguiente: revisión del orquestador/Isaac; latencia de entrada pendiente.
Solo commits/merges locales autorizados y seguimiento GitHub; sin push/PR/
CI remota/promoción/release. No se afirma aceptación ≥9 ni publicación.
